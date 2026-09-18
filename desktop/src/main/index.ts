import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { setupIpcHandlers } from '../ipc/handlers';
import { setupTerminalHandlers } from '../ipc/terminalHandlers';
import { EnvironmentManager } from '../runtime/EnvironmentManager';
import { AgentRuntime } from '../agents/runtime/AgentRuntime';

// Disable Chromium Sandbox to prevent crashes on strict Ubuntu college networks
app.commandLine.appendSwitch('no-sandbox');

async function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Fix: Open external links in default OS browser (Chrome/Edge) instead of internal Electron window.
    // This prevents Google Login from crashing with a blank screen or 'disallowed_useragent'.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') || url.startsWith('https')) {
            require('electron').shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Detect environment on startup
    await EnvironmentManager.detectAll();

    // Setup IPC Handlers
    const workspaceManager = setupIpcHandlers(win);
    setupTerminalHandlers(win);

    // Setup Agent Hub
    const { AgentManager } = require('../agents/core/AgentManager');
    const { GeminiAdapter } = require('../agents/providers/gemini/GeminiAdapter');
    const { GroqAdapter } = require('../agents/providers/groq/GroqAdapter');
    
    const agentManager = new AgentManager(win);
    agentManager.registerAgent(new GeminiAdapter());
    agentManager.registerAgent(new GroqAdapter());
    agentManager.setupIpc();
    agentManager.initializeAgents().catch(console.error);

    // Workspace tasks use a dedicated main-process runtime. Renderer code only
    // receives events and asks for approvals; it cannot grant itself file or
    // terminal access.
    const agentRuntime = new AgentRuntime(
        () => workspaceManager.getActiveWorkspace(),
        (id) => agentManager.getAgent(id),
        (_owner, event) => { if (!win.isDestroyed()) win.webContents.send('agent-task-event', event); }
    );
    ipcMain.handle('agent-task-start', (event, input) => agentRuntime.start(event.sender.id, input || {}));
    ipcMain.handle('agent-task-list', (event) => agentRuntime.snapshot(event.sender.id));
    ipcMain.handle('agent-task-approve', (event, taskId: string, approvalId: string, allowed: boolean) => {
        agentRuntime.approve(event.sender.id, taskId, approvalId, allowed); return { success: true };
    });
    ipcMain.handle('agent-task-mode', (event, taskId: string, mode: 'ask' | 'edit' | 'trusted') => {
        agentRuntime.setMode(event.sender.id, taskId, mode); return { success: true };
    });
    ipcMain.handle('agent-task-cancel', (event, taskId: string) => { agentRuntime.cancel(event.sender.id, taskId); return { success: true }; });
    ipcMain.handle('agent-task-undo', async (event, taskId: string, changeId: string) => {
        await agentRuntime.undo(event.sender.id, taskId, changeId); return { success: true };
    });
    ipcMain.handle('agent-task-editor-state', (event, dirtyFiles: string[]) => { agentRuntime.updateEditor(event.sender.id, dirtyFiles || []); return { success: true }; });
    const windowWebContentsId = win.webContents.id;
    win.webContents.on('destroyed', () => agentRuntime.cancelOwner(windowWebContentsId));

    // Load React UI
    const isDev = !app.isPackaged;
    if (isDev) {
        win.loadURL('http://localhost:3000');
    } else {
        win.loadFile(path.join(__dirname, '../../client-build/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    ipcMain.handle('open-provider-key-page', async (_event, provider: string) => {
        const urls: Record<string, string> = {
            'google-gemini': 'https://aistudio.google.com/app/apikey',
            'groq-assistant': 'https://console.groq.com/keys'
        };
        const url = urls[provider];
        if (!url) throw new Error('Unknown AI provider.');
        await shell.openExternal(url);
    });

    // Auto-Updater UI Events
    autoUpdater.on('update-available', (info) => {
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update-available', info));
    });
    autoUpdater.on('download-progress', (progressObj) => {
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('download-progress', progressObj));
    });
    autoUpdater.on('update-downloaded', (info) => {
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update-downloaded', info));
    });
    
    ipcMain.handle('install-update', () => {
        autoUpdater.quitAndInstall();
    });

    // Silently check for updates in the background
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error("AutoUpdater error:", err);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
