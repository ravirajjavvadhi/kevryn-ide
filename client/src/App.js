import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
// Kickstart Vercel Deploy - Force Sync
import Editor, { loader } from '@monaco-editor/react';
import io from 'socket.io-client';
import axios from 'axios';
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import {
    FaTerminal, FaPlay, FaSave, FaFolderPlus, FaFilePlus, FaFolder, FaFile, FaTrash, FaDownload, FaSync, FaSearch, FaTimes, FaBars, FaChevronRight, FaChevronDown, FaCode, FaCog, FaSignOutAlt, FaRocket, FaGlobe, FaBug, FaCube, FaShieldAlt, FaLightbulb, FaExchangeAlt, FaHistory, FaCheckCircle, FaExclamationTriangle, FaUserGraduate, FaChalkboardTeacher, FaProjectDiagram, FaBook, FaPuzzlePiece, FaMicrochip, FaNetworkWired, FaMagic, FaCloudUploadAlt, FaServer, FaEye, FaShareAlt, FaRobot, FaComments, FaCodeBranch, FaClipboardList, FaPaperPlane, FaPlus, FaEllipsisH, FaChevronUp, FaGithub, FaBell, FaSpinner
} from 'react-icons/fa';
import FileTree from './components/FileTree';
import Terminal from './components/Terminal';
import AIPanel from './components/AIPanel';
import AntigravityBackground from './components/AntigravityBackground';
import { GoogleLogin } from '@react-oauth/google';
import './App.css';
import DeploymentPanel from './components/DeploymentPanel';
import CloneModal from './components/CloneModal';
import SwitchRepoModal from './components/SwitchRepoModal';
import GitPanel from './components/GitPanel';
import AIDiffModal from './components/AIDiffModal';
import Breadcrumbs from './components/Breadcrumbs';
import GlobalSearch from './components/GlobalSearch';
import SnippetsPanel from './components/SnippetsPanel';
import TimelinePanel from './components/TimelinePanel';
import { WebContainer } from '@webcontainer/api';
import { WebContainerBridge } from './services/WebContainerBridge';
import LabMode from './components/LabMode';


import FacultyHub from './components/FacultyHub'; // NEW: Unified Hub
import StudentAssignmentView from './components/StudentAssignmentView'; // NEW: Student Assignments
import AdminDashboard from './components/AdminDashboard'; // NEW: Admin Dashboard
import IssueReporter from './components/IssueReporter'; // NEW: Issue Reporting

// --- MONACO CDN SETUP (More Reliable) ---
// Using CDN to avoid local worker resolution issues
loader.config({
    paths: {
        vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs'
    }
});

const _rawServerUrl = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
// Ensure protocol is present so URLs don't become relative paths on deployment
const SERVER_URL = _rawServerUrl.startsWith('http') ? _rawServerUrl : `https://${_rawServerUrl}`;

function App() {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [username, setUsername] = useState(() => {
        const u = localStorage.getItem('username');
        return (u && u !== 'undefined') ? u : "";
    });
    const [userId, setUserId] = useState(() => {
        const id = localStorage.getItem('userId');
        return (id && id !== 'undefined') ? id : "";
    });
    const [userRole, setUserRole] = useState(localStorage.getItem('role') || "student");
    const [isAppLoading, setIsAppLoading] = useState(() => !!localStorage.getItem('token')); // Load only if token exists
    const [isFacultyLogin, setIsFacultyLogin] = useState(false); // NEW: Faculty Toggle
    const [isLogin, setIsLogin] = useState(true);

    // Ensure loading screen turns off if no token
    useEffect(() => {
        if (!token) setIsAppLoading(false);
    }, [token]);
    const [showStudentAssignments, setShowStudentAssignments] = useState(false); // NEW: Default to workspace (IDE) first <!-- id: 401 -->
    const [authData, setAuthData] = useState({ username: '', password: '' });
    const [userPicture, setUserPicture] = useState(localStorage.getItem('picture') || null); // Store picture

    // --- LAB MODE STATE (Moved to top to fix ReferenceError) ---
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [activeSession, setActiveSession] = useState(null); // NEW: Store full session data (including courseId)
    const [isLabOpen, setIsLabOpen] = useState(false); // NEW: Explicitly control lab opening
    const [currentLabTime, setCurrentLabTime] = useState(0); // For display
    const timeTracker = useRef({}); // { [fileName]: seconds }
    const lastReportSync = useRef(Date.now());

    // --- ANIMATION HOOKS (Moved to top) ---
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useSpring(useTransform(y, [-300, 300], [15, -15]), { stiffness: 100, damping: 30 });
    const rotateY = useSpring(useTransform(x, [-300, 300], [-15, 15]), { stiffness: 100, damping: 30 });

    const handleTilt = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        x.set(e.clientX - centerX);
        y.set(e.clientY - centerY);
    };

    const resetTilt = () => {
        x.set(0); y.set(0);
    };

    const [code, setCode] = useState("// Select a file to start coding...");
    const [activeFileId, setActiveFileId] = useState(null);
    const [openFiles, setOpenFiles] = useState([]); // { _id, name, content }
    const [fileName, setFileName] = useState("");
    const [fileData, setFileData] = useState({ _id: "root", name: "Project", type: "folder", children: [] });
    const [activeMenu, setActiveMenu] = useState(null);
    const [activeRepo] = useState(""); // Track active authenticated repo name
    const [files, setFiles] = useState([]); // Flat list of files for path resolution

    const [sidebarTab, setSidebarTab] = useState('files');
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef(null);

    const [terminals, setTerminals] = useState([
        { id: 1, name: 'Local Terminal', type: 'local' }
    ]);
    const [activeTermId, setActiveTermId] = useState(1);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [deployStatus, setDeployStatus] = useState(null);

    // --- SLEEK LOADING SCREEN ---
    const LoadingScreen = () => (
        <div style={{
            height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#fff'
        }}>
            <div className="neon-indicator" style={{ width: '40px', height: '40px', marginBottom: '20px' }} />
            <div style={{ fontSize: '14px', fontWeight: '600', letterSpacing: '2px', color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                Initializing Workspace...
            </div>
            <div style={{ marginTop: '10px', fontSize: '10px', color: '#555' }}>Preparing Vayu Environment v2.0</div>
        </div>
    );

    // --- UTILS: SAFE STORAGE ---
    const persistAuth = (data) => {
        const u = data.user?.username || data.username;
        const id = data.user?._id || data.userId;
        const r = data.user?.role || data.role;
        const p = data.user?.picture || data.picture || "";

        if (u && u !== 'undefined') {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', u);
            localStorage.setItem('userId', id);
            localStorage.setItem('role', r);
            localStorage.setItem('picture', p);

            setToken(data.token);
            setUsername(u);
            setUserId(id);
            setUserRole(r);
            setUserPicture(p);
        }
    };

    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const editorRef = useRef(null);
    const [remoteCursors, setRemoteCursors] = useState({});
    const decorationsRef = useRef([]);
    const autoSaveTimeoutRef = useRef(null); // For debounced auto-save
    const codeSyncTimeoutRef = useRef(null); // For debounced socket sync
    const socketRef = useRef(null);
    const [socketConnected, setSocketConnected] = useState(false); // Used in listeners

    const webcontainerRef = useRef(null);
    const wcBridgeRef = useRef(null);
    const [webcontainerInstance, setWebcontainerInstance] = useState(null);
    const [wcReady, setWcReady] = useState(false);

    useEffect(() => {
        const bootWebContainer = async () => {
            if (webcontainerRef.current) return;
            try {
                console.log("[WebContainer] Booting...");
                const instance = await WebContainer.boot();
                webcontainerRef.current = instance;
                setWebcontainerInstance(instance);
                wcBridgeRef.current = new WebContainerBridge(instance, socketRef.current, userId);
                setWcReady(true);
                console.log("[WebContainer] Booted Successfully");
            } catch (e) {
                console.error("[WebContainer] Boot Failed:", e);
            }
        };
        bootWebContainer();
    }, [userId]);

    // --- RE-HYDRATE WEBCONTAINER FS ON LOAD ---
    useEffect(() => {
        if (wcReady && files.length > 0 && wcBridgeRef.current) {
            wcBridgeRef.current.mountFiles(files);
        }
    }, [wcReady, files, wcBridgeRef]);

    const api = useMemo(() => axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } }), [token]);

    const safeEmit = useCallback((event, data, callback) => {
        if (socketRef.current) {
            socketRef.current.emit(event, data, callback);
        }
    }, []);

    // --- CENTRALIZED LOGOUT ---
    const handleLogout = useCallback(() => {
        // 1. Clear all auth-related local storage
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('userId');
        localStorage.removeItem('role');
        localStorage.removeItem('picture');
        localStorage.removeItem('lastSessionId');
        localStorage.removeItem('theme'); // Optional: keep or clear based on preference, clearing for safety

        // 2. Reset State
        setToken(null);
        setUsername("");
        setUserId("");
        setUserRole("student"); // Default back to student
        setIsFacultyLogin(false); // Default back to student login
        setIsLogin(true);
        setActiveSessionId(null);
        setActiveSession(null); // NEW: Reset full session
        setIsLabOpen(false);
        setDeployStatus(null);

        // 3. Force Reload to clear any lingering React state/sockets
        window.location.href = "/";
    }, []);

    const findFileFullPath = useCallback((fileId) => {
        const buildPath = (id) => {
            const f = files.find(item => item._id === id);
            if (!f) return '';
            if (f.parentId === 'root' || !f.parentId) return f.name;
            return `${buildPath(f.parentId)}/${f.name}`;
        };
        return buildPath(fileId);
    }, [files]);

    const handleSave = useCallback(async () => {
        if (!activeFileId) return;
        const fullPath = findFileFullPath(activeFileId);
        console.log(`[SAVE] Triggered for ${fullPath} (${activeFileId})`);
        try {
            await api.put(`/files/${activeFileId}`, { content: code });
            safeEmit('save-file-disk', { fileName: fullPath, code: code, userId, fileId: activeFileId });
            if (wcBridgeRef.current) {
                await wcBridgeRef.current.writeFile(fullPath, code);
            }
            alert("Saved!");
        } catch (e) {
            console.error("[SAVE] Failed:", e);
            alert("Error saving file");
        }
    }, [activeFileId, findFileFullPath, api, code, safeEmit, userId, wcBridgeRef]);

    // --- THEME STATE ---
    const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('theme') || 'midnight'); // Default to Midnight for best effect

    // --- BOTTOM PANEL STATE ---
    const [bottomPanelTab, setBottomPanelTab] = useState('terminal');
    const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
    const [bottomPanelHeight, setBottomPanelHeight] = useState(350); // Increased default height
    const [isResizingPanel, setIsResizingPanel] = useState(false);
    const [isBottomPanelMaximized, setIsBottomPanelMaximized] = useState(false);
    const prevBottomPanelHeight = useRef(250);

    // --- AI PANEL STATE ---
    const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
    const [aiPanelWidth, setAiPanelWidth] = useState(350);
    const [isResizingAi, setIsResizingAi] = useState(false);

    // --- CLONE MODAL STATE ---
    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [isSwitchRepoModalOpen, setIsSwitchRepoModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

    // --- AI DIFF MODAL STATE ---
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
    const [diffData, setDiffData] = useState({ oldCode: '', newCode: '', fileName: '', language: 'javascript', onApply: null });
    const [terminalError, setTerminalError] = useState(null); // Keep self-healing state but remove WC state <!-- id: 400 -->

    // --- GLOBAL SEARCH STATE ---
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isIssueReporterOpen, setIsIssueReporterOpen] = useState(false); // NEW: Issue Reporter State

    const startResizingAi = useCallback((e) => {
        e.preventDefault(); // Prevent text selection
        setIsResizingAi(true);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizingAi) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 250 && newWidth < 800) {
                setAiPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizingAi(false);
        };

        if (isResizingAi) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingAi]);

    // Keyboard Listeners (Ctrl+Shift+F for Search)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleDebugTerminal = () => {
        const output = window.getTerminalOutput ? window.getTerminalOutput(activeTermId) : "";
        if (!output || output.trim() === "") {
            alert("Terminal buffer is empty. Run a command first!");
            return;
        }

        setIsAiPanelOpen(true);
        if (window.triggerAiChat) {
            window.triggerAiChat(`I have an error in my terminal. Here is the output:\n\n\`\`\`\n${output}\n\`\`\`\n\nCan you explain what's wrong and provide a fix?`);
        } else {
            // Fallback if AIPanel is not mounted yet
            setTimeout(() => {
                if (window.triggerAiChat) {
                    window.triggerAiChat(`I have an error in my terminal. Here is the output:\n\n\`\`\`\n${output}\n\`\`\`\n\nCan you explain what's wrong and provide a fix?`);
                }
            }, 500);
        }
    };

    // --- BOTTOM PANEL RESIZE HANDLER ---
    const startResizingPanel = useCallback((e) => {
        e.preventDefault();
        setIsResizingPanel(true);
        document.body.classList.add('resizing-row');
    }, []);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizingPanel) return;
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight > 50 && newHeight < window.innerHeight * 0.8) {
                setBottomPanelHeight(newHeight);
                prevBottomPanelHeight.current = newHeight;
            }
        };

        const handleMouseUp = () => {
            setIsResizingPanel(false);
            document.body.classList.remove('resizing-row');
        };

        if (isResizingPanel) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingPanel]);

    const toggleBottomPanelMaximize = () => {
        if (isBottomPanelMaximized) {
            setBottomPanelHeight(prevBottomPanelHeight.current);
            setIsBottomPanelMaximized(false);
        } else {
            prevBottomPanelHeight.current = bottomPanelHeight;
            setBottomPanelHeight(window.innerHeight * 0.7);
            setIsBottomPanelMaximized(true);
        }
    };

    // Apply Theme to Body
    useEffect(() => {
        document.body.setAttribute('data-theme', currentTheme);
        localStorage.setItem('theme', currentTheme);
    }, [currentTheme]);

    const getMonacoTheme = () => {
        switch (currentTheme) {
            case 'light': return 'kevryn-light';
            case 'high-contrast': return 'hc-black';
            default: return 'kevryn-dark'; // Dark, Midnight, Forest
        }
    };

    const handleEditorWillMount = (monaco) => {
        monaco.editor.defineTheme('kevryn-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: { 'editor.background': '#00000000' }
        });
        monaco.editor.defineTheme('kevryn-light', {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: { 'editor.background': '#ffffff00' }
        });
    };


    const fetchFiles = useCallback(() => {
        if (!token) return;

        // Debounce logic: cancel existing timer
        if (window.fetchFilesTimer) clearTimeout(window.fetchFilesTimer);

        window.fetchFilesTimer = setTimeout(() => {
            api.get('/files').then(res => {
                setFiles(res.data); // Store flat list
                const map = {}, nodeTree = { _id: "root", name: "Project Root", type: "folder", children: [] };
                res.data.forEach(node => { map[node._id] = { ...node, children: [] }; });
                res.data.forEach(node => {
                    if (node.parentId !== "root") {
                        if (map[node.parentId]) map[node.parentId].children.push(map[node._id]);
                    } else {
                        nodeTree.children.push(map[node._id]);
                    }
                });
                // FIX: Display imported folder as root if it's the only one
                if (nodeTree.children.length === 1 && nodeTree.children[0].type === 'folder') {
                    setFileData(nodeTree.children[0]);
                } else {
                    setFileData(nodeTree);
                }
                setIsAppLoading(false); // Boot sequence complete
            }).catch(err => {
                console.log("Fetch Error");
                setIsAppLoading(false); // Don't hang forever
            });
        }, 300); // 300ms debounce
    }, [token, api]);

    // Handle Global Shortcuts (Ctrl+S)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeFileId, fileName, code, handleSave]);

    const [socketInstance, setSocketInstance] = useState(null);

    // --- SOCKET INITIALIZATION & LISTENERS ---
    useEffect(() => {
        if (!token) return;

        if (!socketRef.current) {
            console.log("[SOCKET] Initializing...");
            socketRef.current = io(SERVER_URL, {
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 10
            });
            setSocketInstance(socketRef.current);

            socketRef.current.on('disconnect', () => {
                setSocketConnected(false);
                console.warn('Socket Disconnected');
            });
        }

        // --- VAYU STUDENT MONITOR LOGIC ---
        // If student, check for active session and join
        if (userRole === 'student' && token) {
            const checkSession = async () => {
                try {
                    const res = await api.get('/lab/student/active-session');
                    if (res.data.session) {
                        const sess = res.data.session;
                        console.log("Found Active Session:", sess._id);
                        setActiveSessionId(sess._id); // FIX: Update state so banner appears
                        setActiveSession(sess); // FIX: Store full session object for LabMode
                        // socketRef.current.emit('join-session', ...); // REMOVED: Don't auto-join yet
                    }
                } catch (e) { console.error("Session Check Failed", e); }
            };
            checkSession();
        }

    }, [token, userRole, api]);

    useEffect(() => {
        if (isLabOpen && activeSessionId && socketRef.current) {
            console.log("Joining Session Socket Room:", activeSessionId);
            window.currentLabSessionId = activeSessionId;
            socketRef.current.emit('student-join-lab', { sessionId: activeSessionId, username: username, role: 'student' });
        }
    }, [isLabOpen, activeSessionId, username]);



    // --- SOCKET EVENT LISTENERS ---
    useEffect(() => {
        if (!socketRef.current) return;
        const s = socketRef.current;

        s.emit('register-user', username);
        fetchFiles();
        safeEmit('join-chat', { username });
        api.get('/deploy/status').then(res => setDeployStatus(res.data)).catch(() => { });

        const handleReceiveMessage = (msg) => { setChatMessages(prev => [...prev, msg]); };
        s.on('receive-message', handleReceiveMessage);
        s.on('previous-messages', (msgs) => setChatMessages(msgs));
        s.on('receive-code', (newCode) => { isRemoteUpdate.current = true; setCode(newCode); });
        s.on('node-created', fetchFiles);
        s.on('file-shared', (fname) => { alert(`New file synced: ${fname}`); fetchFiles(); });

        s.on('cursor-update', ({ userId: rUserId, username: rUsername, position: rPosition }) => {
            if (rUserId === userId) return;
            setRemoteCursors(prev => ({ ...prev, [rUserId]: { username: rUsername, position: rPosition, color: getRandomColor(rUserId) } }));
        });

        // NEW: Listen for new sessions (Real-time join)
        s.on('session-started', (sess) => {
            if (userRole === 'student' && sess) {
                // Verify student is allowed
                if (sess.allowedStudents && sess.allowedStudents.includes(username)) {
                    setActiveSessionId(sess._id);
                    setActiveSession(sess);
                    alert(`A new Lab Session "${sess.sessionName}" has started! Click 'Join Session' in the banner.`);
                }
            }
        });


        // Listen for session end from faculty (global broadcast)
        s.on('session-ended', () => {
            setActiveSessionId(null);
            setActiveSession(null);
            setIsLabOpen(false);
            window.currentLabSessionId = null;
            if (userRole === 'student') {
                alert("The lab session has been ended by the instructor.");
            }
        });

        const closeMenu = () => setActiveMenu(null);
        window.addEventListener('click', closeMenu);

        return () => {
            s.off('receive-message');
            s.off('previous-messages');
            s.off('receive-code');
            s.off('node-created');
            s.off('file-shared');
            s.off('cursor-update');
            s.off('session-started');
            s.off('session-ended');
            window.removeEventListener('click', closeMenu);
        };
    }, [token, username, userId, fetchFiles, api, userRole]); // Simplified dependencies



    // --- GITHUB OAUTH HANDLE ---
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const urlToken = query.get('token');
        const urlUsername = query.get('username');
        const urlUserId = query.get('userId');
        const urlPicture = query.get('picture');

        if (urlToken && urlUsername && urlUserId) {
            persistAuth({
                token: urlToken,
                username: urlUsername,
                userId: urlUserId,
                picture: urlPicture,
                role: 'student' // OAuth defaults to student
            });
            window.history.replaceState({}, document.title, "/");
        }
    }, [persistAuth]);

    const getRandomColor = (id) => {
        const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };



    // --- LAB MODE RENDER ---
    // If student and active session exists, show Lab Mode
    // We need a state for this. using 'activeSessionId' if set.
    // --- LAB MODE RENDER ---
    // If student and active session exists, show Lab Mode
    // We need a state for this. using 'activeSessionId' if set.
    // (State moved to top)

    // --- LAB TIMER & REPORT SYNC ---
    useEffect(() => {
        let interval;
        if (isLabOpen && activeFileId) {
            interval = setInterval(() => {
                const fname = openFiles.find(f => f._id === activeFileId)?.name;
                if (fname) {
                    if (!timeTracker.current[fname]) timeTracker.current[fname] = 0;
                    timeTracker.current[fname] += 1;
                    setCurrentLabTime(timeTracker.current[fname]);

                    // Auto-sync every 30 seconds
                    if (Date.now() - lastReportSync.current > 30000) {
                        saveLabReport(fname, code); // Sync current file
                        lastReportSync.current = Date.now();
                    }
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isLabOpen, activeFileId, openFiles, code]);

    const saveLabReport = async (fname, fcode, timeDelta, status = 'in-progress') => {
        if (!activeSessionId) return;

        try {
            await api.post('/lab/update-report', {
                courseName: "General Lab",
                fileName: fname,
                code: fcode,
                timeSpent: timeDelta, // Send the DELTA, not total
                status
            });
        } catch (e) { console.error("Report sync failed", e); }
    };

    // RE-IMPLEMENTING TIMER TO SEND DELTAS SAFELY
    const pendingTime = useRef({}); // { [fileName]: seconds_since_last_sync }

    useEffect(() => {
        let interval;
        if (isLabOpen && activeFileId) {
            interval = setInterval(() => {
                const fname = openFiles.find(f => f._id === activeFileId)?.name;
                if (fname) {
                    if (!pendingTime.current[fname]) pendingTime.current[fname] = 0;
                    pendingTime.current[fname] += 1;
                    setCurrentLabTime((prev) => prev + 1);

                    // Sync
                    if (pendingTime.current[fname] >= 30) {
                        saveLabReport(fname, code, 30, 'in-progress'); // Pass 30 as timeDelta
                        pendingTime.current[fname] = 0;
                    }
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isLabOpen, activeFileId, openFiles, code]);

    // Update the session check to populate this state
    useEffect(() => {
        if (userRole === 'student' && token) {
            // FIXED Bug 1: Use the correct STUDENT endpoint (not the faculty endpoint)
            api.get('/lab/student/active-session').then(res => {
                const sess = res.data.session;
                if (sess && sess.isActive) {
                    setActiveSessionId(sess._id);
                    setActiveSession(sess); // Store full session
                    window.currentLabSessionId = sess._id;
                } else {
                    // FIXED Bug 4: Clear any stale session state on login
                    setActiveSessionId(null);
                    setActiveSession(null);
                    window.currentLabSessionId = null;
                }
            }).catch(e => { });
        }
    }, [token, userRole, api]);



    const handleAgenticFix = async (error) => {
        if (!activeFileId) return;
        setTerminalError(null);
        setIsAiLoading(true);

        try {
            const currentContent = code;
            const prompt = `The user ran a command in the terminal and it failed with the following error:\n\n${error.output}\n\nHere is the current content of the file "${fileName}":\n\n\`\`\`\n${currentContent}\n\`\`\`\n\nPlease fix the bug in the code that caused this error. Return ONLY the fully corrected code, no explanations.`;

            const response = await api.post('/ai/chat', { message: prompt });
            let fixedCode = response.data.reply;

            // Simple cleanup for LLM markdown formatting
            if (fixedCode.includes('```')) {
                fixedCode = fixedCode.split('```')[1].replace(/^[a-z]*\n/, '');
            }

            // Apply fix locally
            setCode(fixedCode);
            setOpenFiles(prev => prev.map(f => f._id === activeFileId ? { ...f, content: fixedCode } : f));

            // Save to DB and Disk
            await api.put(`/files/${activeFileId}`, { content: fixedCode });
            safeEmit('save-file-disk', { fileName, code: fixedCode, userId, fileId: activeFileId });

            // Notify user in chat
            setChatMessages(prev => [...prev, { role: 'ai', content: `✨ **Self-Healing:** I've corrected the bug in \`${fileName}\` that caused the terminal error.` }]);

        } catch (err) {
            console.error('[AgenticFix] Failed:', err);
            alert("Failed to apply AI fix.");
        } finally {
            setIsAiLoading(false);
        }
    };

    // --- AUTO-DEV EXECUTION HANDLER ---
    const executeAutoDevPlan = async (plan) => {
        console.log("Executing Auto-Dev Plan:", plan);
        setIsBottomPanelOpen(true);
        setBottomPanelTab('terminal');
        let firstFilePath = null;
        const waitFor = (ms) => new Promise(r => setTimeout(r, ms));

        const emitAsync = (ev, data) => new Promise((resolve, reject) => {
            if (!socketRef.current) return reject(new Error("Socket disconnected"));
            safeEmit(ev, data, (res) => {
                if (res && res.error) reject(new Error(res.error));
                else resolve(res);
            });
            setTimeout(() => reject(new Error(`Timeout waiting for ${ev}`)), 10000);
        });

        try {
            if (plan.files && plan.files.length > 0) {
                const res = await api.get('/files');
                const existingFiles = res.data;

                for (const file of plan.files) {
                    if (!firstFilePath && (file.action === 'create' || file.action === 'update')) firstFilePath = file.path;

                    if (file.action === 'create' || file.action === 'update') {
                        const existing = existingFiles.find(f => f.name === file.path);
                        if (existing) {
                            await api.put(`/files/${existing._id}`, { content: file.content });
                            await emitAsync('save-file-disk', { fileName: file.path, code: file.content, userId });
                        } else {
                            await emitAsync('create-node', { parentId: 'root', newNode: { name: file.path, type: 'file', content: file.content }, userId });
                        }
                        setOpenFiles(prev => prev.map(f => f.name === file.path ? { ...f, content: file.content } : f));
                        if (fileName === file.path) setCode(file.content);
                    } else if (file.action === 'delete') {
                        const existing = existingFiles.find(f => f.name === file.path);
                        if (existing) await api.delete(`/files/${existing._id}`);
                    }
                }
            }

            if (plan.commands && plan.commands.length > 0) {
                const termId = activeTermId || 1;
                for (const cmd of plan.commands) {
                    safeEmit('terminal:write', { termId, data: cmd + '\r' });
                    await waitFor(2000);
                }
            }

            fetchFiles();
            if (firstFilePath) {
                const res = await api.get('/files');
                const targetFile = res.data.find(f => f.name === firstFilePath);
                if (targetFile) handleFileClick(targetFile);
            }
            return true;
        } catch (e) {
            console.error("Auto-Dev Error:", e);
            alert("Auto-Dev failed: " + e.message);
            throw e;
        }
    };

    window.handleAutoDevExecution = executeAutoDevPlan;
    window.openDiff = (data) => { setDiffData(data); setIsDiffModalOpen(true); };

    // --- GITHUB OAUTH HANDLE ---
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const urlToken = query.get('token');
        const urlUsername = query.get('username');
        const urlUserId = query.get('userId');
        const urlPicture = query.get('picture');

        if (urlToken && urlUsername && urlUserId) {
            localStorage.setItem('token', urlToken);
            localStorage.setItem('username', urlUsername);
            localStorage.setItem('userId', urlUserId);
            if (urlPicture) localStorage.setItem('picture', urlPicture);

            setToken(urlToken);
            setUsername(urlUsername);
            setUserId(urlUserId);
            setUserPicture(urlPicture);

            // Clear URL
            window.history.replaceState({}, document.title, "/");
        }
    }, []);



    // Update Monaco Decorations for Cursors
    useEffect(() => {
        if (!editorRef.current || !window.monaco) return;

        // Convert remoteCursors state to decorations
        const newDecorations = Object.keys(remoteCursors).map(uid => {
            const { position, color, username: uname } = remoteCursors[uid];
            if (!position) return null;

            return {
                range: new window.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                options: {
                    className: `remote-cursor-${uid}`,
                    hoverMessage: { value: `User: ${uname}` },
                    beforeContentClassName: `remote-cursor-label-${uid}`
                }
            };
        }).filter(Boolean);

        // We need to inject dynamic CSS for the labels/colors
        // This is a bit "hacky" in a functional component but works for this scale.
        const styleId = 'remote-cursor-styles';
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
        }

        let css = `.remote-cursor { border-left: 2px solid; margin-left: -1px; }`;
        Object.keys(remoteCursors).forEach(uid => {
            const { color, username: uname } = remoteCursors[uid];
            css += `
            .remote-cursor-${uid} { border-left: 2px solid ${color}; }
            .remote-cursor-label-${uid}::before {
                content: "${uname}";
                position: absolute;
                top: -18px;
                left: 0;
                background: ${color};
                color: white;
                font-size: 10px;
                padding: 1px 4px;
                border-radius: 3px;
                opacity: 0.8;
                pointer-events: none;
                white-space: nowrap;
            }
        `;
        });
        // However, Monaco `className` doesn't easily support dynamic classes unless we define them in CSS.
        // Wait, the `options` object above uses `remote-cursor-${uid}` as className.
        // So if we inject the CSS for `.remote-cursor-${uid}`, it should work!

        styleTag.innerHTML = css;

        // Decorate
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);

    }, [remoteCursors, activeFileId]); // Re-run when cursors change or file changes

    const handleCreateFromTemplate = async (templateId) => {
        const folderName = prompt("Enter project folder name:", "my-new-app");
        if (!folderName) return;

        try {
            setIsAiLoading(true);
            const res = await api.post('/templates/create', { templateId, folderName, userId });
            console.log("Template Created:", res.data);
            setIsTemplateModalOpen(false);
            fetchFiles();
            alert(`Project ${folderName} created successfully!`);
        } catch (e) {
            alert("Error creating template: " + (e.response?.data?.error || e.message));
        } finally {
            setIsAiLoading(false);
        }
    };

    const createNode = (type, parentId = 'root') => {
        if (!userId) return alert("Please login again (User ID missing).");
        const name = prompt(`Enter ${type} name:`);
        if (name) safeEmit('create-node', { parentId, newNode: { name, type }, userId });
    };

    const handleFileUpload = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!userId) return alert("Error: User ID missing. Please re-login.");

        const r = new FileReader();
        r.onload = (ev) => {
            const content = ev.target.result;
            safeEmit('create-node', { parentId: 'root', newNode: { name: f.name, type: 'file', content }, userId });
            setTimeout(() => { alert("File uploaded!"); fetchFiles(); }, 500);
        };
        r.readAsText(f);
    };

    const handleFolderUpload = async (e) => {
        const files = e.target.files; if (!files || files.length === 0) return;
        const buildTree = async (fileList) => {
            const root = fileList[0].webkitRelativePath.split('/')[0];
            const tree = { name: root, type: 'folder', children: [] };
            const isBin = (n) => ['png', 'jpg', 'jpeg', 'gif', 'ico', 'pdf', 'exe', 'dll', 'bin', 'zip', 'pyc', 'class', 'mp4'].includes(n.split('.').pop().toLowerCase());
            for (let i = 0; i < fileList.length; i++) {
                const f = fileList[i]; const parts = f.webkitRelativePath.split('/');
                if (parts.some(p => p === 'node_modules' || p === '.git' || p === 'dist' || p === 'build')) continue;
                if (isBin(f.name) || f.size > 1024 * 1024) continue;
                let curr = tree;
                for (let j = 1; j < parts.length - 1; j++) {
                    const p = parts[j];
                    let ex = curr.children.find(c => c.name === p && c.type === 'folder');
                    if (!ex) { ex = { name: p, type: 'folder', children: [] }; curr.children.push(ex); }
                    curr = ex;
                }
                try { const c = await f.text(); curr.children.push({ name: parts[parts.length - 1], type: 'file', content: c }); } catch (err) { }
            }
            return tree;
        };
        try { await api.post('/project/upload', { tree: await buildTree(files) }); alert("Project uploaded!"); fetchFiles(); } catch (e) { alert("Upload failed."); }
    };

    const getLanguage = (fname) => {
        if (fname.endsWith('.js')) return 'javascript';
        if (fname.endsWith('.html')) return 'html';
        if (fname.endsWith('.css')) return 'css';
        if (fname.endsWith('.py')) return 'python';
        if (fname.endsWith('.java')) return 'java';
        if (fname.endsWith('.c') || fname.endsWith('.cpp')) return 'cpp';
        return 'plaintext';
    };


    const handleSaveAs = async () => {
        if (!userId) return;
        const newName = prompt("Save As (Enter new filename):", "copy_" + fileName);
        if (!newName) return;

        // Create new file with current code
        safeEmit('create-node', { parentId: 'root', newNode: { name: newName, type: 'file' }, userId });

        // Wait for creation then save content (simulated by timeout or just rely on backend to create empty file then save)
        // Better: Backend create-node creates empty file. We need to save content to it.
        // We can listen for node-created and then save, but that's complex async.
        // Simple hack: wait 500ms then save to disk with new name.
        // Even better: The backend 'save-file-disk' saves by FILENAME. So if we create it, we can save to it.
        setTimeout(() => {
            // Note: For Save As, we don't have the new fileId easily yet unless we listen for creation.
            // But since it's saved in the root by default if no ID is provided, and Save As currently flattens to root anyway,
            // we'll keep it as is for now, OR we can pass it if we get it.
            safeEmit('save-file-disk', { fileName: newName, code, userId });
            alert("Saved as " + newName);
        }, 500);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete?")) return;
        try {
            const fileToDelete = files.find(f => f._id === id);
            await api.delete(`/files/${id}`);
            if (activeFileId === id) { setActiveFileId(null); setFileName(""); setCode(""); }
            // Sync WebContainer: Simplest is re-mount or delete specifically
            if (wcBridgeRef.current && fileToDelete) {
                // For now, re-fetch and re-mount ensures correctness
                setTimeout(fetchFiles, 500);
            } else {
                fetchFiles();
            }
        } catch (e) { }
    };
    const handleRename = async (f) => {
        const n = prompt("New name:", f.name);
        if (n) {
            try {
                await api.put(`/files/${f._id}`, { newName: n });
                if (activeFileId === f._id) setFileName(n);
                fetchFiles();
            } catch (e) { }
        }
    };
    const handleDownload = (file) => {
        if (!file || file.type !== 'file') return;
        const content = file.content || '';
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleFileClick = async (file, lineToJump = null) => {
        try {
            let targetFile = file;
            if (typeof file === 'string') {
                const res = await api.get('/files');
                const found = res.data.find(f => f.name === file);
                if (found) targetFile = found;
                else return alert("File not found in project.");
            }

            const res = await api.get(`/files/${targetFile._id}`);
            const content = res.data.content || "";

            setActiveFileId(targetFile._id);
            setFileName(targetFile.name);
            setCode(content);

            const existing = openFiles.find(f => f._id === targetFile._id);
            if (!existing) {
                setOpenFiles(prev => [...prev, { ...targetFile, content }]);
            }

            safeEmit('join-file', targetFile._id);

            // Jump to line if provided (e.g., from search)
            if (lineToJump && editorRef.current) {
                setTimeout(() => {
                    editorRef.current.revealLineInCenter(lineToJump);
                    editorRef.current.setPosition({ lineNumber: lineToJump, column: 1 });
                    editorRef.current.focus();
                }, 200);
            }
        } catch (e) {
            console.error("File loading error:", e);
        }
    };

    const closeTab = (e, id) => {
        e.stopPropagation();
        const newOpen = openFiles.filter(f => f._id !== id);
        setOpenFiles(newOpen);
        if (activeFileId === id) {
            if (newOpen.length > 0) {
                const last = newOpen[newOpen.length - 1];
                setActiveFileId(last._id);
                setFileName(last.name);
                setCode(last.content);
                safeEmit('join-file', last._id);
            } else {
                setActiveFileId(null);
                setFileName("");
                setCode("// Select a file to start coding...");
            }
        }
    };

    const runCode = async () => {
        if (!activeFileId) return alert("Select file!");
        const fullPath = findFileFullPath(activeFileId);
        const activeFileName = fullPath;
        const ext = activeFileName.split('.').pop().toLowerCase();

        // FORCE SAVE BEFORE RUN
        try {
            await api.put(`/files/${activeFileId}`, { content: code });
            if (wcBridgeRef.current) {
                await wcBridgeRef.current.writeFile(fullPath, code);
            }
        } catch (e) {
            console.error("Auto-save to DB before run failed:", e);
        }

        // Save to disk must happen even if DB save fails to allow terminal execution
        safeEmit('save-file-disk', { fileName: fullPath, code, userId, fileId: activeFileId });

        if (activeFileName.endsWith('.html')) {
            window.open(`${SERVER_URL}/preview/${userId}/${activeFileName}`, '_blank');
            return;
        }

        let cmd = "";
        const isWin = window.navigator.platform.toUpperCase().indexOf('WIN') >= 0;
        const exePrefix = isWin ? '.\\' : './';

        // Same command set as LabMode for consistency
        const commands = {
            'js': `node "${activeFileName}"`,
            'py': `python3 "${activeFileName}" || python "${activeFileName}"`,
            'java': `javac "${activeFileName}" && java "${activeFileName.replace('.java', '')}"`,
            'c': `gcc "${activeFileName}" -o output && ${exePrefix}output`,
            'cpp': `g++ "${activeFileName}" -o output && ${exePrefix}output`,
            'rb': `ruby "${activeFileName}"`,
            'go': `go run "${activeFileName}"`,
            'php': `php "${activeFileName}"`,
            'ts': `npx ts-node "${activeFileName}"`,
        };

        cmd = commands[ext];

        if (cmd) {
            const isServerLanguage = ['py', 'c', 'cpp', 'java'].includes(ext);

            setBottomPanelTab('terminal');
            setIsBottomPanelOpen(true);

            setTimeout(() => {
                const inputs = window.ideTerminalInputs || {};
                const termIdToUse = activeTermId || 1;
                const inputWriter = inputs[termIdToUse];

                if (!isServerLanguage && inputWriter && typeof inputWriter.write === 'function') {
                    // Local WebContainer execution
                    inputWriter.write(cmd + '\r');
                } else {
                    // Server PTY execution (or fallback if local not ready)
                    safeEmit('terminal:write', {
                        termId: termIdToUse,
                        data: cmd + '\r',
                        courseId: activeSession?.courseId // Respect lab context if active
                    });
                }
            }, 100);
        } else {
            alert("Auto-run is not configured for this file type. You can manually run it in the terminal.");
        }
    };

    const handleAIFix = async () => {
        if (!activeFileId || !code) return alert("Open a file first!");
        const instruction = prompt("What should AI do?");
        if (!instruction) return;
        setIsAiLoading(true);
        try {
            const res = await api.post('/ai/fix', { code, instruction }, { timeout: 15000 });
            if (res.data.fixedCode) { setCode(res.data.fixedCode); alert("AI Magic applied! ✨"); }
        } catch (e) { alert("AI Error"); } finally { setIsAiLoading(false); }
    };

    const openPort = () => { const p = prompt("Port:"); if (p) window.open(`http://localhost:${p}`, '_blank'); };
    const addTerm = () => {
        const nextId = terminals.length > 0 ? (Math.max(...terminals.filter(t => typeof t.id === 'number').map(t => t.id), 0) + 1) : 2;
        setTerminals([...terminals, { id: nextId, name: `Terminal ${nextId}`, type: 'local' }]);
        setActiveTermId(nextId);
    };
    const remTerm = (id) => {
        if (id === 'server-1') return alert("Cannot close the main Server Terminal.");
        const n = terminals.filter(t => t.id !== id);
        setTerminals(n);
        if (activeTermId === id && n.length > 0) setActiveTermId(n[0].id);
    };
    const sendChatMessage = (e) => { e.preventDefault(); if (!chatInput.trim()) return; safeEmit('send-message', { sender: username, text: chatInput }); setChatInput(""); };
    const shareSingleFile = async () => {
        if (!activeFileId) return alert("Select a file first!");
        const target = prompt("Enter username to share THIS file with:");
        if (target) { try { await api.post('/share', { fileId: activeFileId, targetUsername: target }); safeEmit('notify-share', { targetUsername: target, fileName }); alert(`File shared with ${target}!`); } catch (e) { alert("Share failed."); } }
    };
    const handleSyncProject = async () => {
        const target = prompt("Enter username to SYNC entire project with:");
        if (target) { try { await api.post('/project/sync', { targetUsername: target }); safeEmit('notify-share', { targetUsername: target, fileName: "ENTIRE PROJECT" }); alert(`Project Synced!`); } catch (e) { alert("Sync failed."); } }
    };

    const deployFrontend = async () => {
        if (!window.confirm("Deploy current project as Frontend?")) return;

        const siteName = prompt("Enter a unique site name (e.g., 'myapp'). Leave empty for default:");
        let backendUrl = "";

        if (deployStatus?.backend?.url) {
            if (window.confirm(`Inject running backend URL (${deployStatus.backend.url})?`)) {
                backendUrl = deployStatus.backend.url;
            }
        }

        if (!backendUrl) {
            backendUrl = prompt("Enter Backend API URL (optional):");
        }

        try {
            // NEW: Pass courseId if in lab context to ensure correct project root is deployed
            const res = await api.post('/deploy/frontend', {
                siteName,
                backendUrl,
                courseId: activeSession?.courseId || null
            });
            alert(res.data.message);
            const fullUrl = res.data.url.startsWith('http') ? res.data.url : `${SERVER_URL}${res.data.url}`;
            window.open(fullUrl, '_blank');
        } catch (e) { alert("Deploy Failed: " + (e.response?.data?.error || e.message)); }
    };

    const deployBackend = async () => {
        const entry = prompt("Enter backend entry file (e.g., server.js or index.js):", "server.js");
        if (!entry) return;
        try {
            const res = await api.post('/deploy/backend', {
                entryFile: entry,
                courseId: activeSession?.courseId || null
            });
            const fullUrl = res.data.url.startsWith('http') ? res.data.url : `${SERVER_URL}${res.data.url}`;
            alert(`Backend Live at: ${fullUrl}`);
            setDeployStatus(prev => ({ ...prev, backend: { url: res.data.url, status: "Running", port: res.data.port } }));
            setIsBottomPanelOpen(true);
            setBottomPanelTab('deployment');
        } catch (e) { alert(e.response?.data?.error || "Deploy Failed"); }
    };

    const stopBackend = async () => {
        try {
            await api.post('/deploy/stop');
            alert("Backend Stopped");
            setDeployStatus(prev => ({ ...prev, backend: null }));
        } catch (e) { alert("Failed to stop"); }
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        // Send role for both login and registration
        const payload = { ...authData, role: isFacultyLogin ? 'faculty' : 'student' };

        try {
            const r = await api.post(isLogin ? '/auth/login' : '/auth/register', payload);
            if (isLogin) {
                // Determine role from server
                const role = r.data.role || (isFacultyLogin ? 'faculty' : 'student');

                // --- STRICT ROLE VALIDATION ---
                // Admins can login via Faculty Portal
                if (isFacultyLogin && role !== 'faculty' && role !== 'admin') {
                    alert("Access Denied: You are trying to log in as Faculty, but this account is a Student. Please use the Student Login.");
                    return;
                }
                if (!isFacultyLogin && role !== 'student') {
                    alert("Access Denied: You are trying to log in as Student, but this account is Faculty/Admin. Please use the Management Login.");
                    return;
                }

                persistAuth(r.data);
                setIsAppLoading(false);

            } else { alert("Registered! Please Log In."); setIsLogin(true); }
        } catch (e) { alert("Auth Failed: " + (e.response?.data?.error || e.message)); }
    };

    // Google Login Handler
    const handleGoogleLoginSuccess = async (credentialResponse) => {
        try {
            const res = await api.post('/auth/google', { token: credentialResponse.credential });
            const { token, username, userId, picture, role } = res.data; // Ensure role is returned

            const userRole = role || "student";

            // --- STRICT ROLE VALIDATION FOR GOOGLE LOGIN ---
            // If they are on Faculty Login screen, they must be Faculty or Admin
            if (isFacultyLogin && userRole !== 'faculty' && userRole !== 'admin') {
                alert("Access Denied: This Google account is registered as a Student. Please switch to Student Login.");
                return;
            }
            // If they are on Student Login screen, they must be Student
            if (!isFacultyLogin && userRole !== 'student') {
                alert("Access Denied: This Google account is Faculty/Admin. Please switch to Management Login.");
                return;
            }

            persistAuth(res.data);
            setIsAppLoading(false);

        } catch (err) {
            console.error("Google Login Failed", err);
            alert("Google Login Failed");
        }
    };

    const logout = () => {
        localStorage.clear();
        setToken(null);
        setUserPicture(null);
        setUserRole("student"); // Reset role on logout
        window.location.reload();
    };




    const handleGlobalMouseMove = (e) => {
        const x = e.clientX;
        const y = e.clientY;
        document.documentElement.style.setProperty('--mouse-x', `${x}px`);
        document.documentElement.style.setProperty('--mouse-y', `${y}px`);
    };

    // --- CONDITIONAL RENDERING ---

    // 1. LAB MODE (Student + Active Session + Explicitly Open)
    if (token && userRole === 'student' && activeSessionId && isLabOpen) {
        return (
            <LabMode
                session={activeSession} // NEW: Pass the REAL session object (with courseId)
                username={username}
                userId={userId}
                token={token}
                theme={currentTheme}
                onLogout={() => {
                    // FIXED: DON'T clear activeSessionId here, just close the lab view
                    // This allows the "Join Session" banner to persist so they can re-enter
                    setIsLabOpen(false);
                    window.currentLabSessionId = null;
                }}
            />
        );
    } else if (token && userRole === 'student' && (activeSessionId || isLabOpen)) {
        console.warn("[App] LabMode conditions not met:", { token: !!token, role: userRole, activeSessionId, isLabOpen });
    }

    if (isAppLoading) {
        return <LoadingScreen />;
    }

    if (token && userRole === 'admin') {
        return <AdminDashboard token={token} onLogout={handleLogout} />;
    }

    if (token && userRole === 'faculty') {
        return <FacultyHub token={token} SERVER_URL={SERVER_URL} userId={userId} onLogout={handleLogout} />;
    }

    // 4. MAIN IDE OR AUTH SCREEN
    return (
        <div className="app-root" onMouseMove={handleGlobalMouseMove} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AntigravityBackground />

            {token && userRole === 'student' && activeSessionId && !isLabOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    style={{ background: '#7c3aed', color: 'white', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', zIndex: 1000, position: 'relative' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaNetworkWired /> <span>Live Lab Session Active</span>
                    </div>
                    <button
                        onClick={() => setIsLabOpen(true)}
                        style={{ background: 'white', color: '#7c3aed', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Join Session
                    </button>
                </motion.div>
            )}

            <div style={{ flex: 1, position: 'relative' }}>
                {!token ? (
                    <Login
                        handleTilt={handleTilt}
                        resetTilt={resetTilt}
                        rotateX={rotateX}
                        rotateY={rotateY}
                        isFacultyLogin={isFacultyLogin}
                        setIsFacultyLogin={setIsFacultyLogin}
                        isLogin={isLogin}
                        setIsLogin={setIsLogin}
                        handleAuth={handleAuth}
                        authData={authData}
                        setAuthData={setAuthData}
                        handleGoogleLoginSuccess={handleGoogleLoginSuccess}
                        SERVER_URL={SERVER_URL}
                    />
                ) : userRole === 'student' && showStudentAssignments ? (
                    <StudentAssignmentView
                        token={token}
                        serverUrl={SERVER_URL}
                        userId={userId}
                        onBack={() => setShowStudentAssignments(false)}
                        activeSessionId={activeSessionId}
                        onEnterLab={() => setIsLabOpen(true)}
                    />
                ) : (
                    <>
                        <CloneModal isOpen={isCloneModalOpen} onClose={() => setIsCloneModalOpen(false)} onCloneSuccess={() => { alert("Repository Cloned! Refreshing file tree..."); fetchFiles(); }} token={token} />
                        <SwitchRepoModal isOpen={isSwitchRepoModalOpen} onClose={() => setIsSwitchRepoModalOpen(false)} onSwitch={(repoName) => { alert("Switched to " + repoName); }} token={token} />

                        <div className="ide-container" style={{ position: 'relative', zIndex: 10 }}>
                            <div className="menubar">
                                <motion.img src="/logoide.jpeg" alt="Logo" whileHover={{ rotate: 360 }} transition={{ duration: 0.8, ease: "easeInOut" }} style={{ height: '24px', width: 'auto', marginRight: '10px', borderRadius: '4px', cursor: 'pointer' }} />

                                {/* File Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'file' ? null : 'file'); }}>
                                    File
                                    {activeMenu === 'file' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => createNode('file')}>New File</div>
                                            <div className="dropdown-option" onClick={() => createNode('folder')}>New Folder</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => folderInputRef.current.click()}>Open Folder...</div>
                                            <div className="dropdown-option" onClick={() => fileInputRef.current.click()}>Open File...</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => setIsCloneModalOpen(true)}>Clone Repository...</div>
                                            <div className="dropdown-option" onClick={() => setIsSwitchRepoModalOpen(true)}>Switch Repository...</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={handleSave}>Save <span className="shortcut">Ctrl+S</span></div>
                                            <div className="dropdown-option" onClick={handleSaveAs}>Save As...</div>
                                        </div>
                                    )}
                                </div>

                                {/* Edit Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'edit' ? null : 'edit'); }}>
                                    Edit
                                    {activeMenu === 'edit' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => document.execCommand('undo')}>Undo <span className="shortcut">Ctrl+Z</span></div>
                                            <div className="dropdown-option" onClick={() => document.execCommand('redo')}>Redo <span className="shortcut">Ctrl+Y</span></div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => document.execCommand('cut')}>Cut <span className="shortcut">Ctrl+X</span></div>
                                            <div className="dropdown-option" onClick={() => document.execCommand('copy')}>Copy <span className="shortcut">Ctrl+C</span></div>
                                            <div className="dropdown-option" onClick={() => document.execCommand('paste')}>Paste <span className="shortcut">Ctrl+V</span></div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'actions.find')}>Find <span className="shortcut">Ctrl+F</span></div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.startFindReplaceAction')}>Replace <span className="shortcut">Ctrl+H</span></div>
                                        </div>
                                    )}
                                </div>

                                {/* Selection Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'selection' ? null : 'selection'); }}>
                                    Selection
                                    {activeMenu === 'selection' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.selectAll')}>Select All <span className="shortcut">Ctrl+A</span></div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.copyLinesUpAction')}>Copy Line Up <span className="shortcut">Alt+Shift+↑</span></div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.copyLinesDownAction')}>Copy Line Down <span className="shortcut">Alt+Shift+↓</span></div>
                                        </div>
                                    )}
                                </div>

                                {/* View Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'view' ? null : 'view'); }}>
                                    View
                                    {activeMenu === 'view' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}>{isBottomPanelOpen ? '✓ ' : '  '}Panel</div>
                                            <div className="dropdown-option" onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}>{isAiPanelOpen ? '✓ ' : '  '}AI Assistant</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.toggleMinimap')}>Toggle Minimap</div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.toggleWordWrap')}>Toggle Word Wrap</div>
                                        </div>
                                    )}
                                </div>

                                {/* Go Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'go' ? null : 'go'); }}>
                                    Go
                                    {activeMenu === 'go' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.revealDefinition')}>Go to Definition <span className="shortcut">F12</span></div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.quickOutline')}>Go to Symbol <span className="shortcut">Ctrl+Shift+O</span></div>
                                            <div className="dropdown-option" onClick={() => editorRef.current?.trigger('source', 'editor.action.gotoLine')}>Go to Line <span className="shortcut">Ctrl+G</span></div>
                                        </div>
                                    )}
                                </div>

                                {/* Run Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'run' ? null : 'run'); }}>
                                    Run
                                    {activeMenu === 'run' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={runCode}><FaPlay size={10} /> Run File</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={handleAIFix}><FaMagic size={10} /> AI Fix / Generate</div>
                                        </div>
                                    )}
                                </div>

                                {/* Terminal Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'terminal-menu' ? null : 'terminal-menu'); }}>
                                    Terminal
                                    {activeMenu === 'terminal-menu' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => { addTerm(); setIsBottomPanelOpen(true); setBottomPanelTab('terminal'); }}>New Terminal</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => { setIsBottomPanelOpen(true); setBottomPanelTab('terminal'); }}>Show Terminal</div>
                                            <div className="dropdown-option" onClick={() => { setIsBottomPanelOpen(true); setBottomPanelTab('problems'); }}>Show Problems</div>
                                            <div className="dropdown-option" onClick={() => { setIsBottomPanelOpen(true); setBottomPanelTab('output'); }}>Show Output</div>
                                            <div className="dropdown-option" onClick={() => { setIsBottomPanelOpen(true); setBottomPanelTab('debug-console'); }}>Show Debug Console</div>
                                        </div>
                                    )}
                                </div>

                                {/* Help Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'help' ? null : 'help'); }}>
                                    Help
                                    {activeMenu === 'help' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => window.open('https://code.visualstudio.com/docs', '_blank')}>Documentation</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => alert('Kevryn IDE v1.0\nA Cloud IDE built with React & Node.js')}>About</div>
                                        </div>
                                    )}
                                </div>

                                {/* Deploy Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'deploy' ? null : 'deploy'); }}>
                                    Deploy
                                    {activeMenu === 'deploy' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={deployFrontend}><FaCloudUploadAlt /> Frontend (Netlify)</div>
                                            <div className="dropdown-option" onClick={deployBackend}><FaServer /> Backend (Native)</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-header">Active Deployments</div>
                                            {deployStatus?.backend ? (
                                                <div className="dropdown-item-status">
                                                    <span style={{ color: '#4caf50' }}>● Live</span> Port: {deployStatus.backend.port}
                                                    <button className="btn-small-danger" onClick={stopBackend}>Stop</button>
                                                </div>
                                            ) : (
                                                <div className="dropdown-item-status" style={{ color: '#666' }}>No Active Backend</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                                <input type="file" ref={folderInputRef} style={{ display: 'none' }} webkitdirectory="" directory="" multiple onChange={handleFolderUpload} />

                                {/* ===== RIGHT SIDE ACTION BUTTONS ===== */}
                                <div className="menubar-right">
                                    <select
                                        value={currentTheme}
                                        onChange={(e) => setCurrentTheme(e.target.value)}
                                        className="menubar-select"
                                        title="Theme"
                                    >
                                        <option value="dark">Dark</option>
                                        <option value="light">Light</option>
                                        <option value="midnight">Midnight</option>
                                        <option value="forest">Forest</option>
                                        <option value="high-contrast">High Contrast</option>
                                    </select>
                                    <button onClick={runCode} className="menubar-action-btn run-btn" title="Run">
                                        {fileName.endsWith('.html') ? <><FaEye size={13} /> Preview</> : <><FaPlay size={11} /> Run</>}
                                    </button>
                                    {isLabOpen && (
                                        <div style={{ marginLeft: '10px', fontSize: '12px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <span>⏱ {new Date(currentLabTime * 1000).toISOString().substr(11, 8)}</span>
                                            <button onClick={() => {
                                                const fname = openFiles.find(f => f._id === activeFileId)?.name;
                                                if (fname && pendingTime.current[fname] > 0) {
                                                    saveLabReport(fname, code, pendingTime.current[fname], 'submitted');
                                                    pendingTime.current[fname] = 0;
                                                    alert("Lab Report Submitted!");
                                                } else {
                                                    alert("Nothing new to submit.");
                                                }
                                            }} style={{ background: '#10b981', border: 'none', borderRadius: '4px', color: '#fff', padding: '2px 8px', cursor: 'pointer' }}>Submit</button>
                                        </div>
                                    )}
                                    <div className="menubar-separator"></div>
                                    <button onClick={openPort} className="menubar-action-btn" title="Open Port"><FaGlobe size={14} /></button>
                                    <button onClick={shareSingleFile} className="menubar-action-btn" title="Share File"><FaShareAlt size={13} /></button>
                                    <button onClick={handleSyncProject} className="menubar-action-btn" title="Sync Project"><FaSync size={13} /></button>
                                    <button onClick={() => setIsSearchOpen(true)} className="menubar-action-btn" title="Search (Ctrl+Shift+F)"><FaSearch size={13} /></button>
                                    <button onClick={handleAIFix} className="menubar-action-btn" title="AI Fix" style={{ color: isAiLoading ? '#666' : '#a78bfa' }}>{isAiLoading ? '...' : <FaMagic size={13} />}</button>
                                    <div className="menubar-separator"></div>
                                    <button onClick={() => setIsAiPanelOpen(!isAiPanelOpen)} className={`menubar-action-btn ${isAiPanelOpen ? 'active' : ''}`} title="AI Assistant"><FaRobot size={14} /></button>
                                    <button onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)} className={`menubar-action-btn ${isBottomPanelOpen ? 'active' : ''}`} title="Toggle Panel"><FaTerminal size={13} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'settings' ? null : 'settings'); }} className="menubar-action-btn" title="Settings" style={{ position: 'relative' }}>
                                        <FaCog size={14} />
                                        {activeMenu === 'settings' && (
                                            <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
                                                <div className="dropdown-option" onClick={handleLogout}><FaSignOutAlt size={11} /> Sign Out ({username})</div>
                                            </div>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* ===== MAIN CONTENT AREA ===== */}
                            <div className="main-content-horizontal">

                                {/* --- LEFT SIDEBAR --- */}
                                <div className="sidebar" style={{ flexShrink: 0 }}>
                                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                                        <div onClick={() => setSidebarTab('files')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'files' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'files' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'files' ? '1px solid var(--accent-primary)' : 'none' }}><FaFolder title="Files" /></div>
                                        <div onClick={() => setSidebarTab('chat')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'chat' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'chat' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'chat' ? '1px solid var(--accent-primary)' : 'none' }}><FaComments title="Team Chat" /></div>
                                        <div onClick={() => setSidebarTab('git')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'git' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'git' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'git' ? '1px solid var(--accent-primary)' : 'none' }}><FaCodeBranch title="Source Control" /></div>
                                        <div onClick={() => setSidebarTab('timeline')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'timeline' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'timeline' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'timeline' ? '1px solid var(--accent-primary)' : 'none' }}><FaHistory title="Timeline" /></div>
                                        <div onClick={() => setSidebarTab('snippets')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'snippets' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'snippets' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'snippets' ? '1px solid var(--accent-primary)' : 'none' }}><FaCode title="Snippets" /></div>
                                        <div onClick={() => setShowStudentAssignments(true)} className={`sidebar-icon-container ${showStudentAssignments ? 'active' : ''}`} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                            <FaClipboardList title="My Learning (Assignments & Courses)" />
                                        </div>
                                        <button className="icon-btn" title="New Template" onClick={() => setIsTemplateModalOpen(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '0 10px', cursor: 'pointer' }}><FaMagic size={11} /></button>
                                    </div>
                                    {sidebarTab === 'files' && (<div style={{ flex: 1, overflowY: 'auto', marginTop: '10px' }}><FileTree data={fileData} activeId={activeFileId} onFileClick={handleFileClick} onCreate={(parentId) => createNode('file', parentId)} onDelete={handleDelete} onRename={handleRename} onDownload={handleDownload} /></div>)}
                                    {sidebarTab === 'git' && (<GitPanel token={token} startRepo={activeRepo} />)}
                                    {sidebarTab === 'snippets' && (<SnippetsPanel token={token} editorRef={editorRef} getLanguage={getLanguage} fileName={fileName} />)}
                                    {sidebarTab === 'timeline' && (
                                        <TimelinePanel
                                            token={token}
                                            activeFileId={activeFileId}
                                            onRestoreComplete={(newContent) => {
                                                setCode(newContent);
                                                if (editorRef.current) {
                                                    editorRef.current.setValue(newContent);
                                                }
                                            }}
                                        />
                                    )}
                                    {sidebarTab === 'chat' && (<div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}><div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>{chatMessages.map((msg, i) => (<div key={i} style={{ alignSelf: msg.sender === username ? 'flex-end' : 'flex-start', maxWidth: '85%' }}><div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px', textAlign: msg.sender === username ? 'right' : 'left' }}>{msg.sender}</div><div style={{ padding: '8px', borderRadius: '6px', background: msg.sender === username ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: 'white', fontSize: '12px', wordWrap: 'break-word' }}>{msg.text}</div></div>))}<div ref={chatEndRef} /></div><form onSubmit={sendChatMessage} style={{ padding: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '5px', background: 'var(--bg-secondary)' }}><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }} /><button type="submit" style={{ background: 'var(--accent-primary)', border: 'none', borderRadius: '4px', color: 'white', padding: '0 10px', cursor: 'pointer' }}><FaPaperPlane size={12} /></button></form></div>)}
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '10px', textAlign: 'center', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {userPicture ? (
                                                <img src={userPicture} alt="Profile" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                                            ) : (
                                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                                                    {username.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span>{username}</span>
                                        </div>
                                        <button onClick={logout} className="btn-icon" style={{ border: 'none', cursor: 'pointer', padding: '4px' }} title="Logout"><FaSignOutAlt /></button>
                                    </div>
                                </div>

                                {/* --- CENTER WORKSPACE (Editor + Bottom Panel) --- */}
                                <div className="center-workspace">
                                    <motion.div layout className="editor-area" style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                                        {/* File tabs only */}
                                        <div className="top-bar">
                                            <div className="tabs-container" style={{
                                                display: 'flex',
                                                overflowX: 'auto',
                                                overflowY: 'hidden',
                                                boxSizing: 'border-box',
                                                minWidth: 0,
                                                alignItems: 'center',
                                                flex: 1
                                            }}>
                                                {openFiles.map(f => (
                                                    <div
                                                        key={f._id}
                                                        onClick={() => handleFileClick(f)}
                                                        className={`file-tab ${activeFileId === f._id ? 'active' : ''}`}
                                                        style={{
                                                            padding: '8px 15px',
                                                            cursor: 'pointer',
                                                            background: activeFileId === f._id ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                                                            color: activeFileId === f._id ? '#fff' : 'rgba(255,255,255,0.5)',
                                                            borderRight: '1px solid rgba(255,255,255,0.05)',
                                                            borderTop: activeFileId === f._id ? '1px solid var(--accent-primary)' : '1px solid transparent',
                                                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', minWidth: '120px', maxWidth: '200px',
                                                            flexShrink: 0,
                                                            minHeight: '32px',
                                                            boxSizing: 'border-box',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        {activeFileId === f._id && <div className="neon-indicator" style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)' }} />}
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: activeFileId === f._id ? '10px' : '0' }}>{f.name}</span>
                                                        <span onClick={(e) => closeTab(e, f._id)} style={{ borderRadius: '50%', padding: '2px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', marginLeft: 'auto' }}>✕</span>
                                                    </div>
                                                ))}
                                                {openFiles.length === 0 && <div style={{ padding: '8px 15px', color: 'var(--text-secondary)', fontSize: '13px' }}>No active files</div>}
                                            </div>
                                        </div>

                                        <Breadcrumbs fileName={fileName} />

                                        {/* Editor */}
                                        <div className="editor-wrapper">
                                            <Editor
                                                height="100%"
                                                theme={getMonacoTheme()}
                                                path={fileName}
                                                defaultLanguage={getLanguage(fileName)}
                                                language={getLanguage(fileName)}
                                                value={code}
                                                beforeMount={handleEditorWillMount}
                                                options={{
                                                    fontSize: 14,
                                                    fontFamily: 'JetBrains Mono',
                                                    minimap: { enabled: true },
                                                    automaticLayout: true,
                                                    scrollBeyondLastLine: false,
                                                    padding: { top: 10, bottom: 10 }
                                                }}
                                                onMount={(editor, monaco) => {
                                                    editorRef.current = editor;
                                                    editor.onDidChangeCursorPosition((e) => {
                                                        if (activeFileId) {
                                                            safeEmit('cursor-move', {
                                                                fileId: activeFileId,
                                                                userId,
                                                                username,
                                                                position: e.position
                                                            });
                                                        }
                                                    });
                                                    // Sync logic handled by persistAuth
                                                    setIsAppLoading(false);
                                                }}
                                                onChange={(v) => {
                                                    if (!isRemoteUpdate.current && activeFileId) {
                                                        setCode(v);
                                                        setOpenFiles(prev => prev.map(f => f._id === activeFileId ? { ...f, content: v } : f));

                                                        // Debounce Socket Sync (Reduced traffic, low latency)
                                                        if (codeSyncTimeoutRef.current) clearTimeout(codeSyncTimeoutRef.current);
                                                        codeSyncTimeoutRef.current = setTimeout(() => {
                                                            safeEmit('code-change', { fileId: activeFileId, newCode: v, userId });
                                                        }, 400);

                                                        // Debounce Auto-Save to DB
                                                        if (autoSaveTimeoutRef.current) {
                                                            clearTimeout(autoSaveTimeoutRef.current);
                                                        }
                                                        autoSaveTimeoutRef.current = setTimeout(async () => {
                                                            try {
                                                                await api.put(`/files/${activeFileId}`, { content: v });
                                                                const activeFile = openFiles.find(f => f._id === activeFileId);
                                                                if (activeFile) {
                                                                    safeEmit('save-file-disk', { fileName: activeFile.name, code: v, userId, fileId: activeFileId });
                                                                }
                                                                console.log('Auto-saved:', activeFile?.name || activeFileId);
                                                            } catch (err) {
                                                                console.error('Auto-save failed:', err);
                                                            }
                                                        }, 1500);
                                                    }
                                                    isRemoteUpdate.current = false;
                                                }}
                                            />
                                        </div>
                                    </motion.div>

                                    {/* --- VS CODE STYLE BOTTOM PANEL --- */}
                                    {isBottomPanelOpen && (
                                        <div className="bottom-panel" style={{ height: isBottomPanelMaximized ? '70vh' : `${bottomPanelHeight}px`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                            <div className="panel-resize-handle" onMouseDown={startResizingPanel} />
                                            <div className="bottom-panel-header">
                                                <div className="bottom-panel-tabs">
                                                    {[
                                                        { id: 'problems', label: 'Problems', icon: <FaExclamationTriangle size={11} /> },
                                                        { id: 'output', label: 'Output', icon: null },
                                                        { id: 'debug-console', label: 'Debug Console', icon: null },
                                                        { id: 'terminal', label: 'Terminal', icon: <FaTerminal size={11} /> },

                                                        { id: 'ports', label: 'Ports', icon: <FaNetworkWired size={11} /> },
                                                        { id: 'deployment', label: 'Deployment', icon: <FaServer size={11} /> },
                                                    ].map(tab => (
                                                        <div
                                                            key={tab.id}
                                                            className={`bottom-panel-tab ${bottomPanelTab === tab.id ? 'active' : ''}`}
                                                            onClick={() => setBottomPanelTab(tab.id)}
                                                        >
                                                            {tab.icon && <span className="bottom-tab-icon">{tab.icon}</span>}
                                                            {tab.label}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="bottom-panel-actions">
                                                    {bottomPanelTab === 'terminal' && (
                                                        <>
                                                            <button
                                                                className="panel-action-btn debug-ai-btn"
                                                                onClick={handleDebugTerminal}
                                                                title="Debug with AI"
                                                                style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)', fontWeight: 'bold' }}
                                                            >
                                                                <FaMagic /> Magic Fix
                                                            </button>
                                                            <button className="panel-action-btn" onClick={addTerm} title="New Terminal"><FaPlus size={12} /></button>
                                                            <button className="panel-action-btn" title="More" onClick={(e) => e.stopPropagation()}><FaEllipsisH size={12} /></button>
                                                        </>
                                                    )}
                                                    <button className="panel-action-btn" onClick={toggleBottomPanelMaximize} title={isBottomPanelMaximized ? 'Restore Panel Size' : 'Maximize Panel'}>
                                                        {isBottomPanelMaximized ? <FaChevronDown size={12} /> : <FaChevronUp size={12} />}
                                                    </button>
                                                    <button className="panel-action-btn" onClick={() => setIsBottomPanelOpen(false)} title="Close Panel"><FaTimes size={12} /></button>
                                                </div>
                                            </div>
                                            <div className="bottom-panel-content">
                                                {bottomPanelTab === 'problems' && (<div className="panel-placeholder"><FaExclamationTriangle size={20} style={{ opacity: 0.3, marginBottom: '8px' }} /><div>No problems have been detected in the workspace.</div></div>)}
                                                {bottomPanelTab === 'output' && (<div className="panel-placeholder"><div style={{ color: '#666', fontSize: '12px' }}>No output to display.</div></div>)}
                                                {bottomPanelTab === 'debug-console' && (<div className="panel-placeholder"><FaBug size={20} style={{ opacity: 0.3, marginBottom: '8px' }} /><div>Debug Console - Start a debug session to see output here.</div></div>)}
                                                {bottomPanelTab === 'terminal' && (
                                                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                                                        <div className="terminal-sidebar">
                                                            {terminals
                                                                .filter(t => t.type !== 'server' || activeTermId === t.id)
                                                                .map(t => (
                                                                    <div
                                                                        key={t.id}
                                                                        onClick={() => setActiveTermId(t.id)}
                                                                        className={`terminal-sidebar-item ${activeTermId === t.id ? 'active' : ''}`}
                                                                        style={t.type === 'server' ? { borderLeft: '2px solid #8b5cf6', background: 'rgba(139, 92, 246, 0.05)' } : {}}
                                                                    >
                                                                        <FaTerminal size={10} color={t.type === 'server' ? '#a78bfa' : 'inherit'} />
                                                                        <span className="terminal-name" style={t.type === 'server' ? { color: '#a78bfa', fontWeight: 'bold' } : {}}>{t.name}</span>
                                                                        <FaTrash size={10} className="trash-icon" onClick={(e) => { e.stopPropagation(); remTerm(t.id); }} />
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        <div style={{ flex: 1, position: 'relative', background: '#1e1e1e' }}>
                                                            {terminals.map(t => {
                                                                const activeFile = openFiles.find(f => f._id === activeFileId);
                                                                const activeExt = activeFile?.name?.split('.').pop()?.toLowerCase() || '';
                                                                const isServerLang = ['py', 'c', 'cpp', 'java'].includes(activeExt);

                                                                // --- FORCE REMOUNT FIX ---
                                                                // We use a combined key of termId + mode. 
                                                                // When isServerLang changes, the key changes, forcing Terminal to remount.
                                                                const terminalMode = isServerLang ? 'server' : 'local';
                                                                const terminalKey = `${t.id}-${terminalMode}`;

                                                                const shouldBeLocal = t.type === 'local' && !isServerLang;

                                                                return (
                                                                    <div key={t.id} style={{ width: '100%', height: '100%', display: activeTermId === t.id ? 'block' : 'none' }}>
                                                                        <Terminal
                                                                            key={terminalKey}
                                                                            socket={socketRef.current}
                                                                            termId={t.id}
                                                                            userId={userId}
                                                                            onError={(err) => setTerminalError(err)}
                                                                            webcontainer={shouldBeLocal ? webcontainerInstance : null}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                            {terminals.length === 0 && (<div style={{ color: '#555', padding: '20px', fontSize: '13px' }}>No terminals open. Click + to create one.</div>)}

                                                            {/* --- SELF-HEALING ACTION OVERLAY --- */}
                                                            {terminalError && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 20 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    className="terminal-error-overlay"
                                                                >
                                                                    <div className="error-message">
                                                                        <FaExclamationTriangle color="#ff9800" />
                                                                        <span>Terminal Error Detected</span>
                                                                    </div>
                                                                    <div className="error-actions">
                                                                        <button className="fix-btn" onClick={() => handleAgenticFix(terminalError)}>
                                                                            <FaMagic /> Fix with Kevryn AI
                                                                        </button>
                                                                        <button className="dismiss-btn" onClick={() => setTerminalError(null)}>
                                                                            <FaTimes />
                                                                        </button>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {bottomPanelTab === 'ports' && (<div className="panel-placeholder"><FaNetworkWired size={20} style={{ opacity: 0.3, marginBottom: '8px' }} /><div>No forwarded ports. Use the <span style={{ color: 'var(--accent-primary)', cursor: 'pointer' }} onClick={openPort}>Open Port</span> button to forward a port.</div></div>)}
                                                {bottomPanelTab === 'deployment' && (
                                                    <div style={{ height: '100%', overflow: 'hidden' }}>
                                                        <DeploymentPanel token={token} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div> {/* End center-workspace */}

                                {/* --- RIGHT SIDEBAR (AI) --- */}
                                <AnimatePresence>
                                    {isAiPanelOpen && (
                                        <motion.div
                                            initial={{ width: 0, opacity: 0 }}
                                            animate={{ width: aiPanelWidth, opacity: 1 }}
                                            exit={{ width: 0, opacity: 0 }}
                                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                                            style={{ display: 'flex', overflow: 'hidden', height: '100%', flexShrink: 0 }}
                                        >
                                            <div className="resize-handle" onMouseDown={startResizingAi} style={{ width: '4px', cursor: 'col-resize', background: 'transparent', zIndex: 100 }} />
                                            <div className="right-sidebar" style={{ width: '100%', height: '100%' }}>
                                                <AIPanel
                                                    token={token}
                                                    code={code}
                                                    fileName={fileName}
                                                    language={getLanguage(fileName)}
                                                    onApplyCode={(newCode, lang) => {
                                                        const terminalLangs = ['powershell', 'bash', 'shell', 'sh', 'cmd', 'zsh', 'terminal'];
                                                        if (lang && terminalLangs.includes(lang.toLowerCase())) {
                                                            const commands = newCode.split('\n').filter(line => line.trim());
                                                            const runCommands = async () => {
                                                                for (const cmd of commands) {
                                                                    safeEmit('terminal:write', { termId: activeTermId, data: cmd + '\r' });
                                                                    await new Promise(r => setTimeout(r, 50));
                                                                }
                                                            };
                                                            runCommands();
                                                            setIsBottomPanelOpen(true);
                                                            setBottomPanelTab('terminal');
                                                            return;
                                                        }

                                                        window.openDiff({
                                                            oldCode: code,
                                                            newCode: newCode,
                                                            fileName: fileName,
                                                            language: getLanguage(fileName),
                                                            onApply: (finalCode) => {
                                                                setCode(finalCode);
                                                                if (activeFileId) {
                                                                    setOpenFiles(prev => prev.map(f => f._id === activeFileId ? { ...f, content: finalCode } : f));
                                                                    safeEmit('code-change', { fileId: activeFileId, newCode: finalCode, userId });
                                                                    safeEmit('save-file-disk', { fileName, code: finalCode, userId, fileId: activeFileId });
                                                                }
                                                            }
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div> {/* End main-content-horizontal */}
                        </div>

                        {/* --- GLOBAL RESIZE OVERLAY --- */}
                        {(isResizingAi || isResizingPanel) && (
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, cursor: isResizingPanel ? 'row-resize' : 'col-resize', background: 'transparent' }} />
                        )}

                        {/* --- FLOATING AI BUTTON --- */}
                        <button className={`ai-fab ${isAiPanelOpen ? 'active' : ''}`} onClick={() => setIsAiPanelOpen(!isAiPanelOpen)} title="Toggle AI Assistant">
                            <FaRobot size={20} />
                        </button>

                        <AnimatePresence>
                            {isDiffModalOpen && (
                                <AIDiffModal
                                    isOpen={isDiffModalOpen}
                                    onClose={() => setIsDiffModalOpen(false)}
                                    onAccept={(newCode) => {
                                        if (diffData.onApply) {
                                            diffData.onApply(newCode);
                                        } else {
                                            // Default apply to current file
                                            setCode(newCode);
                                            // Save to disk
                                            safeEmit('save-file-disk', { fileName: diffData.fileName, code: newCode, userId, fileId: activeFileId });
                                            // Update DB
                                            if (activeFileId) {
                                                api.put(`/files/${activeFileId}`, { content: newCode }).catch(e => console.error("Save error", e));
                                            }
                                        }
                                        setIsDiffModalOpen(false);
                                    }}
                                    oldCode={diffData.oldCode}
                                    newCode={diffData.newCode}
                                    fileName={diffData.fileName}
                                    language={diffData.language}
                                />
                            )}

                            {isSearchOpen && (
                                <GlobalSearch
                                    SERVER_URL={SERVER_URL}
                                    token={token}
                                    onFileClick={handleFileClick}
                                    onClose={() => setIsSearchOpen(false)}
                                />
                            )}
                            <IssueReporter isOpen={isIssueReporterOpen} onClose={() => setIsIssueReporterOpen(false)} token={token} />
                        </AnimatePresence>
                    </>
                )}
            </div>
        </div>
    );
}

export default App;

// --- LOGIN COMPONENT (External) ---
const Login = ({
    handleTilt, resetTilt, rotateX, rotateY,
    isFacultyLogin, setIsFacultyLogin,
    isLogin, setIsLogin,
    handleAuth, authData, setAuthData,
    handleGoogleLoginSuccess, SERVER_URL
}) => (
    <div className="ide-container login-container" onMouseMove={handleTilt} onMouseLeave={resetTilt} style={{ justifyContent: 'center', alignItems: 'center', perspective: '1000px', height: '100%', display: 'flex', position: 'relative' }}>
        <AntigravityBackground />
        <motion.div
            initial={{ opacity: 0, scale: 0.8, z: -100 }}
            animate={{ opacity: 1, scale: 1, z: 0 }}
            transition={{ duration: 1.2, ease: "circOut" }}
            style={{ rotateX, rotateY, transformStyle: 'preserve-3d', padding: '40px', borderRadius: '32px', width: '420px', position: 'relative', zIndex: 10 }}
            className={`auth-box ${isFacultyLogin ? 'faculty-mode' : ''}`}
        >
            {/* LOGIN TABS */}
            <div style={{ display: 'flex', marginBottom: '30px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '4px', transform: 'translateZ(40px)' }}>
                <button
                    onClick={() => setIsFacultyLogin(false)}
                    style={{
                        flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: !isFacultyLogin ? 'rgba(255,255,255,0.1)' : 'transparent',
                        color: !isFacultyLogin ? '#fff' : 'rgba(255,255,255,0.5)',
                        fontWeight: !isFacultyLogin ? 'bold' : 'normal', transition: 'all 0.2s'
                    }}
                >
                    Student
                </button>
                <button
                    onClick={() => setIsFacultyLogin(true)}
                    style={{
                        flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: isFacultyLogin ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                        color: isFacultyLogin ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                        fontWeight: isFacultyLogin ? 'bold' : 'normal', transition: 'all 0.2s'
                    }}
                >
                    Management
                </button>
            </div>

            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                style={{ transform: 'translateZ(60px)' }}
            >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', transform: 'translateZ(90px)' }}>
                    {isFacultyLogin ? (
                        <div style={{ padding: '20px', background: 'linear-gradient(135deg, #4c1d95, #6d28d9)', borderRadius: '24px', boxShadow: '0 0 30px rgba(109, 40, 217, 0.4)' }}>
                            <FaGlobe size={50} color="#fff" />
                        </div>
                    ) : (
                        <motion.img
                            src="/logoide.jpeg"
                            alt="Kevryn Logo"
                            whileHover={{ rotate: 360, filter: 'drop-shadow(0 0 40px rgba(59, 130, 246, 0.8))' }}
                            transition={{ duration: 0.8, ease: "easeInOut" }}
                            style={{
                                height: '80px',
                                width: 'auto',
                                filter: 'drop-shadow(0 0 25px rgba(59, 130, 246, 0.5))',
                                borderRadius: '20px',
                                cursor: 'pointer'
                            }}
                        />
                    )}
                </div>
                <h2 style={{ color: '#fff', marginBottom: '10px', textAlign: 'center', fontSize: '28px', fontWeight: '900', letterSpacing: '-0.5px', transform: 'translateZ(70px)' }}>
                    {isFacultyLogin ? 'Kevryn Faculty Portal' : 'Kevryn Student Hub'}
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: '30px', fontSize: '14px', transform: 'translateZ(40px)' }}>
                    {isFacultyLogin ? 'Secure access for academic management.' : 'The next generation Cloud IDE for students.'}
                </p>
            </motion.div>

            <motion.form
                onSubmit={handleAuth}
                style={{ display: 'flex', flexDirection: 'column', gap: '20px', transform: 'translateZ(50px)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
            >
                <input className="auth-input" type="text" placeholder={isFacultyLogin ? "Faculty ID / Email" : "Username"} value={authData.username} onChange={e => setAuthData({ ...authData, username: e.target.value })} style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '15px' }} required />
                <input className="auth-input" type="password" placeholder="Password" value={authData.password} onChange={e => setAuthData({ ...authData, password: e.target.value })} style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '15px' }} required />
                <button
                    className="btn"
                    type="submit"
                    style={{
                        justifyContent: 'center', padding: '14px', borderRadius: '12px', fontSize: '16px', marginTop: '10px',
                        background: isFacultyLogin ? 'linear-gradient(135deg, #6d28d9, #4c1d95)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer', boxShadow: isFacultyLogin ? '0 4px 15px rgba(109, 40, 217, 0.3)' : '0 4px 15px rgba(37, 99, 235, 0.3)'
                    }}
                >
                    {isLogin ? (isFacultyLogin ? 'Access Dashboard' : 'Enter Studio') : 'Get Started'}
                </button>
            </motion.form>

            {!isFacultyLogin && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', margin: '30px 0', transform: 'translateZ(30px)' }}>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                        <span style={{ padding: '0 15px', color: 'rgba(255,255,255,0.3)', fontSize: '12px', fontWeight: 'bold' }}>OR CONTINUE WITH</span>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', transform: 'translateZ(60px)' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <GoogleLogin
                                onSuccess={handleGoogleLoginSuccess}
                                onError={() => console.log('Login Failed')}
                                theme="filled_black"
                                shape="rectangular"
                                width="320"
                            />
                        </div>
                        <button
                            onClick={() => window.location.href = `${SERVER_URL}/auth/github`}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)',
                                padding: '12px 20px', borderRadius: '12px', cursor: 'pointer',
                                fontSize: '14px', fontWeight: '600', width: '100%', justifyContent: 'center',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <FaGithub size={20} /> Continue with GitHub
                        </button>
                    </div>
                </motion.div>
            )}

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                onClick={() => setIsLogin(!isLogin)}
                style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: '14px', marginTop: '25px' }}
            >
                {isLogin ? "Don't have an account? " : "Already using Kevryn? "}
                <span style={{ color: isFacultyLogin ? '#a78bfa' : '#60a5fa', fontWeight: '600' }}>{isLogin ? "Sign Up" : "Log In"}</span>
            </motion.p>
        </motion.div>
    </div>
);