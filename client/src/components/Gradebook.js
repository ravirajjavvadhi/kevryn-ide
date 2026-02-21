import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { FaEye, FaTimes, FaCheckCircle, FaTimesCircle, FaSearch } from 'react-icons/fa';

const Gradebook = ({ token, serverUrl }) => {
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [submissions, setSubmissions] = useState([]);
    const [filteredSubmissions, setFilteredSubmissions] = useState([]);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [filterText, setFilterText] = useState('');

    const api = axios.create({ baseURL: serverUrl, headers: { Authorization: token } });

    useEffect(() => {
        fetchCourses();
    }, []);

    useEffect(() => {
        if (selectedCourseId) {
            fetchSubmissions();
        } else {
            setSubmissions([]);
        }
    }, [selectedCourseId]);

    useEffect(() => {
        if (filterText) {
            setFilteredSubmissions(submissions.filter(s =>
                s.studentUsername.toLowerCase().includes(filterText.toLowerCase()) ||
                s.assignmentId?.title.toLowerCase().includes(filterText.toLowerCase())
            ));
        } else {
            setFilteredSubmissions(submissions);
        }
    }, [submissions, filterText]);

    const fetchCourses = async () => {
        try {
            const res = await api.get('/api/courses');
            setCourses(res.data);
            if (res.data.length > 0) setSelectedCourseId(res.data[0]._id);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchSubmissions = async () => {
        try {
            const res = await api.get(`/api/assignments/course/${selectedCourseId}/submissions`);
            setSubmissions(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div style={{ padding: '20px', color: '#e2e8f0', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Gradebook</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ position: 'relative' }}>
                        <FaSearch style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                        <input
                            placeholder="Search Student..."
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            style={{ padding: '8px 8px 8px 30px', borderRadius: '4px', background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                        />
                    </div>
                    <select
                        value={selectedCourseId}
                        onChange={e => setSelectedCourseId(e.target.value)}
                        style={{ padding: '8px', borderRadius: '4px', background: '#334155', color: '#fff', border: 'none' }}
                    >
                        {courses.map(c => <option key={c._id} value={c._id}>{c.name} ({c.code})</option>)}
                    </select>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#0f172a', position: 'sticky', top: 0 }}>
                        <tr>
                            <th style={{ padding: '12px', borderBottom: '1px solid #334155' }}>Student</th>
                            <th style={{ padding: '12px', borderBottom: '1px solid #334155' }}>Assignment</th>
                            <th style={{ padding: '12px', borderBottom: '1px solid #334155' }}>Status</th>
                            <th style={{ padding: '12px', borderBottom: '1px solid #334155' }}>Score</th>
                            <th style={{ padding: '12px', borderBottom: '1px solid #334155' }}>Submitted</th>
                            <th style={{ padding: '12px', borderBottom: '1px solid #334155' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSubmissions.length === 0 ? (
                            <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No submissions found.</td></tr>
                        ) : (
                            filteredSubmissions.map(s => (
                                <tr key={s._id} style={{ borderBottom: '1px solid #334155' }}>
                                    <td style={{ padding: '12px' }}>{s.studentUsername}</td>
                                    <td style={{ padding: '12px' }}>{s.assignmentId?.title || 'Unknown'}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{
                                            padding: '4px 8px', borderRadius: '12px', fontSize: '12px',
                                            background: s.status === 'submitted' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                                            color: s.status === 'submitted' ? '#22c55e' : '#eab308'
                                        }}>
                                            {s.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>
                                        {s.score} / {s.maxScore}
                                    </td>
                                    <td style={{ padding: '12px', color: '#94a3b8', fontSize: '13px' }}>
                                        {new Date(s.submittedAt).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <button
                                            onClick={() => setSelectedSubmission(s)}
                                            style={{ background: 'transparent', border: '1px solid #475569', color: '#fff', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <FaEye /> View Code
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* View Code Modal */}
            {selectedSubmission && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div style={{ background: '#0f172a', width: '900px', height: '80vh', display: 'flex', flexDirection: 'column', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                        <div style={{ padding: '15px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>{selectedSubmission.assignmentId?.title} - {selectedSubmission.studentUsername}</h3>
                                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                                    Score: {selectedSubmission.score}/{selectedSubmission.maxScore}
                                </div>
                            </div>
                            <button onClick={() => setSelectedSubmission(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><FaTimes size={18} /></button>
                        </div>

                        <div style={{ flex: 1, display: 'flex' }}>
                            {/* Editor */}
                            <div style={{ flex: 1, borderRight: '1px solid #334155' }}>
                                <Editor
                                    height="100%"
                                    defaultLanguage="python" // TODO: Detect language
                                    theme="vs-dark"
                                    value={selectedSubmission.submittedCode}
                                    options={{ readOnly: true, minimap: { enabled: false } }}
                                />
                            </div>

                            {/* Test Results */}
                            <div style={{ width: '300px', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '10px', background: '#1e293b', borderBottom: '1px solid #334155', fontWeight: 'bold', fontSize: '13px' }}>Test Results</div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                                    {selectedSubmission.testResults.map((r, i) => (
                                        <div key={i} style={{ marginBottom: '10px', padding: '10px', borderRadius: '6px', background: r.pass ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderLeft: `3px solid ${r.pass ? '#22c55e' : '#ef4444'}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>Test Case {i + 1}</span>
                                                {r.pass ? <FaCheckCircle color="#22c55e" /> : <FaTimesCircle color="#ef4444" />}
                                            </div>
                                            {!r.pass && (
                                                <div style={{ fontSize: '12px', fontFamily: 'monospace', marginTop: '6px' }}>
                                                    <div style={{ color: '#ef4444' }}>Error: {r.error || 'Output Mismatch'}</div>
                                                    <div>Actual: {r.actualOutput}</div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Gradebook;
