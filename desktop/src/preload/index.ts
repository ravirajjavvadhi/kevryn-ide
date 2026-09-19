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
    getLocalRunTarget: (filePath: string) => ipcRenderer.invoke('get-local-run-target', filePath),
    openLocalPreview: (entryPath: string) => ipcRenderer.invoke('open-local-preview', entryPath),
    getAgentWorkspaceContext: () => ipcRenderer.invoke('agent-workspace-context'),
    readAgentWorkspaceFile: (relativePath: string) => ipcRenderer.invoke('agent-read-workspace-file', relativePath),
    searchAgentWorkspace: (query: string) => ipcRenderer.invoke('agent-search-workspace', query),
    writeAgentWorkspaceFile: (relativePath: string, content: string) => ipcRenderer.invoke('agent-write-workspace-file', relativePath, content),
    applyAgentWorkspaceActions: (actions: unknown) => ipcRenderer.invoke('agent-apply-workspace-actions', actions),
    saveWorkspacePath: (path: string) => ipcRenderer.invoke('save-workspace-path', path),
    getLabWorkspace: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }) => ipcRenderer.invoke('get-lab-workspace', scope),
    readLabDir: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }) => ipcRenderer.invoke('lab-read-dir', scope),
    readLabFile: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }, path: string) => ipcRenderer.invoke('lab-read-file', scope, path),
    writeLabFile: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }, path: string, content: string) => ipcRenderer.invoke('lab-write-file', scope, path, content),
    createLabItem: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }, path: string, type: 'file' | 'folder') => ipcRenderer.invoke('lab-create-item', scope, path, type),
    renameLabItem: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }, from: string, to: string) => ipcRenderer.invoke('lab-rename-item', scope, from, to),
    deleteLabItem: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }, path: string) => ipcRenderer.invoke('lab-delete-item', scope, path),
    openLabPreview: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }, path: string) => ipcRenderer.invoke('open-lab-preview', scope, path),
    listPreviousLabFiles: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }) => ipcRenderer.invoke('lab-list-previous-files', scope),
    importPreviousLabFile: (scope: { collegeId?: string, studentId?: string, courseId?: string, subject?: string, sessionId?: string }, sourceSessionId: string, sourcePath: string, targetPath?: string) => ipcRenderer.invoke('lab-import-previous-file', scope, sourceSessionId, sourcePath, targetPath),
    readLocalDir: (dirPath: string) => ipcRenderer.invoke('read-local-dir', dirPath),
    readLocalFile: (filePath: string) => ipcRenderer.invoke('read-local-file', filePath),
    writeLocalFile: (filePath: string, content: string) => ipcRenderer.invoke('write-local-file', filePath, content),
    createLocalItem: (targetPath: string, type: 'file' | 'folder') => ipcRenderer.invoke('create-local-item', targetPath, type),
    deleteLocalItem: (targetPath: string) => ipcRenderer.invoke('delete-local-item', targetPath),
    renameLocalItem: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-local-item', oldPath, newPath),
    spawnTerminal: (cwd: string, cols?: number, rows?: number) => ipcRenderer.invoke('spawn-terminal', cwd, cols, rows),
    spawnLabTerminal: (cwd: string, cols?: number, rows?: number) => ipcRenderer.invoke('spawn-lab-terminal', cwd, cols, rows),
    runLocalCommand: (cwd: string, command: string) => ipcRenderer.invoke('run-local-command', cwd, command),
    terminalWrite: (data: string) => ipcRenderer.invoke('terminal-write', data),
    terminalResize: (cols: number, rows: number) => ipcRenderer.invoke('terminal-resize', cols, rows),
    
    // Agent Hub APIs
    getAgentList: () => ipcRenderer.invoke('agent-list'),
    authenticateAgent: (agentId: string, secret: string) => ipcRenderer.invoke('agent-authenticate', agentId, secret),
    signoutAgent: (agentId: string) => ipcRenderer.invoke('agent-signout', agentId),
    openProviderKeyPage: (agentId: string) => ipcRenderer.invoke('open-provider-key-page', agentId),
    chatWithAgent: (agentId: string, message: string, context: any) => ipcRenderer.invoke('agent-chat', agentId, message, context),
    startAgentTask: (input: any) => ipcRenderer.invoke('agent-task-start', input),
    listAgentTasks: () => ipcRenderer.invoke('agent-task-list'),
    resolveAgentTaskApproval: (taskId: string, approvalId: string, allowed: boolean) => ipcRenderer.invoke('agent-task-approve', taskId, approvalId, allowed),
    setAgentTaskMode: (taskId: string, mode: 'ask' | 'edit' | 'trusted') => ipcRenderer.invoke('agent-task-mode', taskId, mode),
    cancelAgentTask: (taskId: string) => ipcRenderer.invoke('agent-task-cancel', taskId),
    undoAgentTaskChange: (taskId: string, changeId: string) => ipcRenderer.invoke('agent-task-undo', taskId, changeId),
    updateAgentTaskEditorState: (dirtyFiles: string[]) => ipcRenderer.invoke('agent-task-editor-state', dirtyFiles),
    onAgentTaskEvent: (callback: (event: any) => void) => {
        ipcRenderer.removeAllListeners('agent-task-event');
        ipcRenderer.on('agent-task-event', (_event, taskEvent) => callback(taskEvent));
    },
    onAgentChatChunk: (agentId: string, requestIdOrCallback: string | ((chunk: string) => void), possibleCallback?: (chunk: string) => void) => {
        const requestId = typeof requestIdOrCallback === 'string' ? requestIdOrCallback : '';
        const callback = typeof requestIdOrCallback === 'function' ? requestIdOrCallback : possibleCallback;
        const channel = requestId ? `agent-chat-chunk-${agentId}-${requestId}` : `agent-chat-chunk-${agentId}`;
        ipcRenderer.removeAllListeners(channel);
        if (callback) ipcRenderer.on(channel, (_event, chunk) => callback(chunk));
    },
    onAgentChatDone: (agentId: string, requestIdOrCallback: string | (() => void), possibleCallback?: () => void) => {
        const requestId = typeof requestIdOrCallback === 'string' ? requestIdOrCallback : '';
        const callback = typeof requestIdOrCallback === 'function' ? requestIdOrCallback : possibleCallback;
        const channel = requestId ? `agent-chat-done-${agentId}-${requestId}` : `agent-chat-done-${agentId}`;
        ipcRenderer.removeAllListeners(channel);
        if (callback) ipcRenderer.on(channel, () => callback());
    },
    onAgentChatError: (agentId: string, requestIdOrCallback: string | ((error: string) => void), possibleCallback?: (error: string) => void) => {
        const requestId = typeof requestIdOrCallback === 'string' ? requestIdOrCallback : '';
        const callback = typeof requestIdOrCallback === 'function' ? requestIdOrCallback : possibleCallback;
        const channel = requestId ? `agent-chat-error-${agentId}-${requestId}` : `agent-chat-error-${agentId}`;
        ipcRenderer.removeAllListeners(channel);
        if (callback) ipcRenderer.on(channel, (_event, error) => callback(error));
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
