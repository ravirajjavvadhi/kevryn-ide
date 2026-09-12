import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaTimes, FaRobot, FaCheckCircle, FaKey, FaExternalLinkAlt, FaSyncAlt } from 'react-icons/fa';

const PROVIDER_COPY = {
    'google-gemini': { keyLabel: 'Gemini API key', getKey: 'Get a Gemini API key' },
    'groq-assistant': { keyLabel: 'Groq API key', getKey: 'Get a Groq API key' }
};

const AgentHubModal = ({ isOpen, onClose }) => {
    const [agents, setAgents] = useState([]);
    const [authKey, setAuthKey] = useState({});
    const [busy, setBusy] = useState({});
    const [result, setResult] = useState({});
    const loadAgents = async () => setAgents(await window.electronAPI.getAgentList());

    useEffect(() => { if (isOpen && window.__KEVRYN_DESKTOP__) loadAgents(); }, [isOpen]);

    const handleAuthenticate = async (agentId) => {
        const secret = authKey[agentId]?.trim();
        if (!secret) return setResult(prev => ({ ...prev, [agentId]: { error: 'Paste your API key first.' } }));
        setBusy(prev => ({ ...prev, [agentId]: true }));
        setResult(prev => ({ ...prev, [agentId]: { message: 'Checking key and available models…' } }));
        try {
            const response = await window.electronAPI.authenticateAgent(agentId, secret);
            if (!response?.success) throw new Error(response?.error || 'The provider rejected this API key.');
            setAuthKey(prev => ({ ...prev, [agentId]: '' }));
            setResult(prev => ({ ...prev, [agentId]: { message: `Connected. ${response.models.length} model${response.models.length === 1 ? '' : 's'} available to this key.` } }));
            await loadAgents();
        } catch (e) { setResult(prev => ({ ...prev, [agentId]: { error: e.message } })); }
        finally { setBusy(prev => ({ ...prev, [agentId]: false })); }
    };

    const handleSignout = async (agentId) => {
        await window.electronAPI.signoutAgent(agentId);
        setResult(prev => ({ ...prev, [agentId]: { message: 'Local API key removed.' } }));
        await loadAgents();
    };

    if (!isOpen) return null;
    return <motion.div className="agent-settings-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div className="agent-settings-modal" initial={{ scale: .97, y: 16 }} animate={{ scale: 1, y: 0 }} onClick={e => e.stopPropagation()}>
            <header><div><FaRobot /> <strong>AI Provider Settings</strong></div><button onClick={onClose} aria-label="Close settings"><FaTimes /></button></header>
            <main>
                <p className="agent-settings-intro">Use your own API keys. They are verified directly with the provider and stored only in this desktop app using your operating system’s secure credential storage.</p>
                {agents.map(agent => {
                    const configured = agent.status === 'AUTHENTICATED' || agent.status === 'RUNNING';
                    const copy = PROVIDER_COPY[agent.manifest.id];
                    const feedback = result[agent.manifest.id];
                    return <section className="agent-card" key={agent.manifest.id}>
                        <div className="agent-card-title"><div><h3>{agent.manifest.name}</h3><p>{agent.manifest.description}</p></div><span className={configured ? 'agent-ready' : 'agent-needs-key'}>{configured ? 'Ready' : 'Key required'}</span></div>
                        {configured ? <div className="agent-configured"><span><FaCheckCircle /> Personal key saved locally</span><button className="agent-secondary" onClick={() => handleSignout(agent.manifest.id)}>Remove key</button></div> : <div className="agent-key-form">
                            <label htmlFor={`key-${agent.manifest.id}`}>{copy?.keyLabel || 'API key'}</label>
                            <div className="agent-key-row"><input id={`key-${agent.manifest.id}`} type="password" autoComplete="off" placeholder={`Paste your ${copy?.keyLabel || 'API key'}`} value={authKey[agent.manifest.id] || ''} onChange={e => setAuthKey(prev => ({ ...prev, [agent.manifest.id]: e.target.value }))} />
                                <button disabled={busy[agent.manifest.id]} onClick={() => handleAuthenticate(agent.manifest.id)}>{busy[agent.manifest.id] ? <><FaSyncAlt className="spinning" /> Testing</> : <><FaKey /> Save & test</>}</button></div>
                            <button className="agent-link" onClick={() => window.electronAPI.openProviderKeyPage(agent.manifest.id)}>{copy?.getKey || 'Get an API key'} <FaExternalLinkAlt /></button>
                        </div>}
                        {feedback?.message && <p className="agent-feedback success">{feedback.message}</p>}
                        {feedback?.error && <p className="agent-feedback error">{feedback.error}</p>}
                    </section>;
                })}
            </main>
        </motion.div>
    </motion.div>;
};

export default AgentHubModal;
