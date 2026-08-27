import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
// Kickstart Vercel Deploy - Force Sync
import Editor, { loader } from '@monaco-editor/react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import {
    FaTerminal, FaPlay, FaSave, FaFolderPlus, FaFilePlus, FaFolder, FaFile, FaTrash, FaDownload, FaSync, FaSearch, FaTimes, FaBars, FaChevronRight, FaChevronDown, FaCode, FaCog, FaSignOutAlt, FaRocket, FaGlobe, FaBug, FaCube, FaShieldAlt, FaLightbulb, FaExchangeAlt, FaHistory, FaCheckCircle, FaExclamationTriangle, FaUserGraduate, FaChalkboardTeacher, FaProjectDiagram, FaBook, FaPuzzlePiece, FaMicrochip, FaNetworkWired, FaMagic, FaCloudUploadAlt, FaServer, FaEye, FaShareAlt, FaRobot, FaComments, FaCodeBranch, FaClipboardList, FaPaperPlane, FaPlus, FaEllipsisH, FaChevronUp, FaGithub, FaBell, FaBullhorn, FaSpinner, FaFolderOpen, FaCloudDownloadAlt
} from 'react-icons/fa';
import FileTree from './components/FileTree';
import Terminal from './components/Terminal';
import AIPanel from './components/AIPanel';
import KevRynBackground from './components/KevrynBackground';
import TopBroadcastBanner from './components/TopBroadcastBanner';
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
import { LanguageRuntime } from './services/LanguageRuntime';
import LabMode from './components/LabMode';
import SplashScreen from './components/SplashScreen';
import CustomDialog from './components/CustomDialog';
import { ExecutionService } from './services/execution/ExecutionService';
import FacultyHub from './components/FacultyHub'; // NEW: Unified Hub
import StudentAssignmentView from './components/StudentAssignmentView'; // NEW: Student Assignments
import AdminDashboard from './components/AdminDashboard';
import ManagementDashboard from './components/management/ManagementDashboard'; // NEW: Automated Management Dashboard
import PrincipalDashboard from './components/PrincipalDashboard';
import IssueReporter from './components/IssueReporter'; // NEW: Issue Reporting
import KevrynLogin from './components/KevrynLogin'; // NEW: Cinematic Login
import LiveAptitudeTest from './components/LiveAptitudeTest'; // NEW: Aptitude Module
import LabTimer from './components/LabTimer'; // OPTIMIZATION: Extract timer to prevent global re-renders
import AgentHubModal from './components/AgentHubModal';

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
    const [activeBroadcast, setActiveBroadcast] = useState(null);
    const [username, setUsername] = useState(() => { const u = localStorage.getItem('username'); return (u && u !== 'undefined') ? u : ""; });
    const [userId, setUserId] = useState(() => { const id = localStorage.getItem('userId'); return (id && id !== 'undefined') ? id : ""; });
    // Multi-College Tenancy State
    const [collegeId, setCollegeId] = useState(() => { const id = localStorage.getItem('collegeId'); return (id && id !== 'undefined' && id !== 'null') ? id : null; });
    const [collegeName, setCollegeName] = useState(() => { const name = localStorage.getItem('collegeName'); return (name && name !== 'undefined' && name !== 'null') ? name : null; });
    const [userRole, setUserRole] = useState(localStorage.getItem('role') || "student");
    const [isAppLoading, setIsAppLoading] = useState(() => !!localStorage.getItem('token')); // Load only if token exists
    const [isFacultyLogin, setIsFacultyLogin] = useState(false); // NEW: Faculty Toggle
    const [isLogin, setIsLogin] = useState(true);

    // --- SPLASH SCREEN ---
    const [showSplash, setShowSplash] = useState(() => !localStorage.getItem('token')); // Only show on first visit

    // --- CUSTOM DIALOG STATE ---
    const [dialog, setDialog] = useState(null);
    // helper: showDialog({ type, title, message, defaultValue }) => Promise<value>
    const showDialog = useCallback((opts) => {
        return new Promise((resolve) => {
            setDialog({
                ...opts,
                onConfirm: (val) => { setDialog(null); resolve(val ?? true); },
                onCancel: () => { setDialog(null); resolve(false); }
            });
        });
    }, []);

    useEffect(() => {
        if (!token) setIsAppLoading(false);
    }, [token]);
    
    // Default to Command Center ONLY if they are an ACE student
    const [showStudentAssignments, setShowStudentAssignments] = useState(() => {
        const cName = localStorage.getItem('collegeName');
        return cName ? cName.toLowerCase().includes('ace') : false;
    });

    const [authData, setAuthData] = useState({ username: "", password: "", email: "", collegeCode: "" });
    const [userPicture, setUserPicture] = useState(localStorage.getItem('picture') || null); // Store picture

    // --- LAB MODE STATE (Moved to top to fix ReferenceError) ---
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [activeSession, setActiveSession] = useState(null); // NEW: Store full session data (including courseId)
    const [activeAptitudeSession, setActiveAptitudeSession] = useState(null);
    const [isAgentHubOpen, setIsAgentHubOpen] = useState(false);
    const [installedAgents, setInstalledAgents] = useState([]);
    const [isAptitudeOpen, setIsAptitudeOpen] = useState(false); // Controls opening the test environment
    const [isLabOpen, setIsLabOpen] = useState(false); // NEW: Explicitly control lab opening
    const [newAssignmentAlert, setNewAssignmentAlert] = useState(null); // Alert banner for assignments

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

    const [activeFileId, setActiveFileId] = useState(null);
    const activeFileIdRef = useRef(null);
    // Sync ref manually in functions, but keep this for safety
    useEffect(() => { activeFileIdRef.current = activeFileId; }, [activeFileId]);

    const [openFiles, setOpenFiles] = useState([]); // { _id, name, content }
    const openFilesRef = useRef([]);
    useEffect(() => { openFilesRef.current = openFiles; }, [openFiles]);

    const [fileName, setFileName] = useState("");
    const fileNameRef = useRef("");
    useEffect(() => { fileNameRef.current = fileName; }, [fileName]);

    const [files, setFiles] = useState([]); // Flat list of files for path resolution
    const filesRef = useRef([]);
    useEffect(() => { filesRef.current = files; }, [files]);

    const [code, setCode] = useState("// Select a file to start coding...");
    const codeRef = useRef(code);
    useEffect(() => { codeRef.current = code; }, [code]);

    const [dirtyFiles, setDirtyFiles] = useState({}); // Tracks unsaved changes (educational lock)
    const dirtyFilesRef = useRef(dirtyFiles);
    useEffect(() => { dirtyFilesRef.current = dirtyFiles; }, [dirtyFiles]);

    const [activeWorkspaceFolderId, setActiveWorkspaceFolderId] = useState(null);
    const [localWorkspacePath, setLocalWorkspacePath] = useState(null); // Local Folder Mode
    const [showDesktopSetup, setShowDesktopSetup] = useState(false);

    // Desktop initialization
    useEffect(() => {
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.getWorkspacePath().then(path => {
                if (path) {
                    setLocalWorkspacePath(path);
                } else {
                    setShowDesktopSetup(true);
                }
            }).catch(e => {
                console.error("Failed to get workspace path", e);
                setShowDesktopSetup(true);
            });
        }
    }, []);

    const fileData = useMemo(() => {
        const rootName = localWorkspacePath ? localWorkspacePath.split('\\').pop().split('/').pop() : "My Workspace";
        if (!files || files.length === 0) return { _id: "root", name: rootName, type: "folder", children: [] };
        
        const map = {}, nodeTree = { _id: "root", name: rootName, type: "folder", children: [] };
        // Deep copy objects to avoid mutating state if someone accidentally tries to touch the tree
        files.forEach(node => { map[node._id] = { ...node, children: [] }; });
        files.forEach(node => {
            if (node.parentId !== "root") {
                if (map[node.parentId]) map[node.parentId].children.push(map[node._id]);
            } else {
                nodeTree.children.push(map[node._id]);
            }
        });

        if (activeWorkspaceFolderId && map[activeWorkspaceFolderId]) {
            return map[activeWorkspaceFolderId];
        } else if (nodeTree.children.length === 1 && nodeTree.children[0].type === 'folder') {
            return nodeTree.children[0];
        } else {
            return nodeTree;
        }
    }, [files, activeWorkspaceFolderId]);


    const [sidebarTab, setSidebarTab] = useState('files');
    const [activeMenu, setActiveMenu] = useState(null);
    const [activeRepo, setActiveRepo] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [chatVisibility, setChatVisibility] = useState("public");
    const chatEndRef = useRef(null);

    const isNativeDesktop = !!window.electronAPI;
    const initialTerminals = isNativeDesktop 
        ? [{ id: 1, name: 'Local Terminal', type: 'local' }]
        : [{ id: 'server-1', name: 'Server Terminal', type: 'server' }];

    const [terminals, setTerminals] = useState(initialTerminals);
    const [activeTermId, setActiveTermId] = useState(isNativeDesktop ? 1 : 'server-1');
    const [previewKey, setPreviewKey] = useState(Date.now());
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [deployStatus, setDeployStatus] = useState(null);
    const [activePorts, setActivePorts] = useState([]); // NEW: For full-stack framework detection
    const [updateStatus, setUpdateStatus] = useState(null); // 'available', 'downloading', 'downloaded'
    const [updateProgress, setUpdateProgress] = useState(0);

    useEffect(() => {
        if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
            window.electronAPI.onUpdateAvailable(() => setUpdateStatus('available'));
            window.electronAPI.onDownloadProgress((info) => {
                setUpdateStatus('downloading');
                setUpdateProgress(info.percent || 0);
            });
            window.electronAPI.onUpdateDownloaded(() => setUpdateStatus('downloaded'));
        }
    }, []);

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
            <div style={{ marginTop: '10px', fontSize: '10px', color: '#555' }}>Preparing KevRyn Environment v2.0</div>
        </div>
    );

    // --- UTILS: SAFE STORAGE ---
    const persistAuth = (data) => {
        const u = data.user?.username || data.username;
        const e = data.user?.email || data.email || "";
        const id = data.user?._id || data.userId;
        const r = data.user?.role || data.role;
        const p = data.user?.picture || data.picture || "";
        const cId = data.user?.collegeId || data.collegeId || null;
        const cName = data.user?.collegeName || data.collegeName || null;

        if (u && u !== 'undefined') {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', u);
            localStorage.setItem('email', e);
            localStorage.setItem('userId', id);
            localStorage.setItem('role', r);
            localStorage.setItem('picture', p);
            if (cId) localStorage.setItem('collegeId', cId);
            else localStorage.removeItem('collegeId');
            if (cName) localStorage.setItem('collegeName', cName);
            else localStorage.removeItem('collegeName');

            setToken(data.token);
            setUsername(u);
            setUserId(id);
            setUserRole(r);
            setUserPicture(p);
            setCollegeId(cId);
            setCollegeName(cName);
            
            // Set Command Center visibility dynamically on login
            if (r === 'student' && cName && cName.toLowerCase().includes('ace')) {
                setShowStudentAssignments(true);
            } else {
                setShowStudentAssignments(false);
            }
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
    const languageRuntimeRef = useRef(null); // NEW: C/Python browser runner
    const [webcontainerInstance, setWebcontainerInstance] = useState(null);
    const [wcReady, setWcReady] = useState(false);
    const [langRuntimeStatus, setLangRuntimeStatus] = useState('idle'); // 'idle' | 'installing' | 'ready' | 'error'

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

                // LISTEN FOR PORT EVENTS (Full-stack Frameworks)
                instance.on('server-ready', (port, url) => {
                    console.log(`[WebContainer] Port detected: ${port} @ ${url}`);
                    setActivePorts(prev => {
                        if (prev.some(p => p.port === port)) return prev;
                        return [...prev, { port, url }];
                    });

                    // Auto-open Ports tab to notify the user
                    setBottomPanelTab('ports');
                    setIsBottomPanelOpen(true);
                });

                console.log("[WebContainer] Booted Successfully");

                // LanguageRuntime disabled — Python/C/C++ always run via server PTY (faster, no install lag)
                setLangRuntimeStatus('idle');
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

    const api = useMemo(() => axios.create({
        baseURL: SERVER_URL,
        headers: { Authorization: token ? (token.startsWith('Bearer ') ? token : `Bearer ${token}`) : '' }
    }), [token]);

    useEffect(() => {
        if (token && api) {
            api.get('/api/broadcasts/active')
               .then(res => {
                   if (res.data && res.data.length > 0) setActiveBroadcast(res.data[0]);
               })
               .catch(err => console.error("Broadcast fetch error", err));
        }
    }, [token, api]);

    const safeEmit = useCallback((event, data, callback) => {
        if (socketRef.current) {
            socketRef.current.emit(event, data, callback);
        }
    }, []);

    // --- CENTRALIZED LOGOUT ---
    const handleLogout = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('email');
        localStorage.removeItem('userId');
        localStorage.removeItem('role');
        localStorage.removeItem('picture');
        localStorage.removeItem('collegeId');
        localStorage.removeItem('collegeName');
        localStorage.removeItem('lastSessionId');
        localStorage.removeItem('theme'); // Optional: keep or clear based on preference, clearing for safety

        // 2. Reset State
        setToken(null);
        setUsername("");
        setUserId("");
        setUserRole("student"); // Default back to student
        setCollegeId(null);
        setCollegeName(null);
        setIsFacultyLogin(false); // Default back to student login
        setIsLogin(true);
        setActiveSessionId(null);
        setActiveSession(null); // NEW: Reset full session
        setIsLabOpen(false);
        setDeployStatus(null);

        // 3. Force Reload to clear any lingering React state/sockets
        window.location.reload();
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
        if (!activeFileId || !editorRef.current) return;
        const fullPath = findFileFullPath(activeFileId);
        const latestCode = editorRef.current.getValue();
        console.log(`[SAVE] Triggered for ${fullPath} (${activeFileId})`);
        
        // Clear dirty state on save
        setDirtyFiles(prev => ({ ...prev, [activeFileId]: false }));

        try {
            // Native Local Mode
            if (localWorkspacePath && window.electronAPI) {
                // activeFileId is the absolute path
                await window.electronAPI.writeLocalFile(activeFileId, latestCode);
                return;
            }

            // Cloud Mode
            await api.put(`/files/${activeFileId}`, { content: latestCode });
            safeEmit('save-file-disk', {
                fileName: fullPath,
                code: latestCode,
                userId,
                fileId: activeFileId,
                courseId: activeSession?.courseId || undefined
            });
            if (wcBridgeRef.current) {
                await wcBridgeRef.current.writeFile(fullPath, latestCode);
            }

            // Non-intrusive toast instead of alert
            const toast = document.createElement('div');
            toast.textContent = '\u2705 Saved!';
            Object.assign(toast.style, {
                position: 'fixed', bottom: '24px', left: '50%',
                transform: 'translateX(-50%)', background: '#10b981',
                color: '#fff', padding: '8px 18px', borderRadius: '6px',
                fontSize: '13px', zIndex: '99999',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                transition: 'opacity 0.3s',
            });
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 1500);
        } catch (e) {
            console.error("[SAVE] Failed:", e);
            alert("Error saving file");
        }
    }, [activeFileId, findFileFullPath, api, code, safeEmit, userId, wcBridgeRef, activeSession]);

    // --- THEME STATE ---
    const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('theme') || 'midnight'); // Default to Midnight for best effect

    // --- BOTTOM PANEL STATE ---
    const [bottomPanelTab, setBottomPanelTab] = useState('terminal');
    const [deployMode, setDeployMode] = useState('local');
    const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
    const [bottomPanelHeight, setBottomPanelHeight] = useState(200); // Compact default — user can resize up
    const [isResizingPanel, setIsResizingPanel] = useState(false);
    const [isBottomPanelMaximized, setIsBottomPanelMaximized] = useState(false);
    const prevBottomPanelHeight = useRef(250);

    // --- AI PANEL STATE ---
    const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
    const [activeAiAgent, setActiveAiAgent] = useState('groq-assistant');
    const [aiPanelWidth, setAiPanelWidth] = useState(350);
    const [isResizingAi, setIsResizingAi] = useState(false);

    // --- CLONE MODAL STATE ---
    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [isSwitchRepoModalOpen, setIsSwitchRepoModalOpen] = useState(false);

    // --- AI DIFF MODAL STATE ---
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
    const [diffData, setDiffData] = useState({ oldCode: '', newCode: '', fileName: '', language: 'javascript', onApply: null });
    const [terminalError, setTerminalError] = useState(null); // Keep self-healing state but remove WC state <!-- id: 400 -->

    // --- GLOBAL SEARCH STATE ---
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isIssueReporterOpen, setIsIssueReporterOpen] = useState(false); // NEW: Issue Reporter State
    // activeWorkspaceFolderId moved up

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

    // Keyboard Listeners (Ctrl+Shift+F for Search, Ctrl+B for Sidebar, Ctrl+` for Terminal)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
            // Ctrl+B: Toggle sidebar
            if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                setIsSidebarCollapsed(prev => !prev);
            }
            // Ctrl+`: Toggle terminal panel
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                setIsBottomPanelOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            default: return 'kevryn-dark';
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


    const fetchFiles = useCallback(async (silent = false) => {
        if (!userId) return;
        
        // Native Local Folder Mode (Desktop)
        if (window.__KEVRYN_DESKTOP__) {
            if (localWorkspacePath && window.electronAPI) {
                try {
                    if (!silent) setIsAppLoading(true);
                    const localFiles = await window.electronAPI.readLocalDir(localWorkspacePath);
                    
                    // Flatten the tree for the existing files state structure, since the legacy tree expects flat arrays with parentId
                    const flattenTree = (nodes, parentId = 'root') => {
                        let flat = [];
                        nodes.forEach(node => {
                            const { children, ...rest } = node;
                            flat.push({ ...rest, parentId });
                            if (children && children.length > 0) {
                                flat = flat.concat(flattenTree(children, node._id));
                            }
                        });
                        return flat;
                    };
                    
                    const flatFiles = flattenTree(localFiles);
                    setFiles(flatFiles);
                } catch (err) {
                    console.error("Failed to read local dir:", err);
                    alert("Could not load local directory");
                } finally {
                    if (!silent) setIsAppLoading(false);
                }
            } else {
                // If desktop but no local folder opened, don't fetch cloud files, just empty
                setFiles([]);
            }
            return;
        }

        // Web IDE Cloud Mode
        // Debounce logic: cancel existing timer
        if (window.fetchFilesTimer) clearTimeout(window.fetchFilesTimer);

        const executeAction = () => {
            // FIX: Pass courseId to /files to ensure we get lab files ONLY when in an active lab session
            const fetchUrl = (isLabOpen && activeSession?.courseId) ? `/files?courseId=${activeSession.courseId}` : '/files';
            api.get(fetchUrl).then(async res => {
                let fetchedFiles = res.data;
                if (fetchedFiles.length === 0) {
                    // Auto-generate a default file for beginners
                    try {
                        const defaultPayload = { 
                            name: 'hello.py', 
                            content: 'print("Hello, KevRyn IDE!")\n',
                            type: 'file',
                            courseId: (isLabOpen && activeSession?.courseId) ? activeSession.courseId : undefined
                        };
                        const createRes = await api.post('/files', defaultPayload);
                        fetchedFiles = [createRes.data];
                    } catch (e) {
                        console.error('Failed to create default hello file', e);
                    }
                }
                setFiles(fetchedFiles);
                setIsAppLoading(false); // Boot sequence complete
            }).catch(err => {
                const status = err.response?.status;
                if (status === 401 || status === 400) {
                    // Token expired or invalid — force logout so user can re-login
                    console.warn('[AUTH] Token invalid/expired. Logging out.');
                    handleLogout();
                } else {
                    console.error('[FILES] Failed to fetch files:', err.message);
                    // Show empty workspace instead of hanging on loading screen
                    setFiles([]); 
                    setIsAppLoading(false);
                }
            });
        };

        if (silent) {
            executeAction();
        } else {
            window.fetchFilesTimer = setTimeout(executeAction, 300); // 300ms debounce
        }
    }, [token, api, activeSession, handleLogout, activeWorkspaceFolderId, localWorkspacePath, userId]);

    // Handle Global Shortcuts (Ctrl+S, F2, Ctrl+N, Ctrl+Shift+N, Ctrl+W, Ctrl+Tab)
    useEffect(() => {
        const handleKeyDown = (e) => {
            const ctrl = e.ctrlKey || e.metaKey;

            // Ctrl+S: Save
            if (ctrl && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }

            // Ctrl+Enter: Run Code
            if (ctrl && e.key === 'Enter') {
                e.preventDefault();
                if (typeof runCode === 'function') runCode();
            }

            // F2: Rename active file
            if (e.key === 'F2' && activeFileId) {
                e.preventDefault();
                const f = files.find(f => f._id === activeFileId);
                if (f) handleRename(f);
            }

            // Ctrl+N: New File
            if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                createNode('file', 'root');
            }

            // Ctrl+Shift+N: New Folder
            if (ctrl && e.shiftKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                createNode('folder', 'root');
            }

            // Ctrl+W: Close active tab
            if (ctrl && e.key.toLowerCase() === 'w') {
                e.preventDefault();
                if (activeFileId) {
                    setOpenFiles(prev => {
                        const idx = prev.findIndex(f => f._id === activeFileId);
                        const next = prev.filter(f => f._id !== activeFileId);
                        if (next.length === 0) {
                            setActiveFileId(null); setFileName(''); setCode('');
                        } else {
                            const nextFile = next[Math.max(0, idx - 1)];
                            handleFileClick(nextFile);
                        }
                        return next;
                    });
                }
            }

            // Ctrl+Tab: Next tab
            if (ctrl && !e.shiftKey && e.key === 'Tab') {
                e.preventDefault();
                setOpenFiles(prev => {
                    if (prev.length < 2) return prev;
                    const idx = prev.findIndex(f => f._id === activeFileId);
                    const next = prev[(idx + 1) % prev.length];
                    handleFileClick(next);
                    return prev;
                });
            }

            // Ctrl+Shift+Tab: Prev tab
            if (ctrl && e.shiftKey && e.key === 'Tab') {
                e.preventDefault();
                setOpenFiles(prev => {
                    if (prev.length < 2) return prev;
                    const idx = prev.findIndex(f => f._id === activeFileId);
                    const next = prev[(idx - 1 + prev.length) % prev.length];
                    handleFileClick(next);
                    return prev;
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFileId, fileName, code, handleSave, files, openFiles]);

    const [socketInstance, setSocketInstance] = useState(null);

    // --- SOCKET INITIALIZATION & LISTENERS ---
    useEffect(() => {
        if (!socketRef.current) {
            console.log("[SOCKET] Initializing...");
            socketRef.current = io(SERVER_URL, {
                auth: { token: token }, // Send JWT for server-side socket authentication
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 10
            });
            setSocketInstance(socketRef.current);

            socketRef.current.on('disconnect', () => {
                setSocketConnected(false);
                console.warn('Socket Disconnected');
            });

            // LISTEN: Refresh file tree whenever any file is created (collaborative + own creation)
            socketRef.current.on('node-created', () => {
                console.log('[SOCKET] node-created event received, refreshing file list');
                fetchFiles(true);
            });
        }

        // --- KEVRYN STUDENT MONITOR LOGIC ---
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
        safeEmit('join-chat', { username, sessionId: activeSessionId });
        api.get('/deploy/status').then(res => setDeployStatus(res.data)).catch(() => { });
        // Removed: /api/debug-env health check (unnecessary API call on every login)

        s.on('global-broadcast', (data) => setActiveBroadcast(data));
        s.on('global-broadcast-dismissed', ({ id }) => { setActiveBroadcast(prev => (prev && prev._id === id) ? null : prev); });

        const handleReceiveMessage = (msg) => { setChatMessages(prev => [...prev, msg]); };
        s.on('receive-message', handleReceiveMessage);
        s.on('previous-messages', (msgs) => setChatMessages(msgs));
        s.on('receive-code', (data) => {
            // Support both old string format and new object format
            const incomingCode = typeof data === 'string' ? data : data.newCode;
            const incomingFileId = typeof data === 'object' ? data.fileId : null;
            
            if (!incomingFileId || incomingFileId === activeFileIdRef.current) {
                isRemoteUpdate.current = true;
                setCode(incomingCode);
            }
        });
        s.on('node-created', fetchFiles);
        s.on('file-shared', (fname) => { alert(`New file synced: ${fname}`); fetchFiles(); });

        s.on('cursor-update', ({ userId: rUserId, username: rUsername, position: rPosition, fileId: rFileId }) => {
            if (rUserId === userId) return;
            // Only show cursors for the currently active file
            if (rFileId && rFileId !== activeFileIdRef.current) return;
            setRemoteCursors(prev => ({ ...prev, [rUserId]: { username: rUsername, position: rPosition, color: getRandomColor(rUserId) } }));
        });

        // NEW: Listen for new sessions (Real-time join)
        s.on('session-started', async (sess) => {
            if (userRole === 'student' && sess) {
                // Verify student is allowed (empty array means general college lab available to everyone)
                if (sess.allowedStudents && sess.allowedStudents.length > 0 && !sess.allowedStudents.includes(username)) return;
                
                setActiveSessionId(sess._id);
                setActiveSession(sess);

                // Replaced 'alert' with 'confirm' so the student can directly join the lab from the popup
                const joinNow = await showDialog({ 
                    type: 'confirm', 
                    title: 'Live Lab Started!', 
                    message: "A new Lab Session '" + sess.sessionName + "' has been started by your instructor.\n\nDo you want to enter the lab workspace now?"
                });

                if (joinNow) {
                    setIsLabOpen(true);
                    setShowStudentAssignments(false);
                }
            }
        });

        // Listen for new assignments
        s.on('assignment-created', async (data) => {
            if (userRole === 'student') {
                try {
                    // Check if this student is supposed to receive this assignment
                    const res = await api.get('/api/assignments/student/active');
                    const isForMe = res.data.some(a => a._id === data.assignmentId);
                    if (isForMe) {
                        setNewAssignmentAlert(data);
                    }
                } catch (e) { console.error("Error checking assignment", e); }
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
            s.off('assignment-created');
            s.off('session-ended');
            s.off('global-broadcast');
            s.off('global-broadcast-dismissed');
            window.removeEventListener('click', closeMenu);
        };
    }, [token, username, userId, fetchFiles, api, userRole, activeWorkspaceFolderId]); // Simplified dependencies



    // --- GITHUB OAUTH HANDLE ---
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const urlToken = query.get('token');
        const urlUsername = query.get('username');
        const urlUserId = query.get('userId');
        const urlPicture = query.get('picture');
        const urlEmail = query.get('email');

        if (urlToken && urlUsername && urlUserId) {
            persistAuth({
                token: urlToken,
                username: urlUsername,
                email: urlEmail,
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


    const saveLabReport = async (fname, fcode, timeDelta, status = 'in-progress') => {
        if (!activeSessionId) return;

        try {
            await api.post('/lab/update-report', {
                courseName: activeSession?.courseId?.name || "General Lab",
                fileName: fname,
                code: fcode,
                timeSpent: timeDelta, // Send the DELTA, not total
                status
            });
        } catch (e) { console.error("Report sync failed", e); }
    };

    // RE-IMPLEMENTING TIMER TO SEND DELTAS SAFELY
    const pendingTime = useRef({}); // { [fileName]: seconds_since_last_sync }

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

    // --- APTITUDE SESSION CHECK ---
    useEffect(() => {
        if (userRole === 'student' && token) {
            const checkAptitude = async () => {
                try {
                    const res = await api.get('/api/aptitude/student/active');
                    if (res.data.session) {
                        setActiveAptitudeSession(res.data.session);
                    } else {
                        setActiveAptitudeSession(null);
                    }
                } catch (e) { console.error("Aptitude Check Failed", e); }
            };
            checkAptitude();
            // Poll every 2 minutes for new exams
            const interval = setInterval(checkAptitude, 120000);
            return () => clearInterval(interval);
        }
    }, [token, userRole, api]);




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
    // URL params already handled by useEffect at line 697



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
            if (res.data.folderId) {
                setActiveWorkspaceFolderId(res.data.folderId);
            }
            fetchFiles();
            alert(`Project ${folderName} created and workspace scoped!`);
        } catch (e) {
            alert("Error creating template: " + (e.response?.data?.error || e.message));
        } finally {
            setIsAiLoading(false);
        }
    };

    const createNode = useCallback(async (type, parentId = 'root') => {
        if (!userId && !localWorkspacePath) return alert("Please login again (User ID missing).");
        const name = await showDialog({ type: 'prompt', title: `Enter ${type} name:`, defaultValue: '' });
        if (name) {
            // Native Local Mode
            if (localWorkspacePath && window.electronAPI) {
                const targetDir = parentId === 'root' ? localWorkspacePath : parentId;
                const newPath = targetDir + (targetDir.endsWith('\\') || targetDir.endsWith('/') ? '' : '/') + name;
                const res = await window.electronAPI.createLocalItem(newPath, type);
                if (res.success) {
                    fetchFiles(true);
                    
                    // NEW: If in Lab Mode on Desktop, we MUST sync the creation to the backend so the faculty can report on it!
                    if (isLabOpen && activeSession?.courseId) {
                        try {
                            await api.post('/files', {
                                name: name,
                                type: type,
                                courseId: activeSession.courseId,
                                content: "" // Will be updated on save
                            });
                        } catch(e) { console.error("Lab Backend Sync Error:", e); }
                    }
                    
                } else {
                    alert("Failed to create native file: " + res.error);
                }
                return;
            }

            // Cloud Mode
            const courseId = (isLabOpen && activeSession?.courseId) ? activeSession.courseId : undefined;
            safeEmit('create-node', { parentId, newNode: { name, type }, userId, courseId }, (ack) => {
                if (ack?.success) {
                    fetchFiles(true); 
                } else if (ack?.error) {
                    alert("Failed to create file: " + ack.error);
                } else {
                    setTimeout(() => fetchFiles(true), 500);
                }
            });
        }
    }, [userId, localWorkspacePath, isLabOpen, activeSession, fetchFiles, showDialog]);

    const handleCreateProject = useCallback(async () => {
        const folderName = await showDialog({ type: 'prompt', title: "Enter project folder name:", defaultValue: "my-new-app" });
        if (folderName) {
            safeEmit('create-project', { folderName, userId }, (ack) => {
                if (ack && ack.success) {
                    fetchFiles(true);
                } else {
                    alert("Failed to create project: " + (ack ? ack.error : "Unknown error"));
                }
            });
        }
    }, [userId, fetchFiles, showDialog]);

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
        try { 
            const res = await api.post('/project/upload', { tree: await buildTree(files) }); 
            if (res.data.folderId) {
                setActiveWorkspaceFolderId(res.data.folderId);
            }
            alert("Project uploaded and workspace scoped!"); 
            fetchFiles(); 
        } catch (e) { alert("Upload failed."); }
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


    const handleSaveAs = useCallback(async () => {
        const newName = await showDialog({ type: 'prompt', title: "Save As (Enter new filename):", defaultValue: "copy_" + fileName });
        if (newName) {
            safeEmit('save-file-disk', { fileName: newName, code, userId });
            showDialog({ type: 'alert', title: 'Success', message: "Saved as " + newName });
        }
    }, [fileName, code, userId, showDialog]);

    const handleDelete = useCallback(async (id) => {
        if (!window.confirm("Delete?")) return;
        try {
            // Native Local Mode
            if (localWorkspacePath && window.electronAPI) {
                const res = await window.electronAPI.deleteLocalItem(id); // id is the absolute path
                if (res.success) {
                    if (activeFileId === id) { setActiveFileId(null); setFileName(""); setCode(""); }
                    fetchFiles(true);
                } else {
                    alert("Failed to delete native item: " + res.error);
                }
                return;
            }

            // Cloud Mode
            const fileToDelete = files.find(f => f._id === id);
            await api.delete(`/files/${id}`);
            if (activeFileId === id) { setActiveFileId(null); setFileName(""); setCode(""); }
            if (wcBridgeRef.current && fileToDelete) {
                setTimeout(fetchFiles, 500);
            } else {
                fetchFiles();
            }
        } catch (e) { }
    }, [api, files, activeFileId, fetchFiles, localWorkspacePath]);
    
    const handleRename = useCallback(async (f) => {
        const n = f._newName || await showDialog({ type: 'prompt', title: "New name:", defaultValue: f.name });
        if (n && n !== f.name) {
            try {
                // Native Local Mode
                if (localWorkspacePath && window.electronAPI) {
                    // Calculate the new path by swapping out the basename
                    const oldPath = f._id;
                    const pathParts = oldPath.split(/[\/\\]/);
                    pathParts[pathParts.length - 1] = n;
                    const newPath = pathParts.join('/'); // the backend fs can handle forward slashes
                    
                    const res = await window.electronAPI.renameLocalItem(oldPath, newPath);
                    if (res.success) {
                        if (activeFileId === oldPath) setFileName(n);
                        fetchFiles(true);
                    } else {
                        alert("Failed to rename native item: " + res.error);
                    }
                    return;
                }

                // Cloud Mode
                await api.put(`/files/${f._id}`, { newName: n });
                if (activeFileId === f._id) setFileName(n);
                fetchFiles();
            } catch (e) { console.error('[Rename] Failed:', e); }
        }
    }, [api, activeFileId, setFileName, fetchFiles, showDialog, localWorkspacePath]);
    const handleDownload = useCallback((file) => {
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
    }, []);
    const createFolder = (parentId = 'root') => createNode('folder', parentId);
    const handleCopyPath = useCallback((file) => {
        const path = findFileFullPath(file._id) || file.name;
        navigator.clipboard.writeText(path).then(() => {
            const toast = document.createElement('div');
            toast.textContent = `📋 Copied: ${path}`;
            Object.assign(toast.style, {
                position: 'fixed', bottom: '24px', left: '50%',
                transform: 'translateX(-50%)',
                background: '#007acc', color: '#fff',
                padding: '8px 18px', borderRadius: '6px',
                fontSize: '13px', zIndex: '99999',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                transition: 'opacity 0.3s',
            });
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 2000);
        }).catch(() => prompt('Copy this path:', path));
    }, [findFileFullPath]);

    const handleFileClick = async (file, lineToJump = null) => {
        try {
            const prevFileId = activeFileIdRef.current;
            const prevFileName = fileNameRef.current;

            // --- ATOMIC SAVE OF PREVIOUS FILE ---
            if (prevFileId && editorRef.current) {
                const latestContent = editorRef.current.getValue();
                
                // 1. Update cache in state
                setOpenFiles(prev => prev.map(f => f._id === prevFileId ? { ...f, content: latestContent } : f));
                
                // 2. Persist to DB and Disk
                api.put(`/files/${prevFileId}`, { content: latestContent }).catch(() => {});
                safeEmit('save-file-disk', { fileName: prevFileName, code: latestContent, userId, fileId: prevFileId });
                
                // 3. Clear any pending auto-saves
                if (autoSaveTimeoutRef.current) { clearTimeout(autoSaveTimeoutRef.current); autoSaveTimeoutRef.current = null; }
                if (window.codeUpdateTimer) { clearTimeout(window.codeUpdateTimer); window.codeUpdateTimer = null; }
            }

            // --- PREPARE NEW FILE ---
            let targetFile = file;
            if (typeof file === 'string') {
                targetFile = filesRef.current.find(f => f.name === file);
                if (!targetFile) return;
            }

            // Check if it's already the active one (avoid redundant resets)
            if (targetFile._id === prevFileId) return;

            // CACHE CHECK
            const cached = openFilesRef.current.find(f => f._id === targetFile._id);
            let content = cached ? cached.content : null;

            // SWITCH STATE ATOMICALLY
            setActiveFileId(targetFile._id);
            setFileName(targetFile.name);
            activeFileIdRef.current = targetFile._id; // Manual sync for immediate next handleFileClick safety
            fileNameRef.current = targetFile.name;

            if (content !== null) {
                setCode(content);
            } else {
                setCode("// Loading...");
                try {
                    if (localWorkspacePath && window.electronAPI) {
                        content = await window.electronAPI.readLocalFile(targetFile._id) || "";
                    } else {
                        const res = await api.get(`/files/${targetFile._id}`);
                        content = res.data.content || "";
                    }
                    setCode(content);
                    setOpenFiles(prev => {
                        if (prev.find(f => f._id === targetFile._id)) return prev;
                        return [...prev, { ...targetFile, content }];
                    });
                } catch (apiErr) {
                    isRemoteUpdate.current = true; // DO NOT autosave this error!
                    setCode(`// Error: Failed to load file content.\n// Details: ${apiErr.message}`);
                    return; 
                }
            }

            isRemoteUpdate.current = false;
            safeEmit('join-file', targetFile._id);

            // --- SMART TERMINAL SWITCHING ---
            if (targetFile && targetFile.name) {
                const ext = targetFile.name.split('.').pop().toLowerCase();
                const serverExts = ['java', 'c', 'cpp', 'py', 'go', 'rs', 'php', 'rb'];
                const webExts = ['html', 'css', 'js', 'jsx', 'ts', 'tsx', 'json'];
                
                if (localWorkspacePath) {
                    setActiveTermId(1); // Force local terminal for all execution when in Desktop App
                } else if (serverExts.includes(ext)) {
                    setActiveTermId('server-1');
                } else if (webExts.includes(ext)) {
                    setActiveTermId(1); // Local WebContainer
                }
            }

            if (lineToJump && editorRef.current) {
                setTimeout(() => {
                    editorRef.current.revealLineInCenter(lineToJump);
                    editorRef.current.setPosition({ lineNumber: lineToJump, column: 1 });
                    editorRef.current.focus();
                }, 150);
            }
        } catch (e) {
            console.error("[FileClick] Error:", e);
        }
    };

    const closeTab = (e, id) => {
        e.stopPropagation();
        // Cancel pending debounced saves to prevent stale writes
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }
        const newOpen = openFiles.filter(f => f._id !== id);
        setOpenFiles(newOpen);
        if (activeFileId === id) {
            if (newOpen.length > 0) {
                handleFileClick(newOpen[newOpen.length - 1]);
            } else {
                setActiveFileId(null);
                activeFileIdRef.current = null;
                setFileName("");
                fileNameRef.current = "";
                setCode("// Select a file to start coding...");
            }
        }
    };

    const runCode = async () => {
        if (!activeFileId) return alert("Select file!");
        const fullPath = findFileFullPath(activeFileId);
        const activeFileName = fullPath;
        const ext = activeFileName.split('.').pop().toLowerCase();
        const serverExts = ['java', 'c', 'cpp', 'py', 'go', 'rs', 'php', 'rb'];

        const latestCode = editorRef.current ? editorRef.current.getValue() : code;

        // Native Local Folder Mode save
        if (localWorkspacePath && window.electronAPI) {
            try {
                await window.electronAPI.writeLocalFile(activeFileId, latestCode); // activeFileId is absolute path
                setDirtyFiles(prev => { const d = { ...prev }; delete d[activeFileId]; return d; });
            } catch (err) {
                console.error("Failed to save local file:", err);
                alert("Failed to save local file");
                return;
            }
            
            // Still run it using Native Desktop
            setBottomPanelTab('terminal');
            setIsBottomPanelOpen(true);
            await new Promise(r => setTimeout(r, 50));
            setActiveTermId(1); // Native Desktop uses Local Terminal
            const ext = activeFileName.split('.').pop().toLowerCase();
            const fullLangName = ext === 'py' ? 'python' : ext === 'js' ? 'javascript' : ext;
            
            // Build the local command
            const filenameOnly = activeFileId.split(/[\\/]/).pop();
            const fileNameNoExt = filenameOnly.replace(/\.[^.]+$/, '');
            const dirPath = activeFileId.substring(0, activeFileId.lastIndexOf(activeFileId.includes('\\') ? '\\' : '/'));
            const isWin = navigator.userAgent.toLowerCase().includes('windows');
            const sep = isWin ? ';' : '&&';
            const runPrefix = isWin ? '.\\\\' : './';
            const pyCmd = isWin ? 'python' : 'python3';
            const exeExt = isWin ? '.exe' : '';
            
            let localCmd = '';
            if (ext === 'py') localCmd = `${pyCmd} "${filenameOnly}"`;
            else if (ext === 'js') localCmd = `node "${filenameOnly}"`;
            else if (ext === 'java') localCmd = `javac "${filenameOnly}" ${sep} java "${fileNameNoExt}"`;
            else if (ext === 'c') localCmd = `gcc "${filenameOnly}" -o "${fileNameNoExt}${exeExt}" ${sep} ${runPrefix}${fileNameNoExt}${exeExt}`;
            else if (ext === 'cpp') localCmd = `g++ "${filenameOnly}" -o "${fileNameNoExt}${exeExt}" ${sep} ${runPrefix}${fileNameNoExt}${exeExt}`;
            
            const cdCmd = `cd "${dirPath}"`;
            const finalCmd = localCmd ? `${cdCmd} ${sep} ${localCmd}` : '';

            await ExecutionService.run({
                fileName: activeFileId, // absolute path
                cmd: finalCmd,
                code: latestCode,
                language: fullLangName,
                activeFileId,
                courseId: undefined,
                socketRef,
                api,
                termId: serverExts.includes(ext) ? 'server-1' : 1
            });
            return;
        }

        // OPTIMIZED: Parallelize DB save and Disk sync for instant performance
        let dbSavePromise;
        if (window.__KEVRYN_DESKTOP__ && isLabOpen && activeSession?.courseId) {
            dbSavePromise = api.post('/student/lab-sync', {
                fileName: fileName,
                content: latestCode,
                courseId: activeSession.courseId
            }).catch(e => console.error("Desktop Lab Sync Failed:", e));
        } else if (!window.__KEVRYN_DESKTOP__ || (activeFileId && !activeFileId.includes('\\') && !activeFileId.includes('/'))) {
            dbSavePromise = api.put(`/files/${activeFileId}`, { content: latestCode }).catch(e => console.error("DB Save Failed:", e));
        } else {
            dbSavePromise = Promise.resolve();
        }
        
        const saveData = {
            fileName: fullPath,
            code: latestCode,
            userId,
            fileId: activeFileId,
            courseId: (isLabOpen && activeSession?.courseId) ? activeSession.courseId : undefined
        };

        const diskSavePromise = new Promise((resolve) => {
            if (!socketRef.current) {
                console.warn("[RUN] Socket not connected, skipping disk save");
                return resolve();
            }
            socketRef.current.emit('save-file-disk', saveData, (ack) => {
                console.log("[RUN] Disk sync complete", ack);
                resolve();
            });
            setTimeout(resolve, 800); // Faster timeout fallback
        });

        // Show intent immediately
        setBottomPanelTab('terminal');
        setIsBottomPanelOpen(true);

        // Wait for both in parallel (Disk sync is critical, DB save is best-effort for the run)
        await Promise.all([dbSavePromise, diskSavePromise]);

        if (wcBridgeRef.current) {
            wcBridgeRef.current.writeFile(fullPath, latestCode).catch(() => {});
        }

        if (activeFileName.endsWith('.html')) {
            openPreview();
            return;
        }

        let cmd = "";
        // --- FIX: Robust Path Fallback & Linux Support ---
        const filenameOnly = activeFileName.split('/').pop();
        const fileNameNoExt = filenameOnly.replace(/\.[^.]+$/, '');
        const exePrefix = './'; // Standard for Linux/Cloud environments

        const relativeFileName = activeFileName.replace(/^\/+/, '');
        // All languages run via server PTY — fast & reliable
        const serverCommands = {
            'js': `node "${relativeFileName}"`,
            'py': `python3 "${relativeFileName}" || python "${relativeFileName}"`,
            'java': `javac "${relativeFileName}" && java "${fileNameNoExt}"`,
            'c': `gcc "${relativeFileName}" -o output && ${exePrefix}output; echo ""`,
            'cpp': `g++ "${relativeFileName}" -o output && ${exePrefix}output; echo ""`,
            'rb': `ruby "${relativeFileName}"`,
            'go': `go run "${relativeFileName}"`,
            'php': `php "${relativeFileName}"`,
            'ts': `npx ts-node "${relativeFileName}"`,
        };
        cmd = serverCommands[ext];

        if (cmd) {
            setBottomPanelTab('terminal');
            setIsBottomPanelOpen(true);

            // Minimal delay for UI to render the terminal panel
            await new Promise(r => setTimeout(r, 50));
            setActiveTermId('server-1');

            const fullLangName = ext === 'py' ? 'python' : ext === 'js' ? 'javascript' : ext;
            await ExecutionService.run({
                fileName: activeFileName,
                cmd,
                code: latestCode,
                language: fullLangName,
                activeFileId,
                courseId: (isLabOpen && activeSession?.courseId) ? activeSession.courseId : undefined,
                socketRef,
                api,
                termId: 'server-1'
            });
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

    const handleAgenticFix = async (errObj) => {
        if (!activeFileId || !code) return alert("Open a file first!");
        console.log("[AGENT] Starting self-healing process...", errObj);
        
        setIsAiLoading(true);
        try {
            const payload = {
                code: code,
                errorOutput: errObj.output,
                activeFileName: activeFileId
            };
            const res = await api.post('/ai/fix-terminal-error', payload, { timeout: 30000 });
            
            if (res.data.fixedCode) {
                setCode(res.data.fixedCode);
                
                // Clear the error overlay
                setTerminalError(null);
                
                // Non-intrusive toast instead of alert
                const toast = document.createElement('div');
                toast.textContent = '🤖 Fix applied successfully! ' + (res.data.explanation || "");
                Object.assign(toast.style, {
                    position: 'fixed', bottom: '60px', left: '50%',
                    transform: 'translateX(-50%)', background: '#3b82f6',
                    color: '#fff', padding: '12px 24px', borderRadius: '8px',
                    fontSize: '14px', zIndex: '99999',
                    maxWidth: '80%', textAlign: 'center',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    transition: 'opacity 0.5s',
                });
                document.body.appendChild(toast);
                setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 5000);
            }
        } catch (e) { 
            console.error("Agentic fix failed:", e);
            alert("KevRyn AI Fix Failed: " + (e.response?.data?.error || e.message)); 
        } finally { 
            setIsAiLoading(false); 
        }
    };

    const openPreview = useCallback(() => {
        const previewUrl = `${SERVER_URL}/preview/${userId}/${fileName}?t=${Date.now()}`;
        window.open(previewUrl, '_blank');
    }, [userId, fileName]);

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
    const sendChatMessage = (e) => { e.preventDefault(); if (!chatInput.trim()) return; safeEmit('send-message', { sender: username, text: chatInput, visibility: chatVisibility, sessionId: activeSessionId }); setChatInput(""); };
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
                courseId: (isLabOpen && activeSession?.courseId) ? activeSession.courseId : null
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
                courseId: (isLabOpen && activeSession?.courseId) ? activeSession.courseId : null
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
                if (isFacultyLogin && role !== 'faculty' && role !== 'admin' && role !== 'college_admin') {
                    showDialog({ type: 'alert', title: 'Access Denied', message: 'You are logging in as Faculty, but this account is a Student. Please use the Student Login.' });
                    return;
                }
                if (!isFacultyLogin && role !== 'student') {
                    showDialog({ type: 'alert', title: 'Access Denied', message: 'You are logging in as Student, but this account is Faculty/Admin. Please use the Management Login.' });
                    return;
                }

                persistAuth(r.data);
                setIsAppLoading(false);

            } else { showDialog({ type: 'alert', title: 'Success', message: 'Registered! Please Log In.' }); setIsLogin(true); }
        } catch (e) { showDialog({ type: 'alert', title: 'Auth Failed', message: e.response?.data?.error || e.message }); }
    };

    // Google Login Handler
    const handleGoogleLoginSuccess = async (credentialResponse) => {
        try {
            const res = await api.post('/auth/google', { token: credentialResponse.credential });
            const { token, username, userId, picture, role } = res.data; // Ensure role is returned

            const userRole = role || "student";

            // --- STRICT ROLE VALIDATION FOR GOOGLE LOGIN ---
            // If they are on Faculty Login screen, they must be Faculty or Admin
            if (isFacultyLogin && userRole !== 'faculty' && userRole !== 'admin' && userRole !== 'college_admin') {
                showDialog({ type: 'alert', title: 'Access Denied', message: 'This Google account is a Student. Please switch to Student Login.' });
                return;
            }
            // If they are on Student Login screen, they must be Student
            if (!isFacultyLogin && userRole !== 'student') {
                showDialog({ type: 'alert', title: 'Access Denied', message: 'This Google account is Faculty/Admin. Please switch to Management Login.' });
                return;
            }

            persistAuth(res.data);
            setIsAppLoading(false);

        } catch (err) {
            console.error("Google Login Failed", err);
            showDialog({ type: 'alert', title: 'Login Error', message: 'Google Login Failed. Please try again.' });
        }
    };

    // Production diagnostic tool
    const runConnectionCheck = async () => {
        const testUrl = `${SERVER_URL}/health`;
        const start = Date.now();
        console.log(`[DIAGNOSTIC] Testing connection to: ${testUrl}`);
        try {
            const res = await axios.get(testUrl);
            const duration = Date.now() - start;
            showDialog({ type: 'alert', title: '✅ Connection OK', message: `Target: ${SERVER_URL}\nResponse: ${res.data}\nLatency: ${duration}ms` });
        } catch (err) {
            showDialog({ type: 'alert', title: '❌ Connection Failed', message: `Target: ${testUrl}\nError: ${err.message}` });
        }
    };

    // --- MULTI-COLLEGE TENANCY: JOIN LOGIC ---
    const handleJoinCollege = async (code) => {
        if (!code) return;
        try {
            const res = await api.post('/api/college/join', { code });
            const { token, college } = res.data;
            // Update token and local storage
            localStorage.setItem('token', token);
            localStorage.setItem('collegeId', college._id);
            localStorage.setItem('collegeName', college.name);
            setToken(token);
            setCollegeId(college._id);
            setCollegeName(college.name);
            showDialog({ type: 'alert', title: 'College Linked', message: `Welcome! You are now permanently linked to ${college.name}.` });
        } catch (e) {
            console.error("Join College Error:", e);
            showDialog({ type: 'alert', title: 'Error Linking College', message: e.response?.data?.error || e.message });
        }
    };

    // --- INVITE LINK HANDLER ---
    useEffect(() => {
        const inviteToken = window.location.pathname.match(/\/join\/(.+)/)?.[1];
        if (inviteToken && token) {
            const checkInvite = async () => {
                try {
                    const res = await api.get(`/api/college/invite/${inviteToken}`);
                    const { college } = res.data;
                    const confirmJoin = await showDialog({
                        type: 'confirm',
                        title: 'Join College?',
                        message: `Would you like to permanently join "${college.name}"?`
                    });
                    if (confirmJoin) {
                        handleJoinCollege(college.code);
                    }
                } catch (err) {
                    console.error("Invite check failed:", err);
                }
            };
            checkInvite();
        }
    }, [token, api, showDialog]);




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
                key={activeSessionId}
                localWorkspacePath={localWorkspacePath}
                session={activeSession} // NEW: Pass the REAL session object (with courseId)
                username={username}
                userId={userId}
                token={token}
                theme={currentTheme}
                webcontainer={webcontainerInstance}
                onLogout={() => {
                    // Notify server that THIS socket (App.js) is also leaving the lab
                    if (socketRef.current && activeSessionId) {
                        socketRef.current.emit('student-leave-lab', {
                            sessionId: activeSessionId,
                            username: username
                        });
                    }
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

    if (window.location.pathname === '/admin' && (!token || (userRole !== 'college_admin' && userRole !== 'admin'))) {
        window.history.replaceState(null, '', '/');
    }

    if (token && userRole === 'admin') {
        if (window.location.pathname !== '/admin') {
            window.history.replaceState(null, '', '/admin');
        }
        return <AdminDashboard token={token} onLogout={handleLogout} />;
    }

    if (token && userRole === 'college_admin') {
        if (window.location.pathname !== '/admin') {
            window.history.replaceState(null, '', '/admin');
        }
        return <ManagementDashboard token={token} onLogout={handleLogout} userRole={userRole} />;
    }

    if (token && userRole === 'faculty') {
        if (!collegeId) {
            // FACULTY MANDATORY GATE: Block access until college linked
            return ( <div style={{ position: 'fixed', inset: 0, background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, overflow: 'hidden' }}>
                    <KevRynBackground />
                    <div style={{ position: 'relative', zIndex: 10, background: 'rgba(30, 30, 45, 0.8)', backdropFilter: 'blur(20px)', padding: '40px', borderRadius: '24px', textAlign: 'center', maxWidth: '440px', border: '1px solid rgba(124, 58, 237, 0.3)', boxShadow: '0 0 60px rgba(124, 58, 237, 0.15)' }}>
                        <div style={{ marginBottom: '20px', color: '#7c3aed' }}><FaUserGraduate size={48} /></div>
                        <h2 style={{ color: '#fff', marginBottom: '10px', fontSize: '24px', fontWeight: '800' }}>Link Your College Account</h2>
                        <p style={{ color: '#a0aec0', fontSize: '15px', lineHeight: '1.6', marginBottom: '30px' }}>
                            As a faculty member, you must be linked to a college before accessing the Faculty Hub. This action is permanent.
                        </p>
                        <div style={{ position: 'relative', marginBottom: '20px' }}>
                            <input
                                type="text"
                                placeholder="ACEEN-A5EC"
                                id="facultyCollegeCodeInput"
                                style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '18px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px', outline: 'none' }}
                            />
                        </div>
                        <button
                            onClick={() => handleJoinCollege(document.getElementById('facultyCollegeCodeInput').value)}
                            style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #7c3aed, #9333ea)', border: 'none', borderRadius: '12px', color: '#fff', fontWeight: '800', cursor: 'pointer', fontSize: '16px', transition: 'all 0.3s', boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)' }}
                            onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                            onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                            Verify & Join
                        </button>
                        <button 
                            onClick={handleLogout}
                            style={{ background: 'none', border: 'none', color: '#4a5568', marginTop: '20px', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline' }}
                        >
                            Logout and switch account
                        </button>
                    </div>

                    {/* === GLOBAL DIALOG (CRITICAL FOR GATE) === */}
                    {dialog && (
                        <CustomDialog
                            type={dialog.type}
                            title={dialog.title}
                            message={dialog.message}
                            defaultValue={dialog.defaultValue}
                            onConfirm={dialog.onConfirm}
                            onCancel={dialog.onCancel}
                        />
                    )}
                </div>
            );
        }
        return <FacultyHub token={token} SERVER_URL={SERVER_URL} userId={userId} onLogout={handleLogout} />;
    }

    // 4. MAIN IDE OR AUTH SCREEN
    return (
        <>
          <TopBroadcastBanner activeBroadcast={activeBroadcast} setActiveBroadcast={setActiveBroadcast} />
          <div className="app-root" onMouseMove={handleGlobalMouseMove} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* === SPLASH SCREEN === */}
            {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

            {/* === CUSTOM DIALOG === */}
            {dialog && (
                <CustomDialog
                    type={dialog.type}
                    title={dialog.title}
                    message={dialog.message}
                    defaultValue={dialog.defaultValue}
                    onConfirm={dialog.onConfirm}
                    onCancel={dialog.onCancel}
                />
            )}

            {/* === NATIVE DESKTOP WORKSPACE SETUP MODAL === */}
            {showDesktopSetup && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#1e1e2f', padding: '40px', borderRadius: '12px', width: '500px', maxWidth: '90%', textAlign: 'center', border: '1px solid rgba(139, 92, 246, 0.5)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                        <h2 style={{ margin: '0 0 20px 0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                            <FaFolderOpen color="#a78bfa" /> KevRyn Workspace Setup
                        </h2>
                        <p style={{ color: '#aaa', fontSize: '14px', lineHeight: '1.5', marginBottom: '30px' }}>
                            Welcome to KevRyn Desktop! To give you a true native experience, please select a folder on your computer where your projects and lab files will be saved.
                        </p>
                        <button 
                            className="login-btn" 
                            style={{ width: '100%', padding: '12px', fontSize: '15px' }}
                            onClick={async () => {
                                if (window.electronAPI) {
                                    const folderPath = await window.electronAPI.selectFolder();
                                    if (folderPath) {
                                        await window.electronAPI.saveWorkspacePath(folderPath);
                                        setLocalWorkspacePath(folderPath);
                                        setShowDesktopSetup(false);
                                    }
                                }
                            }}
                        >
                            <FaFolder style={{ marginRight: '8px' }} /> Choose Workspace Folder
                        </button>
                    </div>
                </div>
            )}

            {token && userRole === 'student' && newAssignmentAlert && !isLabOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    style={{ background: '#3b82f6', color: 'white', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', zIndex: 1000, position: 'relative' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaClipboardList /> <span>New Assignment: {newAssignmentAlert.title}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => {
                                setNewAssignmentAlert(null);
                                setShowStudentAssignments(true);
                            }}
                            style={{ background: 'white', color: '#3b82f6', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            View Mission
                        </button>
                        <button
                            onClick={() => setNewAssignmentAlert(null)}
                            style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.5)', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            Dismiss
                        </button>
                    </div>
                </motion.div>
            )}

            {token && <KevRynBackground />}

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
                        onClick={() => {
                            setIsLabOpen(true);
                            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                                document.documentElement.requestFullscreen().catch(e => console.warn("Fullscreen request denied:", e));
                            }
                        }}
                        style={{ background: 'white', color: '#7c3aed', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Join Session
                    </button>
                </motion.div>
            )}

            {token && userRole === 'student' && activeAptitudeSession && !isAptitudeOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    style={{ background: 'linear-gradient(90deg, #eab308, #ca8a04)', color: 'white', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', zIndex: 1000, position: 'relative', boxShadow: '0 4px 15px rgba(234, 179, 8, 0.3)' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaExclamationTriangle /> <span>STRICT EXAM ACTIVE: {activeAptitudeSession.title}</span>
                    </div>
                    <button
                        onClick={() => setIsAptitudeOpen(true)}
                        style={{ background: 'white', color: '#a16207', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Start Exam Now
                    </button>
                </motion.div>
            )}

            <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            <AnimatePresence mode="wait">
                {!token ? (
                    <motion.div
                        key="login"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                        transition={{ duration: 0.6, ease: "circOut" }}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <KevrynLogin
                            isFacultyLogin={isFacultyLogin}
                            setIsFacultyLogin={setIsFacultyLogin}
                            isLogin={isLogin}
                            setIsLogin={setIsLogin}
                            handleAuth={handleAuth}
                            authData={authData}
                            setAuthData={setAuthData}
                            handleGoogleLoginSuccess={handleGoogleLoginSuccess}
                            SERVER_URL={SERVER_URL}
                            runConnectionCheck={runConnectionCheck}
                        />
                    </motion.div>
                ) : userRole === 'student' && showStudentAssignments ? (
                    <motion.div
                        key="assignments"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.4 }}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <StudentAssignmentView
                            token={token}
                            serverUrl={SERVER_URL}
                            userId={userId}
                            onBack={() => setShowStudentAssignments(false)}
                            activeSessionId={activeSessionId}
                            onEnterLab={async () => {
                                if (window.__KEVRYN_DESKTOP__ && window.electronAPI && activeSession?.courseId) {
                                    const courseId = activeSession.courseId;
                                    let selectedPath = localStorage.getItem(`lab_path_${courseId}`);
                                    
                                    if (!selectedPath) {
                                        alert(`Please select a local folder for this Lab Environment (${activeSession.courseName || 'Lab'}). Files created here will be synced automatically.`);
                                        const result = await window.electronAPI.selectWorkspace();
                                        if (result.success && result.path) {
                                            selectedPath = result.path;
                                            localStorage.setItem(`lab_path_${courseId}`, selectedPath);
                                        } else {
                                            return; // Cancel entering lab if they didn't choose a folder
                                        }
                                    }
                                    
                                    // Open the specific lab workspace via IPC
                                    await window.electronAPI.openWorkspace(selectedPath);
                                    // App.js 'workspace-opened' event listener will auto-update localWorkspacePath
                                }

                                setIsLabOpen(true);
                                if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                                    document.documentElement.requestFullscreen().catch(e => console.warn("Fullscreen request denied:", e));
                                }
                            }}
                            activeAptitudeSession={activeAptitudeSession}
                            onEnterAptitude={() => setIsAptitudeOpen(true)}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="ide"
                        initial={{ opacity: 0, scale: 1.02 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <CloneModal isOpen={isCloneModalOpen} onClose={() => setIsCloneModalOpen(false)} onCloneSuccess={() => { showDialog({ type: 'alert', title: 'Cloned!', message: 'Repository cloned. Refreshing file tree...' }); fetchFiles(); }} token={token} />
                        <SwitchRepoModal isOpen={isSwitchRepoModalOpen} onClose={() => setIsSwitchRepoModalOpen(false)} onSwitch={(repoName) => { showDialog({ type: 'alert', title: 'Switched', message: `Now working on: ${repoName}` }); }} token={token} />

                        <div className="ide-container" style={{ position: 'relative', zIndex: 10 }}>
                            <div className="menubar">
                                <div className="beast-logo-wrap" onClick={() => setActiveMenu(null)} style={{ padding: '0 10px 0 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <img src="./logo.png?v=4" alt="KevRyn Logo" style={{ height: '22px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(6, 182, 212, 0.6))' }} />
                                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#ffffff', letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', gap: '3px' }}>KevRyn <span style={{ color: '#06b6d4' }}>IDE</span></span>
                                </div>

                                {/* File Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'file' ? null : 'file'); }}>
                                    File
                                    {activeMenu === 'file' && (
                                        <div className="dropdown-menu">
                                            <div className="dropdown-option" onClick={() => createNode('file')}>New File</div>
                                            <div className="dropdown-option" onClick={() => createNode('folder')}>New Folder</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={async () => {
                                                if (window.__KEVRYN_DESKTOP__ && window.electronAPI) {
                                                    const folderPath = await window.electronAPI.selectFolder();
                                                    if (folderPath) {
                                                        await window.electronAPI.saveWorkspacePath(folderPath);
                                                        setLocalWorkspacePath(folderPath);
                                                    }
                                                } else {
                                                    folderInputRef.current.click();
                                                }
                                            }}>Open Folder...</div>
                                            <div className="dropdown-option" onClick={() => {
                                                // File input is fine to leave as web-based for now, or we can use native if needed, but the issue was with large folders.
                                                fileInputRef.current.click();
                                            }}>Open File...</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={() => setIsCloneModalOpen(true)}>Clone Repository...</div>
                                            <div className="dropdown-option" onClick={() => setIsSwitchRepoModalOpen(true)}>Switch Repository...</div>
                                            <div className="dropdown-separator"></div>
                                            <div className="dropdown-option" onClick={handleSave}>Save <span className="shortcut">Ctrl+S</span></div>
                                            <div className="dropdown-option" onClick={handleSaveAs}>Save As...</div>
                                            <div className="dropdown-separator"></div>
                                            {typeof window !== 'undefined' && window.electronAPI && (
                                                <div className="dropdown-option" onClick={async () => {
                                                    if (window.electronAPI) {
                                                        const folderPath = await window.electronAPI.selectFolder();
                                                        if (folderPath) {
                                                            await window.electronAPI.saveWorkspacePath(folderPath);
                                                            setLocalWorkspacePath(folderPath);
                                                            setActiveFileId(null);
                                                            setFileName("");
                                                            setCode("// Select a file to start coding...");
                                                            fetchFiles(true);
                                                        }
                                                    }
                                                }}>
                                                    <FaFolderOpen size={13} style={{ marginRight: 6 }} /> Open Local Folder
                                                </div>
                                            )}
                                            {typeof window !== 'undefined' && window.electronAPI && localWorkspacePath && (
                                                <div className="dropdown-option" onClick={async () => {
                                                    if (!window.confirm("This will download all your Cloud Workspace files into your local directory. Continue?")) return;
                                                    try {
                                                        setIsAppLoading(true);
                                                        // Fetch from cloud API
                                                        const res = await api.get('/files');
                                                        const cloudFiles = res.data.files || [];
                                                        
                                                        // Helper to recursively write files
                                                        const writeNodes = async (nodes, currentPath) => {
                                                            for (const node of nodes) {
                                                                const targetPath = `${currentPath}/${node.name}`;
                                                                if (node.type === 'folder') {
                                                                    await window.electronAPI.createLocalItem(targetPath, 'folder');
                                                                    const children = cloudFiles.filter(f => f.parentId === node._id);
                                                                    await writeNodes(children, targetPath);
                                                                } else {
                                                                    await window.electronAPI.createLocalItem(targetPath, 'file');
                                                                    if (node.content) {
                                                                        await window.electronAPI.writeLocalFile(targetPath, node.content);
                                                                    }
                                                                }
                                                            }
                                                        };
                                                        
                                                        const roots = cloudFiles.filter(f => f.parentId === 'root');
                                                        await writeNodes(roots, localWorkspacePath);
                                                        
                                                        alert("Sync Complete!");
                                                        fetchFiles(true);
                                                    } catch (err) {
                                                        alert("Sync failed: " + err.message);
                                                    } finally {
                                                        setIsAppLoading(false);
                                                    }
                                                }}>
                                                    <FaCloudDownloadAlt size={13} style={{ marginRight: 6 }} /> Sync Cloud to Local
                                                </div>
                                            )}
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
                                            <div className={`dropdown-option ${dirtyFiles[activeFileId] ? 'disabled-option' : ''}`} onClick={() => {
                                                if (dirtyFiles[activeFileId]) return alert("Please save your file before running! (Educational Lock)");
                                                runCode();
                                            }}>
                                                <FaPlay size={10} style={{ opacity: dirtyFiles[activeFileId] ? 0.5 : 1 }} /> 
                                                {dirtyFiles[activeFileId] ? "Save to Run" : "Run File"}
                                            </div>
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

                                {/* Deploy Menu */}
                                <div className="menu-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === 'deploy' ? null : 'deploy'); }}>
                                    Deploy
                                    {activeMenu === 'deploy' && (
                                        <div className="dropdown-menu" style={{ width: '280px' }}>
                                            <div className="dropdown-option" onClick={() => { setDeployMode('local'); setBottomPanelTab('deployment'); setActiveMenu(null); }}>
                                                <span style={{ marginRight: '8px' }}>🟢</span> Local LAN Testing (Multi-screen)
                                            </div>
                                            <div className="dropdown-option" onClick={() => { setDeployMode('world'); setBottomPanelTab('deployment'); setActiveMenu(null); }}>
                                                <span style={{ marginRight: '8px' }}>🌐</span> Deploy to World (Static / Portfolio)
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                                <input type="file" ref={folderInputRef} style={{ display: 'none' }} webkitdirectory="" directory="" multiple onChange={handleFolderUpload} />

                                {/* ===== RIGHT SIDE ACTION BUTTONS ===== */}
                                <div className="menubar-right">
                                    {updateStatus && (
                                        <div 
                                            className="update-indicator" 
                                            onClick={() => updateStatus === 'downloaded' && window.electronAPI.installUpdate()}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px',
                                                background: updateStatus === 'downloaded' ? '#4caf50' : 'rgba(59, 130, 246, 0.2)',
                                                border: `1px solid ${updateStatus === 'downloaded' ? '#4caf50' : 'rgba(59, 130, 246, 0.4)'}`,
                                                borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', cursor: updateStatus === 'downloaded' ? 'pointer' : 'default',
                                                marginRight: '15px', color: '#fff', transition: 'all 0.3s'
                                            }}
                                        >
                                            <FaSync className={updateStatus === 'downloading' ? 'fa-spin' : ''} size={10} />
                                            {updateStatus === 'available' ? 'Update Found...' : 
                                             updateStatus === 'downloading' ? `Downloading ${Math.round(updateProgress)}%` : 
                                             'Restart to Update'}
                                        </div>
                                    )}
                                    <select
                                        value={currentTheme}
                                        onChange={(e) => setCurrentTheme(e.target.value)}
                                        className="menubar-select"
                                        title="Theme"
                                    >
                                        <option value="midnight">🌙 Midnight Deep</option><option value="light">☀️ Executive Snow</option><option value="cyberpunk">⚡ Neon Matrix</option></select>
                                    <button 
                                        onClick={async () => {
                                            if (dirtyFiles[activeFileId]) {
                                                await handleSave(); // Auto-save before running
                                            }
                                            runCode();
                                        }} 
                                        className="menubar-action-btn run-btn" 
                                        title="Run Code (Auto-saves)"
                                    >
                                        {fileName.endsWith('.html') ? <><FaEye size={13} /> Preview</> : <><FaPlay size={11} /> Run</>}
                                    </button>
                                    {isLabOpen && (
                                        <LabTimer
                                            isLabOpen={isLabOpen}
                                            activeFileId={activeFileId}
                                            openFiles={openFiles}
                                            code={code}
                                            api={api}
                                            saveLabReport={saveLabReport}
                                            activeSessionCourseId={activeSession?.courseId}
                                        />
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
                                <div className="sidebar" style={{ flexShrink: 0, display: isSidebarCollapsed ? 'none' : 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
                                        <div onClick={() => setSidebarTab('files')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'files' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'files' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'files' ? '1px solid var(--accent-primary)' : 'none' }}><FaFolder title="Files" /></div>
                                        <div onClick={() => setSidebarTab('chat')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'chat' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'chat' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'chat' ? '1px solid var(--accent-primary)' : 'none' }}><FaComments title="Team Chat" /></div>
                                        <div onClick={() => setSidebarTab('git')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'git' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'git' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'git' ? '1px solid var(--accent-primary)' : 'none' }}><FaCodeBranch title="Source Control" /></div>
                                        <div onClick={() => setSidebarTab('timeline')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'timeline' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'timeline' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'timeline' ? '1px solid var(--accent-primary)' : 'none' }}><FaHistory title="Timeline" /></div>
                                        <div onClick={() => setSidebarTab('snippets')} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', background: sidebarTab === 'snippets' ? 'var(--bg-tertiary)' : 'transparent', color: sidebarTab === 'snippets' ? 'var(--text-primary)' : 'var(--text-secondary)', borderTop: sidebarTab === 'snippets' ? '1px solid var(--accent-primary)' : 'none' }}><FaCode title="Snippets" /></div>
                                        <div onClick={() => setShowStudentAssignments(true)} className={`sidebar-icon-container ${showStudentAssignments ? 'active' : ''}`} style={{ flex: 1, padding: '8px', textAlign: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                            <FaClipboardList title="My Learning (Assignments & Courses)" />
                                        </div>
                                        
                                        <button className="icon-btn" title="New Template" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '0 10px', cursor: 'pointer' }}><FaMagic size={11} /></button>
                                    </div>
                                    {/* Sidebar Tab Content Area (Ensure it takes space to push logout down) */}
                                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                        {sidebarTab === 'files' && (
                                            <>
                                                {activeWorkspaceFolderId && (
                                                    <div 
                                                        style={{ padding: '8px 12px', cursor: 'pointer', background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}
                                                        onClick={() => setActiveWorkspaceFolderId(null)}
                                                        title="Return to full workspace view"
                                                    >
                                                        <FaFolderOpen /> ← Back to All Files
                                                    </div>
                                                )}
                                                <FileTree data={fileData} activeId={activeFileId} onFileClick={handleFileClick} onCreate={(parentId) => createNode('file', parentId)} onCreateFolder={createFolder} onDelete={handleDelete} onRename={handleRename} onDownload={handleDownload} onCopyPath={handleCopyPath} onSetWorkspace={setActiveWorkspaceFolderId} />
                                            </>
                                        )}
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
                                        {sidebarTab === 'chat' && (
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                                                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {chatMessages.map((msg, i) => (
                                                        <div key={i} style={{ alignSelf: msg.sender === username ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px', textAlign: msg.sender === username ? 'right' : 'left', display: 'flex', justifyContent: msg.sender === username ? 'flex-end' : 'flex-start', alignItems: 'center', gap: '4px' }}>
                                                                {msg.visibility === 'private' && <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '2px 4px', borderRadius: '4px', fontSize: '8px', fontWeight: 'bold' }}>PRIVATE</span>}
                                                                {msg.sender}
                                                            </div>
                                                            <div style={{ padding: '8px', borderRadius: '6px', background: msg.sender === username ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: 'white', fontSize: '12px', wordWrap: 'break-word', border: msg.visibility === 'private' ? '1px solid #eab308' : 'none' }}>
                                                                {msg.text}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div ref={chatEndRef} />
                                                </div>
                                                <form onSubmit={sendChatMessage} style={{ padding: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '5px', background: 'var(--bg-secondary)' }}>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <select 
                                                            value={chatVisibility} 
                                                            onChange={e => setChatVisibility(e.target.value)}
                                                            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px', fontSize: '11px', outline: 'none', cursor: 'pointer' }}
                                                        >
                                                            <option value="public">Public</option>
                                                            <option value="private">Private (Project Only)</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }} />
                                                        <button type="submit" style={{ background: 'var(--accent-primary)', border: 'none', borderRadius: '4px', color: 'white', padding: '0 10px', cursor: 'pointer' }}><FaPaperPlane size={12} /></button>
                                                    </div>
                                                </form>
                                            </div>
                                        )}
                                    </div>

                                    {/* Sidebar Bottom Row (User Info & Logout) */}
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '10px', textAlign: 'center', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,0,0,0.1)' }}>
                                        {/* College Join Button for unassigned students */}
                                        {userRole === 'student' && !collegeId && (
                                            <button 
                                                onClick={() => {
                                                    const code = prompt("Enter your College Code to link your account permanently:");
                                                    if (code) handleJoinCollege(code);
                                                }}
                                                style={{ width: '100%', background: 'rgba(124, 58, 237, 0.15)', border: '1px solid rgba(124, 58, 237, 0.3)', color: '#c4b5fd', padding: '6px 0', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', fontWeight: '600', transition: 'all 0.2s' }}
                                                title="Link your account to your college"
                                            >
                                                <FaChalkboardTeacher /> Join College
                                            </button>
                                        )}
                                        {/* Display College Badge if enrolled */}
                                        {collegeName && (
                                            <div style={{ width: '100%', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '4px 0', borderRadius: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} title={`Permanently linked to ${collegeName}`}>
                                                <FaChalkboardTeacher size={10} /> {collegeName.substring(0, 15)}{collegeName.length > 15 ? '...' : ''}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {userPicture ? (
                                                    <img src={userPicture} alt="Profile" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                                                ) : (
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                                                        {username?.charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                )}
                                                <span style={{ fontWeight: '600', color: '#fff' }}>{username}</span>
                                            </div>
                                            <button onClick={handleLogout} className="btn-icon" style={{ border: 'none', cursor: 'pointer', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }} title="Logout"><FaSignOutAlt color="#ef4444" size={16} /></button>
                                        </div>
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
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: activeFileId === f._id ? '10px' : '0' }}>{f.name}{dirtyFiles[f._id] ? <span style={{color: 'var(--accent-primary)'}}> *</span> : ''}</span>
                                                        <span onClick={(e) => closeTab(e, f._id)} style={{ borderRadius: '50%', padding: '2px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', marginLeft: 'auto' }}>✕</span>
                                                    </div>
                                                ))}
                                                {openFiles.length === 0 && <div style={{ padding: '8px 15px', color: 'var(--text-secondary)', fontSize: '13px' }}>No active files</div>}
                                            </div>
                                            <Breadcrumbs fileName={fileName} />
                                        </div>

                                         <Editor
                                             key={activeFileId}
                                             height="100%"
                                             theme={getMonacoTheme()}
                                             path={activeFileId}
                                             defaultLanguage={getLanguage(fileName)}
                                             language={getLanguage(fileName)}
                                             value={code}
                                             beforeMount={handleEditorWillMount}
                                             options={{
                                                 fontSize: 14,
                                                 fontFamily: 'JetBrains Mono, monospace',
                                                 minimap: { enabled: true },
                                                 automaticLayout: true,
                                                 scrollBeyondLastLine: false,
                                                 padding: { top: 10, bottom: 10 },
                                                 formatOnPaste: true,
                                                 formatOnType: true,
                                                 suggestSelection: 'first',
                                                 wordBasedSuggestions: 'currentDocument', // Forces basic autocomplete
                                                 suggestOnTriggerCharacters: true,
                                                 quickSuggestions: { other: true, comments: false, strings: true },
                                                 renderValidationDecorations: 'on',
                                                 hover: { enabled: true, delay: 200 },
                                                 lightbulb: { enabled: true },
                                                 wordWrap: 'on',
                                                 readOnly: activeFileId === null
                                             }}
                                             onMount={(editor, monaco) => {
                                                 editorRef.current = editor;
                                                 editor.onDidChangeModelContent(() => {
                                                     codeRef.current = editor.getValue();
                                                     if (activeFileIdRef.current) {
                                                         setDirtyFiles(prev => ({ ...prev, [activeFileIdRef.current]: true }));
                                                     }
                                                 });
                                                 
                                                 // Instant switch model logic
                                                 editor.onDidChangeModel(() => {
                                                        const model = editor.getModel();
                                                        if (model) {
                                                            // Match language to path manually if needed
                                                            const lang = getLanguage(fileName);
                                                            monaco.editor.setModelLanguage(model, lang);
                                                        }
                                                    });

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
                                                    setIsAppLoading(false);
                                                }}
                                                onChange={(v) => {
                                                    if (!isRemoteUpdate.current && activeFileId) {
                                                        // Debounce the heavy state updates
                                                        if (window.codeUpdateTimer) clearTimeout(window.codeUpdateTimer);
                                                        window.codeUpdateTimer = setTimeout(() => {
                                                            setCode(v);
                                                            setOpenFiles(prev => prev.map(f => f._id === activeFileId ? { ...f, content: v } : f));
                                                        }, 500);

                                                        // Debounce Socket Sync
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
                                                                safeEmit('save-file-disk', { fileName: fileName, code: v, userId, fileId: activeFileId });
                                                            } catch (err) {
                                                                console.error('[AUTO-SAVE] Failed:', err);
                                                            }
                                                        }, 2000);
                                                    }
                                                    isRemoteUpdate.current = false;
                                                }}
                                            />
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
                                                            {tab.id === 'ports' && activePorts.length > 0 && (
                                                                <span style={{ marginLeft: '6px', background: 'var(--accent-primary)', color: 'white', borderRadius: '10px', padding: '0 6px', fontSize: '10px' }}>
                                                                    {activePorts.length}
                                                                </span>
                                                            )}
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
                                                                return ( <div key={t.id} style={{ width: '100%', height: '100%', display: activeTermId === t.id ? 'block' : 'none' }}>
                                                                        <Terminal
                                                                            key={t.id}
                                                                            socket={socketRef.current}
                                                                            termId={t.id}
                                                                            userId={userId}
                                                                            onError={(err) => setTerminalError(err)}
                                                                            webcontainer={t.type === 'server' ? null : webcontainerInstance}
                                                                            localWorkspacePath={localWorkspacePath}
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
                                                                            <FaMagic /> Fix with KevRyn AI
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
                                                {bottomPanelTab === 'ports' && (
                                                    <div style={{ padding: '15px', color: 'var(--text-primary)' }}>
                                                        {activePorts.length === 0 ? (
                                                            <div className="panel-placeholder">
                                                                <FaNetworkWired size={20} style={{ opacity: 0.3, marginBottom: '8px' }} />
                                                                <div>No active ports detected. Run a server (e.g. `npm run dev`) to see results here.</div>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px' }}>Detected WebContainer Services:</div>
                                                                {activePorts.map((p, i) => (
                                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                                            <div style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>Port {p.port}</div>
                                                                            <div style={{ fontSize: '11px', opacity: 0.7 }}>{p.url}</div>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => window.open(p.url, '_blank')}
                                                                            style={{ background: 'var(--accent-primary)', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                                                                        >
                                                                            Open Preview
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {bottomPanelTab === 'deployment' && (
                                                    <div style={{ height: '100%', overflow: 'hidden' }}>
                                                        <DeploymentPanel token={token} activeMode={deployMode} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div> {/* End center-workspace */}

                                {/* --- RIGHT SIDEBAR (AI) --- */}
                                <div style={{ display: 'flex', height: '100%', minHeight: 0, minWidth: 0 }}>
                                    <AnimatePresence>
                                        {isAiPanelOpen && (
                                            <motion.div
                                                initial={{ width: 0, opacity: 0 }}
                                                animate={{ width: aiPanelWidth, opacity: 1 }}
                                                exit={{ width: 0, opacity: 0 }}
                                                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                                                style={{ display: 'flex', overflow: 'hidden', height: '100%', minHeight: 0, minWidth: 0, flexShrink: 0, borderRight: '1px solid var(--border-color)' }}
                                            >
                                                <div className="resize-handle" onMouseDown={startResizingAi} style={{ width: '4px', cursor: 'col-resize', background: 'transparent', zIndex: 100 }} />
                                                <div className="right-sidebar" style={{ width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
                                                    <AIPanel
                                                        token={token}
                                                        code={code}
                                                        fileName={fileName}
                                                        language={getLanguage(fileName)}
                                                        targetAgentId={activeAiAgent}
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
                                                            } else {
                                                                setCode(newCode);
                                                                if (editorRef.current) {
                                                                    editorRef.current.setValue(newCode);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    
                                    {/* --- RIGHT ACTIVITY BAR (AI Extension Hub) --- */}
                                    <div style={{
                                        width: '48px',
                                        background: 'var(--bg-secondary)',
                                        borderLeft: '1px solid var(--border-color)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '10px 0',
                                        gap: '12px'
                                    }}>
                                        <div 
                                            onClick={() => {
                                                setActiveAiAgent('groq-assistant');
                                                setIsAiPanelOpen(true);
                                            }} 
                                            style={{
                                                padding: '10px',
                                                cursor: 'pointer',
                                                borderRadius: '8px',
                                                background: (isAiPanelOpen && activeAiAgent === 'groq-assistant') ? 'var(--accent-primary)' : 'transparent',
                                                color: (isAiPanelOpen && activeAiAgent === 'groq-assistant') ? '#fff' : 'var(--text-secondary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}
                                            title="Groq Neural Core"
                                        >
                                            <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '15px', letterSpacing: '-1px' }}>gr</span>
                                        </div>
                                        <div 
                                            onClick={() => {
                                                setActiveAiAgent('google-gemini');
                                                setIsAiPanelOpen(true);
                                            }} 
                                            style={{
                                                padding: '10px',
                                                cursor: 'pointer',
                                                borderRadius: '8px',
                                                background: (isAiPanelOpen && activeAiAgent === 'google-gemini') ? 'var(--accent-primary)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}
                                            title="Google Gemini"
                                        >
                                            <img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" alt="Gemini" style={{ width: '18px', height: '18px', filter: (isAiPanelOpen && activeAiAgent === 'google-gemini') ? 'brightness(0) invert(1)' : 'none' }} />
                                        </div>

                                    </div>
                                </div>
                            </div> {/* End main-content-horizontal */}

                            {/* --- BOTTOM STATUS BAR (Beast Mode) --- */}
                            <div className="beast-statusbar">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className="beast-status-dot"></div>
                                        <span style={{ fontWeight: '700', color: '#fff', letterSpacing: '0.5px' }}>{username}</span>
                                    </div>
                                    <span style={{ opacity: 0.3 }}>|</span>
                                    <span style={{ fontSize: '10px', opacity: 0.8 }}>Personal Workspace</span>
                                    <span style={{ opacity: 0.3 }}>|</span>
                                    <span style={{ fontSize: '10px', opacity: 0.6 }}>Server: {SERVER_URL.replace('https://', '')}</span>
                                    <span style={{ opacity: 0.3 }}>|</span>
                                    {/* Language Runtime Status */}
                                    <span title="All languages execute via server terminal" style={{ fontSize: '10px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'default' }}>
                                        ✅ Server Ready
                                    </span>
                                    {activeSessionId && (
                                        <>
                                            <span style={{ opacity: 0.3 }}>|</span>
                                            <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>Active Lab Detected</span>
                                        </>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <span>Ln {editorRef.current?.getPosition()?.lineNumber || 1}, Col {editorRef.current?.getPosition()?.column || 1}</span>
                                        <span>UTF-8</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* --- GLOBAL RESIZE OVERLAY --- */}
                        {(isResizingAi || isResizingPanel) && (
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, cursor: isResizingPanel ? 'row-resize' : 'col-resize', background: 'transparent' }} />
                        )}

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

                        {/* --- FULL SCREEN APTITUDE TEST --- */}
                        <AnimatePresence>
                            {isAptitudeOpen && activeAptitudeSession && (
                                <LiveAptitudeTest
                                    token={token}
                                    serverUrl={SERVER_URL}
                                    session={activeAptitudeSession}
                                    onCompleted={() => {
                                        setIsAptitudeOpen(false);
                                        setActiveAptitudeSession(null); // Clear session after completion
                                    }}
                                />
                            )}
                            {isAgentHubOpen && (
                                <AgentHubModal 
                                    isOpen={isAgentHubOpen} 
                                    onClose={() => setIsAgentHubOpen(false)} 
                                />
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
            </div>
        </div>
        </>
    );
}

export default App;











