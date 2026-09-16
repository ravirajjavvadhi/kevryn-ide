import React, { useState, useEffect } from 'react';
import {
    FaDesktop, FaClipboardList, FaTasks, FaChartLine, FaSignOutAlt, 
    FaCalendarAlt, FaTimes, FaSpinner, FaRocket, FaFilePdf, FaBook, FaRobot
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import MonitorDashboard from './MonitorDashboard';
import AssignmentManager from './AssignmentManager';
import AptitudeManager from './AptitudeManager';
import StudentReports from './StudentReports';
import LabReports from './LabReports';
import TimetableWidget from './TimetableWidget';
import FacultyAssistant from './FacultyAssistant';
import axios from 'axios';

const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_FALLBACK = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const FacultyHub = ({ token, SERVER_URL: serverUrl, userId, onLogout }) => {
    // Top-Level State
    const [facultyName, setFacultyName] = useState('Faculty');
    const [collegeName, setCollegeName] = useState(localStorage.getItem('collegeName') || null);
    const [time, setTime] = useState(new Date());
    
    // Schedule & Master Context
    const [schedule, setSchedule] = useState([]);
    const [masterContextId, setMasterContextId] = useState("");
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
    const [startingLab, setStartingLab] = useState(false);

    // Overlay Engine
    const [activeOverlay, setActiveOverlay] = useState(null); // 'monitor', 'assignments', 'aptitude', 'reports'

    const api = axios.create({ baseURL: serverUrl || SERVER_FALLBACK, headers: { Authorization: token } });

    useEffect(() => {
        try {
            const payload = JSON.parse(atob(token.replace('Bearer ', '').split('.')[1]));
            if (payload.username) setFacultyName(payload.username);
            
            if (!localStorage.getItem('collegeName')) {
                api.get('/api/college/my').then(res => {
                    if (res.data.college) {
                        setCollegeName(res.data.college.name);
                        localStorage.setItem('collegeName', res.data.college.name);
                    }
                });
            }
        } catch (e) { }
    }, [token, serverUrl]);

    useEffect(() => {
        const fetchSchedule = async () => {
            try {
                const res = await api.get('/api/timetable/my-schedule/faculty');
                setSchedule(res.data || []);
            } catch (err) {
                console.error("Failed to load schedule", err);
            } finally {
                setIsLoadingSchedule(false);
            }
        };
        fetchSchedule();
    }, [token]);

    const today = time.toLocaleDateString('en-US', { weekday: 'long' });
    const todaysClasses = schedule.filter(s => s.dayOfWeek === today);
    const selectedClass = schedule.find(s => s._id === masterContextId);

    const handleStartLab = async () => {
        if (!masterContextId) return;

        const isScheduledToday = todaysClasses.some(c => c._id === masterContextId);
        if (!isScheduledToday) {
            const confirmUnscheduled = window.confirm("Cohort not scheduled today. Override and launch live session?");
            if (!confirmUnscheduled) return;
        }

        try {
            setStartingLab(true);
            // Auto-create/start the lab session for this timetable context
            await api.post(`/api/timetable/start-lab/${masterContextId}`);
            setActiveOverlay('monitor');
        } catch (err) {
            console.error("Failed to start lab via timetable", err);
            // If it's already active, just open it
            if (err.response?.status === 400 && err.response.data.error.includes("active")) {
                setActiveOverlay('monitor');
            } else {
                alert(err.response?.data?.error || "Failed to start lab");
            }
        } finally {
            setStartingLab(false);
        }
    };

    // --- GATEWAY CARD COMPONENT ---
const GatewayCard = ({ title, desc, icon, color, onClick }) => (
    <div 
        onClick={onClick}
        style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid ' + color + '40',
            borderRadius: '24px',
            padding: '40px',
            cursor: 'pointer',
            textAlign: 'center',
            width: '320px',
            transition: 'all 0.3s ease',
            boxShadow: '0 0 30px ' + color + '10',
            backdropFilter: 'blur(10px)'
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.boxShadow = '0 0 50px ' + color + '30';
            e.currentTarget.style.border = '1px solid ' + color;
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 0 30px ' + color + '10';
            e.currentTarget.style.border = '1px solid ' + color + '40';
        }}
    >
        <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: color + '15', color: color, fontSize: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
            {icon}
        </div>
        <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '24px', fontWeight: '800' }}>{title}</h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '15px', lineHeight: '1.5' }}>{desc}</p>
    </div>
);

    // --- RENDERERS ---

    const renderOverlay = () => {
        if (!activeOverlay) return null;

        // Faculty Intelligence owns its own centred modal and backdrop. Keeping
        // it outside the legacy full-screen command overlay makes it match the
        // Management Intelligence experience instead of looking like a page.
        if (activeOverlay === 'ai-assistant') {
            return <FacultyAssistant token={token} serverUrl={serverUrl} onClose={() => setActiveOverlay(null)} />;
        }

        const overlayVariants = {
            hidden: { opacity: 0, scale: 0.98 },
            visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut" } },
            exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } }
        };

        const renderComponent = () => {
            switch(activeOverlay) {
                case 'monitor': return <MonitorDashboard token={token} serverUrl={serverUrl} userId={userId} isEmbedded={true} onOpenSessionReports={() => setActiveOverlay('reports')} onOpenGeneralReports={() => setActiveOverlay('general-reports')} />;
                case 'assignments': return <AssignmentManager token={token} serverUrl={serverUrl} userId={userId} preSelectedCohort={selectedClass} />;
                case 'aptitude': return <AptitudeManager token={token} serverUrl={serverUrl} userId={userId} preSelectedCohort={selectedClass} />;
                case 'reports': return <LabReports token={token} serverUrl={serverUrl} onClose={() => setActiveOverlay(null)} preSelectedCohort={selectedClass} />;
                case 'general-reports': return <StudentReports token={token} serverUrl={serverUrl} onClose={() => setActiveOverlay(null)} preSelectedCohort={selectedClass} />;
                case 'assessments-gateway':
                    return (
                        <div style={{ padding: '60px', display: 'flex', gap: '32px', justifyContent: 'center', alignItems: 'center', height: '100%', flexWrap: 'wrap' }}>
                            <GatewayCard title="Distribute Assignments" desc="Push coding tasks to this specific batch" icon={<FaClipboardList/>} color="#f59e0b" onClick={() => setActiveOverlay('assignments')} />
                            <GatewayCard title="Conduct Aptitude Test" desc="Start live quiz & assessments" icon={<FaTasks/>} color="#8b5cf6" onClick={() => setActiveOverlay('aptitude')} />
                        </div>
                    );
                case 'reports-gateway':
                    return (
                        <div style={{ padding: '60px', display: 'flex', gap: '32px', justifyContent: 'center', alignItems: 'center', height: '100%', flexWrap: 'wrap' }}>
                            <GatewayCard title="Session Reports" desc="Generate PDF logs & session analytics" icon={<FaFilePdf/>} color="#10b981" onClick={() => setActiveOverlay('reports')} />
                            <GatewayCard title="General Profiles" desc="Analyze student profiles & gradebook" icon={<FaChartLine/>} color="#0ea5e9" onClick={() => setActiveOverlay('general-reports')} />
                        </div>
                    );
                default: return null;
            }
        };

        return (
            <motion.div 
                initial="hidden" animate="visible" exit="exit" variants={overlayVariants}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'var(--bg-primary, #000000)',
                    display: 'flex', flexDirection: 'column'
                }}
            >
                <div style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            {selectedClass ? `${selectedClass.subjectName} (${selectedClass.department} ${selectedClass.year}-${selectedClass.section})` : 'Command Overlay'}
                        </div>
                    </div>
                    <button onClick={() => setActiveOverlay(null)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                        <FaTimes /> Close Environment
                    </button>
                </div>
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    {renderComponent()}
                </div>
            </motion.div>
        );
    };

    const actionBlocks = [
        { id: 'monitor', label: 'Launch Live Lab', desc: 'Initialize telemetry & student monitoring', icon: <FaRocket />, color: '#ef4444', glow: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', action: handleStartLab, loading: startingLab },
        { id: 'assessments', label: 'Assessments & Tasks', desc: 'Manage coding assignments & live aptitude tests', icon: <FaClipboardList />, color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.3)', action: () => setActiveOverlay('assessments-gateway') },
        { id: 'reports', label: 'Analytics & Reports', desc: 'View session logs & analyze student profiles', icon: <FaChartLine />, color: '#10b981', glow: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', action: () => setActiveOverlay('reports-gateway') }
    ];

    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', color: '#e2e8f0', fontFamily: "'Outfit', 'Inter', sans-serif", overflow: 'hidden' }}>
            
            {/* 1. TOP NAVBAR (Single Page Paradigm) */}
            <header style={{ padding: '16px 32px', background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img src="/logo.png?v=4" alt="KevRyn Logo" style={{ height: '36px', filter: 'drop-shadow(0 0 10px rgba(99,102,241,0.4))' }} />
                    <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px' }}>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.5px' }}>Faculty Command Center</div>
                        <div style={{ fontSize: '12px', color: '#818cf8', fontWeight: '600', letterSpacing: '1px' }}>{time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff' }}>{facultyName}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{collegeName || 'Instructor'}</div>
                    </div>
                    <button onClick={onLogout} style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold' }}>
                        <FaSignOutAlt /> Logout
                    </button>
                </div>
            </header>

            {/* 2. MASTER DROPDOWN BAR */}
            <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px', zIndex: 5 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Global Context:</div>
                <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
                    <select 
                        value={masterContextId} 
                        onChange={(e) => setMasterContextId(e.target.value)}
                        style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', fontSize: '16px', fontWeight: '600', outline: 'none', cursor: 'pointer', appearance: 'none', boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)' }}
                    >
                        <option value="">-- Select Global Context (Course & Cohort) --</option>
                          {todaysClasses.length > 0 && (
                              <optgroup label="Today's Labs">
                                  {todaysClasses.map(cls => (
                                      <option key={cls._id} value={cls._id}>
                                          {cls.subjectName} ({cls.subjectCode}) | {cls.department} Y{cls.year}-S{cls.section} | {cls.startTime}-{cls.endTime}
                                      </option>
                                  ))}
                              </optgroup>
                          )}
                          <optgroup label="All Scheduled Cohorts (Weekly)">
                              {schedule.filter(cls => !todaysClasses.find(t => t._id === cls._id)).map(cls => (
                                  <option key={cls._id} value={cls._id}>
                                      {cls.subjectName} ({cls.subjectCode}) | {cls.department} Y{cls.year}-S{cls.section} | {cls.dayOfWeek}
                                  </option>
                              ))}
                          </optgroup></select>
                    {/* Custom Arrow */}
                    <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#3b82f6' }}>▼</div>
                </div>
                {todaysClasses.length === 0 && !isLoadingSchedule && (
                    <div style={{ fontSize: '13px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        No assigned classes today, but you can select any cohort to manage assignments.
                    </div>
                )}
            </div>

            {/* 3. MAIN WORKSPACE */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', position: 'relative' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

                    {/* INITIAL STATE: Schedule View (when no context is selected) */}
                    <AnimatePresence mode="wait">
                        {!masterContextId ? (
                            <motion.div key="schedule" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}>
                                  
                                  {/* NEW GLOBAL MCP AI ASSISTANT WIDGET */}
                                  <div 
                                      onClick={() => setActiveOverlay('ai-assistant')}
                                      style={{
                                          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 27, 75, 0.9))',
                                          border: '1px solid rgba(236, 72, 153, 0.3)',
                                          borderRadius: '24px',
                                          padding: '24px 32px',
                                          display: 'flex',
                                          flexWrap: 'wrap',
                                          alignItems: 'center',
                                          gap: '24px',
                                          cursor: 'pointer',
                                          boxShadow: '0 0 30px rgba(236, 72, 153, 0.1)',
                                          marginBottom: '32px',
                                          position: 'relative',
                                          overflow: 'hidden',
                                          backdropFilter: 'blur(10px)'
                                      }}
                                      onMouseEnter={(e) => {
                                          e.currentTarget.style.boxShadow = '0 0 40px rgba(236, 72, 153, 0.3)';
                                          e.currentTarget.style.transform = 'translateY(-2px)';
                                          e.currentTarget.style.transition = 'all 0.3s ease';
                                      }}
                                      onMouseLeave={(e) => {
                                          e.currentTarget.style.boxShadow = '0 0 30px rgba(236, 72, 153, 0.1)';
                                          e.currentTarget.style.transform = 'translateY(0)';
                                      }}
                                  >
                                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #ec4899, #8b5cf6, #3b82f6)' }}></div>
                                      <div style={{ width: '64px', height: '64px', background: 'rgba(236, 72, 153, 0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: '#ec4899', boxShadow: '0 0 20px rgba(236, 72, 153, 0.2)' }}>
                                          <FaRobot />
                                      </div>
                                      <div style={{ flex: 1, minWidth: '250px' }}>
                                          <div style={{ fontSize: '20px', fontWeight: '900', color: '#f8fafc', marginBottom: '6px', letterSpacing: '0.5px' }}>Global MCP AI Assistant</div>
                                          <div style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.5' }}>
                                              Click to open the chat panel. Ask the AI to analyze student performance, generate assignments, or fetch data across <strong style={{ color: '#fff' }}>all your cohorts and sections</strong> instantly.
                                          </div>
                                      </div>
                                      <div style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', padding: '12px 24px', borderRadius: '12px', color: '#fff', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 15px rgba(236, 72, 153, 0.3)', whiteSpace: 'nowrap' }}>
                                          Open Chat &rarr;
                                      </div>
                                  </div>

                                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px', backdropFilter: 'blur(10px)' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#e2e8f0', margin: '0 0 24px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>Your Weekly Timetable</h3>
                                    <TimetableWidget token={token} serverUrl={serverUrl} onLabStarted={(session) => { setMasterContextId(session.timetableId || session.timetableRef); setActiveOverlay('monitor'); }} />
                                </div>
                            </motion.div>
                        ) : (
                            /* ACTIVE STATE: Action Blocks (when context IS selected) */
                            <motion.div key="actions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}>
                                
                                <div style={{ marginBottom: '32px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.05))', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ width: '56px', height: '56px', background: '#3b82f6', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#fff', boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>
                                        <FaBook />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Active Context</div>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>{selectedClass?.subjectName}</div>
                                        <div style={{ fontSize: '14px', color: '#818cf8', fontWeight: '600' }}>Target: {selectedClass?.department} Year {selectedClass?.year} Section {selectedClass?.section}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                                    {actionBlocks.map((block) => (
                                        <motion.div 
                                            key={block.id}
                                            whileHover={{ y: -5, scale: 1.02 }}
                                            onClick={block.loading ? null : block.action}
                                            style={{ 
                                                background: `linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))`, 
                                                border: `1px solid ${block.border}`, 
                                                borderRadius: '24px', 
                                                padding: '32px 24px', 
                                                cursor: block.loading ? 'wait' : 'pointer',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                boxShadow: `0 10px 30px -10px ${block.glow}`
                                            }}
                                        >
                                            <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: `radial-gradient(circle, ${block.glow}, transparent 70%)`, borderRadius: '50%', zIndex: 0 }} />
                                            
                                            <div style={{ position: 'relative', zIndex: 1 }}>
                                                <div style={{ fontSize: '32px', color: block.color, marginBottom: '20px' }}>
                                                    {block.loading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><FaSpinner /></motion.div> : block.icon}
                                                </div>
                                                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#f8fafc', margin: '0 0 8px 0' }}>{block.label}</h3>
                                                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', lineHeight: '1.5' }}>{block.desc}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>
            </div>

            {/* OVERLAY ENGINE */}
            <AnimatePresence>
                {renderOverlay()}
            </AnimatePresence>

        </div>
    );
};

export default FacultyHub;










