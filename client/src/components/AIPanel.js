import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { marked } from 'marked';
import {
    FaPaperPlane, FaRobot, FaSpinner, FaCheck, FaTimes, FaKey,
    FaSearch, FaBug, FaBolt, FaMagic, FaComment, FaCopy, FaCode,
    FaTrash, FaChevronDown, FaChevronUp, FaEye, FaTerminal
} from 'react-icons/fa';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

const AIPanel = ({ token, code, fileName, language, onApplyCode }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [groqStatus, setGroqStatus] = useState({ available: false, provider: 'groq' });
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [isSettingKey, setIsSettingKey] = useState(false);
    const [activeAction, setActiveAction] = useState(null);
    const [showActions, setShowActions] = useState(true);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const chatEndRef = useRef(null);
    const api = useMemo(() => axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } }), [token]);

    useEffect(() => {
        checkGroqStatus();

        // --- GLOBAL ACCESS FOR TRIGGERING CHAT ---
        window.triggerAiChat = (msg) => {
            setInput(msg);
            // Simulate enter or just call sendMessage directly if we refactor it
            // For now, setting input is enough for the user to just click send,
            // but let's try to trigger it automatically.
            setTimeout(() => {
                const sendBtn = document.querySelector('.ai-send-btn');
                if (sendBtn) sendBtn.click();
            }, 100);
        };

        return () => {
            // Clean up the global function when the component unmounts
            delete window.triggerAiChat;
        };
    }, [token, setInput]); // Added setInput to dependencies as it's used inside the effect

    const checkGroqStatus = async () => {
        try {
            const response = await axios.get(`${SERVER_URL}/ai/status`);
            setGroqStatus(response.data);
        } catch (error) {
            console.error('Failed to check Groq status:', error);
        }
    };

    const submitApiKey = async () => {
        if (!apiKeyInput.trim()) return;
        setIsSettingKey(true);
        try {
            await axios.post(`${SERVER_URL}/ai/api-key`, { apiKey: apiKeyInput.trim() });
            setApiKeyInput('');
            await checkGroqStatus();
        } catch (error) {
            console.error('Failed to set API key:', error);
        } finally {
            setIsSettingKey(false);
        }
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Extract code blocks from markdown for Apply/Copy buttons
    const renderMessageContent = useCallback((content, msgIndex) => {
        const html = marked(content);

        // Split content by code blocks to add action buttons
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        let blockIndex = 0;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            // Text before code block
            if (match.index > lastIndex) {
                const textBefore = content.substring(lastIndex, match.index);
                parts.push(
                    <div key={`text-${blockIndex}`}
                        dangerouslySetInnerHTML={{ __html: marked(textBefore) }}
                        className="ai-text-content"
                    />
                );
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
                            <button
                                className="ai-code-btn"
                                onClick={() => copyToClipboard(codeContent, currentBlockIndex)}
                                title="Copy code"
                            >
                                {copiedIndex === currentBlockIndex ?
                                    <><FaCheck size={10} /> Copied!</> :
                                    <><FaCopy size={10} /> Copy</>
                                }
                            </button>
                            {onApplyCode && (
                                <button
                                    className="ai-code-btn ai-apply-btn"
                                    onClick={() => onApplyCode(codeContent, codeLang)}
                                    title={isTerminal ? "Run in Terminal" : "Apply to editor"}
                                >
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

        // Remaining text after last code block
        if (lastIndex < content.length) {
            const remaining = content.substring(lastIndex);
            parts.push(
                <div key={`text-end`}
                    dangerouslySetInnerHTML={{ __html: marked(remaining) }}
                    className="ai-text-content"
                />
            );
        }

        return parts.length > 0 ? parts : (
            <div dangerouslySetInnerHTML={{ __html: html }} className="ai-text-content" />
        );
    }, [copiedIndex, onApplyCode]);

    const copyToClipboard = (text, index) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    // Quick Actions
    const quickActions = [
        { id: 'explain', label: 'Explain', icon: <FaSearch size={11} />, color: '#3b82f6', endpoint: '/ai/explain', dataKey: 'explanation' },
        { id: 'fix', label: 'Fix Bugs', icon: <FaBug size={11} />, color: '#ef4444', endpoint: '/ai/fix', dataKey: 'fixed' },
        { id: 'optimize', label: 'Optimize', icon: <FaBolt size={11} />, color: '#f59e0b', endpoint: '/ai/optimize', dataKey: 'optimized' },
        { id: 'generate', label: 'Generate', icon: <FaMagic size={11} />, color: '#8b5cf6', endpoint: '/ai/generate', dataKey: 'generated' },
        { id: 'comment', label: 'Comment', icon: <FaComment size={11} />, color: '#10b981', endpoint: '/ai/comment', dataKey: 'commented' },
        { id: 'auto-dev', label: 'Auto-Dev', icon: <FaRobot size={11} />, color: '#f43f5e', endpoint: '/ai/auto/plan', dataKey: 'plan' },
    ];

    const [mode, setMode] = useState('chat'); // 'chat' | 'auto-dev'

    // ... existing status check ...

    // Handle Quick Action Click
    const handleQuickAction = async (action) => {
        if (action.id === 'auto-dev') {
            setMode(mode === 'auto-dev' ? 'chat' : 'auto-dev');
            return;
        }

        if (!code && (!input.trim() || input === '')) {
            setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Please open a file or enter a prompt first.' }]);
            return;
        }

        setActiveAction(action.id);
        setIsLoading(true);

        // Context message
        setMessages(prev => [...prev, {
            role: 'user',
            content: `🔧 **${action.label}** : ${fileName || 'No file'}`
        }]);

        try {
            let response;
            if (action.id === 'generate') {
                const description = input.trim() || 'Improve this code';
                response = await api.post(action.endpoint, { description, language: language || 'javascript' });
            } else {
                response = await api.post(action.endpoint, { code, language: language || 'javascript' });
            }

            const aiResponse = response.data[action.dataKey] || response.data.response || 'No response';
            setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
            setInput('');
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${error.response?.data?.error || error.message}` }]);
        } finally {
            setIsLoading(false);
            setActiveAction(null);
        }
    };


    const handleDiffReview = async (filePlan) => {
        try {
            let oldCode = "";
            // If it's the currently open file, use the editor code
            if (fileName === filePlan.path) {
                oldCode = code;
            } else {
                // Fetch current content from DB
                const res = await api.get('/files');
                const existing = res.data.find(f => f.name === filePlan.path);
                if (existing) {
                    oldCode = existing.content || "";
                }
            }

            if (window.openDiff) {
                window.openDiff({
                    oldCode,
                    newCode: filePlan.content || "// No content change",
                    fileName: filePlan.path,
                    language: language || 'javascript',
                    onApply: (finalCode) => {
                        // For AutoDev diffs, we just update the content in the plan temporarily
                        // so the final "Execute" uses the adjusted code if they want to edit it
                        filePlan.content = finalCode;
                    }
                });
            }
        } catch (e) {
            console.error("Diff Review Error:", e);
        }
    };

    const executePlan = async (plan, msgIndex) => {
        try {
            // Update message to show executing state
            setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, executed: 'loading' } : m));

            if (window.handleAutoDevExecution) {
                await window.handleAutoDevExecution(plan);
                setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, executed: 'success' } : m));
            } else {
                alert("Auto-Dev execution handler missing. Please refresh the page.");
                setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, executed: 'error' } : m));
            }
        } catch (e) {
            console.error(e);
            setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, executed: 'error' } : m));
        }
    };


    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        setInput('');
        setIsLoading(true);

        try {
            if (mode === 'auto-dev') {
                // Auto-Dev Mode Logic
                const response = await api.post('/ai/auto/plan', { prompt: currentInput });
                const aiResponse = response.data.plan;
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    type: 'plan',
                    content: aiResponse
                }]);
            } else {
                // Standard Chat Logic
                const hasCode = code && code.trim() && code !== '// Select a file to start coding...';
                const systemContext = hasCode ? [{
                    role: 'system',
                    content: `The user is working on a file called "${fileName}" ({language}). Here is their current code:\n\`\`\`${language}\n${code}\n\`\`\`\nHelp them.`
                }] : [];
                const chatHistory = messages
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .slice(-6)
                    .map(m => ({ role: m.role, content: m.content }));

                const response = await api.post('/ai/chat', {
                    messages: [...systemContext, ...chatHistory, { role: 'user', content: currentInput }]
                });

                setMessages(prev => [...prev, { role: 'assistant', content: response.data.response }]);
            }

        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ ${error.response?.data?.error || error.message}`
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => setMessages([]);

    return (
        <div className="ai-panel">
            {/* Header */}
            <div className="ai-header">
                <div className="ai-header-left">
                    <div className="ai-logo">
                        <FaRobot size={14} />
                    </div>
                    <span className="ai-title">AI Assistant</span>
                    <span className="ai-model-badge">Groq</span>
                </div>
                <div className="ai-header-right">
                    {groqStatus.available ? (
                        <span className="ai-status ai-status-online">
                            <span className="ai-status-dot"></span> Ready
                        </span>
                    ) : (
                        <span className="ai-status ai-status-offline">
                            <FaTimes size={10} /> Offline
                        </span>
                    )}
                    <button onClick={clearChat} className="ai-clear-btn" title="Clear chat">
                        <FaTrash size={10} />
                    </button>
                </div>
            </div>

            {/* API Key Input */}
            {!groqStatus.available && (
                <div className="ai-key-setup">
                    <div className="ai-key-title">
                        <FaKey size={12} /> Enter Groq API Key
                    </div>
                    <p className="ai-key-desc">
                        Get your free key at{' '}
                        <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                            console.groq.com
                        </a>
                    </p>
                    <div className="ai-key-input-row">
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="gsk_..."
                            onKeyDown={(e) => e.key === 'Enter' && submitApiKey()}
                            className="ai-key-input"
                        />
                        <button
                            onClick={submitApiKey}
                            disabled={isSettingKey || !apiKeyInput.trim()}
                            className="ai-key-btn"
                        >
                            {isSettingKey ? <FaSpinner className="spinning" size={12} /> : 'Connect'}
                        </button>
                    </div>
                </div>
            )}

            {/* Context Bar */}
            {groqStatus.available && fileName && fileName !== '' && (
                <div className="ai-context-bar">
                    <span className="ai-context-file">
                        📄 {fileName}
                    </span>
                    <span className="ai-context-lang">{language || 'plaintext'}</span>
                </div>
            )}

            {/* Quick Actions */}
            {groqStatus.available && (
                <div className="ai-actions-section">
                    <div
                        className="ai-actions-toggle"
                        onClick={() => setShowActions(!showActions)}
                    >
                        <span>Quick Actions</span>
                        {showActions ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
                    </div>
                    {showActions && (
                        <div className="ai-actions-grid">
                            {quickActions.map(action => (
                                <button
                                    key={action.id}
                                    className={`ai-action-btn ${(activeAction === action.id || (action.id === 'auto-dev' && mode === 'auto-dev')) ? 'active' : ''}`}
                                    onClick={() => handleQuickAction(action)}
                                    disabled={isLoading}
                                    style={{ '--action-color': action.color }}
                                    title={action.label}
                                >
                                    {activeAction === action.id ? (
                                        <FaSpinner className="spinning" size={11} />
                                    ) : (
                                        action.icon
                                    )}
                                    <span>{action.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            <div className="ai-messages">
                {messages.length === 0 && groqStatus.available && (
                    <div className="ai-welcome">
                        <div className="ai-welcome-icon">
                            <FaRobot size={28} />
                        </div>
                        <div className="ai-welcome-title">How can I help?</div>
                        <div className="ai-welcome-subtitle">
                            {mode === 'auto-dev' ? <span style={{ color: '#f43f5e' }}>Auto-Dev Mode Active</span> : "Ask me anything or use Quick Actions above"}
                        </div>
                        {mode !== 'auto-dev' && <div className="ai-welcome-hints">
                            <span className="ai-hint" onClick={() => setInput('Explain this code')}>
                                "Explain this code"
                            </span>
                            <span className="ai-hint" onClick={() => setInput('Find bugs in my code')}>
                                "Find bugs"
                            </span>
                        </div>}
                        {mode === 'auto-dev' && <div className="ai-welcome-hints">
                            <span className="ai-hint" onClick={() => setInput('Create a login page')}>
                                "Create a login page"
                            </span>
                            <span className="ai-hint" onClick={() => setInput('Setup a React component')}>
                                "Setup React component"
                            </span>
                        </div>}
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`ai-message ai-message-${msg.role}`}>
                        {msg.role === 'assistant' && (
                            <div className="ai-avatar">
                                <FaRobot size={12} />
                            </div>
                        )}
                        <div className={`ai-bubble ai-bubble-${msg.role}`}>
                            {msg.type === 'plan' ? (
                                <div className="ai-plan-card">
                                    <div className="ai-plan-header">
                                        <FaMagic className="ai-plan-icon" />
                                        <span>Auto-Dev Plan</span>
                                    </div>
                                    <div className="ai-plan-explanation">{msg.content.explanation}</div>

                                    <div className="ai-plan-section">
                                        <strong>Files ({msg.content.files?.length || 0})</strong>
                                        <ul className="ai-plan-list">
                                            {msg.content.files?.map((f, idx) => (
                                                <li key={idx} className="ai-plan-item">
                                                    <div className="ai-plan-item-left">
                                                        <span className={`badge badge-${f.action}`}>{f.action}</span>
                                                        <span className="file-path">{f.path}</span>
                                                    </div>
                                                    {(f.action === 'create' || f.action === 'update') && (
                                                        <button className="btn-review-diff" onClick={() => handleDiffReview(f)} title="Review Changes">
                                                            <FaEye /> Diff
                                                        </button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="ai-plan-section">
                                        <strong>Commands</strong>
                                        {msg.content.commands?.length > 0 ? (
                                            <div className="ai-plan-commands">
                                                {msg.content.commands.map((cmd, idx) => (
                                                    <div key={idx} className="ai-cmd">{cmd}</div>
                                                ))}
                                            </div>
                                        ) : <div className="text-muted">None</div>}
                                    </div>

                                    <div className="ai-plan-actions">
                                        {msg.executed === 'success' ? (
                                            <div className="ai-success-msg"><FaCheck /> Done!</div>
                                        ) : msg.executed === 'loading' ? (
                                            <div className="ai-loading-msg"><FaSpinner className="spinning" /> Working...</div>
                                        ) : msg.executed === 'error' ? (
                                            <div className="ai-error-msg"><FaTimes /> Failed</div>
                                        ) : (
                                            <>
                                                <button className="btn-approve" onClick={() => executePlan(msg.content, i)}>
                                                    <FaCheck /> Execute
                                                </button>
                                                <button className="btn-reject" onClick={() => setMessages(prev => prev.filter((_, idx) => idx !== i))}>
                                                    <FaTimes /> Reject
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                msg.role === 'assistant'
                                    ? renderMessageContent(msg.content, i)
                                    : <span>{msg.content}</span>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="ai-message ai-message-assistant">
                        <div className="ai-avatar">
                            <FaRobot size={12} />
                        </div>
                        <div className="ai-thinking">
                            <div className="ai-thinking-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="ai-input-form">
                <div className="ai-input-wrapper" style={{ borderColor: mode === 'auto-dev' ? '#f43f5e' : '' }}>
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={mode === 'auto-dev' ? "Describe feature to build..." : (groqStatus.available ? "Ask anything..." : "Connect API key to start")}
                        disabled={!groqStatus.available || isLoading}
                        className="ai-input"
                    />
                    <button
                        type="submit"
                        disabled={!groqStatus.available || !input.trim() || isLoading}
                        className="ai-send-btn"
                        style={{ color: mode === 'auto-dev' ? '#f43f5e' : '' }}
                    >
                        {mode === 'auto-dev' ? <FaMagic size={14} /> : <FaPaperPlane size={12} />}
                    </button>
                </div>
                <div className="ai-input-footer">
                    {mode === 'auto-dev' ? 'Auto-Dev Mode Active' : 'Groq · Llama 3 70B'}
                </div>
            </form>
        </div>
    );
};

export default AIPanel;
