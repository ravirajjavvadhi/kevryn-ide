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
const codeBlocks = content => [...String(content || '').matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map(match => ({ language: match[1].trim(), code: match[2].trim() }));
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const explicitWorkspaceAction = (prompt, earlierMessages, workspace) => {
    const wantsWrite = /\b(change|update|replace|modify|edit|write|rewrite|fix|create)\b/i.test(prompt);
    const wantsRun = /\b(run|execute|compile|test)\b/i.test(prompt);
    const wantsRename = /\b(rename|move)\b/i.test(prompt);
    const wantsProject = /\b(project|application|\bapp\b|website|web app|full stack|platform|dashboard)\b/i.test(prompt);
    if (!wantsWrite && !wantsRun && !wantsRename) return null;
    const files = workspace?.files || [];
    const renameMatch = prompt.match(/\b(?:rename|move)\s+([\w./-]+\.[\w+-]+)\s+(?:to|as)\s+([\w./-]+\.[\w+-]+)/i);
    if (wantsRename && renameMatch) {
        const from = files.find(file => String(file).toLowerCase() === renameMatch[1].toLowerCase() || String(file).endsWith(`/${renameMatch[1]}`));
        if (from && !renameMatch[2].includes('..') && !/^[\\/]|^[a-z]:/i.test(renameMatch[2])) return { type: 'rename', from, path: renameMatch[2], write: false, run: false, agentMode: false };
    }
    // The current request may say "change it"; retain a recently named file
    // from the conversation, but only if it is a real workspace file.
    const references = [prompt, ...earlierMessages.filter(message => message.role === 'user').map(message => message.content).reverse()];
    for (const reference of references) {
        const lowerReference = String(reference).toLowerCase();
        const match = files.find(file => lowerReference.includes(String(file).toLowerCase())) || files.find(file => {
            const base = String(file).split('/').pop();
            return base && new RegExp(`(^|[^\\w.-])${escapeRegExp(base)}($|[^\\w.-])`, 'i').test(reference);
        });
        if (match) return { path: match, write: wantsWrite, run: wantsRun, agentMode: false };
    }
    const namedNewFile = prompt.match(/\b([\w][\w./-]*\.(?:js|mjs|cjs|ts|tsx|jsx|py|java|c|cpp|h|hpp|html|css|json|md|go|rs|php|rb|cs|kt|swift|sh|ps1))\b/i)?.[1];
    if (wantsWrite && namedNewFile && !namedNewFile.includes('..') && !/^[\\/]|^[a-z]:/i.test(namedNewFile)) return { path: namedNewFile, write: true, create: true, run: wantsRun, agentMode: false };
    if (wantsProject) return { planning: true, write: false, run: false, agentMode: false };
    // A code request without a target must ask the user where it belongs;
    // the agent must not flood the chat with an ungrounded code sample.
    return wantsWrite ? { needsTarget: true, write: false, run: false, agentMode: false } : null;
};

const AIPanel = ({ token, code, fileName, language, editorContext, onApplyCode, onRunCommand, onAgentWorkspaceAction, targetAgentId = 'groq-assistant', onOpenSettings, userId }) => {
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
    const [activity, setActivity] = useState([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [modelOpen, setModelOpen] = useState(false);
    const [atBottom, setAtBottom] = useState(true);
    const [permissionPrompt, setPermissionPrompt] = useState(null);
    const [pendingProjectPlan, setPendingProjectPlan] = useState(null);
    const messagesRef = useRef(null);
    const loadedRef = useRef(false);
    const sendRef = useRef(null);
    const permissionGrantsRef = useRef({});

    useEffect(() => {
        try {
            const savedThreads = JSON.parse(localStorage.getItem(storageKey) || 'null');
            const savedModels = JSON.parse(localStorage.getItem(modelKey) || 'null');
            if (savedThreads) setThreads({ 'google-gemini': savedThreads['google-gemini'] || [], 'groq-assistant': savedThreads['groq-assistant'] || [] });
            if (savedModels) setModels(prev => ({ ...prev, ...savedModels }));
        } catch (_) { /* corrupted local history is safely ignored */ }
        loadedRef.current = true;
    }, [storageKey, modelKey]);
    useEffect(() => {
        try { permissionGrantsRef.current = JSON.parse(localStorage.getItem(`kevryn.desktop.ai.permissions.${userId || 'local'}`) || '{}'); } catch (_) { permissionGrantsRef.current = {}; }
    }, [userId]);
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
    const requestPermission = (capability, detail, workspaceName) => {
        const grant = permissionGrantsRef.current[capability];
        if (grant === 'conversation' || grant === 'always' || (grant?.scope === 'project' && grant.project === workspaceName)) return Promise.resolve(true);
        return new Promise(resolve => setPermissionPrompt({ capability, detail, workspaceName, resolve }));
    };
    const choosePermission = scope => {
        const prompt = permissionPrompt;
        if (!prompt) return;
        if (scope !== 'deny') {
            const current = { ...permissionGrantsRef.current };
            current[prompt.capability] = scope === 'project' ? { scope, project: prompt.workspaceName } : scope;
            permissionGrantsRef.current = current;
            if (scope === 'project' || scope === 'always') localStorage.setItem(`kevryn.desktop.ai.permissions.${userId || 'local'}`, JSON.stringify(current));
        }
        setPermissionPrompt(null);
        prompt.resolve(scope !== 'deny');
    };

    const sendMessage = async eventOrPrompt => {
        const automatedAction = eventOrPrompt && typeof eventOrPrompt === 'object' && typeof eventOrPrompt.prompt === 'string' ? eventOrPrompt : null;
        const automatedPrompt = typeof eventOrPrompt === 'string' ? eventOrPrompt : null;
        if (!automatedPrompt && !automatedAction) eventOrPrompt?.preventDefault();
        const text = (automatedAction?.prompt || automatedPrompt || input).trim();
        if (!text || isLoading) return;
        const providerId = provider;
        const thread = activeThread || createThread(providerId);
        const threadId = thread.id;
        const requestId = makeId();
        setInput(''); setLoading(previous => ({ ...previous, [providerId]: true })); setStatus(previous => ({ ...previous, [providerId]: 'Connecting…' }));
        setActivity(['Preparing workspace context']);
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
                setLoading(previous => ({ ...previous, [providerId]: false })); setStatus(previous => ({ ...previous, [providerId]: null })); setActivity(previous => [...previous, 'Response ready']);
                return;
            }
            const agentList = await window.electronAPI.getAgentList();
            const agent = agentList.find(item => item.manifest.id === providerId);
            if (!agent || !['AUTHENTICATED', 'RUNNING'].includes(agent.status)) throw new Error(`Add your ${PROVIDERS[providerId].name} API key in AI Provider Settings first.`);
            let accumulated = '';
            // Subscribe on this request's private IPC channels.  The management
            // assistant and the IDE panel can both use Gemini, so provider-wide
            // listeners would otherwise replace each other and leave this
            // composer in a permanent loading state.
            let completed = false;
            let failed = false;
            let actionRequest = null;
            let actionStarted = false;
            const runRequestedAction = async () => {
                if (actionStarted || !actionRequest || !onAgentWorkspaceAction) return;
                actionStarted = true;
                if (actionRequest.agentMode) {
                    const planBlock = codeBlocks(accumulated).find(block => block.language.toLowerCase() === 'kevryn-actions');
                    if (!planBlock?.code) return;
                    let plan;
                    try { plan = JSON.parse(planBlock.code); } catch (_) { throw new Error('The agent returned an invalid workspace action plan.'); }
                    const capabilities = [...new Set((plan.actions || []).map(action => action.type === 'run' ? 'terminal-command' : 'workspace-write'))];
                    for (const capability of capabilities) {
                        const allowed = await requestPermission(capability, capability === 'terminal-command' ? 'Run the agent’s local development command in the integrated terminal.' : 'Create, update, or rename the workspace files and folders in this plan.', workspace?.name);
                        if (!allowed) { setActivity(previous => [...previous, 'Workspace plan was not applied']); return; }
                    }
                    const result = await onAgentWorkspaceAction({ ...actionRequest, plan: plan.actions });
                    setActivity(previous => [...previous, result?.success ? 'Workspace plan applied locally' : result?.error || 'Could not apply workspace plan']);
                    return;
                }
                if (actionRequest.type === 'rename') {
                    if (!await requestPermission('workspace-write', `Rename ${actionRequest.from} to ${actionRequest.path}.`, workspace?.name)) { setActivity(previous => [...previous, `${actionRequest.from} was not renamed`]); return; }
                    const result = await onAgentWorkspaceAction({ plan: [{ type: 'rename', from: actionRequest.from, path: actionRequest.path }] });
                    setActivity(previous => [...previous, result?.success ? `${actionRequest.from} renamed to ${actionRequest.path}` : result?.error || 'Could not rename the file']);
                    return;
                }
                if (actionRequest.write) {
                    const replacement = codeBlocks(accumulated).find(block => !['bash', 'shell', 'powershell', 'cmd', 'kevryn-actions'].includes(block.language.toLowerCase()));
                    if (!replacement?.code) return;
                    if (!await requestPermission('workspace-write', `Replace ${actionRequest.path} with the agent’s proposed complete content.`, workspace?.name)) { setActivity(previous => [...previous, `${actionRequest.path} was not changed`]); return; }
                    if (actionRequest.run && !await requestPermission('terminal-command', `Run ${actionRequest.path} locally after updating it.`, workspace?.name)) { actionRequest.run = false; }
                    const result = await onAgentWorkspaceAction({ ...actionRequest, code: replacement.code, language: replacement.language || language });
                    setActivity(previous => [...previous, result?.success ? `${actionRequest.path} ${actionRequest.run ? 'updated and run locally' : 'updated locally'}` : result?.error || `Could not update ${actionRequest.path}`]);
                    return;
                }
                if (actionRequest.run) {
                    if (!await requestPermission('terminal-command', `Run ${actionRequest.path} locally in the integrated terminal.`, workspace?.name)) { setActivity(previous => [...previous, `${actionRequest.path} was not run`]); return; }
                    const result = await onAgentWorkspaceAction(actionRequest);
                    setActivity(previous => [...previous, result?.success ? `${actionRequest.path} run locally` : result?.error || `Could not run ${actionRequest.path}`]);
                }
            };
            const finishRequest = () => {
                if (completed || failed) return;
                completed = true;
                updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: message.content || 'No response generated.', streaming: false } : message) }));
                setLoading(previous => ({ ...previous, [providerId]: false }));
                setStatus(previous => ({ ...previous, [providerId]: null }));
                setActivity(previous => [...previous, 'Response ready']);
                if (actionRequest?.planning) {
                    const planBlock = codeBlocks(accumulated).find(block => block.language.toLowerCase() === 'kevryn-plan');
                    if (planBlock?.code) {
                        try {
                            const plan = JSON.parse(planBlock.code);
                            setPendingProjectPlan({ plan, request: text });
                            updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, projectPlan: plan } : message) }));
                        } catch (_) { setActivity(previous => [...previous, 'The project plan needs clarification']); }
                    }
                }
                runRequestedAction().catch(error => setActivity(previous => [...previous, error.message || 'Requested workspace action failed']));
            };
            window.electronAPI.onAgentChatChunk(providerId, requestId, chunk => {
                accumulated += chunk;
                updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: accumulated } : message) }));
            });
            window.electronAPI.onAgentChatDone(providerId, requestId, finishRequest);
            window.electronAPI.onAgentChatError(providerId, requestId, error => {
                if (completed || failed) return;
                failed = true;
                updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: `❌ ${error}`, streaming: false } : message) }));
                setLoading(previous => ({ ...previous, [providerId]: false })); setStatus(previous => ({ ...previous, [providerId]: null })); setActivity(previous => [...previous, 'Request failed']);
            });
            const workspace = await window.electronAPI.getAgentWorkspaceContext().catch(() => null);
            actionRequest = automatedAction?.executeProjectPlan ? { agentMode: true, write: true, run: true, approvedPlan: automatedAction.plan } : pendingProjectPlan ? { planning: true, write: false, run: false, agentMode: false } : explicitWorkspaceAction(text, messages, workspace);
            setActivity(previous => [...previous, 'Inspecting workspace']);
            const searchMatch = text.match(/(?:find|search|locate)\s+(?:for\s+)?["'`]?([^"'`\n]+)["'`]?/i);
            const searchResults = searchMatch ? await window.electronAPI.searchAgentWorkspace(searchMatch[1].trim()).catch(() => []) : [];
            if (searchMatch) setActivity(previous => [...previous, `Searched workspace for “${searchMatch[1].trim().slice(0, 42)}”`]);
            const relatedFiles = [];
            // Resolve only files explicitly mentioned by the user, and only from the
            // workspace inventory returned by Electron. This keeps context focused.
            for (const relativePath of (workspace?.files || [])) {
                const baseName = relativePath.split('/').pop();
                if ((text.includes(relativePath) || (baseName && text.includes(baseName))) && relativePath !== fileName) {
                    const content = await window.electronAPI.readAgentWorkspaceFile(relativePath).catch(() => null);
                    if (typeof content === 'string') relatedFiles.push({ path: relativePath, content: content.slice(0, 16000) });
                    if (relatedFiles.length >= 3) break;
                }
            }
            if (relatedFiles.length) setActivity(previous => [...previous, `Read ${relatedFiles.map(file => file.path).join(', ')}`]);
            // Desktop agents are workspace-aware by default. The checkbox is now an
            // explicit "include full file" override for very large/unsaved buffers.
            const context = { model: models[providerId], requestId, workspace, relatedFiles, searchResults, fileName, language, editorContext, actionRequest, projectPlan: pendingProjectPlan?.plan || null,
                code: code || '', includeFullFile: includeFile };
            setActivity(previous => [...previous, `Asking ${PROVIDERS[providerId].name}`]);
            await window.electronAPI.chatWithAgent(providerId, text, context);
            // IPC invokes resolve after the stream ends.  This fallback covers a
            // renderer event arriving late without ever locking the composer.
            finishRequest();
        } catch (error) {
            updateThread(providerId, threadId, current => ({ messages: current.messages.map(message => message.id === assistantId ? { ...message, content: `❌ ${error.message}`, streaming: false } : message) }));
            setLoading(previous => ({ ...previous, [providerId]: false })); setStatus(previous => ({ ...previous, [providerId]: null })); setActivity(previous => [...previous, 'Request failed']);
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
        {activity.length > 0 && <div className="ai-activity-strip">{activity.slice(-2).join(' · ')}</div>}
        <div className="ai-permission-strip" title="Workspace reads are available. Writes and terminal commands ask for permission."><span>Workspace aware</span><span>Writes ask first</span><span>Commands ask first</span></div>
        <div className="ai-model-bar"><span>Model</span><div className="ai-model-menu"><button onClick={() => setModelOpen(open => !open)} aria-expanded={modelOpen}>{modelLabel}<FaChevronDown /></button>{modelOpen && <div className="ai-model-options" role="listbox">{PROVIDERS[provider].models.map(([id, label]) => <button role="option" aria-selected={id === selectedModel} key={id} onClick={() => { setModels(previous => ({ ...previous, [provider]: id })); setModelOpen(false); }}><span>{label}</span>{id === selectedModel && <FaCheck />}</button>)}</div>}</div></div>
        {historyOpen && <div className="ai-history-drawer"><div><strong>{PROVIDERS[provider].name} conversations</strong><button onClick={() => setHistoryOpen(false)}><FaTimes /></button></div>{providerThreads.length === 0 ? <p>No saved conversations yet.</p> : providerThreads.map(thread => <button key={thread.id} className={thread.id === activeThread?.id ? 'selected' : ''} onClick={() => { setActiveIds(previous => ({ ...previous, [provider]: thread.id })); setHistoryOpen(false); }}>{thread.title}<small>{new Date(thread.updatedAt).toLocaleDateString()}</small></button>)}</div>}
        <div className="ai-conversation" ref={messagesRef} onScroll={onScroll}>
            {messages.length === 0 ? <div className="ai-empty-state"><div className="ai-empty-icon"><FaRobot /></div><h2>Start a conversation</h2><p>Choose a model, ask for help, or attach the current file when you want coding context.</p><button onClick={onOpenSettings}><FaKey /> Manage personal API keys</button></div> : messages.map(message => {
                const blocks = codeBlocks(message.content); const primary = blocks[0]; const command = ['bash', 'shell', 'powershell', 'cmd'].includes(primary?.language?.toLowerCase());
                return <article className={`ai-chat-message ${message.role}`} key={message.id}><div className="ai-chat-avatar">{message.role === 'user' ? 'You' : <FaRobot />}</div><div className="ai-chat-content">{message.role === 'assistant' ? renderAssistant(message) : message.content}{message.streaming && <span className="ai-streaming-dot"><FaSpinner className="spinning" /></span>}{message.projectPlan && <section style={{ marginTop: 12, padding: 12, border: '1px solid #6251a6', borderRadius: 9, background: 'rgba(89,68,158,.14)' }}><strong style={{ display: 'block', marginBottom: 6 }}>Implementation plan: {message.projectPlan.title || 'New project'}</strong><p style={{ margin: '0 0 8px', fontSize: 12 }}>{message.projectPlan.summary || 'Review the proposed workspace plan before building.'}</p>{Array.isArray(message.projectPlan.steps) && <ol style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12 }}>{message.projectPlan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}{Array.isArray(message.projectPlan.questions) && message.projectPlan.questions.length > 0 && <p style={{ margin: '0 0 10px', color: '#d6c9ff', fontSize: 12 }}>Questions: {message.projectPlan.questions.join(' · ')}</p>}<button onClick={() => { setPendingProjectPlan(null); sendMessage({ prompt: `Approved implementation plan: ${message.projectPlan.title || 'project'}. Build it now exactly as planned.`, executeProjectPlan: true, plan: message.projectPlan }); }} style={{ border: 0, borderRadius: 6, padding: '8px 10px', color: '#fff', background: '#7052e8', fontWeight: 700, cursor: 'pointer' }}>Approve plan & build</button></section>}{message.role === 'assistant' && message.content && <div className="ai-message-actions"><button onClick={() => navigator.clipboard.writeText(primary?.code || message.content)}><FaCopy /> {primary ? (command ? 'Copy command' : 'Copy code') : 'Copy'}</button>{primary && command && onRunCommand && <button onClick={() => { if (window.confirm(`Run this command in the active terminal?\n\n${primary.code}`)) onRunCommand(primary.code); }}><FaCode /> Run command</button>}{primary && !command && primary?.language !== 'kevryn-plan' && primary?.language !== 'kevryn-actions' && onApplyCode && <button onClick={() => onApplyCode(primary.code, primary.language || language)}><FaCode /> Review & apply</button>}</div>}</div></article>;
            })}
            {status[provider] && <div className="ai-connection-state"><FaBolt /> {status[provider]}</div>}
        </div>
        {!atBottom && messages.length > 0 && <button className="ai-jump-latest" onClick={() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); setAtBottom(true); }}>Jump to latest</button>}
        <form className="ai-composer" onSubmit={sendMessage}><label className="ai-context-toggle"><input type="checkbox" checked={includeFile} onChange={event => setIncludeFile(event.target.checked)} /><FaFileCode /> Attach current file</label><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder={isLoading ? `${PROVIDERS[provider].name} is working — you can write the next prompt…` : `Ask ${PROVIDERS[provider].name} anything…`} rows="3" aria-label={`Message ${PROVIDERS[provider].name}`} aria-busy={isLoading} /><div><span>{isLoading ? 'Response in progress · Enter sends when ready' : 'Enter to send · Shift+Enter for new line'}</span><button type="submit" disabled={!input.trim() || isLoading} title={isLoading ? 'Wait for the current response to finish' : 'Send message'}>{isLoading ? <FaSpinner className="spinning" /> : <FaPaperPlane />}</button></div></form>
        {permissionPrompt && <div role="dialog" aria-modal="true" aria-label="Agent permission" style={{ position: 'fixed', inset: 0, zIndex: 50000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(5,6,14,.66)', backdropFilter: 'blur(7px)' }}><section style={{ width: 'min(560px, 94vw)', border: '1px solid #4b4863', borderRadius: 16, overflow: 'hidden', background: '#20212d', color: '#eef0ff', boxShadow: '0 26px 80px rgba(0,0,0,.55)' }}><header style={{ padding: '20px 22px 12px', fontSize: 17, fontWeight: 750 }}>Allow {permissionPrompt.capability === 'terminal-command' ? 'running this command' : 'workspace changes'}?</header><div style={{ margin: '0 22px 15px', padding: '12px 14px', borderRadius: 9, background: '#181923', color: '#bbc0db', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, lineHeight: 1.55 }}>{permissionPrompt.detail}</div><div style={{ display: 'grid', gap: 7, padding: '0 22px 20px' }}><button onClick={() => choosePermission('once')} style={{ textAlign: 'left', padding: '11px 13px', border: '1px solid #55536b', borderRadius: 8, background: '#393948', color: '#fff', cursor: 'pointer' }}>1&nbsp;&nbsp; Yes, allow this time</button><button onClick={() => choosePermission('conversation')} style={{ textAlign: 'left', padding: '11px 13px', border: 0, background: 'transparent', color: '#c6c9df', cursor: 'pointer' }}>2&nbsp;&nbsp; Yes, allow in this conversation</button><button onClick={() => choosePermission('project')} style={{ textAlign: 'left', padding: '11px 13px', border: 0, background: 'transparent', color: '#c6c9df', cursor: 'pointer' }}>3&nbsp;&nbsp; Yes, always allow in this project</button><button onClick={() => choosePermission('always')} style={{ textAlign: 'left', padding: '11px 13px', border: 0, background: 'transparent', color: '#c6c9df', cursor: 'pointer' }}>4&nbsp;&nbsp; Yes, always allow</button><button onClick={() => choosePermission('deny')} style={{ textAlign: 'left', padding: '11px 13px', border: 0, background: 'transparent', color: '#8e92aa', cursor: 'pointer' }}>5&nbsp;&nbsp; No</button></div></section></div>}
    </aside>;
};

export default AIPanel;
