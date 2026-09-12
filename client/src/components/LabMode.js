import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FaTerminal, FaClock, FaLock, FaExclamationTriangle, FaFile, FaPlus, FaSave, FaPlay, FaSignOutAlt, FaTimes, FaEdit, FaTrash, FaCheck } from 'react-icons/fa';
import Editor from '@monaco-editor/react';
import Terminal from './Terminal';
import io from 'socket.io-client';
import axios from 'axios';
import { WebContainerBridge } from '../services/WebContainerBridge';
import { ExecutionService } from '../services/execution/ExecutionService';

const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_URL = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const LabMode = ({ session, username, userId, token, theme, webcontainer, onLogout, localWorkspacePath }) => {
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
    const [tabWarning, setTabWarning] = useState(null); // NEW: Student Warning
    const [isFullscreen, setIsFullscreen] = useState(false); // NEW: Fullscreen strict mode
    const [lastSynced, setLastSynced] = useState(null); // NEW: Visual feedback
    const wcBridgeRef = useRef(null);
    const isDesktopLab = typeof window !== 'undefined' && Boolean(window.electronAPI?.getLabWorkspace);
    const labScope = useMemo(() => ({
        collegeId: session?.collegeId || session?.college?._id,
        studentId: userId || username,
        courseId: session?.courseId?._id || session?.courseId,
        subject: session?.subject || session?.subjectName
    }), [session?.collegeId, session?.college?._id, session?.courseId, session?.subject, session?.subjectName, userId, username]);
    const [localLabRoot, setLocalLabRoot] = useState(null);

    const tabCountRef = useRef(0);
    const pasteCountRef = useRef(0);

    // Keep refs in sync
    useEffect(() => { codeRef.current = code; }, [code]);
    useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);

    useEffect(() => {
        if (!isDesktopLab) return;
        window.electronAPI.getLabWorkspace(labScope)
            .then(workspace => setLocalLabRoot(workspace?.root || null))
            .catch(error => console.error('[LabMode] Could not initialize local lab workspace:', error));
    }, [isDesktopLab, labScope]);

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

                const m = Math.floor(remaining / 60);
                const s = remaining % 60;
                setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
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

        const sock = io(SERVER_URL, { query, auth: { token: localStorage.getItem('token') } });
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

        sock.on('faculty-acknowledge', ({ username: ackUsername }) => {
            if (ackUsername === username) {
                setHandRaised(false);
            }
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
            if (isDesktopLab) {
                const flatten = nodes => (nodes || []).flatMap(node => node.type === 'folder' ? flatten(node.children) : [node]);
                const localFiles = await window.electronAPI.readLabDir(labScope);
                setFiles(flatten(localFiles));
                return;
            }
            // NEW: Fetch files filtered by lab courseId if present
            const url = session?.courseId ? `/files?courseId=${session.courseId}` : '/files';
            const res = await api.get(url);
            setFiles(res.data || []);
        } catch (e) { console.error("Failed to load files:", e); }
    }, [api, session, isDesktopLab, labScope]); // Added api, session

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

        const handleViolation = () => {
            const sId = session.sessionId || session._id;
            tabCountRef.current += 1;
            setTabSwitches(tabCountRef.current);
            
            if (socketRef.current) {
                socketRef.current.emit('student-tab-switch', {
                    sessionId: sId,
                    username,
                    direction: 'left',
                    count: tabCountRef.current,
                    type: 'proctor-violation'
                });
            }
            updateStatus('idle');

            // Trigger Tab Switch Warning
            if (tabCountRef.current >= 3) {
                setTabWarning({
                    level: 'critical',
                    message: `🚨 EXTREME WARNING: You have left the lab environment ${tabCountRef.current} times. Faculty has been notified.`
                });
            } else {
                setTabWarning({
                    level: 'warning',
                    message: `⚠️ STRICT PROCTORING: You clicked outside the lab or switched tabs. This is recorded (${tabCountRef.current} times).`
                });
            }
        };

        const handleReturn = () => {
            sendHeartbeat('active'); 
            updateStatus('active'); 
            const sId = session.sessionId || session._id;
            if (socketRef.current) {
                socketRef.current.emit('student-tab-switch', {
                    sessionId: sId,
                    username,
                    direction: 'returned',
                    count: tabCountRef.current,
                    type: 'proctor-return'
                });
            }
        };

        const onFocus = () => handleReturn();
        const onBlur = () => handleViolation();

        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);

        // NEW: Cursor Idle Tracking
        const handleMouseEnter = () => updateStatus('active');
        const handleMouseLeave = () => updateStatus('idle');
        window.addEventListener('mouseenter', handleMouseEnter);
        window.addEventListener('mouseleave', handleMouseLeave);

        // NEW: Tab Switch Tracking (Visibility Change)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                handleViolation();
            } else {
                handleReturn();
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

        // NEW: Full Screen Tracking
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setIsFullscreen(false);
                handleViolation(); // Exiting full screen is a violation
            } else {
                setIsFullscreen(true);
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        // Security: Block Copy/Paste and Fullscreen Exits
        const blockShortcuts = (e) => {
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
            if (e.key === 'F11' || e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
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
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
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
    const autoSaveTimeoutRef = useRef(null); // NEW: 5s DB Auto-Save Ref

    const handleCodeChange = (newValue) => {
        setCode(newValue || '');
        
        // 1. Instant Emit to Faculty (100ms Debounce)
        if (codeChangeTimeoutRef.current) clearTimeout(codeChangeTimeoutRef.current);
        codeChangeTimeoutRef.current = setTimeout(() => emitCodeUpdate(), 100); 

        // 2. Persistent DB Auto-Save (5000ms Debounce)
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = setTimeout(async () => {
            const currentFile = activeFileRef.current;
            if (!currentFile || !currentFile._id) return;
            try {
                if (isDesktopLab) {
                    await window.electronAPI.writeLabFile(labScope, currentFile.path || currentFile._id, newValue || '');
                    setFiles(prev => prev.map(f => f._id === currentFile._id ? { ...f, content: newValue } : f));
                    setLastSynced(new Date().toLocaleTimeString());
                    return;
                }
                // Background quiet save - passing autoSave=true skips timeline history clutter
                await api.put(`/files/${currentFile._id}?autoSave=true`, { content: newValue });
                // Update local files state without causing full re-renders
                setFiles(prev => prev.map(f => f._id === currentFile._id ? { ...f, content: newValue } : f));
                console.log(`[LabMode] Auto-saved ${currentFile.name} to database.`);
            } catch (e) {
                console.error("[LabMode] Auto-save failed:", e);
            }
        }, 5000);
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
        
        // Cross-platform compatibility for Windows PowerShell vs Linux Bash
        const isDesktop = !!window.electronAPI;
        const isWin = isDesktop && navigator.userAgent.toLowerCase().includes('windows');
        
        const exeExt = isWin ? '.exe' : '';
        const runPrefix = isWin ? '.\\' : './';
        const sep = isWin ? ';' : '&&';
        
        // Extract dir and base name for compiled languages that need exact paths
        const dir = filename.includes('/') ? filename.substring(0, filename.lastIndexOf('/')) : '.';
        const base = filename.includes('/') ? filename.substring(filename.lastIndexOf('/') + 1) : filename;
        const baseNoExt = base.replace(`.${ext}`, '');
        
        const commands = {
            'js': `node "${filename}"`,
            'py': `python3 "${filename}"`,
            'java': `javac "${filename}" ${sep} java -cp "${dir}" "${baseNoExt}"`,
            'c': `gcc "${filename}" -o output${exeExt} ${sep} ${runPrefix}output${exeExt}`,
            'cpp': `g++ "${filename}" -o output${exeExt} ${sep} ${runPrefix}output${exeExt}`,
            'rb': `ruby "${filename}"`,
            'go': `go run "${filename}"`,
            'php': `php "${filename}"`,
            'sh': `bash "${filename}"`,
            'bash': `bash "${filename}"`,
            'ts': `npx ts-node "${filename}"`,
        };
        return commands[ext] || null;
    };

    // --- File Operations ---
    const handleFileClick = async (file) => {
        if (isDesktopLab) {
            try {
                const content = await window.electronAPI.readLabFile(labScope, file.path || file._id);
                setActiveFile(file); setCode(content || ''); setLanguage(detectLanguage(file.name));
            } catch (error) { console.error('[LabMode] Could not open local lab file:', error); }
            return;
        }
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

        try {
            const res = await api.get(`/files/${file._id}`);
            const fullFile = res.data;
            setActiveFile(fullFile);
            setCode(fullFile.content || '');
            setLanguage(detectLanguage(fullFile.name));
        } catch (e) {
            console.error("[LAB-SWITCH] Failed to fetch file content:", e);
            setActiveFile(file);
            setCode(file.content || '');
            setLanguage(detectLanguage(file.name));
        }

        // Immediate sync to faculty
        setTimeout(() => emitCodeUpdate(), 50);
    };

    const handleCreateFile = async () => {
        const name = newFileName.trim();
        if (!name) return;
        try {
            if (isDesktopLab) {
                await window.electronAPI.createLabItem(labScope, name, 'file');
                await loadFiles();
                const created = { _id: name, path: name, name, type: 'file' };
                setActiveFile(created); setCode(''); setLanguage(detectLanguage(name));
                setNewFileName(''); setShowNewFile(false);
                return;
            }
            const res = await api.post('/files', {
                name,
                content: '',
                courseId: session?.courseId, // Tag file with course context
                subjectName: session?.subjectName || session?.subject // NEW: Tag file with subject
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
            if (isDesktopLab) {
                await window.electronAPI.deleteLabItem(labScope, fileId);
                setFiles(prev => prev.filter(file => file._id !== fileId));
                if (activeFile?._id === fileId) { setActiveFile(null); setCode('// Select or create a file to start coding...'); }
                return;
            }
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
            if (isDesktopLab) {
                const file = files.find(item => item._id === fileId);
                if (!file) throw new Error('Lab file no longer exists.');
                const parent = (file.path || '').includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : '';
                const nextPath = `${parent}${newName}`;
                await window.electronAPI.renameLabItem(labScope, file.path || fileId, nextPath);
                setFiles(prev => prev.map(item => item._id === fileId ? { ...item, _id: nextPath, path: nextPath, name: newName } : item));
                if (activeFile?._id === fileId) { setActiveFile({ ...activeFile, _id: nextPath, path: nextPath, name: newName }); setLanguage(detectLanguage(newName)); }
                setEditingFileId(null); return;
            }
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
            if (isDesktopLab) {
                await window.electronAPI.writeLabFile(labScope, activeFile.path || fullPath, code);
                setFiles(prev => prev.map(file => file._id === activeFile._id ? { ...file, content: code } : file));
                setLastSynced(new Date().toLocaleTimeString());
                return;
            }
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
            
            // Native Local Lab Save
            if (localWorkspacePath && window.electronAPI) {
                try {
                    await window.electronAPI.writeLocalFile(`${localWorkspacePath}/${fullPath}`, code);
                    console.log(`[LabMode] Synced ${fullPath} to Local Native Workspace`);
                } catch (localErr) {
                    console.error("[LabMode] Local Native save failed:", localErr);
                }
            }

            // Also emit to faculty
            emitCodeUpdate();
        } catch (e) { console.error("Save failed", e); }
        setSaving(false);
    }, [activeFile, code, emitCodeUpdate, api, userId, session?.courseId, findFileFullPath, isDesktopLab, labScope]);

    // Keyboard shortcuts are handled in the main shortcut block below


    // --- Run File ---
    const getLanguage = (fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();
        switch (ext) {
            case 'js': return 'javascript';
            case 'py': return 'python';
            case 'java': return 'java';
            case 'c': return 'c';
            case 'cpp': return 'cpp';
            case 'html': return 'html';
            case 'css': return 'css';
            default: return 'javascript';
        }
    };

    const handleRun = useCallback(async () => {
        if (!activeFile || !socketRef.current) return;

        if (isDesktopLab && localLabRoot) {
            await handleSave();
            const localPath = activeFile.path || activeFile.name;
            const command = getRunCommand(localPath);
            if (!command) { alert('This file can be opened in the local terminal from its dedicated lab folder.'); return; }
            window.electronAPI.terminalWrite(command + '\r');
            return;
        }

        const fileName = activeFile.name;
        let fullPath = findFileFullPath(activeFile._id);
        if (localWorkspacePath) {
            fullPath = `${localWorkspacePath}/${fullPath}`;
        }

        if (fileName.endsWith('.html')) {
            await handleSave();
            let previewUrl = `${SERVER_URL}/preview/${userId}/${fileName}`;
            if (session?.courseId) {
                previewUrl = `${SERVER_URL}/preview/${userId}/labs/${session.courseId}/${fileName}`;
            }
            window.open(previewUrl, '_blank');
            return;
        }

        const cmd = getRunCommand(fullPath);
        if (!cmd) { alert("No run command for this file type"); return; }

        await handleSave();
        setSaving(false); 

        await ExecutionService.run({
            fileName,
            fullPath,
            cmd,
            code: activeFile.content || code,
            language: getLanguage(activeFile.name),
            activeFileId: activeFile._id,
            courseId: session?.courseId,
            socketRef,
            api,
            termId: 1
        });
    }, [activeFile, handleSave, session, userId, findFileFullPath, isDesktopLab, localLabRoot]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handler = (e) => {
            // Ctrl+S or Cmd+S to Save
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }
            // Ctrl+Enter or Cmd+Enter to Run
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleRun();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleSave, handleRun]);

    // --- Logout Handler ---
    const handleLogout = async () => {
        // Ensure the active file is saved before the student exits
        try {
            await handleSave();
        } catch (e) {
            console.error("[LabMode] Failed to save before logout:", e);
        }

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
        return ['c', 'cpp', 'java', 'py', 'js', 'ts', 'rb', 'go', 'php', 'sh', 'bash'].includes(ext);
    }, [activeFile?.name]);

    const terminalMode = isServerLanguage ? 'server' : 'local';
    const terminalKey = `lab-term-${terminalMode}`;

    return (
        <div style={{
            width: '100vw', height: '100vh',
            background: 'transparent',
            backgroundImage: 'radial-gradient(at 0% 0%, rgba(30, 58, 138, 0.1) 0, transparent 40%), radial-gradient(at 100% 0%, rgba(88, 28, 135, 0.1) 0, transparent 40%)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif'
        }}>

            {/* --- FULL SCREEN ENFORCEMENT OVERLAY --- */}
            {!isFullscreen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
                    background: 'rgba(2, 6, 23, 0.98)', backdropFilter: 'blur(15px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontFamily: 'Inter, sans-serif'
                }}>
                    <div style={{ fontSize: '56px', marginBottom: '24px' }}>🛡️</div>
                    <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '16px', color: '#ef4444', letterSpacing: '-0.5px' }}>
                        Strict Proctoring Enabled
                    </h2>
                    <p style={{ fontSize: '18px', color: '#94a3b8', maxWidth: '600px', textAlign: 'center', marginBottom: '40px', lineHeight: '1.6' }}>
                        This lab session requires Full-Screen mode to prevent the use of external tools like AI assistants or unauthorized resources. <strong style={{ color: '#fff' }}>Exiting full-screen or clicking outside the window will be recorded as a violation.</strong>
                    </p>
                    <button
                        onClick={() => document.documentElement.requestFullscreen().catch(err => console.error(err))}
                        style={{
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            color: 'white', border: 'none', padding: '18px 40px',
                            borderRadius: '12px', fontSize: '18px', fontWeight: 'bold',
                            cursor: 'pointer', boxShadow: '0 8px 25px rgba(59, 130, 246, 0.4)',
                            transition: 'all 0.2s ease', letterSpacing: '0.5px'
                        }}
                        onMouseOver={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                        onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        ENTER FULL SCREEN TO START
                    </button>
                </div>
            )}

            {/* --- FACULTY ANNOUNCEMENT BANNER --- */}
            {announcement && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff', padding: '14px 24px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.5)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '20px' }}>📢</span>
                        <div>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1.5px', opacity: 0.8 }}>Faculty Announcement</div>
                            <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '2px' }}>{announcement}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => setAnnouncement(null)}
                        style={{
                            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                            padding: '6px 16px', borderRadius: '6px', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px',
                            transition: '0.2s'
                        }}
                        onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.35)'}
                        onMouseOut={e => e.target.style.background = 'rgba(255,255,255,0.2)'}
                    >
                        DISMISS
                    </button>
                </div>
            )}

            {/* --- TAB WARNING BANNER --- */}
            {tabWarning && (
                <div style={{
                    position: 'fixed', top: '70px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
                    background: tabWarning.level === 'critical' ? 'linear-gradient(135deg, #dc2626, #991b1b)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff', padding: '16px 28px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px',
                    boxShadow: tabWarning.level === 'critical' ? '0 4px 20px rgba(220, 38, 38, 0.6)' : '0 4px 20px rgba(245, 158, 11, 0.4)',
                    animation: 'slideDown 0.3s ease-out, pulse 2s infinite'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>{tabWarning.level === 'critical' ? '🚨' : '⚠️'}</span>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.5px' }}>{tabWarning.message}</div>
                    </div>
                    <button
                        onClick={() => setTabWarning(null)}
                        style={{
                            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                            padding: '6px 16px', borderRadius: '6px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 'bold', transition: '0.2s'
                        }}
                        onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.35)'}
                        onMouseOut={e => e.target.style.background = 'rgba(255,255,255,0.2)'}
                    >
                        ACKNOWLEDGE
                    </button>
                    <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.9; } 100% { opacity: 1; } }`}</style>
                </div>
            )}

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
                                formatOnType: true,
                                formatOnPaste: true,
                                suggestSelection: 'first',
                                wordBasedSuggestions: 'currentDocument',
                                suggestOnTriggerCharacters: true,
                                quickSuggestions: { other: true, comments: false, strings: true },
                                renderValidationDecorations: 'on',
                                hover: { enabled: true, delay: 200 },
                                lightbulb: { enabled: true },
                                padding: { top: 20 },
                                smoothScrolling: true,
                                cursorBlinking: 'expand',
                                cursorSmoothCaretAnimation: 'on'
                            }}
                        />
                    </div>
                    <div style={{
                        height: '280px', borderTop: '1px solid rgba(255,255,255,0.05)',
                        background: 'transparent', display: 'flex', flexDirection: 'column', flexShrink: 0
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
                                    courseId={session?.courseId}
                                    webcontainer={isServerLanguage ? null : webcontainer}
                                    localWorkspacePath={isDesktopLab ? localLabRoot : localWorkspacePath}
                                    labMode={isDesktopLab}
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
                position: 'fixed', top: '15px', right: '20px',
                padding: '6px 12px', background: 'rgba(69, 10, 10, 0.4)',
                backdropFilter: 'blur(4px)', border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#fca5a5', borderRadius: '6px', fontSize: '10px', fontWeight: '500',
                display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 1000, pointerEvents: 'none'
            }}>
                <FaExclamationTriangle color="#ef4444" size={10} />
                <span>EXAM PROTOCOL ACTIVE</span>
            </div>
        </div>
    );
};

export default LabMode;

