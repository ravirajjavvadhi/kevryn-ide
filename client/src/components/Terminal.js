import React, { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const Terminal = ({ socket, termId, userId, webcontainer, onError }) => {
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const shellProcessRef = useRef(null);
    const terminalRef = useRef(null);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    // 1. UI INITIALIZATION (Run ONLY once on mount)
    useEffect(() => {
        if (xtermRef.current) return;

        console.log("[Terminal] Initializing persistent XTerm instance");
        const term = new XTerminal({
            cursorBlink: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#ffffff',
            },
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            allowTransparency: true,
            rows: 20,
            cols: 80,
            convertEol: true
        });

        const fitAddon = new FitAddon();
        fitAddonRef.current = fitAddon;
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        // First fit
        setTimeout(() => {
            try { fitAddon.fit(); } catch (e) { }
        }, 100);

        xtermRef.current = term;

        // Global access for AI and debugging
        if (!window.ideTerminals) window.ideTerminals = {};
        window.ideTerminals[termId] = term;

        window.getTerminalOutput = (id) => {
            const t = window.ideTerminals[id];
            if (!t) return "";
            const buffer = t.buffer.active;
            let lines = [];
            for (let i = Math.max(0, buffer.cursorY - 20); i <= buffer.cursorY; i++) {
                const line = buffer.getLine(i);
                if (line) lines.push(line.translateToString(true));
            }
            return lines.join('\n');
        };

        // Resize Handling
        const resizeObserver = new ResizeObserver(() => {
            if (fitAddonRef.current) {
                try { fitAddonRef.current.fit(); } catch (e) { }
            }
        });
        if (terminalRef.current) resizeObserver.observe(terminalRef.current);

        return () => {
            console.log("[Terminal] Disposing XTerm instance (Unmount)");
            if (window.ideTerminals) delete window.ideTerminals[termId];
            resizeObserver.disconnect();
            term.dispose();
            xtermRef.current = null;
        };
    }, [termId]); // termId is usually stable, but if it changes we reset.

    // 2. SHELL / LOGIC (Run when backend or instances change)
    useEffect(() => {
        const term = xtermRef.current;
        if (!term) return;

        let active = true;
        let inputWriter = null;

        const startShell = async () => {
            if (!webcontainer || !active) return;
            try {
                const shellProcess = await webcontainer.spawn('jsh', {
                    terminal: { cols: term.cols, rows: term.rows },
                });
                if (!active) { shellProcess.kill(); return; }
                shellProcessRef.current = shellProcess;

                shellProcess.output.pipeTo(
                    new WritableStream({
                        write(data) {
                            if (active) {
                                term.write(data);
                                if (socket) socket.emit('terminal:mirror', { termId, data });

                                // Error Heuristics
                                const errorPatterns = [/ReferenceError:/i, /TypeError:/i, /SyntaxError:/i, /npm ERR!/i, /Error:/i, /sh: .*: not found/i, /failed to compile/i];
                                if (errorPatterns.some(pattern => pattern.test(data)) && onErrorRef.current) {
                                    const now = Date.now();
                                    if (!window._lastErrorTime || now - window._lastErrorTime > 2000) {
                                        window._lastErrorTime = now;
                                        onErrorRef.current({ termId, output: data, lastCommand: "" });
                                    }
                                }
                            }
                        },
                    })
                );

                inputWriter = shellProcess.input.getWriter();
                if (!window.ideTerminalInputs) window.ideTerminalInputs = {};
                window.ideTerminalInputs[termId] = inputWriter;

                const onDataHandler = term.onData((data) => {
                    if (inputWriter) inputWriter.write(data);
                });

                const onResizeHandler = term.onResize((size) => {
                    if (shellProcess) shellProcess.resize(size);
                });

                console.log("[Terminal] WebContainer Shell Connected");

                return () => {
                    onDataHandler.dispose();
                    onResizeHandler.dispose();
                    if (window.ideTerminalInputs) delete window.ideTerminalInputs[termId];
                };
            } catch (err) {
                console.error("[Terminal] Shell Load Error:", err);
            }
        };

        const setupSocketFallback = () => {
            if (!socket || webcontainer || !active) return;

            const handleData = ({ termId: id, data }) => {
                if (id === termId && active) {
                    term.write(data);
                    term.scrollToBottom();
                }
            };

            socket.emit('terminal:create', { termId, userId });
            socket.on('terminal:data', handleData);

            const onDataHandler = term.onData((data) => {
                if (active) socket.emit('terminal:write', { termId, data });
            });

            console.log("[Terminal] Socket-based Terminal Connected");

            return () => {
                socket.emit('terminal:close', { termId });
                socket.off('terminal:data', handleData);
                onDataHandler.dispose();
            };
        };

        let cleanupLogic = null;
        if (webcontainer) {
            term.reset();
            term.write('\x1b[36m[Local Terminal: WebContainer Connected]\x1b[0m\r\n');
            startShell().then(cleanup => cleanupLogic = cleanup);
        } else if (socket) {
            term.reset();
            term.write('\x1b[35m[Server Terminal: PTY Connected]\x1b[0m\r\n');
            cleanupLogic = setupSocketFallback();
        }

        return () => {
            active = false;
            console.log("[Terminal] Cleaning up shell/socket logic");
            if (shellProcessRef.current) {
                shellProcessRef.current.kill();
                shellProcessRef.current = null;
            }
            if (cleanupLogic) cleanupLogic();
        };
    }, [socket, webcontainer, userId, termId]);

    return (
        <div
            ref={terminalRef}
            className="cyber-terminal"
            onClick={() => { if (xtermRef.current) xtermRef.current.focus(); }}
            style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
                overflow: 'hidden',
                padding: '10px'
            }}
        />
    );
}; // Fixed closing brace

export default React.memo(Terminal);