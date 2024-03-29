import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { client, SET_SCRIPT_CONTENT, fixPath } from './async_client';
import { c4dFs, getPythonFolder, getPythonExecutablePath } from './file_system';
import { GetAndStoreTemplateDir, C4D_BRING_IN_FRONT_CONFIG_ID, C4D_DEBUG_PORT_CONFIG_ID, C4D_DEBUG_IP_CONFIG_ID } from './settings';
import { errShowErrorMessage } from './errors';

import assert = require('assert');

var c4dOutputChannel: undefined | vscode.OutputChannel;

function delay(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
}

function stringContentIsEqual(stringA: string, stringB: string) {
    stringA = stringA.replace(/[\r]+/g, ``);
    stringB = stringA.replace(/[\r]+/g, ``);
    return stringA === stringB; 
}
  
export function setC4dScriptContentCmd(data: SET_SCRIPT_CONTENT)
{
    try
    {
        if (data.script_path.startsWith("c4dfs"))
        {
            let newPath: vscode.Uri = vscode.Uri.parse(data.script_path);
            let buffer: Buffer = Buffer.from(data.value);
            c4dFs.writeFile(newPath, buffer,
            { create: true, overwrite: true });

            vscode.workspace.openTextDocument(newPath).then(doc => 
                {
                    const stringBuffer = buffer.toString();
                    const stringInFile = doc.getText();
                    if (!stringContentIsEqual(stringInFile, stringBuffer))
                    {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            doc.uri,
                            new vscode.Range(0, 0, doc.lineCount, 0),
                            stringBuffer);
                
                        vscode.workspace.applyEdit(edit);
                    }

                    vscode.window.showTextDocument(doc);
                });
        }
        else if (data.script_path.startsWith("file:/"))
        {
            let newPath: vscode.Uri = vscode.Uri.file(data.script_path.slice("file:///".length));
            let buffer: Buffer = Buffer.from(data.value);

            vscode.workspace.openTextDocument(newPath).then(doc => 
                {
                    const stringBuffer = buffer.toString();
                    const stringInFile = doc.getText();
                    if (!stringContentIsEqual(stringInFile, stringBuffer))
                    {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            doc.uri,
                            new vscode.Range(0, 0, doc.lineCount, 0),
                            stringBuffer);
                
                        vscode.workspace.applyEdit(edit);
                    }
                    
                    vscode.window.showTextDocument(doc);
                });
        }
        else
        {
            vscode.window.showErrorMessage(`Unsuported file scheme: ${data.script_path}`);
        }
    }
    catch (err: any)
    {
        vscode.window.showErrorMessage(err.message);
    }
}

export function addToC4DConsoleCmd(data: string)
{
    try
    {
        if (c4dOutputChannel === undefined)
        {
            c4dOutputChannel = vscode.window.createOutputChannel("Cinema 4D");
        }
        if (c4dOutputChannel === undefined)
        { throw new Error("Failed to retrieve Cinema 4D Output channel"); }
        
        c4dOutputChannel.append(data);

        let bringInFront = vscode.workspace.getConfiguration().get<boolean>(C4D_BRING_IN_FRONT_CONFIG_ID);
        if (bringInFront)
            {c4dOutputChannel.show();}
    }
    catch (err: any)
    {
        vscode.window.showErrorMessage(err.message);
    }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export async function LoadScriptContentInScriptManager()
{   
    if (client === undefined)
    { 
        errShowErrorMessage("Client is not connect");
        throw new Error("Client is not created"); 
    }

    let doc: vscode.TextDocument = getActiveDocument(["file", "c4dfs", "untitled"]);

    client.loadInScriptManager(doc).catch(errShowErrorMessage);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export async function ExecuteScriptContentInScriptManager()
{
    if (client === undefined)
    { 
        errShowErrorMessage("Client is not connect");
        throw new Error("Client is not connect"); 
    }

    let doc: vscode.TextDocument = getActiveDocument(["file", "c4dfs", "untitled"]);

    client.executeInC4D(doc).catch(errShowErrorMessage);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export async function DebugScriptContentInScriptManager()
{
    if (client === undefined)
    { 
        errShowErrorMessage("Client is not connect");
        throw new Error("Client is not connect"); 
    }
 
    let doc: vscode.TextDocument = getActiveDocument(["file"]);
    
    let c4dPath = await client.getPath();
    if (c4dPath === undefined)
    { 
        errShowErrorMessage("Unable to retrieve Cinema 4D path");
        throw new Error("Unable to retrieve Cinema 4D path"); 
    }

    let pythonPath = getPythonExecutablePath(c4dPath);
    if (!fs.existsSync(pythonPath))
    { 
        errShowErrorMessage("Incorrect path for the c4d python executable, debugger will not work.");
        throw new Error("Incorrect path for the c4d python executable, debugger will not work."); 
    }
    
    let debugAdapterPath = path.posix.join(getPythonFolder(c4dPath), "debugpy", "adapter");
    if (!fs.existsSync(debugAdapterPath))
    {  
        errShowErrorMessage("Incorrect path for the debugpy, debugger will not work.");
        throw new Error("Incorrect path for the debugpy, debugger will not work.");
    }

    let debugIp = vscode.workspace.getConfiguration().get(C4D_DEBUG_IP_CONFIG_ID, "localhost");
    let debugPort = vscode.workspace.getConfiguration().get(C4D_DEBUG_PORT_CONFIG_ID, 5678);

    let configName = `Python attached to Cinema 4D - TCP: localhost:${debugPort}}`;
    let configuration = 
    {
        name: configName,
        request: "attach",
        type: 'python',
        localRoot: fixPath(path.dirname(doc.uri.fsPath)),
        remoteRoot: fixPath(path.dirname(doc.uri.fsPath)),
        justMyCode: true,
        debugAdapterPath : debugAdapterPath,
        pythonPath : pythonPath,
        connect: {host: debugIp, port: debugPort}
    };

    if (configName === undefined)
    {
        errShowErrorMessage("Failed to define debugger configuration.");
        throw new Error("Failed to define debugger configuration.");
    }

    // Debugger is already runing, just execute the script
    if (vscode.debug.activeDebugSession?.configuration.name === configName)
    {
        client.executeInC4D(doc, undefined, false).catch(errShowErrorMessage);
    }
    else
    {
        // Start the debugger server on Cinema 4D if needed
        // https://stackoverflow.com/a/67065084
        let startDebuggerIfNeeded = `import debugpy
import sys
if not (hasattr(sys, 'gettrace') and sys.gettrace() is not None):  
  debugpy.configure(python=r"${pythonPath}")
  debugpy.listen(("${debugIp}", ${debugPort}))
`;
        client.executeScriptInC4d(startDebuggerIfNeeded);

        // Finally start the debugg client session, but first wait 5 sec,
        // so the debugger have enough time to start on Cinenam 4D side
        await delay(3000);
        vscode.debug.startDebugging(undefined, configuration).then((res: boolean) =>
        {
            // And when it started, execute our script :D
            if (res)
            {
                client.executeInC4D(doc, undefined, false);
            }
            else
            { 
                errShowErrorMessage("Failed to start the debugger"); 
            }
        }, (reason:any) => 
        {
            errShowErrorMessage(reason);
        }).then(undefined, errShowErrorMessage);    
    }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export async function LoadTemplateScript()
{   
    let templatePath = GetAndStoreTemplateDir();
    let fileNames: FileItem[] = [];

    fs.readdirSync(templatePath).forEach(fileName => 
    {
        let file = path.posix.join(templatePath, fileName);
        if (fileName.endsWith(".py"))
        {
            fileNames.push(new FileItem(file));
        }
    });

    if (fileNames.length === 0)
    {
        errShowErrorMessage(`No python template found in ${templatePath}`);
        return;
    }

	const uri = await pickFile(fileNames);
	if (uri) 
    {
        const content = fs.readFileSync(uri.fsPath,'utf8');
        const doc = await vscode.workspace.openTextDocument({ content: content, language: "python" });
        vscode.window.showTextDocument(doc);
	}
}

class FileItem implements vscode.QuickPickItem {

	label: string;
    uri: vscode.Uri;
	
	constructor(public filePath: string) {
        this.uri = vscode.Uri.file(filePath);
		this.label = path.basename(filePath);
	}
}

async function pickFile(templateName: readonly FileItem[]) 
{
	const disposables: vscode.Disposable[] = [];
	try {
		return await new Promise<vscode.Uri | undefined>((resolve, reject) => {
			const input = vscode.window.createQuickPick<FileItem>();
            input.canSelectMany = false;
            input.items = templateName;

			input.placeholder = 'Type to search for files';
			disposables.push(
				input.onDidChangeSelection(items => {
					const item = items[0];
					if (item instanceof FileItem) {
						resolve(item.uri);
						input.hide();
					}
				}),
				input.onDidHide(() => {
					resolve(undefined);
					input.dispose();
				})
			);
			input.show();
		});
	} finally {
		disposables.forEach(d => d.dispose());
	}
}

function getActiveDocument(supportedScheme: string[] = ["file", "c4dfs", "untitled"])
{
    let doc: vscode.TextDocument | undefined;

    if (vscode.window.activeTextEditor !== undefined)
    { 
        for (const scheme of supportedScheme) 
        {
            if (vscode.window.activeTextEditor.document.uri.scheme === scheme)
            {
                doc = vscode.window.activeTextEditor.document;
                break;
            }
        }
    }

    // if vscode.window.activeTextEditor is not valid, find the first one (console act as text editor)
    if (doc === undefined)
    {
        for (const editor of vscode.window.visibleTextEditors)
        {
            for (const scheme of supportedScheme) 
            {
                if (editor.document.uri.scheme === scheme)
                {
                    doc = editor.document;
                    break;
                }
            }
        } 
    }

    if (doc === undefined)
    { throw new Error(`Unable to find a documentation compatible with one of the next schemes: ${supportedScheme}`);}

    return doc;
}