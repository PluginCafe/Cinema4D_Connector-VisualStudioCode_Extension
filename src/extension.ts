import * as vscode from 'vscode';
import { onConfigChange, checkAndAskCinema4DDir, setPypFileAsPython, GetAndStoreTemplateDir } from './settings';
import { errorHandler} from './errors';
import { client} from './async_client';
import { registerStatusBar } from './statusbar';
import { c4dFs, c4dScheme } from './file_system';
import {LoadScriptContentInScriptManager, 
		ExecuteScriptContentInScriptManager, 
    	DebugScriptContentInScriptManager, 
    	LoadTemplateScript, 
 		} from './commands';


export async function activate(context: vscode.ExtensionContext)
{
	// Register Commands
	let commands: [string, () => Promise<void>][] = 
	[
		['cinema4d-connector.load_template_script', 	LoadTemplateScript],
		['cinema4d-connector.load_in_script_manager', 	LoadScriptContentInScriptManager],
		['cinema4d-connector.debug_in_c4d', 	        DebugScriptContentInScriptManager],
		['cinema4d-connector.execute_in_c4d', 		    ExecuteScriptContentInScriptManager],
	];
	for (let [identifier, func] of commands) 
	{
        let command = vscode.commands.registerTextEditorCommand(identifier, errorHandler(func));
		context.subscriptions.push(command);
    }
	

	// Register C4D File system
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider(c4dScheme, c4dFs, { isCaseSensitive: true }));

	// If c4d.path is not defined, ask the user to do it
	errorHandler(checkAndAskCinema4DDir)(context);

	// If c4d.template is not defined, define it
	errorHandler(GetAndStoreTemplateDir)();

	// Add *.pyp extension file to Python
	errorHandler(setPypFileAsPython)();
	
	// Manage change of the c4d.path to properly update python.extraPath
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onConfigChange));

	// Status bar also start the client
	registerStatusBar(context);
}

// this method is called when your extension is deactivated
export function deactivate() 
{
	if (client)
	{
		client.stop();
	}    
}