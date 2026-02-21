
/**
 * WebContainerBridge
 * 
 * Synchronizes files between the browser's WebContainer virtual FS
 * and the server's persistent storage (MongoDB + Disk).
 */
export class WebContainerBridge {
    constructor(webcontainer, socket, userId) {
        this.webcontainer = webcontainer;
        this.socket = socket;
        this.userId = userId;
        this.isSyncing = false;
    }

    /**
     * Mounts initial files into the WebContainer.
     * @param {Array} files - List of file objects from the DB.
     */
    async mountFiles(files) {
        console.log("[WebContainerBridge] Mounting initial files...");
        const fileTree = this.buildWebContainerFileTree(files);
        await this.webcontainer.mount(fileTree);
        console.log("[WebContainerBridge] Mount Complete");
    }

    /**
     * Converts flat DB file list into WebContainer's tree structure.
     */
    buildWebContainerFileTree(files) {
        const tree = {};
        const fileMap = new Map();

        // 1. Map all files for easy lookup
        files.forEach(f => fileMap.set(f._id.toString(), f));

        // 2. Recursive builder
        const addToTree = (file, currentLevel) => {
            if (file.type === 'folder') {
                currentLevel[file.name] = { directory: {} };
                const children = files.filter(f => f.parentId === file._id.toString());
                children.forEach(child => addToTree(child, currentLevel[file.name].directory));
            } else {
                currentLevel[file.name] = {
                    file: {
                        contents: file.content || "",
                    },
                };
            }
        };

        // 3. Start from root files
        const rootFiles = files.filter(f => !f.parentId || f.parentId === 'root');
        rootFiles.forEach(root => addToTree(root, tree));

        return tree;
    }

    /**
     * Starts watching for changes and syncing back to the server.
     */
    async startWatching(onFileChange) {
        // Since WebContainer API doesn't have a broad 'watch all' yet,
        // we rely on the editor triggering saves or we can poll.
        // For this IDE, we'll implement a 'saveFile' method that App.js calls.
    }

    /**
     * Internal helper to write a file to WebContainer FS.
     */
    async writeFile(filePath, content) {
        const parts = filePath.split('/');
        if (parts.length > 1) {
            let currentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
                currentPath += (currentPath ? '/' : '') + parts[i];
                try {
                    await this.webcontainer.fs.mkdir(currentPath, { recursive: true });
                } catch (e) {
                    // Directory might already exist
                }
            }
        }
        await this.webcontainer.fs.writeFile(filePath, content);
    }

    /**
     * Internal helper to read a file from WebContainer FS.
     */
    async readFile(filePath) {
        return await this.webcontainer.fs.readFile(filePath, 'utf-8');
    }
}
