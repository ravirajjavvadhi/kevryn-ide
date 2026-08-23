import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
    FaPaperPlane, FaRobot, FaSpinner, FaCheck, FaTimes,
    FaBolt, FaMagic, FaCopy, FaCode,
    FaTrash, FaTerminal, FaPlus, FaHistory
} from 'react-icons/fa';

const _rawServerUrl = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_URL = _rawServerUrl.startsWith('http') ? _rawServerUrl : `https://${_rawServerUrl}`;

const AIPanel = ({ token, code, fileName, language, onApplyCode, targetAgentId }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [agentStatus, setAgentStatus] = useState(null);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    const chatEndRef = useRef(null);
    const api = useMemo(() => axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } }), [token]);

    // Allow external trigger (e.g., debug terminal button)
    useEffect(() => {
        window.triggerAiChat = (msg) => {
            setInput(msg);
            setTimeout(() => {
                const sendBtn = document.querySelector('.ai-send-btn');
                if (sendBtn) sendBtn.click();
            }, 100);
        };

        const handleTelemetry = (e) => {
            if (e.detail?.message) setAgentStatus(e.detail.message);
            if (e.detail?.status === 'complete') setAgentStatus(null);
        };
        window.addEventListener('agent-telemetry', handleTelemetry);

        return () => {
            delete window.triggerAiChat;
            window.removeEventListener('agent-telemetry', handleTelemetry);
        };
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, agentStatus]);

    // ── SESSION MANAGEMENT ───────────────────────────────────────
    const fetchSessions = async () => {
        try {
            const response = await api.get('/ai/sessions');
            setSessions(response.data.sessions || []);
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
        }
    };

    const loadSession = async (sessionId) => {
        setIsLoading(true);
        setShowHistory(false);
        try {
            const response = await api.get(`/ai/sessions/${sessionId}`);
            const session = response.data.session;
            setMessages(session.messages);
            setCurrentSessionId(session._id);
        } catch (error) {
            console.error('Failed to load session:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteSession = async (e, sessionId) => {
        e.stopPropagation();
        try {
            await api.delete(`/ai/sessions/${sessionId}`);
            setSessions(prev => prev.filter(s => s._id !== sessionId));
            if (currentSessionId === sessionId) newChat();
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    };

    const newChat = () => {
        setMessages([]);
        setCurrentSessionId(null);
        setShowHistory(false);
        setAgentStatus(null);
    };

    // ── CLIPBOARD ────────────────────────────────────────────────
    const copyToClipboard = (text, index) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    // ── MARKDOWN + CODE BLOCK RENDERER ───────────────────────────
    const renderMessageContent = useCallback((content, msgIndex) => {
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        let blockIndex = 0;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                const textBefore = content.substring(lastIndex, match.index);
                parts.push(<div key={`text-${blockIndex}`} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(textBefore)) }} className="ai-text-content" />);
            }

            const codeLang = match[1] ? match[1].toLowerCase() : 'code';
            const terminalLangs = ['powershell', 'bash', 'shell', 'sh', 'cmd', 'zsh', 'terminal'];
            const isTerminal = terminalLangs.includes(codeLang);
            const codeContent = match[2].trim();
            const currentBlockIndex = `${msgIndex}-${blockIndex}`;

            parts.push(
                <div key={`code-${blockIndex}`} className="ai-code-block">
                    <div className="ai-code-header">
                        <span className="ai-code-lang">{codeLang}</span>
                        <div className="ai-code-actions">
                            <button className="ai-code-btn" onClick={() => copyToClipboard(codeContent, currentBlockIndex)}>
                                {copiedIndex === currentBlockIndex ? <><FaCheck size={10} /> Copied!</> : <><FaCopy size={10} /> Copy</>}
                            </button>
                            {onApplyCode && (
                                <button className="ai-code-btn ai-apply-btn" onClick={() => onApplyCode(codeContent, codeLang)}>
                                    {isTerminal ? <FaTerminal size={10} /> : <FaCode size={10} />}
                                    {isTerminal ? " Run" : " Apply"}
                                </button>
                            )}
                        </div>
                    </div>
                    <pre className="ai-code-pre"><code>{codeContent}</code></pre>
                </div>
            );
            lastIndex = match.index + match[0].length;
            blockIndex++;
        }

        if (lastIndex < content.length) {
            const remaining = content.substring(lastIndex);
            parts.push(<div key={`text-end`} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(remaining)) }} className="ai-text-content" />);
        }

        return parts.length > 0 ? parts : <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(content)) }} className="ai-text-content" />;
    }, [copiedIndex, onApplyCode]);

    // ── SEND MESSAGE ─────────────────────────────────────────────
    const sendMessage = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setIsLoading(true);
        setAgentStatus('Connecting...');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

        try {
            if (window.__KEVRYN_DESKTOP__ && window.electronAPI) {
                // Find active agent
                const agents = await window.electronAPI.getAgentList();
                let activeAgent = targetAgentId ? agents.find(a => a.manifest.id === targetAgentId) : null;
                
                if (!activeAgent) {
                    activeAgent = agents.find(a => a.status === 'RUNNING') || agents.find(a => a.status === 'AUTHENTICATED');
                }
                const finalAgentId = activeAgent ? activeAgent.manifest.id : 'google-gemini';

                setMessages(prev => [...prev, { role: 'assistant', content: '' }]); // placeholder
                
                // Set up chunk listener BEFORE sending request
                let accumulated = '';
                const onChunk = (chunk) => {
                    accumulated += chunk;
                    setMessages(prev => {
                        const newMsg = [...prev];
                        newMsg[newMsg.length - 1].content = accumulated;
                        return newMsg;
                    });
                };
                
                window.electronAPI.onAgentChatChunk(finalAgentId, onChunk);
                
                return new Promise((resolve) => {
                    window.electronAPI.onAgentChatDone(finalAgentId, () => {
                        setIsLoading(false);
                        setAgentStatus(null);
                        resolve();
                    });
                    window.electronAPI.onAgentChatError(finalAgentId, (err) => {
                        setMessages(prev => {
                            const newMsg = [...prev];
                            newMsg[newMsg.length - 1].content = `❌ Error: ${err}`;
                            return newMsg;
                        });
                        setIsLoading(false);
                        setAgentStatus(null);
                        resolve();
                    });
                    
                    window.electronAPI.chatWithAgent(finalAgentId, userMessage, {
                        code, fileName, language
                    }).catch(e => {
                        setMessages(prev => {
                            const newMsg = [...prev];
                            newMsg[newMsg.length - 1].content = `❌ Error initializing agent: ${e.message}`;
                            return newMsg;
                        });
                        setIsLoading(false);
                        setAgentStatus(null);
                        resolve();
                    });
                });
            } else {
                // Cloud / Legacy Routing
                const fullMessages = [
                    ...messages,
                    { role: 'user', content: userMessage }
                ];

                const response = await api.post('/ai/chat', {
                    messages: fullMessages,
                    sessionId: currentSessionId
                });

                setMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
                if (response.data.sessionId) setCurrentSessionId(response.data.sessionId);
                setIsLoading(false);
                setAgentStatus(null);
            }
        } catch (error) {
            console.error("AI Error:", error);
            const errorMsg = error.response?.data?.error || error.message;
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${errorMsg}` }]);
            setIsLoading(false);
            setAgentStatus(null);
        }
    };

    // ── RENDER ───────────────────────────────────────────────────    // ✨ RENDER ✨
    let headerTitle = "KevRyn AI";
    if (targetAgentId === 'groq-assistant') headerTitle = "Groq Neural Core";
    if (targetAgentId === 'google-gemini') headerTitle = "Google Gemini";

    return (
        <div className="ai-panel">
            <div className="ai-header">
                <div className="ai-header-left">
                    <div className="ai-logo"><FaMagic size={14} /></div>
                    <span className="ai-title">{headerTitle}</span>
                    <span style={{ fontSize: '10px', color: '#10b981', marginLeft: '8px', fontWeight: 600 }}>● Online</span>
                </div>
                <div className="ai-header-right">
                    <button onClick={newChat} className="ai-header-btn" title="New Chat"><FaPlus size={12} /></button>
                    <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchSessions(); }} className={`ai-header-btn ${showHistory ? 'active' : ''}`} title="History"><FaHistory size={12} /></button>
                </div>
            </div>

            {showHistory && (
                <div className="ai-history-overlay">
                    <div className="ai-history-header">
                        <span>Chat History</span>
                        <FaTimes className="close-history" onClick={() => setShowHistory(false)} />
                    </div>
                    <div className="ai-history-list">
                        {sessions.length === 0 ? <div className="no-history">No past conversations</div> :
                            sessions.map(s => (
                                <div key={s._id} className={`history-item ${currentSessionId === s._id ? 'active' : ''}`} onClick={() => loadSession(s._id)}>
                                    <div className="history-info">
                                        <div className="history-title">{s.title || 'New Chat'}</div>
                                    </div>
                                    <FaTrash className="delete-history" onClick={(e) => deleteSession(e, s._id)} />
                                </div>
                            ))}
                    </div>
                </div>
            )}

            <div className="ai-messages">
                {messages.length === 0 && (
                    <div className="ai-welcome">
                        <div className="ai-welcome-icon"><FaMagic size={28} /></div>
                        <div className="ai-welcome-title">KevRyn Neural Core</div>
                        <div className="ai-welcome-subtitle">Your custom-trained AI. Always online.</div>
                        <div className="ai-welcome-hints">
                            <span className="ai-hint" onClick={() => { setInput('Build a complete Authentication React component.'); }}>Build Auth UI</span>
                            <span className="ai-hint" onClick={() => { setInput('Write a python snake game.'); }}>Write Python Snake</span>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`ai-message ai-message-${msg.role}`}>
                        {msg.role === 'assistant' && <div className="ai-avatar"><FaRobot size={10} /></div>}
                        <div className={`ai-bubble ai-bubble-${msg.role}`}>
                            {msg.role === 'assistant' ? renderMessageContent(msg.content, i) : <span>{msg.content}</span>}
                        </div>
                    </div>
                ))}

                {agentStatus && (
                    <div className="ai-message ai-message-assistant" style={{ opacity: 0.8 }}>
                        <div className="ai-avatar"><FaBolt size={10} color="#f59e0b" /></div>
                        <div className="ai-thinking" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FaSpinner className="spinning" size={12} color="#f59e0b" />
                            <span style={{ fontSize: '12px', color: '#f59e0b', fontStyle: 'italic' }}>{agentStatus}</span>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            <form onSubmit={sendMessage} className="ai-input-form">
                <div className="ai-input-wrapper" style={{ borderColor: '#8b5cf6' }}>
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask your Neural Core anything..."
                        disabled={isLoading}
                        className="ai-input"
                    />
                    <button type="submit" disabled={!input.trim() || isLoading} className="ai-send-btn" style={{ color: '#8b5cf6' }}>
                        <FaPaperPlane size={12} />
                    </button>
                </div>
                <div className="ai-input-footer">
                    KevRyn Neural Core • Always Online 🛰️
                </div>
            </form>
        </div>
    );
};

export default AIPanel;
