import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FaChartLine, FaUsers, FaChalkboardTeacher, FaDesktop, FaFilter, FaHistory, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import StudentReportModal from './StudentReportModal';

const ManagementAnalytics = ({ token }) => {
    const [selectedStudentId, setSelectedStudentId] = useState(null);

    const [stats, setStats] = useState({
        totalStudents: '...',
        totalFaculty: '...',
        sessionsToday: '...',
        platformUtilization: '...'
    });
    
    // Filters State
    const [filters, setFilters] = useState({ department: '', year: '', section: '', courseId: '' });
    const [availableFilters, setAvailableFilters] = useState({ departments: [], years: [], sections: [], courses: [] });
    const [rawStructures, setRawStructures] = useState([]);
    
    // Data State
    const [history, setHistory] = useState([]);
    const [studentData, setStudentData] = useState([]);
    const [loadingData, setLoadingData] = useState(false);

    const API_BASE = process.env.REACT_APP_SERVER_URL || '';
    const api = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${token}` } });

    // 1. Initial Load (Stats & Filter Options)
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Load Top Stats
                const statsRes = await api.get('/api/timetable/analytics');
                setStats({
                    totalStudents: statsRes.data.totalStudents || 0,
                    totalFaculty: statsRes.data.totalFaculty || 0,
                    sessionsToday: statsRes.data.sessionsToday || 0,
                    platformUtilization: statsRes.data.platformUtilization || '0%'
                });

                // Load Filter Options & Recent History
                const [filtersRes, historyRes] = await Promise.all([
                    api.get('/api/management-analytics/filters'),
                    api.get('/api/management-analytics/history')
                ]);
                
                setRawStructures(filtersRes.data.structures || []);
                setAvailableFilters({
                    departments: filtersRes.data.departments || [],
                    years: [], sections: [],
                    courses: filtersRes.data.courses || []
                });
                
                setHistory(historyRes.data.history || []);
            } catch (err) {
                console.error("Failed to load initial analytics:", err);
            }
        };
        loadInitialData();
    }, []);

    // 2. Cascading Filter Logic
    useEffect(() => {
        if (filters.department) {
            const depts = rawStructures.filter(s => s.department === filters.department);
            const years = [...new Set(depts.map(s => s.year))].sort();
            setAvailableFilters(prev => ({ ...prev, years, sections: [] }));
            
            if (filters.year) {
                const secStr = depts.find(s => s.year === filters.year);
                setAvailableFilters(prev => ({ ...prev, sections: secStr ? secStr.sections : [] }));
            }
        } else {
            setAvailableFilters(prev => ({ ...prev, years: [], sections: [] }));
        }
    }, [filters.department, filters.year, rawStructures]);

    // 3. Fetch Student Attendance Data when filters change
    useEffect(() => {
        const fetchAttendance = async () => {
            setLoadingData(true);
            try {
                const params = new URLSearchParams();
                if (filters.department) params.append('department', filters.department);
                if (filters.year) params.append('year', filters.year);
                if (filters.section) params.append('section', filters.section);
                if (filters.courseId) params.append('courseId', filters.courseId);
                
                const res = await api.get(`/api/management-analytics/student-attendance?${params.toString()}`);
                setStudentData(res.data.data || []);
            } catch (err) {
                console.error("Failed to fetch student data:", err);
            } finally {
                setLoadingData(false);
            }
        };
        
        // Add a slight debounce to avoid too many requests
        const timeoutId = setTimeout(fetchAttendance, 300);
        return () => clearTimeout(timeoutId);
    }, [filters]);

    // UI Styles
    const containerStyle = { padding: '40px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Outfit', sans-serif" };
    const cardStyle = {
        background: '#ffffff', borderRadius: '16px', padding: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)',
        display: 'flex', flexDirection: 'column'
    };
    const inputStyle = {
        padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
        background: '#f8fafc', color: '#0f172a', outline: 'none', fontSize: '14px',
        width: '100%', cursor: 'pointer'
    };

    const statCards = [
        { title: 'Total Students', value: stats.totalStudents, icon: <FaUsers size={24} color="#3b82f6" />, bg: '#eff6ff' },
        { title: 'Faculty Members', value: stats.totalFaculty, icon: <FaChalkboardTeacher size={24} color="#8b5cf6" />, bg: '#f5f3ff' },
        { title: 'Lab Sessions Today', value: stats.sessionsToday, icon: <FaDesktop size={24} color="#10b981" />, bg: '#ecfdf5' },
        { title: 'Platform Utilization (Today)', value: stats.platformUtilization, icon: <FaChartLine size={24} color="#f59e0b" />, bg: '#fffbeb' }
    ];

    return (
        <div style={containerStyle}>
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 12px 0', color: '#0f172a', letterSpacing: '-1px' }}>Global Analytics</h2>
                <p style={{ color: '#64748b', margin: 0, fontSize: '16px', maxWidth: '600px', lineHeight: '1.5' }}>
                    Real-time oversight of institutional operations, lab attendance, and engagement history.
                </p>
            </motion.div>

            {/* Top Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                {statCards.map((stat, idx) => (
                    <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }} style={cardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div style={{ padding: '12px', borderRadius: '12px', background: stat.bg }}>{stat.icon}</div>
                        </div>
                        <h3 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 4px 0', color: '#0f172a' }}>{stat.value}</h3>
                        <p style={{ color: '#64748b', margin: 0, fontSize: '14px', fontWeight: '600' }}>{stat.title}</p>
                    </motion.div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.2fr', gap: '24px' }}>
                {/* Left Side: Detailed Student Analytics Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Filter Bar */}
                    <div style={{ ...cardStyle, padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#0f172a' }}>
                            <FaFilter size={16} color="#6366f1" />
                            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Data Filters</h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                            <select style={inputStyle} value={filters.department} onChange={e => setFilters({...filters, department: e.target.value, year: '', section: ''})}>
                                <option value="">All Departments</option>
                                {availableFilters.departments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <select style={inputStyle} value={filters.year} onChange={e => setFilters({...filters, year: e.target.value, section: ''})} disabled={!filters.department}>
                                <option value="">All Years</option>
                                {availableFilters.years.map(y => <option key={y} value={y}>Year {y}</option>)}
                            </select>
                            <select style={inputStyle} value={filters.section} onChange={e => setFilters({...filters, section: e.target.value})} disabled={!filters.year}>
                                <option value="">All Sections</option>
                                {availableFilters.sections.map(s => <option key={s} value={s}>Section {s}</option>)}
                            </select>
                            <select style={inputStyle} value={filters.courseId} onChange={e => setFilters({...filters, courseId: e.target.value})}>
                                <option value="">All Courses</option>
                                {availableFilters.courses.map(c => <option key={c._id} value={c._id}>{c.name} ({c.code})</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Student Data Table */}
                    <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbfc' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: '#0f172a' }}>Student Attendance Report</h3>
                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500', background: '#e2e8f0', padding: '4px 10px', borderRadius: '12px' }}>
                                {studentData.length} Records Found
                            </span>
                        </div>
                        <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                            {loadingData ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading Data...</div>
                            ) : studentData.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No students match the current filters.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th style={{ padding: '16px 20px', fontSize: '13px', color: '#64748b', fontWeight: '600', borderBottom: '1px solid #e2e8f0' }}>Student ID / Username</th>
                                            <th style={{ padding: '16px 20px', fontSize: '13px', color: '#64748b', fontWeight: '600', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>Labs Conducted</th>
                                            <th style={{ padding: '16px 20px', fontSize: '13px', color: '#64748b', fontWeight: '600', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>Labs Attended</th>
                                            <th style={{ padding: '16px 20px', fontSize: '13px', color: '#64748b', fontWeight: '600', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>Attendance %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentData.map((student, idx) => (
                                            <motion.tr 
                                                key={student.id} 
                                                initial={{ opacity: 0 }} 
                                                animate={{ opacity: 1 }} 
                                                transition={{ delay: idx * 0.02 }} 
                                                onClick={() => setSelectedStudentId(student.rollNumber || student.username)}
                                                style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer' }}
                                                whileHover={{ background: '#eef2ff' }}
                                            >
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{student.rollNumber || student.username}</div>
                                                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>{student.name || 'Student'}</div>
                                                </td>
                                                <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>{student.labsConducted}</td>
                                                <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: '600', color: '#10b981' }}>{student.labsAttended}</td>
                                                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: student.attendancePercentage >= 75 ? '#dcfce7' : (student.attendancePercentage >= 50 ? '#fef9c3' : '#fee2e2'), color: student.attendancePercentage >= 75 ? '#166534' : (student.attendancePercentage >= 50 ? '#854d0e' : '#991b1b'), padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>
                                                        {student.attendancePercentage}%
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side: Recent Lab Sessions History */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FaHistory color="#8b5cf6" />
                            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#0f172a' }}>Recent Lab Sessions</h3>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '600px', overflowY: 'auto' }}>
                            {history.length === 0 ? (
                                <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: '14px', margin: '20px 0' }}>No recent lab sessions found.</p>
                            ) : history.map((session, i) => (
                                <motion.div key={session._id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} style={{ border: '1px solid #f1f5f9', borderRadius: '12px', padding: '16px', background: session.isActive ? '#fef2f2' : '#ffffff', borderLeft: `4px solid ${session.isActive ? '#ef4444' : '#10b981'}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{session.sessionName}</h4>
                                        {session.isActive ? (
                                            <span style={{ fontSize: '10px', background: '#fee2e2', color: '#ef4444', padding: '2px 8px', borderRadius: '10px', fontWeight: '800' }}>LIVE NOW</span>
                                        ) : (
                                            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>ENDED</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                                        <strong>Subject:</strong> {session.subject} <br/>
                                        <strong>Faculty:</strong> {session.faculty}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#f8fafc', padding: '8px', borderRadius: '8px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Attended</div>
                                            <div style={{ color: '#10b981', fontWeight: '800', fontSize: '14px' }}>{session.attendees}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Absent</div>
                                            <div style={{ color: '#ef4444', fontWeight: '800', fontSize: '14px' }}>{Math.max(0, session.totalAllowed - session.attendees)}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Total</div>
                                            <div style={{ color: '#475569', fontWeight: '800', fontSize: '14px' }}>{session.totalAllowed}</div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
            <AnimatePresence>
                {selectedStudentId && (
                    <StudentReportModal 
                        identifier={selectedStudentId} 
                        onClose={() => setSelectedStudentId(null)} 
                        token={token} 
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default ManagementAnalytics;
