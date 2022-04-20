import * as vscode from 'vscode';
import * as http from 'http';
import { client } from './async_client';
import { errorHandler, errShowErrorMessage } from './errors';


let myStatusBarItem: vscode.StatusBarItem;
let currentState = false;

export function setupStatusBarClientListener()
{
    client.on("open",
        (data: Buffer) => 
        {
            enableStatusBar();
        });

    client.on("close", 
        (code: Number, reason: Buffer) => 
        {
            disableStatusBar();
        });
    
    client.on("error", 
        (error: Error) => {
            client?.stop();
            disableStatusBar();
        });

    client.on("unexpected-response", 
        (request: http.ClientRequest, response: http.IncomingMessage) => {
            client?.stop();
            errShowErrorMessage("Unexpected Response from Cinema 4D. Cannot connect to Cinema 4D");
            disableStatusBar();
        });
}

export function registerStatusBar(context: vscode.ExtensionContext)
{
    vscode.commands.executeCommand('setContext', 'cinema4d-connector.is_connected_to_c4d', false);
    
    // Toggle on selected
	const myCommandId = 'cinema4d-connector.statubar_toogle';
	context.subscriptions.push(vscode.commands.registerCommand(myCommandId, () => 
        {
            // If activate we need to stop the client
            if (currentState)
            {
                if (client)
                {
                    client.stop();
                }
                else
                {
                    disableStatusBar();
                }
                return;
            }
            // We need to activate
            else
            {
                client.start().catch(errShowErrorMessage);
                setupStatusBarClientListener();
            }
        }));

    // create a new status bar item that we can now manage
	myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
	myStatusBarItem.command = myCommandId;
	context.subscriptions.push(myStatusBarItem);

    enableStatusBar();
    myStatusBarItem.show();
    setupStatusBarClientListener();
}

export function enableStatusBar(): void
{
    if (currentState || !client)
    {   
        disableStatusBar();
        return;
    }
    
    if (!client.isConnected)
    {   
        disableStatusBar();
        return;
    }

    currentState = true;
    myStatusBarItem.text = "C4D ✓"; // unicode of the symbol === 2713
    myStatusBarItem.tooltip = `Connected to: ${client.connString}`;
    myStatusBarItem.backgroundColor = undefined;
    vscode.commands.executeCommand('setContext', 'cinema4d-connector.is_connected_to_c4d', true);
    return;
}

export function disableStatusBar(): void
{
    currentState = false;
    myStatusBarItem.text = "C4D X";
    myStatusBarItem.tooltip = "Not connected to any Cinema 4D instance";
    myStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    vscode.commands.executeCommand('setContext', 'cinema4d-connector.is_connected_to_c4d', false);
}
