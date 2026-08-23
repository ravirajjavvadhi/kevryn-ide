import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { FaPlus, FaTrash, FaSave, FaCode, FaPython, FaJs, FaJava, FaCalendarAlt, FaFlask, FaStar, FaFire } from 'react-icons/fa';

const AssignmentManager = ({ token, serverUrl, userId, preSelectedCohort }) => {
    const [cohorts, setCohorts] = useState([]);
    const [selectedCohort, setSelectedCohort] = useState('');
    const [assignments, setAssignments] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingAssignmentId, setEditingAssignmentId] = useState(null);

    // Submissions State
    const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
    const [selectedAssignmentSubmissions, setSelectedAssignmentSubmissions] = useState([]);
    const [selectedSubmission, setSelectedSubmission] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        language: 'python',
        starterCode: '# Write your code here\n',
        points: 100,
        startTime: '',
        endTime: '',
        difficulty: 'Medium',
        testCases: [{ input: '', expectedOutput: '', isHidden: false, points: 10 }]
    });

    const api = axios.create({ baseURL: serverUrl, headers: { Authorization: token } });

    useEffect(() => {
        fetchCohorts();
    }, []);

    useEffect(() => {
        if (selectedCohort) fetchAssignments();
    }, [selectedCohort]);

    const fetchCohorts = async () => {
        try {
            const res = await api.get('/api/timetable/my-schedule/faculty');
            const schedule = res.data.schedule || res.data || [];
            const uniqueMap = new Map();
            if (Array.isArray(schedule)) {
                schedule.forEach(item => {
                    if (item.department && item.year && item.section && item.subjectName) {
                        const key = `${item.department}-${item.year}-${item.section}-${item.subjectName}`;
                        if (!uniqueMap.has(key)) {
                            uniqueMap.set(key, {
                                targetDepartment: item.department,
                                targetYear: item.year,
                                targetSection: item.section,
                                subjectName: item.subjectName
                            });
                        }
                    }
                });
            }
            const uniqueCohorts = Array.from(uniqueMap.values());
            setCohorts(uniqueCohorts);
            if (preSelectedCohort) {
                // Find matching cohort from the list
                const match = uniqueCohorts.find(c => 
                    c.targetDepartment === preSelectedCohort.department && 
                    c.targetYear === preSelectedCohort.year && 
                    c.targetSection === preSelectedCohort.section && 
                    c.subjectName === preSelectedCohort.subjectName
                );
                if (match) {
                    setSelectedCohort(JSON.stringify(match));
                } else if (uniqueCohorts.length > 0) {
                    setSelectedCohort(JSON.stringify(uniqueCohorts[0]));
                }
            } else if (uniqueCohorts.length > 0) {
                setSelectedCohort(JSON.stringify(uniqueCohorts[0]));
            }
        } catch (e) {
            console.error("Failed to fetch cohorts:", e);
        }
    };

    const fetchAssignments = async () => {
        try {
            if (!selectedCohort) return;
            const parsed = JSON.parse(selectedCohort);
            const res = await api.get(`/api/assignments/cohort-assignments`, { params: parsed });
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

    const fetchSubmissions = async (assignmentId) => {
        try {
            const res = await api.get(`/api/assignments/${assignmentId}/submissions`);
            setSelectedAssignmentSubmissions(res.data);
            setSelectedSubmission(null);
            setShowSubmissionsModal(true);
        } catch (e) {
            alert("Failed to load submissions: " + (e.response?.data?.error || e.message));
        }
    };

    const handleSubmit = async () => {
        if (!formData.title) return alert("Title is required");
        if (!formData.startTime || !formData.endTime) return alert("Start Time and End Time are strictly required before publishing.");
        if (!selectedCohort) return alert("Please select a cohort");
        try {
            const parsedCohort = JSON.parse(selectedCohort);
            const payload = { ...formData, ...parsedCohort };
            
            if (payload.startTime) payload.startTime = new Date(payload.startTime).toISOString();
            if (payload.endTime) payload.endTime = new Date(payload.endTime).toISOString();

            if (isEditing && editingAssignmentId) {
                await api.put(`/api/assignments/${editingAssignmentId}`, payload);
                alert("Assignment Updated!");
            } else {
                await api.post('/api/assignments', payload);
                alert("Assignment Created!");
            }
            setShowCreateModal(false);
            setIsEditing(false);
            setEditingAssignmentId(null);
            fetchAssignments();
        } catch (e) {
            alert("Failed to save assignment: " + (e.response?.data?.error || e.message));
        }
    };

    const getLocalDatetimeLocal = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (isNaN(d)) return '';
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    };

    const handleEditClick = (assignment) => {
        setFormData({
            title: assignment.title,
            description: assignment.description,
            language: assignment.language,
            starterCode: assignment.starterCode,
            testCases: assignment.testCases,
            points: assignment.maxPoints || 100,
            startTime: getLocalDatetimeLocal(assignment.startTime),
            endTime: getLocalDatetimeLocal(assignment.endTime),
            difficulty: assignment.difficulty || 'Medium'
        });
        setEditingAssignmentId(assignment._id);
        setIsEditing(true);
        setShowCreateModal(true);
    };

    const handleCreateClick = () => {
        setFormData({
            title: '', description: '', language: 'python', starterCode: '',
            testCases: [], points: 100, startTime: '', endTime: '', difficulty: 'Medium'
        });
        setIsEditing(false);
        setEditingAssignmentId(null);
        setShowCreateModal(true);
    };

    return (
        <div style={{ padding: '20px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Assignment Manager</h2>
                <select
                    value={selectedCohort}
                    onChange={e => setSelectedCohort(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', background: '#334155', color: '#fff', border: 'none' }}
                >
                    {cohorts.map((c, i) => (
                        <option key={i} value={JSON.stringify(c)}>
                            {c.targetDepartment} - Yr {c.targetYear} - Sec {c.targetSection} ({c.subjectName})
                        </option>
                    ))}
                </select>
            </div>

            <button
                onClick={handleCreateClick}
                style={{ marginBottom: '20px', padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
                <FaPlus /> Create Assignment
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {assignments.map(a => {
                    const diffColors = {
                        'Easy': { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', border: 'rgba(16, 185, 129, 0.2)' },
                        'Medium': { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.2)' },
                        'Hard': { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.2)' }
                    };
                    const diff = diffColors[a.difficulty || 'Medium'];
                    
                    return (
                    <div key={a._id} style={{ background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)', padding: '24px', borderRadius: '16px', border: '1px solid #334155', position: 'relative', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#f8fafc', paddingRight: '160px' }}>{a.title}</h3>
                            <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '10px' }}>
                                <button 
                                    onClick={() => fetchSubmissions(a._id)}
                                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'all 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                                >
                                    SUBMISSIONS
                                </button>
                                <button 
                                    onClick={() => handleEditClick(a)}
                                    style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'all 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                                >
                                    EDIT
                                </button>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', background: diff.bg, color: diff.text, border: `1px solid ${diff.border}`, padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FaFire size={10} /> {a.difficulty || 'Medium'}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.2)', padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FaCode size={10} /> {a.language === 'any' ? 'Any Lang' : a.language.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.2)', padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FaStar size={10} /> {a.maxPoints} Pts
                            </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #334155', paddingTop: '15px', color: '#94a3b8', fontSize: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FaCalendarAlt color="#64748b" /> {a.startTime ? new Date(a.startTime).toLocaleString() : 'No Start'} - {a.endTime ? new Date(a.endTime).toLocaleString() : 'No End'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FaFlask color="#64748b" /> {a.testCases.length} Tests
                            </div>
                        </div>
                    </div>
                )})}
            </div>

            {showCreateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#0f172a', width: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '30px', borderRadius: '12px', border: '1px solid #334155' }}>
                        <h2 style={{ marginBottom: '25px', color: '#f8fafc', fontSize: '24px', fontWeight: '800', borderBottom: '1px solid #1e293b', paddingBottom: '15px' }}>
                            {isEditing ? 'Configure Assignment' : 'Create New Assignment'}
                        </h2>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>Language Restriction</label>
                                <select 
                                    value={formData.language} 
                                    onChange={e => setFormData({ ...formData, language: e.target.value })}
                                    style={{ padding: '12px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                >
                                    <option value="any">Any Language</option>
                                    <option value="python">Python</option>
                                    <option value="javascript">JavaScript</option>
                                    <option value="c">C</option>
                                    <option value="cpp">C++</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>Difficulty</label>
                                <select 
                                    value={formData.difficulty} 
                                    onChange={e => setFormData({ ...formData, difficulty: e.target.value })}
                                    style={{ padding: '12px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                >
                                    <option value="Easy">Easy</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Hard">Hard</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>Title</label>
                                <input
                                    placeholder="e.g. Two Sum"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    style={{ padding: '12px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>Max Points</label>
                                <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
                                    <input
                                        type="number"
                                        value={formData.points}
                                        onChange={e => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                                        style={{ padding: '12px', background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>Start Time</label>
                                <input
                                    type="datetime-local"
                                    value={formData.startTime}
                                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                    style={{ padding: '11px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>End Time</label>
                                <input
                                    type="datetime-local"
                                    value={formData.endTime}
                                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                    style={{ padding: '11px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '20px' }}>
                            <label style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>Description (Markdown Supported)</label>
                            <textarea
                                placeholder="Write the problem statement, constraints, and examples here..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                style={{ width: '100%', height: '120px', padding: '12px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', outline: 'none', fontFamily: 'monospace' }}
                            />
                        </div>

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
                                    <input placeholder="Input (Leave blank if not needed)" value={tc.input} onChange={e => handleTestCaseChange(i, 'input', e.target.value)} style={{ flex: 1, padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
                                    <input placeholder="Expected Output (Required)" value={tc.expectedOutput} onChange={e => handleTestCaseChange(i, 'expectedOutput', e.target.value)} style={{ flex: 1, padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
                                    <button onClick={() => removeTestCase(i)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}><FaTrash /></button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px', background: 'transparent', color: '#94a3b8', border: '1px solid #475569', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSubmit} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><FaSave /> {isEditing ? 'Update Assignment' : 'Save Assignment'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Submissions Modal */}
            {showSubmissionsModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#0f172a', width: '900px', height: '80vh', display: 'flex', flexDirection: 'column', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                        
                        <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>Assignment Submissions</h2>
                            <button onClick={() => setShowSubmissionsModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                        </div>

                        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                            {/* Left Side: Student List */}
                            <div style={{ width: '250px', borderRight: '1px solid #1e293b', overflowY: 'auto', background: '#0f172a' }}>
                                {selectedAssignmentSubmissions.length === 0 ? (
                                    <div style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>No submissions yet.</div>
                                ) : (
                                    selectedAssignmentSubmissions.map(sub => (
                                        <div 
                                            key={sub._id}
                                            onClick={() => setSelectedSubmission(sub)}
                                            style={{ 
                                                padding: '15px', 
                                                cursor: 'pointer', 
                                                borderBottom: '1px solid #1e293b',
                                                background: selectedSubmission?._id === sub._id ? '#1e293b' : 'transparent',
                                                transition: 'background 0.2s'
                                            }}
                                        >
                                            <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>{sub.studentUsername}</div>
                                            <div style={{ fontSize: '12px', color: sub.score > 0 ? '#4ade80' : '#ef4444', marginTop: '4px' }}>Score: {sub.score} / {sub.assignmentId?.maxPoints || 100}</div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Right Side: Code Viewer */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
                                {selectedSubmission ? (
                                    <>
                                        <div style={{ padding: '15px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: '#e2e8f0' }}>Code by {selectedSubmission.studentUsername}</strong>
                                            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Submitted at: {new Date(selectedSubmission.submittedAt).toLocaleString()}</span>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <Editor
                                                height="100%"
                                                theme="vs-dark"
                                                language="python"
                                                value={selectedSubmission.submittedCode || "// No code submitted"}
                                                options={{ readOnly: true, minimap: { enabled: false } }}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#64748b' }}>
                                        Select a student to view their perfect code.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AssignmentManager;
