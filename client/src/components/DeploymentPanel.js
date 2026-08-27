import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { FaPlay, FaStop, FaGlobe, FaMobileAlt, FaTrash, FaCopy, FaExternalLinkAlt, FaSpinner } from 'react-icons/fa';

const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_URL = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const DeploymentPanel = ({ token, activeMode }) => {
    // === Local LAN State ===
    const [localIp, setLocalIp] = useState('');
    const [localTasks, setLocalTasks] = useState([
        { id: '1', name: 'Frontend App', command: 'npx serve . -l 3000', port: '3000', isRunning: false },
        { id: '2', name: 'Backend API', command: 'node server.js', port: '5000', isRunning: false }
    ]);
    const [newTaskName, setNewTaskName] = useState('');
    const [newTaskCmd, setNewTaskCmd] = useState('');
    const [newTaskPort, setNewTaskPort] = useState('');
    const [isAddingTask, setIsAddingTask] = useState(false);

    // === Worldwide Deploy State ===
    const [worldDeployments, setWorldDeployments] = useState([]);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishError, setPublishError] = useState('');
    const [copiedUrl, setCopiedUrl] = useState(null);
    const [projectName, setProjectName] = useState('');

    const api = axios.create({
        baseURL: SERVER_URL,
        headers: { Authorization: token }
    });

    // Detect local IP on mount
    useEffect(() => {
        try {
            const rtc = new RTCPeerConnection({ iceServers: [] });
            rtc.createDataChannel('');
            rtc.createOffer().then(offer => rtc.setLocalDescription(offer));
            rtc.onicecandidate = (event) => {
                if (event && event.candidate && event.candidate.candidate) {
                    const parts = event.candidate.candidate.split(' ');
                    const ipMatch = parts.find(p => /^(\d{1,3}\.){3}\d{1,3}$/.test(p));
                    if (ipMatch && ipMatch !== '0.0.0.0') {
                        setLocalIp(ipMatch);
                        rtc.close();
                    }
                }
            };
            // Fallback if WebRTC doesn't resolve
            setTimeout(() => {
                if (!localIp) setLocalIp('192.168.1.X');
            }, 3000);
        } catch {
            setLocalIp('192.168.1.X');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchDeployStatus = () => {
        if (!token) return;
        api.get('/deploy/status').then(res => {
            const host = SERVER_URL || 'https://kevryn-ide.onrender.com';
            
            // New multi-site format
            if (res.data.frontends && Array.isArray(res.data.frontends)) {
                const formatted = res.data.frontends.map(site => ({
                    name: site.siteName,
                    url: site.url.startsWith('http') ? site.url : host + site.url
                }));
                setWorldDeployments(formatted);
            } 
            // Fallback for old backend format (while Render is deploying)
            else if (res.data.frontend) {
                setWorldDeployments([{
                    name: res.data.siteName || 'portfolio',
                    url: res.data.frontend.startsWith('http') ? res.data.frontend : host + res.data.frontend
                }]);
            }
        }).catch(() => {});
    };

    // Check existing deploy status on mount
    useEffect(() => {
        fetchDeployStatus();
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopiedUrl(text);
        setTimeout(() => setCopiedUrl(null), 2000);
    };

    // === Local LAN Handlers ===
    const toggleTask = async (taskId) => {
        const task = localTasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (task.isRunning) {
            if (window.electronAPI && window.electronAPI.terminalWrite) {
                window.electronAPI.terminalWrite('\x03'); // Ctrl+C
            }
            setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, isRunning: false } : t));
        } else {
            if (window.electronAPI && window.electronAPI.terminalWrite) {
                window.electronAPI.terminalWrite(task.command + '\r');
            }
            setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, isRunning: true } : t));
        }
    };

    const addTask = () => {
        if (!newTaskName || !newTaskCmd || !newTaskPort) return;
        const newTask = {
            id: Date.now().toString(),
            name: newTaskName,
            command: newTaskCmd,
            port: newTaskPort,
            isRunning: false
        };
        setLocalTasks([...localTasks, newTask]);
        setNewTaskName('');
        setNewTaskCmd('');
        setNewTaskPort('');
        setIsAddingTask(false);
    };
    
    const removeTask = (taskId) => {
        setLocalTasks(prev => prev.filter(t => t.id !== taskId));
    };

    // === Worldwide Deploy Handlers ===
    const publishToWorld = async () => {
        if (worldDeployments.length >= 3) {
            setPublishError('You have reached the maximum of 3 deployments. Please unpublish one first.');
            return;
        }
        setIsPublishing(true);
        setPublishError('');
        
        // Auto-generate a friendly name if they leave it blank
        const finalSiteName = projectName.trim() || 'portfolio-' + Math.random().toString(36).substring(2, 8);

        try {
            await api.post('/deploy/frontend', {
                siteName: finalSiteName,
                backendUrl: ''
            });
            fetchDeployStatus(); // Refresh the list
            setProjectName(''); // Clear the input
        } catch (err) {
            const errMsg = err.response?.data?.error || err.message || 'Deployment failed';
            setPublishError(errMsg);
        } finally {
            setIsPublishing(false);
        }
    };

    const unpublishWorld = async (siteName) => {
        if (!window.confirm(`Are you sure you want to take ${siteName} offline instantly?`)) return;
        try {
            await api.post('/deploy/unpublish', { siteName });
            fetchDeployStatus(); // Refresh the list
        } catch {
            fetchDeployStatus(); // Refresh anyway in case of out of sync
        }
    };

    // === Render: Local LAN Testing ===
    const renderLocalLAN = () => (
        <div style={{ display: 'flex', height: '100%', padding: '20px', gap: '20px' }}>
            {/* Left: Task List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', borderRight: '1px solid var(--border-color, #333)', paddingRight: '20px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <div>
                        <h3 style={{ margin: '0 0 5px 0', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                            <FaMobileAlt /> Local Run Configurations
                        </h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#888', lineHeight: '1.5' }}>
                            Run any script directly in your terminal. Zero server cost.
                        </p>
                    </div>
                    <button 
                        onClick={() => setIsAddingTask(!isAddingTask)}
                        style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', border: '1px solid rgba(167, 139, 250, 0.3)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        {isAddingTask ? 'Cancel' : '+ Add Task'}
                    </button>
                </div>

                {isAddingTask && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(167, 139, 250, 0.2)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <input type="text" placeholder="Task Name (e.g. React App)" value={newTaskName} onChange={e => setNewTaskName(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px', borderRadius: '4px', fontSize: '13px' }} />
                        <input type="text" placeholder="Command (e.g. npm start)" value={newTaskCmd} onChange={e => setNewTaskCmd(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px', borderRadius: '4px', fontSize: '13px' }} />
                        <input type="text" placeholder="Port (e.g. 3000)" value={newTaskPort} onChange={e => setNewTaskPort(e.target.value)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px', borderRadius: '4px', fontSize: '13px' }} />
                        <button onClick={addTask} style={{ background: '#a78bfa', color: '#1a1a2e', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Save Task</button>
                    </div>
                )}

                {localTasks.map(task => (
                    <div key={task.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'rgba(0,0,0,0.25)', padding: '15px', borderRadius: '10px',
                        border: task.isRunning ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                        transition: 'all 0.2s'
                    }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '15px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {task.name}
                                {task.isRunning && <span style={{ fontSize: '10px', background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '2px 6px', borderRadius: '4px' }}>Running on {task.port}</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                &gt; {task.command}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => toggleTask(task.id)}
                                style={{
                                    background: task.isRunning ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                    color: task.isRunning ? '#ef4444' : '#10b981',
                                    border: '1px solid ' + (task.isRunning ? '#ef4444' : '#10b981'),
                                    padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                                    fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', transition: 'all 0.2s'
                                }}
                            >
                                {task.isRunning ? <><FaStop size={10} /> Stop</> : <><FaPlay size={10} /> Run</>}
                            </button>
                            <button onClick={() => removeTask(task.id)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}>
                                <FaTrash size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Right: QR Code Preview */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {localTasks.some(t => t.isRunning) ? (() => {
                    const activeTask = localTasks.find(t => t.isRunning);
                    const activeUrl = 'http://' + localIp + ':' + activeTask.port;
                    return (
                        <>
                            <div style={{ background: 'white', padding: '16px', borderRadius: '12px', marginBottom: '15px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
                                <QRCodeSVG value={activeUrl} size={140} />
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#e0e0e0', marginBottom: '6px' }}>{activeTask.name} is Live</div>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '15px' }}>Scan with Phone/Tablet to preview</div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <a href={activeUrl} target="_blank" rel="noreferrer" style={{ color: '#61dafb', fontFamily: 'monospace', textDecoration: 'none', fontSize: '13px' }}>
                                    {activeUrl}
                                </a>
                                <FaCopy style={{ cursor: 'pointer', color: copiedUrl === activeUrl ? '#10b981' : '#888', transition: 'all 0.2s' }} onClick={() => copyToClipboard(activeUrl)} title="Copy" size={14} />
                            </div>
                        </>
                    );
                })() : (
                    <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                        <FaMobileAlt size={40} style={{ opacity: 0.2, marginBottom: '15px' }} />
                        <p style={{ margin: 0, fontSize: '13px' }}>Run a task to generate a local preview link and QR code.</p>
                    </div>
                )}
            </div>
        </div>
    );

    // === Render: Worldwide Static Deploy ===
    const renderWorldDeploy = () => (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: '100%', padding: '15px 20px', width: '100%',
            boxSizing: 'border-box'
        }}>
            {publishError && (
                <div style={{ color: '#ef4444', fontSize: '12px', background: 'rgba(239,68,68,0.1)', padding: '6px 10px', borderRadius: '4px', flexShrink: 0, marginBottom: '10px' }}>
                    {publishError}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
                {/* List of Active Deployments */}
                {worldDeployments.map((site) => (
                    <div key={site.name} style={{ 
                        display: 'flex', alignItems: 'center', gap: '15px', 
                        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
                        padding: '10px 15px', borderRadius: '8px', 
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.1)', transition: 'all 0.2s ease'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <span style={{ color: '#10b981', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', textShadow: '0 0 10px rgba(16,185,129,0.3)' }}>{'\u2713'} Live:</span>
                            <a href={site.url} target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace', color: '#10b981', textDecoration: 'none', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, transition: 'color 0.2s' }} onMouseOver={e=>e.target.style.color='#34d399'} onMouseOut={e=>e.target.style.color='#10b981'}>
                                {site.url}
                            </a>
                            <FaCopy style={{ cursor: 'pointer', color: copiedUrl === site.url ? '#10b981' : '#64748b', flexShrink: 0, transition: 'all 0.2s' }} onClick={() => copyToClipboard(site.url)} title="Copy Link" size={14} onMouseOver={e=>e.target.style.color='#10b981'} onMouseOut={e=>e.target.style.color=copiedUrl===site.url?'#10b981':'#64748b'} />
                            <a href={site.url} target="_blank" rel="noreferrer" style={{ color: '#64748b', flexShrink: 0, transition: 'color 0.2s' }} title="Open in new tab" onMouseOver={e=>e.target.style.color='#94a3b8'} onMouseOut={e=>e.target.style.color='#64748b'}><FaExternalLinkAlt size={12} /></a>
                        </div>
                        <button
                            onClick={() => unpublishWorld(site.name)}
                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)'; }}
                            style={{
                                background: 'transparent', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)',
                                padding: '6px 15px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0,
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <FaTrash size={11} /> Unpublish
                        </button>
                    </div>
                ))}

                {/* Publish New Form (If < 3) */}
                {worldDeployments.length < 3 && (
                    <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '15px', 
                        background: 'rgba(59, 130, 246, 0.03)', backdropFilter: 'blur(8px)',
                        padding: '10px 15px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.1)' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', flex: 1, transition: 'border 0.3s' }}>
                            <span style={{ color: '#64748b', fontSize: '12px', paddingLeft: '5px', whiteSpace: 'nowrap' }}>kevryn-ide.onrender.com/sites/.../</span>
                            <input
                                type="text"
                                placeholder="e.g. resume (leave blank to auto-generate)"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value.replace(/[^a-z0-9-_]/gi, '').toLowerCase())}
                                style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '13px', outline: 'none', padding: '4px', width: '100%', minWidth: 0, fontWeight: '500' }}
                            />
                        </div>
                        <button
                            onClick={publishToWorld}
                            disabled={isPublishing}
                            onMouseOver={e => !isPublishing && (e.currentTarget.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.4)')}
                            onMouseOut={e => !isPublishing && (e.currentTarget.style.boxShadow = 'none')}
                            style={{
                                background: isPublishing ? 'linear-gradient(135deg, #475569, #334155)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                color: 'white', border: 'none', padding: '8px 22px', borderRadius: '6px',
                                fontSize: '13px', fontWeight: 'bold', cursor: isPublishing ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s ease', whiteSpace: 'nowrap', flexShrink: 0
                            }}
                        >
                            {isPublishing ? <FaSpinner className="spin" size={12} /> : '\uD83D\uDE80'} {isPublishing ? 'Publishing...' : 'Publish'}
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                .spin { animation: spin-anim 0.8s linear infinite; }
                @keyframes spin-anim { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );

    return (
        <div style={{
            height: '100%', background: 'var(--bg-primary, #1a1a2e)',
            color: 'var(--text-primary, #e0e0e0)',
            display: 'flex', flexDirection: 'column'
        }}>
            <div style={{
                padding: '10px 20px', borderBottom: '1px solid var(--border-color, #333)',
                background: 'var(--bg-secondary, #16213e)',
                fontWeight: 'bold', fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '8px'
            }}>
                {activeMode === 'local'
                    ? <><FaMobileAlt color="#a78bfa" /> Local LAN Test Environment</>
                    : <><FaGlobe color="#3b82f6" /> Worldwide Static Deployment {worldDeployments.length > 0 && <span style={{ color: '#888', fontWeight: 'normal' }}>({worldDeployments.length}/3)</span>}</>
                }
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                {activeMode === 'local' ? renderLocalLAN() : renderWorldDeploy()}
            </div>
        </div>
    );
};

export default DeploymentPanel;
