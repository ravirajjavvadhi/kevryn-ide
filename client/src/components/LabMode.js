import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FaTerminal, FaClock, FaLock, FaExclamationTriangle, FaFile, FaPlus, FaSave, FaPlay, FaSignOutAlt, FaTimes, FaEdit, FaTrash, FaCheck } from 'react-icons/fa';
import Editor from '@monaco-editor/react';
import Terminal from './Terminal';
import io from 'socket.io-client';
import axios from 'axios';
import { WebContainerBridge } from '../services/WebContainerBridge';

const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_URL = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const LabMode = ({ session, username, userId, token, theme, webcontainer, onLogout }) => {
    const [timeLeft, setTimeLeft] = useState(null);
    const [files, setFiles] = useState([]);
    const [activeFile, setActiveFile] = useState(null);
    const [code, setCode] = useState('// Select or create a file to start coding...');
    const [language, setLanguage] = useState('javascript');
    const [newFileName, setNewFileName] = useState('');
    const [showNewFile, setShowNewFile] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingFileId, setEditingFileId] = useState(null);
    const [tempFileName, setTempFileName] = useState('');
    const socketRef = useRef(null);
    const codeRef = useRef(code);
    const activeFileRef = useRef(activeFile);

    // NEW: Beast Monitoring State
    const [tabSwitches, setTabSwitches] = useState(0);
    const [pastes, setPastes] = useState(0);
    const [handRaised, setHandRaised] = useState(false);
    const [announcement, setAnnouncement] = useState(null);
    const [lastSynced, setLastSynced] = useState(null); // NEW: Visual feedback
    const wcBridgeRef = useRef(null);

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

                // NEW: Initialize server-side terminal for the student
                sock.emit('terminal:create', { termId: 1, userId });
            } else {
                console.error('[LabMode] Missing session ID or username', { session, username });
            }
        });

        sock.on('disconnect', (reason) => {
            console.warn("[LabMode] Socket disconnected:", reason);
        });

        sock.on('session-ended', ({ sessionId } = {}) => {
            const mySessionId = session?.sessionId || session?._id;
            console.log(`[DIAGNOSTIC] LabMode received session-ended for ${sessionId}. MySession=${mySessionId}`);
            if (!sessionId || sessionId === mySessionId) {
                console.log(`[DIAGNOSTIC] Triggering onLogout due to session-ended`);
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
    }, [session?.sessionId, session?._id, username, userId, onLogout]); // Stable dependencies (No 'language'!)


    // --- Load Files ---
    useEffect(() => {
        if (token) loadFiles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // NEW: Initialize WebContainerBridge when webcontainer is available
    useEffect(() => {
        if (webcontainer && socketRef.current && userId) {
            wcBridgeRef.current = new WebContainerBridge(webcontainer, socketRef.current, userId);
            console.log("[LabMode] WebContainerBridge initialized");

            // If files are already loaded, mount them
            const currentFiles = files; // Avoid closure stale state if possible
            if (currentFiles.length > 0) {
                wcBridgeRef.current.mountFiles(currentFiles).catch(err => {
                    console.error("[LabMode] Failed to mount initial files:", err);
                });
            }
        }
    }, [webcontainer, userId, files.length]); // Use files.length to trigger when files arrive

    const loadFiles = useCallback(async () => {
        try {
            // NEW: Fetch files filtered by lab courseId if present
            const url = session?.courseId ? `/files?courseId=${session.courseId}` : '/files';
            const res = await api.get(url);
            setFiles(res.data || []);
        } catch (e) { console.error("Failed to load files:", e); }
    }, [api, session]); // Added api, session

    // --- Heartbeat & Status ---
    const updateStatus = useCallback((newStatus) => {
        if (!socketRef.current || !session) return;
        socketRef.current.emit('student-status-update', {
            sessionId: session.sessionId || session._id,
            username: username,
            status: newStatus
        });
    }, [session, username]);

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

        const interval = setInterval(() => sendHeartbeat(), 15000); // 15s backup
        sendHeartbeat(); // Immediate

        const onFocus = () => { sendHeartbeat('active'); updateStatus('active'); };
        const onBlur = () => { sendHeartbeat('idle'); updateStatus('idle'); };

        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);

        // NEW: Cursor Idle Tracking
        const handleMouseEnter = () => updateStatus('active');
        const handleMouseLeave = () => updateStatus('idle');
        window.addEventListener('mouseenter', handleMouseEnter);
        window.addEventListener('mouseleave', handleMouseLeave);

        // NEW: Tab Switch Tracking
        const handleVisibilityChange = () => {
            const isHidden = document.visibilityState === 'hidden';
            const sId = session.sessionId || session._id;
            if (isHidden) {
                tabCountRef.current += 1;
                setTabSwitches(tabCountRef.current);
                if (socketRef.current) {
                    socketRef.current.emit('student-tab-switch', {
                        sessionId: sId,
                        username,
                        direction: 'left',
                        count: tabCountRef.current
                    });
                }
                updateStatus('idle');
            } else {
                if (socketRef.current) {
                    socketRef.current.emit('student-tab-switch', {
                        sessionId: sId,
                        username,
                        direction: 'returned',
                        count: tabCountRef.current
                    });
                }
                updateStatus('active');
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
                    count: pasteCountRef.current
                });
            }
        };
        document.addEventListener('paste', handlePaste);

        // Security: Block Copy/Paste
        const blockShortcuts = (e) => {
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                // console.warn("Action blocked in Lab Mode");
            }
        };
        window.addEventListener('keydown', blockShortcuts);

        const blockContextMenu = (e) => e.preventDefault();
        document.addEventListener('contextmenu', blockContextMenu);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('mouseenter', handleMouseEnter);
            window.removeEventListener('mouseleave', handleMouseLeave);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('paste', handlePaste);
            window.removeEventListener('keydown', blockShortcuts);
            document.removeEventListener('contextmenu', blockContextMenu);
            if (codeChangeTimeoutRef.current) clearTimeout(codeChangeTimeoutRef.current);
        };
    }, [session, username, updateStatus]);

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
            'py': `python3 ${filename} || python ${filename}`,
            'java': `javac "${filename}" && java "${filename.replace('.java', '')}"`,
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
    const handleFileClick = async (file) => {
        // STEP 1: SAVE PREVIOUS FILE
        if (activeFile && activeFile._id !== file._id) {
            console.log(`[LAB-SWITCH] Saving ${activeFile.name}...`);
            try {
                const fullPath = findFileFullPath(activeFile._id);
                await api.put(`/files/${activeFile._id}`, { content: code });
                if (socketRef.current) {
                    socketRef.current.emit('save-file-disk', {
                        fileName: fullPath,
                        code: code,
                        userId,
                        fileId: activeFile._id,
                        courseId: session?.courseId
                    });
                }
            } catch (e) {
                console.error("[LAB-SWITCH] Auto-save failed:", e);
            }
        }

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
            await loadFiles(); // Explicit refresh from server
            setActiveFile(res.data);
            setCode('');
            setLanguage(detectLanguage(name));
        } catch (e) {
            alert("Failed to create file: " + (e.response?.data?.error || e.message));
        }
        setNewFileName('');
        setShowNewFile(false);
    };

    const handleDeleteFile = async (fileId, e) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this file?")) return;
        try {
            await api.delete(`/files/${fileId}`);
            setFiles(prev => prev.filter(f => f._id !== fileId));
            if (activeFile?._id === fileId) {
                setActiveFile(null);
                setCode('// Select or create a file to start coding...');
            }
        } catch (e) {
            alert("Failed to delete file");
        }
    };

    const handleRenameFile = async (fileId, e) => {
        e.stopPropagation();
        const file = files.find(f => f._id === fileId);
        setEditingFileId(fileId);
        setTempFileName(file.name);
    };

    const submitRename = async (fileId) => {
        const newName = tempFileName.trim();
        if (!newName) { setEditingFileId(null); return; }
        try {
            await api.put(`/files/${fileId}`, { newName });
            setFiles(prev => prev.map(f => f._id === fileId ? { ...f, name: newName } : f));
            if (activeFile?._id === fileId) {
                setActiveFile({ ...activeFile, name: newName });
                setLanguage(detectLanguage(newName));
            }
        } catch (e) {
            alert("Failed to rename file");
        }
        setEditingFileId(null);
    };

    // --- Path Resolution Helper ---
    const findFileFullPath = useCallback((fileId) => {
        const file = files.find(f => f._id === fileId);
        if (!file) return "";
        if (!file.parentId || file.parentId === 'root') return file.name;
        const parentPath = findFileFullPath(file.parentId);
        return parentPath ? `${parentPath}/${file.name}` : file.name;
    }, [files]);

    const handleSave = useCallback(async () => {
        if (!activeFile) return;
        setSaving(true);
        const fullPath = findFileFullPath(activeFile._id);
        try {
            await api.put(`/files/${activeFile._id}`, { content: code });
            setFiles(prev => prev.map(f => f._id === activeFile._id ? { ...f, content: code } : f));

            // FIX: Enforce disk sync for previews/runs
            if (socketRef.current) {
                socketRef.current.emit('save-file-disk', {
                    fileName: fullPath,
                    code: code,
                    userId,
                    fileId: activeFile._id,
                    courseId: session?.courseId
                });
            }

            // Sync to WebContainer if bridge is ready
            if (wcBridgeRef.current) {
                try {
                    await wcBridgeRef.current.writeFile(activeFile.name, code);
                    console.log(`[LabMode] Synced ${activeFile.name} to WebContainer`);
                } catch (wcErr) {
                    console.error("[LabMode] WebContainer sync failed:", wcErr);
                }
            }

            // Also emit to faculty
            emitCodeUpdate();
        } catch (e) { console.error("Save failed", e); }
        setSaving(false);
    }, [activeFile, code, emitCodeUpdate, api, userId, session?.courseId, findFileFullPath]);


    // --- Run File ---
    const handleRun = useCallback(async () => {
        if (!activeFile || !socketRef.current) return;

        const fileName = activeFile.name;
        const fullPath = findFileFullPath(activeFile._id);

        if (fileName.endsWith('.html')) {
            await handleSave();
            let previewUrl = `${SERVER_URL}/preview/${userId}/${fileName}`;
            if (session?.courseId) {
                previewUrl = `${SERVER_URL}/preview/${userId}/labs/${session.courseId}/${fileName}`;
            }
            window.open(previewUrl, '_blank');
            return;
        }

        const cmd = getRunCommand(fileName);
        if (!cmd) { alert("No run command for this file type"); return; }

        const ext = fileName.split('.').pop().toLowerCase();
        // Hybrid logic: Only C, C++, and Java use server terminal. Web and Python use local WebContainer.
        const isServerLang = ['c', 'cpp', 'java', 'rb', 'go', 'php'].includes(ext);

        await handleSave();
        
        setSaving(false); // Ensure saving state is cleared

        if (isServerLang) {
            // Send to Server PTY
            socketRef.current.emit('terminal:write', {
                termId: 1,
                data: '\r' + cmd + '\r',
                courseId: session?.courseId
            });
        } else {
            // Send to Local WebContainer (if available)
            const inputWriter = window.ideTerminalInputs && window.ideTerminalInputs[1];
            if (inputWriter) {
                // Use padding \r to ensure execution
                try {
                    await inputWriter.write('\r' + cmd + '\r');
                    console.log(`[LabMode] Executed: ${cmd}`);
                } catch (err) {
                    console.error("[LabMode] WebContainer execution failed:", err);
                }
            } else {
                // Fallback to server if local not ready
                socketRef.current.emit('terminal:write', {
                    termId: 1,
                    data: '\r' + cmd + '\r',
                    courseId: session?.courseId
                });
            }
        }
    }, [activeFile, handleSave, session, userId, findFileFullPath]);

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

    const isServerLanguage = useMemo(() => {
        const ext = activeFile?.name?.split('.').pop()?.toLowerCase();
        return ['c', 'cpp', 'java', 'rb', 'go', 'php'].includes(ext);
    }, [activeFile?.name]);

    const terminalMode = isServerLanguage ? 'server' : 'local';
    const terminalKey = `lab-term-${terminalMode}`;

    return (
        <div style={{
            width: '100vw', height: '100vh',
            background: '#020617',
            backgroundImage: 'radial-gradient(at 0% 0%, rgba(30, 58, 138, 0.1) 0, transparent 40%), radial-gradient(at 100% 0%, rgba(88, 28, 135, 0.1) 0, transparent 40%)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif'
        }}>

            {/* --- TOP BAR --- */}
            <div style={{
                height: '56px',
                background: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(8px)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 24px', color: '#f8fafc', zIndex: 100,
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        padding: '8px',
                        background: 'linear-gradient(135deg, #ef4444, #991b1b)',
                        borderRadius: '10px',
                        boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <FaLock size={14} color="#fff" />
                    </div>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '800', letterSpacing: '-0.3px', color: '#fff' }}>
                            LAB MODE: {session?.sessionName || "Active Session"}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {session?.subject} • {username}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {/* Behavioral Stats Indicator (Neat & Informative) */}
                    <div style={{
                        display: 'flex', gap: '12px', padding: '6px 14px',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '20px', fontSize: '11px', color: '#94a3b8', fontWeight: '600'
                    }}>
                        <span style={{ color: tabSwitches > 3 ? '#fbbf24' : '#64748b' }}>📑 {tabSwitches}</span>
                        <span style={{ color: pastes > 5 ? '#f87171' : '#64748b' }}>📋 {pastes}</span>
                    </div>

                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }}></div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Run Button */}
                        <button
                            onClick={handleRun}
                            disabled={!activeFile}
                            style={{
                                background: activeFile ? 'linear-gradient(135deg, #22c55e, #15803d)' : 'rgba(255,255,255,0.03)',
                                border: 'none',
                                color: activeFile ? '#fff' : '#475569',
                                padding: '8px 16px', borderRadius: '8px', cursor: activeFile ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700',
                                boxShadow: activeFile ? '0 4px 12px rgba(34, 197, 94, 0.2)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            <FaPlay size={10} /> RUN
                        </button>
                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={!activeFile || saving}
                            style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                color: '#60a5fa',
                                padding: '8px 16px', borderRadius: '8px', cursor: activeFile ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600',
                                transition: 'all 0.2s'
                            }}
                        >
                            <FaSave /> {saving ? 'SAVING...' : 'SAVE'}
                        </button>

                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <FaClock color="#6366f1" size={14} />
                            <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '15px', color: '#e2e8f0' }}>
                                {timeLeft || "00:00"}
                            </span>
                        </div>

                        {/* Raise Hand Button */}
                        <button
                            onClick={() => {
                                if (!handRaised) {
                                    socketRef.current.emit('student-raise-hand', { sessionId: session.sessionId || session._id, username });
                                    setHandRaised(true);
                                }
                            }}
                            style={{
                                background: handRaised ? '#ef4444' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${handRaised ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                                color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                                fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px',
                                boxShadow: handRaised ? '0 0 20px rgba(239, 68, 68, 0.4)' : 'none',
                                animation: handRaised ? 'pulse-red 2s infinite' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span>✋</span> {handRaised ? 'REQUEST SENT' : 'RAISE HAND'}
                        </button>

                        <button
                            onClick={() => { if (window.confirm("Are you sure you want to exit the lab session?")) handleLogout(); }}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                color: '#f87171',
                                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600',
                                transition: 'all 0.2s'
                            }}
                        >
                            <FaSignOutAlt /> EXIT
                        </button>
                    </div>
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* File Tree (Sidebar) */}
                <div style={{
                    width: '260px',
                    background: 'rgba(2, 6, 23, 0.8)',
                    backdropFilter: 'blur(10px)',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: '20px 16px 12px', fontSize: '11px', fontWeight: '800',
                        color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <span>Explorer</span>
                        <button onClick={() => setShowNewFile(!showNewFile)} style={{
                            background: 'rgba(34, 197, 94, 0.1)', border: 'none', color: '#4ade80',
                            cursor: 'pointer', padding: '4px', borderRadius: '4px'
                        }} title="New File">
                            <FaPlus size={10} />
                        </button>
                    </div>

                    {showNewFile && (
                        <div style={{ padding: '0 16px 12px' }}>
                            <input type="text" placeholder="filename.js" value={newFileName}
                                onChange={e => setNewFileName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateFile(); if (e.key === 'Escape') setShowNewFile(false); }}
                                autoFocus
                                style={{
                                    width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                                    color: 'white', fontSize: '12px', outline: 'none'
                                }}
                            />
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
                        {files.length === 0 ? (
                            <div style={{ padding: '40px 10px', color: '#475569', fontSize: '12px', textAlign: 'center', opacity: 0.6 }}>
                                No files yet.<br />Click + to start coding.
                            </div>
                        ) : files.map(f => (
                            <div
                                key={f._id}
                                onClick={() => handleFileClick(f)}
                                className="lab-file-item"
                                style={{
                                    padding: '10px 12px', cursor: 'pointer', borderRadius: '8px',
                                    background: activeFile?._id === f._id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '10px',
                                    fontSize: '13px', color: activeFile?._id === f._id ? '#fff' : '#94a3b8',
                                    transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                                }}
                            >
                                <FaFile size={12} color={activeFile?._id === f._id ? '#60a5fa' : '#475569'} />

                                {editingFileId === f._id ? (
                                    <input
                                        autoFocus
                                        value={tempFileName}
                                        onChange={e => setTempFileName(e.target.value)}
                                        onBlur={() => submitRename(f._id)}
                                        onKeyDown={e => { if (e.key === 'Enter') submitRename(f._id); if (e.key === 'Escape') setEditingFileId(null); }}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            background: '#0f172a', border: '1px solid #3b82f6', color: '#fff',
                                            fontSize: '12px', padding: '2px 4px', borderRadius: '4px', width: '100%', outline: 'none'
                                        }}
                                    />
                                ) : (
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                )}

                                {editingFileId !== f._id && (
                                    <div className="file-actions" style={{ display: 'flex', gap: '8px', opacity: 0.8 }}>
                                        <FaEdit
                                            className="action-icon"
                                            onClick={(e) => handleRenameFile(f._id, e)}
                                            style={{ cursor: 'pointer', color: '#64748b' }}
                                            size={12}
                                            title="Rename"
                                        />
                                        <FaTrash
                                            className="action-icon"
                                            onClick={(e) => handleDeleteFile(f._id, e)}
                                            style={{ cursor: 'pointer', color: '#64748b' }}
                                            size={11}
                                            title="Delete"
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <style>{`
                        .lab-file-item:hover { background: rgba(255,255,255,0.03) !important; color: #fff !important; }
                        .lab-file-item .file-actions { display: none !important; }
                        .lab-file-item:hover .file-actions { display: flex !important; }
                        .action-icon:hover { color: #fff !important; }
                        @keyframes pulse-red {
                            0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                            70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                            100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                        }
                    `}</style>
                </div>

                {/* Editor + Terminal */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {activeFile && (
                        <div style={{
                            height: '40px', background: 'rgba(15, 23, 42, 0.4)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', padding: '0 20px', gap: '10px'
                        }}>
                            <FaFile size={12} color="#60a5fa" />
                            <span style={{ fontSize: '13px', color: '#fff', fontWeight: '500' }}>{activeFile.name}</span>
                            {lastSynced && <span style={{ fontSize: '10px', color: '#4ade80', marginLeft: 'auto', opacity: 0.7 }}>Synced at {lastSynced}</span>}
                        </div>
                    )}
                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                        <Editor
                            height="100%" language={language} value={code}
                            theme={theme === 'light' ? 'light' : 'vs-dark'}
                            onChange={handleCodeChange}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 15,
                                fontFamily: "'JetBrains Mono', monospace",
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                wordWrap: 'on',
                                padding: { top: 20 },
                                smoothScrolling: true,
                                cursorBlinking: 'expand',
                                cursorSmoothCaretAnimation: 'on'
                            }}
                        />
                    </div>
                    <div style={{
                        height: '280px', borderTop: '1px solid rgba(255,255,255,0.05)',
                        background: '#020617', display: 'flex', flexDirection: 'column', flexShrink: 0
                    }}>
                        <div style={{
                            padding: '10px 20px', background: 'rgba(15, 23, 42, 0.6)',
                            fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase',
                            letterSpacing: '0.5px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0
                        }}>
                            <FaTerminal size={12} /> TERMINAL
                        </div>
                        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                            {socketRef.current && userId ? (
                                <Terminal
                                    key={terminalKey}
                                    socket={socketRef.current}
                                    termId={1}
                                    userId={userId}
                                    webcontainer={isServerLanguage ? null : webcontainer}
                                />
                            ) : (
                                <div style={{ padding: '20px', color: '#475569', fontSize: '13px' }}>Connecting to secure terminal shell...</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Warning Footer (Floating) */}
            <div style={{
                position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                padding: '10px 24px', background: 'rgba(69, 10, 10, 0.8)',
                backdropFilter: 'blur(10px)', border: '1px solid #ef4444',
                color: '#fca5a5', borderRadius: '30px', fontSize: '12px', fontWeight: '600',
                display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                zIndex: 1000
            }}>
                <FaExclamationTriangle color="#ef4444" size={14} />
                <span>EXAM PROTOCOL ACTIVE: ALL ACTIVITY IS BEING LOGGED</span>
            </div>
        </div>
    );
};

export default LabMode;
