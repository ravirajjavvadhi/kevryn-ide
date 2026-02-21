import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaStop, FaExternalLinkAlt } from 'react-icons/fa';

const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_URL = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const DeploymentPanel = ({ token }) => {
    const [status, setStatus] = useState(null);
    const [logs, setLogs] = useState([]);
    const bottomRef = useRef(null);

    const fetchStatus = async () => {
        if (!token) return;
        try {
            const res = await axios.get(`${SERVER_URL}/deploy/status`, {
                headers: { Authorization: token }
            });
            setStatus(res.data.backend);
        } catch (e) {
            console.error("Failed to fetch status", e);
        }
    };

    const fetchLogs = async () => {
        if (!token) return;
        try {
            const res = await axios.get(`${SERVER_URL}/deploy/logs`, {
                headers: { Authorization: token }
            });
            setLogs(res.data.logs || []);
        } catch (e) {
            console.error("Failed to fetch logs", e);
        }
    };

    const stopDeployment = async () => {
        if (!window.confirm("Are you sure you want to stop the backend server?")) return;
        try {
            await axios.post(`${SERVER_URL}/deploy/stop`, {}, {
                headers: { Authorization: token }
            });
            fetchStatus();
            setLogs(prev => [...prev, { type: 'stdout', message: 'Deployment stopped.', timestamp: new Date() }]);
        } catch (e) {
            alert("Failed to stop deployment");
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(() => {
            fetchStatus();
            if (status) fetchLogs();
        }, 3000);
        return () => clearInterval(interval);
    }, [token, status]); // Re-run if status changes to start/stop polling logs efficiently

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    if (!status) {
        return (
            <div style={{ padding: 20, color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <p>No active native deployment.</p>
                <p style={{ fontSize: '0.9em', marginTop: 10 }}>Use <b>Deploy {'>'} Backend</b> to start your server natively.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <div style={{ padding: '8px 15px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4caf50' }}></div>
                    <span style={{ fontWeight: 'bold' }}>Running on Port {status.port}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <a href={status.url.startsWith('http') ? status.url : `${SERVER_URL}${status.url}`} target="_blank" rel="noreferrer" style={{ color: '#61dafb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.9rem' }}>
                        <FaExternalLinkAlt size={12} /> Open App
                    </a>
                    <button onClick={stopDeployment} style={{ background: '#d32f2f', border: 'none', color: 'white', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}>
                        <FaStop size={12} /> Stop
                    </button>
                </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 10, fontFamily: 'monospace', fontSize: 13, background: '#1e1e1e' }}>
                {logs.map((log, i) => (
                    <div key={i} style={{ color: log.type === 'stderr' ? '#ff6b6b' : '#cccccc', marginBottom: 2, whiteSpace: 'pre-wrap' }}>
                        <span style={{ opacity: 0.5, marginRight: 8 }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        {log.message}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};

export default DeploymentPanel;
