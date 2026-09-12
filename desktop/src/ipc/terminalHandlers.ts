import { ipcMain, BrowserWindow, app } from 'electron';
import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';

let ptyProcess: pty.IPty | null = null;

export function setupTerminalHandlers(mainWindow: BrowserWindow) {
    const spawn = (cwd: string, cols?: number, rows?: number) => {
        if (ptyProcess) {
            ptyProcess.kill();
        }

        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

        try {
            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: cols || 120,
                rows: rows || 30,
                cwd: cwd || process.env.HOME || process.env.USERPROFILE || process.cwd(),
                env: process.env as { [key: string]: string }
            });

            ptyProcess.onData((data) => {
                if (!mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('terminal-data', data);
                }
            });

            return { success: true };
        } catch (error: any) {
            console.error('Failed to spawn terminal:', error);
            return { success: false, error: error.message };
        }
    };

    ipcMain.handle('spawn-terminal', (_event, cwd: string, cols?: number, rows?: number) => spawn(cwd, cols, rows));
    ipcMain.handle('spawn-lab-terminal', (_event, cwd: string, cols?: number, rows?: number) => {
        const labsRoot = path.resolve(app.getPath('userData'), 'Labs');
        const target = path.resolve(cwd || '');
        if (target !== labsRoot && !target.startsWith(labsRoot + path.sep)) return { success: false, error: 'Lab terminal must stay inside its dedicated local lab folder.' };
        return spawn(target, cols, rows);
    });

    ipcMain.handle('terminal-write', (event, data: string) => {
        if (ptyProcess) {
            ptyProcess.write(data);
        }
    });

    ipcMain.handle('terminal-resize', (event, cols: number, rows: number) => {
        if (ptyProcess) {
            try {
                ptyProcess.resize(cols, rows);
            } catch (e) {
                // Ignore resize errors if pty is already dead
            }
        }
    });
}
