import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { RuntimeManager } from '../runtime/RuntimeManager';
import { EnvironmentManager } from '../runtime/EnvironmentManager';
import { WorkspaceManager } from '../main/WorkspaceManager';

let previewServer: http.Server | null = null;
let previewRoot = '';
let previewPort = 0;
let previewWindow: BrowserWindow | null = null;

type LabWorkspaceScope = { collegeId?: string; studentId?: string; courseId?: string; subject?: string };

// Lab workspaces must never be derived from a user supplied absolute path.
// Electron owns the root under per-user application data, making the layout
// portable across accounts and preventing a lab session from escaping into a
// personal workspace.
const safeLabSegment = (value: unknown, fallback: string) => {
    const cleaned = String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    return cleaned || fallback;
};
const labRootFor = (scope: LabWorkspaceScope) => path.join(
    app.getPath('userData'), 'Labs',
    safeLabSegment(scope.collegeId, 'local-institution'),
    safeLabSegment(scope.studentId, 'student'),
    safeLabSegment(scope.courseId || scope.subject, 'general-lab')
);
const resolveLabPath = (root: string, relativePath = '.') => {
    const target = path.resolve(root, relativePath || '.');
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Lab workspace boundary violation.');
    return target;
};

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json'
};

const isWithinWorkspace = (rootPath: string, targetPath: string) => {
    const root = path.resolve(rootPath);
    const target = path.resolve(targetPath);
    return target === root || target.startsWith(root + path.sep);
};

const findPackageDirectory = async (startDir: string, rootPath: string): Promise<string | null> => {
    let current = path.resolve(startDir);
    const root = path.resolve(rootPath);
    while (isWithinWorkspace(root, current)) {
        try {
            const stat = await fs.promises.stat(path.join(current, 'package.json'));
            if (stat.isFile()) return current;
        } catch (_) { /* continue toward the workspace root */ }
        if (current === root) break;
        current = path.dirname(current);
    }
    return null;
};

const resolvePreviewEntry = async (filePath: string, rootPath: string): Promise<string | null> => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.htm'].includes(ext)) return filePath;
    const candidates = [path.join(path.dirname(filePath), 'index.html'), path.join(rootPath, 'index.html')];
    for (const candidate of candidates) {
        try {
            if (isWithinWorkspace(rootPath, candidate) && (await fs.promises.stat(candidate)).isFile()) return candidate;
        } catch (_) { /* try the next browser entry point */ }
    }
    return null;
};

const startPreviewServer = async (rootPath: string): Promise<number> => {
    const root = path.resolve(rootPath);
    if (previewServer && previewRoot === root && previewPort) return previewPort;
    if (previewServer) await new Promise<void>(resolve => previewServer!.close(() => resolve()));
    previewRoot = root;
    previewServer = http.createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
            const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
            const target = path.resolve(previewRoot, relativePath);
            if (!isWithinWorkspace(previewRoot, target)) { response.writeHead(403); response.end('Forbidden'); return; }
            const stat = await fs.promises.stat(target);
            if (!stat.isFile()) { response.writeHead(404); response.end('Not found'); return; }
            response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            fs.createReadStream(target).pipe(response);
        } catch (_) {
            response.writeHead(404); response.end('Not found');
        }
    });
    await new Promise<void>((resolve, reject) => {
        previewServer!.once('error', reject);
        previewServer!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = previewServer.address();
    previewPort = typeof address === 'object' && address ? address.port : 0;
    return previewPort;
};

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

    // Returns a purely local run target. The renderer receives a command only;
    // Electron executes it in the user's own integrated PowerShell terminal.
    ipcMain.handle('get-local-run-target', async (_event, filePath: string) => {
        const workspace = workspaceManager.getActiveWorkspace();
        if (!workspace || !isWithinWorkspace(workspace.rootPath, filePath)) return { kind: 'error', error: 'Open a local workspace before running files.' };
        const target = path.resolve(filePath);
        const dir = path.dirname(target);
        const ext = path.extname(target).toLowerCase();
        const file = path.basename(target);
        const stem = path.basename(target, ext);
        const packageDir = await findPackageDirectory(dir, workspace.rootPath);

        // A package script is the source of truth for modern web/full-stack
        // projects (Vite, React, Next, Express, etc.). Prefer it even when the
        // selected file is index.html so JSX/TS transforms and backend proxies
        // are handled by the project's own local development server.
        if (packageDir && (['.html', '.htm', '.css', '.svg', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json'].includes(ext) || file === 'package.json')) {
            try {
                const pkg = JSON.parse(await fs.promises.readFile(path.join(packageDir, 'package.json'), 'utf8'));
                const script = pkg.scripts?.dev ? 'npm run dev' : pkg.scripts?.start ? 'npm start' : pkg.scripts?.serve ? 'npm run serve' : '';
                if (script) return { kind: 'command', cwd: packageDir, command: script, label: 'Local web project' };
            } catch (_) { /* use a standalone runtime command below */ }
        }

        if (['.html', '.htm', '.css', '.svg'].includes(ext)) {
            const entry = await resolvePreviewEntry(target, workspace.rootPath);
            return entry ? { kind: 'preview', entry } : { kind: 'error', error: 'No HTML entry point was found. Create or open an index.html file to preview this web asset.' };
        }

        const commands: Record<string, string> = {
            '.py': `python "${file}"`, '.js': `node "${file}"`, '.mjs': `node "${file}"`, '.cjs': `node "${file}"`,
            '.ts': `npx tsx "${file}"`, '.java': `javac "${file}"; java "${stem}"`,
            '.c': `gcc "${file}" -o "${stem}.exe"; if ($LASTEXITCODE -eq 0) { .\\${stem}.exe }`,
            '.cpp': `g++ "${file}" -o "${stem}.exe"; if ($LASTEXITCODE -eq 0) { .\\${stem}.exe }`,
            '.go': `go run "${file}"`, '.rs': `rustc "${file}" -o "${stem}.exe"; if ($LASTEXITCODE -eq 0) { .\\${stem}.exe }`,
            '.php': `php "${file}"`, '.rb': `ruby "${file}"`, '.sh': `bash "${file}"`,
            '.ps1': `powershell -ExecutionPolicy Bypass -File "${file}"`, '.cs': `dotnet run`, '.kt': `kotlinc "${file}" -include-runtime -d "${stem}.jar"; if ($LASTEXITCODE -eq 0) { java -jar "${stem}.jar" }`,
            '.swift': `swift "${file}"`
        };
        const command = commands[ext];
        return command ? { kind: 'command', cwd: dir, command, label: ext.slice(1).toUpperCase() } : { kind: 'error', error: `Run is not configured for ${ext || 'this file type'}. Open its project package.json or run its toolchain command in the local terminal.` };
    });

    ipcMain.handle('open-local-preview', async (_event, entryPath: string) => {
        const workspace = workspaceManager.getActiveWorkspace();
        if (!workspace || !isWithinWorkspace(workspace.rootPath, entryPath)) return { success: false, error: 'Preview must stay inside the active local workspace.' };
        const entry = await resolvePreviewEntry(path.resolve(entryPath), workspace.rootPath);
        if (!entry) return { success: false, error: 'No HTML entry point was found for this preview.' };
        const port = await startPreviewServer(workspace.rootPath);
        const relative = path.relative(workspace.rootPath, entry).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
        const url = `http://127.0.0.1:${port}/${relative}?t=${Date.now()}`;
        if (!previewWindow || previewWindow.isDestroyed()) {
            previewWindow = new BrowserWindow({ width: 1100, height: 780, title: 'KevRyn Local Preview', webPreferences: { nodeIntegration: false, contextIsolation: true } });
            previewWindow.on('closed', () => { previewWindow = null; });
        }
        await previewWindow.loadURL(url);
        previewWindow.show(); previewWindow.focus();
        return { success: true, url };
    });

    // Read-only agent context. The renderer/provider never receives an unrestricted
    // filesystem handle; every later tool is constrained by WorkspaceManager.
    ipcMain.handle('agent-workspace-context', async () => workspaceManager.getAgentContext());
    ipcMain.handle('agent-read-workspace-file', async (_event, relativePath: string) => workspaceManager.readAgentFile(relativePath));
    ipcMain.handle('agent-search-workspace', async (_event, query: string) => workspaceManager.searchAgentWorkspace(query));
    ipcMain.handle('agent-write-workspace-file', async (_event, relativePath: string, content: string) => {
        try {
            return { success: true, path: await workspaceManager.writeAgentFile(relativePath, content) };
        } catch (error: any) {
            return { success: false, error: error?.message || 'Could not write the requested workspace file.' };
        }
    });
    ipcMain.handle('agent-apply-workspace-actions', async (_event, actions: unknown) => {
        try {
            return { success: true, actions: await workspaceManager.applyAgentActions(actions) };
        } catch (error: any) {
            return { success: false, error: error?.message || 'Could not apply the workspace action plan.' };
        }
    });

    ipcMain.handle('save-workspace-path', async (event, workspacePath: string) => {
        const ctx = await workspaceManager.openFolder(workspacePath);
        return !!ctx;
    });

    // Strict local Lab Mode APIs.  These do not contact KevRyn's server and do
    // not reuse the personal workspace APIs below.  The only usable paths are
    // relative to a deterministic per-student, per-course lab root.
    ipcMain.handle('get-lab-workspace', async (_event, scope: LabWorkspaceScope) => {
        const root = labRootFor(scope || {});
        await fs.promises.mkdir(root, { recursive: true });
        return { root, name: path.basename(root) };
    });
    ipcMain.handle('lab-read-dir', async (_event, scope: LabWorkspaceScope) => {
        const root = labRootFor(scope || {});
        await fs.promises.mkdir(root, { recursive: true });
        const walk = async (directory: string, relative = '', depth = 0): Promise<any[]> => {
            if (depth > 8) return [];
            const entries = await fs.promises.readdir(directory, { withFileTypes: true });
            const nodes = await Promise.all(entries
                .filter(entry => !entry.name.startsWith('.') && !['node_modules', 'dist', 'build'].includes(entry.name))
                .map(async entry => {
                    const childRelative = relative ? path.posix.join(relative, entry.name) : entry.name;
                    const full = resolveLabPath(root, childRelative);
                    if (entry.isDirectory()) return { _id: childRelative, path: childRelative, name: entry.name, type: 'folder', children: await walk(full, childRelative, depth + 1) };
                    return { _id: childRelative, path: childRelative, name: entry.name, type: 'file' };
                }));
            return nodes.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1);
        };
        return walk(root);
    });
    ipcMain.handle('lab-read-file', async (_event, scope: LabWorkspaceScope, relativePath: string) => {
        const root = labRootFor(scope || {});
        const target = resolveLabPath(root, relativePath);
        const stat = await fs.promises.stat(target);
        if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Only text files up to 2 MB can be opened in Lab Mode.');
        return fs.promises.readFile(target, 'utf8');
    });
    ipcMain.handle('lab-write-file', async (_event, scope: LabWorkspaceScope, relativePath: string, content: string) => {
        if (typeof content !== 'string' || content.length > 2 * 1024 * 1024) throw new Error('Lab file content must be text and no larger than 2 MB.');
        const root = labRootFor(scope || {});
        const target = resolveLabPath(root, relativePath);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, content, 'utf8');
        return { success: true, path: relativePath };
    });
    ipcMain.handle('lab-create-item', async (_event, scope: LabWorkspaceScope, relativePath: string, type: 'file' | 'folder') => {
        const root = labRootFor(scope || {});
        const target = resolveLabPath(root, relativePath);
        if (type === 'folder') await fs.promises.mkdir(target, { recursive: true });
        else { await fs.promises.mkdir(path.dirname(target), { recursive: true }); await fs.promises.writeFile(target, '', { flag: 'wx' }); }
        return { success: true, path: relativePath };
    });
    ipcMain.handle('lab-rename-item', async (_event, scope: LabWorkspaceScope, from: string, to: string) => {
        const root = labRootFor(scope || {});
        const source = resolveLabPath(root, from); const target = resolveLabPath(root, to);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.rename(source, target);
        return { success: true, path: to };
    });
    ipcMain.handle('lab-delete-item', async (_event, scope: LabWorkspaceScope, relativePath: string) => {
        const root = labRootFor(scope || {});
        const target = resolveLabPath(root, relativePath);
        await fs.promises.rm(target, { recursive: true, force: true });
        return { success: true };
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
