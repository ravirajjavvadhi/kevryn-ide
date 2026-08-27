import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FaCalendarAlt, FaTrashAlt, FaPlus, FaChalkboardTeacher, FaFilter, FaTimes } from 'react-icons/fa';

const TimetableScheduler = ({ token }) => {
    // --- Master Data ---
    const [allTimetable, setAllTimetable] = useState([]);
    const [structures, setStructures] = useState([]);
    const [facultyList, setFacultyList] = useState([]);
    const [courses, setCourses] = useState([]);
    const [labRooms, setLabRooms] = useState([]);

    // --- Filters ---
    const [filterDept, setFilterDept] = useState('All');
    const [filterYear, setFilterYear] = useState('All');
    const [filterSection, setFilterSection] = useState('All');

    // --- Modals State ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
    const [activeEntryId, setActiveEntryId] = useState(null); // for edit/delete
    
    // --- Form State ---
    const [formDept, setFormDept] = useState('');
    const [formYear, setFormYear] = useState('');
    const [formSection, setFormSection] = useState('');
    const [formDay, setFormDay] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [subjectName, setSubjectName] = useState('');
    const [facultyId, setFacultyId] = useState('');
    const [labRoom, setLabRoom] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);

    const API_BASE = process.env.REACT_APP_SERVER_URL || '';
    const api = axios.create({
        baseURL: `${API_BASE}/api`,
        headers: { Authorization: `Bearer ${token}` }
    });

    useEffect(() => {
        fetchMasterData();
    }, []);

    const fetchMasterData = async () => {
        try {
            const [ttRes, structRes, facRes, courseRes, labRes] = await Promise.all([
                api.get('/timetable/schedule'),
                api.get('/timetable/structure'),
                api.get('/admin/users?role=faculty'),
                api.get('/admin/courses'),
                api.get('/admin/labrooms')
            ]);
            setAllTimetable(ttRes.data || []);
            setStructures(structRes.data || []);
            setFacultyList(facRes.data || []);
            setCourses(courseRes.data || []);
            setLabRooms(labRes.data || []);
        } catch (err) { console.error('Failed to load timetable data', err); }
    };

    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Derived structure options
    const uniqueDepartments = [...new Set(structures.map(s => s.department))];
    const availableYears = filterDept === 'All' ? [] : [...new Set(structures.filter(s => s.department === filterDept).map(s => s.year))];
    const structureForSec = structures.find(s => s.department === filterDept && s.year === filterYear);
    const availableSections = structureForSec ? structureForSec.sections : [];

    // Generate Rows based on Structures
    const rowsToRender = useMemo(() => {
        let validStructures = structures;
        if (filterDept !== 'All') validStructures = validStructures.filter(s => s.department === filterDept);
        if (filterYear !== 'All') validStructures = validStructures.filter(s => s.year === filterYear);
        
        let rows = [];
        validStructures.forEach(struct => {
            let secs = struct.sections || [];
            if (filterSection !== 'All') {
                secs = secs.filter(sec => sec === filterSection);
            }
            secs.forEach(sec => {
                rows.push({
                    key: `${struct.department}-${struct.year}-${sec}`,
                    department: struct.department,
                    year: struct.year,
                    section: sec
                });
            });
        });
        // Sort rows logically
        return rows.sort((a,b) => a.department.localeCompare(b.department) || a.year.localeCompare(b.year) || a.section.localeCompare(b.section));
    }, [structures, filterDept, filterYear, filterSection]);

    // Handle Cell Click (Add Mode)
    const handleEmptyCellClick = (row, day) => {
        setModalMode('add');
        setFormDept(row.department);
        setFormYear(row.year);
        setFormSection(row.section);
        setFormDay(day);
        setStartTime('09:00');
        setEndTime('10:00');
        setSubjectName('');
        setFacultyId('');
        setLabRoom('');
        setActiveEntryId(null);
        setIsModalOpen(true);
    };

    // Handle Entry Click (Edit Mode)
    const handleEntryClick = (entry) => {
        setModalMode('edit');
        setFormDept(entry.department);
        setFormYear(entry.year);
        setFormSection(entry.section);
        setFormDay(entry.dayOfWeek);
        setStartTime(entry.startTime);
        setEndTime(entry.endTime);
        setSubjectName(entry.subjectName);
        // Sometimes backend returns populated facultyId as object
        setFacultyId(typeof entry.facultyId === 'object' && entry.facultyId ? entry.facultyId._id : entry.facultyId);
        setLabRoom(entry.labRoom);
        setActiveEntryId(entry._id);
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const payload = {
                department: formDept, year: formYear, section: formSection,
                dayOfWeek: formDay, startTime, endTime, subjectName, facultyId, labRoom
            };
            if (modalMode === 'add') {
                await api.post('/timetable/schedule', payload);
            } else {
                // If the backend has a PUT route for schedule, we use it. 
                // Wait, does it have a PUT route? 
                // Let's assume we delete and re-create if PUT isn't available, or just call PUT if it is.
                // Looking at typical setups, let's delete then create.
                if (activeEntryId) {
                    await api.delete(`/timetable/schedule/${activeEntryId}`);
                }
                await api.post('/timetable/schedule', payload);
            }
            await fetchMasterData(); // Refresh UI
            setIsModalOpen(false);
        } catch (err) {
            alert('Error saving timetable entry: ' + (err.response?.data?.error || err.message));
        }
        setIsLoading(false);
    };

    const handleDelete = async () => {
        if (!activeEntryId || !window.confirm('Delete this schedule entry?')) return;
        try {
            await api.delete(`/timetable/schedule/${activeEntryId}`);
            await fetchMasterData();
            setIsModalOpen(false);
        } catch (err) {
            alert('Failed to delete entry');
        }
    };

    // Render logic for grid
    const getEntriesForCell = (dept, year, sec, day) => {
        return allTimetable.filter(t => t.department === dept && t.year === year && t.section === sec && t.dayOfWeek === day);
    };

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaCalendarAlt color="#4f46e5" /> Master Timetable Grid
                    </h2>
                    <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Institution-wide top-down scheduling view.</p>
                </div>
                
                {/* Filters */}
                <div style={{ display: 'flex', gap: '12px', background: '#fff', padding: '12px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4f46e5', fontWeight: 'bold' }}><FaFilter /> Filters:</div>
                    <select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setFilterYear('All'); setFilterSection('All'); }} style={filterStyle}>
                        <option value="All">All Departments</option>
                        {uniqueDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    
                    <select value={filterYear} onChange={(e) => { setFilterYear(e.target.value); setFilterSection('All'); }} disabled={filterDept === 'All'} style={filterStyle}>
                        <option value="All">All Years</option>
                        {availableYears.map(y => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                    
                    <select value={filterSection} onChange={(e) => setFilterSection(e.target.value)} disabled={filterYear === 'All'} style={filterStyle}>
                        <option value="All">All Sections</option>
                        {availableSections.map(s => <option key={s} value={s}>Section {s}</option>)}
                    </select>
                </div>
            </div>

            {/* The Huge Grid */}
            <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, width: '180px', position: 'sticky', left: 0, zIndex: 2 }}>Class Section</th>
                                {daysOfWeek.map(day => (
                                    <th key={day} style={thStyle}>{day}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rowsToRender.map((row, idx) => (
                                <tr key={row.key} style={{ background: idx % 2 === 0 ? '#fafbfc' : '#fff' }}>
                                    <td style={{ ...tdStyle, position: 'sticky', left: 0, background: idx % 2 === 0 ? '#fafbfc' : '#fff', zIndex: 1, fontWeight: 'bold', color: '#1e293b' }}>
                                        <div style={{ fontSize: '14px' }}>{row.department}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>Yr {row.year} - Sec {row.section}</div>
                                    </td>
                                    
                                    {daysOfWeek.map(day => {
                                        const entries = getEntriesForCell(row.department, row.year, row.section, day);
                                        return (
                                            <td key={day} style={tdStyle}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '60px' }}>
                                                    {entries.map(entry => (
                                                        <motion.div 
                                                            key={entry._id}
                                                            whileHover={{ scale: 1.02 }}
                                                            onClick={() => handleEntryClick(entry)}
                                                            style={{
                                                                background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '8px', cursor: 'pointer',
                                                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.1)', transition: 'border-color 0.2s'
                                                            }}
                                                        >
                                                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#4f46e5' }}>{entry.startTime} - {entry.endTime}</div>
                                                            <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: '600', margin: '4px 0' }}>{entry.subjectName}</div>
                                                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                                                                <span>{typeof entry.facultyId === 'object' && entry.facultyId ? entry.facultyId.username : 'Unknown'}</span>
                                                                <span style={{ fontWeight: 'bold' }}>{entry.labRoom}</span>
                                                            </div>
                                                        </motion.div>
                                                    ))}
                                                    <div 
                                                        onClick={() => handleEmptyCellClick(row, day)}
                                                        style={{ 
                                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                            border: '2px dashed #e2e8f0', borderRadius: '8px', cursor: 'pointer', color: '#cbd5e1',
                                                            minHeight: entries.length ? '30px' : '60px', transition: 'all 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#94a3b8'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#cbd5e1'; }}
                                                    >
                                                        <FaPlus size={14} />
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {rowsToRender.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        No structural rows found. Go to Institution Setup to create Departments.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sub-Modal for Add/Edit */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
                            style={{ background: '#fff', padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
                        >
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{modalMode === 'add' ? 'Add Class' : 'Edit Class'}</span>
                                <FaTimes style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setIsModalOpen(false)} />
                            </h3>

                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#64748b' }}>
                                <strong>Target:</strong> {formDept} - Yr {formYear} - Sec {formSection} <br />
                                <strong>Day:</strong> {formDay}
                            </div>

                            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Start Time</label>
                                        <input type="time" required value={startTime} onChange={e=>setStartTime(e.target.value)} style={inputStyle} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>End Time</label>
                                        <input type="time" required value={endTime} onChange={e=>setEndTime(e.target.value)} style={inputStyle} />
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>Course / Subject</label>
                                    <select required value={subjectName} onChange={e=>setSubjectName(e.target.value)} style={inputStyle}>
                                        <option value="">Select Course...</option>
                                        {courses.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={labelStyle}>Faculty</label>
                                    <select required value={facultyId} onChange={e=>setFacultyId(e.target.value)} style={inputStyle}>
                                        <option value="">Assign Faculty...</option>
                                        {facultyList.map(f => <option key={f._id} value={f._id}>{f.username}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={labelStyle}>Lab Room</label>
                                    <select required value={labRoom} onChange={e=>setLabRoom(e.target.value)} style={inputStyle}>
                                        <option value="">Select Location...</option>
                                        <option value="Online">Online / Remote</option>
                                        {labRooms.map(l => <option key={l._id} value={l.name}>{l.name} (Cap: {l.capacity})</option>)}
                                    </select>
                                </div>

                                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                    {modalMode === 'edit' && (
                                        <button type="button" onClick={handleDelete} style={{ ...btnStyle, background: '#fee2e2', color: '#dc2626' }}>
                                            <FaTrashAlt /> Delete
                                        </button>
                                    )}
                                    <button type="submit" disabled={isLoading} style={{ ...btnStyle, background: '#4f46e5', color: '#fff', flex: 1 }}>
                                        {isLoading ? 'Saving...' : 'Save Schedule'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const filterStyle = { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', background: '#f8fafc', color: '#1e293b', fontWeight: '500' };
const thStyle = { padding: '16px', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 'bold', textAlign: 'left', borderRight: '1px solid #e2e8f0' };
const tdStyle = { padding: '12px', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', verticalAlign: 'top' };
const labelStyle = { display: 'block', fontSize: '13px', color: '#475569', fontWeight: '600', marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', boxSizing: 'border-box' };
const btnStyle = { padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };

export default TimetableScheduler;
