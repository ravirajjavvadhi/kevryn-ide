import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import { FaArrowUp, FaCalendarAlt, FaClipboardList, FaHistory, FaRobot, FaSpinner, FaTimes, FaUsers } from 'react-icons/fa';
import './management/ManagementAssistantModal.css';

const studentIdentifier = text => {
    const value = String(text || '').trim();
    if (/^[a-z0-9][a-z0-9_-]{3,}$/i.test(value)) return value.toUpperCase();
    const match = value.match(/(?:student|roll(?:\s+number)?|details?\s+(?:of|for)|report\s+(?:of|for)|attendance\s+(?:of|for))\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{3,})/i);
    return match?.[1]?.toUpperCase() || null;
};

const Blocks = ({ blocks = [] }) => <>{blocks.filter(block => block.type !== 'table' || block.rows?.length).map((block, index) => {
    if (block.type === 'profile') return <section className="management-ai-profile" key={index}><strong>{block.title}</strong><small>{block.subtitle}</small></section>;
    if (block.type === 'kpis') return <section className="management-ai-response-kpis" key={index}>{block.items.map((item, itemIndex) => <div className={item.tone || 'neutral'} key={itemIndex}><strong>{item.value}</strong><span>{item.label}</span></div>)}</section>;
    if (block.type === 'table') return <section className="management-ai-response-table" key={index}><h4>{block.title}</h4><div className="management-ai-table-wrap"><table><thead><tr>{block.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div></section>;
    return null;
})}</>;

const FacultyAssistant = ({ token, serverUrl, onClose }) => {
    const api = useMemo(() => axios.create({ baseURL: serverUrl, headers: { Authorization: `Bearer ${token}` } }), [serverUrl, token]);
    const [overview, setOverview] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const inFlightRef = useRef(false);
    const messagesEndRef = useRef(null);

    const refresh = async () => {
        try { setOverview((await api.get('/ai/faculty-intelligence/overview')).data); }
        catch (err) { setError(err.response?.data?.error || 'Could not load your live faculty context.'); }
    };
    useEffect(() => { refresh(); }, []);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

    const add = message => setMessages(previous => [...previous, { id: `${Date.now()}-${Math.random()}`, ...message }]);
    const updatePending = update => setMessages(previous => previous.map(item => item.pending ? { ...item, ...update } : item));
    const complete = result => updatePending({ pending: false, content: result.response || result.content || '', blocks: result.blocks || [], freshness: result.freshness || null });

    const ask = async preset => {
        const text = String(preset || input).trim();
        if (!text || inFlightRef.current) return;
        inFlightRef.current = true; setLoading(true); setError(''); setInput('');
        const roll = studentIdentifier(text);
        add({ role: 'user', content: text });
        add({ role: 'assistant', pending: true, content: '', activity: roll ? `Identifying ${roll} in your assigned cohorts…` : 'Understanding your faculty request…' });
        const stages = roll
            ? [`Identifying ${roll} in your assigned cohorts…`, 'Loading lab attendance and activity…', 'Loading permitted assignment records…', 'Preparing verified student report…']
            : ['Understanding your faculty request…', 'Checking live lab sessions…', 'Loading faculty-authorized records…', 'Preparing operational insight…'];
        let position = 0;
        const timer = setInterval(() => { position = Math.min(position + 1, stages.length - 1); updatePending({ activity: stages[position] }); }, 700);
        try {
            const result = await api.post('/ai/faculty-assistant', { messages: [{ role: 'user', content: text }] });
            complete(result.data);
            refresh();
        } catch (requestError) {
            const message = requestError.response?.data?.error || requestError.message || 'Faculty Intelligence could not complete this request.';
            setError(message); updatePending({ pending: false, content: message, blocks: [] });
        } finally {
            clearInterval(timer); setLoading(false); inFlightRef.current = false;
        }
    };

    const summary = overview?.blocks?.find(block => block.type === 'kpis');
    const liveSessions = overview?.live || [];
    const suggestions = [
        ['What is happening in my live lab?', <FaRobot />],
        ['Show my last session report', <FaClipboardList />],
        ['Students needing attendance attention', <FaUsers />],
        ['Show my timetable and workload', <FaCalendarAlt />]
    ];

    return <AnimatePresence><motion.div className="management-ai-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <motion.section className="management-ai-modal" initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .98 }} transition={{ type: 'spring', damping: 26, stiffness: 290 }} aria-label="KevRyn Faculty Intelligence">
            <header className="management-ai-header"><div className="management-ai-brand"><span><FaRobot /></span><div><strong>KevRyn Faculty Intelligence</strong><small><i /> Live faculty-authorized context</small></div></div><div className="management-ai-head-actions"><button className="management-ai-close" onClick={refresh} title="Refresh live context"><FaHistory /></button><button className="management-ai-close" onClick={onClose} aria-label="Close Faculty Intelligence"><FaTimes /></button></div></header>
            <div className="management-ai-body"><main className="management-ai-chat"><div className="management-ai-intro"><div><p>Faculty command centre</p><h2>Ask. Verify. Act with confidence.</h2><span>Live labs, assigned students, attendance, submissions, reports, and workload—limited to your authorized cohorts.</span></div>{summary && <div className="management-ai-mini-summary"><b>{summary.items?.[0]?.value || '0'}</b><span>live labs</span><b>{summary.items?.[2]?.value || '—'}</b><span>attendance</span></div>}</div>
                {messages.length === 0 && <div className="management-ai-suggestions">{suggestions.map(([prompt, icon]) => <button key={prompt} onClick={() => ask(prompt)} disabled={loading}>{icon}<span>{prompt}</span><FaArrowUp /></button>)}</div>}
                <div className="management-ai-messages">{messages.map(message => <article className={`management-ai-message ${message.role}`} key={message.id}>{message.role === 'assistant' && <span className="management-ai-avatar"><FaRobot /></span>}<div>{message.pending && <span className="management-ai-thinking"><FaSpinner className="spin" /> {message.activity}</span>}{message.blocks?.length > 0 && <Blocks blocks={message.blocks} />}{message.content && <div className="management-ai-answer"><p>{message.content}</p></div>}{message.freshness && !message.pending && <small className="management-ai-freshness">Verified at {new Date(message.freshness).toLocaleTimeString()}</small>}</div></article>)}<div ref={messagesEndRef} /></div></main>
                <aside className="management-ai-sidebar"><div className="management-ai-side-title"><FaClipboardList /> Faculty at a glance</div>{overview ? <><Blocks blocks={overview.blocks?.filter(block => block.type === 'kpis') || []} /><div className="management-ai-labs"><span>Live and recent labs</span>{liveSessions.slice(0, 5).map(lab => <button key={lab._id || lab.sessionName} onClick={() => ask(`Give the detailed report for ${lab.sessionName}`)}><i className="live" /><div><strong>{lab.sessionName || lab.subject}</strong><small>{lab.subject || 'Lab'} · live now</small></div><em>{lab.activeStudents?.length || 0}/{lab.allowedStudents?.length || 0}</em></button>)}{!liveSessions.length && <p>No live lab sessions right now.</p>}</div></> : <div className="management-ai-loading"><FaSpinner className="spin" /> Loading your secure faculty data…</div>}</aside></div>
            <footer className="management-ai-composer"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(); } }} placeholder="Ask about a roll number, live lab, attendance, session report, submissions, or workload…" disabled={loading} /><button className="management-ai-send" disabled={loading || !input.trim()} onClick={() => ask()}>{loading ? <FaSpinner className="spin" /> : <FaArrowUp />}</button><small>Enter to send · Shift+Enter for a new line · Records are limited to your assigned cohorts</small>{error && <p className="management-ai-error">{error}</p>}</footer>
        </motion.section>
    </motion.div></AnimatePresence>;
};

export default FacultyAssistant;
