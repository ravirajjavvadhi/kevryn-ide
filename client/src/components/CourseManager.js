import React, { useState, useEffect } from 'react';
import axios from 'axios';

import { FaPlus, FaBook, FaUsers, FaArrowRight, FaCalendarAlt, FaTrash } from 'react-icons/fa';

const CourseManager = ({ token, serverUrl, userId }) => {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);

    // Form States
    const [newCourse, setNewCourse] = useState({ name: '', code: '', semester: 'Sem 1', description: '' });
    const [selectedCourse, setSelectedCourse] = useState(null);
    // Student Management States
    const [showStudentModal, setShowStudentModal] = useState(false);
    const [batchToManage, setBatchToManage] = useState(null);
    const [studentInput, setStudentInput] = useState("");
    const [enrollStats, setEnrollStats] = useState(null);
    const [newBatch, setNewBatch] = useState({ name: '', schedule: { day: '', time: '' } });

    // Course Roster States (Phase 18)
    const [showCourseRosterModal, setShowCourseRosterModal] = useState(false);
    const [courseRosterData, setCourseRosterData] = useState({ id: null, name: '', students: [] });
    const [courseStudentInput, setCourseStudentInput] = useState("");

    const api = axios.create({ baseURL: serverUrl, headers: { Authorization: token } });

    useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            const res = await api.get('/api/courses');
            setCourses(res.data);
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const handleCreateCourse = async () => {
        if (!newCourse.name || !newCourse.code) return alert("Name and Code are required");
        try {
            const res = await api.post('/api/courses', newCourse);
            setCourses([...courses, res.data]);
            setShowCreateModal(false);
            setNewCourse({ name: '', code: '', semester: 'Sem 1', description: '' });
        } catch (e) {
            alert("Failed to create course");
        }
    };

    const handleDeleteCourse = async (courseId, courseName, studentCount) => {
        const confirmMsg = studentCount > 0
            ? `WARNING: This course has ${studentCount} enrolled students!\n\nAre you sure you want to delete "${courseName}"?\nAll batch data and student enrollments will be lost.`
            : `Are you sure you want to delete "${courseName}"?`;

        if (!window.confirm(confirmMsg)) return;

        try {
            await api.delete(`/api/courses/${courseId}`);
            setCourses(courses.filter(c => c._id !== courseId));
        } catch (e) {
            alert("Failed to delete course: " + (e.response?.data?.error || e.message));
        }
    };

    const handleCreateBatch = async () => {
        if (!newBatch.name || !selectedCourse) return alert("Batch name required");
        try {
            const res = await api.post(`/api/courses/${selectedCourse._id}/batches`, {
                name: newBatch.name,
                schedule: newBatch.schedule
            });
            setCourses(courses.map(c => {
                if (c._id === selectedCourse._id) {
                    return { ...c, batches: [...(c.batches || []), res.data.batch] };
                }
                return c;
            }));
            setShowBatchModal(false);
            setNewBatch({ name: '', schedule: { day: '', time: '' } });
        } catch (e) {
            alert("Failed to create batch: " + (e.response?.data?.error || e.message));
        }
    };

    const openStudentModal = (course, batch) => {
        setBatchToManage({ ...batch, courseName: course.name, courseId: course._id });
        setStudentInput("");
        setEnrollStats(null);
        setShowStudentModal(true);
    };

    const handleEnrollStudents = async () => {
        if (!studentInput.trim()) return;
        const students = studentInput.split(/[\n, ]+/).map(s => s.trim()).filter(s => s);
        if (students.length === 0) return;
        try {
            const res = await api.post(`/api/batches/${batchToManage._id}/enroll`, { students });
            setEnrollStats(res.data.stats);
            setStudentInput("");
            const updatedBatch = res.data.batch;
            setBatchToManage(prev => ({ ...prev, students: updatedBatch.students }));
            setCourses(prev => prev.map(c => {
                if (c._id === batchToManage.courseId) {
                    return { ...c, batches: c.batches.map(b => b._id === batchToManage._id ? updatedBatch : b) };
                }
                return c;
            }));
        } catch (e) {
            alert("Enrollment failed: " + (e.response?.data?.error || e.message));
        }
    };

    const handleRemoveStudent = async (username) => {
        if (!window.confirm(`Remove ${username} from this batch?`)) return;
        try {
            await api.post(`/api/batches/${batchToManage._id}/remove-student`, { username });
            setBatchToManage(prev => ({ ...prev, students: prev.students.filter(s => s.username !== username) }));
            setCourses(prev => prev.map(c => {
                if (c._id === batchToManage.courseId) {
                    return { ...c, batches: c.batches.map(b => b._id === batchToManage._id ? { ...b, students: b.students.filter(s => s.username !== username) } : b) };
                }
                return c;
            }));
        } catch (e) {
            alert("Failed to remove student");
        }
    };

    const openCourseRoster = async (course) => {
        try {
            const res = await api.get(`/course/${course._id}/roster`);
            setCourseRosterData({ id: course._id, name: course.name, students: res.data.enrolledStudents });
            setCourseStudentInput("");
            setShowCourseRosterModal(true);
        } catch (e) { alert("Failed to fetch roster"); }
    };

    const handleEnrollCourseStudent = async () => {
        if (!courseStudentInput.trim()) return;
        const username = courseStudentInput.trim();
        try {
            const res = await api.post(`/course/${courseRosterData.id}/enroll`, { username });
            setCourseRosterData(prev => ({ ...prev, students: res.data.enrolledStudents }));
            setCourseStudentInput("");
            setCourses(prev => prev.map(c => c._id === courseRosterData.id ? { ...c, enrolledStudents: res.data.enrolledStudents } : c));
        } catch (e) { alert("Failed to enroll student"); }
    };

    const handleRemoveCourseStudent = async (username) => {
        if (!window.confirm(`Remove ${username} from course roster?`)) return;
        try {
            const res = await api.delete(`/course/${courseRosterData.id}/enroll/${username}`);
            setCourseRosterData(prev => ({ ...prev, students: res.data.enrolledStudents }));
            setCourses(prev => prev.map(c => c._id === courseRosterData.id ? { ...c, enrolledStudents: res.data.enrolledStudents } : c));
        } catch (e) { alert("Failed to remove student"); }
    };

    return (
        <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#fff', marginBottom: '4px' }}>
                        My <span style={{ color: '#6366f1' }}>Courses</span>
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '14px' }}>Manage your subjects and student batches.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    style={{
                        background: '#6366f1',
                        color: '#fff',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: '700',
                        fontSize: '13px'
                    }}
                >
                    <FaPlus size={12} /> Create Course
                </button>
            </div>

            {/* GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {courses.map(course => (
                    <div key={course._id} style={{
                        background: 'rgba(30, 41, 59, 0.4)',
                        backdropFilter: 'blur(16px)',
                        borderRadius: '24px',
                        padding: '24px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        transition: 'all 0.3s ease'
                    }}>
                        {/* Top row with Code and Semester/Manage Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <span style={{
                                background: 'rgba(99, 102, 241, 0.15)',
                                color: '#a5b4fc',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: '700'
                            }}>{course.code}</span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: '600' }}>{course.semester}</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={() => openCourseRoster(course)}
                                        style={{ background: 'rgba(59, 130, 246, 0.1)', border: 'none', color: '#60a5fa', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}
                                    >Roster</button>
                                    <button
                                        onClick={() => handleDeleteCourse(course._id, course.name, course.batches?.reduce((acc, b) => acc + (b.students?.length || 0), 0))}
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '4px', cursor: 'pointer', opacity: 0.5 }}
                                    ><FaTrash size={12} /></button>
                                </div>
                            </div>
                        </div>

                        {/* Title Row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FaBook size={16} color="#fff" />
                            </div>
                            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>{course.name}</h3>
                        </div>

                        {/* Description */}
                        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px', lineHeight: '1.4', height: '36px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {course.description || "No description provided."}
                        </p>

                        {/* Batches Section */}
                        <div style={{ background: 'rgba(0, 0, 0, 0.2)', borderRadius: '16px', padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '130px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '10px', fontWeight: '800', color: '#6366f1', textTransform: 'uppercase' }}>Batches</span>
                                <button onClick={() => { setSelectedCourse(course); setShowBatchModal(true); }} style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>+ Add</button>
                            </div>

                            {course.batches && course.batches.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {course.batches.map(b => (
                                        <div key={b._id} style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <FaUsers size={10} color="#64748b" />
                                                <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: '600' }}>{b.name}</span>
                                            </div>
                                            <button onClick={() => openStudentModal(course, b)} style={{ background: 'transparent', border: 'none', color: '#6366f1', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}>Manage</button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                    <span style={{ fontSize: '11px', color: '#475569' }}>No batches</span>
                                </div>
                            )}
                        </div>

                        {/* Footer Button */}
                        <button style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            View Details <FaArrowRight size={10} />
                        </button>
                    </div>
                ))}
            </div>

            {/* MODALS (Simplified for clarity) */}
            {showCreateModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#1e293b', padding: '30px', borderRadius: '20px', width: '400px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h2 style={{ color: '#fff', marginBottom: '20px', fontSize: '20px' }}>Create Course</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input placeholder="Name" value={newCourse.name} onChange={e => setNewCourse({ ...newCourse, name: e.target.value })} style={{ width: '100%', padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '10px' }} />
                            <input placeholder="Code" value={newCourse.code} onChange={e => setNewCourse({ ...newCourse, code: e.target.value })} style={{ width: '100%', padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '10px' }} />
                            <input placeholder="Semester" value={newCourse.semester} onChange={e => setNewCourse({ ...newCourse, semester: e.target.value })} style={{ width: '100%', padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '10px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={handleCreateCourse} style={{ flex: 1, padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Create</button>
                            <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '10px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {showBatchModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#1e293b', padding: '30px', borderRadius: '20px', width: '400px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h2 style={{ color: '#fff', marginBottom: '10px', fontSize: '20px' }}>Add Batch</h2>
                        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>{selectedCourse?.name}</p>
                        <input placeholder="Batch Name" value={newBatch.name} onChange={e => setNewBatch({ ...newBatch, name: e.target.value })} style={{ width: '100%', padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '10px', marginBottom: '12px' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input placeholder="Day" value={newBatch.schedule.day} onChange={e => setNewBatch({ ...newBatch, schedule: { ...newBatch.schedule, day: e.target.value } })} style={{ flex: 1, padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '10px' }} />
                            <input placeholder="Time" value={newBatch.schedule.time} onChange={e => setNewBatch({ ...newBatch, schedule: { ...newBatch.schedule, time: e.target.value } })} style={{ flex: 1, padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '10px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={handleCreateBatch} style={{ flex: 1, padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Add</button>
                            <button onClick={() => setShowBatchModal(false)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '10px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {showStudentModal && batchToManage && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                    <div style={{ background: '#1e293b', padding: '30px', borderRadius: '24px', width: '600px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ color: '#fff', fontSize: '20px' }}>Manage Students</h2>
                            <button onClick={() => setShowStudentModal(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '24px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <textarea value={studentInput} onChange={e => setStudentInput(e.target.value)} placeholder="Usernames separated by space or newline..." style={{ width: '100%', height: '80px', padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', marginBottom: '10px' }} />
                            <button onClick={handleEnrollStudents} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Enroll</button>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', overflow: 'hidden' }}>
                            {batchToManage.students?.length > 0 ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tr style={{ textAlign: 'left', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '12px' }}>Student</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Action</th>
                                    </tr>
                                    {batchToManage.students.map(s => (
                                        <tr key={s.username} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '12px', color: '#e2e8f0', fontSize: '13px' }}>{s.username}</td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                <button onClick={() => handleRemoveStudent(s.username)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                                            </td>
                                        </tr>
                                    ))}
                                </table>
                            ) : <p style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>No students</p>}
                        </div>
                    </div>
                </div>
            )}

            {showCourseRosterModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
                    <div style={{ background: '#1e293b', padding: '30px', borderRadius: '24px', width: '450px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ color: '#fff', fontSize: '20px' }}>Course Roster</h2>
                            <button onClick={() => setShowCourseRosterModal(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '24px', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                            <input value={courseStudentInput} onChange={e => setCourseStudentInput(e.target.value)} placeholder="Username..." style={{ flex: 1, padding: '12px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '10px' }} />
                            <button onClick={handleEnrollCourseStudent} style={{ padding: '12px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Add</button>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {courseRosterData.students.length > 0 ? courseRosterData.students.map(uname => (
                                <div key={uname} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: '13px' }}>
                                    <span>{uname}</span>
                                    <button onClick={() => handleRemoveCourseStudent(uname)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>Remove</button>
                                </div>
                            )) : <p style={{ color: '#64748b', textAlign: 'center' }}>Empty roster</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourseManager;
