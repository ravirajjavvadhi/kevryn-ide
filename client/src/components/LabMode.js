import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FaTerminal, FaClock, FaLock, FaExclamationTriangle, FaFile, FaPlus, FaSave, FaPlay, FaSignOutAlt, FaTimes } from 'react-icons/fa';
import Editor from '@monaco-editor/react';
import Terminal from './Terminal';
import io from 'socket.io-client';
import axios from 'axios';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

const LabMode = ({ session, username, userId, token, theme, onLogout }) => {
    const [timeLeft, setTimeLeft] = useState(null);
    const [files, setFiles] = useState([]);
    const [activeFile, setActiveFile] = useState(null);
    const [code, setCode] = useState('// Select or create a file to start coding...');
    const [language, setLanguage] = useState('javascript');
    const [newFileName, setNewFileName] = useState('');
    const [showNewFile, setShowNewFile] = useState(false);
    const [saving, setSaving] = useState(false);
    const socketRef = useRef(null);
    const codeRef = useRef(code);
    const activeFileRef = useRef(activeFile);

    // NEW: Beast Monitoring State
    const [tabSwitches, setTabSwitches] = useState(0);
    const [pastes, setPastes] = useState(0);
    const [handRaised, setHandRaised] = useState(false);
    const [announcement, setAnnouncement] = useState(null);
    const [lastSynced, setLastSynced] = useState(null); // NEW: Visual feedback

    const tabCountRef = useRef(0);
    const pasteCountRef = useRef(0);

    // Keep refs in sync
    useEffect(() => { codeRef.current = code; }, [code]);
    useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

    const api = useMemo(() => axios.create({
        baseURL: SERVER_URL,
        headers: { Authorization: token }
    }), [token]);

    // --- Timer ---
    useEffect(() => {
        if (!session?.startTime) return;

        const updateTimer = () => {
            const now = Date.now();
            const start = new Date(session.startTime).getTime();

            if (session.duration) {
                // Global Countdown based on startTime + duration
                const totalSeconds = session.duration * 60;
                const elapsedSeconds = Math.floor((now - start) / 1000);
                const remaining = totalSeconds - elapsedSeconds;

                if (remaining <= 0) {
                    setTimeLeft("SESSION ENDED");
                    return;
                }

                const h = Math.floor(remaining / 3600);
                const m = Math.floor((remaining % 3600) / 60);
                const s = remaining % 60;
                setTimeLeft(`${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else if (session.endTime) {
                // Legacy Countdown
                const end = new Date(session.endTime).getTime();
                const diff = end - now;
                if (diff <= 0) {
                    setTimeLeft("00:00:00");
                    return;
                }
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            } else {
                // Count UP (Elapsed)
                const diff = now - start;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            }
        };


        const timer = setInterval(updateTimer, 1000);
        updateTimer(); // Initial call
        return () => clearInterval(timer);
    }, [session]);

    // --- Socket Connection ---
    useEffect(() => {
        const query = {};
        if (session && session.courseId) query.courseId = session.courseId;

        const sock = io(SERVER_URL, { query });
        socketRef.current = sock;

        sock.on('connect', () => {
            console.log('[LabMode] Socket connected. ID:', sock.id);
            // Identify this student to the server for monitoring
            if ((session?.sessionId || session?._id) && username) {
                console.log('[LabMode] Joining lab with ID:', session.sessionId || session._id);
                sock.emit('student-join-lab', {
                    sessionId: session.sessionId || session._id,
                    username: username,
                    userId: userId,
                    initialData: {
                        code: codeRef.current,
                        activeFile: activeFileRef.current?.name,
                        language: language || 'javascript'
                    }
                });
            } else {
                console.error('[LabMode] Missing session ID or username', { session, username });
            }
        });

        sock.on('disconnect', (reason) => {
            console.warn("[LabMode] Socket disconnected:", reason);
        });

        sock.on('session-ended', ({ sessionId } = {}) => {
            const mySessionId = session?.sessionId || session?._id;
            if (!sessionId || sessionId === mySessionId) {
                // App.js handles the global state cleanup and alert
                onLogout();
            }
        });

        // NEW: Sync behavioral counts back from server (persistence)
        sock.on('lab-student-sync', (data) => {
            if (data) {
                if (data.tabSwitchCount !== undefined) {
                    tabCountRef.current = data.tabSwitchCount;
                    setTabSwitches(data.tabSwitchCount);
                }
                if (data.pasteCount !== undefined) {
                    pasteCountRef.current = data.pasteCount;
                    setPastes(data.pasteCount);
                }
            }
        });

        // NEW: BEAST LISTENERS
        sock.on('faculty-announcement', ({ message }) => {
            setAnnouncement(message);
            // Auto-clear after 10s if student doesn't dismiss
            setTimeout(() => setAnnouncement(null), 10000);
        });

        sock.on('faculty-acknowledge', () => {
            setHandRaised(false);
        });

        return () => {
            console.log("[LabMode] Unmounting/Disconnecting socket");
            if (sock && (session?.sessionId || session?._id)) {
                sock.emit('student-leave-lab', {
                    sessionId: session.sessionId || session._id,
                    username
                });
            }
            sock.disconnect();
        };
    }, [session?.sessionId, session?._id, username, userId, language, onLogout]); // Stable dependencies


    // --- Load Files ---
    useEffect(() => {
        if (token) loadFiles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const loadFiles = useCallback(async () => {
        try {
            // NEW: Fetch files filtered by lab courseId if present
            const url = session?.courseId ? `/files?courseId=${session.courseId}` : '/files';
            const res = await api.get(url);
            setFiles(res.data || []);
        } catch (e) { console.error("Failed to load files:", e); }
    }, [api, session]); // Added api, session

    // --- Heartbeat & Status ---
    useEffect(() => {
        if ((!session?.sessionId && !session?._id) || !username) return;

        const sendHeartbeat = async (statusOverride) => {
            const status = statusOverride || (document.hasFocus() ? 'active' : 'idle');
            // console.log("[LabMode] Sending heartbeat:", status);
            try {
                await fetch(`${SERVER_URL}/lab/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: session.sessionId || session._id,
                        username,
                        status,
                        activeFile: activeFileRef.current?.name || null,
                        code: codeRef.current || ''
                    })
                });
            } catch (e) { console.error("Heartbeat failed", e); }
        };

        const interval = setInterval(() => sendHeartbeat(), 5000); // 5s for better responsiveness
        sendHeartbeat(); // Immediate

        const onFocus = () => sendHeartbeat('active');
        const onBlur = () => sendHeartbeat('idle');
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);

        // NEW: Tab Switch Tracking
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                tabCountRef.current += 1;
                setTabSwitches(tabCountRef.current);
                const sId = session.sessionId || session._id;
                if (socketRef.current) {
                    socketRef.current.emit('student-tab-switch', {
                        sessionId: sId,
                        username,
                        direction: 'left',
                        switchCount: tabCountRef.current
                    });
                }
            } else {
                const sId = session.sessionId || session._id;
                if (socketRef.current) {
                    socketRef.current.emit('student-tab-switch', {
                        sessionId: sId,
                        username,
                        direction: 'returned',
                        switchCount: tabCountRef.current
                    });
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // NEW: Paste Tracking
        const handlePaste = (e) => {
            const text = e.clipboardData?.getData('text') || "";
            pasteCountRef.current += 1;
            setPastes(pasteCountRef.current);
            const sId = session.sessionId || session._id;
            if (socketRef.current) {
                socketRef.current.emit('student-paste', {
                    sessionId: sId,
                    username,
                    charCount: text.length,
                    pasteCount: pasteCountRef.current
                });
            }
        };
        document.addEventListener('paste', handlePaste);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('paste', handlePaste);
        };
    }, [session, username]);

    // --- Emit code updates to server (for faculty real-time view) ---
    const emitCodeUpdate = useCallback(() => {
        if (socketRef.current && (session?.sessionId || session?._id) && username) {
            socketRef.current.emit('student-code-update', {
                sessionId: session.sessionId || session._id,
                username,
                fileName: activeFileRef.current?.name || 'untitled',
                code: codeRef.current || '',
                language
            });
            setLastSynced(new Date().toLocaleTimeString());
        }
    }, [session?.sessionId, session?._id, username, language]);


    // Debounced code change handler
    const codeChangeTimeoutRef = useRef(null);
    const handleCodeChange = (newValue) => {
        setCode(newValue || '');
        // Debounce emit to avoid flooding
        if (codeChangeTimeoutRef.current) clearTimeout(codeChangeTimeoutRef.current);
        codeChangeTimeoutRef.current = setTimeout(() => emitCodeUpdate(), 100); // 100ms for "Instant" feel
    };


    // --- Language Detection ---
    const detectLanguage = (filename) => {
        if (!filename) return 'javascript';
        const ext = filename.split('.').pop().toLowerCase();
        const map = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'py': 'python', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'cs': 'csharp',
            'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown',
            'rb': 'ruby', 'go': 'go', 'rs': 'rust', 'php': 'php', 'sql': 'sql',
            'sh': 'shell', 'bash': 'shell', 'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml'
        };
        return map[ext] || 'plaintext';
    };

    // --- Get run command based on file type ---
    const getRunCommand = (filename) => {
        if (!filename) return null;
        const ext = filename.split('.').pop().toLowerCase();
        const commands = {
            'js': `node ${filename}`,
            'py': `python ${filename}`,
            'java': `javac ${filename} && java ${filename.replace('.java', '')}`,
            'c': `gcc ${filename} -o output && ./output`,
            'cpp': `g++ ${filename} -o output && ./output`,
            'rb': `ruby ${filename}`,
            'go': `go run ${filename}`,
            'php': `php ${filename}`,
            'sh': `bash ${filename}`,
            'bash': `bash ${filename}`,
            'ts': `npx ts-node ${filename}`,
        };
        return commands[ext] || null;
    };

    // --- File Operations ---
    const handleFileClick = (file) => {
        setActiveFile(file);
        setCode(file.content || '');
        setLanguage(detectLanguage(file.name));
        // Immediate sync to faculty
        setTimeout(() => emitCodeUpdate(), 50);
    };

    const handleCreateFile = async () => {
        const name = newFileName.trim();
        if (!name) return;
        try {
            const res = await api.post('/files', {
                name,
                content: '',
                courseId: session?.courseId // Tag file with course context
            });
            setFiles(prev => [...prev, res.data]);
            setActiveFile(res.data);
            setCode('');
            setLanguage(detectLanguage(name));
        } catch (e) {
            alert("Failed to create file: " + (e.response?.data?.error || e.message));
        }
        setNewFileName('');
        setShowNewFile(false);
    };

    const handleSave = useCallback(async () => {
        if (!activeFile) return;
        setSaving(true);
        try {
            await api.put(`/files/${activeFile._id}`, { content: code });
            setFiles(prev => prev.map(f => f._id === activeFile._id ? { ...f, content: code } : f));
            // Also emit to faculty
            emitCodeUpdate();
        } catch (e) { console.error("Save failed", e); }
        setSaving(false);
    }, [activeFile, code, emitCodeUpdate, api]); // Added api

    // --- Run File ---
    const handleRun = useCallback(() => {
        if (!activeFile || !socketRef.current) return;
        const cmd = getRunCommand(activeFile.name);
        if (!cmd) { alert("No run command for this file type"); return; }
        // Save first, then send the run command to the terminal
        handleSave().then(() => {
            socketRef.current.emit('terminal:write', {
                termId: 1,
                data: cmd + '\r',
                courseId: session?.courseId // Ensure terminal respects lab cwd if possible
            });
        });
    }, [activeFile, handleSave, session]); // Added session

    // --- Keyboard Shortcut: Ctrl+S ---
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleSave]);

    // --- Logout Handler ---
    const handleLogout = () => {
        if (socketRef.current && (session?.sessionId || session?._id) && username) {
            socketRef.current.emit('student-leave-lab', {
                sessionId: session.sessionId || session._id,
                username,
                userId
            });
        }
        // Small delay to ensure socket packet is sent before unmount/reload
        setTimeout(() => {
            onLogout();
        }, 100);
    };

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* --- TOP BAR --- */}
            <div style={{ height: '50px', background: '#1e0000', borderBottom: '2px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', color: '#fecaca' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaLock />
                    <span style={{ fontWeight: 'bold' }}>LAB MODE: {session?.sessionName || "Active Exam"}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Run Button */}
                    <button
                        onClick={handleRun}
                        disabled={!activeFile}
                        style={{
                            background: activeFile ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(74, 222, 128, 0.3)',
                            color: activeFile ? '#4ade80' : '#64748b',
                            padding: '6px 14px', borderRadius: '6px', cursor: activeFile ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold'
                        }}
                    >
                        <FaPlay size={10} /> Run
                    </button>
                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={!activeFile || saving}
                        style={{
                            background: activeFile ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: activeFile ? '#60a5fa' : '#64748b',
                            padding: '6px 14px', borderRadius: '6px', cursor: activeFile ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px'
                        }}
                    >
                        <FaSave /> {saving ? 'Saving...' : 'Save'}
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '5px 10px', borderRadius: '4px' }}>
                            <FaClock />
                            <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '16px' }}>{timeLeft || (session?.startTime ? "Connecting..." : "--:--:--")}</span>
                        </div>
                        {lastSynced && <div style={{ fontSize: '9px', color: '#4ade80', marginTop: '2px', opacity: 0.8 }}>Last Sync: {lastSynced}</div>}
                    </div>


                    {/* NEW: Raise Hand Button */}
                    <button
                        onClick={() => {
                            if (!handRaised) {
                                socketRef.current.emit('student-raise-hand', { sessionId: session.sessionId || session._id, username });
                                setHandRaised(true);
                            }
                        }}
                        style={{
                            background: handRaised ? '#ef4444' : 'rgba(255,255,255,0.1)',
                            border: `1px solid ${handRaised ? '#ef4444' : '#475569'}`,
                            color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 'bold'
                        }}
                    >
                        ✋ {handRaised ? 'Hand Raised' : 'Raise Hand'}
                    </button>

                    {/* Logout Button */}
                    <button
                        onClick={() => { if (window.confirm("Are you sure you want to exit the lab session?")) handleLogout(); }}
                        style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px'
                        }}
                    >
                        <FaSignOutAlt /> Exit
                    </button>
                </div>
            </div>

            {/* NEW: Faculty Announcement Overlay */}
            {announcement && (
                <div style={{
                    position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)',
                    zIndex: 2000, background: 'linear-gradient(135deg, #1e0000, #450a0a)',
                    border: '2px solid #ef4444', padding: '15px 30px', borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.8)', color: '#fff',
                    display: 'flex', alignItems: 'center', gap: '20px', minWidth: '400px'
                }}>
                    <div style={{ fontSize: '24px' }}>📢</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#fca5a5', textTransform: 'uppercase', marginBottom: '4px' }}>Faculty Announcement</div>
                        <div style={{ fontSize: '16px', fontWeight: '600' }}>{announcement}</div>
                    </div>
                    <button onClick={() => setAnnouncement(null)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                        <FaTimes />
                    </button>
                </div>
            )}

            {/* --- MAIN CONTENT --- */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* File Tree */}
                <div style={{ width: '220px', background: '#020617', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '10px', fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Project Files</span>
                        <button onClick={() => setShowNewFile(!showNewFile)} style={{ background: 'transparent', border: 'none', color: '#4ade80', cursor: 'pointer', padding: '2px' }} title="New File">
                            <FaPlus size={11} />
                        </button>
                    </div>
                    {showNewFile && (
                        <div style={{ padding: '5px 10px' }}>
                            <input type="text" placeholder="filename.js" value={newFileName}
                                onChange={e => setNewFileName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateFile(); if (e.key === 'Escape') setShowNewFile(false); }}
                                autoFocus
                                style={{ width: '100%', padding: '5px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: 'white', fontSize: '12px', outline: 'none' }}
                            />
                        </div>
                    )}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {files.length === 0 ? (
                            <div style={{ padding: '15px 10px', color: '#475569', fontSize: '12px', textAlign: 'center' }}>No files yet. Click + to create.</div>
                        ) : files.map(f => (
                            <div key={f._id} onClick={() => handleFileClick(f)}
                                style={{
                                    padding: '7px 12px', cursor: 'pointer',
                                    background: activeFile?._id === f._id ? 'rgba(59,130,246,0.15)' : 'transparent',
                                    borderLeft: activeFile?._id === f._id ? '3px solid #3b82f6' : '3px solid transparent',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    fontSize: '13px', color: activeFile?._id === f._id ? '#e2e8f0' : '#94a3b8'
                                }}>
                                <FaFile size={10} color={activeFile?._id === f._id ? '#60a5fa' : '#475569'} />
                                {f.name}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Editor + Terminal */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {activeFile && (
                        <div style={{ height: '32px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', padding: '0 15px', gap: '8px' }}>
                            <FaFile size={10} color="#60a5fa" />
                            <span style={{ fontSize: '12px', color: '#e2e8f0' }}>{activeFile.name}</span>
                        </div>
                    )}
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <Editor height="100%" language={language} value={code}
                            theme={theme === 'light' ? 'light' : 'vs-dark'}
                            onChange={handleCodeChange}
                            options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on' }}
                        />
                    </div>
                    <div style={{ height: '250px', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <div style={{ padding: '5px 10px', background: '#1e293b', fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <FaTerminal size={10} /> Terminal
                        </div>
                        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                            {socketRef.current && userId ? (
                                <Terminal socket={socketRef.current} termId={1} userId={userId} webcontainer={session?.webcontainer} />
                            ) : (
                                <div style={{ padding: '15px', color: '#64748b', fontSize: '13px' }}>Connecting terminal...</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Warning Footer */}
            <div style={{ padding: '5px', background: '#450a0a', color: '#fca5a5', textAlign: 'center', fontSize: '11px' }}>
                <FaExclamationTriangle style={{ marginRight: '5px' }} />
                Your activity, code, and screen are being monitored by the faculty. Do not leave this window.
            </div>
        </div>
    );
};

export default LabMode;
