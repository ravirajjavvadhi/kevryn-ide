import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { RuntimeManager } from '../runtime/RuntimeManager';
import { EnvironmentManager } from '../runtime/EnvironmentManager';
import { WorkspaceManager } from '../main/WorkspaceManager';

export function setupIpcHandlers(mainWindow: BrowserWindow) {
    const runtimeManager = new RuntimeManager(mainWindow);
    const workspaceManager = new WorkspaceManager(mainWindow);

    // Initial load of previous workspace if exists
    const CONFIG_FILE = path.join(app.getPath('userData'), 'kevryn_workspace.json');
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            if (data.workspacePath) {
                workspaceManager.openFolder(data.workspacePath).catch(console.error);
            }
        } catch(e) {}
    }

    ipcMain.handle('run-code', async (event, fileName: string, content?: string) => {
        return await runtimeManager.executeFile(fileName);
    });

    ipcMain.handle('get-env-status', () => {
        return EnvironmentManager.getStatus();
    });

    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        const ctx = await workspaceManager.openFolder(result.filePaths[0]);
        return ctx ? ctx.rootPath : null;
    });

    ipcMain.handle('get-workspace-path', async () => {
        const ctx = workspaceManager.getActiveWorkspace();
        return ctx ? ctx.rootPath : null;
    });

    // Read-only agent context. The renderer/provider never receives an unrestricted
    // filesystem handle; every later tool is constrained by WorkspaceManager.
    ipcMain.handle('agent-workspace-context', async () => workspaceManager.getAgentContext());
    ipcMain.handle('agent-read-workspace-file', async (_event, relativePath: string) => workspaceManager.readAgentFile(relativePath));
    ipcMain.handle('agent-search-workspace', async (_event, query: string) => workspaceManager.searchAgentWorkspace(query));

    ipcMain.handle('save-workspace-path', async (event, workspacePath: string) => {
        const ctx = await workspaceManager.openFolder(workspacePath);
        return !!ctx;
    });

    ipcMain.handle('read-local-dir', async (event, dirPath: string) => {
        try {
            const ctx = workspaceManager.getActiveWorkspace();
            if (!ctx) return [];
            
            // Build tree recursively for frontend compatibility (max depth 5 for performance)
            const buildTree = async (currentPath: string, relativePath: string, depth = 0): Promise<any[]> => {
                if (depth > 5) return [];
                
                const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
                
                const promises = entries.map(async (entry) => {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') return null;
                    
                    const fullPath = path.join(currentPath, entry.name);
                    const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                    
                    if (entry.isDirectory()) {
                        return {
                            _id: fullPath,
                            name: entry.name,
                            type: 'folder',
                            children: await buildTree(fullPath, relPath, depth + 1)
                        };
                    } else {
                        return {
                            _id: fullPath,
                            name: entry.name,
                            type: 'file'
                        };
                    }
                });
                
                const resolved = await Promise.all(promises);
                return resolved.filter(Boolean);
            };
            
            return await buildTree(dirPath, '');
        } catch (error: any) {
            console.error('Failed to read local dir:', error);
            return [];
        }
    });

    ipcMain.handle('read-local-file', async (event, filePath: string) => {
        try {
            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (error: any) {
            console.error('Failed to read local file:', error);
            throw error;
        }
    });

    ipcMain.handle('write-local-file', async (event, filePath: string, content: string) => {
        try {
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return true;
        } catch (error: any) {
            console.error('Failed to write local file:', error);
            throw error;
        }
    });

    ipcMain.handle('create-local-item', async (event, targetPath: string, type: 'file' | 'folder') => {
        try {
            if (type === 'folder') {
                await fs.promises.mkdir(targetPath, { recursive: true });
            } else {
                await fs.promises.writeFile(targetPath, '', 'utf-8');
            }
            return { success: true };
        } catch (error: any) {
            console.error('Failed to create local item:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('delete-local-item', async (event, targetPath: string) => {
        try {
            const stat = await fs.promises.stat(targetPath);
            if (stat.isDirectory()) {
                await fs.promises.rm(targetPath, { recursive: true, force: true });
            } else {
                await fs.promises.unlink(targetPath);
            }
            return { success: true };
        } catch (error: any) {
            console.error('Failed to delete local item:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('rename-local-item', async (event, oldPath: string, newPath: string) => {
        try {
            await fs.promises.rename(oldPath, newPath);
            return { success: true };
        } catch (error: any) {
            console.error('Failed to rename local item:', error);
            return { success: false, error: error.message };
        }
    });
}
