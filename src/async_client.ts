/* eslint-disable @typescript-eslint/naming-convention */
import { WebSocket, CloseEvent, MessageEvent, Event }  from 'ws';
import * as vscode from 'vscode';
import * as events from 'events';
import * as os from 'os';
import { setC4dScriptContentCmd, addToC4DConsoleCmd } from './commands';
import { C4D_IP_CONFIG_ID, C4D_PORT_CONFIG_ID, globalState, C4D_CALL_GET_PATH_ON_CONNECT_ID, C4D_PATH_CONFIG_ID } from './settings';
import { errShowErrorMessage } from './errors';


const CODEEXCHANGE = {
    ACTION :        "action",
    VALUE :         "value",
    SCRIPT_PATH:    "script_path",

    IDE2C4D :
    {
		GET_WORKSPACE :             "idea2c4d.get_workspace",           // OK
		GET_SCRIPT_CONTENT :        "idea2c4d.get_script_content",      // OK
		SET_SCRIPT_CONTENT :        "idea2c4d.set_script_content",      // OK
		LOAD_IN_SCRIPT_MANAGER :    "idea2c4d.load_in_script_manager",  // OK
		EXECUTE_SCRIPT :            "idea2c4d.execute",                 // OK
		GET_PID :                   "idea2c4d.get_pid",                 // OK
		GET_PATH :                  "idea2c4d.get_path",                // OK
    },

    C4D2IDE :
    {
		SET_SCRIPT_CONTENT:     "c4d2ide.set_script_content",   // OK
        GET_PID :               "c4d2ide.get_pid",              // OK
        GET_PATH :              "c4d2ide.get_path",             // OK
        CONSOLE :               "c4d2ide.console",             // OK
    }
};


export interface SET_SCRIPT_CONTENT
{
    readonly action: string;
    readonly value: string; // code
    readonly script_path: string;
}

export interface GET_PID
{
    readonly action: string;
    readonly value: number; // pid
}

export interface GET_PATH
{
    readonly action: string;
    readonly value: string; // system path
}

export interface CONSOLE
{
    readonly action: string;
    readonly value: string; // system path
}

export class AsyncClient extends events.EventEmitter 
{
    private _client!: WebSocket;
    private _ip: string = "127.0.0.1";
    private _port: number = 7788;
    _closeEvent: CloseEvent | null = null;
    _receiveCallbacksQueue: Array<{ resolve: (data: any) => void, reject: (reason: any) => void }> = [];
    _receiveDataQueue: Array<any> = [];

    // Represents the numbers of message we wait for an answers
    // e.g. Sending CODEEXCHANGE.IDE2C4D.GET_PID to C4D, 
    // we expect to receive CODEEXCHANGE.C4D2IDE.GET_PID in the `max_try` next message
    private _max_try: number = 20; 

    constructor()
    {
        super();
    }

    get connString(): string
    {
        return `ws://${this._ip}:${this._port}`;
    }

    get isConnected(): boolean
    {
        return this._client !== undefined && this._client.readyState === WebSocket.OPEN;
    }

    get dataAvailable(): number {
        return this._receiveDataQueue.length;
    }

    private updateConfig()
    {
        this._ip = vscode.workspace.getConfiguration().get(C4D_IP_CONFIG_ID, "127.0.0.1");
        this._port = vscode.workspace.getConfiguration().get(C4D_PORT_CONFIG_ID, 7788);
    }

    async start()
    {
        if (this.isConnected)
        { throw new Error("Already connected."); }

        this.updateConfig();

        this._closeEvent = null;
        this._receiveCallbacksQueue = [];
        this._receiveDataQueue = [];
        
        this._client = new WebSocket(this.connString, "c4d_py_code_exchange");
        this.removeAllListeners();
        this.on('newListener', 
            (eventName: string | symbol, listener) =>
            {
                this._client.on(eventName, listener);
            }
        );

        this.on('removeListener', 
            (eventName: string | symbol, listener) =>
            {
                this._client.removeListener(eventName, listener);
            }
        );

        this.on("message", (data: string, isBinary: boolean) => this.setScriptContentInVsCode(data, isBinary));
        this.on("message", (data: string, isBinary: boolean) => this.setConsoleContentInVsCode(data, isBinary));

        return this._setupListenersOnConnect().catch((err: any) => 
        {
            let errorMsg = err.message;
            if (err.message.includes("ECONNREFUSED"))
            {
                errorMsg = "Failed to Connect to Cinema 4D";
                if (this._ip !== "localhost" && this._ip !== "127.0.0.1")
                {
                    errorMsg += `, with IP: ${this._ip} and port: ${this._port}`;
                }
                else
                {
                    errorMsg += `, with port: ${this._port}`;
                }
            }
            errShowErrorMessage(errorMsg);
        });
    }

    async _setupListenersOnConnect(): Promise<void> 
    {
        const socket = this._client;

        
        return new Promise((resolve, reject) => 
        {
            const handleMessage = (event: MessageEvent) => 
            {
                const messageEvent: MessageEvent = event;
                // The cast was necessary because Flow's libdef's don't contain
                // a MessageEventListener definition.

                if (this._receiveCallbacksQueue.length !== 0) 
                {
                    this._receiveCallbacksQueue.shift()?.resolve(messageEvent.data);
                    return;
                }

                this._receiveDataQueue.push(messageEvent.data);
            };

            const handleOpen = (event: Event) => 
            {
                socket.addEventListener('message', handleMessage);
                socket.addEventListener('close', event => 
                {
                    this._closeEvent = event;

                    // Whenever a close event fires, the socket is effectively dead.
                    // It's impossible for more messages to arrive.
                    // If there are any promises waiting for messages, reject them.
                    while (this._receiveCallbacksQueue.length !== 0) 
                    {
                        this._receiveCallbacksQueue.shift()?.reject(this._closeEvent);
                    }
                });
                if (globalState?.get(C4D_CALL_GET_PATH_ON_CONNECT_ID))
                {
                    this.getPath()
                    .then((path: string | undefined) =>
                    {
                        return vscode.workspace.getConfiguration().update(C4D_PATH_CONFIG_ID, path, vscode.ConfigurationTarget.Global);
                    })
                    .catch(errShowErrorMessage);
                }
                resolve();
            };

            socket.addEventListener('error', reject);
            socket.addEventListener('open', handleOpen);
        });
    }

    send(data: any): void
    {
        if (!this.isConnected)
        { throw this._closeEvent || new Error('Not connected.'); }

        this._client.send(data);
    }

    async receive(): Promise<any>
    {
        if (this._receiveDataQueue.length !== 0) 
        {
            return Promise.resolve(this._receiveDataQueue.shift());
        }

        if (!this.isConnected) 
        {
            return Promise.reject(this._closeEvent || new Error('Not connected.'));
        }

        const receivePromise: Promise<any> = new Promise((resolve, reject) => 
        {
            this._receiveCallbacksQueue.push({ resolve, reject });
        });

        return receivePromise;
    }

    async stop()
    {
        if(!this.isConnected) 
        {
            return Promise.resolve(this._closeEvent);
        }

        return new Promise((resolve, reject) => 
        {
            // It's okay to call resolve/reject multiple times in a promise.
            const callbacks = 
            {
                resolve: (dummy: any) => 
                {
                    // Make sure this object always stays in the queue
                    // until callbacks.reject() (which is resolve) is called.
                    this._receiveCallbacksQueue.push(callbacks);
                },

                reject: resolve
            };

            this._receiveCallbacksQueue.push(callbacks);
            // After this, we will imminently get a close event.
            // Therefore, this promise will resolve.
            this._client.close();
        });
    }
    
    // SET_SCRIPT_CONTENT: Response of CONSOLE from loadScriptContent 
    private setConsoleContentInVsCode(data: string, isBinary: boolean) : void
    {
        if (!this.isConnected || !data)
        { return; }

        let content: CONSOLE = JSON.parse(data);

        if (typeof content.action !== "string" || content.action !== CODEEXCHANGE.C4D2IDE.CONSOLE)
        { return; }
        if (typeof content.value !== "string" || !content.value)
        { return; }

        addToC4DConsoleCmd(content.value);
    }

    // SET_SCRIPT_CONTENT: Response of GET_SCRIPT_CONTENT from loadScriptContent 
    private setScriptContentInVsCode(data: string, isBinary: boolean) : void
    {
        if (!this.isConnected || !data)
        { return; }

        let content: SET_SCRIPT_CONTENT = JSON.parse(data);

        if (typeof content.action !== "string" || content.action !== CODEEXCHANGE.C4D2IDE.SET_SCRIPT_CONTENT)
        { return; }
        if (typeof content.value !== "string" || !content.value)
        { return; }
        if (typeof content.script_path !== "string" || !content.script_path)
        { return; }

        setC4dScriptContentCmd(content);
    }

    async getScriptContent(path: vscode.Uri)
    {
        if (!this.isConnected)
        { return; }
        
        let script_path;
        if (path.scheme === "c4dfs")
        { 
            script_path = `${path.scheme}://${path.path}`;
        }
        else
        { 
            script_path = `${path.scheme}:///${fixPath(path.path)}`;
        }

        this._client.send(JSON.stringify({ action: CODEEXCHANGE.IDE2C4D.GET_SCRIPT_CONTENT, script_path: script_path}));
        for (let i = 0; i< this._max_try; i++)
        {
            let data = await this.receive();
            let content: SET_SCRIPT_CONTENT = JSON.parse(data);
    
            if (typeof content.action !== "string" || content.action !== CODEEXCHANGE.C4D2IDE.SET_SCRIPT_CONTENT)
            { continue; }
            if (typeof content.value !== "string" || !content.value)
            { continue; }
            if (typeof content.script_path !== "string" || !content.script_path)
            { continue; }
    
            return content.value;
        }

        return;
    }

    async getPID()
    {
        this._client.send(JSON.stringify({ action: CODEEXCHANGE.IDE2C4D.GET_PID}));
        for (let i = 0; i< this._max_try; i++)
        {
            let data = await this.receive();
            let content: GET_PID = JSON.parse(data);
    
            if (typeof content.action !== "string" || content.action !== CODEEXCHANGE.C4D2IDE.GET_PID)
            { continue; }
            if (typeof content.value !== "number" || !content.value)
            { continue; }

            return content.value;
        }

        return;
    }

    async getPath()
    {
        this._client.send(JSON.stringify({ action: CODEEXCHANGE.IDE2C4D.GET_PATH}));
        for (let i = 0; i< this._max_try; i++)
        {
            let data = await this.receive();
            let content: GET_PATH = JSON.parse(data);
    
            if (typeof content.action !== "string" || content.action !== CODEEXCHANGE.C4D2IDE.GET_PATH)
            { continue; }
            if (typeof content.value !== "string" || !content.value)
            { continue; }
    
            return content.value;
        }

        return;
    }

    private async getPathAndContentFromDoc(doc: vscode.TextDocument, retrieve_saved: boolean)
    {
        let script_path;
        if (doc.uri.scheme === "c4dfs")
        { script_path = `${doc.uri.scheme}:${doc.uri.path}`; }

        else if (doc.uri.scheme === "file")
        { script_path = `${doc.uri.scheme}:///${fixPath(doc.uri.path)}`; }

        else if (doc.uri.scheme === "untitled")
        { script_path = `${doc.uri.scheme}://${fixPath(doc.uri.path)}`; }

        let content;
        if (!retrieve_saved || doc.uri.scheme === "untitled")
        {
            content = doc.getText();
        }
        else
        {
            content = (await vscode.workspace.fs.readFile(doc.uri)).toString();
        }

        return {script_path, content};
    }

    async setScriptContentInC4D(path: vscode.Uri, content: string | undefined = undefined)
    {
        if (!this.isConnected)
        { throw new Error("Not connected"); }

        
        // let uriData = await this.getPathAndContentFromDoc(doc, false);
        
        let script_path;
        if (path.scheme === "c4dfs")
        { script_path = `${path.scheme}:${path.path}`; }

        else if (path.scheme === "file")
        { script_path = `${path.scheme}:///${fixPath(path.path)}`; }

        else 
        { throw new Error(`Unsupported file scheme: ${path.scheme}, only c4dfs or file is supported.`); }

        if (content === undefined)
        {
            content = (await vscode.workspace.fs.readFile(path)).toString();
        }

        this._client.send(JSON.stringify({  action: CODEEXCHANGE.IDE2C4D.SET_SCRIPT_CONTENT, 
                                            script_path: script_path,
                                            value: content
                                         }));
    }

    async loadInScriptManager(doc: vscode.TextDocument, content: string | undefined = undefined)
    {
        if (!this.isConnected)
        { throw new Error("Not Connected"); }

        let uriData = await this.getPathAndContentFromDoc(doc, false);

        this._client.send(JSON.stringify({  action: CODEEXCHANGE.IDE2C4D.LOAD_IN_SCRIPT_MANAGER, 
                                            script_path: uriData.script_path,
                                            value: uriData.content
                                         }));

        // If it was an untitled we receive back a SET_SCRIPT_CONTENT message (with the new script with a c4dfs uri)
        if (doc.uri.scheme === "untitled")
        {
            for (let i = 0; i< this._max_try; i++)
            {
                let data = await this.receive();
                let content: SET_SCRIPT_CONTENT = JSON.parse(data);
    
                if (typeof content.action !== "string" || content.action !== CODEEXCHANGE.C4D2IDE.SET_SCRIPT_CONTENT)
                { continue; }
                if (typeof content.value !== "string" || !content.value)
                { continue; }
                if (typeof content.script_path !== "string" || !content.script_path)
                { continue; }
    
                vscode.window.showTextDocument(doc.uri, {preview: true, preserveFocus: false})
                .then(() => 
                {
                    setC4dScriptContentCmd(content);
                });
            }
            
            return;
        }
    }

    async executeInC4D(doc: vscode.TextDocument, content: string | undefined = undefined, debug: boolean = false)
    {
        if (!this.isConnected)
        { return; }
        
        // Do a final check to be sure the URL is one of these 3 schemes
        if (doc.uri.scheme !== "file" && doc.uri.scheme !== "c4dfs" && doc.uri.scheme !== "untitled")
        { throw new Error(`Incorrect file type, ${doc.uri.scheme}`); }

        let uriData = await this.getPathAndContentFromDoc(doc, false);

        this._client.send(JSON.stringify({  action: CODEEXCHANGE.IDE2C4D.EXECUTE_SCRIPT, 
            script_path: uriData.script_path,
            value: uriData.content,
            debug: debug,
            }));
    }
    
    async executeScriptInC4d(script: string)
    {
        if (!this.isConnected)
        { return; }

        this._client.send(JSON.stringify({  action: CODEEXCHANGE.IDE2C4D.EXECUTE_SCRIPT, 
            script_path: "empty",
            value: script,
            debug: false,
            }));
    }
}

export const client: AsyncClient = new AsyncClient();

export function fixPath(filepath: string) {
    if (os.platform() !== 'win32') 
    { return filepath; }

    if (filepath.startsWith("/"))
    { filepath = filepath.slice(1); }

    if (filepath.match(/^[a-zA-Z]:/) !== null) {
        return filepath[0].toUpperCase() + filepath.substring(1);
    }

    return filepath;
}