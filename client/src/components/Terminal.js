import React, { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const Terminal = ({ socket, termId, userId, webcontainer, onError }) => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const shellProcessRef = useRef(null);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
        // 1. Initialize Xterm
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

        setTimeout(() => {
            try { fitAddon.fit(); } catch (e) { }
        }, 50);

        xtermRef.current = term;

        // --- GLOBAL ACCESS FOR AI ---
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

        const startShell = async () => {
            if (!webcontainer) return;

            try {
                // Spawn a jsh (bash-like shell)
                const shellProcess = await webcontainer.spawn('jsh', {
                    terminal: {
                        cols: term.cols,
                        rows: term.rows,
                    },
                });
                shellProcessRef.current = shellProcess;

                // Pipe shell output to Xterm and Mirror to Faculty
                shellProcess.output.pipeTo(
                    new WritableStream({
                        write(data) {
                            term.write(data);
                            // MIRRORING: Send output to faculty via socket
                            if (socket) {
                                socket.emit('terminal:mirror', { termId, data });
                            }

                            // Self-Healing Heuristic
                            const errorPatterns = [/ReferenceError:/i, /TypeError:/i, /SyntaxError:/i, /npm ERR!/i, /Error:/i, /sh: .*: not found/i, /failed to compile/i];
                            if (errorPatterns.some(pattern => pattern.test(data)) && onErrorRef.current) {
                                const now = Date.now();
                                if (!window._lastErrorTime || now - window._lastErrorTime > 2000) {
                                    window._lastErrorTime = now;
                                    onErrorRef.current({ termId, output: data, lastCommand: "" });
                                }
                            }
                        },
                    })
                );

                // Handle Input
                const input = shellProcess.input.getWriter();
                if (!window.ideTerminalInputs) window.ideTerminalInputs = {};
                window.ideTerminalInputs[termId] = input;

                term.onData((data) => {
                    input.write(data);
                });

                // Handle Resizing
                term.onResize((size) => {
                    shellProcess.resize(size);
                });

                console.log("[Terminal] WebContainer Shell Started");
            } catch (err) {
                console.error("[Terminal] Failed to start shell:", err);
                term.write('\r\n\x1b[31mFailed to boot WebContainer Shell. Check console.\x1b[0m\r\n');
            }
        };

        if (webcontainer) {
            startShell();
        } else if (socket) {
            // FALLBACK: Legacy Socket-based Terminal (Backward Compatibility)
            const handleData = ({ termId: id, data }) => {
                if (id === termId) {
                    term.write(data);
                    term.scrollToBottom();
                }
            };
            socket.emit('terminal:create', { termId, userId });
            socket.on('terminal:data', handleData);
            term.onData((data) => {
                socket.emit('terminal:write', { termId, data });
            });
            return () => {
                socket.emit('terminal:close', { termId });
                socket.off('terminal:data', handleData);
                term.dispose();
            };
        }

        let resizeTimeout;
        const resizeObserver = new ResizeObserver(() => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (fitAddonRef.current) {
                    try { fitAddonRef.current.fit(); } catch (e) { }
                }
            }, 16);
        });

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current);
        }

        return () => {
            if (shellProcessRef.current) shellProcessRef.current.kill();
            if (window.ideTerminals) delete window.ideTerminals[termId];
            if (window.ideTerminalInputs) delete window.ideTerminalInputs[termId];
            resizeObserver.disconnect();
            term.dispose();
        };
    }, [socket, termId, userId, webcontainer]);

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

export default Terminal;