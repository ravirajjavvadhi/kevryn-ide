/**
 * LanguageRuntime.js
 *
 * Manages Python and C/C++ execution runtimes inside the WebContainer.
 *
 * Strategy (in order of priority):
 *  1. Probe if `python3` is already available natively (newer WebContainers ship it)
 *  2. If not, install `python-wasm` npm package as fallback
 *  3. For C/C++: probe for `gcc`/`g++` natively
 *  4. If not found, set cmd to null (caller falls back to server PTY)
 *
 * This means on first use it may take up to 30s, but after that it's instant.
 */

export class LanguageRuntime {
    constructor(webcontainer) {
        this.wc = webcontainer;
        this.pythonCmd = null;  // resolved command string e.g. 'python3' or 'npx python-wasm'
        this.gccCmd = null;     // 'gcc' or null
        this.gppCmd = null;     // 'g++' or null
        this.isReady = false;
        this.setupPromise = null;
    }

    /**
     * Probes for a command by trying to spawn it with --version.
     * Returns true if the command is available.
     */
    async _probe(cmd) {
        try {
            const p = await this.wc.spawn(cmd, ['--version']);
            const code = await p.exit;
            return code === 0;
        } catch {
            return false;
        }
    }

    /**
     * One-time setup: detect available runtimes, install if missing.
     */
    async setup(onLog) {
        if (this.isReady) return;
        if (this.setupPromise) return this.setupPromise;

        this.setupPromise = (async () => {
            const log = onLog || console.log;
            log('[LanguageRuntime] Probing for available runtimes...');

            // --- PYTHON PROBE ---
            if (await this._probe('python3')) {
                this.pythonCmd = 'python3';
                log('[LanguageRuntime] ✅ Native python3 found');
            } else if (await this._probe('python')) {
                this.pythonCmd = 'python';
                log('[LanguageRuntime] ✅ Native python found');
            } else {
                // Fall back to installing python-wasm
                log('[LanguageRuntime] python3 not found. Installing python-wasm (~30s first time)...');
                try {
                    await this._installPackage('python-wasm', log);
                    this.pythonCmd = 'npx --yes python-wasm';
                    log('[LanguageRuntime] ✅ python-wasm installed');
                } catch (e) {
                    log('[LanguageRuntime] ⚠️ python-wasm install failed: ' + e.message);
                    this.pythonCmd = null;
                }
            }

            // --- C/C++ PROBE ---
            if (await this._probe('gcc')) {
                this.gccCmd = 'gcc';
                log('[LanguageRuntime] ✅ Native gcc found');
            } else {
                log('[LanguageRuntime] ℹ️ gcc not found in WebContainer (C falls back to server PTY)');
                this.gccCmd = null;
            }

            if (await this._probe('g++')) {
                this.gppCmd = 'g++';
                log('[LanguageRuntime] ✅ Native g++ found');
            } else {
                this.gppCmd = null;
            }

            this.isReady = true;
            log('[LanguageRuntime] Setup complete.');
        })();

        return this.setupPromise;
    }

    /**
     * Installs an npm package inside the WebContainer.
     */
    async _installPackage(pkgName, log) {
        // Write minimal package.json if missing
        try {
            await this.wc.fs.readFile('/package.json', 'utf-8');
        } catch {
            await this.wc.fs.writeFile('/package.json', JSON.stringify({
                name: 'kevryn-runtime', version: '1.0.0', dependencies: {}
            }, null, 2));
        }

        const installProc = await this.wc.spawn('npm', ['install', pkgName, '--prefer-offline']);
        installProc.output.pipeTo(new WritableStream({
            write(data) { if (log) log('[npm] ' + data.trim()); }
        }));
        const code = await installProc.exit;
        if (code !== 0) throw new Error(`npm install ${pkgName} failed (exit ${code})`);
    }

    /**
     * Returns the terminal command string (to write into the xterm input) to run a file.
     *
     * @param {string} filePath - e.g. 'main.py' or 'src/hello.c'
     * @returns {{ terminal: string, isBrowser: boolean, label: string } | null}
     */
    getRunCommand(filePath) {
        if (!filePath) return null;
        const ext = filePath.split('.').pop().toLowerCase();
        const fileNameNoExt = filePath.split('/').pop().replace(/\.[^.]+$/, '');

        if (ext === 'py') {
            if (!this.pythonCmd) return null; // caller falls back to server
            return {
                terminal: `${this.pythonCmd} "${filePath}" 2>&1`,
                isBrowser: true,
                label: '🐍 Python (Browser)',
            };
        }

        if (ext === 'c') {
            if (!this.gccCmd) return null;
            return {
                terminal: `gcc "${filePath}" -o /tmp/${fileNameNoExt}_out && /tmp/${fileNameNoExt}_out`,
                isBrowser: true,
                label: '⚙️ C (Browser)',
            };
        }

        if (ext === 'cpp') {
            if (!this.gppCmd) return null;
            return {
                terminal: `g++ "${filePath}" -o /tmp/${fileNameNoExt}_out && /tmp/${fileNameNoExt}_out`,
                isBrowser: true,
                label: '⚙️ C++ (Browser)',
            };
        }

        return null;
    }

    /** Returns true if the runtime is ready and can run the given extension. */
    canRun(ext) {
        if (ext === 'py') return !!this.pythonCmd;
        if (ext === 'c') return !!this.gccCmd;
        if (ext === 'cpp') return !!this.gppCmd;
        return false;
    }
}
