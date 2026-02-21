import { WebContainer } from '@webcontainer/api';

/**
 * Singleton service to manage the WebContainer instance.
 */
class WebContainerService {
    constructor() {
        this.instance = null;
        this.bootPromise = null;
    }

    /**
     * Boot the WebContainer instance.
     * Guaranteed to only boot once.
     */
    async boot() {
        if (this.instance) return this.instance;
        if (this.bootPromise) return this.bootPromise;

        console.log('[WebContainer] Booting...');
        this.bootPromise = WebContainer.boot()
            .then(instance => {
                this.instance = instance;
                console.log('[WebContainer] Booted successfully.');
                return instance;
            })
            .catch(err => {
                console.error('[WebContainer] Boot failed:', err);
                this.bootPromise = null;
                throw err;
            });

        return this.bootPromise;
    }

    /**
     * Converts flat database file list to WebContainer FileSystemTree structure.
     */
    async mountFiles(fileData) {
        if (!this.instance) await this.boot();

        const tree = this._buildTree(fileData);
        await this.instance.mount(tree);
        console.log('[WebContainer] Files mounted.');
    }

    _buildTree(node) {
        const tree = {};

        if (!node || !node.children) return tree;

        node.children.forEach(child => {
            if (child.type === 'folder') {
                tree[child.name] = {
                    directory: this._buildTree(child)
                };
            } else {
                tree[child.name] = {
                    file: {
                        contents: child.content || ''
                    }
                };
            }
        });

        return tree;
    }

    /**
     * Writes a single file to the WebContainer filesystem.
     */
    async writeFile(filePath, content) {
        if (!this.instance) return;
        await this.instance.fs.writeFile(filePath, content);
    }

    /**
     * Starts a shell process.
     */
    async spawnShell(terminal, options = {}) {
        if (!this.instance) await this.boot();

        const shellProcess = await this.instance.spawn('jsh', {
            terminal: {
                cols: terminal.cols,
                rows: terminal.rows,
            }
        });

        shellProcess.output.pipeTo(
            new WritableStream({
                write(data) {
                    terminal.write(data);
                }
            })
        );

        const input = shellProcess.input.getWriter();

        return {
            input,
            process: shellProcess
        };
    }
}

export const webContainerService = new WebContainerService();
