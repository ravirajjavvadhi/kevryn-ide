import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__KEVRYN_DESKTOP__', true);

contextBridge.exposeInMainWorld('electronAPI', {
    runCode: (fileName: string, content?: string) => ipcRenderer.invoke('run-code', fileName, content),
    onTerminalData: (callback: (data: string) => void) => {
        ipcRenderer.removeAllListeners('terminal-data');
        ipcRenderer.on('terminal-data', (_event, data) => callback(data));
    },
    onExecutionEnd: (callback: (code: number) => void) => {
        ipcRenderer.removeAllListeners('execution-end');
        ipcRenderer.on('execution-end', (_event, code) => callback(code));
    },
    getEnvironmentStatus: () => ipcRenderer.invoke('get-env-status'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getWorkspacePath: () => ipcRenderer.invoke('get-workspace-path'),
    saveWorkspacePath: (path: string) => ipcRenderer.invoke('save-workspace-path', path),
    readLocalDir: (dirPath: string) => ipcRenderer.invoke('read-local-dir', dirPath),
    readLocalFile: (filePath: string) => ipcRenderer.invoke('read-local-file', filePath),
    writeLocalFile: (filePath: string, content: string) => ipcRenderer.invoke('write-local-file', filePath, content),
    createLocalItem: (targetPath: string, type: 'file' | 'folder') => ipcRenderer.invoke('create-local-item', targetPath, type),
    deleteLocalItem: (targetPath: string) => ipcRenderer.invoke('delete-local-item', targetPath),
    renameLocalItem: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-local-item', oldPath, newPath),
    spawnTerminal: (cwd: string, cols?: number, rows?: number) => ipcRenderer.invoke('spawn-terminal', cwd, cols, rows),
    terminalWrite: (data: string) => ipcRenderer.invoke('terminal-write', data),
    terminalResize: (cols: number, rows: number) => ipcRenderer.invoke('terminal-resize', cols, rows),
    
    // Agent Hub APIs
    getAgentList: () => ipcRenderer.invoke('agent-list'),
    authenticateAgent: (agentId: string, secret: string) => ipcRenderer.invoke('agent-authenticate', agentId, secret),
    signoutAgent: (agentId: string) => ipcRenderer.invoke('agent-signout', agentId),
    openProviderKeyPage: (agentId: string) => ipcRenderer.invoke('open-provider-key-page', agentId),
    chatWithAgent: (agentId: string, message: string, context: any) => ipcRenderer.invoke('agent-chat', agentId, message, context),
    onAgentChatChunk: (agentId: string, callback: (chunk: string) => void) => {
        ipcRenderer.removeAllListeners(`agent-chat-chunk-${agentId}`);
        ipcRenderer.on(`agent-chat-chunk-${agentId}`, (_event, chunk) => callback(chunk));
    },
    onAgentChatDone: (agentId: string, callback: () => void) => {
        ipcRenderer.removeAllListeners(`agent-chat-done-${agentId}`);
        ipcRenderer.on(`agent-chat-done-${agentId}`, () => callback());
    },
    onAgentChatError: (agentId: string, callback: (error: string) => void) => {
        ipcRenderer.removeAllListeners(`agent-chat-error-${agentId}`);
        ipcRenderer.on(`agent-chat-error-${agentId}`, (_event, error) => callback(error));
    },

    onUpdateAvailable: (callback: (info: any) => void) => {
        ipcRenderer.removeAllListeners('update-available');
        ipcRenderer.on('update-available', (_event, info) => callback(info));
    },
    onDownloadProgress: (callback: (progress: any) => void) => {
        ipcRenderer.removeAllListeners('download-progress');
        ipcRenderer.on('download-progress', (_event, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback: (info: any) => void) => {
        ipcRenderer.removeAllListeners('update-downloaded');
        ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
    },
    installUpdate: () => ipcRenderer.invoke('install-update')
});
