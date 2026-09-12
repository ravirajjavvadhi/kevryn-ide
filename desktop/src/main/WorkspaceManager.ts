import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import * as chokidar from 'chokidar';

export interface WorkspaceContext {
    workspaceId: string;
    rootPath: string;
    name: string;
}

export class WorkspaceManager {
    private activeWorkspace: WorkspaceContext | null = null;
    private watcher: chokidar.FSWatcher | null = null;
    private mainWindow: BrowserWindow;
    private userDataPath: string;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.userDataPath = app.getPath('userData');
    }

    private generateWorkspaceId(rootPath: string): string {
        return crypto.createHash('sha256').update(rootPath).digest('hex').substring(0, 16);
    }

    public async openFolder(targetPath: string): Promise<WorkspaceContext | null> {
        try {
            const stat = await fs.promises.stat(targetPath);
            if (!stat.isDirectory()) {
                throw new Error("Target is not a directory");
            }

            // Close existing workspace properly
            this.closeWorkspace();

            const workspaceId = this.generateWorkspaceId(targetPath);
            this.activeWorkspace = {
                workspaceId,
                rootPath: targetPath,
                name: path.basename(targetPath)
            };

            // Setup watcher for this workspace
            this.setupWatcher(targetPath);

            // Persist the active workspace
            await this.saveGlobalState(targetPath);

            return this.activeWorkspace;
        } catch (e) {
            console.error("Failed to open workspace folder", e);
            return null;
        }
    }

    public closeWorkspace() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        this.activeWorkspace = null;
    }

    private setupWatcher(rootPath: string) {
        this.watcher = chokidar.watch(rootPath, {
            ignored: [/(^|[\/\\])\../, /node_modules/, /dist/], // Ignore hidden, node_modules, dist by default
            persistent: true,
            ignoreInitial: true,
            depth: 99
        });

        this.watcher
            .on('add', (filePath) => this.notifyEvent('file-added', filePath))
            .on('change', (filePath) => this.notifyEvent('file-changed', filePath))
            .on('unlink', (filePath) => this.notifyEvent('file-deleted', filePath))
            .on('addDir', (dirPath) => this.notifyEvent('dir-added', dirPath))
            .on('unlinkDir', (dirPath) => this.notifyEvent('dir-deleted', dirPath));
    }

    private notifyEvent(event: string, itemPath: string) {
        if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('workspace-event', { event, itemPath });
        }
    }

    public getActiveWorkspace(): WorkspaceContext | null {
        return this.activeWorkspace;
    }

    private resolveAgentPath(relativePath: string): string {
        if (!this.activeWorkspace) throw new Error('No workspace is open.');
        const root = path.resolve(this.activeWorkspace.rootPath);
        const target = path.resolve(root, relativePath || '.');
        if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Workspace boundary violation.');
        return target;
    }

    public async getAgentContext() {
        if (!this.activeWorkspace) return null;
        const files: string[] = [];
        const collect = async (dir: string, depth: number): Promise<void> => {
            if (depth > 2 || files.length >= 120) return;
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(entry.name)) continue;
                const full = path.join(dir, entry.name);
                const rel = path.relative(this.activeWorkspace!.rootPath, full).replace(/\\/g, '/');
                if (entry.isDirectory()) await collect(full, depth + 1); else files.push(rel);
            }
        };
        await collect(this.activeWorkspace.rootPath, 0);
        return { name: this.activeWorkspace.name, files };
    }

    public async readAgentFile(relativePath: string): Promise<string> {
        const target = this.resolveAgentPath(relativePath);
        const stat = await fs.promises.stat(target);
        if (!stat.isFile()) throw new Error('Agent can only read workspace files.');
        if (stat.size > 512 * 1024) throw new Error('File is too large to include in agent context.');
        return fs.promises.readFile(target, 'utf8');
    }

    // Agent writes are constrained to the active workspace and are called only
    // after the renderer has matched an explicit user request to a workspace
    // file. This is intentionally separate from the general file APIs.
    public async writeAgentFile(relativePath: string, content: string): Promise<string> {
        if (typeof content !== 'string' || content.length > 1024 * 1024) {
            throw new Error('Agent file content must be text and no larger than 1 MB.');
        }
        const target = this.resolveAgentPath(relativePath);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, content, 'utf8');
        this.notifyEvent('file-changed', target);
        return target;
    }

    public async applyAgentActions(actions: unknown): Promise<Array<{ type: string; path?: string; from?: string; command?: string }>> {
        if (!Array.isArray(actions) || actions.length === 0 || actions.length > 30) {
            throw new Error('An agent plan must contain between 1 and 30 workspace actions.');
        }
        const results: Array<{ type: string; path?: string; from?: string; command?: string }> = [];
        let totalContent = 0;
        for (const rawAction of actions) {
            const action = rawAction as { type?: string; path?: string; from?: string; content?: string; command?: string };
            if (!action?.type) throw new Error('Every agent action needs a type.');
            if (action.type === 'mkdir') {
                if (!action.path) throw new Error('Folder creation needs a workspace-relative path.');
                const target = this.resolveAgentPath(action.path);
                await fs.promises.mkdir(target, { recursive: true });
                this.notifyEvent('dir-added', target);
                results.push({ type: 'mkdir', path: action.path });
            } else if (action.type === 'write') {
                if (!action.path || typeof action.content !== 'string') throw new Error('File writing needs a path and text content.');
                totalContent += action.content.length;
                if (action.content.length > 1024 * 1024 || totalContent > 2 * 1024 * 1024) throw new Error('The agent plan is too large to apply safely.');
                const target = this.resolveAgentPath(action.path);
                await fs.promises.mkdir(path.dirname(target), { recursive: true });
                await fs.promises.writeFile(target, action.content, 'utf8');
                this.notifyEvent('file-changed', target);
                results.push({ type: 'write', path: action.path });
            } else if (action.type === 'rename') {
                if (!action.from || !action.path) throw new Error('Rename needs both from and path.');
                const from = this.resolveAgentPath(action.from);
                const target = this.resolveAgentPath(action.path);
                await fs.promises.mkdir(path.dirname(target), { recursive: true });
                await fs.promises.rename(from, target);
                this.notifyEvent('file-deleted', from);
                this.notifyEvent('file-added', target);
                results.push({ type: 'rename', from: action.from, path: action.path });
            } else if (action.type === 'run') {
                if (typeof action.command !== 'string' || !action.command.trim() || action.command.length > 1000) throw new Error('Run actions need a short terminal command.');
                results.push({ type: 'run', command: action.command.trim() });
            } else {
                throw new Error(`Unsupported agent action: ${action.type}.`);
            }
        }
        return results;
    }

    public async searchAgentWorkspace(query: string): Promise<Array<{ path: string; line: number; text: string }>> {
        const context = await this.getAgentContext();
        if (!context || !query.trim()) return [];
        const needle = query.toLowerCase();
        const results: Array<{ path: string; line: number; text: string }> = [];
        for (const relativePath of context.files) {
            if (results.length >= 50) break;
            if (relativePath.toLowerCase().includes(needle)) results.push({ path: relativePath, line: 0, text: 'Filename match' });
            if (results.length >= 50) break;
            try {
                const content = await this.readAgentFile(relativePath);
                // Ignore binary data and cap the scan per file so a workspace search
                // remains responsive and never leaks an entire large file into context.
                if (content.includes('\0')) continue;
                const lines = content.slice(0, 128 * 1024).split(/\r?\n/);
                for (let index = 0; index < lines.length && results.length < 50; index += 1) {
                    if (lines[index].toLowerCase().includes(needle)) {
                        results.push({ path: relativePath, line: index + 1, text: lines[index].trim().slice(0, 240) });
                    }
                }
            } catch (_) {
                // An unreadable or binary workspace item should not stop a search.
            }
        }
        return results;
    }

    public async readDirectory(dirPath: string) {
        if (!this.activeWorkspace) throw new Error("No active workspace");
        if (!dirPath.startsWith(this.activeWorkspace.rootPath)) {
            throw new Error("Path traversal violation");
        }

        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        const nodes = entries.map(entry => {
            const fullPath = path.join(dirPath, entry.name);
            return {
                _id: fullPath,
                name: entry.name,
                type: entry.isDirectory() ? 'folder' : 'file'
            };
        });

        // Sort: folders first, then files
        return nodes.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });
    }

    private async saveGlobalState(workspacePath: string) {
        const configPath = path.join(this.userDataPath, 'kevryn_workspace.json');
        await fs.promises.writeFile(configPath, JSON.stringify({ workspacePath }), 'utf-8');
    }
}
