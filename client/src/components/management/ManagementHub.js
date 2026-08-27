import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBuilding, FaCalendarAlt, FaBookOpen, FaChartLine, FaSignOutAlt, FaCube, FaTimes, FaChevronRight } from 'react-icons/fa';

import InstitutionSetup from './InstitutionSetup';
import TimetableScheduler from './TimetableScheduler';
import AcademicConfig from './AcademicConfig';
import ManagementAnalytics from './ManagementAnalytics';

const ManagementHub = ({ token, onLogout }) => {
    const [activeModal, setActiveModal] = useState(null);

    const closeModal = () => setActiveModal(null);

    const cards = [
        { 
            id: 'setup', 
            title: 'Institution Setup', 
            icon: <FaBuilding size={24} color="#60a5fa" />, 
            iconBg: 'rgba(96, 165, 250, 0.1)',
            desc: 'Configure Departments, bulk onboard students, and create faculty accounts.' 
        },
        { 
            id: 'academic', 
            title: 'Academic Config', 
            icon: <FaBookOpen size={24} color="#c084fc" />, 
            iconBg: 'rgba(192, 132, 252, 0.1)',
            desc: 'Define active Courses (Subjects) and configure physical Lab Rooms.' 
        },
        { 
            id: 'timetable', 
            title: 'Master Timetable', 
            icon: <FaCalendarAlt size={24} color="#34d399" />, 
            iconBg: 'rgba(52, 211, 153, 0.1)',
            desc: 'Top-down scheduling grid for the entire institution.' 
        },
        { 
            id: 'analytics', 
            title: 'Global Analytics', 
            icon: <FaChartLine size={24} color="#fbbf24" />, 
            iconBg: 'rgba(251, 191, 36, 0.1)',
            desc: 'Monitor platform utilization and 360° student reports.' 
        }
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#09090b',
            backgroundImage: 'radial-gradient(circle at 50% 0%, #1e1b4b 0%, #09090b 70%)',
            color: '#fff',
            fontFamily: "'Inter', sans-serif",
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Top Navigation Bar */}
            <nav style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                padding: '20px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(9, 9, 11, 0.5)', backdropFilter: 'blur(12px)',
                position: 'sticky', top: 0, zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                        background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', 
                        borderRadius: '10px', width: '40px', height: '40px', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 20px rgba(79, 70, 229, 0.4)' 
                    }}>
                        <FaCube size={20} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '20px', fontWeight: '700', margin: 0, letterSpacing: '-0.5px' }}>KevRyn</h1>
                        <p style={{ fontSize: '12px', color: '#a1a1aa', margin: 0, fontWeight: '500' }}>
                            Institution Management
                        </p>
                    </div>
                </div>
                <button 
                    onClick={onLogout}
                    style={{ 
                        background: 'transparent', color: '#a1a1aa', border: '1px solid rgba(255, 255, 255, 0.1)', 
                        padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', 
                        alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = 'transparent'; }}
                >
                    <FaSignOutAlt /> Sign Out
                </button>
            </nav>

            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
                
                <div style={{ textAlign: 'center', marginBottom: '48px', maxWidth: '600px' }}>
                    <h2 style={{ fontSize: '36px', fontWeight: '800', margin: '0 0 16px 0', letterSpacing: '-1px' }}>
                        Welcome to the <span style={{ color: '#818cf8' }}>Hub</span>
                    </h2>
                    <p style={{ color: '#a1a1aa', fontSize: '16px', lineHeight: '1.6', margin: 0 }}>
                        Manage your institution's departments, faculty, and schedules all in one centralized command center.
                    </p>
                </div>

                {/* 2x2 Bento Grid */}
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    style={{ 
                        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', 
                        width: '100%', maxWidth: '900px' 
                    }}
                >
                    {cards.map(card => (
                        <motion.div
                            key={card.id}
                            variants={itemVariants}
                            onClick={() => setActiveModal(card.id)}
                            whileHover={{ y: -4, scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                borderRadius: '24px',
                                padding: '32px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                position: 'relative',
                                overflow: 'hidden',
                                transition: 'border-color 0.3s, background 0.3s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ 
                                    width: '56px', height: '56px', borderRadius: '16px', 
                                    background: card.iconBg, display: 'flex', alignItems: 'center', 
                                    justifyContent: 'center', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' 
                                }}>
                                    {card.icon}
                                </div>
                                <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: '#f4f4f5' }}>{card.title}</h3>
                            </div>
                            
                            <p style={{ color: '#a1a1aa', fontSize: '14px', lineHeight: '1.6', margin: '0 0 24px 0', flex: 1 }}>
                                {card.desc}
                            </p>

                            <div style={{ display: 'flex', alignItems: 'center', color: '#818cf8', fontSize: '14px', fontWeight: '600', gap: '8px' }}>
                                Launch Module <FaChevronRight size={12} />
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>

            {/* Full Screen Modal Overlay */}
            <AnimatePresence>
                {activeModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{
                                background: '#ffffff', // Keep child components white 
                                width: '100%', maxWidth: '1300px', height: '100%', maxHeight: '90vh',
                                borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                            }}
                        >
                            {/* Modal Header */}
                            <div style={{ background: '#f8fafc', padding: '20px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: cards.find(c => c.id === activeModal)?.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {cards.find(c => c.id === activeModal)?.icon}
                                    </div>
                                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>
                                        {cards.find(c => c.id === activeModal)?.title}
                                    </h2>
                                </div>
                                <button 
                                    onClick={closeModal} 
                                    style={{ 
                                        background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', 
                                        color: '#64748b', padding: '10px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#ef4444'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748b'; }}
                                >
                                    <FaTimes size={16} />
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
