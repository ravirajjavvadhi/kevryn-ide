import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { FaRobot, FaUser, FaPaperPlane, FaTimes, FaSpinner } from 'react-icons/fa';
import { marked } from 'marked';

const FacultyAssistant = ({ token, serverUrl, onClose }) => {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello Faculty! I am your AI Assistant powered by MCP Tools. Ask me to fetch session reports, download CSV attendance files, or lookup student competitive programming stats (GitHub, LeetCode, etc.).' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const newMessages = [...messages, { role: 'user', content: input }];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const api = axios.create({ baseURL: serverUrl, headers: { Authorization: token } });
            
            // Only send actual user/assistant messages to the backend to keep payload clean
            const payloadMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
            
            const res = await api.post('/ai/faculty-assistant', {
                messages: payloadMessages
            });

            setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
        } catch (error) {
            console.error("Assistant Error:", error);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error communicating with the neural core.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0', fontFamily: 'Inter' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', background: 'rgba(15, 23, 42, 0.95)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FaRobot size={20} color="#fff" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>KevRyn AI Assistant</h2>
                    <span style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span> MCP Tools Online</span>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: '15px', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: m.role === 'user' ? '#1e293b' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {m.role === 'user' ? <FaUser size={16} color="#94a3b8" /> : <FaRobot size={18} color="#fff" />}
                        </div>
                        <div style={{ maxWidth: '80%', padding: '16px', borderRadius: '12px', background: m.role === 'user' ? '#1e293b' : 'rgba(59, 130, 246, 0.1)', border: m.role === 'user' ? '1px solid #334155' : '1px solid rgba(59, 130, 246, 0.3)', color: m.role === 'user' ? '#e2e8f0' : '#f8fafc', fontSize: '14px', lineHeight: '1.6' }}
                             dangerouslySetInnerHTML={{ __html: marked(m.content) }}
                        />
                    </div>
                ))}
                {isLoading && (
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <FaSpinner className="fa-spin" color="#fff" />
                        </div>
                        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#94a3b8', fontSize: '14px' }}>
                            Processing MCP Tool Query...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #1e293b', background: '#0f172a' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                        type="text" 
                        value={input} 
                        onChange={e => setInput(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && handleSend()}
                        placeholder="E.g. Fetch today's session reports for Flutter..."
                        style={{ flex: 1, padding: '14px 20px', borderRadius: '25px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '15px', outline: 'none' }}
                        disabled={isLoading}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#3b82f6', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer', opacity: (isLoading || !input.trim()) ? 0.5 : 1 }}
                    >
                        <FaPaperPlane />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FacultyAssistant;
