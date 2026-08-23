import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaTimes, FaRobot, FaCheckCircle, FaKey } from 'react-icons/fa';

const AgentHubModal = ({ isOpen, onClose }) => {
    const [agents, setAgents] = useState([]);
    const [authKey, setAuthKey] = useState({});

    useEffect(() => {
        if (isOpen && window.__KEVRYN_DESKTOP__) {
            loadAgents();
        }
    }, [isOpen]);

    const loadAgents = async () => {
        try {
            const list = await window.electronAPI.getAgentList();
            setAgents(list);
        } catch (e) {
            console.error("Failed to load agents", e);
        }
    };

    const handleAuthenticate = async (agentId) => {
        const secret = authKey[agentId];
        if (!secret) {
            alert("Please enter an API Key first.");
            return;
        }
        try {
            const success = await window.electronAPI.authenticateAgent(agentId, secret);
            if (success) {
                alert("Agent Authenticated Successfully!");
                loadAgents(); // refresh status
                setAuthKey(prev => ({ ...prev, [agentId]: '' }));
            } else {
                alert("Authentication Failed. Invalid API Key.");
            }
        } catch (e) {
            alert("Error authenticating: " + e.message);
        }
    };

    const handleSignout = async (agentId) => {
        try {
            await window.electronAPI.signoutAgent(agentId);
            loadAgents();
        } catch (e) {
            alert("Error signing out: " + e.message);
        }
    };

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                style={{ width: '600px', background: '#1e1e2e', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FaRobot size={20} color="#8b5cf6" />
                        <span style={{ fontSize: '16px', fontWeight: 'bold', color: 'white' }}>KevRyn Agent Extension Hub</span>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', display: 'flex' }}><FaTimes size={16} /></button>
                </div>
                
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '60vh', overflowY: 'auto' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                        Install and configure third-party AI agents. KevRyn runs these agents entirely locally and securely uses your personal API keys (which are never sent to KevRyn Cloud).
                    </p>

                    {agents.map((agent) => (
                        <div key={agent.manifest.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {agent.manifest.name}
                                        {agent.status === 'AUTHENTICATED' || agent.status === 'RUNNING' ? (
                                            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><FaCheckCircle /> Installed</span>
                                        ) : (
                                            <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>Setup Required</span>
                                        )}
                                    </h3>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{agent.manifest.description} (v{agent.manifest.version})</p>
                                </div>
                            </div>
                            
                            {(agent.status === 'AUTH_REQUIRED' || agent.status === 'NOT_INSTALLED') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input 
                                            type="password"
                                            placeholder="Paste Google AI Studio API Key..."
                                            value={authKey[agent.manifest.id] || ''}
                                            onChange={(e) => setAuthKey(prev => ({...prev, [agent.manifest.id]: e.target.value}))}
                                            style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: 'white', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}
                                        />
                                        <button 
                                            onClick={() => handleAuthenticate(agent.manifest.id)}
                                            style={{ background: 'var(--accent-primary)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 24px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                                        >
                                            <FaKey size={12} /> Save Key
                                        </button>
                                    </div>
                                    
                                    {agent.manifest.id === 'google-gemini' && (
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', fontSize: '12px', textDecoration: 'none' }}>
                                            Get a free Gemini API Key here &rarr;
                                        </a>
                                    )}
                                    {agent.manifest.id === 'groq-assistant' && (
                                        <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: '#8b5cf6', fontSize: '12px', textDecoration: 'none' }}>
                                            Get a free Groq API Key here &rarr;
                                        </a>
                                    )}
                                </div>
                            )}

                            {(agent.status === 'AUTHENTICATED' || agent.status === 'RUNNING') && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                                    <div style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FaCheckCircle size={12} /> Authenticated and ready for secure workspace access.
                                    </div>
                                    <button 
                                        onClick={() => handleSignout(agent.manifest.id)}
                                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', padding: '6px 15px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                    >
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {agents.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                            Loading agents...
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default AgentHubModal;
