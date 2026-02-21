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
        console.log("Creating Batch...", { newBatch, selectedCourse });
        if (!newBatch.name || !selectedCourse) return alert("Batch name required");

        if (!selectedCourse._id) {
            console.error("Selected course has no ID!", selectedCourse);
            return alert("Error: Selected course invalid.");
        }

        try {
            const res = await api.post(`/api/courses/${selectedCourse._id}/batches`, {
                name: newBatch.name,
                schedule: newBatch.schedule
            });
            // Update UI
            setCourses(courses.map(c => {
                if (c._id === selectedCourse._id) {
                    return { ...c, batches: [...(c.batches || []), res.data.batch] }; // backend returns { success: true, batch: ... }
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
        setEnrollStats(null);

        // Parse input (comma, newline, or space separated)
        const students = studentInput.split(/[\n, ]+/).map(s => s.trim()).filter(s => s);
        if (students.length === 0) return;

        try {
            const res = await api.post(`/api/batches/${batchToManage._id}/enroll`, { students });
            setEnrollStats(res.data.stats);
            setStudentInput("");

            // Update local state to reflect changes immediately
            const updatedBatch = res.data.batch;
            setBatchToManage(prev => ({ ...prev, students: updatedBatch.students }));

            // Update the main courses list too
            setCourses(prev => prev.map(c => {
                if (c._id === batchToManage.courseId) {
                    return {
                        ...c,
                        batches: c.batches.map(b => b._id === batchToManage._id ? updatedBatch : b)
                    };
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

            // Update local state
            setBatchToManage(prev => ({
                ...prev,
                students: prev.students.filter(s => s.username !== username)
            }));
            // Update main list
            setCourses(prev => prev.map(c => {
                if (c._id === batchToManage.courseId) {
                    return {
                        ...c,
                        batches: c.batches.map(b => {
                            if (b._id === batchToManage._id) {
                                return { ...b, students: b.students.filter(s => s.username !== username) };
                            }
                            return b;
                        })
                    };
                }
                return c;
            }));
        } catch (e) {
            alert("Failed to remove student");
        }
    };

    // --- COURSE ROSTER (Phase 18) ---
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

            // Sync main courses state
            setCourses(prev => prev.map(c => c._id === courseRosterData.id ? { ...c, enrolledStudents: res.data.enrolledStudents } : c));
        } catch (e) { alert("Failed to enroll student"); }
    };

    const handleRemoveCourseStudent = async (username) => {
        if (!window.confirm(`Remove ${username} from course roster?`)) return;
        try {
            const res = await api.delete(`/course/${courseRosterData.id}/enroll/${username}`);
            setCourseRosterData(prev => ({ ...prev, students: res.data.enrolledStudents }));

            // Sync main courses state
            setCourses(prev => prev.map(c => c._id === courseRosterData.id ? { ...c, enrolledStudents: res.data.enrolledStudents } : c));
        } catch (e) { alert("Failed to remove student"); }
    };

    return (
        <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '50px', position: 'relative' }}>
                <div>
                    <h1 style={{ fontSize: '32px', fontWeight: '900', color: '#fff', marginBottom: '8px', letterSpacing: '-1px' }}>
                        My <span style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Courses</span>
                    </h1>
                    <p style={{ color: '#94a3b8', fontSize: '16px', fontWeight: '500' }}>Manage your subjects, curriculum, and student batches.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    style={{
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontWeight: '700',
                        fontSize: '14px',
                        boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)',
                        transition: 'all 0.3s ease',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.6)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(37, 99, 235, 0.4)'; }}
                >
                    <FaPlus /> Create Course
                </button>
            </div>


            {/* COURSE GRID */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '30px',
                alignItems: 'stretch'
            }}>
                {courses.map(course => (
                    <div key={course._id}
                        style={{
                            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
                            backdropFilter: 'blur(12px)',
                            borderRadius: '20px',
                            padding: '28px',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            position: 'relative',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            height: '100%',
                            minHeight: '480px'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                            e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.5)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                            e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
                        }}
                    >
                        {/* Decorative Background Glow */}
                        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)', zIndex: 0 }}></div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
                            <span style={{
                                background: 'rgba(99, 102, 241, 0.15)',
                                color: '#a5b4fc',
                                padding: '6px 12px',
                                borderRadius: '10px',
                                fontSize: '12px',
                                fontWeight: '700',
                                letterSpacing: '0.5px',
                                border: '1px solid rgba(99, 102, 241, 0.2)'
                            }}>
                                {course.code}
                            </span>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ color: '#64748b', fontSize: '13px', fontWeight: '600' }}>{course.semester}</span>
                                <button
                                    onClick={() => openCourseRoster(course)}
                                    title="Manage Course Roster"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.2))',
                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                        color: '#60a5fa',
                                        cursor: 'pointer',
                                        padding: '5px 10px',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        fontWeight: '800',
                                        textTransform: 'uppercase',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'; }}
                                >
                                    Roster
                                </button>
                                <button
                                    onClick={() => handleDeleteCourse(course._id, course.name, course.batches?.reduce((acc, b) => acc + (b.students?.length || 0), 0))}
                                    title="Delete Course"
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', opacity: 0.6, transition: 'opacity 0.2s' }}
                                    onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                                    onMouseOut={(e) => e.currentTarget.style.opacity = 0.6}
                                >
                                    <FaTrash size={14} />
                                </button>
                            </div>
                        </div>

                        <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', marginBottom: '8px', position: 'relative', zIndex: 1 }}>{course.name}</h3>
                        <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px', height: '40px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: '1.5', position: 'relative', zIndex: 1 }}>
                            {course.description || "No description provided."}
                        </p>


                        {/* BATCHES LIST */}
                        <div style={{
                            background: 'rgba(15, 23, 42, 0.5)',
                            borderRadius: '16px',
                            padding: '16px',
                            marginBottom: '20px',
                            border: '1px solid rgba(255,255,255,0.05)',
                            position: 'relative',
                            zIndex: 1,
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: '180px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ fontSize: '11px', fontWeight: '900', color: '#6366f1', letterSpacing: '1px', textTransform: 'uppercase' }}>STUDENT BATCHES</div>
                                <button
                                    onClick={() => { setSelectedCourse(course); setShowBatchModal(true); }}
                                    style={{ background: 'rgba(99, 102, 241, 0.1)', border: 'none', color: '#818cf8', fontSize: '11px', cursor: 'pointer', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', transition: 'all 0.2s' }}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                                >
                                    + Add New
                                </button>
                            </div>
                            {course.batches && course.batches.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {course.batches.map(b => (
                                        <div key={b._id} style={{
                                            background: 'rgba(51, 65, 85, 0.4)',
                                            padding: '10px 14px',
                                            borderRadius: '12px',
                                            fontSize: '13px',
                                            color: '#e2e8f0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            transition: 'transform 0.2s ease'
                                        }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(51, 65, 85, 0.6)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(51, 65, 85, 0.4)'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FaUsers size={14} color="#6366f1" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '700' }}>{b.name}</div>
                                                    <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '500' }}>{b.students?.length || 0} students enrolled</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => openStudentModal(course, b)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    color: '#fff',
                                                    fontSize: '11px',
                                                    padding: '5px 12px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontWeight: '600',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }}
                                            >
                                                Manage
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '20px 0', background: 'rgba(0,0,0,0.1)', borderRadius: '12px' }}>
                                    No batches yet.
                                </div>
                            )}
                        </div>

                        <button style={{
                            width: '100%',
                            padding: '14px',
                            background: 'rgba(99, 102, 241, 0.1)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            color: '#a5b4fc',
                            borderRadius: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            fontSize: '14px',
                            fontWeight: '700',
                            marginTop: 'auto',
                            transition: 'all 0.3s',
                            position: 'relative',
                            zIndex: 1
                        }}
                            onMouseOver={(e) => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#fff'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'; e.currentTarget.style.color = '#a5b4fc'; }}
                        >
                            View Details <FaArrowRight size={14} />
                        </button>
                    </div>

                ))}
            </div>

            {/* CREATE COURSE MODAL */}
            {showCreateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ background: '#1e293b', padding: '40px', borderRadius: '24px', width: '450px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                        <h2 style={{ color: '#fff', marginBottom: '25px', fontSize: '24px', fontWeight: '800' }}>Create New Course</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <input
                                placeholder="Course Name (e.g. Python)"
                                value={newCourse.name}
                                onChange={e => setNewCourse({ ...newCourse, name: e.target.value })}
                                style={{ width: '100%', padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', fontSize: '15px' }}
                            />
                            <input
                                placeholder="Course Code (e.g. CS101)"
                                value={newCourse.code}
                                onChange={e => setNewCourse({ ...newCourse, code: e.target.value })}
                                style={{ width: '100%', padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', fontSize: '15px' }}
                            />
                            <input
                                placeholder="Semester (e.g. Sem 1)"
                                value={newCourse.semester}
                                onChange={e => setNewCourse({ ...newCourse, semester: e.target.value })}
                                style={{ width: '100%', padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', fontSize: '15px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
                            <button onClick={handleCreateCourse} style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '16px' }}>Create Course</button>
                            <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '14px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}


            {/* ADD BATCH MODAL */}
            {showBatchModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ background: '#1e293b', padding: '40px', borderRadius: '24px', width: '450px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                        <h2 style={{ color: '#fff', marginBottom: '10px', fontSize: '24px', fontWeight: '800' }}>Add Batch</h2>
                        <p style={{ color: '#94a3b8', marginBottom: '25px', fontSize: '14px' }}>to {selectedCourse?.name} ({selectedCourse?.code})</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <input
                                placeholder="Batch Name (e.g. Batch A)"
                                value={newBatch.name}
                                onChange={e => setNewBatch({ ...newBatch, name: e.target.value })}
                                style={{ width: '100%', padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', fontSize: '15px' }}
                            />
                            <div style={{ display: 'flex', gap: '15px' }}>
                                <input
                                    placeholder="Day"
                                    value={newBatch.schedule.day}
                                    onChange={e => setNewBatch({ ...newBatch, schedule: { ...newBatch.schedule, day: e.target.value } })}
                                    style={{ flex: 1, padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', fontSize: '15px' }}
                                />
                                <input
                                    placeholder="Time"
                                    value={newBatch.schedule.time}
                                    onChange={e => setNewBatch({ ...newBatch, schedule: { ...newBatch.schedule, time: e.target.value } })}
                                    style={{ flex: 1, padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', fontSize: '15px' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
                            <button onClick={handleCreateBatch} style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', fontSize: '16px' }}>Add Batch</button>
                            <button onClick={() => setShowBatchModal(false)} style={{ flex: 1, padding: '14px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}


            {/* MANAGE STUDENTS MODAL */}
            {showStudentModal && batchToManage && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ background: '#1e293b', padding: '40px', borderRadius: '28px', width: '700px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 70px -10px rgba(0, 0, 0, 0.7)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <div>
                                <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '900' }}>Manage Students</h2>
                                <p style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>{batchToManage.courseName} <span style={{ color: '#6366f1' }}>•</span> {batchToManage.name}</p>
                            </div>
                            <button onClick={() => setShowStudentModal(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', width: '40px', height: '40px', borderRadius: '12px', fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8'; }}>×</button>
                        </div>

                        <div style={{ display: 'flex', gap: '30px', flexDirection: 'column' }}>
                            {/* Enroll Section */}
                            <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '24px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ color: '#fff', marginBottom: '8px', fontSize: '16px', fontWeight: '700' }}>Quick Enroll</h4>
                                <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '15px' }}>Enter usernames separated by commas, spaces, or newlines.</p>
                                <textarea
                                    value={studentInput}
                                    onChange={e => setStudentInput(e.target.value)}
                                    placeholder="alice, bob, charlie..."
                                    style={{ width: '100%', height: '100px', padding: '16px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '14px', resize: 'vertical', fontFamily: 'monospace', fontSize: '14px', transition: 'border-color 0.2s' }}
                                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                    onBlur={(e) => e.target.style.borderColor = '#334155'}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                    <button onClick={handleEnrollStudents} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>Enroll Students</button>
                                </div>
                                {enrollStats && (
                                    <div style={{ marginTop: '15px', padding: '15px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)', fontSize: '13px' }}>
                                        {enrollStats.success.length > 0 && <div style={{ color: '#4ade80', fontWeight: '600' }}>✓ Successfully enrolled: {enrollStats.success.join(', ')}</div>}
                                        {enrollStats.failed.length > 0 && (
                                            <div style={{ color: '#fb7185', marginTop: '8px', fontWeight: '600' }}>
                                                ✕ Failed:
                                                <ul style={{ margin: '4px 0 0 20px', padding: 0, fontWeight: '400' }}>
                                                    {enrollStats.failed.map((f, i) => <li key={i}>{f.username}: {f.reason}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Current Students List */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                    <h4 style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>Batch Roster</h4>
                                    <span style={{ background: '#334155', color: '#94a3b8', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{batchToManage.students?.length || 0} Students</span>
                                </div>
                                <div style={{ maxHeight: '350px', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                    {batchToManage.students && batchToManage.students.length > 0 ? (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(0,0,0,0.2)', textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                    <th style={{ padding: '15px 20px' }}>Student</th>
                                                    <th style={{ padding: '15px 20px' }}>Joined</th>
                                                    <th style={{ padding: '15px 20px', textAlign: 'right' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {batchToManage.students.map(s => (
                                                    <tr key={s.username} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                                                        <td style={{ padding: '15px 20px' }}>
                                                            <div style={{ fontWeight: '700' }}>{s.username}</div>
                                                            <div style={{ fontSize: '12px', color: '#64748b' }}>{s.email || '-'}</div>
                                                        </td>
                                                        <td style={{ padding: '15px 20px', color: '#94a3b8' }}>{new Date(s.enrollmentDate).toLocaleDateString()}</td>
                                                        <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                                                            <button
                                                                onClick={() => handleRemoveStudent(s.username)}
                                                                style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '6px 12px', borderRadius: '8px', fontWeight: '600', transition: 'all 0.2s' }}
                                                                onMouseOver={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                                                                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>No students enrolled yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* MANAGE COURSE ROSTER MODAL (Phase 18) */}
            {showCourseRosterModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ background: '#1e293b', padding: '40px', borderRadius: '28px', width: '550px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 70px -10px rgba(0, 0, 0, 0.7)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h2 style={{ color: '#fff', fontSize: '24px', fontWeight: '900' }}>Course Roster: <span style={{ color: '#6366f1' }}>{courseRosterData.name}</span></h2>
                            <button onClick={() => setShowCourseRosterModal(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', width: '40px', height: '40px', borderRadius: '12px', fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        </div>

                        <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
                            <input
                                value={courseStudentInput}
                                onChange={e => setCourseStudentInput(e.target.value)}
                                placeholder="Student username..."
                                style={{ flex: 1, padding: '14px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '12px', fontSize: '15px' }}
                            />
                            <button onClick={handleEnrollCourseStudent} style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700' }}>Add to Roster</button>
                        </div>

                        <div style={{ maxHeight: '350px', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '20px', padding: '10px' }}>
                            {courseRosterData.students.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {courseRosterData.students.map(uname => (
                                        <div key={uname} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 20px', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{ fontWeight: '700' }}>{uname}</span>
                                            <button
                                                onClick={() => handleRemoveCourseStudent(uname)}
                                                style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}
                                                onMouseOver={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: '#64748b', textAlign: 'center', fontStyle: 'italic', padding: '30px' }}>No students enrolled in this course.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default CourseManager;
