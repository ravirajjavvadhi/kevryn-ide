import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import {
    FaUserPlus, FaSignInAlt, FaChalkboardTeacher, FaDesktop, FaCode, FaCheckCircle,
    FaExclamationTriangle, FaTimes, FaFile, FaSync, FaHistory, FaGraduationCap, FaChartLine, FaFilePdf
} from 'react-icons/fa';

const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_URL = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const GlobalSessionTimer = ({ startTime, duration }) => {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        if (!startTime) return;
        const tick = () => {
            const start = new Date(startTime).getTime();
            const now = Date.now();
            const elapsed = Math.floor((now - start) / 1000);
            const total = (duration || 60) * 60;
            const remaining = total - elapsed;

            if (remaining <= 0) {
                setTimeLeft("SESSION ENDED");
                return;
            }

            const h = Math.floor(remaining / 3600);
            const m = Math.floor((remaining % 3600) / 60);
            const s = remaining % 60;
            setTimeLeft(`${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        };

        const timer = setInterval(tick, 1000);
        tick();
        return () => clearInterval(timer);
    }, [startTime, duration]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)' }}>
            <FaHistory size={12} color="#818cf8" />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#818cf8', fontFamily: 'monospace' }}>{timeLeft || "--:--"}</span>
        </div>
    );
};


const MonitorDashboard = ({ token, serverUrl, userId, onLogout, isEmbedded, onSessionChange }) => { // Added isEmbedded <!-- id: 402 -->
    // Session State
    const [sessionId, setSessionId] = useState(null);
    const [sessionName, setSessionName] = useState("");
    const [subject, setSubject] = useState("");
    const [semester, setSemester] = useState("");
    const [selectedCourseId, setSelectedCourseId] = useState(""); // NEW: Phase 18
    const [selectedBatchId, setSelectedBatchId] = useState(""); // NEW: Batch Integration
    const [duration, setDuration] = useState(60); // NEW: Duration in minutes
    const [sessionStartTime, setSessionStartTime] = useState(null); // NEW: Global start
    const [sessionDuration, setSessionDuration] = useState(60); // NEW: Active session duration
    const [isCreatingSession, setIsCreatingSession] = useState(false);



    // Monitoring State
    const [students, setStudents] = useState({});  // { username: { status, code, activeFile, ... } }
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [activeTab, setActiveTab] = useState('live'); // 'live' | 'portfolio'

    // Data State
    const [studentFiles, setStudentFiles] = useState([]);
    const [studentPortfolio, setStudentPortfolio] = useState(null);
    const [selectedFileContent, setSelectedFileContent] = useState(null);
    const [newStudentId, setNewStudentId] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [courses, setCourses] = useState([]);
    const [studentReport, setStudentReport] = useState(null);

    // NEW: Beast Monitoring States
    const [announcementText, setAnnouncementText] = useState("");
    const [alerts, setAlerts] = useState([]); // Array of { username, type, message, timestamp }
    const [raisedHands, setRaisedHands] = useState([]); // Array of usernames
    const [showTimeline, setShowTimeline] = useState(false);
    const [sessionTimeline, setSessionTimeline] = useState([]); // For the current session

    const socketRef = useRef(null);
    const api = useMemo(() => axios.create({
        baseURL: serverUrl || SERVER_URL,
        headers: { Authorization: token }
    }), [serverUrl, token]);

    // --- SESSION MANAGEMENT ---
    useEffect(() => {
        const restoreSession = async () => {
            try {
                // Check server for active session (Source of Truth)
                const res = await api.get('/lab/active-session');
                if (res.data?.session) {
                    const s = res.data.session;
                    setSessionId(s._id);
                    setSessionName(s.sessionName);
                    setSubject(s.subject);
                    setSemester(s.semester);
                    setSessionStartTime(s.startTime); // NEW
                    setSessionDuration(s.duration || 60); // NEW
                    setIsCreatingSession(false);

                    // Initial student load happens via socket 'lab-initial-state'
                } else {
                    // Fallback to localStorage if no active session on server (maybe closed properly)
                    // Actually, if server says no active session, we should clear local state
                    setSessionId(null);
                    localStorage.removeItem('lastSessionId');
                }
            } catch (e) {
                console.error("Failed to restore session", e);
            }
        };

        const fetchCourses = async () => {
            try {
                const res = await api.get('/api/courses');
                setCourses(res.data);
            } catch (e) { console.error("Failed to fetch courses", e); }
        };

        if (token) {
            restoreSession();
            fetchCourses();
        }
    }, [token]);

    const handleCreateSession = async () => {
        if (!sessionName.trim()) return alert("Session Name is required");
        try {
            const res = await api.post('/lab/create-session', {
                facultyId: userId || "unknown",
                sessionName,
                subject: subject || "General",
                semester: semester || "Sem 1",
                courseId: selectedCourseId, // NEW: Link to persistent roster
                batchId: selectedBatchId, // NEW: Link to specific batch
                duration: parseInt(duration) || 60 // NEW: Duration
            });

            if (res.data?.session) {
                setSessionId(res.data.session._id);
                setSessionStartTime(res.data.session.startTime); // NEW
                setSessionDuration(res.data.session.duration || 60); // NEW
                localStorage.setItem('lastSessionId', res.data.session._id);

                setIsCreatingSession(false);
                if (onSessionChange) onSessionChange();
            }
        } catch (e) {
            alert("Failed to create session: " + e.message);
        }
    };

    // --- SOCKET CONNECTION ---
    useEffect(() => {
        if (!sessionId) return;
        const socket = io(serverUrl || SERVER_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('faculty-join', { sessionId });
        });

        socket.on('disconnect', () => setIsConnected(false));

        // Immediate sync upon join
        socket.on('lab-initial-state', ({ activeStudents, allowedStudents }) => {
            console.log("Received initial lab state:", activeStudents.length, "active,", allowedStudents?.length, "allowed");
            setStudents(prev => {
                const next = { ...prev };

                // 1. Mark all allowed students as offline initially
                if (allowedStudents) {
                    allowedStudents.forEach(uname => {
                        next[uname] = { status: 'offline', activeFile: null, code: '', lastActive: '-' };
                    });
                }

                // 2. Overlay active students
                activeStudents.forEach(s => {
                    next[s.username] = {
                        ...(next[s.username] || {}),
                        ...s
                    };
                });
                return next;
            });
        });

        socket.on('student-data-update', (data) => {
            setStudents(prev => ({
                ...prev,
                [data.username]: {
                    ...(prev[data.username] || {}),
                    status: data.status, // Honor explicit status (active or offline)
                    lastActive: data.lastActive || new Date().toLocaleTimeString(),
                    code: data.code !== undefined ? data.code : (prev[data.username]?.code || ''),
                    activeFile: data.activeFile || prev[data.username]?.activeFile || null,
                    // BEAST FIELDS
                    tabSwitchCount: data.tabSwitchCount !== undefined ? data.tabSwitchCount : (prev[data.username]?.tabSwitchCount || 0),
                    pasteCount: data.pasteCount !== undefined ? data.pasteCount : (prev[data.username]?.pasteCount || 0),
                    attentionScore: data.attentionScore !== undefined ? data.attentionScore : (prev[data.username]?.attentionScore || 100)
                }
            }));

            // Auto-flag alerts
            if (data.tabSwitchCount > 5 || data.attentionScore < 40) {
                setAlerts(prev => {
                    const exists = prev.find(a => a.username === data.username && a.type === 'behavior');
                    if (exists) return prev;
                    return [{
                        username: data.username,
                        type: 'behavior',
                        message: data.tabSwitchCount > 5 ? 'Extreme tab switching' : 'Low attention score',
                        timestamp: new Date().toLocaleTimeString()
                    }, ...prev].slice(0, 10);
                });
            }
        });

        socket.on('student-raise-hand', ({ username }) => {
            setRaisedHands(prev => [...new Set([username, ...prev])]);
            setAlerts(prev => [{
                username,
                type: 'help',
                message: 'Raised hand',
                timestamp: new Date().toLocaleTimeString()
            }, ...prev]);
        });

        socket.on('faculty-acknowledge', ({ username }) => {
            setRaisedHands(prev => prev.filter(u => u !== username));
        });

        return () => socket.disconnect();
    }, [sessionId, serverUrl]);

    // --- DATA FETCHING ---
    const fetchStudentFiles = useCallback(async (username) => {
        try {
            const res = await api.get(`/lab/student-files/${username}`);
            setStudentFiles(res.data || []);
        } catch (e) { setStudentFiles([]); }
    }, [api]);

    const fetchPortfolio = useCallback(async (username) => {
        try {
            const res = await api.get(`/lab/student-portfolio/${username}`);
            setStudentPortfolio(res.data);
        } catch (e) { setStudentPortfolio(null); }
    }, [api]);

    const fetchStudentReport = useCallback(async (username) => {
        if (!selectedStudent || !subject) return;
        try {
            // Fetch report based on student ID (we need ID, but using username lookup for now if ID not available in 'students' map)
            // Actually, we have student ID in 'students' map? No.
            // Let's rely on server lookup by username or passed ID.
            // The backend route is /report/:studentId/:courseName
            // I need to fetch the User ID for the username first, or update backend to accept username.
            // Updating backend is safer? No, let's assume we have it or fetch it.
            // HACK: For now, I'll assume the backend can find by username if I pass it, or I need to fetch user details.
            // Let's use the 'students' map if I had IDs. I don't.
            // Let's modify the route in a separate step if needed.
            // Wait, the backend route expects `studentId`.
            // I will search via `api.get('/users?username=...')`? No.
            // Let's just use the `fetchStudentFiles` which returns files.
            // Reports are different: they have TIME.
            // Let's try to lookup user ID from the portfolio?
            // Actually, let's just make the backend endpoint accept username for convenience or lookup.
            // OR: Fetch report by `subject` and filter client side?
            // `GET /lab/reports/:courseName` returns ALL reports. Efficient enough for class size.
            // NEW: Resolve Course ID from Subject Name
            // Because backend now expects /lab/reports/:courseId
            const course = courses.find(c => c.name === subject);
            const courseId = course ? course._id : null;

            if (!courseId) {
                console.warn(`Course ID not found for subject: ${subject}`);
                return;
            }

            const res = await api.get(`/lab/reports/${courseId}`); // fetch all for subject
            const myReport = res.data.find(r => r.studentId?.username === username);
            setStudentReport(myReport);
        } catch (e) { setStudentReport(null); }
    }, [api, subject, courses]);

    const handleViewFile = (file) => {
        setSelectedFileContent(file);
    };

    const handleSelectStudent = (username) => {
        setSelectedStudent(username);
        setSelectedFileContent(null);
        setActiveTab('live');
        fetchStudentFiles(username);
        fetchPortfolio(username); // Prefetch portfolio
        // fetchStudentReport(username); // Will be called when tab is active
    };

    useEffect(() => {
        if (activeTab === 'reports' && selectedStudent) {
            fetchStudentReport(selectedStudent);
        }
    }, [activeTab, selectedStudent, fetchStudentReport]);

    const downloadReport = async () => {
        let reportData = studentReport;

        if (!reportData) {
            try {
                // Try fetching current session report first
                const course = courses.find(c => c.name === subject);
                const courseId = course?._id || selectedCourseId;
                if (!courseId) return alert("Course context missing for report");

                const res = await api.get(`/lab/reports/${courseId}`);
                reportData = res.data.find(r => r.studentId?.username === selectedStudent);
            } catch (e) {
                console.error("Download fetch failed", e);
            }
        }

        if (!reportData) return alert("No report data available for this student yet.");

        const studentName = selectedStudent;
        const reportText = `VAYU LAB PERFORMANCE REPORT\n` +
            `====================================\n` +
            `STUDENT: ${studentName}\n` +
            `COURSE: ${subject}\n` +
            `TOTAL TIME: ${(reportData.totalTimeSpent / 60).toFixed(1)} min\n` +
            `====================================\n\n` +
            reportData.files.map(f => (
                `--- FILE: ${f.fileName} ---\n` +
                `TIME SPENT: ${(f.timeSpent / 60).toFixed(1)} min\n` +
                `STATUS: ${f.status || 'in-progress'}\n\n` +
                `${f.code}\n\n`
            )).join("\n");

        const element = document.createElement("a");
        const file = new Blob([reportText], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${studentName}_Lab_Report.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleBroadcast = () => {
        if (!announcementText.trim() || !socketRef.current) return;
        socketRef.current.emit('faculty-announcement', { sessionId, message: announcementText });
        setAnnouncementText("");
        alert("Announcement broadcasted.");
    };

    const handleAcknowledge = (uname) => {
        if (!socketRef.current) return;
        socketRef.current.emit('faculty-acknowledge', { sessionId, username: uname });
        setRaisedHands(prev => prev.filter(u => u !== uname));
    };

    const fetchSessionEvents = async () => {
        if (!sessionId || !selectedStudent) return;
        try {
            const res = await api.get(`/lab/session-activity-log/${sessionId}`);
            const studentEvents = res.data.filter(log => log.username === selectedStudent);
            setSessionTimeline(studentEvents.reverse()); // Latest first
        } catch (e) { console.error("Timeline fetch failed", e); }
    };

    const handleAddStudent = async () => {
        if (!newStudentId || !sessionId) return;
        try {
            await api.post('/lab/add-student', { sessionId, username: newStudentId });
            setStudents(prev => ({
                ...prev,
                [newStudentId]: { status: 'offline', activeFile: null }
            }));
            setNewStudentId("");
        } catch (e) { alert("Failed: " + e.message); }
    };

    const handleEndSession = async () => {
        if (!window.confirm("Are you sure you want to end this lab session? Statistics will be saved.")) return;
        try {
            await api.post('/lab/end-session');
            setSessionId(null);
            setStudents({});
            setIsCreatingSession(true); // Go back to start screen
            localStorage.removeItem('lastSessionId');
            if (onSessionChange) onSessionChange();
        } catch (e) {
            alert("Failed to end session: " + e.message);
        }
    };

    // --- RENDER HELPERS ---
    const statusColor = (s) => ({ active: '#4ade80', idle: '#fbbf24', distracted: '#f87171', offline: '#64748b' }[s] || '#64748b');

    // --- RENDER: CREATE SESSION ---
    if (!sessionId || isCreatingSession) {
        return (
            <div style={{ width: '100vw', height: '100vh', background: '#0f172a', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter' }}>
                <div style={{ width: '400px', padding: '30px', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155' }}>
                    <h2 style={{ color: '#fff', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaChalkboardTeacher /> Start New Lab Session
                    </h2>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '5px' }}>Session Name</label>
                        <input type="text" placeholder="e.g. Intro to Python - Lab 1" value={sessionName} onChange={e => setSessionName(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }} />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '5px' }}>Course (Subject & Semester)</label>
                        <select
                            value={selectedCourseId}
                            onChange={e => {
                                const cId = e.target.value;
                                setSelectedCourseId(cId);
                                const c = courses.find(c => c._id === cId);
                                if (c) {
                                    setSubject(c.name);
                                    setSemester(c.semester);
                                    setSessionName(`${c.name} - Lab Session`); // Auto-fill name
                                }
                            }}
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}
                        >
                            <option value="">-- Select a Course --</option>
                            {courses.map(c => (
                                <option key={c._id} value={c._id}>{c.name} ({c.code}) - {c.semester}</option>
                            ))}
                        </select>
                    </div>

                    {selectedCourseId && (
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '5px' }}>Select Batch (Optional)</label>
                            <select
                                value={selectedBatchId}
                                onChange={e => setSelectedBatchId(e.target.value)}
                                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }}
                            >
                                <option value="">-- All Enrolled Students --</option>
                                {courses.find(c => c._id === selectedCourseId)?.batches?.map(b => (
                                    <option key={b._id} value={b._id}>{b.name} ({b.students?.length || 0} students)</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '5px' }}>Subject</label>
                            <input type="text" placeholder="e.g. Python" value={subject} onChange={e => setSubject(e.target.value)}
                                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '5px' }}>Semester</label>
                            <input type="text" placeholder="e.g. Sem 3" value={semester} onChange={e => setSemester(e.target.value)}
                                style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }} />
                        </div>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '5px' }}>Duration (minutes)</label>
                        <input type="number" placeholder="60" value={duration} onChange={e => setDuration(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' }} />
                    </div>


                    <button onClick={handleCreateSession} style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        🚀 Launch Lab Session
                    </button>
                    {sessionId && (
                        <button onClick={() => setIsCreatingSession(false)} style={{ width: '100%', marginTop: '10px', padding: '12px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
            {/* TOP BAR */}
            <div style={{ height: '54px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ padding: '8px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', borderRadius: '8px', boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)' }}>
                        <FaChalkboardTeacher color="#fff" size={16} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.5px' }}>{sessionName || 'Vayu Lab Monitor'}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#94a3b8' }}>
                            <span style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', color: '#e2e8f0' }}>{subject}</span>
                            <span>•</span>
                            <span>{semester}</span>
                            <span>•</span>
                            {sessionId && <span style={{ fontFamily: 'monospace' }}>ID: {sessionId.slice(-6)}</span>}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    {sessionId && <GlobalSessionTimer startTime={sessionStartTime} duration={sessionDuration} />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {sessionId && (
                            <button onClick={handleEndSession} style={{ background: '#ef4444', border: 'none', padding: '6px 12px', borderRadius: '6px', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                                End Session
                            </button>
                        )}
                        <button onClick={() => { setIsCreatingSession(true); setSessionName(""); }} style={{ background: '#334155', border: 'none', padding: '6px 12px', borderRadius: '6px', color: '#cbd5e1', fontSize: '12px', cursor: 'pointer' }}>
                            + New Session
                        </button>
                        {!isEmbedded && (
                            <>
                                <div style={{ width: '1px', height: '20px', background: '#475569' }}></div>
                                <button onClick={onLogout} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <FaSignInAlt /> Logout
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>


            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* SIDEBAR */}
                <div style={{ width: '260px', background: '#0f172a', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>

                    {/* Announcements Control */}
                    <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', background: 'rgba(99,102,241,0.05)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#6366f1', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🚀 Broadcast
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" placeholder="Announcement..." value={announcementText} onChange={e => setAnnouncementText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleBroadcast()}
                                style={{ flex: 1, padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '11px', outline: 'none' }} />
                            <button onClick={handleBroadcast} style={{ width: '32px', background: '#6366f1', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '12px' }}>📢</button>
                        </div>
                    </div>

                    {/* Alerts/Status Panel */}
                    {alerts.length > 0 && (
                        <div style={{ padding: '16px', borderBottom: '1px solid #334155', background: 'rgba(239,68,68,0.05)' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                BEHAVIOR ALERTS
                                <span style={{ cursor: 'pointer', fontSize: '9px', color: '#94a3b8' }} onClick={() => setAlerts([])}>Dismiss All</span>
                            </div>
                            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                                {alerts.map((a, i) => (
                                    <div key={i} style={{ fontSize: '11px', color: '#fca5a5', marginBottom: '6px', padding: '6px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', borderLeft: '3px solid #ef4444', position: 'relative' }}>
                                        <div style={{ fontWeight: 'bold' }}>{a.username}</div>
                                        <div style={{ opacity: 0.8, fontSize: '10px' }}>{a.message}</div>
                                        <div style={{ fontSize: '9px', color: '#ef4444', marginTop: '2px', opacity: 0.6 }}>{a.timestamp}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Student List */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>SMART ROSTER ({Object.keys(students).length})</span>
                            <span style={{ fontSize: '10px', color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                {Object.values(students).filter(s => s.status === 'active').length} LIVE
                            </span>
                        </div>
                        {Object.entries(students).map(([username, s]) => (
                            <div key={username} onClick={() => handleSelectStudent(username)}
                                style={{
                                    padding: '12px', marginBottom: '8px', borderRadius: '12px', cursor: 'pointer',
                                    background: selectedStudent === username ? 'rgba(99,102,241,0.1)' : 'rgba(30,41,59,0.4)',
                                    border: selectedStudent === username ? '1px solid #6366f1' : '1px solid #1e293b',
                                    display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative', overflow: 'hidden'
                                }}>

                                {/* Status Ripple Background for Help */}
                                {raisedHands.includes(username) && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.1)', animation: 'pulse-soft 2s infinite' }}></div>
                                )}

                                <div style={{ position: 'relative', zIndex: 1 }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        background: selectedStudent === username ? '#6366f1' : '#334155',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '14px', fontWeight: '800', color: '#fff',
                                        boxShadow: selectedStudent === username ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                                    }}>
                                        {username[0].toUpperCase()}
                                    </div>
                                    <div style={{
                                        position: 'absolute', bottom: '-2px', right: '-2px', width: '12px', height: '12px',
                                        borderRadius: '50%', background: statusColor(s.status),
                                        border: '2px solid #0f172a',
                                        boxShadow: s.status === 'active' ? `0 0 10px ${statusColor(s.status)}` : 'none'
                                    }}></div>
                                </div>

                                <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '13px', color: selectedStudent === username ? '#fff' : '#e2e8f0', fontWeight: '700', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            {username}
                                        </div>
                                        {raisedHands.includes(username) && (
                                            <span style={{ fontSize: '12px', animation: 'bounce 0.5s infinite alternate' }}>✋</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px', fontWeight: '500' }}>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <span style={{ color: (s.tabSwitchCount > 0) ? '#f87171' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                📑 Tab Switched: {s.tabSwitchCount || 0}
                                            </span>
                                            <span style={{ color: (s.pasteCount > 5) ? '#fbbf24' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                📋 {s.pasteCount || 0}
                                            </span>
                                        </div>
                                        <span style={{ color: s.attentionScore < 60 ? '#ef4444' : '#10b981' }}>🎯 Attention: {s.attentionScore}%</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* MAIN AREA */}
                {!selectedStudent ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
                        <div style={{ textAlign: 'center', opacity: 0.5 }}>
                            <FaDesktop size={64} color="#334155" style={{ marginBottom: '20px' }} />
                            <h3 style={{ color: '#94a3b8' }}>Select a student to monitor</h3>
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
                        {/* Student Header & Tabs */}
                        <div style={{ padding: '0 20px', borderBottom: '1px solid #334155', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '54px', flexShrink: 0, overflowX: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 'fit-content' }}>
                                <h3 style={{ margin: 0, color: '#fff', fontSize: '15px' }}>{selectedStudent}</h3>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', background: `${statusColor(students[selectedStudent]?.status)}20`, color: statusColor(students[selectedStudent]?.status), border: `1px solid ${statusColor(students[selectedStudent]?.status)}40`, fontWeight: 'bold' }}>
                                        {students[selectedStudent]?.status?.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)', fontWeight: 'bold' }}>
                                        {students[selectedStudent]?.attentionScore}% FOCUS
                                    </span>
                                    {raisedHands.includes(selectedStudent) && (
                                        <button onClick={() => handleAcknowledge(selectedStudent)} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', background: '#ef4444', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                                            ✋ ACKNOWLEDGE
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
                                <button onClick={() => setActiveTab('live')} style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'live' ? '3px solid #6366f1' : '3px solid transparent', color: activeTab === 'live' ? '#6366f1' : '#64748b', transition: 'all 0.2s', padding: '0 5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                    LIVE FEED
                                </button>
                                <button onClick={() => setActiveTab('reports')} style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'reports' ? '3px solid #6366f1' : '3px solid transparent', color: activeTab === 'reports' ? '#6366f1' : '#64748b', transition: 'all 0.2s', padding: '0 5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                    PERFORMANCE
                                </button>
                                <button onClick={() => { setActiveTab('history'); fetchSessionEvents(); }} style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'history' ? '3px solid #6366f1' : '3px solid transparent', color: activeTab === 'history' ? '#6366f1' : '#64748b', transition: 'all 0.2s', padding: '0 5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                    TIMELINE
                                </button>
                                <button onClick={() => { setActiveTab('portfolio'); fetchPortfolio(selectedStudent); }} style={{ background: 'transparent', border: 'none', borderBottom: activeTab === 'portfolio' ? '3px solid #6366f1' : '3px solid transparent', color: activeTab === 'portfolio' ? '#6366f1' : '#64748b', transition: 'all 0.2s', padding: '0 5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                    ACADEMIC RECORD
                                </button>
                                <button onClick={downloadReport} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'center' }}>
                                    <FaFilePdf size={12} /> DOWNLOAD TXT
                                </button>
                            </div>
                        </div>

                        {/* TAB CONTENT */}
                        {activeTab === 'live' ? (
                            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
                                {/* Code View */}
                                <div style={{ flex: 1, background: '#020617', padding: '20px', overflowY: 'auto' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                                        <span style={{ color: '#64748b', fontSize: '12px' }}>
                                            {selectedFileContent ? `Viewing: ${selectedFileContent.name}` : (students[selectedStudent]?.activeFile ? `Live Edit: ${students[selectedStudent].activeFile}` : 'No file open')}
                                        </span>
                                        <button onClick={() => setSelectedFileContent(null)} style={{ fontSize: '11px', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', visibility: selectedFileContent ? 'visible' : 'hidden' }}>Return to Live</button>
                                    </div>
                                    <pre style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#d4d4d4', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                        {selectedFileContent ? selectedFileContent.content : (students[selectedStudent]?.code || '// Waiting for code...')}
                                    </pre>
                                </div>
                                {/* File List */}
                                <div style={{ width: '250px', borderLeft: '1px solid #334155', background: '#0f172a', padding: '15px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        FILES ({studentFiles.length})
                                        <FaSync style={{ cursor: 'pointer' }} onClick={() => fetchStudentFiles(selectedStudent)} />
                                    </div>
                                    {studentFiles.map(f => (
                                        <div key={f._id} onClick={() => handleViewFile(f)} style={{ padding: '8px', marginBottom: '4px', borderRadius: '6px', background: selectedFileContent?._id === f._id ? '#1e293b' : 'transparent', color: '#cbd5e1', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FaFile size={10} color="#64748b" /> {f.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* PORTFOLIO VIEW */
                            <div style={{ flex: 1, background: '#020617', padding: '30px', overflowY: 'auto' }}>
                                {!studentPortfolio ? (
                                    <div style={{ color: '#64748b', textAlign: 'center', marginTop: '50px' }}>Loading academic record...</div>
                                ) : (
                                    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                                        {/* Global Stats */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
                                            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                                                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>Total Labs Attended</div>
                                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>
                                                    {Object.values(studentPortfolio.tracks || {}).reduce((acc, t) => acc + t.attended, 0)}
                                                </div>
                                            </div>
                                            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                                                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>Total Active Hours</div>
                                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4ade80' }}>
                                                    {(Object.values(studentPortfolio.tracks || {}).reduce((acc, t) => acc + t.totalTime, 0) / 60).toFixed(1)}h
                                                </div>
                                            </div>
                                            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                                                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>Subjects Tracked</div>
                                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#a855f7' }}>
                                                    {Object.keys(studentPortfolio.tracks || {}).length}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Subject Tracks */}
                                        <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <FaChartLine /> Subject Progress
                                        </h3>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {Object.values(studentPortfolio.tracks || {}).map(track => (
                                                <div key={track.subject} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
                                                    {/* Track Header */}
                                                    <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b' }}>
                                                        <div>
                                                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{track.subject}</div>
                                                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{track.totalLabs} Lab Sessions</div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: track.attended / track.totalLabs > 0.75 ? '#4ade80' : '#fbbf24' }}>
                                                                {Math.round((track.attended / track.totalLabs) * 100)}%
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>Attendance</div>
                                                        </div>
                                                    </div>

                                                    {/* Session Timeline */}
                                                    <div style={{ padding: '20px' }}>
                                                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase' }}>Recent Activity</div>
                                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                            {track.sessions.slice(0, 10).map((s, i) => (
                                                                <div key={i} style={{
                                                                    padding: '8px 12px', borderRadius: '6px',
                                                                    background: s.attended ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                                                                    border: s.attended ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(248, 113, 113, 0.2)',
                                                                    display: 'flex', flexDirection: 'column', gap: '4px',
                                                                    minWidth: '100px'
                                                                }}>
                                                                    <div style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: '500' }}>{new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                                                                    <div style={{ fontSize: '10px', color: s.attended ? '#4ade80' : '#f87171' }}>
                                                                        {s.attended ? `${s.duration} min` : 'Absent'}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div style={{ flex: 1, background: '#020617', padding: '30px', overflowY: 'auto' }}>
                                <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '20px' }}>Session Activity Timeline</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {sessionTimeline.length === 0 ? (
                                        <div style={{ color: '#64748b' }}>No activity logged yet for this student.</div>
                                    ) : (
                                        sessionTimeline.map((log, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                                                <div style={{ minWidth: '80px', fontSize: '11px', color: '#475569', paddingTop: '4px' }}>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#334155', marginTop: '6px', flexShrink: 0, position: 'relative' }}>
                                                    {i < sessionTimeline.length - 1 && <div style={{ position: 'absolute', top: '10px', left: '4px', width: '2px', height: '30px', background: '#1e293b' }}></div>}
                                                </div>
                                                <div style={{ background: '#1e293b', padding: '10px 15px', borderRadius: '8px', border: '1px solid #334155', flex: 1 }}>
                                                    <div style={{ fontSize: '12px', color: '#f8fafc', fontWeight: 'bold', textTransform: 'capitalize' }}>{log.event.replace('-', ' ')}</div>
                                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{log.details}</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'reports' && (
                            /* REPORTS VIEW */
                            <div style={{ flex: 1, background: '#020617', padding: '30px', overflowY: 'auto' }}>
                                {!studentReport ? (
                                    <div style={{ textAlign: 'center', marginTop: '50px' }}>
                                        <div style={{ color: '#64748b', marginBottom: '10px' }}>No report data found for {subject || 'this course'}.</div>
                                        <button onClick={() => fetchStudentReport(selectedStudent)} style={{ background: '#334155', border: 'none', padding: '8px 16px', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>Refresh</button>
                                    </div>
                                ) : (
                                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                                            <div>
                                                <h2 style={{ color: '#fff', margin: 0 }}>Detailed Lab Report</h2>
                                                <div style={{ color: '#4ade80', marginTop: '5px', fontSize: '14px' }}>
                                                    Total Time Spent: <span style={{ fontWeight: 'bold' }}>{(studentReport.totalTimeSpent / 60).toFixed(1)} mins</span>
                                                </div>
                                            </div>
                                            <button onClick={downloadReport} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                                                <FaFilePdf /> Download Full Report
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            {studentReport.files.map((file, idx) => (
                                                <div key={idx} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
                                                    <div style={{ padding: '15px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <FaCode color="#94a3b8" />
                                                            <span style={{ color: '#e2e8f0', fontWeight: '600' }}>{file.fileName}</span>
                                                            {file.status === 'submitted' && <span style={{ fontSize: '10px', background: '#059669', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>SUBMITTED</span>}
                                                        </div>
                                                        <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                                                            ⏱ {(file.timeSpent / 60).toFixed(1)} min
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '15px', background: '#0f172a' }}>
                                                        <pre style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#94a3b8', maxHeight: '200px', overflowY: 'auto' }}>
                                                            {file.code || "// No code content saved"}
                                                        </pre>
                                                    </div>
                                                </div>
                                            ))}
                                            {studentReport.files.length === 0 && (
                                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No files recorded in this report yet.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
    );
};

export default MonitorDashboard;
