import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowLeft, FaCheck, FaCode, FaFolderOpen, FaPaperclip, FaPaperPlane, FaPlay, FaShieldAlt, FaSpinner, FaStop, FaTerminal, FaTimes } from 'react-icons/fa';

const elapsed = started => {
    const seconds = Math.max(0, Math.floor((Date.now() - Number(started || Date.now())) / 1000));
    return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
};
const titleFor = event => ({ started: 'Task started', context: 'Workspace connected', status: 'Working', tool: event.text || 'Using workspace tool', tool_result: 'Tool result received', process: 'Terminal started', output: 'Terminal output', process_exit: 'Terminal finished', approval: 'Approval needed', approval_resolved: event.allowed ? 'Approved' : 'Rejected', change: 'Workspace change', directory: 'Folder created', plan: 'Implementation plan', finished: event.status === 'completed' ? 'Task complete' : 'Task stopped' }[event.type] || event.type);
const isBusy = task => ['working', 'approval'].includes(task?.status);

export default function AgentTaskPanel({ provider, model, editorContext, dirtyFiles = [], onBack }) {
    const [tasks, setTasks] = useState({});
    const [activeId, setActiveId] = useState(null);
    const [prompt, setPrompt] = useState('');
    const [mode, setMode] = useState('ask');
    const [intent, setIntent] = useState('build');
    const [error, setError] = useState('');
    const [reviewOpen, setReviewOpen] = useState(false);
    const [attachment, setAttachment] = useState(null);
    const [, tick] = useState(0);
    const active = tasks[activeId] || Object.values(tasks).sort((a, b) => b.startedAt - a.startedAt)[0];
    const taskHistory = useMemo(() => Object.values(tasks).sort((a, b) => b.startedAt - a.startedAt), [tasks]);
    const composer = useRef(null);
    const attachmentInput = useRef(null);

    const attach = file => {
        if (!file) return;
        const allowed = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/|application\/(json|javascript|xml))/i.test(file.type || '') || /\.(?:txt|md|json|js|jsx|ts|tsx|py|c|cpp|h|html|css|xml|ya?ml)$/i.test(file.name || '');
        if (!allowed) { setError('Attach an image, PDF, or plain-text/code file.'); return; }
        if (file.size > 10 * 1024 * 1024) { setError('Use an attachment smaller than 10 MB.'); return; }
        const reader = new FileReader();
        const mimeType = file.type || (/\.(?:txt|md|json|js|jsx|ts|tsx|py|c|cpp|h|html|css|xml|ya?ml)$/i.test(file.name || '') ? 'text/plain' : 'image/png');
        reader.onload = () => { setAttachment({ name: file.name || 'pasted-image.png', mimeType, data: String(reader.result || '') }); setError(''); };
        reader.onerror = () => setError('Could not read that attachment. Please try again.');
        reader.readAsDataURL(file);
    };

    useEffect(() => {
        if (!window.electronAPI) return undefined;
        window.electronAPI.listAgentTasks().then(list => {
            const next = Object.fromEntries((list || []).map(task => [task.id, task]));
            setTasks(next); setActiveId(current => current || list?.[0]?.id || null);
        }).catch(() => {});
        window.electronAPI.onAgentTaskEvent(event => {
            setTasks(previous => {
                const task = previous[event.taskId] || { id: event.taskId, events: [], changes: [], startedAt: event.at };
                const events = [...(task.events || []), event].slice(-500);
                const next = { ...task, events };
                if (event.type === 'started') Object.assign(next, { startedAt: event.at, mode: event.mode, intent: event.intent, status: 'working' });
                if (event.type === 'approval') Object.assign(next, { status: 'approval', pending: event });
                if (event.type === 'approval_resolved') Object.assign(next, { status: 'working', pending: null });
                if (event.type === 'finished') Object.assign(next, { status: event.status, pending: null });
                if (event.type === 'mode') next.mode = event.mode;
                if (event.type === 'change' && event.change) {
                    const changes = [...(task.changes || [])]; const index = changes.findIndex(change => change.id === event.change.id);
                    if (index >= 0) changes[index] = event.change; else changes.push(event.change);
                    next.changes = changes;
                }
                return { ...previous, [event.taskId]: next };
            });
            setActiveId(current => current || event.taskId);
        });
        const timer = window.setInterval(() => tick(value => value + 1), 1000);
        const focus = window.setTimeout(() => composer.current?.focus(), 180);
        return () => { window.clearInterval(timer); window.clearTimeout(focus); };
    }, []);
    useEffect(() => {
        if (window.electronAPI) window.electronAPI.updateAgentTaskEditorState(dirtyFiles).catch(() => {});
    }, [dirtyFiles]);

    const changeTotals = useMemo(() => (active?.changes || []).reduce((total, change) => ({ added: total.added + (change.added || 0), removed: total.removed + (change.removed || 0) }), { added: 0, removed: 0 }), [active]);
    const events = active?.events || [];
    const pending = active?.pending;
    const start = async event => {
        event?.preventDefault();
        if ((!prompt.trim() && !attachment) || isBusy(active)) return;
        if (!window.electronAPI) { setError('Workspace tasks are available in the KevRyn desktop app.'); return; }
        if (attachment && provider !== 'google-gemini') { setError('Workspace attachments are available with Google Gemini. Select Gemini, then start the task.'); return; }
        setError('');
        try {
            const result = await window.electronAPI.startAgentTask({ provider, model, mode, intent, prompt: prompt.trim() || `Analyse the attached ${attachment.name}.`, attachment, editorContext, previousTaskId: active?.id });
            setPrompt(''); setAttachment(null); setActiveId(result.taskId);
        } catch (reason) { setError(reason?.message || String(reason)); }
    };
    const decide = async allowed => {
        try { await window.electronAPI.resolveAgentTaskApproval(active.id, pending.approvalId, allowed); } catch (reason) { setError(reason?.message || String(reason)); }
    };
    const changeMode = async value => {
        setMode(value);
        if (active && isBusy(active)) await window.electronAPI.setAgentTaskMode(active.id, value).catch(reason => setError(reason?.message || String(reason)));
    };
    const undoChange = async change => {
        try { await window.electronAPI.undoAgentTaskChange(active.id, change.id); }
        catch (reason) { setError(reason?.message || String(reason)); }
    };

    return <aside className="agent-task-panel" aria-label="Workspace coding agent">
        <header className="agent-task-header">
            <button className="agent-back" onClick={onBack} title="Return to chat"><FaArrowLeft /></button>
            <div><strong><FaFolderOpen /> Workspace agent</strong><span>{active && isBusy(active) ? `Working for ${elapsed(active.startedAt)}` : 'Local workspace tools and verified terminal'}</span></div>
            {taskHistory.length > 1 && <select className="agent-task-history" value={active?.id || ''} onChange={event => setActiveId(event.target.value)} aria-label="Workspace task history">{taskHistory.map(task => <option key={task.id} value={task.id}>{new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {(task.events || []).find(item => item.type === 'started')?.text?.slice(0, 34) || 'Workspace task'}</option>)}</select>}
            {active && isBusy(active) && <button className="agent-stop" onClick={() => window.electronAPI.cancelAgentTask(active.id)}><FaStop /> Stop</button>}
        </header>
        <div className="agent-safety-bar"><FaShieldAlt /> <span>Selected workspace only</span><span>·</span><span>{mode === 'ask' ? 'Every change asks first' : mode === 'edit' ? 'File edits auto-apply' : 'Trusted scoped automation'}</span></div>
        <section className="agent-run-body">
            {active ? <>
                <div className="agent-run-title"><FaCode /><div><strong>{events.find(event => event.type === 'started')?.text || 'Workspace task'}</strong><span>{active.intent === 'plan' ? 'Planning only — no files or commands can run' : 'Agent is reading, changing, and checking locally'}</span></div><div className="agent-change-count"><b>Changes</b><em>+{changeTotals.added}</em><i>−{changeTotals.removed}</i></div></div>
                {pending && <section className="agent-approval-card"><div><FaShieldAlt /><strong>{pending.kind === 'command' ? 'Allow this local command?' : pending.kind === 'plan' ? 'Approve this implementation plan?' : 'Approve this workspace change?'}</strong></div>{pending.change ? <><code>{pending.change.kind === 'rename' ? `${pending.change.path} → ${pending.change.to}` : pending.change.path}</code><p><span className="agent-add">+{pending.change.added || 0} lines</span><span className="agent-remove">−{pending.change.removed || 0} lines</span></p><button type="button" className="agent-review-toggle" onClick={() => setReviewOpen(open => !open)}>{reviewOpen ? 'Hide review' : 'Review exact changes'}</button>{reviewOpen && <div className="agent-diff-review"><section><b>Before</b><pre>{pending.change.before ?? '(new file)'}</pre></section><section><b>After</b><pre>{pending.change.after}</pre></section></div>}</> : pending.kind === 'plan' ? <><code>{pending.title}</code><pre>{pending.summary}{Array.isArray(pending.steps) ? `\n\n${pending.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : ''}</pre></> : <pre>{pending.command || pending.text || 'Requested operation'}</pre>}<div className="agent-approval-actions"><button className="agent-reject" onClick={() => decide(false)}>Reject</button><button onClick={() => decide(true)}><FaCheck /> Approve</button></div></section>}
                <div className="agent-timeline">{events.slice(-28).map(event => <article key={event.id} className={`agent-event ${event.type}`}><span>{event.type === 'process' || event.type === 'output' ? <FaTerminal /> : event.type === 'tool' ? <FaCode /> : <FaSpinner className={isBusy(active) && event === events.at(-1) ? 'spinning' : ''} />}</span><div><strong>{titleFor(event)}</strong>{event.text && <p>{event.text}</p>}{event.type === 'output' && <pre>{event.text}</pre>}{event.type === 'process_exit' && <small>Exit code: {event.exitCode ?? 'unknown'}</small>}</div></article>)}</div>
                {(active.changes || []).length > 0 && <section className="agent-changes-list"><header><strong>Changes</strong><span>{active.changes.length} file{active.changes.length === 1 ? '' : 's'}</span></header>{active.changes.map(change => <article key={change.id}><FaCode /><div><b>{change.kind === 'rename' ? `${change.path} → ${change.to}` : change.path}</b><small className={change.state}>{change.state === 'applied' ? 'Applied locally' : change.state === 'undone' ? 'Undone locally' : change.state === 'rejected' ? 'Rejected' : change.state === 'conflicted' ? 'Needs review' : 'Proposed'} · <span className="agent-add">+{change.added || 0}</span> <span className="agent-remove">−{change.removed || 0}</span></small></div>{change.state === 'applied' && !isBusy(active) && <button onClick={() => undoChange(change)}>Undo</button>}</article>)}</section>}
                {active.status === 'completed' && <div className="agent-finished"><FaCheck /> Task complete. Review actual changes and verification above.</div>}
            </> : <div className="agent-empty"><FaCode /><h2>Build with your workspace</h2><p>Ask for a file, feature, fix, or project. The agent investigates first, proposes real changes, and checks results after approval.</p></div>}
        </section>
        <form className="agent-composer" onSubmit={start}>
            <div className="agent-mode-row"><label>Approval</label><select value={mode} onChange={event => changeMode(event.target.value)}><option value="ask">Ask each time</option><option value="edit">Auto-edit workspace</option><option value="trusted">Trusted automation</option></select><button type="button" className={intent === 'plan' ? 'selected' : ''} onClick={() => setIntent(current => current === 'plan' ? 'build' : 'plan')}>{intent === 'plan' ? 'Plan mode' : 'Build mode'}</button></div>
            <input ref={attachmentInput} className="agent-attachment-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.c,.cpp,.h,.html,.css,.xml,.yml,.yaml" onChange={event => { attach(event.target.files?.[0]); event.target.value = ''; }} />
            {attachment && <div className="agent-attachment"><FaPaperclip /><span>{attachment.name}</span><button type="button" onClick={() => setAttachment(null)}><FaTimes /></button></div>}
            <textarea ref={composer} value={prompt} onPaste={event => { const image = [...event.clipboardData.files].find(file => file.type.startsWith('image/')); if (image) { event.preventDefault(); attach(image); } }} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); start(); } }} placeholder={isBusy(active) ? 'The task is working. You can prepare the next instruction…' : 'Do anything — for example: create index.html for a polished ecommerce landing page'} rows="3" />
            <div className="agent-composer-footer"><span>{intent === 'plan' ? 'Plan first · no workspace mutations' : 'Changes and terminal commands follow your approval mode'}</span><button type="button" className="agent-attach-button" onClick={() => attachmentInput.current?.click()} title="Attach image, PDF, or code file"><FaPaperclip /></button><button type="submit" disabled={(!prompt.trim() && !attachment) || isBusy(active)} title="Start workspace task"><FaPaperPlane /></button></div>
            {error && <p className="agent-error">{error}</p>}
        </form>
    </aside>;
}
