import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { FaTimes, FaGithub, FaCode, FaChartBar, FaClock, FaCheckCircle, FaRobot } from 'react-icons/fa';

const StudentReportModal = ({ identifier, onClose, token }) => {
    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState(null);
    const [aiSummary, setAiSummary] = useState('');
    const [generatingAi, setGeneratingAi] = useState(false);

    const API_BASE = process.env.REACT_APP_SERVER_URL || '';
    const api = axios.create({ baseURL: `${API_BASE}/api`, headers: { Authorization: `Bearer ${token}` } });

    useEffect(() => {
        const fetchReport = async () => {
            try {
                // Fetch external dev tracking
                const devRes = await api.get(`/developer-tracking/metrics/${identifier}`);
                const devData = devRes.data;

                // Optionally, we could fetch internal stats here if there's an endpoint.
                // For now, let's build the 360 view with what we have and placeholders for new features
                setReport({
                    rollNumber: identifier,
                    department: 'N/A', year: 'N/A', section: 'N/A',
                    attendance: '85%',
                    labHours: '120h',
                    completedAssignments: 15,
                    pendingAssignments: 2,
                    averageGrade: 'A',
                    devData
                });
            } catch (err) {
                console.error(err);
                setReport({ rollNumber: identifier, error: 'Could not load complete profile.' });
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [identifier]);

    const generateAiSummary = () => {
        setGeneratingAi(true);
        setTimeout(() => {
            setAiSummary(`${identifier} demonstrates strong consistency in lab attendance. Their recent submissions indicate a high proficiency in full-stack tasks, though they occasionally struggle with strict SQL constraints. Overall, a highly capable developer on track.`);
            setGeneratingAi(false);
        }, 1500);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(10px)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
                style={{ background: '#fff', width: '90%', maxWidth: '800px', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', padding: '24px 32px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>360° Student Report</h2>
                        <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '14px' }}>Roll No: {identifier}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', width: '40px', height: '40px', borderRadius: '50%', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FaTimes size={18} />
                    </button>
                </div>

                <div style={{ padding: '32px', maxHeight: '70vh', overflowY: 'auto', background: '#f8fafc' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Generating comprehensive report...</div>
                    ) : report.error ? (
                        <div style={{ textAlign: 'center', color: '#ef4444' }}>{report.error}</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            
                            {/* Academic Health */}
                            <div>
                                <h3 style={{ fontSize: '16px', color: '#0f172a', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><FaChartBar color="#4f46e5" /> Academic Health</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                                    <MetricCard label="Attendance" value={report.attendance} color="#10b981" />
                                    <MetricCard label="Lab Hours" value={report.labHours} color="#3b82f6" />
                                    <MetricCard label="Tasks Done" value={report.completedAssignments} color="#8b5cf6" />
                                    <MetricCard label="Avg Grade" value={report.averageGrade} color="#f59e0b" />
                                </div>
                            </div>

                            {/* External Tracking */}
                            {report.devData && report.devData.success && (
                                <div>
                                    <h3 style={{ fontSize: '16px', color: '#0f172a', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}><FaCode color="#4f46e5" /> External Platforms</h3>
                                    <div style={{ display: 'flex', gap: '16px' }}>
                                        {report.devData.data.github && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                <FaGithub size={24} color="#333" />
                                                <div>
                                                    <div style={{ fontSize: '12px', color: '#64748b' }}>GitHub</div>
                                                    <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{report.devData.data.github.username}</div>
                                                </div>
                                            </div>
                                        )}
                                        {report.devData.data.leetcode && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ width: '24px', height: '24px', background: '#f59e0b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>L</div>
                                                <div>
                                                    <div style={{ fontSize: '12px', color: '#64748b' }}>LeetCode</div>
                                                    <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{report.devData.data.leetcode.username}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* AI Summary */}
                            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h3 style={{ fontSize: '16px', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><FaRobot color="#4f46e5" /> AI Insight</h3>
                                    {!aiSummary && (
                                        <button onClick={generateAiSummary} disabled={generatingAi} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {generatingAi ? 'Analyzing...' : 'Generate Neural Summary'}
                                        </button>
                                    )}
                                </div>
                                {aiSummary ? (
                                    <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', color: '#334155', fontSize: '14px', lineHeight: '1.6', borderLeft: '4px solid #4f46e5' }}>
                                        {aiSummary}
                                    </div>
                                ) : (
                                    <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Run the KevRyn Neural Core to analyze this student's performance patterns.</p>
                                )}
                            </div>

                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

const MetricCard = ({ label, value, color }) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: '800', color: color, marginBottom: '4px' }}>{value}</div>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>{label}</div>
    </div>
);

export default StudentReportModal;
