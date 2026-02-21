import React, { useState } from 'react';
import axios from 'axios';
import { FaExclamationTriangle, FaTimes, FaCheck } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

const IssueReporter = ({ isOpen, onClose, token }) => {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [severity, setSeverity] = useState("medium");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await axios.post(
                `${process.env.REACT_APP_SERVER_URL || 'http://localhost:5000'}/api/issues`,
                { title, description, severity },
                { headers: { Authorization: token } }
            );
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setTitle("");
                setDescription("");
                onClose();
            }, 1000);
        } catch (e) {
            alert("Failed to report issue: " + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                        background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <motion.div
                        initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                        style={{
                            background: '#1a1a1a', border: '1px solid #333', padding: '30px', borderRadius: '12px',
                            width: '400px', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FaExclamationTriangle color="#FFBB28" /> Report Issue
                            </h3>
                            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}><FaTimes /></button>
                        </div>

                        {success ? (
                            <div style={{ textAlign: 'center', color: '#00C49F', padding: '30px 0' }}>
                                <FaCheck size={40} />
                                <p>Issue Reported Successfully!</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>Issue Title</label>
                                    <input
                                        type="text" required value={title} onChange={e => setTitle(e.target.value)}
                                        style={{ width: '100%', padding: '10px', background: '#333', border: 'none', borderRadius: '4px', color: '#fff' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>Description</label>
                                    <textarea
                                        rows="4" required value={description} onChange={e => setDescription(e.target.value)}
                                        style={{ width: '100%', padding: '10px', background: '#333', border: 'none', borderRadius: '4px', color: '#fff' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '5px' }}>Severity</label>
                                    <select
                                        value={severity} onChange={e => setSeverity(e.target.value)}
                                        style={{ width: '100%', padding: '10px', background: '#333', border: 'none', borderRadius: '4px', color: '#fff' }}
                                    >
                                        <option value="low">Low - Minor Annoyance</option>
                                        <option value="medium">Medium - Functional Issue</option>
                                        <option value="high">High - Feature Broken</option>
                                        <option value="critical">Critical - System Crash</option>
                                    </select>
                                </div>
                                <button
                                    type="submit" disabled={isSubmitting}
                                    style={{
                                        width: '100%', padding: '12px', background: isSubmitting ? '#555' : '#FF4D4D',
                                        color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: isSubmitting ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isSubmitting ? 'Reporting...' : 'Submit Report'}
                                </button>
                            </form>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default IssueReporter;
