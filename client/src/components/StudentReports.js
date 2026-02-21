import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
    FaBook, FaUser, FaCode, FaFilePdf, FaClock, FaCalendar, FaSearch,
    FaShieldAlt, FaChartBar, FaTasks, FaCheckCircle, FaExclamationTriangle,
    FaArrowRight, FaDownload, FaBrain, FaFingerprint, FaRobot
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const StudentReports = ({ token, serverUrl }) => {
    const reportRef = useRef(null);
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [reports, setReports] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [studentSubmissions, setStudentSubmissions] = useState([]);
    const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const api = useMemo(() => {
        return axios.create({ baseURL: serverUrl, headers: { Authorization: token } });
    }, [serverUrl, token]);

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const res = await api.get('/api/courses');
                setCourses(res.data);
            } catch (e) { console.error("Failed to fetch courses", e); }
        };
        fetchCourses();
    }, [api]);

    useEffect(() => {
        if (!selectedCourse) return;
        const fetchReports = async () => {
            try {
                const res = await api.get(`/lab/reports/${selectedCourse._id}`);
                setReports(res.data);
                setSelectedReport(null);
            } catch (e) {
                console.error("Failed to fetch reports", e);
                setReports([]);
            }
        };
        fetchReports();
    }, [selectedCourse, api]);

    useEffect(() => {
        if (!selectedReport || !selectedCourse) return;
        const fetchStudentSubmissions = async () => {
            setIsLoadingSubmissions(true);
            try {
                const username = selectedReport.studentId?.username;
                if (!username) return;
                const res = await api.get(`/api/assignments/course/${selectedCourse._id}/student/${username}`);
                setStudentSubmissions(res.data);
            } catch (e) {
                console.error("Failed to fetch submissions", e);
                setStudentSubmissions([]);
            } finally {
                setIsLoadingSubmissions(false);
            }
        };
        fetchStudentSubmissions();
    }, [selectedReport, selectedCourse, api]);

    const handleDownload = async (report) => {
        if (!report || !reportRef.current) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#020617',
                logging: false,
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [canvas.width / 2, canvas.height / 2]
            });

            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
            const studentName = report.studentId?.username || "Student";
            pdf.save(`KEVRYN_DOSSIER_${studentName}_${selectedCourse.code}.pdf`);
        } catch (error) {
            console.error("PDF Export failed:", error);
            alert("Export failed. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    const filteredReports = reports.filter(r =>
        r.studentId?.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- RENDER HELPERS ---
    const getIntegrityColor = (score) => {
        if (score >= 90) return '#10b981';
        if (score >= 70) return '#f59e0b';
        return '#ef4444';
    };

    return (
        <div style={{ display: 'flex', height: '100%', background: '#020617', color: '#e2e8f0', fontFamily: "'Outfit', sans-serif", overflow: 'hidden' }}>

            {/* --- SIDEBAR: ROSTER --- */}
            <div style={{
                width: '320px',
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(20px)',
                borderRight: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ padding: '30px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                        <FaChartBar color="#6366f1" size={20} />
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' }}>Performance Hub</h2>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>Course Select</label>
                        <select
                            onChange={(e) => {
                                const c = courses.find(course => course._id === e.target.value);
                                setSelectedCourse(c);
                            }}
                            value={selectedCourse?._id || ""}
                            style={{
                                width: '100%', padding: '12px', background: 'rgba(30, 41, 59, 0.5)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                                color: '#fff', fontSize: '14px', outline: 'none'
                            }}
                        >
                            <option value="">-- Choose Course --</option>
                            {courses.map(c => (
                                <option key={c._id} value={c._id}>{c.name} ({c.code})</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <FaSearch style={{ position: 'absolute', left: '14px', top: '14px', color: '#475569' }} size={14} />
                        <input
                            type="text"
                            placeholder="Student Identity..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(30, 41, 59, 0.5)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                                color: '#fff', fontSize: '14px'
                            }}
                        />
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                    {!selectedCourse ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#475569' }}>
                            <FaBook size={32} style={{ opacity: 0.1, marginBottom: '16px' }} />
                            <div style={{ fontSize: '13px' }}>Select a course to view roster analytics.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '8px' }}>
                            {filteredReports.map(report => (
                                <motion.div
                                    key={report._id}
                                    whileHover={{ x: 4, background: 'rgba(255,255,255,0.03)' }}
                                    onClick={() => setSelectedReport(report)}
                                    style={{
                                        padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                                        background: selectedReport?._id === report._id ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))' : 'transparent',
                                        border: selectedReport?._id === report._id ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '12px',
                                                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                                            }}>
                                                {report.studentId?.picture ? (
                                                    <img src={report.studentId.picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : <FaUser size={14} color="#475569" />}
                                            </div>
                                            <div style={{
                                                position: 'absolute', bottom: '-4px', right: '-4px',
                                                width: '14px', height: '14px', borderRadius: '50%',
                                                background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getIntegrityColor(report.attentionScore || 100) }} />
                                            </div>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ color: '#f8fafc', fontWeight: '700', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {report.studentId?.username || 'Redacted Student'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                                <span>⏱ {(report.totalTimeSpent / 60).toFixed(0)}m</span>
                                                <span style={{ color: report.attentionScore < 80 ? '#ef4444' : '#64748b' }}>🧠 {report.attentionScore || 100}%</span>
                                            </div>
                                        </div>
                                        <FaArrowRight size={10} color={selectedReport?._id === report._id ? '#6366f1' : 'transparent'} />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* --- MAIN CONTENT: BEAST REPORT --- */}
            <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                <AnimatePresence mode="wait">
                    {!selectedReport ? (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}
                        >
                            <div style={{
                                width: '120px', height: '120px', borderRadius: '40px',
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: '24px', border: '1px solid rgba(255,255,255,0.03)'
                            }}>
                                <FaShieldAlt size={48} color="#6366f1" style={{ opacity: 0.3 }} />
                            </div>
                            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#475569' }}>Select Student Identity</h3>
                            <p style={{ fontSize: '14px', color: '#334155' }}>High-fidelity performance dossier will be rendered here.</p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key={selectedReport._id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ padding: '40px 60px' }}
                            ref={reportRef}
                        >
                            {/* Beast Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <span style={{ padding: '4px 12px', background: 'rgba(99,102,241,0.1)', color: '#818cf8', borderRadius: '20px', fontSize: '11px', fontWeight: '800', letterSpacing: '1px' }}>KEVRYN IDE | VAYU ANALYTICS</span>
                                        <span style={{ fontSize: '11px', color: '#475569' }}>SESSION: {selectedCourse?.code} - {selectedCourse?.name}</span>
                                    </div>
                                    <h1 style={{ fontSize: '42px', fontWeight: '900', margin: 0, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>
                                        {selectedReport.studentId?.username}
                                    </h1>
                                    <div style={{ display: 'flex', gap: '24px', marginTop: '16px', color: '#94a3b8' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FaBook color="#6366f1" /> SUBJECT: {selectedCourse?.name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FaCalendar /> TIMELINE: {
                                                selectedReport.files.length > 0
                                                    ? new Date(Math.min(...selectedReport.files.map(f => new Date(f.lastUpdated).getTime()))).toLocaleDateString()
                                                    : new Date().toLocaleDateString()
                                            } - PRESENT
                                        </div>
                                    </div>
                                </div>
                                <motion.button
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    disabled={isExporting}
                                    onClick={() => handleDownload(selectedReport)}
                                    style={{
                                        background: isExporting ? '#475569' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                        color: '#fff', border: 'none', padding: '14px 28px', borderRadius: '14px',
                                        fontWeight: '800', fontSize: '14px', cursor: isExporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                        boxShadow: isExporting ? 'none' : '0 10px 30px rgba(99,102,241,0.3)', transition: 'all 0.2s'
                                    }}
                                >
                                    {isExporting ? <FaRobot className="spin-slow" /> : <FaDownload />}
                                    {isExporting ? 'GENERATING...' : 'EXPORT DOSSIER'}
                                </motion.button>
                            </div>

                            {/* Beast Metrics Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
                                <MetricCard icon={<FaClock color="#60a5fa" />} label="Engagement Time" value={`${(selectedReport.totalTimeSpent / 60).toFixed(1)}m`} trend="Cumulative" />
                                <MetricCard icon={<FaBrain color="#a78bfa" />} label="Focus Score" value={`${selectedReport.attentionScore || 100}%`} trend={selectedReport.attentionScore < 80 ? 'CRITICAL' : 'OPTIMAL'} color={getIntegrityColor(selectedReport.attentionScore || 100)} />
                                <MetricCard icon={<FaFingerprint color="#4ade80" />} label="Integrity Flags" value={selectedReport.tabSwitchCount || 0} trend="Tab Switches" subValue={`${selectedReport.pasteCount || 0} Pastes`} />
                                <MetricCard icon={<FaTasks color="#fbbf24" />} label="Assignments" value={studentSubmissions.length} trend="Total Submissions" />
                            </div>

                            {/* Two Column Section */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '30px' }}>

                                {/* Left: Code History */}
                                <div>
                                    <SectionTitle icon={<FaCode />} title="Development Archive" subtitle="Recent code captures and modifications" />
                                    <div style={{ display: 'grid', gap: '16px' }}>
                                        {selectedReport.files.map((file, idx) => (
                                            <motion.div
                                                key={idx}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.1 }}
                                                style={{ background: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}
                                            >
                                                <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <FaCode color="#818cf8" size={14} />
                                                        </div>
                                                        <div>
                                                            <div style={{ color: '#f8fafc', fontWeight: '700', fontSize: '14px' }}>{file.fileName}</div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>Modified {new Date(file.lastUpdated).toLocaleTimeString()}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '4px 10px', borderRadius: '20px' }}>
                                                        ⏱ {(file.timeSpent / 60).toFixed(1)}m
                                                    </div>
                                                </div>
                                                <div style={{ padding: '20px', position: 'relative' }}>
                                                    <pre style={{
                                                        margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#cbd5e1',
                                                        overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto',
                                                        padding: '16px', background: '#020617', borderRadius: '12px'
                                                    }}>
                                                        {file.code || "// No content capture identified."}
                                                    </pre>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right: Assignment Sync */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <div>
                                        <SectionTitle icon={<FaTasks />} title="Logic Checks" subtitle="Assignment verification" />
                                        <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', padding: '20px' }}>
                                            {isLoadingSubmissions ? (
                                                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Syncing telemetry...</div>
                                            ) : studentSubmissions.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '20px', color: '#475569', fontSize: '13px' }}>No logic assignments identified.</div>
                                            ) : (
                                                <div style={{ display: 'grid', gap: '12px' }}>
                                                    {studentSubmissions.map(sub => (
                                                        <div key={sub._id} style={{
                                                            padding: '16px', borderRadius: '12px', background: 'rgba(2, 6, 23, 0.5)',
                                                            border: '1px solid rgba(255,255,255,0.05)', position: 'relative'
                                                        }}>
                                                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc', marginBottom: '8px' }}>{sub.assignmentId?.title}</div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: '16px', fontWeight: '900', color: sub.score === sub.maxScore ? '#10b981' : '#f59e0b' }}>
                                                                    {sub.score} <span style={{ fontSize: '11px', color: '#475569', fontWeight: '400' }}>/ {sub.maxScore}</span>
                                                                </div>
                                                                {sub.score === sub.maxScore ? <FaCheckCircle color="#10b981" /> : <FaArrowRight color="#64748b" />}
                                                            </div>
                                                            <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '12px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${(sub.score / sub.maxScore) * 100}%`, background: sub.score === sub.maxScore ? '#10b981' : '#f59e0b' }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Security Insights */}
                                    <div>
                                        <SectionTitle icon={<FaShieldAlt />} title="Security Dossier" subtitle="AI behavioral analysis" />
                                        <div style={{
                                            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(245, 158, 11, 0.05))',
                                            borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', padding: '20px'
                                        }}>
                                            <SecurityItem
                                                icon={<FaExclamationTriangle color={selectedReport.tabSwitchCount > 5 ? '#ef4444' : '#64748b'} />}
                                                label="Tab Switching"
                                                value={selectedReport.tabSwitchCount || 0}
                                                desc={selectedReport.tabSwitchCount > 10 ? "High suspicious activity detected." : "Normal activity range."}
                                            />
                                            <SecurityItem
                                                icon={<FaCode color={selectedReport.pasteCount > 8 ? '#f59e0b' : '#64748b'} />}
                                                label="Paste Frequency"
                                                value={selectedReport.pasteCount || 0}
                                                desc={selectedReport.pasteCount > 15 ? "Plagiarism risk identified." : "Standard code management."}
                                            />
                                            <div style={{
                                                marginTop: '20px', padding: '12px', borderRadius: '12px',
                                                background: 'rgba(2, 6, 23, 0.4)', fontSize: '12px', color: '#94a3b8',
                                                border: '1px solid rgba(255,255,255,0.03)', lineHeight: '1.6'
                                            }}>
                                                <FaBrain style={{ marginRight: '8px' }} color="#6366f1" />
                                                <span style={{ fontWeight: '700', color: '#fff' }}>Vayu AI Verdict:</span><br />
                                                {selectedReport.attentionScore < 70
                                                    ? "This student shows significant signs of disengagement or external assistance. Recommendation: Oral viva voce highly advised."
                                                    : selectedReport.attentionScore < 90
                                                        ? "Occasional distractions observed. Overall integrity is within acceptable bounds but monitor for consistency."
                                                        : "Excellent focus and high-integrity development lifecycle. No anomalies detected."
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

// --- SUBCOMPONENTS ---

const MetricCard = ({ icon, label, value, trend, subValue, color = '#6366f1' }) => (
    <div style={{
        background: 'rgba(15, 23, 42, 0.4)', padding: '24px', borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden'
    }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            {icon}
        </div>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: '900', color: '#fff', marginBottom: '4px' }}>{value}</div>
        <div style={{ fontSize: '10px', fontWeight: '700', color: color }}>{trend}</div>
        {subValue && <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{subValue}</div>}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '60px', height: '60px', background: `radial-gradient(circle, ${color}10, transparent)`, borderRadius: '50%', transform: 'translate(20px, 20px)' }} />
    </div>
);

const SectionTitle = ({ icon, title, subtitle }) => (
    <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <div style={{ color: '#6366f1' }}>{icon}</div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#fff' }}>{title}</h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{subtitle}</p>
    </div>
);

const SecurityItem = ({ icon, label, value, desc }) => (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ marginTop: '4px' }}>{icon}</div>
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: '900', color: '#fff', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>{value}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{desc}</div>
        </div>
    </div>
);

export default StudentReports;
