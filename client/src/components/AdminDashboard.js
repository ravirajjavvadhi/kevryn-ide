
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FaUserShield, FaUsers, FaChartPie, FaExclamationCircle, FaCheckCircle, FaSearch, FaCode, FaSignOutAlt, FaRocket, FaClock } from 'react-icons/fa';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import ParticleBackground from './ParticleBackground';

// --- STYLES & ANIMATIONS ---
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const dashboardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5, staggerChildren: 0.1 } }
};

const cardVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } }
};

const AdminDashboard = ({ token, onLogout }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [stats, setStats] = useState({
        userCounts: [], activeSessions: 0, recentIssues: 0, registrationTrend: []
    });
    const [users, setUsers] = useState([]);
    const [issues, setIssues] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [showWelcome, setShowWelcome] = useState(true);

    // API Instance
    const api = axios.create({
        baseURL: (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim().startsWith('http')
            ? (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim()
            : `https://${(process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim()}`,
        headers: { Authorization: token }
    });

    // Fetch Data
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [statsRes, issuesRes] = await Promise.all([
                api.get('/api/admin/analytics'),
                api.get('/api/admin/issues')
            ]);
            console.log("Stats Data:", statsRes.data); // Debug

            // Validate Data Structures to prevent crashes
            const safeStats = {
                userCounts: statsRes.data.userCounts || [],
                activeSessions: statsRes.data.activeSessions || 0,
                recentIssues: statsRes.data.recentIssues || 0,
                registrationTrend: statsRes.data.registrationTrend || []
            };

            setStats(safeStats);
            setIssues(issuesRes.data || []);
        } catch (e) {
            console.error("Failed to fetch admin data", e);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await api.get(`/api/admin/users?search=${searchQuery}`);
            setUsers(res.data);
        } catch (e) { console.error("User fetch failed", e); }
    };

    useEffect(() => {
        // Initial Load
        fetchData();

        // Welcome Animation Timer
        const timer = setTimeout(() => setShowWelcome(false), 2500);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (activeTab === 'overview') fetchData();
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'issues') fetchData();
    }, [activeTab, searchQuery]);

    const toggleFacultyStatus = async (userId, currentStatus) => {
        try {
            await api.patch(`/api/admin/users/${userId}/status`, { isFacultyActive: !currentStatus });
            fetchUsers();
        } catch (e) { alert(e.message); }
    };

    const changeUserRole = async (userId, newRole) => {
        if (!window.confirm(`Are you sure you want to change this user's role to ${newRole.toUpperCase()}?`)) return;
        try {
            await api.patch(`/api/admin/users/${userId}/role`, { role: newRole });
            fetchUsers();
            fetchData(); // Refresh stats too
        } catch (e) { alert(e.message); }
    };

    // --- RENDER ---
    return (
        <div style={{
            width: '100vw', height: '100vh',
            background: '#050505', color: '#e0e0e0',
            fontFamily: "'Rajdhani', sans-serif", overflow: 'hidden',
            display: 'flex', position: 'relative'
        }}>
            <ParticleBackground />

            {/* WELCOME OVERLAY */}
            <AnimatePresence>
                {showWelcome && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, pointerEvents: 'none' }}
                        transition={{ duration: 1 }}
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            background: '#000', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center',
                            flexDirection: 'column'
                        }}
                    >
                        <motion.h1
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.2, opacity: 1 }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            style={{ fontSize: '80px', fontWeight: '900', color: '#fff', letterSpacing: '10px' }}
                        >
                            KEVRYN
                        </motion.h1>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '200px' }}
                            transition={{ delay: 0.5, duration: 1 }}
                            style={{ height: '4px', background: '#00d4ff', marginTop: '20px' }}
                        />
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1, duration: 1 }}
                            style={{ color: '#666', marginTop: '10px', letterSpacing: '5px' }}
                        >
                            ADMINISTRATION_SYSTEM_V.1.0
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* SIDEBAR */}
            <motion.div
                initial={{ x: -100 }} animate={{ x: 0 }} transition={{ delay: 2.5 }}
                style={{
                    width: '90px', height: '100%', borderRight: '1px solid rgba(0, 212, 255, 0.1)',
                    backdropFilter: 'blur(20px)', background: 'rgba(0,0,0,0.3)',
                    zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '30px', gap: '30px'
                }}
            >
                <div style={{ fontSize: '30px', color: '#00d4ff', marginBottom: '30px', filter: 'drop-shadow(0 0 10px #00d4ff)' }}><FaUserShield /></div>

                <SidebarIcon icon={<FaChartPie />} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                <SidebarIcon icon={<FaUsers />} label="Users" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
                <SidebarIcon icon={<FaExclamationCircle />} label="Issues" active={activeTab === 'issues'} onClick={() => setActiveTab('issues')} />

                <div style={{ flex: 1 }} />
                <SidebarIcon icon={<FaSignOutAlt />} label="Logout" onClick={onLogout} color="#ff4d4d" />
            </motion.div>

            {/* MAIN CONTENT */}
            <div style={{ flex: 1, zIndex: 10, overflowY: 'auto', padding: '40px' }}>
                {/* STYLISH HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid rgba(0, 212, 255, 0.2)', paddingBottom: '20px' }}>
                    <div style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '4px', color: '#00d4ff', textShadow: '0 0 10px rgba(0, 212, 255, 0.5)' }}>
                        KEVRYN
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ color: '#00d4ff', fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>ADMINISTRATOR</div>
                            <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '16px', letterSpacing: '1px' }}>JAVVADI RAVI RAJ</div>
                        </div>
                        <div style={{
                            width: '45px', height: '45px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #00d4ff, #0088FE)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '20px', boxShadow: '0 0 15px rgba(0, 136, 254, 0.5)'
                        }}>
                            <FaUserShield />
                        </div>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <motion.div key="overview" variants={dashboardVariants} initial="hidden" animate="visible">
                            <h2 style={headerStyle}>SYSTEM OVERVIEW</h2>

                            {/* POWER BI STYLE GRID */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px', marginBottom: '35px' }}>
                                <KPICard title="TOTAL USERS" value={stats.userCounts.reduce((a, b) => a + b.count, 0)} color="#0088FE" icon={<FaUsers />} />
                                <KPICard title="ACTIVE SESSIONS" value={stats.activeSessions} color="#00C49F" icon={<FaRocket />} />
                                <KPICard title="OPEN ISSUES" value={stats.recentIssues} color="#FF8042" icon={<FaExclamationCircle />} />
                                <KPICard title="UPTIME" value="99.9%" color="#FFBB28" icon={<FaClock />} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '25px' }}>
                                <ChartCard title="REGISTRATION TREND (Last 7 Days)">
                                    <ResponsiveContainer width="100%" height={350}>
                                        <AreaChart data={stats.registrationTrend}>
                                            <defs>
                                                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                            <XAxis dataKey="_id" stroke="#666" />
                                            <YAxis stroke="#666" />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Area type="monotone" dataKey="count" stroke="#00d4ff" fillOpacity={1} fill="url(#colorCount)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ChartCard>

                                <ChartCard title="USER DISTRIBUTION">
                                    <ResponsiveContainer width="100%" height={350}>
                                        <PieChart>
                                            <Pie data={stats.userCounts} dataKey="count" nameKey="_id" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} label>
                                                {stats.userCounts.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '20px', fontSize: '12px', color: '#aaa' }}>
                                        {stats.userCounts.map((entry, index) => (
                                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '10px', height: '10px', background: COLORS[index % COLORS.length], borderRadius: '50%' }} />
                                                {(entry._id || 'Unknown').toUpperCase()}
                                            </div>
                                        ))}
                                    </div>
                                </ChartCard>
                            </div>
                        </motion.div>
                    )}

                    {/* USERS TAB */}
                    {activeTab === 'users' && (
                        <motion.div key="users" variants={dashboardVariants} initial="hidden" animate="visible">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                                <h2 style={headerStyle}>USER REGISTRY</h2>
                                <div style={{ position: 'relative' }}>
                                    <FaSearch style={{ position: 'absolute', left: '15px', top: '12px', color: '#00d4ff' }} />
                                    <input
                                        type="text" placeholder="Search Database..."
                                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{
                                            background: 'rgba(0,0,0,0.5)', border: '1px solid #333', padding: '10px 10px 10px 40px',
                                            color: '#fff', borderRadius: '4px', width: '350px', outline: 'none',
                                            boxShadow: '0 0 10px rgba(0,0,0,0.5)'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Glass Table */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(5px)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(0, 212, 255, 0.1)', color: '#00d4ff', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '1px' }}>
                                            <th style={{ padding: '20px' }}>User</th>
                                            <th>Role</th>
                                            <th>Email</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                            <th>Raw Data</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(user => (
                                            <tr key={user._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: '0.2s' }} className="hover-row">
                                                <td style={{ padding: '20px', color: '#fff', fontWeight: 'bold' }}>{user.username}</td>
                                                <td>
                                                    <select
                                                        value={user.role || 'student'}
                                                        onChange={(e) => changeUserRole(user._id, e.target.value)}
                                                        style={{
                                                            padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold',
                                                            background: user.role === 'admin' ? 'rgba(255, 77, 77, 0.2)' : user.role === 'faculty' ? 'rgba(0, 196, 159, 0.2)' : 'rgba(255,255,255,0.1)',
                                                            color: user.role === 'admin' ? '#FF4D4D' : user.role === 'faculty' ? '#00C49F' : '#aaa',
                                                            border: `1px solid ${user.role === 'admin' ? '#FF4D4D' : user.role === 'faculty' ? '#00C49F' : '#444'}`,
                                                            outline: 'none', cursor: 'pointer', appearance: 'none',
                                                            textTransform: 'uppercase'
                                                        }}
                                                    >
                                                        <option value="student" style={{ background: '#111', color: '#fff' }}>STUDENT</option>
                                                        <option value="faculty" style={{ background: '#111', color: '#fff' }}>FACULTY</option>
                                                        <option value="admin" style={{ background: '#111', color: '#fff' }}>ADMIN</option>
                                                    </select>
                                                </td>
                                                <td style={{ color: '#aaa' }}>{user.email || 'N/A'}</td>
                                                <td>
                                                    {user.role === 'faculty' ? (
                                                        <span style={{ color: user.isFacultyActive ? '#00C49F' : '#FFBB28' }}>
                                                            {user.isFacultyActive ? 'ACTIVE' : 'PENDING APPROVAL'}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td>
                                                    {user.role === 'faculty' && (
                                                        <button
                                                            onClick={() => toggleFacultyStatus(user._id, user.isFacultyActive)}
                                                            style={{
                                                                background: user.isFacultyActive ? 'rgba(255,255,255,0.1)' : 'rgba(0, 196, 159, 0.2)',
                                                                color: user.isFacultyActive ? '#aaa' : '#00C49F',
                                                                border: `1px solid ${user.isFacultyActive ? '#444' : '#00C49F'}`,
                                                                padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold',
                                                                transition: '0.2s'
                                                            }}
                                                        >
                                                            {user.isFacultyActive ? 'DEACTIVATE' : 'APPROVE ACCESS'}
                                                        </button>
                                                    )}
                                                </td>
                                                <td>
                                                    <button onClick={() => alert(JSON.stringify(user, null, 2))} style={{ background: 'transparent', border: 'none', color: '#0088FE', cursor: 'pointer', opacity: 0.7 }}>
                                                        <FaCode /> JSON
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}

                    {/* ISSUES TAB */}
                    {activeTab === 'issues' && (
                        <motion.div key="issues" variants={dashboardVariants} initial="hidden" animate="visible">
                            <h2 style={headerStyle}>ISSUE TRACKER</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                                {issues.length === 0 && <div style={{ color: '#666', gridColumn: 'span 2' }}>No active issues reported. System healthy.</div>}
                                {issues.map(issue => (
                                    <motion.div
                                        key={issue._id} variants={cardVariants}
                                        style={{
                                            background: 'rgba(255, 77, 77, 0.05)', borderLeft: '4px solid #FF4D4D',
                                            borderTop: '1px solid rgba(255, 77, 77, 0.1)', borderRight: '1px solid rgba(255, 77, 77, 0.1)', borderBottom: '1px solid rgba(255, 77, 77, 0.1)',
                                            padding: '20px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '18px' }}>{issue.title}</div>
                                            <span style={{
                                                background: '#FF4D4D', color: '#000', padding: '2px 8px', fontWeight: 'bold',
                                                borderRadius: '2px', fontSize: '10px', textTransform: 'uppercase'
                                            }}>
                                                {issue.severity}
                                            </span>
                                        </div>
                                        <div style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.4' }}>{issue.description}</div>
                                        <div style={{ fontSize: '11px', color: '#666', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <FaUserShield /> {issue.username || 'Anonymous'}
                                            <span style={{ width: '4px', height: '4px', background: '#444', borderRadius: '50%' }} />
                                            {new Date(issue.createdAt).toLocaleString()}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

// --- SUB-COMPONENTS ---

const SidebarIcon = ({ icon, label, active, onClick, color }) => (
    <motion.div
        whileHover={{ scale: 1.1, x: 5 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        style={{
            cursor: 'pointer', color: active ? '#00d4ff' : color || '#666',
            fontSize: '24px', padding: '12px', borderRadius: '12px',
            background: active ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
            border: active ? '1px solid rgba(0, 212, 255, 0.2)' : '1px solid transparent',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            boxShadow: active ? '0 0 15px rgba(0, 212, 255, 0.2)' : 'none',
            transition: '0.2s'
        }}
        title={label}
    >
        {icon}
    </motion.div>
);

const KPICard = ({ title, value, color, icon }) => (
    <motion.div
        variants={cardVariants}
        whileHover={{ y: -5, boxShadow: `0 5px 20px ${color}20` }}
        style={{
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}30`,
            padding: '25px', borderRadius: '16px', backdropFilter: 'blur(10px)',
            position: 'relative', overflow: 'hidden'
        }}
    >
        <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '80px', color: color, opacity: 0.1 }}>{icon}</div>
        <div style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}>{title}</div>
        <div style={{ color: '#fff', fontSize: '42px', fontWeight: '900', marginTop: '10px', textShadow: `0 0 20px ${color}40` }}>{value}</div>
    </motion.div>
);

const ChartCard = ({ title, children }) => (
    <motion.div
        variants={cardVariants}
        style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)',
            padding: '25px', borderRadius: '16px', backdropFilter: 'blur(10px)'
        }}
    >
        <div style={{ color: '#fff', marginBottom: '25px', fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '4px', height: '15px', background: '#00d4ff' }} />
            {title}
        </div>
        {children}
    </motion.div>
);

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid #333', padding: '10px', borderRadius: '4px' }}>
                <p style={{ color: '#fff', margin: 0, fontWeight: 'bold' }}>{label}</p>
                <p style={{ color: payload[0].color, margin: 0 }}>
                    {payload[0].value}
                </p>
            </div>
        );
    }
    return null;
};

const headerStyle = {
    fontSize: '32px', fontWeight: '900', letterSpacing: '4px',
    color: '#fff', marginBottom: '40px',
    background: 'linear-gradient(90deg, #fff, #666)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)'
};

export default AdminDashboard;
