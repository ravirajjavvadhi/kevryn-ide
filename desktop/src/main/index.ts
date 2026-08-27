import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { setupIpcHandlers } from '../ipc/handlers';
import { setupTerminalHandlers } from '../ipc/terminalHandlers';
import { EnvironmentManager } from '../runtime/EnvironmentManager';

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
    setupIpcHandlers(win);
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
