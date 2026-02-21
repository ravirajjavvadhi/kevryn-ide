import React, { useState, useEffect } from 'react';
import { FaTimes, FaFolder } from 'react-icons/fa';
import axios from 'axios';
import { motion } from 'framer-motion';

const SwitchRepoModal = ({ isOpen, onClose, onSwitch, token }) => {
    const [repos, setRepos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (isOpen && token) {
            fetchRepos();
        }
    }, [isOpen, token]);

    const fetchRepos = async () => {
        setLoading(true);
        setError("");
        try {
            const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
            const SERVER_URL = _raw.startsWith('http') ? _raw : `https://${_raw}`;
            const api = axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } });
            const res = await api.get('/git/repos');
            setRepos(res.data.repos || []);
            setLoading(false);
        } catch (err) {
            setLoading(false);
            setError("Failed to load repositories");
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    background: '#1e1e1e', padding: '20px', borderRadius: '8px',
                    width: '400px', border: '1px solid #333', color: 'white', maxHeight: '500px', overflowY: 'auto'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3>Switch Repository</h3>
                    <FaTimes onClick={onClose} style={{ cursor: 'pointer' }} />
                </div>

                {error && <div style={{ color: '#ff6b6b', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}
                {loading && <div style={{ color: '#ccc', textAlign: 'center' }}>Loading...</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {repos.length === 0 && !loading && <div style={{ color: '#888', fontStyle: 'italic', textAlign: 'center' }}>No repositories found. Clone one first!</div>}

                    {repos.map(repo => (
                        <div key={repo}
                            onClick={() => { onSwitch(repo); onClose(); }} // TODO: Implement actual switch logic in App.js? 
                            // Logic: Ideally backend should have "active project" concept or frontend just navigates to that folder?
                            // Current App.js just lists all files. 
                            // Maybe "Switch" just filters the FileTree to show ONLY that folder as root? 
                            // Or maybe we haven't implemented "Project Switching" backend state?
                            // For MVP: Let's just alert for now or implement client-side filtering?
                            // Actually, let's just Close for now and maybe set a state "activeRepo" in App.js?
                            style={{
                                padding: '10px', background: '#252526', borderRadius: '4px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid transparent'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#0e639c'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                        >
                            <FaFolder color="#dcb67a" />
                            <span>{repo}</span>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
};

export default SwitchRepoModal;
