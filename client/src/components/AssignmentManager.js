import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { FaPlus, FaTrash, FaSave } from 'react-icons/fa';

const AssignmentManager = ({ token, serverUrl, userId }) => {
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [assignments, setAssignments] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        language: 'python',
        starterCode: '# Write your code here\n',
        points: 100,
        dueDate: '',
        testCases: [{ input: '', expectedOutput: '', isHidden: false, points: 10 }]
    });

    const api = axios.create({ baseURL: serverUrl, headers: { Authorization: token } });

    useEffect(() => {
        fetchCourses();
    }, []);

    useEffect(() => {
        if (selectedCourseId) fetchAssignments();
    }, [selectedCourseId]);

    const fetchCourses = async () => {
        try {
            const res = await api.get('/api/courses');
            setCourses(res.data);
            if (res.data.length > 0) setSelectedCourseId(res.data[0]._id);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchAssignments = async () => {
        try {
            const res = await api.get(`/api/assignments/course/${selectedCourseId}`);
            setAssignments(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleTestCaseChange = (index, field, value) => {
        const newCases = [...formData.testCases];
        newCases[index][field] = value;
        setFormData({ ...formData, testCases: newCases });
    };

    const addTestCase = () => {
        setFormData({
            ...formData,
            testCases: [...formData.testCases, { input: '', expectedOutput: '', isHidden: false, points: 10 }]
        });
    };

    const removeTestCase = (index) => {
        const newCases = formData.testCases.filter((_, i) => i !== index);
        setFormData({ ...formData, testCases: newCases });
    };

    const handleSubmit = async () => {
        if (!formData.title) return alert("Title is required");
        try {
            await api.post('/api/assignments', { ...formData, courseId: selectedCourseId });
            setShowCreateModal(false);
            fetchAssignments();
            alert("Assignment Created!");
        } catch (e) {
            alert("Failed to create assignment: " + (e.response?.data?.error || e.message));
        }
    };

    return (
        <div style={{ padding: '20px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Assignment Manager</h2>
                <select
                    value={selectedCourseId}
                    onChange={e => setSelectedCourseId(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', background: '#334155', color: '#fff', border: 'none' }}
                >
                    {courses.map(c => <option key={c._id} value={c._id}>{c.name} ({c.code})</option>)}
                </select>
            </div>

            <button
                onClick={() => setShowCreateModal(true)}
                style={{ marginBottom: '20px', padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
                <FaPlus /> Create Assignment
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {assignments.map(a => (
                    <div key={a._id} style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
                        <h3>{a.title}</h3>
                        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Due: {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'No due date'}</p>
                        <div style={{ marginTop: '10px', fontSize: '12px', color: '#cbd5e1' }}>
                            {a.testCases.length} Test Cases | {a.maxPoints} Points
                        </div>
                    </div>
                ))}
            </div>

            {showCreateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#0f172a', width: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '30px', borderRadius: '12px', border: '1px solid #334155' }}>
                        <h2 style={{ marginBottom: '20px' }}>Create Assignment</h2>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '15px' }}>
                            <input
                                placeholder="Title"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                style={{ padding: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '6px' }}
                            />
                            <input
                                type="date"
                                value={formData.dueDate}
                                onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                style={{ padding: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '6px' }}
                            />
                        </div>

                        <textarea
                            placeholder="Description (Markdown supported)"
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            style={{ width: '100%', height: '100px', padding: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '6px', marginBottom: '15px' }}
                        />

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8' }}>Starter Code ({formData.language})</label>
                            <div style={{ height: '200px', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
                                <Editor
                                    height="100%"
                                    defaultLanguage="python"
                                    theme="vs-dark"
                                    value={formData.starterCode}
                                    onChange={val => setFormData({ ...formData, starterCode: val })}
                                    options={{ minimap: { enabled: false } }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h4>Test Cases</h4>
                                <button onClick={addTestCase} style={{ background: '#334155', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>+ Add Case</button>
                            </div>
                            {formData.testCases.map((tc, i) => (
                                <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                    <input placeholder="Input" value={tc.input} onChange={e => handleTestCaseChange(i, 'input', e.target.value)} style={{ flex: 1, padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
                                    <input placeholder="Expected Output" value={tc.expectedOutput} onChange={e => handleTestCaseChange(i, 'expectedOutput', e.target.value)} style={{ flex: 1, padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
                                    <button onClick={() => removeTestCase(i)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}><FaTrash /></button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSubmit} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><FaSave /> Save Assignment</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AssignmentManager;
