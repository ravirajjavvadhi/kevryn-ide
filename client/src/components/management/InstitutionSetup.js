import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBuilding, FaUserGraduate, FaChalkboardTeacher, FaPlus, FaCheck, FaTimes, FaUsers } from 'react-icons/fa';
import StudentReportModal from './StudentReportModal';

const InstitutionSetup = ({ token }) => {
    const [innerTab, setInnerTab] = useState('structure');
    
    // --- College Structure State ---
    const [structures, setStructures] = useState([]);
    const [department, setDepartment] = useState('CSE');
    const [year, setYear] = useState('1');
    const [sections, setSections] = useState('');
    const [structLoading, setStructLoading] = useState(false);
    const [structMsg, setStructMsg] = useState('');

    const departments = ['CSE', 'ECE', 'IT', 'MECH', 'CIVIL', 'EEE', 'AIML', 'DS'];
    const years = ['1', '2', '3', '4'];

    // --- Student Onboarding State ---
    const [stuDept, setStuDept] = useState('');
    const [stuYear, setStuYear] = useState('');
    const [stuSec, setStuSec] = useState('');
    const [rollNumbers, setRollNumbers] = useState('');
    const [students, setStudents] = useState([]);
    const [stuLoading, setStuLoading] = useState(false);
    const [stuMsg, setStuMsg] = useState('');
    const [selectedDevProfile, setSelectedDevProfile] = useState(null);

    // --- Faculty State ---
    const [facultyUser, setFacultyUser] = useState('');
    const [facultyList, setFacultyList] = useState([]);
    const [facLoading, setFacLoading] = useState(false);
    const [facMsg, setFacMsg] = useState('');

    const API_BASE = process.env.REACT_APP_SERVER_URL || '';
    const api = axios.create({
        baseURL: `${API_BASE}/api`,
        headers: { Authorization: `Bearer ${token}` }
    });

    useEffect(() => {
        fetchStructures();
        fetchFaculty();
    }, []);

    useEffect(() => {
        if (stuDept && stuYear && stuSec) {
            fetchStudents();
        } else {
            setStudents([]);
        }
    }, [stuDept, stuYear, stuSec]);

    const fetchStructures = async () => {
        try {
            const res = await api.get('/timetable/structure');
            if (Array.isArray(res.data)) {
                setStructures(res.data);
            }
        } catch (err) { console.error(err); }
    };

    const fetchFaculty = async () => {
        try {
            const res = await api.get('/admin/users?role=faculty');
            if (Array.isArray(res.data)) setFacultyList(res.data);
        } catch (err) { console.error(err); }
    };

    const fetchStudents = async () => {
        try {
            const res = await api.get(`/timetable/students?department=${stuDept}&year=${stuYear}&section=${stuSec}`);
            if (Array.isArray(res.data)) setStudents(res.data);
        } catch (err) { console.error(err); }
    };

    const handleSaveStructure = async (e) => {
        e.preventDefault();
        setStructLoading(true); setStructMsg('');
        try {
            const sectionArray = sections.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
            await api.post('/timetable/structure', { department, year, sections: sectionArray });
            setStructMsg('success: Structure synchronized successfully');
            fetchStructures();
            setSections('');
        } catch (err) {
            setStructMsg('error: ' + (err.response?.data?.error || 'Failed to synchronize'));
        }
        setStructLoading(false);
    };

    const handleAddStudents = async (e) => {
        e.preventDefault();
        setStuLoading(true); setStuMsg('');
        try {
            const rolls = rollNumbers.split(',').map(r => r.trim()).filter(r => r);
            await api.post('/timetable/students/bulk-add', { department: stuDept, year: stuYear, section: stuSec, rollNumbersString: rollNumbers });
            setStuMsg('success: Students onboarded successfully');
            setRollNumbers('');
            fetchStudents();
            fetchStructures(); // Update counts in topologies
        } catch (err) {
            setStuMsg('error: ' + (err.response?.data?.error || 'Failed to onboard'));
        }
        setStuLoading(false);
    };

    const handleToggleStudent = async (studentId, currentStatus) => {
        try {
            await api.patch(`/timetable/students/${studentId}/toggle-active`);
            fetchStudents();
            fetchStructures();
        } catch (err) { console.error(err); }
    };

    const handleCreateFaculty = async (e) => {
        e.preventDefault();
        setFacLoading(true); setFacMsg('');
        try {
            await api.post('/admin/create-faculty', { username: facultyUser });
            setFacMsg('success: Faculty created with password matching username');
            setFacultyUser('');
            fetchFaculty();
        } catch (err) {
            setFacMsg('error: ' + (err.response?.data?.error || 'Failed to create faculty'));
        }
        setFacLoading(false);
    };

    const safeStructures = Array.isArray(structures) ? structures : [];
    const uniqueDepartments = [...new Set(safeStructures.map(s => s.department))];
    const availableYears = [...new Set(safeStructures.filter(s => s.department === stuDept).map(s => s.year))];
    const structureForSec = safeStructures.find(s => s.department === stuDept && s.year === stuYear);
    const availableSections = structureForSec ? structureForSec.sections : [];

    // STYLING
    const containerStyle = { padding: '40px', maxWidth: '1200px', margin: '0 auto' };
    
    const cardStyle = {
        background: '#ffffff', borderRadius: '16px', padding: '32px',
        boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)', marginBottom: '24px'
    };

    const inputStyle = {
        width: '100%', padding: '14px 16px', borderRadius: '8px',
        border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1e293b', fontSize: '14px', outline: 'none', transition: 'all 0.2s'
    };

    const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' };

    const getTabBtnStyle = (id) => ({
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: 'none', background: 'transparent',
        borderBottom: innerTab === id ? '2px solid #4f46e5' : '2px solid transparent', color: innerTab === id ? '#4f46e5' : '#64748b',
        fontWeight: innerTab === id ? '600' : '500', transition: 'all 0.2s', fontSize: '14px'
    });

    const buttonStyle = {
        width: '100%', background: '#4f46e5', color: '#fff', padding: '14px', borderRadius: '8px', fontWeight: '600',
        fontSize: '14px', border: 'none', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
    };

    return (
        <div style={containerStyle}>
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 12px 0', color: '#0f172a', letterSpacing: '-1px' }}>Institution Setup</h2>
                <p style={{ color: '#64748b', margin: 0, fontSize: '16px', maxWidth: '600px', lineHeight: '1.5' }}>
                    Configure your academic structure, map cohorts, and register faculty globally.
                </p>
            </motion.div>

            <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                <button style={getTabBtnStyle('structure')} onClick={() => setInnerTab('structure')}><FaBuilding /> Academic Structure</button>
                <button style={getTabBtnStyle('students')} onClick={() => setInnerTab('students')}><FaUserGraduate /> Students</button>
                <button style={getTabBtnStyle('faculty')} onClick={() => setInnerTab('faculty')}><FaChalkboardTeacher /> Faculty</button>
            </div>

            <AnimatePresence mode="wait">
                <motion.div key={innerTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                    
                    {/* --- STRUCTURE TAB --- */}
                    {innerTab === 'structure' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            <div style={cardStyle}>
                                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ padding: '8px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '8px' }}><FaPlus size={14}/></span> Create Topology
                                </h3>
                                <form onSubmit={handleSaveStructure} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Department</label>
                                            <select style={inputStyle} value={department} onChange={e => setDepartment(e.target.value)}>
                                                {departments.map(d => <option key={d}>{d}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Year</label>
                                            <select style={inputStyle} value={year} onChange={e => setYear(e.target.value)}>
                                                {years.map(y => <option key={y} value={y}>Year {y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Sections (Comma Separated)</label>
                                        <input style={inputStyle} value={sections} onChange={e => setSections(e.target.value)} placeholder="A, B, C" required />
                                    </div>
                                    {structMsg && (
                                        <div style={{ padding: '12px', borderRadius: '8px', background: structMsg.startsWith('success') ? '#dcfce7' : '#fee2e2', color: structMsg.startsWith('success') ? '#166534' : '#991b1b', fontSize: '13px', fontWeight: '600' }}>
                                            {structMsg.split(': ')[1]}
                                        </div>
                                    )}
                                    <button type="submit" style={buttonStyle} disabled={structLoading}>
                                        {structLoading ? 'Saving...' : 'Save Topology'}
                                    </button>
                                </form>
                            </div>
                            
                            <div style={cardStyle}>
                                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' }}>Active Topologies</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                                    {safeStructures.length === 0 ? <p style={{ color: '#94a3b8' }}>No structures found.</p> : 
                                        safeStructures.map(s => (
                                            <div key={s._id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <span style={{ fontWeight: '700', color: '#0f172a', marginRight: '12px' }}>{s.department}</span>
                                                    <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#475569', fontWeight: '600' }}>Year {s.year}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {s.sections.map(sec => (
                                                        <span key={sec} style={{ background: '#e2e8f0', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                                                            {sec} {s.sectionCounts && s.sectionCounts[sec] !== undefined ? `(${s.sectionCounts[sec]})` : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- STUDENTS TAB --- */}
                    {innerTab === 'students' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px' }}>
                            <div style={cardStyle}>
                                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ padding: '8px', background: '#dbeafe', color: '#2563eb', borderRadius: '8px' }}><FaUsers size={14}/></span> Bulk Onboard Cohort
                                </h3>
                                <form onSubmit={handleAddStudents} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={labelStyle}>Dept</label>
                                            <select style={inputStyle} required value={stuDept} onChange={e => {setStuDept(e.target.value); setStuYear(''); setStuSec('');}}>
                                                <option value="">--</option>
                                                {uniqueDepartments.map(d => <option key={d}>{d}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Year</label>
                                            <select style={inputStyle} required value={stuYear} onChange={e => {setStuYear(e.target.value); setStuSec('');}}>
                                                <option value="">--</option>
                                                {availableYears.map(y => <option key={y}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Section</label>
                                        {availableSections.length === 0 && stuDept && stuYear ? (
                                            <div style={{ padding: '12px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', fontSize: '14px', fontWeight: '500' }}>
                                                No sections exist. Create a topology first.
                                            </div>
                                        ) : (
                                            <select style={inputStyle} required value={stuSec} onChange={e => setStuSec(e.target.value)}>
                                                <option value="">--</option>
                                                {availableSections.map(s => <option key={s}>{s}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Roll Numbers (Comma Separated)</label>
                                        <textarea style={{...inputStyle, minHeight: '100px'}} required value={rollNumbers} onChange={e => setRollNumbers(e.target.value)} placeholder="21B..., 22B..."></textarea>
                                    </div>
                                    {stuMsg && (
                                        <div style={{ padding: '12px', borderRadius: '8px', background: stuMsg.startsWith('success') ? '#dcfce7' : '#fee2e2', color: stuMsg.startsWith('success') ? '#166534' : '#991b1b', fontSize: '13px', fontWeight: '600' }}>
                                            {stuMsg.split(': ')[1]}
                                        </div>
                                    )}
                                    <button type="submit" style={buttonStyle} disabled={stuLoading || !stuSec}>
                                        {stuLoading ? 'Processing...' : 'Initialize Students'}
                                    </button>
                                </form>
                            </div>
                            
                            <div style={cardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Cohort Roster</h3>
                                    {stuSec && <span style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#475569' }}>{stuDept} · Y{stuYear} · S{stuSec}</span>}
                                </div>
                                
                                {!stuSec ? (
                                    <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>Select Department, Year, and Section to view students.</div>
                                ) : students.length === 0 ? (
                                    <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>No students in this cohort.</div>
                                ) : (
                                    <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <tr>
                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Roll Number</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Status</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {students.map(s => (
                                                    <tr key={s._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td 
                                                            style={{ padding: '12px 16px', fontWeight: '600', color: '#3b82f6', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}
                                                            onClick={() => setSelectedDevProfile(s.rollNumber || s.username)}
                                                            title="View Developer Profile"
                                                        >
                                                            {s.rollNumber || s.username}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            {s.isActiveStudent !== false ? 
                                                                <span style={{ color: '#16a34a', background: '#dcfce7', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>AUTHORIZED</span> :
                                                                <span style={{ color: '#dc2626', background: '#fee2e2', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>REVOKED</span>
                                                            }
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                            <button 
                                                                onClick={() => handleToggleStudent(s._id, s.isActiveStudent)}
                                                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: s.isActiveStudent !== false ? '#ef4444' : '#22c55e', padding: '4px' }}
                                                            >
                                                                {s.isActiveStudent !== false ? <FaTimes /> : <FaCheck />}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- FACULTY TAB --- */}
                    {innerTab === 'faculty' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px' }}>
                            <div style={cardStyle}>
                                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ padding: '8px', background: '#f3e8ff', color: '#9333ea', borderRadius: '8px' }}><FaChalkboardTeacher size={14}/></span> Onboard Faculty
                                </h3>
                                <form onSubmit={handleCreateFaculty} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>Faculty Username</label>
                                        <input style={inputStyle} value={facultyUser} onChange={e => setFacultyUser(e.target.value)} placeholder="e.g., swaroopa" required />
                                        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>* Password will automatically be set to the username.</p>
                                    </div>
                                    {facMsg && (
                                        <div style={{ padding: '12px', borderRadius: '8px', background: facMsg.startsWith('success') ? '#dcfce7' : '#fee2e2', color: facMsg.startsWith('success') ? '#166534' : '#991b1b', fontSize: '13px', fontWeight: '600' }}>
                                            {facMsg.split(': ')[1]}
                                        </div>
                                    )}
                                    <button type="submit" style={buttonStyle} disabled={facLoading || !facultyUser}>
                                        {facLoading ? 'Processing...' : 'Create Faculty Account'}
                                    </button>
                                </form>
                            </div>
                            
                            <div style={cardStyle}>
                                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' }}>Faculty Directory</h3>
                                <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                    {facultyList.length === 0 ? (
                                        <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>No faculty onboarded yet.</div>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <tr>
                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Username</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {facultyList.map(f => (
                                                    <tr key={f._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '12px 16px', fontWeight: '600', color: '#334155', fontSize: '14px' }}>{f.username}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            {f.isFacultyActive ? 
                                                                <span style={{ color: '#16a34a', background: '#dcfce7', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>ACTIVE</span> :
                                                                <span style={{ color: '#dc2626', background: '#fee2e2', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>REVOKED</span>
                                                            }
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </motion.div>
            </AnimatePresence>

            {selectedDevProfile && (
                <StudentReportModal 
                    identifier={selectedDevProfile} 
                    onClose={() => setSelectedDevProfile(null)} 
                    token={token} 
                />
            )}
        </div>
    );
};

export default InstitutionSetup;
