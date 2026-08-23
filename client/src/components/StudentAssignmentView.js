import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { 
    FaPlay, FaPaperPlane, FaArrowLeft, FaCheckCircle, FaTimesCircle, 
    FaBook, FaCode, FaRobot, FaRocket, FaExclamationTriangle, 
    FaTerminal, FaChalkboardTeacher, FaClipboardList, FaGraduationCap,
    FaBolt, FaHistory, FaTrophy, FaCalendarAlt
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import StudentTimetableWidget from './StudentTimetableWidget'; // NEW: Student Timetable

const StudentAssignmentView = ({ 
    token, serverUrl, userId, onBack, 
    activeSessionId, onEnterLab, 
    activeAptitudeSession, onEnterAptitude 
}) => {
    // viewMode: 'hub' | 'courses' | 'assignments' | 'solve' | 'aptitude-list'
    const [viewMode, setViewMode] = useState('hub');
    const [courses, setCourses] = useState([]);
    
    // NEW: Master Subject Context
    const [selectedContextId, setSelectedContextId] = useState('');

    const [assignments, setAssignments] = useState([]);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [submissions, setSubmissions] = useState([]);
    const [activeAssignments, setActiveAssignments] = useState([]);
    const [aptitudeHistory, setAptitudeHistory] = useState([]);
    const [userStats, setUserStats] = useState({ completed: 0, points: 0, rank: 'Novice' });
    const [selectedAnalyticsSubmission, setSelectedAnalyticsSubmission] = useState(null);

    // NEW: Developer Identity
    const [devProfiles, setDevProfiles] = useState({ github: '', leetcode: '', hackerrank: '', codechef: '' });
    const [isSavingProfiles, setIsSavingProfiles] = useState(false);

    // Solver & Test States
    const [code, setCode] = useState('');
    const [studentLanguage, setStudentLanguage] = useState('python'); // Default if 'any'
    const [testResults, setTestResults] = useState(null);
    const [submissionStatus, setSubmissionStatus] = useState(null);

    // Fullscreen Proctoring State
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [proctorWarning, setProctorWarning] = useState('');

    const api = axios.create({ baseURL: serverUrl, headers: { Authorization: token } });

    useEffect(() => {
        fetchEnrolledCourses();
        fetchAptitudeHistory();
        fetchActiveAssignments();
        fetchDeveloperProfiles();
        // Mock stats or fetch from backend if available
        setUserStats({ completed: 12, points: 450, rank: 'Pro Code-Warrior' });

        // Fullscreen Listener
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setIsFullscreen(false);
                if (viewMode === 'solve' && (!submissionStatus || !submissionStatus.includes('Submitted Successfully'))) {
                    setProctorWarning('STRICT PROCTORING VIOLATION: You exited fullscreen. This incident has been logged.');
                }
            } else {
                setIsFullscreen(true);
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        // Intercept browser back button to prevent leaving the platform
        window.history.pushState({ page: "studentCommandCenter" }, "ACE Student Command Center", window.location.href);
        const handlePopState = (e) => {
            e.preventDefault();
            if (viewMode !== 'hub') {
                setViewMode('hub');
                window.history.pushState({ page: "studentCommandCenter" }, "ACE Student Command Center", window.location.href);
            } else {
                onBack(); // Go to workspace instead of leaving site
            }
        };
        window.addEventListener('popstate', handlePopState);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [viewMode, onBack, submissionStatus]);

    const fetchDeveloperProfiles = async () => {
        try {
            const res = await api.get('/auth/user');
            if (res.data.externalProfiles) {
                setDevProfiles({
                    github: res.data.externalProfiles.github || '',
                    leetcode: res.data.externalProfiles.leetcode || '',
                    hackerrank: res.data.externalProfiles.hackerrank || '',
                    codechef: res.data.externalProfiles.codechef || ''
                });
            }
        } catch (e) { console.error("Failed to fetch dev profiles", e); }
    };

    const handleSaveProfiles = async () => {
        setIsSavingProfiles(true);
        try {
            await api.put('/api/tracking/profiles', devProfiles);
            alert("Developer profiles saved successfully!");
        } catch (e) {
            console.error(e);
            alert("Failed to save profiles.");
        } finally {
            setIsSavingProfiles(false);
        }
    };

    const fetchActiveAssignments = async () => {
        try {
            const [assignRes, subRes] = await Promise.all([
                api.get('/api/assignments/student/active'),
                api.get('/api/assignments/student/my-submissions')
            ]);
            setActiveAssignments(assignRes.data);
            setSubmissions(subRes.data);
        } catch (e) { console.error("Failed to fetch assignments and submissions", e); }
    };

    const fetchEnrolledCourses = async () => {
        try {
            const res = await api.get('/api/student/enrolled-courses');
            setCourses(res.data);
            if (res.data.length > 0 && !selectedContextId) {
                setSelectedContextId(res.data[0]._id);
            }
        } catch (e) { console.error("Failed to fetch courses", e); }
    };

    const fetchAptitudeHistory = async () => {
        try {
            const res = await api.get('/api/aptitude/student/history');
            setAptitudeHistory(res.data);
        } catch (e) { console.error("Failed to fetch aptitude history", e); }
    };

    const handleCourseClick = async (course) => {
        setSelectedContextId(course._id);
        setViewMode('hub'); // Instead of jumping to assignments, just select it
    };

    const openAssignment = (assignment) => {
        const now = new Date();
        const start = new Date(assignment.startTime);
        if (now < start) {
            alert(`Mission starts at ${start.toLocaleString()}`);
            return;
        }
        setSelectedAssignment(assignment);
        setCode(assignment.starterCode || '');
        setTestResults(null);
        setSubmissionStatus(null);
        setViewMode('solve');
    };

    const handleBack = () => {
        if (viewMode === 'solve') {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(e => console.error(e));
            }
            setViewMode('assignments');
            setSelectedAssignment(null);
        }
        else if (viewMode === 'assignments') { setViewMode('hub'); }
        else if (viewMode === 'courses' || viewMode === 'aptitude-list') setViewMode('hub');
        else onBack();
    };

    const runTests = async () => {
        setSubmissionStatus('Running Tests...');
        try {
            const res = await api.post(`/api/assignments/${selectedAssignment._id}/run-tests`, {
                code, language: selectedAssignment.language === 'any' ? studentLanguage : selectedAssignment.language
            });
            setTestResults(res.data.results);
            setSubmissionStatus('Tests Completed');
        } catch (e) { setSubmissionStatus('Error: ' + e.message); }
    };

    const submitAssignment = async () => {
        if (!window.confirm("Are you sure you want to submit?")) return;
        setSubmissionStatus('Submitting...');
        try {
            const res = await api.post(`/api/assignments/${selectedAssignment._id}/submit`, {
                code, language: selectedAssignment.language === 'any' ? studentLanguage : selectedAssignment.language
            });
            setTestResults(res.data.results);
            const { score, maxScore } = res.data.submission;
            setSubmissionStatus(`Submitted Successfully! Marks: ${score}/${maxScore}`);
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(e => console.error(e));
            }
        } catch (e) { setSubmissionStatus('Submission Error: ' + e.message); }
    };

    // --- STYLES ---
    const cardStyle = {
        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', // Solid neat card background
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '24px',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.2)'
    };

    const containerStyle = {
        padding: '40px 40px 120px 40px',
        color: '#f8fafc',
        maxWidth: '1250px',
        margin: '0 auto',
        minHeight: '100%',
        position: 'relative',
        zIndex: 10,
        fontFamily: "'Outfit', sans-serif"
    };

    const rootStyle = {
        height: '100%',
        width: '100%',
        background: 'radial-gradient(circle at top right, #1e1b4b 0%, #0a0f1c 40%, #020617 100%)', // Premium solid background to hide underlying particles
        overflowY: 'auto',
        position: 'relative',
        scrollBehavior: 'smooth'
    };

    const watermarkStyle = {
        position: 'fixed',
        bottom: '-5%',
        right: '-5%',
        fontSize: '20vw',
        fontWeight: '900',
        color: 'rgba(255, 255, 255, 0.015)',
        pointerEvents: 'none',
        zIndex: 1,
        fontFamily: "'Outfit', sans-serif",
        letterSpacing: '-1vw',
        lineHeight: 1,
        userSelect: 'none'
    };

    // --- HUB SECTION RENDER ---
    const renderHub = () => (
        <div style={rootStyle}>
            {/* Watermark */}
            <div style={watermarkStyle}>KEVRYN</div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={containerStyle}>
                {/* Header / Hero */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
                    <div>
                        <h1 style={{ fontSize: '48px', fontWeight: '900', margin: '0 0 12px 0', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1.5px' }}>
                            Student Command Center
                        </h1>
                        <p style={{ fontSize: '18px', color: '#94a3b8', margin: '0 0 24px 0' }}>Welcome back, Operator. Stay sharp, your missions await.</p>
                        
                        {/* MASTER SUBJECT DROPDOWN */}
                        {courses.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(30, 41, 59, 0.6)', padding: '12px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <FaBook color="#818cf8" size={20} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px' }}>Active Subject Context</span>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        <select 
                                            value={selectedContextId} 
                                            onChange={(e) => setSelectedContextId(e.target.value)}
                                            style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '18px', fontWeight: '800', outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '25px', zIndex: 2, position: 'relative' }}
                                        >
                                            {courses.map(c => (
                                                <option key={c._id} value={c._id} style={{ background: '#0f172a' }}>{c.name}</option>
                                            ))}
                                        </select>
                                        <span style={{ position: 'absolute', right: '5px', color: '#818cf8', fontSize: '12px', pointerEvents: 'none', zIndex: 1 }}>▼</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onBack}
                        style={{
                            padding: '14px 28px', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.3)',
                            background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', cursor: 'pointer',
                            fontWeight: '700', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '12px',
                            transition: 'all 0.2s', boxShadow: '0 0 20px rgba(139, 92, 246, 0.1)'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)'; e.currentTarget.style.transform = 'translateY(-2px)'}}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)'; e.currentTarget.style.transform = 'translateY(0)'}}
                    >
                        <FaCode /> OPEN PERSONAL WORKSPACE
                    </button>
                </div>

                {/* Today's Schedule Widget */}
                <div style={{ marginBottom: '40px' }}>
                    <StudentTimetableWidget token={token} serverUrl={serverUrl} activeSessionId={activeSessionId} onEnterLab={onEnterLab} />
                </div>

                {/* Mission Control (Active) */}
                {(activeAptitudeSession || activeSessionId) && (
                    <div style={{ marginBottom: '60px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                            <FaBolt color="#fbbf24" size={16} />
                            <h2 style={{ fontSize: '14px', fontWeight: '800', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Mission Control: Active Now</h2>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                            {activeAptitudeSession && (
                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(161, 98, 7, 0.1))',
                                        border: '1px solid rgba(234, 179, 8, 0.5)', padding: '32px', borderRadius: '24px',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        boxShadow: '0 10px 40px -10px rgba(234, 179, 8, 0.2)'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ width: '56px', height: '56px', background: 'rgba(234,179,8,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}><FaExclamationTriangle size={28} /></div>
                                        <div>
                                            <div style={{ color: '#fbbf24', fontSize: '12px', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase' }}>STRICT EXAM ACTIVE</div>
                                            <h3 style={{ margin: '4px 0', fontSize: '22px', fontWeight: '800', color: '#fff' }}>{activeAptitudeSession.title}</h3>
                                        </div>
                                    </div>
                                    <button onClick={onEnterAptitude} style={{ padding: '12px 24px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>ENGAGE MISSION</button>
                                </motion.div>
                            )}
                            {activeSessionId && (
                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(91, 33, 182, 0.1))',
                                        border: '1px solid rgba(124, 58, 237, 0.5)', padding: '32px', borderRadius: '24px',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        boxShadow: '0 10px 40px -10px rgba(124, 58, 237, 0.2)'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div style={{ width: '56px', height: '56px', background: 'rgba(124,58,237,0.2)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}><FaTerminal size={28} /></div>
                                        <div>
                                            <div style={{ color: '#c4b5fd', fontSize: '12px', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase' }}>LIVE LAB ACTIVE</div>
                                            <h3 style={{ margin: '4px 0', fontSize: '22px', fontWeight: '800', color: '#fff' }}>Monitored Playground</h3>
                                        </div>
                                    </div>
                                    <button onClick={onEnterLab} style={{ padding: '12px 24px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>JOIN SQUAD</button>
                                </motion.div>
                            )}
                        </div>
                    </div>
                )}

                {/* Core Navigation Grid (Contextual) */}
                {selectedContextId && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
                        <HubCard 
                            title="Aptitude Center" 
                            desc="Take standardized tests and mock exams specific to this subject."
                            icon={<FaTrophy size={24} />}
                            color="#fbbf24"
                            onClick={() => setViewMode('aptitude-list')}
                            count={activeAptitudeSession && new Date() >= new Date(activeAptitudeSession.startTime) && new Date() <= new Date(activeAptitudeSession.endTime) ? 1 : 0}
                        />
                        <HubCard 
                            title="Assignment Depot" 
                            desc="Complete your coding missions and deploy solutions for this subject."
                            icon={<FaClipboardList size={24} />}
                            color="#3b82f6"
                            onClick={() => setViewMode('assignments')}
                            count={activeAssignments.filter(a => {
                                const isContext = (a.courseId) 
                                    ? (a.courseId._id || a.courseId) === selectedContextId 
                                    : (courses.find(c => c._id === selectedContextId)?.name?.toLowerCase() === a.subjectName?.toLowerCase());
                                return isContext && (!a.startTime || new Date() >= new Date(a.startTime)) && (!a.endTime || new Date() <= new Date(a.endTime));
                            }).length}
                        />
                        <HubCard 
                            title="Performance Analytics" 
                            desc="Review your past submissions, feedback, and grade progressions for this subject."
                            icon={<FaHistory size={24} />}
                            color="#10b981"
                            onClick={() => {
                                setSelectedAnalyticsSubmission(null);
                                setViewMode('analytics');
                            }}
                        />
                    </div>
                )}

                {/* NEW: Developer Identity Section */}
                <div style={{ marginTop: '60px', marginBottom: '60px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                        <FaCode color="#8b5cf6" size={16} />
                        <h2 style={{ fontSize: '14px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Developer Identity Integration</h2>
                    </div>
                    <div style={{ ...cardStyle, background: 'rgba(255,255,255,0.02)' }}>
                        <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '24px' }}>Link your external developer profiles to track your progress and showcase your global rankings.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                            {['github', 'leetcode', 'hackerrank', 'codechef'].map(platform => (
                                <div key={platform}>
                                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
                                        {platform === 'github' ? 'GitHub' : platform === 'leetcode' ? 'LeetCode' : platform === 'hackerrank' ? 'HackerRank' : 'CodeChef'} Username
                                    </label>
                                    <input 
                                        type="text" 
                                        value={devProfiles[platform] || ''} 
                                        onChange={(e) => setDevProfiles({ ...devProfiles, [platform]: e.target.value })}
                                        placeholder={`Enter ${platform} handle`}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}
                                    />
                                </div>
                            ))}
                        </div>
                        <button 
                            onClick={handleSaveProfiles}
                            disabled={isSavingProfiles}
                            style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: isSavingProfiles ? 'not-allowed' : 'pointer', opacity: isSavingProfiles ? 0.7 : 1, transition: 'all 0.3s' }}
                        >
                            {isSavingProfiles ? 'SYNCING...' : 'SYNC PROFILES'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );

    // --- SUB-COMPONENTS ---
    const HubCard = ({ title, desc, icon, color, onClick, count }) => (
        <motion.div
            whileHover={{ y: -8, border: `1px solid ${color}44`, boxShadow: `0 20px 40px -20px ${color}22` }}
            onClick={onClick}
            style={cardStyle}
        >
            <div style={{ width: '56px', height: '56px', background: `${color}11`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, marginBottom: '24px' }}>
                {icon}
            </div>
            <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '12px', color: '#fff' }}>{title}</h3>
            <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.6', margin: '0 0 24px 0' }}>{desc}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: color, display: 'flex', alignItems: 'center', gap: '8px' }}>EXPLORE <FaArrowLeft style={{ transform: 'rotate(180deg)', fontSize: '10px' }} /></span>
                {count !== undefined && count > 0 && (
                    <span style={{ background: `${color}22`, color: color, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>{count} ACTIVE</span>
                )}
            </div>
        </motion.div>
    );

    // --- RENDER APTITUDE LIST ---
    const renderAptitudeList = () => (
        <div style={rootStyle}>
            <div style={watermarkStyle}>TESTS</div>
            <div style={containerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
                    <h2 style={{ fontSize: '32px', fontWeight: '800', margin: 0 }}>Aptitude Test Center</h2>
                </div>

                {activeAptitudeSession && (
                    <div style={{ marginBottom: '40px' }}>
                        <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '20px' }}>Active Examination</h3>
                        <motion.div
                            whileHover={{ scale: 1.01 }}
                            style={{ ...cardStyle, border: '1px solid rgba(234, 179, 8, 0.4)', background: 'rgba(234, 179, 8, 0.05)' }}
                            onClick={onEnterAptitude}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    <div style={{ color: '#eab308' }}><FaRocket size={32} /></div>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '20px' }}>{activeAptitudeSession.title}</h4>
                                        <p style={{ margin: '4px 0 0 0', color: '#94a3b8' }}>Strict Environment • {activeAptitudeSession.duration} Minutes</p>
                                    </div>
                                </div>
                                <button style={{ padding: '10px 20px', background: '#eab308', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>START NOW</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '20px' }}>Test History & Results</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                    {aptitudeHistory.length === 0 ? (
                        <div style={{ color: '#64748b', gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>No past test records found.</div>
                    ) : (
                        aptitudeHistory.map(test => (
                            <div key={test._id} style={cardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>COMPLETED</span>
                                    <span style={{ color: '#64748b', fontSize: '11px' }}>{new Date(test.startTime).toLocaleDateString()}</span>
                                </div>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>{test.title}</h4>
                                <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Score: {test.submission?.score || 'N/A'}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    // --- RENDER SOLVE ---
    const renderSolve = () => {
        const isSubmitted = submissionStatus && submissionStatus.includes('Submitted Successfully');
        return (
            <div style={{ display: 'flex', height: '100%', flexDirection: 'column', background: 'transparent', color: '#e2e8f0', fontFamily: "'Outfit', sans-serif" }}>
                
                {/* STRICT PROCTORING FULLSCREEN OVERLAY */}
                {!isFullscreen && !isSubmitted && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <FaExclamationTriangle size={64} color="#ef4444" style={{ marginBottom: '20px' }} />
                        <h1 style={{ color: '#ef4444', fontSize: '32px', fontWeight: '900', marginBottom: '10px' }}>PROCTORING ACTIVE</h1>
                        <p style={{ color: '#94a3b8', fontSize: '18px', marginBottom: '30px', textAlign: 'center', maxWidth: '500px' }}>
                            Assignments are conducted in Strict Full-Screen mode. Exiting full-screen or switching tabs will be logged as a violation.
                        </p>
                        <button 
                            onClick={() => document.documentElement.requestFullscreen().catch(e => console.error(e))}
                            style={{ padding: '16px 32px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: '800', cursor: 'pointer' }}
                        >
                            ENTER FULLSCREEN TO CONTINUE
                        </button>
                    </div>
                )}

                {/* WARNING BANNER */}
                {proctorWarning && (
                    <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', padding: '16px 32px', borderRadius: '12px', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 10px 30px rgba(239, 68, 68, 0.5)', border: '2px solid rgba(255,255,255,0.2)' }}>
                        <FaExclamationTriangle size={24} />
                        <div>
                            <div style={{ fontWeight: '900', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>WARNING</div>
                            <div style={{ fontSize: '14px', opacity: 0.9 }}>{proctorWarning}</div>
                        </div>
                        <button onClick={() => setProctorWarning('')} style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', marginLeft: '20px' }}>ACKNOWLEDGE</button>
                    </div>
                )}

                {selectedAssignment && selectedAssignment.endTime && new Date() > new Date(selectedAssignment.endTime) && (
                    <div style={{ padding: '12px 32px', background: '#ef4444', color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>
                        TIME WINDOW ENDED - READ ONLY MODE
                    </div>
                )}
                <div style={{ padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(20px)', zIndex: 100 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleBack} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaArrowLeft /></motion.button>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                <span style={{ padding: '2px 8px', background: 'rgba(99,102,241,0.1)', color: '#818cf8', borderRadius: '12px', fontSize: '10px', fontWeight: '800', letterSpacing: '0.5px' }}>MISSION</span>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>{selectedAssignment.title}</h3>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '12px', color: '#475569' }}>{selectedAssignment.courseName} • </span>
                                {selectedAssignment.language === 'any' ? (
                                    <select 
                                        value={studentLanguage} 
                                        onChange={e => setStudentLanguage(e.target.value)}
                                        style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', outline: 'none' }}
                                    >
                                        <option value="python">PYTHON</option>
                                        <option value="javascript">JAVASCRIPT</option>
                                        <option value="c">C</option>
                                        <option value="cpp">C++</option>
                                        <option value="java">JAVA</option>
                                    </select>
                                ) : (
                                    <span style={{ fontSize: '12px', color: '#475569' }}>{selectedAssignment.language.toUpperCase()} ENGINE</span>
                                )}
                            </div>
                        </div>
                    </div>
                    {!(selectedAssignment && selectedAssignment.endTime && new Date() > new Date(selectedAssignment.endTime)) && (
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <motion.button onClick={runTests} style={{ padding: '10px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(30, 41, 59, 0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700' }}><FaPlay size={12} color="#60a5fa" /> EXECUTE LOGIC</motion.button>
                            <motion.button onClick={submitAssignment} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800' }}><FaPaperPlane size={12} /> DEPLOY SOLUTION</motion.button>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div style={{ width: '400px', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.2)', backdropFilter: 'blur(5px)' }}>
                        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}><FaBook color="#6366f1" size={14} /><h4 style={{ color: '#fff', margin: 0, fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}>Objective Briefing</h4></div>
                            <div style={{ lineHeight: '1.8', color: '#94a3b8', fontSize: '15px', whiteSpace: 'pre-wrap' }}>{selectedAssignment.description}</div>
                        </div>
                        <div style={{ height: '45%', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(2, 6, 23, 0.5)', padding: '20px' }}>
                            {submissionStatus && <div style={{ marginBottom: '10px', color: '#818cf8', fontWeight: '600' }}>{submissionStatus}</div>}
                            {testResults && testResults.map((res, i) => (
                                <div key={i} style={{ marginBottom: '8px', padding: '10px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px', border: `1px solid ${res.pass ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}` }}>
                                    {res.pass ? '✅' : '❌'} {res.testCase}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ flex: 1 }}><Editor height="100%" theme="vs-dark" defaultValue={code} onChange={v => setCode(v)} language={selectedAssignment.language === 'any' ? studentLanguage : selectedAssignment.language} options={{ fontSize: 16, fontFamily: 'JetBrains Mono', minimap: { enabled: false }, readOnly: selectedAssignment && selectedAssignment.endTime && new Date() > new Date(selectedAssignment.endTime) }} /></div>
                </div>
            </div>
        );
    };

    // --- RENDER ASSIGNMENTS LIST ---
    const renderAssignmentsList = () => {
        const now = new Date();
        const selectedCourse = courses.find(c => c._id === selectedContextId);
        
        const contextualAssignments = activeAssignments.filter(a => {
            if (a.courseId) return (a.courseId?._id || a.courseId) === selectedContextId;
            if (selectedCourse && a.subjectName) return a.subjectName.toLowerCase() === selectedCourse.name.toLowerCase();
            return false;
        });
        
        const activeNow = contextualAssignments.filter(a => (!a.startTime || now >= new Date(a.startTime)) && (!a.endTime || now <= new Date(a.endTime)));
        const upcoming = contextualAssignments.filter(a => a.startTime && now < new Date(a.startTime));
        const past = contextualAssignments.filter(a => a.endTime && now > new Date(a.endTime));

        const renderAssignmentCards = (list) => (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '24px', marginBottom: '40px' }}>
                {list.map(a => {
                    const submission = submissions.find(s => s.assignmentId?._id === a._id);
                    return (
                        <motion.div key={a._id} onClick={() => openAssignment(a)} whileHover={{ y: -5 }} style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Assignment</span>
                                {submission && <span style={{ padding: '2px 8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '12px', fontSize: '10px', fontWeight: '800' }}>SUBMITTED</span>}
                            </div>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>{a.title}</h3>
                            <div style={{ color: '#94a3b8', fontSize: '13px' }}><FaCode size={10} /> {a.language} • {submission ? 'Achieved Score' : 'Target Score'}: {submission ? `${submission.score} / ${submission.maxScore}` : `${a.maxPoints || 100} Marks`}</div>
                        </motion.div>
                    );
                })}
            </div>
        );

        return (
            <div style={rootStyle}>
                <div style={watermarkStyle}>TASKS</div>
                <div style={containerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
                        <h2 style={{ fontSize: '32px', fontWeight: '800', margin: 0 }}>Assigned Missions</h2>
                    </div>
                    
                    {activeNow.length > 0 && (
                        <>
                            <h3 style={{ color: '#10b981', fontSize: '18px', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Now</h3>
                            {renderAssignmentCards(activeNow)}
                        </>
                    )}
                    {upcoming.length > 0 && (
                        <>
                            <h3 style={{ color: '#60a5fa', fontSize: '18px', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>Upcoming</h3>
                            {renderAssignmentCards(upcoming)}
                        </>
                    )}
                    {past.length > 0 && (
                        <>
                            <h3 style={{ color: '#94a3b8', fontSize: '18px', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>Past / Read-Only</h3>
                            {renderAssignmentCards(past)}
                        </>
                    )}
                    {contextualAssignments.length === 0 && <div style={{ color: '#94a3b8' }}>No assignments found for this subject.</div>}
                </div>
            </div>
        );
    };

    // --- RENDER COURSE LIST ---
    const renderCourseList = () => {
        return (
            <div style={rootStyle}>
                <div style={watermarkStyle}>ACADEMY</div>
                <div style={containerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
                        <h2 style={{ fontSize: '32px', fontWeight: '800', margin: 0 }}>Academy Vault (Courses)</h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                        {courses.map(course => (
                            <motion.div key={course._id} onClick={() => handleCourseClick(course)} whileHover={{ y: -5 }} style={cardStyle}>
                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}></div>
                                <h3 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>{course.name}</h3>
                                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>{course.code} • Sem {course.semester}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderAnalytics = () => {
        const selectedCourse = courses.find(c => c._id === selectedContextId);
        
        const contextualAssignments = activeAssignments.filter(a => {
            if (a.courseId) return (a.courseId?._id || a.courseId) === selectedContextId;
            if (selectedCourse && a.subjectName) return a.subjectName.toLowerCase() === selectedCourse.name.toLowerCase();
            return false;
        });
        
        const assignmentIds = contextualAssignments.map(a => a._id);
        const contextSubmissions = submissions.filter(sub => assignmentIds.includes(sub.assignmentId?._id || sub.assignmentId));

        return (
            <div style={rootStyle}>
                <div style={watermarkStyle}>ANALYTICS</div>
                <div style={containerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
                        <h2 style={{ fontSize: '32px', fontWeight: '800', margin: 0 }}>Subject Performance Analytics</h2>
                    </div>
                    
                    <div style={{ display: 'flex', height: '600px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(16px)' }}>
                        <div style={{ width: '300px', borderRight: '1px solid rgba(255,255,255,0.1)', overflowY: 'auto' }}>
                            {contextSubmissions.length === 0 ? (
                                <div style={{ padding: '24px', color: '#64748b', textAlign: 'center' }}>No submissions found for this subject.</div>
                            ) : (
                                contextSubmissions.map(sub => (
                                    <div 
                                        key={sub._id}
                                        onClick={() => setSelectedAnalyticsSubmission(sub)}
                                        style={{ 
                                            padding: '20px', 
                                            cursor: 'pointer', 
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            background: selectedAnalyticsSubmission?._id === sub._id ? 'rgba(99,102,241,0.1)' : 'transparent',
                                            transition: 'background 0.2s',
                                            borderLeft: selectedAnalyticsSubmission?._id === sub._id ? '4px solid #6366f1' : '4px solid transparent'
                                        }}
                                    >
                                        <div style={{ fontWeight: 'bold', color: '#f8fafc', marginBottom: '4px' }}>{sub.assignmentId?.title || 'Unknown Assignment'}</div>
                                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>Submitted: {new Date(sub.submittedAt).toLocaleDateString()}</div>
                                        <div style={{ fontSize: '14px', color: sub.score > 0 ? '#10b981' : '#ef4444', fontWeight: '700' }}>Score: {sub.score} / {sub.assignmentId?.maxPoints || 100}</div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(2,6,23,0.4)' }}>
                            {selectedAnalyticsSubmission ? (
                                <>
                                    <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ margin: '0 0 4px 0', color: '#f8fafc' }}>{selectedAnalyticsSubmission.assignmentId?.title} Code Review</h3>
                                            <div style={{ fontSize: '13px', color: '#94a3b8' }}>View your submitted code and test case results.</div>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Editor
                                            height="100%"
                                            theme="vs-dark"
                                            language="python"
                                            value={selectedAnalyticsSubmission.submittedCode || "// No code submitted"}
                                            options={{ readOnly: true, minimap: { enabled: false } }}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#64748b' }}>
                                    Select a past submission to view your code.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderActiveOverlay = () => {
        if (viewMode === 'aptitude-list') return renderAptitudeList();
        if (viewMode === 'solve' && selectedAssignment) return renderSolve();
        if (viewMode === 'assignments') return renderAssignmentsList();
        if (viewMode === 'courses') return renderCourseList();
        if (viewMode === 'analytics') return renderAnalytics();
        return null;
    };

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            {/* BACKGROUND COMMAND CENTER (Always visible) */}
            <div style={{ position: 'absolute', inset: 0, opacity: viewMode === 'hub' ? 1 : 0.3, filter: viewMode === 'hub' ? 'none' : 'blur(4px)', transition: 'all 0.3s ease-in-out', zIndex: 1 }}>
                {renderHub()}
            </div>
            
            {/* OVERLAY ENGINE */}
            <AnimatePresence>
                {viewMode !== 'hub' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-primary, #0f172a)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
                    >
                        {viewMode !== 'solve' && (
                            <div style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(10px)' }}>
                                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    {viewMode === 'aptitude-list' ? 'Aptitude Test Center' : viewMode === 'assignments' ? 'Assignment Depot' : viewMode === 'analytics' ? 'Performance Analytics' : 'Academy Vault'}
                                </div>
                                <button onClick={() => setViewMode('hub')} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', transition: 'all 0.2s' }}>
                                    <FaTimesCircle /> Close Overlay
                                </button>
                            </div>
                        )}
                        <div style={{ flex: 1, position: 'relative' }}>
                            {renderActiveOverlay()}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudentAssignmentView;








