import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaPlayCircle, FaCalendarAlt } from 'react-icons/fa';
import { motion } from 'framer-motion';

const TimetableWidget = ({ token, serverUrl, onLabStarted }) => {
    const [schedule, setSchedule] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState('today'); // 'today' or 'week'
    const [importLockedByTimetable, setImportLockedByTimetable] = useState({});

    const api = axios.create({
        baseURL: serverUrl,
        headers: { Authorization: token } // ensure no duplicate Bearer
    });

    useEffect(() => {
        fetchSchedule();
    }, []);

    const fetchSchedule = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/api/timetable/my-schedule/faculty');
            setSchedule(res.data);
        } catch (err) {
            console.error("Failed to fetch schedule", err);
        }
        setIsLoading(false);
    };

    const handleStartLab = async (timetableId) => {
        const disablePreviousFileImport = Boolean(importLockedByTimetable[timetableId]);
        const confirmationMessage = disablePreviousFileImport
            ? 'Start this scheduled lab with previous-file import disabled?'
            : 'Start this scheduled lab session now?';

        if (!window.confirm(confirmationMessage)) return;
        try {
            const res = await api.post(`/api/timetable/start-lab/${timetableId}`, {
                disablePreviousFileImport
            });
            if (onLabStarted) {
                onLabStarted(res.data.session);
            } else {
                alert('Lab started! Go to Live Monitor.');
            }
        } catch (err) {
            alert(err.response?.data?.error || "Failed to start lab");
        }
    };

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const safeSchedule = Array.isArray(schedule) ? schedule : [];
    const displayClasses = viewMode === 'today' 
        ? safeSchedule.filter(s => s.dayOfWeek === today)
        : safeSchedule;

    const styles = {
        container: {
            background: 'rgba(30, 41, 59, 0.7)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '30px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
        },
        title: {
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            margin: 0
        },
        toggleGroup: {
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '8px',
            padding: '4px'
        },
        toggleBtn: (active) => ({
            padding: '6px 16px',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: active ? '#3b82f6' : 'transparent',
            color: active ? '#fff' : '#94a3b8'
        }),
        grid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px'
        },
        card: {
            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.05)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        },
        cardAccent: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '4px',
            height: '100%',
            background: '#3b82f6'
        },
        dayLabel: {
            fontSize: '0.75rem',
            fontWeight: 'bold',
            color: '#60a5fa',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '8px'
        },
        subject: {
            fontSize: '1.1rem',
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: '4px'
        },
        cohort: {
            fontSize: '0.875rem',
            color: '#94a3b8',
            marginBottom: '12px'
        },
        timeInfo: {
            fontSize: '0.875rem',
            color: '#93c5fd',
            fontFamily: 'monospace',
            marginBottom: '16px',
            background: 'rgba(59, 130, 246, 0.1)',
            padding: '6px 10px',
            borderRadius: '6px',
            display: 'inline-block'
        },
        startBtn: {
            width: '100%',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            padding: '10px',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginTop: 'auto',
            transition: 'transform 0.2s, box-shadow 0.2s'
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>
                    <FaCalendarAlt style={{ color: '#60a5fa' }} /> 
                    {viewMode === 'today' ? `Today's Schedule (${today})` : 'Full Week Schedule'}
                </h3>
                <div style={styles.toggleGroup}>
                    <button 
                        onClick={() => setViewMode('today')}
                        style={styles.toggleBtn(viewMode === 'today')}
                    >
                        Today
                    </button>
                    <button 
                        onClick={() => setViewMode('week')}
                        style={styles.toggleBtn(viewMode === 'week')}
                    >
                        Week
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div style={{ color: '#94a3b8' }}>Loading schedule...</div>
            ) : displayClasses.length === 0 ? (
                <div style={{ color: '#64748b', fontStyle: 'italic' }}>No scheduled labs {viewMode === 'today' ? 'today' : 'this week'}.</div>
            ) : (
                <div style={styles.grid}>
                    {displayClasses.map(cls => (
                        <motion.div key={cls._id} whileHover={{ scale: 1.03, y: -5 }} style={styles.card}>
                            <div style={styles.cardAccent}></div>
                            {viewMode === 'week' && <div style={styles.dayLabel}>{cls.dayOfWeek}</div>}
                            <div style={styles.subject}>{cls.subjectName}</div>
                            <div style={styles.cohort}>{cls.department} - Year {cls.year} - Sec {cls.section}</div>
                            <div>
                                <span style={styles.timeInfo}>{cls.startTime} - {cls.endTime}</span>
                            </div>
                            
                            {viewMode === 'today' && (
                                <>
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '9px',
                                        margin: '0 0 12px',
                                        color: '#cbd5e1',
                                        cursor: 'pointer',
                                        fontSize: '0.78rem',
                                        lineHeight: 1.35
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(importLockedByTimetable[cls._id])}
                                            onChange={(event) => setImportLockedByTimetable((previous) => ({
                                                ...previous,
                                                [cls._id]: event.target.checked
                                            }))}
                                            style={{ marginTop: '3px', accentColor: '#8b5cf6' }}
                                        />
                                        <span>
                                            <strong style={{ color: '#e2e8f0', display: 'block' }}>Disable previous-file import</strong>
                                            Students start with a clean lab session.
                                        </span>
                                    </label>
                                    <button
                                        onClick={() => handleStartLab(cls._id)}
                                        style={styles.startBtn}
                                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'; }}
                                        onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <FaPlayCircle /> Start Lab
                                    </button>
                                </>
                            )}
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TimetableWidget;
