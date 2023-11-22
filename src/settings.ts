import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { errorHandler, errShowErrorMessage as showErrorMessage} from './errors';
import { client } from "./async_client";
import { setupStatusBarClientListener } from "./statusbar";
import { getPythonFolder } from './file_system';
import { DebugScriptContentInScriptManager } from './commands';
import assert = require('assert');

export const C4D_PATH_CONFIG_ID     = "c4d.path";
export const C4D_SHOULD_UPDATE_PATH_CONFIG_ID     = "c4d.updatePath";
export const C4D_IP_CONFIG_ID       = "c4d.IP";
export const C4D_PORT_CONFIG_ID     = "c4d.port";
export const C4D_TEMPLATE_CONFIG_ID = "c4d.template";
export const C4D_BRING_IN_FRONT_CONFIG_ID = "c4d.bringConsoleInFront";
export const C4D_DEBUG_IP_CONFIG_ID = "c4d.debuggerIP";
export const C4D_DEBUG_PORT_CONFIG_ID = "c4d.debuggerPort";
export const C4D_CALL_GET_PATH_ON_CONNECT_ID = 'c4d.call_get_path_on_connect';

const PYTHON_AUTOCOMPLETE_EXTRA_PATH_CONFIG_ID = "python.autoComplete.extraPaths";
const PYTHON_ANALYSIS_EXTRA_PATH_CONFIG_ID = "python.analysis.extraPaths";

export var globalState: vscode.Memento | undefined;

function addC4DEntry(configId: string, pathToAdd: string)
{
    var extraPath = vscode.workspace.getConfiguration().get(configId, [""]);
    var notFound = extraPath.findIndex(x => x === pathToAdd) === -1;
    if (notFound) 
    {
        extraPath.push(pathToAdd);
        vscode.workspace.getConfiguration().update(configId, extraPath, vscode.ConfigurationTarget.Global);
    }
}

function removeAllC4DEntryIfPresentExcept(configId: string, dontDeletePath: string)
{
    var extraPaths = vscode.workspace.getConfiguration().get(configId, [""]);
    for (let i = 0; i < extraPaths.length; i++) 
    {
        if (dontDeletePath.normalize() === extraPaths[i].normalize())
        {
            continue;
        }

        let c4dPath = path.join(extraPaths[i], "c4d");
        let c4dInitPath = path.join(extraPaths[i], "_c4d_init");

        if (fs.existsSync(c4dPath) && fs.existsSync(c4dInitPath))
        {
            extraPaths.splice(i, 1);
            break;
        }
    }
}

function setPythonExtraPath(inputPath?: string)
{
    // If path is not valid, is most likely the user is typing so not worth going further
    let c4dPath = inputPath ? inputPath : vscode.workspace.getConfiguration().get<string>(C4D_PATH_CONFIG_ID);
    if (!c4dPath || !fs.existsSync(c4dPath))
    { return; }

    let pathToAdd = path.join(getPythonFolder(c4dPath));
    if (!fs.existsSync(pathToAdd))
    {  throw new Error("Unable to Find Python path for c4d.path, autocompletion will not work"); }

    let pathToAddC4D = path.join(pathToAdd, "c4d");
    if (!fs.existsSync(pathToAddC4D))
    { throw new Error("Incorrect path for c4d.path, autocompletion will not work"); }

    // Remove if a c4d path already exist
    try
    {
        removeAllC4DEntryIfPresentExcept(PYTHON_AUTOCOMPLETE_EXTRA_PATH_CONFIG_ID, pathToAdd);
        removeAllC4DEntryIfPresentExcept(PYTHON_ANALYSIS_EXTRA_PATH_CONFIG_ID, pathToAdd);
    }
    catch (err)
    { throw new Error("Failed to remove C4D Entry in python.autoComplete.extraPaths or python.analysis.extraPaths"); }

    try
    {
        // Add to extraPath if not already here
        addC4DEntry(PYTHON_AUTOCOMPLETE_EXTRA_PATH_CONFIG_ID, pathToAdd);
        addC4DEntry(PYTHON_ANALYSIS_EXTRA_PATH_CONFIG_ID, pathToAdd);
    }
    catch (err)
    { throw new Error("Failed to add C4D Entry in python.autoComplete.extraPaths or python.analysis.extraPaths. Autocompletion will not work."); }
}

export function onConfigChange(e: vscode.ConfigurationChangeEvent)
{
    if (e.affectsConfiguration(C4D_PATH_CONFIG_ID))
    {
        errorHandler(setPythonExtraPath)();
    }
    if (e.affectsConfiguration(C4D_SHOULD_UPDATE_PATH_CONFIG_ID))
    {
        let shouldUpdateOnConnect = vscode.workspace.getConfiguration().get(C4D_SHOULD_UPDATE_PATH_CONFIG_ID, true);
        globalState?.update(C4D_CALL_GET_PATH_ON_CONNECT_ID, shouldUpdateOnConnect);
    }
    if (e.affectsConfiguration(C4D_IP_CONFIG_ID) || e.affectsConfiguration(C4D_PORT_CONFIG_ID))
    {
        client.stop().then((value) =>
        {
            client.start();
            setupStatusBarClientListener();
        }).then(undefined, showErrorMessage);
    }
    if (e.affectsConfiguration(C4D_DEBUG_IP_CONFIG_ID) || e.affectsConfiguration(C4D_DEBUG_PORT_CONFIG_ID))
    {
        if (vscode.debug.activeDebugSession?.configuration.name.startsWith("Python attached to Cinema 4D"))
        {
            vscode.debug.stopDebugging(vscode.debug.activeDebugSession).then(() => 
            {   
                DebugScriptContentInScriptManager();
            }
            );
        }
    }
}

export function checkAndAskCinema4DDir(context: vscode.ExtensionContext)
{
    // If this is the first time the user Install the extension
	// Ask the user to configure the Cinema 4D path
	const C4D_ASK_DEFINE_PATH_ID = 'c4d.path_defined';

    globalState = context.globalState;
	context.globalState.setKeysForSync([C4D_ASK_DEFINE_PATH_ID, C4D_CALL_GET_PATH_ON_CONNECT_ID]);

    let shouldUpdateOnConnect = vscode.workspace.getConfiguration().get(C4D_SHOULD_UPDATE_PATH_CONFIG_ID, true);
    context.globalState.update(C4D_CALL_GET_PATH_ON_CONNECT_ID, shouldUpdateOnConnect);

	let c4dPath = vscode.workspace.getConfiguration().get(C4D_PATH_CONFIG_ID, "");
	if (fs.existsSync(c4dPath)) {
        return;
    }

    // By default (aka when not stored) we want it to true
    let shouldAskPath = context.globalState.get(C4D_ASK_DEFINE_PATH_ID, true);
    if (!shouldAskPath) {   
        return;
    }

    vscode.window.showInformationMessage(
        "Define the Cinema 4D installation directory for autocompletion and debugger to function.\nIf not defined, it will be automatically set upon connection with Cinema 4D.",
        ...["Yes", "No"]).then((answer) =>
        {
            if (answer === "Yes")
            {
                vscode.window.showOpenDialog
                ({canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: "Cinema 4D Installation Path"
                }).then((selection) => 
                    {
                        if (selection && fs.existsSync(selection[0].fsPath))
                        {
                            setPythonExtraPath(selection[0].fsPath);
                            if (!shouldUpdateOnConnect)
                            {
                                context.globalState.update(C4D_CALL_GET_PATH_ON_CONNECT_ID, false);
                            }
                            context.globalState.update(C4D_ASK_DEFINE_PATH_ID, false);
                            return ;
                        }
                    });
            }
            else
            {
                context.globalState.update(C4D_ASK_DEFINE_PATH_ID, false);
            }
    });
}

export function setPypFileAsPython()
{
	let asso = vscode.workspace.getConfiguration("files").get<{ [filepattern: string]: string }>("associations") || {};
    if (asso["*.pyp"] === undefined)
    {
        asso["*.pyp"] = "python";
        vscode.workspace.getConfiguration("files").update("associations", asso, vscode.ConfigurationTarget.Global);
    }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function GetAndStoreTemplateDir()
{
    let templatePath = vscode.workspace.getConfiguration().get<string>(C4D_TEMPLATE_CONFIG_ID);
    if (!templatePath || !fs.existsSync(templatePath))
    { 
        let extension = vscode.extensions.getExtension("maxonc4dsdk.cinema4d-connector");
        assert(extension !== undefined);
    
        templatePath = path.posix.join(extension.extensionPath, "script_template");
        if (!templatePath || !fs.existsSync(templatePath))
        {
            throw new Error("Can't compute script template.");
        }

        vscode.workspace.getConfiguration().update(C4D_TEMPLATE_CONFIG_ID, templatePath, vscode.ConfigurationTarget.Global);

        return templatePath;
    }

    return templatePath;

    
}
