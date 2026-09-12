import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { FaBolt, FaCheck, FaChevronDown, FaCode, FaCopy, FaFileCode, FaHistory, FaKey, FaPaperPlane, FaPlus, FaRobot, FaSpinner, FaTimes } from 'react-icons/fa';

const PROVIDERS = {
    'google-gemini': {
        name: 'Google Gemini', defaultModel: 'gemini-3.8-flash',
        models: [
            ['gemini-3.8-flash', 'Gemini 3.8 Flash'], ['gemini-3-flash-preview', 'Gemini 3 Flash Preview'],
            ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'], ['gemini-2.5-flash', 'Gemini 2.5 Flash']
        ]
    },
    'groq-assistant': {
        name: 'Groq', defaultModel: 'openai/gpt-oss-120b',
        models: [
            ['openai/gpt-oss-120b', 'OpenAI GPT-OSS 120B'], ['openai/gpt-oss-20b', 'OpenAI GPT-OSS 20B'],
            ['llama-3.3-70b-versatile', 'Meta Llama 3.3 70B'], ['llama-3.1-8b-instant', 'Meta Llama 3.1 8B']
        ]
    }
};

const makeId = () => (typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const makeThread = () => ({ id: makeId(), title: 'New conversation', messages: [], updatedAt: Date.now() });

const AIPanel = ({ token, code, fileName, language, onApplyCode, targetAgentId = 'groq-assistant', onOpenSettings, userId }) => {
    const provider = PROVIDERS[targetAgentId] ? targetAgentId : 'groq-assistant';
    const storageKey = `kevryn.desktop.ai.threads.${userId || 'local'}`;
    const modelKey = `kevryn.desktop.ai.models.${userId || 'local'}`;
    const [threads, setThreads] = useState(() => ({ 'google-gemini': [], 'groq-assistant': [] }));
    const [activeIds, setActiveIds] = useState({});
    const [models, setModels] = useState(() => ({ 'google-gemini': 'gemini-3.8-flash', 'groq-assistant': 'openai/gpt-oss-120b' }));
    const [input, setInput] = useState('');
    const [includeFile, setIncludeFile] = useState(false);
    const [loading, setLoading] = useState({});
    const [status, setStatus] = useState({});
    const [historyOpen, setHistoryOpen] = useState(false);
    const [modelOpen, setModelOpen] = useState(false);
    const [atBottom, setAtBottom] = useState(true);
    const messagesRef = useRef(null);
    const loadedRef = useRef(false);
    const sendRef = useRef(null);

    useEffect(() => {
        try {
            const savedThreads = JSON.parse(localStorage.getItem(storageKey) || 'null');
            const savedModels = JSON.parse(localStorage.getItem(modelKey) || 'null');
            if (savedThreads) setThreads({ 'google-gemini': savedThreads['google-gemini'] || [], 'groq-assistant': savedThreads['groq-assistant'] || [] });
            if (savedModels) setModels(prev => ({ ...prev, ...savedModels }));
        } catch (_) { /* corrupted local history is safely ignored */ }
        loadedRef.current = true;
    }, [storageKey, modelKey]);
    useEffect(() => { if (loadedRef.current) localStorage.setItem(storageKey, JSON.stringify(threads)); }, [threads, storageKey]);
    useEffect(() => { if (loadedRef.current) localStorage.setItem(modelKey, JSON.stringify(models)); }, [models, modelKey]);

    const providerThreads = threads[provider] || [];
    const activeThread = providerThreads.find(thread => thread.id === activeIds[provider]) || providerThreads[0] || null;
    const messages = useMemo(() => activeThread?.messages || [], [activeThread]);
    const selectedModel = models[provider] || PROVIDERS[provider].defaultModel;
    const isLoading = !!loading[provider];

    useEffect(() => { setHistoryOpen(false); setModelOpen(false); }, [provider]);
    useEffect(() => {
        if (atBottom) messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, status, atBottom]);

    const updateThread = (providerId, threadId, update) => {
        setThreads(previous => ({ ...previous, [providerId]: (previous[providerId] || []).map(thread => thread.id === threadId ? { ...thread, ...update(thread) } : thread) }));
    };
    const createThread = (providerId = provider) => {
        const thread = makeThread();
        setThreads(previous => ({ ...previous, [providerId]: [thread, ...(previous[providerId] || [])] }));
        setActiveIds(previous => ({ ...previous, [providerId]: thread.id }));
        setHistoryOpen(false);
        return thread;
    };
    const onScroll = () => {
        const node = messagesRef.current;
        if (node) setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 36);
    };
    const addMessage = (providerId, threadId, message) => updateThread(providerId, threadId, thread => ({
        messages: [...thread.messages, message], updatedAt: Date.now(), title: thread.messages.length === 0 && message.role === 'user' ? message.content.slice(0, 48) : thread.title
    }));

    const sendMessage = async eventOrPrompt => {
        const automatedPrompt = typeof eventOrPrompt === 'string' ? eventOrPrompt : null;
        if (!automatedPrompt) eventOrPrompt?.preventDefault();
        const text = (automatedPrompt || input).trim();
        if (!text || isLoading) return;
        const providerId = provider;
        const thread = activeThread || createThread(providerId);
        const threadId = thread.id;
        const requestId = makeId();
        setInput(''); setLoading(previous => ({ ...previous, [providerId]: true })); setStatus(previous => ({ ...previous, [providerId]: 'Connecting…' }));
        addMessage(providerId, threadId, { id: makeId(), role: 'user', content: text, createdAt: Date.now() });
        const assistantId = makeId();
        addMessage(providerId, threadId, { id: assistantId, role: 'assistant', content: '', createdAt: Date.now(), streaming: true });
        try {
            if (!window.__KEVRYN_DESKTOP__ || !window.electronAPI) {
                const rawUrl = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
                const serverUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
                const response = await axios.post(`${serverUrl}/ai/chat`, {
                    messages: [...messages, { role: 'user', content: text }]
                }, { headers: { Authorization: token } });
                updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: response.data.response || 'No response generated.', streaming: false } : message) }));
                setLoading(previous => ({ ...previous, [providerId]: false })); setStatus(previous => ({ ...previous, [providerId]: null }));
                return;
            }
            const agentList = await window.electronAPI.getAgentList();
            const agent = agentList.find(item => item.manifest.id === providerId);
            if (!agent || !['AUTHENTICATED', 'RUNNING'].includes(agent.status)) throw new Error(`Add your ${PROVIDERS[providerId].name} API key in AI Provider Settings first.`);
            let accumulated = '';
            window.electronAPI.onAgentChatChunk(providerId, chunk => {
                accumulated += chunk;
                updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: accumulated } : message) }));
            });
            window.electronAPI.onAgentChatDone(providerId, () => {
                updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, streaming: false } : message) }));
                setLoading(previous => ({ ...previous, [providerId]: false })); setStatus(previous => ({ ...previous, [providerId]: null }));
            });
            window.electronAPI.onAgentChatError(providerId, error => {
                updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: `❌ ${error}`, streaming: false } : message) }));
                setLoading(previous => ({ ...previous, [providerId]: false })); setStatus(previous => ({ ...previous, [providerId]: null }));
            });
            await window.electronAPI.chatWithAgent(providerId, text, includeFile ? { code, fileName, language, model: models[providerId], requestId } : { model: models[providerId], requestId });
        } catch (error) {
            updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: `❌ ${error.message}`, streaming: false } : message) }));
            setLoading(previous => ({ ...previous, [providerId]: false })); setStatus(previous => ({ ...previous, [providerId]: null }));
        }
    };

    // Magic Fix and other IDE actions can dispatch a complete diagnostic directly
    // into the active provider without relying on a DOM button click.
    useEffect(() => { sendRef.current = sendMessage; });
    useEffect(() => {
        window.triggerAiChat = prompt => sendRef.current?.(prompt);
        return () => { delete window.triggerAiChat; };
    }, []);

    const renderAssistant = message => <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(message.content || (message.streaming ? 'Thinking…' : ''))) }} />;
    const modelLabel = PROVIDERS[provider].models.find(([id]) => id === selectedModel)?.[1] || selectedModel;

    return <aside className="ai-workspace" aria-label="AI workspace">
        <header className="ai-workspace-header">
            <div className="ai-provider-identity"><span className="ai-provider-mark">✦</span><div><strong>{PROVIDERS[provider].name}</strong><span>{isLoading ? 'Working' : 'Personal workspace'}</span></div></div>
            <div className="ai-header-actions"><button className="ai-icon-button" onClick={() => createThread()} title="New conversation"><FaPlus /></button><button className="ai-icon-button" onClick={() => setHistoryOpen(open => !open)} title="Conversation history"><FaHistory /></button><button className="ai-icon-button" onClick={onOpenSettings} title="AI provider settings"><FaKey /></button></div>
        </header>
        <div className="ai-model-bar"><span>Model</span><div className="ai-model-menu"><button onClick={() => setModelOpen(open => !open)} aria-expanded={modelOpen}>{modelLabel}<FaChevronDown /></button>{modelOpen && <div className="ai-model-options" role="listbox">{PROVIDERS[provider].models.map(([id, label]) => <button role="option" aria-selected={id === selectedModel} key={id} onClick={() => { setModels(previous => ({ ...previous, [provider]: id })); setModelOpen(false); }}><span>{label}</span>{id === selectedModel && <FaCheck />}</button>)}</div>}</div></div>
        {historyOpen && <div className="ai-history-drawer"><div><strong>{PROVIDERS[provider].name} conversations</strong><button onClick={() => setHistoryOpen(false)}><FaTimes /></button></div>{providerThreads.length === 0 ? <p>No saved conversations yet.</p> : providerThreads.map(thread => <button key={thread.id} className={thread.id === activeThread?.id ? 'selected' : ''} onClick={() => { setActiveIds(previous => ({ ...previous, [provider]: thread.id })); setHistoryOpen(false); }}>{thread.title}<small>{new Date(thread.updatedAt).toLocaleDateString()}</small></button>)}</div>}
        <div className="ai-conversation" ref={messagesRef} onScroll={onScroll}>
            {messages.length === 0 ? <div className="ai-empty-state"><div className="ai-empty-icon"><FaRobot /></div><h2>Start a conversation</h2><p>Choose a model, ask for help, or attach the current file when you want coding context.</p><button onClick={onOpenSettings}><FaKey /> Manage personal API keys</button></div> : messages.map(message => <article className={`ai-chat-message ${message.role}`} key={message.id}><div className="ai-chat-avatar">{message.role === 'user' ? 'You' : <FaRobot />}</div><div className="ai-chat-content">{message.role === 'assistant' ? renderAssistant(message) : message.content}{message.streaming && <span className="ai-streaming-dot"><FaSpinner className="spinning" /></span>}{message.role === 'assistant' && message.content && <div className="ai-message-actions"><button onClick={() => navigator.clipboard.writeText(message.content)}><FaCopy /> Copy</button>{onApplyCode && <button onClick={() => onApplyCode(message.content, language)}><FaCode /> Apply</button>}</div>}</div></article>)}
            {status[provider] && <div className="ai-connection-state"><FaBolt /> {status[provider]}</div>}
        </div>
        {!atBottom && messages.length > 0 && <button className="ai-jump-latest" onClick={() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); setAtBottom(true); }}>Jump to latest</button>}
        <form className="ai-composer" onSubmit={sendMessage}><label className="ai-context-toggle"><input type="checkbox" checked={includeFile} onChange={event => setIncludeFile(event.target.checked)} /><FaFileCode /> Attach current file</label><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder={`Ask ${PROVIDERS[provider].name} anything…`} rows="3" disabled={isLoading} /><div><span>Enter to send · Shift+Enter for new line</span><button type="submit" disabled={!input.trim() || isLoading}>{isLoading ? <FaSpinner className="spinning" /> : <FaPaperPlane />}</button></div></form>
    </aside>;
};

export default AIPanel;
