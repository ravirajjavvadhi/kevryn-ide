let lastDispatchedCommand = '';
let lastDispatchAt = 0;

export class DesktopExecution {
    async run(options) {
        console.log(`[DesktopExecution] Executing locally via KevRyn Native Runtime: ${options.fileName}`);
        
        if (!window.electronAPI) return;

        options.socketRef.current?.emit('run_start', { language: options.language });

        // Electron owns the PTY working directory.  Sending a bare command
        // keeps the terminal readable and preserves interactive stdin for
        // scanf/cin/input without echoing a Set-Location wrapper on every run.
        const cmdString = `${options.cwd || ''}\u0000${options.cmd}`;
        const now = Date.now();
        // A double click, keyboard shortcut overlap, or a React event replay
        // must never put the same command into the PTY twice.
        if (cmdString === lastDispatchedCommand && now - lastDispatchAt < 1000) return;
        lastDispatchedCommand = cmdString;
        lastDispatchAt = now;
        const result = window.electronAPI.runLocalCommand
            ? await window.electronAPI.runLocalCommand(options.cwd, options.cmd)
            : await window.electronAPI.terminalWrite(`${options.cmd}\r`);
        if (result && result.success === false) {
            throw new Error(result.error || 'The local terminal could not start this command.');
        }
        
        // Immediately emit run_end since the terminal handles the lifecycle interactively
        setTimeout(() => {
            options.socketRef.current?.emit('run_end', { code: 0 });
        }, 1000);
    }
}
