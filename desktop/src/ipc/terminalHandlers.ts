import { ipcMain, BrowserWindow, app } from 'electron';
import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let ptyProcess: pty.IPty | null = null;
let ptyCwd: string | null = null;
let lastRunKey = '';
let lastRunAt = 0;

export function setupTerminalHandlers(mainWindow: BrowserWindow) {
    const spawn = (cwd: string, cols?: number, rows?: number) => {
        if (ptyProcess) {
            ptyProcess.kill();
        }

        const resolvedCwd = path.resolve(cwd || process.env.HOME || process.env.USERPROFILE || process.cwd());
        if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
            return { success: false, error: 'The selected run folder is no longer available on this computer.' };
        }

        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

        try {
            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: cols || 120,
                rows: rows || 30,
                cwd: resolvedCwd,
                env: process.env as { [key: string]: string }
            });

            ptyProcess.onData((data) => {
                if (!mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('terminal-data', data);
                }
            });

            ptyCwd = resolvedCwd;

            return { success: true };
        } catch (error: any) {
            console.error('Failed to spawn terminal:', error);
            ptyProcess = null;
            ptyCwd = null;
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

    // A normal Run action must not echo a long `Set-Location ...` wrapper into
    // the visible terminal.  Electron owns the terminal's working directory,
    // so it can switch shells when needed and write only the actual command.
    // This also makes a run reliable when the terminal panel was closed or a
    // different folder had been active previously.
    ipcMain.handle('run-local-command', (_event, cwd: string, command: string) => {
        const targetCwd = path.resolve(cwd || '');
        const trimmedCommand = typeof command === 'string' ? command.trim() : '';
        if (!trimmedCommand) return { success: false, error: 'No command was provided to run.' };
        if (!fs.existsSync(targetCwd) || !fs.statSync(targetCwd).isDirectory()) {
            return { success: false, error: 'The selected run folder is no longer available on this computer.' };
        }

        const key = `${targetCwd}\u0000${trimmedCommand}`;
        const now = Date.now();
        // Prevent button double-clicks and React event replays, while still
        // allowing the user to intentionally run the same program again.
        if (key === lastRunKey && now - lastRunAt < 1000) return { success: true, skippedDuplicate: true };

        if (!ptyProcess || ptyCwd !== targetCwd) {
            const spawned = spawn(targetCwd);
            if (!spawned.success) return spawned;
        }

        ptyProcess?.write(`${trimmedCommand}\r`);
        lastRunKey = key;
        lastRunAt = now;
        return { success: true };
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
