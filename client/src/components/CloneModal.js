import React, { useState } from 'react';
import { FaTimes, FaGithub, FaDownload } from 'react-icons/fa';
import axios from 'axios';
import { motion } from 'framer-motion';

const CloneModal = ({ isOpen, onClose, onCloneSuccess, token }) => {
    const [repoUrl, setRepoUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const handleClone = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
            const api = axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } });

            await api.post('/git/clone', { repoUrl });
            setLoading(false);
            onCloneSuccess();
            onClose();
        } catch (err) {
            setLoading(false);
            const errMsg = err.response?.data?.error || err.message || "Clone failed";
            setError(errMsg);
            console.error(err);
        }
    };

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
                    width: '400px', border: '1px solid #333', color: 'white'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3>Clone Repository</h3>
                    <FaTimes onClick={onClose} style={{ cursor: 'pointer' }} />
                </div>

                {error && <div style={{ color: '#ff6b6b', marginBottom: '10px', fontSize: '14px' }}>{error}</div>}

                <form onSubmit={handleClone}>
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#ccc' }}>Repository URL (HTTPS)</label>
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="https://github.com/username/repo.git"
                            style={{
                                width: '100%', padding: '8px', background: '#252526',
                                border: '1px solid #3c3c3c', color: 'white', borderRadius: '4px'
                            }}
                            required
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #333', background: 'transparent', color: '#ccc', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={loading} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#0e639c', color: 'white', cursor: loading ? 'wait' : 'pointer' }}>
                            {loading ? 'Cloning...' : 'Clone'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default CloneModal;
