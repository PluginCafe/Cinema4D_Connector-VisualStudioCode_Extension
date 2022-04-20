import * as vscode from 'vscode';

const CANCEL = 'CANCEL';

function isPromise(promise: any) {  
    return !!promise && typeof promise.then === 'function';
}


export function errShowErrorMessage(err: Error | string)
{
    if (typeof err === "string")
    { vscode.window.showErrorMessage(err); }
    else 
    {
        if (err.message !== CANCEL)
        {
            vscode.window.showErrorMessage(err.message);
        }
    }

}

// if the Promise or Function throw an exception, it is raised as an user Error Message
export function errorHandler(func: (...args: any[]) => Promise<void> | any) 
{
    if (isPromise(func))
    {
        return async (...args: any) => 
        {
            try 
            {
                await func(...args);
            }
            catch (err: any)
            {
                if (err.message !== CANCEL)
                {
                    vscode.window.showErrorMessage(err.message);
                }
            }
        };
    }
    else
    {
        return (...args: any) => 
        {
            try 
            {
                return func(...args);
            }
            catch (err: any)
            {
                if (err.message !== CANCEL)
                {
                    vscode.window.showErrorMessage(err.message);
                }
            }
        };
    }
}
