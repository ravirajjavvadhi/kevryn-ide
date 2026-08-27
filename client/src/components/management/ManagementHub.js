import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBuilding, FaCalendarAlt, FaBookOpen, FaChartLine, FaSignOutAlt, FaCube, FaTimes } from 'react-icons/fa';

import InstitutionSetup from './InstitutionSetup';
import TimetableScheduler from './TimetableScheduler';
import AcademicConfig from './AcademicConfig';
import ManagementAnalytics from './ManagementAnalytics';

const ManagementHub = ({ token, onLogout }) => {
    const [activeModal, setActiveModal] = useState(null);

    const closeModal = () => setActiveModal(null);

    const cards = [
        { id: 'setup', title: 'Institution Setup', icon: <FaBuilding size={32} />, desc: 'Configure Departments, bulk onboard students, and create faculty accounts.' },
        { id: 'academic', title: 'Academic Config', icon: <FaBookOpen size={32} />, desc: 'Define active Courses (Subjects) and configure physical Lab Rooms.' },
        { id: 'timetable', title: 'Master Timetable', icon: <FaCalendarAlt size={32} />, desc: 'Top-down scheduling grid for the entire institution.' },
        { id: 'analytics', title: 'Global Analytics', icon: <FaChartLine size={32} />, desc: 'Monitor platform utilization and 360° student reports.' }
    ];

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #050505 0%, #111 100%)',
            color: '#fff',
            fontFamily: "'Inter', sans-serif",
            padding: '40px'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '60px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', borderRadius: '12px', padding: '12px', boxShadow: '0 0 20px rgba(79, 70, 229, 0.4)' }}>
                        <FaCube size={24} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>KevRyn Management Hub</h1>
                        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
                            Institution Admin Panel
                        </p>
                    </div>
                </div>
                <button 
                    onClick={onLogout}
                    style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
                >
                    <FaSignOutAlt /> Sign Out
                </button>
            </div>

            {/* Grid of Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                {cards.map(card => (
                    <motion.div
                        key={card.id}
                        onClick={() => setActiveModal(card.id)}
                        whileHover={{ y: -5, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            padding: '32px',
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px'
                        }}
                    >
                        <div style={{ color: '#4f46e5' }}>{card.icon}</div>
                        <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>{card.title}</h2>
                        <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>{card.desc}</p>
                    </motion.div>
                ))}
            </div>

            {/* Full Screen Modal Overlay */}
            <AnimatePresence>
                {activeModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            style={{
                                background: '#ffffff', // Keep child components white for now as they are designed for light mode
                                width: '100%', maxWidth: '1400px', height: '100%', maxHeight: '90vh',
                                borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }}
                        >
                            {/* Modal Header */}
                            <div style={{ background: '#f8fafc', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {cards.find(c => c.id === activeModal)?.icon}
                                    {cards.find(c => c.id === activeModal)?.title}
                                </h2>
                                <button onClick={closeModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '8px' }}>
                                    <FaTimes size={20} />
                                </button>
                            </div>
                            
                            {/* Modal Content - Scrollable */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0', background: '#fafbfc' }}>
                                {activeModal === 'setup' && <InstitutionSetup token={token} />}
                                {activeModal === 'academic' && <AcademicConfig token={token} />}
                                {activeModal === 'timetable' && <TimetableScheduler token={token} />}
                                {activeModal === 'analytics' && <ManagementAnalytics token={token} />}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ManagementHub;
