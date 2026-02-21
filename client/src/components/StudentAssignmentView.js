import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { FaPlay, FaPaperPlane, FaArrowLeft, FaCheckCircle, FaTimesCircle, FaBook, FaCode, FaRobot, FaRocket, FaExclamationTriangle, FaTerminal } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const StudentAssignmentView = ({ token, serverUrl, userId, onBack, activeSessionId, onEnterLab }) => {
    // viewMode: 'courses' | 'assignments' | 'solve'
    const [viewMode, setViewMode] = useState('courses');
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [submissions, setSubmissions] = useState([]);

    // Solver State
    const [code, setCode] = useState('');
    const [testResults, setTestResults] = useState(null);
    const [submissionStatus, setSubmissionStatus] = useState(null);

    const api = axios.create({ baseURL: serverUrl, headers: { Authorization: token } });

    useEffect(() => {
        fetchEnrolledCourses();
    }, []);

    const fetchEnrolledCourses = async () => {
        try {
            const res = await api.get('/api/student/enrolled-courses');
            setCourses(res.data);
        } catch (e) {
            console.error("Failed to fetch courses", e);
        }
    };

    const handleCourseClick = async (course) => {
        setSelectedCourse(course);
        setViewMode('assignments');
        try {
            const [assignRes, userRes] = await Promise.all([
                api.get(`/api/assignments/course/${course._id}`),
                api.get('/auth/user')
            ]);
            setAssignments(assignRes.data.map(a => ({ ...a, courseName: course.name })));

            const subRes = await api.get(`/api/assignments/course/${course._id}/student/${userRes.data.username}`);
            setSubmissions(subRes.data);
        } catch (e) {
            console.error(e);
        }
    };

    const openAssignment = (assignment) => {
        setSelectedAssignment(assignment);
        setCode(assignment.starterCode || '');
        setTestResults(null);
        setSubmissionStatus(null);
        setViewMode('solve');
    };

    const handleBack = () => {
        if (viewMode === 'solve') {
            setViewMode('assignments');
            setSelectedAssignment(null);
        } else if (viewMode === 'assignments') {
            setViewMode('courses');
            setSelectedCourse(null);
            setAssignments([]);
        } else {
            onBack(); // Exit to dashboard
        }
    };

    const runTests = async () => {
        setSubmissionStatus('Running Tests...');
        try {
            const res = await api.post(`/api/assignments/${selectedAssignment._id}/run-tests`, {
                code,
                language: selectedAssignment.language
            });
            setTestResults(res.data.results);
            setSubmissionStatus('Tests Completed');
        } catch (e) {
            setSubmissionStatus('Error: ' + e.message);
        }
    };

    const submitAssignment = async () => {
        if (!window.confirm("Are you sure you want to submit?")) return;
        setSubmissionStatus('Submitting...');
        try {
            const res = await api.post(`/api/assignments/${selectedAssignment._id}/submit`, {
                code,
                language: selectedAssignment.language
            });
            setTestResults(res.data.results);
            const { score, maxScore } = res.data.submission;
            const fullMarks = Math.round((selectedAssignment.maxPoints || 100) / 10);
            const earnedMarks = maxScore > 0 ? Math.round((score / maxScore) * fullMarks) : 0;
            setSubmissionStatus(`Submitted Successfully! Marks: ${earnedMarks}/${fullMarks}`);

            // Refresh submissions list
            if (selectedCourse) {
                const userRes = await api.get('/auth/user');
                const subRes = await api.get(`/api/assignments/course/${selectedCourse._id}/student/${userRes.data.username}`);
                setSubmissions(subRes.data);
            }
        } catch (e) {
            setSubmissionStatus('Submission Error: ' + e.message);
        }
    };

    // Helper: convert raw test-case score to faculty-assigned marks
    const calcMarks = (score, maxScore, maxPoints) => {
        const fullMarks = Math.round((maxPoints || 100) / 10);
        const earned = maxScore > 0 ? Math.round((score / maxScore) * fullMarks) : 0;
        return { earned, fullMarks };
    };

    // --- SHARED STYLES ---
    const cardStyle = {
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '24px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        position: 'relative',
        overflow: 'hidden'
    };

    const containerStyle = {
        padding: '40px',
        color: '#e2e8f0',
        maxWidth: '1200px',
        margin: '0 auto',
        height: '100vh',
        overflowY: 'auto',
        background: 'transparent', // FIX: Transparent to show AntigravityBg
        position: 'relative',
        zIndex: 10
    };

    // --- RENDER SOLVER ---
    if (viewMode === 'solve' && selectedAssignment) {
        return (
            <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#020617', color: '#e2e8f0', fontFamily: "'Outfit', sans-serif" }}>
                <div style={{
                    padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(20px)',
                    zIndex: 100
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleBack}
                            style={{
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff',
                                width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                            }}
                        ><FaArrowLeft /></motion.button>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                <span style={{ padding: '2px 8px', background: 'rgba(99,102,241,0.1)', color: '#818cf8', borderRadius: '12px', fontSize: '10px', fontWeight: '800', letterSpacing: '0.5px' }}>MISSION</span>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' }}>{selectedAssignment.title}</h3>
                            </div>
                            <span style={{ fontSize: '12px', color: '#475569', fontWeight: '500' }}>{selectedAssignment.courseName} • {selectedAssignment.language.toUpperCase()} ENGINE</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <motion.button
                            whileHover={{ y: -2 }}
                            onClick={runTests}
                            style={{
                                padding: '10px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)',
                                background: 'rgba(30, 41, 59, 0.5)', color: '#fff',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                fontWeight: '700', fontSize: '14px', transition: 'all 0.2s'
                            }}
                        ><FaPlay size={12} color="#60a5fa" /> EXECUTE LOGIC</motion.button>
                        <motion.button
                            whileHover={{ y: -2, boxShadow: '0 10px 30px rgba(16, 185, 129, 0.2)' }}
                            onClick={submitAssignment}
                            style={{
                                padding: '10px 24px', borderRadius: '12px', border: 'none',
                                background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                fontWeight: '800', fontSize: '14px', transition: 'all 0.2s'
                            }}
                        ><FaPaperPlane size={12} /> DEPLOY SOLUTION</motion.button>
                    </div>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Left: Problem & Results */}
                    <div style={{ width: '400px', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.2)', backdropFilter: 'blur(5px)' }}>
                        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                                <FaBook color="#6366f1" size={14} />
                                <h4 style={{ color: '#fff', margin: 0, fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Objective Briefing</h4>
                            </div>
                            <div style={{ lineHeight: '1.8', color: '#94a3b8', fontSize: '15px', whiteSpace: 'pre-wrap' }}>{selectedAssignment.description}</div>
                        </div>

                        {/* Test Results Panel */}
                        <div style={{ height: '45%', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(2, 6, 23, 0.5)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FaRocket size={12} color="#fbbf24" />
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Telemetry Output</span>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                <AnimatePresence>
                                    {submissionStatus && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            style={{
                                                marginBottom: '20px', padding: '14px 20px', borderRadius: '12px',
                                                background: submissionStatus.includes('Success') ? 'rgba(16, 185, 129, 0.05)' : 'rgba(99, 102, 241, 0.05)',
                                                color: submissionStatus.includes('Success') ? '#4ade80' : '#818cf8',
                                                border: `1px solid ${submissionStatus.includes('Success') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)'}`,
                                                fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px'
                                            }}
                                        >
                                            {submissionStatus.includes('Running') ? <FaRobot className="spin-slow" /> : <FaCheckCircle />}
                                            {submissionStatus}
                                        </motion.div>
                                    )}

                                    {testResults && testResults.map((res, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            style={{
                                                marginBottom: '12px', padding: '16px',
                                                background: 'rgba(15, 23, 42, 0.3)',
                                                borderRadius: '14px',
                                                border: `1px solid ${res.pass ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}`,
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: res.pass ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {res.pass ? <FaCheckCircle color="#10b981" size={12} /> : <FaTimesCircle color="#ef4444" size={12} />}
                                                    </div>
                                                    <span style={{ fontWeight: '700', fontSize: '13px', color: res.pass ? '#f8fafc' : '#fca5a5' }}>Test Case {i + 1}</span>
                                                </div>
                                                <span style={{ fontSize: '10px', fontWeight: '800', color: res.pass ? '#10b981' : '#ef4444', textTransform: 'uppercase' }}>{res.pass ? 'Passed' : 'Failed'}</span>
                                            </div>
                                            {!res.pass && (
                                                <div style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", marginTop: '12px', background: 'rgba(2, 6, 23, 0.8)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <div style={{ marginBottom: '6px', color: '#64748b' }}>EXPECTED: <span style={{ color: '#10b981' }}>{res.expected}</span></div>
                                                    <div style={{ color: '#64748b' }}>ACTUAL: <span style={{ color: '#ef4444' }}>{res.actual}</span></div>
                                                    {res.error && <div style={{ color: '#ef4444', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>LOG: {res.error}</div>}
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                    {!submissionStatus && !testResults && (
                                        <div style={{ color: '#475569', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                            <FaTerminal size={24} style={{ opacity: 0.1 }} />
                                            Initialize logic execution to receive telemetry.
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* Right: Code Editor */}
                    <div style={{ flex: 1, position: 'relative', background: '#020617' }}>
                        <Editor
                            height="100%"
                            defaultLanguage="python"
                            language={selectedAssignment.language === 'python' ? 'python' : 'javascript'}
                            theme="vs-dark"
                            value={code}
                            onChange={setCode}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 15,
                                fontFamily: "'JetBrains Mono', monospace",
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 32, bottom: 32 },
                                lineNumbers: 'on',
                                renderLineHighlight: 'all',
                                cursorSmoothCaretAnimation: 'on',
                                smoothScrolling: true,
                                contextmenu: false,
                                quickSuggestions: true
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER ASSIGNMENT LIST ---
    if (viewMode === 'assignments') {
        return (
            <div style={containerStyle}>
                <button onClick={handleBack} style={{
                    background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer',
                    marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px',
                    transition: 'color 0.2s'
                }}>
                    <FaArrowLeft /> Back to Courses
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '700', background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            {selectedCourse?.name}
                        </h2>
                        <div style={{ color: '#64748b', marginTop: '4px', fontSize: '14px' }}>{selectedCourse?.code} • {selectedCourse?.semester}</div>
                    </div>
                </div>

                {assignments.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '60px', background: 'rgba(255,255,255,0.02)',
                        borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)'
                    }}>
                        <FaBook size={40} color="#334155" style={{ marginBottom: '16px' }} />
                        <div style={{ color: '#94a3b8', fontSize: '16px' }}>No assignments posted yet.</div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                        {assignments.map(a => {
                            const submission = submissions.find(s => s.assignmentId?._id === a._id);
                            const isSubmitted = !!submission;

                            return (
                                <motion.div
                                    key={a._id}
                                    whileHover={{ y: -5, boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' }}
                                    onClick={() => openAssignment(a)}
                                    style={{
                                        ...cardStyle,
                                        borderLeft: `4px solid ${isSubmitted ? '#10b981' : (a.language === 'python' ? '#3b82f6' : '#f59e0b')}`,
                                        opacity: isSubmitted ? 0.9 : 1
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assignment</span>
                                            {isSubmitted && (
                                                <span style={{ padding: '2px 8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '12px', fontSize: '10px', fontWeight: '800' }}>SUBMITTED</span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 'bold' }}>
                                            {isSubmitted
                                                ? (() => { const m = calcMarks(submission.score, submission.maxScore, submission.assignmentId?.maxPoints || a.maxPoints); return `${m.earned}/${m.fullMarks}`; })()
                                                : `${Math.round((a.maxPoints || 100) / 10)}`
                                            } Marks
                                        </span>
                                    </div>
                                    <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#f8fafc' }}>{a.title}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                                        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <FaCode size={10} /> {a.language}
                                        </span>
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>•</span>
                                        <span style={{ fontSize: '12px', color: isSubmitted ? '#10b981' : '#94a3b8', fontWeight: isSubmitted ? '700' : '400' }}>
                                            {isSubmitted
                                                ? (() => { const m = calcMarks(submission.score, submission.maxScore, submission.assignmentId?.maxPoints || a.maxPoints); return `Scored ${m.earned}/${m.fullMarks} Marks`; })()
                                                : `Due: ${a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'No Deadline'}`
                                            }
                                        </span>
                                    </div>
                                    <div style={{ position: 'absolute', bottom: '24px', right: '24px', opacity: isSubmitted ? 0.4 : 0.2 }}>
                                        {isSubmitted ? <FaCheckCircle size={40} color="#10b981" /> : <FaRocket size={40} />}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // --- RENDER COURSE LIST (DASHBOARD HOME) ---
    return (
        <div style={containerStyle}>
            {/* --- LAB BANNER --- */}
            {activeSessionId && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.2))',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        padding: '16px 24px', borderRadius: '12px', marginBottom: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        boxShadow: '0 4px 20px rgba(239, 68, 68, 0.1)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%' }}></div>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%', animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}></div>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, color: '#fca5a5', fontSize: '16px' }}>Live Lab Session Active</h3>
                            <div style={{ fontSize: '13px', color: '#fecaca', opacity: 0.8 }}>Your instructor has started a monitored lab session.</div>
                        </div>
                    </div>
                    <button
                        onClick={onEnterLab}
                        style={{
                            background: '#ef4444', color: '#fff', border: 'none',
                            padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
                            fontWeight: '600', fontSize: '14px', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                            transition: 'transform 0.2s', display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        Join Session <FaArrowLeft style={{ transform: 'rotate(180deg)' }} />
                    </button>
                </motion.div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <h2 style={{ marginBottom: '8px', fontSize: '32px', fontWeight: '800', background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        My Learning
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '16px', margin: 0 }}>Access your enrolled courses, assignments, and labs.</p>
                </div>
                <button
                    onClick={onBack}
                    style={{
                        padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer',
                        fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                    <FaCode /> Open Personal Workspace
                </button>
            </div>

            {courses.length === 0 ? (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '80px', background: 'rgba(255,255,255,0.02)', borderRadius: '24px',
                    border: '1px dashed rgba(255,255,255,0.1)'
                }}>
                    <div style={{ width: '80px', height: '80px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                        <FaRobot size={40} color="#3b82f6" />
                    </div>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#e2e8f0' }}>No Courses Found</h3>
                    <p style={{ color: '#94a3b8', textAlign: 'center', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
                        You haven't been enrolled in any courses yet. Contact your faculty administrator to get added to a batch.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
                    {courses.map(course => (
                        <motion.div
                            key={course._id}
                            onClick={() => handleCourseClick(course)}
                            whileHover={{ y: -5, boxShadow: '0 20px 40px -20px rgba(0,0,0,0.6)' }}
                            style={cardStyle}
                        >
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>{course.code}</span>
                                <span style={{ color: '#64748b', fontSize: '12px' }}>{course.semester}</span>
                            </div>
                            <h3 style={{ fontSize: '22px', margin: '0 0 12px 0', color: '#f8fafc', fontWeight: '700' }}>{course.name}</h3>
                            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {course.description || "No description provided."}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '-8px' }}>
                                    {[1, 2, 3].map(i => (
                                        <div key={i} style={{ width: '24px', height: '24px', borderRadius: '50%', background: `rgba(255,255,255,0.${i + 1})`, border: '2px solid #0f172a', marginLeft: i > 0 ? '-8px' : 0 }}></div>
                                    ))}
                                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>Students Enrolled</span>
                                </div>
                                <div style={{ color: '#3b82f6', fontSize: '20px' }}><FaArrowLeft style={{ transform: 'rotate(180deg)' }} /></div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Inline Style for Ping Animation */}
            <style>
                {`
                @keyframes ping {
                    75%, 100% { transform: scale(2); opacity: 0; }
                }
                `}
            </style>
        </div>
    );
};

export default StudentAssignmentView;
