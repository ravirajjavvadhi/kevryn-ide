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
    const [showImport, setShowImport] = useState(false);
    const [importableFiles, setImportableFiles] = useState([]);
    const [importingPath, setImportingPath] = useState('');
    const [selectedImport, setSelectedImport] = useState(null);
    const [sessionNotes, setSessionNotes] = useState([]);
    const [showNotes, setShowNotes] = useState(false);
    const [noteIndex, setNoteIndex] = useState(0);
    const [unreadNoteCount, setUnreadNoteCount] = useState(0);
    const [notesMinimized, setNotesMinimized] = useState(false);
    const [notesPosition, setNotesPosition] = useState({ right: 28, bottom: 28 });
    const noteDragRef = useRef(null);
    const [saving, setSaving] = useState(false);
    const [editingFileId, setEditingFileId] = useState(null);
    const [tempFileName, setTempFileName] = useState('');
    const socketRef = useRef(null);
    const codeRef = useRef(code);
    const activeFileRef = useRef(activeFile);
    const editorRef = useRef(null);

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
    const isSessionScopedLab = Boolean(session?.sessionId || session?._id);
    const labScope = useMemo(() => ({
        collegeId: session?.collegeId || session?.college?._id,
        studentId: userId || username,
        courseId: session?.courseId?._id || session?.courseId,
        subject: session?.subject || session?.subjectName,
        sessionId: session?.sessionId || session?._id
    }), [session?.collegeId, session?.college?._id, session?.courseId, session?.subject, session?.subjectName, session?.sessionId, session?._id, userId, username]);
    const notesStorageKey = `kevryn.lab.notes.${labScope.sessionId || 'unknown'}`;
    const [localLabRoot, setLocalLabRoot] = useState(null);
    const reportMirrorTimeoutRef = useRef(null);
    const lastSyncPaintAtRef = useRef(0);

    const tabCountRef = useRef(0);
    const pasteCountRef = useRef(0);

    // Keep refs in sync
    useEffect(() => { codeRef.current = code; }, [code]);
    useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);
    useEffect(() => {
        if (!activeFile) return;
        // Monaco remains mounted as files change, so onMount alone cannot
        // restore focus after creating, importing, or selecting a file.
        requestAnimationFrame(() => editorRef.current?.focus());
    }, [activeFile?._id]);

    useEffect(() => {
        const move = event => {
            if (!noteDragRef.current) return;
            const { x, y, left, top } = noteDragRef.current;
            setNotesPosition({ left: Math.max(8, left + event.clientX - x), top: Math.max(8, top + event.clientY - y), right: 'auto', bottom: 'auto' });
        };
        const end = () => { noteDragRef.current = null; };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
        return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    }, []);

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(notesStorageKey) || '{}');
            if (saved.position) setNotesPosition(saved.position);
            if (typeof saved.minimized === 'boolean') setNotesMinimized(saved.minimized);
        } catch (_) { /* optional local UI preference */ }
    }, [notesStorageKey]);
    useEffect(() => {
        try { localStorage.setItem(notesStorageKey, JSON.stringify({ position: notesPosition, minimized: notesMinimized })); } catch (_) { /* storage unavailable */ }
    }, [notesStorageKey, notesPosition, notesMinimized]);

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

                // Native Lab Mode owns a real terminal on the student's
                // machine.  Never create a server PTY for that path: the
                // socket is only for live supervision and report mirroring.
                // The web lab still uses its existing browser/server runtime.
                if (!isDesktopLab) {
                    sock.emit('terminal:create', {
                        termId: 1,
                        userId,
                        courseId: session?.courseId?._id || session?.courseId,
                        sessionId: session?.sessionId || session?._id
                    });
                }
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
        sock.on('faculty-session-note', (note) => {
            if (!note?._id) return;
            setSessionNotes(previous => previous.some(item => item._id === note._id) ? previous : [...previous, note]);
            if (!showNotes) setUnreadNoteCount(value => value + 1);
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
    }, [session?.sessionId, session?._id, username, userId, onLogout, showNotes]); // Stable dependencies (No 'language'!)

    useEffect(() => {
        const activeSessionId = session?.sessionId || session?._id;
        if (!token || !activeSessionId) return;
        api.get(`/lab/session/${activeSessionId}/notes`)
            .then(response => setSessionNotes(response.data?.notes || []))
            .catch(() => setSessionNotes([]));
    }, [api, session?.sessionId, session?._id, token]);


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
            const activeSessionId = session?.sessionId || session?._id;
            if (activeSessionId) {
                const res = await api.get(`/lab/session/${activeSessionId}/my-files`);
                setFiles(res.data?.files || []);
                return;
            }
            setFiles([]);
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
                        // Heartbeats carry presence only. The live code is
                        // mirrored independently over the lab socket, so this
                        // request stays tiny even for large source files.
                        activeFile: activeFileRef.current?.name || null
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

    // The canonical desktop file stays on the student's disk. Both desktop and
    // browser labs additionally keep a session-only report mirror, which is
    // separate from the general workspace and is the sole source for faculty
    // session file lists and reports.
    const syncLabArtifact = useCallback((filePath, contents, fileLanguage, action = 'update', immediate = false, importedFrom = null) => {
        if (!socketRef.current || !(session?.sessionId || session?._id) || !username) return Promise.resolve(false);
        const send = () => new Promise(resolve => {
            const socket = socketRef.current;
            if (!socket?.connected) { resolve(false); return; }

            // The acknowledgement confirms report persistence, not local file
            // saving. A slow/offline mirror must never leave the Save button
            // in a pending state or block local execution.
            const mirrorExecution = !isDesktopLab && isSessionScopedLab;
            let settled = false;
            let pendingResponses = mirrorExecution ? 2 : 1;
            let allSucceeded = true;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (result?.success && Date.now() - lastSyncPaintAtRef.current >= 1000) {
                    lastSyncPaintAtRef.current = Date.now();
                    setLastSynced(new Date().toLocaleTimeString());
                }
                resolve(Boolean(result?.success));
            };
            const receive = (result) => {
                allSucceeded = allSucceeded && Boolean(result?.success);
                pendingResponses -= 1;
                if (pendingResponses === 0) finish({ success: allSucceeded });
            };
            const timeout = setTimeout(() => finish({ success: false }), 4000);
            socket.emit('student-lab-file-event', {
                sessionId: session.sessionId || session._id,
                username,
                path: filePath,
                code: contents || '',
                language: fileLanguage || 'plaintext',
                action,
                importedFrom
            }, receive);
            if (mirrorExecution) {
                socket.emit('lab-execution-file-event', {
                    sessionId: session.sessionId || session._id,
                    username,
                    path: filePath,
                    code: contents || '',
                    action
                }, receive);
            }
        });
        if (immediate) return send();
        if (reportMirrorTimeoutRef.current) clearTimeout(reportMirrorTimeoutRef.current);
        // Live monitoring still streams at editor speed; report persistence is
        // coalesced so it never makes local typing feel network-bound.
        reportMirrorTimeoutRef.current = setTimeout(() => { void send(); }, 1500);
        return Promise.resolve(true);
    }, [isDesktopLab, isSessionScopedLab, session?.sessionId, session?._id, username]);

    const syncLabMirror = useCallback((fileName, contents, fileLanguage) => {
        if (socketRef.current && (session?.sessionId || session?._id) && username) {
            socketRef.current.emit('student-code-update', {
                sessionId: session.sessionId || session._id,
                username,
                fileName: fileName || activeFileRef.current?.name || 'untitled',
                code: contents ?? codeRef.current ?? '',
                language: fileLanguage || language || 'javascript'
            });
            // This timestamp is visual feedback only. Throttling it prevents a
            // full Lab Mode render for every monitoring packet while typing.
            if (Date.now() - lastSyncPaintAtRef.current >= 1000) {
                lastSyncPaintAtRef.current = Date.now();
                setLastSynced(new Date().toLocaleTimeString());
            }
        }
        syncLabArtifact(fileName, contents, fileLanguage);
    }, [session?.sessionId, session?._id, username, language, syncLabArtifact]);

    // --- Emit code updates to server (for faculty real-time view) ---
    const emitCodeUpdate = useCallback(() => {
        syncLabMirror(activeFileRef.current?.name, codeRef.current, language);
    }, [syncLabMirror, language]);


    // Debounced code change handler
    const codeChangeTimeoutRef = useRef(null);
    const autoSaveTimeoutRef = useRef(null); // NEW: 5s DB Auto-Save Ref

    const handleCodeChange = (newValue) => {
        setCode(newValue || '');
        
        // 1. Near-real-time faculty mirror. Coalesce keystroke bursts so a
        // slow connection never competes with Monaco's typing path.
        if (codeChangeTimeoutRef.current) clearTimeout(codeChangeTimeoutRef.current);
        codeChangeTimeoutRef.current = setTimeout(() => emitCodeUpdate(), 250);

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
                if (isSessionScopedLab) {
                    const nextCode = newValue || '';
                    setFiles(prev => prev.map(file => file._id === currentFile._id ? { ...file, content: nextCode, updatedAt: new Date().toISOString() } : file));
                    syncLabArtifact(currentFile.path || currentFile.name, nextCode, currentFile.language || detectLanguage(currentFile.name), 'update', true);
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
        
        // Extract dir and base name for compiled languages that need exact paths
        const dir = filename.includes('/') ? filename.substring(0, filename.lastIndexOf('/')) : '.';
        const base = filename.includes('/') ? filename.substring(filename.lastIndexOf('/') + 1) : filename;
        const baseNoExt = base.replace(`.${ext}`, '');
        
        // Native compilation artifacts must not become student files. Keep
        // them in KevRyn's hidden local build folder, which the Lab explorer
        // intentionally excludes from the student-visible tree.
        const nativeBuild = '.kevryn-build';
        const nativeOutput = `${nativeBuild}/${baseNoExt}${exeExt}`;
        const compileAndRun = (compiler) => isWin
            ? `New-Item -ItemType Directory -Force "${nativeBuild}" | Out-Null; ${compiler} "${filename}" -o "${nativeOutput.replace(/\//g, '\\')}"; if ($LASTEXITCODE -eq 0) { & ".\\${nativeOutput.replace(/\//g, '\\')}" }`
            : `mkdir -p "${nativeBuild}" && ${compiler} "${filename}" -o "${nativeOutput}" && "./${nativeOutput}"`;
        const commands = {
            'js': `node "${filename}"`,
            'py': `python3 "${filename}"`,
            'java': isWin ? `javac "${filename}"; if ($LASTEXITCODE -eq 0) { java -cp "${dir}" "${baseNoExt}" }` : `javac "${filename}" && java -cp "${dir}" "${baseNoExt}"`,
            'c': compileAndRun('gcc'),
            'cpp': compileAndRun('g++'),
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
                syncLabMirror(file.name, content || '', detectLanguage(file.name));
            } catch (error) { console.error('[LabMode] Could not open local lab file:', error); }
            return;
        }
        if (isSessionScopedLab) {
            setActiveFile(file); setCode(file.content || ''); setLanguage(file.language || detectLanguage(file.name));
            syncLabMirror(file.name, file.content || '', file.language || detectLanguage(file.name));
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
                const created = { _id: name, path: name, name, type: 'file' };
                // The local write has already succeeded. Update the Explorer
                // directly instead of rescanning the full lab folder.
                setFiles(prev => [...prev.filter(file => file._id !== created._id), created]);
                setActiveFile(created); setCode(''); setLanguage(detectLanguage(name));
                syncLabMirror(name, '', detectLanguage(name));
                syncLabArtifact(name, '', detectLanguage(name), 'create', true);
                setNewFileName(''); setShowNewFile(false);
                return;
            }
            if (isSessionScopedLab) {
                const created = { _id: `lab:${name}`, path: name, name, type: 'file', content: '', language: detectLanguage(name) };
                setFiles(prev => [...prev.filter(file => file._id !== created._id), created]);
                setActiveFile(created); setCode(''); setLanguage(created.language);
                syncLabArtifact(name, '', created.language, 'create', true);
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
            // Browser labs also contribute only to this lab's session record.
            syncLabArtifact(name, '', detectLanguage(name), 'create', true);
        } catch (e) {
            alert("Failed to create file: " + (e.response?.data?.error || e.message));
        }
        setNewFileName('');
        setShowNewFile(false);
    };

    const openImport = async () => {
        if (session?.disablePreviousFileImport) return;
        setShowImport(true); setSelectedImport(null);
        try {
            const activeSessionId = session?.sessionId || session?._id;
            let serverFiles = [];
            try {
                const response = await api.get(`/lab/importable-files?sessionId=${encodeURIComponent(activeSessionId)}`);
                serverFiles = (response.data?.files || []).map(file => ({ ...file, source: 'session-archive' }));
            } catch (error) {
                // A network problem must not hide valid local history in the
                // desktop app. Browser Lab Mode still reports the empty state.
                if (!isDesktopLab) throw error;
            }
            if (!isDesktopLab) { setImportableFiles(serverFiles); return; }

            // A desktop lab is local-first, but its completed-session archive
            // is the same protected record shown in Student Command Center.
            // Merge it with older local-only folders so switching devices or
            // updating the app never hides a student's earlier work.
            const localFiles = ((await window.electronAPI.listPreviousLabFiles(labScope)) || []).map(file => ({ ...file, source: 'local-folder' }));
            const serverKeys = new Set(serverFiles.map(file => `${file.sourceSessionId}:${file.path}`));
            setImportableFiles([...serverFiles, ...localFiles.filter(file => !serverKeys.has(`${file.sourceSessionId}:${file.path}`))]);
        } catch (_) { setImportableFiles([]); }
    };

    const importPreviousFile = async (entry) => {
        const sourceKey = `${entry?.sourceSessionId}:${entry?.path}`;
        if (!entry || importingPath) return;
        setImportingPath(sourceKey);
        try {
            let created;
            if (isDesktopLab) {
                if (files.some(file => (file.path || file.name) === entry.path)) throw new Error('A file with this name already exists in the current session.');
                if (entry.source === 'session-archive') {
                    // Server records are only a private history source. The
                    // imported copy is written into this session's local
                    // folder and executes locally like every other file.
                    await window.electronAPI.writeLabFile(labScope, entry.path, entry.code || '');
                    created = { _id: entry.path, path: entry.path, name: entry.path.split('/').pop(), type: 'file', content: entry.code || '', language: entry.language || detectLanguage(entry.path) };
                } else {
                    const result = await window.electronAPI.importPreviousLabFile(labScope, entry.sourceSessionId, entry.path, entry.path);
                    created = { _id: result.path, path: result.path, name: result.path.split('/').pop(), type: 'file', content: result.content || '' };
                }
            } else {
                const filePath = entry.path || entry.name;
                if (files.some(file => (file.path || file.name) === filePath)) throw new Error('A file with this name already exists in the current session.');
                created = { _id: `lab:${filePath}`, path: filePath, name: filePath.split('/').pop(), type: 'file', content: entry.code || '', language: entry.language || detectLanguage(filePath) };
            }
            setFiles(previous => [...previous.filter(file => file._id !== created._id), created]);
            setActiveFile(created); setCode(created.content || entry.code || ''); setLanguage(entry.language || detectLanguage(created.name));
            syncLabArtifact(created.path || created.name, created.content || entry.code || '', entry.language || detectLanguage(created.name), 'create', true, { sessionId: entry.sourceSessionId, path: entry.path, importedAt: new Date().toISOString() });
            setShowImport(false);
        } catch (error) {
            alert(error?.message || 'The file could not be imported. A file with the same name may already exist.');
        } finally { setImportingPath(''); }
    };

    const handleDeleteFile = async (fileId, e) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this file?")) return;
        try {
            if (isDesktopLab) {
                await window.electronAPI.deleteLabItem(labScope, fileId);
                const removed = files.find(file => file._id === fileId);
                syncLabArtifact(removed?.path || fileId, '', detectLanguage(removed?.name || ''), 'delete', true);
                setFiles(prev => prev.filter(file => file._id !== fileId));
                if (activeFile?._id === fileId) { setActiveFile(null); setCode('// Select or create a file to start coding...'); }
                return;
            }
            if (isSessionScopedLab) {
                const removed = files.find(file => file._id === fileId);
                syncLabArtifact(removed?.path || removed?.name || fileId.replace(/^lab:/, ''), '', detectLanguage(removed?.name || ''), 'delete', true);
                setFiles(prev => prev.filter(file => file._id !== fileId));
                if (activeFile?._id === fileId) { setActiveFile(null); setCode('// Select or create a file to start coding...'); }
                return;
            }
            await api.delete(`/files/${fileId}`);
            const removed = files.find(file => file._id === fileId);
            syncLabArtifact(removed?.name || fileId, '', detectLanguage(removed?.name || ''), 'delete', true);
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
                syncLabArtifact(file.path || fileId, '', detectLanguage(file.name), 'delete', true);
                syncLabArtifact(nextPath, activeFile?._id === fileId ? code : '', detectLanguage(newName), 'create', true);
                setFiles(prev => prev.map(item => item._id === fileId ? { ...item, _id: nextPath, path: nextPath, name: newName } : item));
                if (activeFile?._id === fileId) { setActiveFile({ ...activeFile, _id: nextPath, path: nextPath, name: newName }); setLanguage(detectLanguage(newName)); }
                setEditingFileId(null); return;
            }
            if (isSessionScopedLab) {
                const file = files.find(item => item._id === fileId);
                if (!file) throw new Error('Lab file no longer exists.');
                const parent = (file.path || '').includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : '';
                const nextPath = `${parent}${newName}`;
                if (files.some(item => item._id !== fileId && (item.path || item.name) === nextPath)) throw new Error('A file with that name already exists.');
                syncLabArtifact(file.path || file.name, '', detectLanguage(file.name), 'delete', true);
                syncLabArtifact(nextPath, activeFile?._id === fileId ? code : file.content || '', detectLanguage(newName), 'create', true);
                setFiles(prev => prev.map(item => item._id === fileId ? { ...item, _id: `lab:${nextPath}`, path: nextPath, name: newName } : item));
                if (activeFile?._id === fileId) { setActiveFile({ ...activeFile, _id: `lab:${nextPath}`, path: nextPath, name: newName }); setLanguage(detectLanguage(newName)); }
                setEditingFileId(null); return;
            }
            await api.put(`/files/${fileId}`, { newName });
            const renamed = files.find(file => file._id === fileId);
            if (renamed) {
                syncLabArtifact(renamed.name, '', detectLanguage(renamed.name), 'delete', true);
                syncLabArtifact(newName, activeFile?._id === fileId ? code : '', detectLanguage(newName), 'create', true);
            }
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
                syncLabMirror(activeFile.name, code, language);
            } else if (isSessionScopedLab) {
                setFiles(prev => prev.map(file => file._id === activeFile._id ? { ...file, content: code, updatedAt: new Date().toISOString() } : file));
                syncLabMirror(activeFile.name, code, language);
                // Wait for the browser's dedicated session mirror before Run
                // can send a command to its PTY. This prevents stale files.
                await syncLabArtifact(activeFile.path || activeFile.name, code, language, 'update', true);
            } else {
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
            }
        } catch (e) { console.error("Save failed", e); }
        finally { setSaving(false); }
    }, [activeFile, code, emitCodeUpdate, api, userId, session?.courseId, findFileFullPath, isDesktopLab, isSessionScopedLab, labScope, syncLabMirror, syncLabArtifact, language]);

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
        if (!activeFile) return;

        if (isDesktopLab && localLabRoot) {
            await handleSave();
            const localPath = activeFile.path || activeFile.name;
            if (/\.html?$/i.test(activeFile.name) && window.electronAPI.openLabPreview) {
                const preview = await window.electronAPI.openLabPreview(labScope, localPath);
                if (!preview?.success) alert(preview?.error || 'Could not open the local lab preview.');
                return;
            }
            const command = getRunCommand(localPath);
            if (!command) { alert('This file can be opened in the local terminal from its dedicated lab folder.'); return; }
            const result = window.electronAPI.runLocalCommand
                ? await window.electronAPI.runLocalCommand(localLabRoot, command)
                : await window.electronAPI.terminalWrite(command + '\r');
            if (result?.success === false) alert(result.error || 'Could not start the local run.');
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
    }, [activeFile, handleSave, session, userId, findFileFullPath, isDesktopLab, localLabRoot, labScope]);

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
            // Typing mirrors are deliberately debounced.  Flush the final
            // saved local file before leaving so this session's report has the
            // exact last version the student saw in the editor.
            if (isDesktopLab && activeFileRef.current) {
                const current = activeFileRef.current;
                await syncLabArtifact(current.path || current._id, codeRef.current || '', detectLanguage(current.name), 'update', true);
            }
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
        // The final artifact acknowledgement above has already had an
        // opportunity to persist. Keep this only for the leave-status packet.
        setTimeout(() => {
            onLogout();
        }, 150);
    };

    const isServerLanguage = useMemo(() => {
        const ext = activeFile?.name?.split('.').pop()?.toLowerCase();
        return ['c', 'cpp', 'java', 'py', 'js', 'ts', 'rb', 'go', 'php', 'sh', 'bash'].includes(ext);
    }, [activeFile?.name]);

    // A desktop lab always owns one local PTY. Do not remount it when a
    // student switches between C, Python, HTML, or another file: remounting
    // destroys the terminal surface and causes the visible blink/flicker.
    const terminalMode = isDesktopLab ? 'native-lab' : (isServerLanguage ? 'server' : 'local');
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

                    <button onClick={() => { setNoteIndex(Math.max(0, sessionNotes.length - 1)); setUnreadNoteCount(0); setNotesMinimized(false); setShowNotes(true); }} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(129,140,248,0.35)', color: '#c4b5fd', padding: '7px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                        Notes {unreadNoteCount ? `(${unreadNoteCount})` : sessionNotes.length ? `(${sessionNotes.length})` : ''}
                    </button>

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
                        <div style={{ display: 'flex', gap: '7px' }}>
                            {!session?.disablePreviousFileImport && <button onClick={openImport} style={{ background: 'rgba(99,102,241,0.12)', border: 'none', color: '#a5b4fc', cursor: 'pointer', padding: '4px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }} title="Import a previous lab file">IMPORT</button>}
                            <button onClick={() => setShowNewFile(!showNewFile)} style={{
                                background: 'rgba(34, 197, 94, 0.1)', border: 'none', color: '#4ade80',
                                cursor: 'pointer', padding: '4px', borderRadius: '4px'
                            }} title="New File">
                                <FaPlus size={10} />
                            </button>
                        </div>
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
                            onMount={editor => {
                                editorRef.current = editor;
                                // Newly selected/created lab files are ready
                                // for uninterrupted typing immediately.
                                requestAnimationFrame(() => editor.focus());
                            }}
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
                            {(isDesktopLab && localLabRoot) || (socketRef.current && userId) ? (
                                <Terminal
                                    key={terminalKey}
                                    socket={socketRef.current}
                                    termId={1}
                                    userId={userId}
                                    courseId={session?.courseId}
                                    webcontainer={isServerLanguage ? null : webcontainer}
                                    localWorkspacePath={isDesktopLab ? localLabRoot : localWorkspacePath}
                                    // Terminal contents are never part of Lab
                                    // supervision. This flag blocks terminal
                                    // mirroring for both browser and desktop labs.
                                    labMode={true}
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

            {showImport && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(2,6,23,.78)', display: 'grid', placeItems: 'center', padding: 24 }}>
                    <div style={{ width: 'min(760px, 94vw)', maxHeight: '75vh', display: 'flex', flexDirection: 'column', background: '#10192d', border: '1px solid #4f46e5', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,.55)' }}>
                        <div style={{ padding: '18px 20px', borderBottom: '1px solid #26334d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><strong>Import previous lab file</strong><div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Only your earlier work for this course is available.</div></div><button onClick={() => setShowImport(false)} style={{ background: 'transparent', border: 0, color: '#cbd5e1', cursor: 'pointer', fontSize: 20 }}>×</button></div>
                        <div style={{ overflowY: 'auto', padding: 12, display: 'grid', gridTemplateColumns: selectedImport ? 'minmax(0,.9fr) minmax(0,1.1fr)' : '1fr', gap: 10 }}>{<div>{importableFiles.length ? importableFiles.map(entry => { const key = `${entry.sourceSessionId}:${entry.path}`; return <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: '1px solid #1e293b' }}><FaFile color="#818cf8"/><div style={{ flex: 1, minWidth: 0 }}><div style={{ color: '#f8fafc', fontWeight: 700 }}>{entry.path}</div><div style={{ color: '#94a3b8', fontSize: 11, marginTop: 3 }}>{entry.sourceSessionName || 'Previous session'} · {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : ''}</div></div><button onClick={() => setSelectedImport(entry)} style={{ background: 'rgba(99,102,241,.18)', color: '#c4b5fd', border: '1px solid #4f46e5', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', fontWeight: 700 }}>Preview</button></div>; }) : <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>No previous supervised files are available for this course.</div>}</div>}{selectedImport && <div style={{ minHeight: 250, display: 'flex', flexDirection: 'column', border: '1px solid #26334d', borderRadius: 8, overflow: 'hidden' }}><div style={{ padding: 10, color: '#c4b5fd', fontSize: 12, fontWeight: 700 }}>{selectedImport.path}<small style={{ display: 'block', color: '#94a3b8', marginTop: 3 }}>{selectedImport.language || 'text'} · copied as a new file</small></div><pre style={{ flex: 1, margin: 0, padding: 12, overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: 12 }}>{selectedImport.code || 'Preview is available after import on this desktop.'}</pre><button disabled={Boolean(importingPath)} onClick={() => importPreviousFile(selectedImport)} style={{ margin: 10, background: '#4f46e5', color: '#fff', border: 0, borderRadius: 6, padding: '9px 11px', cursor: 'pointer', fontWeight: 700 }}>{importingPath ? 'Importing…' : 'Import copy'}</button></div>}</div>
                    </div>
                </div>
            )}

            {showNotes && (
                <div style={{ position: 'fixed', zIndex: 11500, ...notesPosition, width: notesMinimized ? 230 : 360, minWidth: 230, minHeight: notesMinimized ? 0 : 180, resize: notesMinimized ? 'none' : 'both', overflow: 'auto', background: '#10192d', border: '1px solid #6366f1', borderRadius: 12, boxShadow: '0 18px 55px rgba(0,0,0,.48)' }}>
                    <div onPointerDown={event => { if (event.target.closest('button')) return; const rect = event.currentTarget.parentElement.getBoundingClientRect(); noteDragRef.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }; }} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: notesMinimized ? 0 : '1px solid #26334d', cursor: 'move', userSelect: 'none' }}><strong style={{ fontSize: 13 }}>Faculty notes</strong><span style={{ display: 'flex', gap: 6 }}><button onClick={() => setNotesMinimized(value => !value)} style={{ border: 0, background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>{notesMinimized ? '▣' : '—'}</button><button onClick={() => setShowNotes(false)} style={{ border: 0, background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: 18 }}>×</button></span></div>
                    {!notesMinimized && (sessionNotes.length ? <div style={{ padding: 16, color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}><strong style={{ display: 'block', color: '#c4b5fd', marginBottom: 7 }}>{sessionNotes[noteIndex]?.title || 'Faculty note'}</strong>{sessionNotes[noteIndex]?.message}<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, color: '#94a3b8', fontSize: 12 }}><button disabled={!noteIndex} onClick={() => setNoteIndex(value => Math.max(0, value - 1))} style={{ background: 'transparent', border: 0, color: '#a5b4fc', cursor: 'pointer' }}>← Previous</button><span>{noteIndex + 1} / {sessionNotes.length}</span><button disabled={noteIndex >= sessionNotes.length - 1} onClick={() => setNoteIndex(value => Math.min(sessionNotes.length - 1, value + 1))} style={{ background: 'transparent', border: 0, color: '#a5b4fc', cursor: 'pointer' }}>Next →</button></div></div> : <div style={{ padding: 22, color: '#94a3b8' }}>No notes from faculty yet.</div>)}
                </div>
            )}
        </div>
    );
};

export default LabMode;

