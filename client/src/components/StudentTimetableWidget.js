import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaCalendarAlt, FaPlayCircle } from 'react-icons/fa';
import { motion } from 'framer-motion';
import './StudentTimetableWidget.css';

const StudentTimetableWidget = ({ token, serverUrl, activeSessionId, onEnterLab }) => {
    const [schedule, setSchedule] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const api = axios.create({
        baseURL: serverUrl,
        headers: { Authorization: token }
    });

    useEffect(() => {
        fetchSchedule();
    }, []);

    const fetchSchedule = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/api/timetable/my-schedule/student');
            setSchedule(res.data);
        } catch (err) {
            console.error("Failed to fetch schedule");
        }
        setIsLoading(false);
    };

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const safeSchedule = Array.isArray(schedule) ? schedule : [];
    const todaysClasses = safeSchedule.filter(s => s.dayOfWeek === today);

    return (
        <section className="student-schedule">
            <header className="student-schedule__head"><div className="student-schedule__title"><FaCalendarAlt /> Today’s lab schedule</div><span className="student-schedule__date">{today}</span></header>

            {isLoading ? (
                <div className="student-schedule__loading">Loading your scheduled labs…</div>
            ) : todaysClasses.length === 0 ? (
                <div className="student-schedule__empty">No scheduled labs today. Your next lab will appear here when it is published.</div>
            ) : (
                <div className="student-schedule__grid">
                    {todaysClasses.map(cls => (
                        <motion.article key={cls._id} whileHover={{ y: -2 }} className="student-schedule__item">
                            <div className="student-schedule__subject">{cls.subjectName}</div>
                            <div className="student-schedule__faculty">Prof. {cls.facultyId?.username || 'Faculty to be assigned'}</div>
                            <div className="student-schedule__footer"><span className="student-schedule__time">{cls.startTime} – {cls.endTime}</span>
                            
                            {/* If a session is active and the lab corresponds to this class, they should join via the top banner usually. But we can show a button if activeSessionId is present. */}
                            {activeSessionId ? (
                                <button 
                                    onClick={onEnterLab}
                                    className="student-schedule__join"
                                >
                                    <FaPlayCircle /> Join Live Lab
                                </button>
                            ) : (
                                <span className="student-schedule__waiting">Waiting for faculty</span>
                            )}
                            </div>
                        </motion.article>
                    ))}
                </div>
            )}
        </section>
    );
};

export default StudentTimetableWidget;
