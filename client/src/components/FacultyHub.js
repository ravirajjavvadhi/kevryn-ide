import React, { useState, useEffect } from 'react';
import {
    FaChalkboardTeacher, FaCode, FaChartLine, FaSignOutAlt, FaBookOpen,
    FaUserGraduate, FaClipboardList, FaDesktop, FaTachometerAlt,
    FaBell, FaShieldAlt, FaEye
} from 'react-icons/fa';
import MonitorDashboard from './MonitorDashboard';
import CourseManager from './CourseManager';
import AssignmentManager from './AssignmentManager';
import Gradebook from './Gradebook';
import StudentReports from './StudentReports';
import axios from 'axios';

// Fallback local constants
const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_FALLBACK = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const LiveClock = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return <span>{time.toLocaleTimeString()}</span>;
};

const Skeleton = ({ width = '100%', height = '20px', borderRadius = '4px', margin = '0' }) => (
    <div style={{
        width, height, borderRadius, margin,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s infinite linear'
    }} />
);

const FacultyHub = ({ token, SERVER_URL: serverUrl, userId, onLogout }) => {
    const [activeView, setActiveView] = useState(localStorage.getItem('facultyActiveView') || 'dashboard');
    const [stats, setStats] = useState({ courses: 0, students: 0, activeSessions: 0 });
    const [facultyName, setFacultyName] = useState('Faculty');
    const [collegeName, setCollegeName] = useState(localStorage.getItem('collegeName') || null);
    const [isLoading, setIsLoading] = useState(true);
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        localStorage.setItem('facultyActiveView', activeView);
    }, [activeView]);

    // The 1s timer for 'time' state is removed from here as per instruction.
    // The 'time' state will now only update on component mount or other re-renders,
    // which is sufficient for greeting and dashboard date display.

    const refreshStats = async () => {
        if (!token) return;
        setIsLoading(true);
        const api = axios.create({ baseURL: serverUrl || SERVER_FALLBACK, headers: { Authorization: token } });
        try {
            const [courseRes, sessionRes] = await Promise.all([
                api.get('/api/courses'),
                api.get('/lab/active-session')
            ]);
            setStats({
                courses: courseRes.data.length,
                students: 0, // Mock student count for now or fetch if available
                activeSessions: sessionRes.data.session ? 1 : 0
            });
        } catch (e) {
            console.error("Stats Fetch Error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshStats();
        // Try to get faculty info from token
        try {
            const payload = JSON.parse(atob(token.replace('Bearer ', '').split('.')[1]));
            if (payload.username) setFacultyName(payload.username);
            
            // Fetch college info if not in localStorage
            if (!localStorage.getItem('collegeName')) {
                const api = axios.create({ baseURL: serverUrl || SERVER_FALLBACK, headers: { Authorization: token } });
                api.get('/api/college/my').then(res => {
                    if (res.data.college) {
                        setCollegeName(res.data.college.name);
                        localStorage.setItem('collegeName', res.data.college.name);
                    }
                });
            }
        } catch (e) { }
    }, [token, serverUrl]);

    const greeting = () => {
        const h = time.getHours();
        if (h < 12) return 'Good Morning';
        if (h < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    return (
        <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#060b17', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

            {/* === SIDEBAR === */}
            <div style={{
                width: '240px', minWidth: '240px', display: 'flex', flexDirection: 'column',
                background: 'linear-gradient(180deg, #0d1526 0%, #0a1020 100%)',
                borderRight: '1px solid rgba(99,102,241,0.2)',
                boxShadow: '4px 0 30px rgba(0,0,0,0.5)'
            }}>
                {/* Logo */}
                <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 20px rgba(99,102,241,0.5)'
                        }}>
                            <FaShieldAlt color="#fff" size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: '800', color: '#f1f5f9', letterSpacing: '-0.3px' }}>Vayu</div>
                            <div style={{ fontSize: '10px', color: '#6366f1', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Faculty Command</div>
                        </div>
                    </div>
                </div>

                {/* Faculty Info */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '34px', height: '34px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', fontWeight: '700', color: '#fff',
                            flexShrink: 0
                        }}>
                            {facultyName[0]?.toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{facultyName}</div>
                            {collegeName ? (
                                <div style={{ fontSize: '9px', color: '#818cf8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {collegeName.substring(0, 20)}{collegeName.length > 20 ? '...' : ''}
                                </div>
                            ) : (
                                <div style={{ fontSize: '10px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '5px', height: '5px', background: '#4ade80', borderRadius: '50%', display: 'inline-block' }}></span>
                                    Online
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
                    <NavSection label="Overview">
                        <NavItem icon={<FaTachometerAlt />} label="Dashboard" isActive={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
                    </NavSection>
                    <NavSection label="Management">
                        <NavItem icon={<FaBookOpen />} label="My Courses" isActive={activeView === 'courses'} onClick={() => setActiveView('courses')} />
                        <NavItem icon={<FaClipboardList />} label="Assignments" isActive={activeView === 'assignments'} onClick={() => setActiveView('assignments')} />
                        <NavItem icon={<FaUserGraduate />} label="Gradebook" isActive={activeView === 'analytics'} onClick={() => setActiveView('analytics')} />
                    </NavSection>
                    <NavSection label="Lab Control">
                        <NavItem icon={<FaEye />} label="Live Monitor" isActive={activeView === 'active-labs'} onClick={() => setActiveView('active-labs')} badge={stats.activeSessions > 0 ? 'LIVE' : null} />
                        <NavItem icon={<FaChartLine />} label="Reports" isActive={activeView === 'reports'} onClick={() => setActiveView('reports')} />
                    </NavSection>
                </nav>

                {/* Bottom */}
                <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', color: '#475569', textAlign: 'center', marginBottom: '10px' }}>
                        <LiveClock />
                    </div>
                    <button onClick={onLogout} style={{
                        width: '100%', padding: '9px', background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444',
                        borderRadius: '8px', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', gap: '8px',
                        fontSize: '13px', fontWeight: '600', transition: 'all 0.2s'
                    }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                    >
                        <FaSignOutAlt /> Logout
                    </button>
                </div>
            </div>

            {/* === MAIN CONTENT === */}
            <div style={{ flex: 1, overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {activeView === 'dashboard' && (
                    isLoading ? (
                        <div style={{ padding: '40px' }}>
                            <Skeleton width="200px" height="30px" margin="0 0 20px 0" />
                            <Skeleton height="150px" borderRadius="16px" margin="0 0 40px 0" />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <Skeleton height="100px" borderRadius="16px" />
                                <Skeleton height="100px" borderRadius="16px" />
                            </div>
                        </div>
                    ) : (
                        <FacultyDashboardHome
                            greeting={greeting()}
                            facultyName={facultyName}
                            stats={stats}
                            time={time}
                            onNavigate={setActiveView}
                        />
                    )
                )}
                {activeView === 'courses' && <CourseManager token={token} serverUrl={serverUrl} userId={userId} />}
                {activeView === 'assignments' && <AssignmentManager token={token} serverUrl={serverUrl} userId={userId} />}
                {activeView === 'active-labs' && <MonitorDashboard token={token} serverUrl={serverUrl} userId={userId} onLogout={onLogout} isEmbedded={true} onSessionChange={refreshStats} />}
                {activeView === 'analytics' && <Gradebook token={token} serverUrl={serverUrl} />}
                {activeView === 'reports' && <StudentReports token={token} serverUrl={serverUrl} />}
            </div>
        </div>
    );
};

/* ── Sub-components ── */

const NavSection = ({ label, children }) => (
    <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '9px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px', paddingLeft: '8px' }}>{label}</div>
        {children}
    </div>
);

const NavItem = ({ icon, label, isActive, onClick, badge }) => (
    <div onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
        borderRadius: '8px', cursor: 'pointer', marginBottom: '2px',
        background: isActive ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))' : 'transparent',
        border: isActive ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
        color: isActive ? '#a5b4fc' : '#64748b',
        fontWeight: isActive ? '600' : '400',
        transition: 'all 0.15s',
        position: 'relative'
    }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
        <span style={{ fontSize: '13px' }}>{icon}</span>
        <span style={{ fontSize: '13px', flex: 1 }}>{label}</span>
        {badge && (
            <span style={{
                fontSize: '9px', fontWeight: '800', padding: '2px 6px', borderRadius: '8px',
                background: badge === 'LIVE' ? '#ef4444' : '#6366f1', color: '#fff', letterSpacing: '0.5px',
                animation: badge === 'LIVE' ? 'pulse 2s infinite' : 'none'
            }}>{badge}</span>
        )}
    </div>
);

const FacultyDashboardHome = ({ greeting, facultyName, stats, time, onNavigate }) => {
    const quickActions = [
        { label: 'Start Live Lab', icon: <FaDesktop />, view: 'active-labs', color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)', desc: 'Monitor students in real-time' },
        { label: 'My Courses', icon: <FaBookOpen />, view: 'courses', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)', desc: 'Manage your course roster' },
        { label: 'Assignments', icon: <FaClipboardList />, view: 'assignments', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', desc: 'Create & review assignments' },
        { label: 'Student Reports', icon: <FaChartLine />, view: 'reports', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)', desc: 'View lab activity reports' },
    ];

    const statCards = [
        { label: 'Courses', value: stats.courses, icon: <FaBookOpen />, color: '#3b82f6' },
        { label: 'Live Sessions', value: stats.activeSessions, icon: <FaDesktop />, color: stats.activeSessions > 0 ? '#ef4444' : '#64748b', pulse: stats.activeSessions > 0 },
        { label: 'Today', value: time.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), icon: <FaChartLine />, color: '#10b981' },
    ];

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '40px', background: 'linear-gradient(135deg, #060b17 0%, #0a1020 100%)' }}>
            <style>{`
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
                @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
                @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
                .quick-card:hover { transform: translateY(-4px) !important; box-shadow: 0 20px 40px rgba(0,0,0,0.4) !important; }
                .quick-card { transition: transform 0.2s, box-shadow 0.2s; }
            `}</style>

            {/* Header */}
            <div style={{ marginBottom: '40px', animation: 'fadeUp 0.5s ease' }}>
                <div style={{ fontSize: '13px', color: '#6366f1', fontWeight: '600', marginBottom: '8px', letterSpacing: '0.5px' }}>
                    {time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <h1 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 8px 0', color: '#f8fafc', letterSpacing: '-1px' }}>
                    {greeting}, <span style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{facultyName}</span> 👋
                </h1>
                <p style={{ color: '#64748b', fontSize: '15px', margin: 0 }}>Welcome to your faculty command center. Here's your overview.</p>
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px', animation: 'fadeUp 0.5s ease 0.1s both' }}>
                {statCards.map((s, i) => (
                    <div key={i} style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                                <div style={{ fontSize: '32px', fontWeight: '800', color: s.color, lineHeight: 1, animation: s.pulse ? 'pulse 2s infinite' : 'none' }}>{s.value}</div>
                            </div>
                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: '18px' }}>
                                {s.icon}
                            </div>
                        </div>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${s.color}00, ${s.color}60, ${s.color}00)` }} />
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div style={{ animation: 'fadeUp 0.5s ease 0.2s both' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>Quick Actions</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    {quickActions.map((a, i) => (
                        <div key={i} className="quick-card" onClick={() => onNavigate(a.view)} style={{
                            background: 'rgba(255,255,255,0.03)', border: `1px solid ${a.color}25`,
                            borderRadius: '16px', padding: '24px', cursor: 'pointer', position: 'relative', overflow: 'hidden'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '14px',
                                    background: a.gradient, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: '20px', color: '#fff',
                                    boxShadow: `0 8px 20px ${a.color}40`, flexShrink: 0
                                }}>{a.icon}</div>
                                <div>
                                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#f1f5f9', marginBottom: '4px' }}>{a.label}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>{a.desc}</div>
                                </div>
                            </div>
                            <div style={{ position: 'absolute', top: 0, right: 0, width: '80px', height: '80px', background: `radial-gradient(circle, ${a.color}10, transparent)`, borderRadius: '50%', transform: 'translate(20px,-20px)' }} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature Highlights */}
            <div style={{ marginTop: '40px', animation: 'fadeUp 0.5s ease 0.3s both' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>Live Lab Capabilities</h3>
                <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', padding: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        {[
                            { icon: '👁️', label: 'Real-time Code View', desc: 'See every student\'s screen live' },
                            { icon: '🔴', label: 'Tab Switch Alerts', desc: 'Know when students leave the tab' },
                            { icon: '📋', label: 'Paste Detection', desc: 'Flag suspicious copy-paste activity' },
                            { icon: '🎯', label: 'Attention Score', desc: 'AI-computed focus metric 0-100' },
                            { icon: '📢', label: 'Broadcast', desc: 'Send announcements to all students' },
                            { icon: '✋', label: 'Raise Hand', desc: 'Students can request help instantly' },
                        ].map((f, i) => (
                            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '20px', flexShrink: 0 }}>{f.icon}</span>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#c7d2fe', marginBottom: '2px' }}>{f.label}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{f.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FacultyHub;
