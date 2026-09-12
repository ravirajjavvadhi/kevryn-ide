import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import { FaArrowUp, FaBolt, FaBuilding, FaCalendarAlt, FaCheckCircle, FaChevronDown, FaClipboardList, FaCloudUploadAlt, FaHistory, FaKey, FaPaperclip, FaRobot, FaSpinner, FaTimes, FaUsers } from 'react-icons/fa';
import './ManagementAssistantModal.css';
import TimetableProposalPanel from './TimetableProposalPanel';
import BroadcastProposalPanel from './BroadcastProposalPanel';
import ManagementAuditPanel from './ManagementAuditPanel';

const DEFAULT_MODELS = [
    ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ['gemini-3-flash-preview', 'Gemini 3 Flash'],
    ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'],
    ['gemini-2.5-flash', 'Gemini 2.5 Flash']
];

const ManagementAnswer = ({ content }) => {
    const blocks = String(content || '').trim().split(/\n{2,}/).filter(Boolean);
    return <div className="management-ai-answer">{blocks.map((block, index) => {
        const lines = block.split('\n').filter(Boolean);
        const heading = lines.length === 1 && /^#{1,6}\s+/.test(lines[0]);
        const table = lines.length >= 2 && lines.every(line => /^\s*\|.*\|\s*$/.test(line));
        if (heading) return <h3 key={index}>{lines[0].replace(/^#{1,6}\s+/, '')}</h3>;
        if (table) {
            const rows = lines.filter(line => !/^\s*\|?\s*:?-{3,}/.test(line)).map(line => line.trim().split('|').slice(1, -1).map(cell => cell.trim()));
            const [head, ...body] = rows;
            return <div className="management-ai-table-wrap" key={index}><table><thead><tr>{head.map((cell, cellIndex) => <th key={cellIndex}>{cell}</th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
        }
        if (lines.every(line => /^[-*•]\s+/.test(line))) return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^[-*•]\s+/, '')}</li>)}</ul>;
        return <p key={index}>{block.replace(/^#{1,6}\s+/, '')}</p>;
    })}</div>;
};

const ManagementAssistantModal = ({ token, onClose }) => {
    const rawBase = (process.env.REACT_APP_SERVER_URL || '').trim();
    const api = useMemo(() => axios.create({ baseURL: rawBase, headers: { Authorization: `Bearer ${token}` } }), [rawBase, token]);
    const isDesktop = typeof window !== 'undefined' && Boolean(window.__KEVRYN_DESKTOP__ && window.electronAPI);
    const [overview, setOverview] = useState(null);
    const [models, setModels] = useState(DEFAULT_MODELS);
    const [model, setModel] = useState('gemini-3.8-flash');
    const [input, setInput] = useState('');
    const [image, setImage] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [agentReady, setAgentReady] = useState(!isDesktop);
    const [apiKey, setApiKey] = useState('');
    const [onboardingPreview, setOnboardingPreview] = useState(null);
    const [onboardingBusy, setOnboardingBusy] = useState(false);
    const [showTimetablePlanner, setShowTimetablePlanner] = useState(false);
    const [showBroadcastComposer, setShowBroadcastComposer] = useState(false);
    const [showAuditHistory, setShowAuditHistory] = useState(false);
    const messagesEndRef = useRef(null);
    const requestInFlightRef = useRef(false);

    const refresh = async () => {
        try {
            const [overviewResult, configResult] = await Promise.all([api.get('/api/management-ai/overview'), api.get('/api/management-ai/configuration')]);
            setOverview(overviewResult.data);
            const available = (configResult.data.models || DEFAULT_MODELS.map(([id]) => id)).map(id => [id, DEFAULT_MODELS.find(item => item[0] === id)?.[1] || id]);
            setModels(available);
            setModel(current => available.some(item => item[0] === current) ? current : (configResult.data.defaultModel || available[0]?.[0]));
            if (!isDesktop && !configResult.data.configured) setError('Management Gemini is not configured yet. Add MANAGEMENT_GEMINI_API_KEY on the server.');
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Could not load live institution information.');
        }
    };

    useEffect(() => { refresh(); }, []);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
    useEffect(() => {
        if (!isDesktop) return;
        window.electronAPI.getAgentList().then(list => {
            const gemini = list.find(item => item.manifest.id === 'google-gemini');
            setAgentReady(Boolean(gemini && ['AUTHENTICATED', 'RUNNING'].includes(gemini.status)));
        }).catch(() => setAgentReady(false));
    }, [isDesktop]);

    const addMessage = message => setMessages(previous => [...previous, { id: `${Date.now()}-${Math.random()}`, ...message }]);
    const completePending = content => setMessages(previous => previous.map(item => item.pending ? { ...item, content, pending: false } : item));
    const attachFile = file => {
        if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) { setError('Attach a PNG, JPEG, or WebP image.'); return; }
        if (file.size > 5 * 1024 * 1024) { setError('Use an image smaller than 5 MB.'); return; }
        const reader = new FileReader();
        reader.onload = () => { setImage({ name: file.name || 'pasted-image', data: reader.result }); setError(''); };
        reader.readAsDataURL(file);
    };
    const saveDesktopKey = async () => {
        if (!apiKey.trim()) return;
        setLoading(true); setError('');
        try {
            const result = await window.electronAPI.authenticateAgent('google-gemini', apiKey.trim());
            if (!result?.success) throw new Error(result?.error || 'Gemini key could not be verified.');
            setApiKey(''); setAgentReady(true);
        } catch (keyError) { setError(keyError.message || 'Gemini key could not be saved.'); }
        finally { setLoading(false); }
    };
    const parseRoster = text => JSON.parse(String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
    const prepareOnboarding = async () => {
        if (!image || onboardingBusy) return;
        if (isDesktop && !agentReady) { setError('Add and verify your personal Gemini key before analysing an onboarding image.'); return; }
        setOnboardingBusy(true); setError(''); setOnboardingPreview(null);
        try {
            let result;
            if (isDesktop) {
                const extraction = await new Promise((resolve, reject) => {
                    let response = '';
                    window.electronAPI.onAgentChatChunk('google-gemini', chunk => { response += chunk; });
                    window.electronAPI.onAgentChatDone('google-gemini', () => resolve(response));
                    window.electronAPI.onAgentChatError('google-gemini', reason => reject(new Error(reason)));
                    window.electronAPI.chatWithAgent('google-gemini', 'Extract this student roster. Return JSON only in this exact form: {"department":"","year":"","section":"","students":[{"rollNumber":"","name":""}]}. Do not invent unreadable roll numbers.', { model, image: image.data }).catch(reject);
                });
                result = await api.post('/api/management-ai/onboarding/preview', parseRoster(extraction));
            } else result = await api.post('/api/management-ai/onboarding/preview', { image: image.data, model });
            setOnboardingPreview(result.data);
        } catch (previewError) { setError(previewError.response?.data?.error || previewError.message || 'Could not prepare the onboarding review.'); }
        finally { setOnboardingBusy(false); }
    };
    const confirmOnboarding = async () => {
        if (!onboardingPreview || onboardingBusy) return;
        setOnboardingBusy(true); setError('');
        try {
            const result = await api.post('/api/management-ai/onboarding/confirm', { ...onboardingPreview.cohort, students: onboardingPreview.valid });
            addMessage({ role: 'assistant', content: `Onboarding complete: ${result.data.created.length} student account(s) created. ${result.data.duplicates.length} duplicate record(s) were skipped.` });
            setOnboardingPreview(null); setImage(null); refresh();
        } catch (confirmError) { setError(confirmError.response?.data?.error || 'Could not confirm student onboarding.'); }
        finally { setOnboardingBusy(false); }
    };
    const downloadDailyReport = async () => {
        setError('');
        try {
            const result = await api.get('/api/management-ai/reports/daily-labs.csv', { responseType: 'blob' });
            const url = URL.createObjectURL(result.data);
            const link = document.createElement('a'); link.href = url; link.download = 'kevryn-daily-lab-report.csv'; link.click(); URL.revokeObjectURL(url);
        } catch (_) { setError('Could not download the daily lab report.'); }
    };
    const instantInsight = async text => {
        const studentMatch = text.match(/(?:student|roll(?:\s+number)?|details?\s+(?:of|for))\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{3,})/i);
        if (studentMatch) {
            const result = await api.get(`/api/management-ai/student/${encodeURIComponent(studentMatch[1])}`);
            const { student, summary, submissions } = result.data;
            return `Student 360° profile\n\n${student.name || student.username} (${student.rollNumber || student.username})\n${student.department || '—'} · Year ${student.year || '—'} · Section ${student.section || '—'}\n\nAttendance: ${summary.labsAttended}/${summary.labsAssigned} labs (${summary.attendancePercentage}%)\nAssignments available: ${summary.assignmentsAvailable}\nSubmissions: ${summary.submissions}\nAverage score: ${summary.averageScore === null ? 'No graded submissions yet' : `${summary.averageScore}%`}\n\nRecent submissions\n${submissions.length ? submissions.slice(0, 5).map(item => `• ${item.assignmentId?.title || 'Assignment'} — ${item.score}/${item.maxScore} (${item.status})`).join('\n') : 'No submissions recorded.'}`;
        }
        if (/attendance.*(?:risk|below|low)|at[- ]risk/i.test(text)) {
            const result = await api.get('/api/management-ai/attendance-risk');
            return `Attendance risk report — below ${result.data.threshold}%\n\n${result.data.students.length ? result.data.students.slice(0, 20).map(item => `• ${item.name || item.rollNumber || item.username} — ${item.attendancePercentage}% (${item.labsAttended}/${item.labsAssigned} labs)`).join('\n') : 'No students are currently below the selected threshold.'}`;
        }
        if (/faculty.*(?:workload|load|performance)|workload.*faculty/i.test(text)) {
            const result = await api.get('/api/management-ai/faculty-workload');
            return `Faculty workload — current institution\n\n${result.data.map(item => `• ${item.username}: ${item.weeklySlots} weekly slots, ${item.labsLast30Days} labs in 30 days, ${item.attendancePercentage}% session attendance`).join('\n') || 'No active faculty records found.'}`;
        }
        return null;
    };
    const ask = async preset => {
        const text = (preset || input).trim();
        if ((!text && !image) || requestInFlightRef.current) return;
        requestInFlightRef.current = true;
        const normalized = text.toLowerCase();
        const wantsBroadcast = /\b(send|draft|create|publish)\b[\s\S]{0,40}\b(announcement|broadcast|notice)\b|\b(announcement|broadcast|notice)\b[\s\S]{0,40}\b(send|draft|create|publish)\b/.test(normalized);
        const wantsTimetable = /\b(create|plan|build|add)\b[\s\S]{0,40}\b(timetable|schedule|lab slot)\b|\b(timetable|schedule|lab slot)\b[\s\S]{0,40}\b(create|plan|build|add)\b/.test(normalized);
        const wantsOnboarding = /\b(onboard|onboarding|enrol|enroll|register)\b[\s\S]{0,50}\b(student|roster|roll)\b/.test(normalized);
        if (wantsOnboarding && image) { addMessage({ role: 'user', content: text || 'Prepare onboarding from this roster image.', image: image.data }); await prepareOnboarding(); requestInFlightRef.current = false; return; }
        if (wantsBroadcast) { setInput(''); addMessage({ role: 'user', content: text }); addMessage({ role: 'assistant', content: 'I opened a reviewed announcement draft. Choose the audience and priority, then confirm delivery after checking the recipient count.' }); setShowBroadcastComposer(true); requestInFlightRef.current = false; return; }
        if (wantsTimetable) { setInput(''); addMessage({ role: 'user', content: text }); addMessage({ role: 'assistant', content: 'I opened the conflict-free timetable planner. Fill in the requested slot and I will validate faculty, room, and cohort availability before confirmation.' }); setShowTimetablePlanner(true); requestInFlightRef.current = false; return; }
        setError(''); setLoading(true); setInput('');
        addMessage({ role: 'user', content: text || 'Analyse this institution document.', image: image?.data });
        addMessage({ role: 'assistant', content: '', pending: true, activity: 'Checking live institution records…' });
        const outgoingImage = image?.data;
        setImage(null);
        try {
            const insight = outgoingImage ? null : await instantInsight(text);
            if (insight) { completePending(insight); return; }
            if (isDesktop && !agentReady) throw new Error('Add and verify your personal Gemini key before using Management Intelligence.');
            if (isDesktop) {
                const live = await api.get('/api/management-ai/overview');
                let response = '';
                window.electronAPI.onAgentChatChunk('google-gemini', chunk => { response += chunk; setMessages(previous => previous.map(item => item.pending ? { ...item, content: response, activity: 'Writing a grounded response…' } : item)); });
                window.electronAPI.onAgentChatDone('google-gemini', () => { setMessages(previous => previous.map(item => item.pending ? { ...item, pending: false } : item)); setLoading(false); requestInFlightRef.current = false; });
                window.electronAPI.onAgentChatError('google-gemini', message => { throw new Error(message); });
                await window.electronAPI.chatWithAgent('google-gemini', text || 'Analyse this institution image.', { model, managementSnapshot: live.data, code: JSON.stringify(live.data), image: outgoingImage });
            } else {
                const result = await api.post('/api/management-ai/chat', { message: text, model, image: outgoingImage });
                setOverview(result.data.snapshot || overview);
                completePending(result.data.response);
            }
        } catch (requestError) {
            setError(requestError.response?.data?.error || requestError.message || 'Management Intelligence could not complete the request.');
            setMessages(previous => previous.filter(item => !item.pending));
        } finally {
            if (!isDesktop) requestInFlightRef.current = false;
            if (!isDesktop) setLoading(false);
        }
    };
    const summary = overview?.summary;
    const suggestions = [
        ['Today’s complete lab report', <FaClipboardList />],
        ['What happened in the institution today?', <FaBolt />],
        ['Show students needing attendance attention', <FaUsers />],
        ['Check today’s faculty and lab workload', <FaCalendarAlt />]
    ];

    return <AnimatePresence><motion.div className="management-ai-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <motion.section className="management-ai-modal" initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .98 }} transition={{ type: 'spring', damping: 26, stiffness: 290 }} aria-label="KevRyn Management Intelligence">
            <header className="management-ai-header"><div className="management-ai-brand"><span><FaRobot /></span><div><strong>KevRyn Management Intelligence</strong><small><i /> Live institution context</small></div></div><div className="management-ai-head-actions"><label className="management-ai-model"><span>Gemini</span><select value={model} onChange={event => setModel(event.target.value)}>{models.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><FaChevronDown /></label><button className="management-ai-close" onClick={onClose} aria-label="Close management intelligence"><FaTimes /></button></div></header>
            {isDesktop && !agentReady && <div className="management-ai-keybar"><FaKey /><span>Desktop mode uses your personal Gemini key, stored only in encrypted local storage.</span><button onClick={() => window.electronAPI.openProviderKeyPage('google-gemini')}>Get key</button><input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Paste Gemini API key" /><button className="primary" disabled={!apiKey.trim() || loading} onClick={saveDesktopKey}>Save & verify</button></div>}
            <div className="management-ai-body"><main className="management-ai-chat"><div className="management-ai-intro"><div><p>Institution command centre</p><h2>Ask anything. Get live answers.</h2><span>Labs, attendance, students, faculty, schedules, reports, and onboarding preparation — scoped to your institution.</span></div>{summary && <div className="management-ai-mini-summary"><b>{summary.labsToday}</b><span>labs today</span><b>{summary.attendance.attended}/{summary.attendance.expected || 0}</b><span>attendance</span></div>}</div>
                {messages.length === 0 && <div className="management-ai-suggestions">{suggestions.map(([prompt, icon]) => <button key={prompt} onClick={() => ask(prompt)} disabled={loading}>{icon}<span>{prompt}</span><FaArrowUp /></button>)}<button onClick={() => setShowTimetablePlanner(true)}><FaCalendarAlt /><span>Plan a conflict-free timetable</span><FaArrowUp /></button><button onClick={() => setShowBroadcastComposer(true)}><FaBolt /><span>Draft an institution announcement</span><FaArrowUp /></button><button onClick={() => setShowAuditHistory(true)}><FaHistory /><span>View confirmed action history</span><FaArrowUp /></button></div>}
                <div className="management-ai-messages">{messages.map(message => <article className={`management-ai-message ${message.role}`} key={message.id}>{message.role === 'assistant' && <span className="management-ai-avatar"><FaRobot /></span>}<div>{message.image && <img src={message.image} alt="Attached for management analysis" />}{message.content ? (message.role === 'assistant' ? <ManagementAnswer content={message.content} /> : <p>{message.content}</p>) : <span className="management-ai-thinking"><FaSpinner className="spin" /> {message.activity || 'Analysing live institution data…'}</span>}</div></article>)}<div ref={messagesEndRef} /></div></main>
                <aside className="management-ai-sidebar"><div className="management-ai-side-title"><FaBuilding /> Today at a glance</div>{summary ? <><div className="management-ai-kpis"><div><strong>{summary.scheduledToday}</strong><span>Scheduled</span></div><div><strong>{summary.completedLabs}</strong><span>Completed</span></div><div><strong>{summary.liveLabs}</strong><span>Live now</span></div></div><div className="management-ai-attendance"><span>Institution attendance</span><strong>{summary.attendance.percentage}%</strong><small>{summary.attendance.attended} of {summary.attendance.expected || 0} expected students</small><i><b style={{ width: `${summary.attendance.percentage}%` }} /></i></div><div className="management-ai-labs"><span>Today’s labs</span>{(overview.todayLabs || []).slice(0, 5).map(lab => <button key={lab.id} onClick={() => ask(`Give the detailed report for ${lab.name}`)}><i className={lab.status} /><div><strong>{lab.subject}</strong><small>{lab.faculty} · {lab.durationMinutes || '—'} min</small></div><em>{lab.attendance.attended}/{lab.attendance.expected}</em></button>)}{!overview.todayLabs?.length && <p>No live or recorded labs found today.</p>}</div><button onClick={downloadDailyReport} style={{ width: '100%', marginTop: 14, border: '1px solid #d7d0fa', borderRadius: 7, padding: 8, color: '#5b50bf', background: '#f4f2ff', fontSize: 10, fontWeight: 750, cursor: 'pointer' }}>Download today’s lab report (CSV)</button></> : <div className="management-ai-loading"><FaSpinner className="spin" /> Loading secure institution data…</div>}</aside></div>
            <footer className="management-ai-composer">{onboardingPreview && <section className="management-ai-onboarding"><div><FaCheckCircle /><span><strong>Onboarding review ready</strong><small>{onboardingPreview.cohort.department} · Year {onboardingPreview.cohort.year} · Section {onboardingPreview.cohort.section}</small></span><b>{onboardingPreview.valid.length} valid</b><b className="warn">{onboardingPreview.duplicates.length} duplicates</b></div>{onboardingPreview.cohortWarning ? <p>{onboardingPreview.cohortWarning}</p> : <button onClick={confirmOnboarding} disabled={onboardingBusy || !onboardingPreview.valid.length}>{onboardingBusy ? <FaSpinner className="spin" /> : 'Confirm & create student accounts'}</button>}</section>}<div className="management-ai-attachment">{image ? <><img src={image.data} alt="Ready for analysis" /><span>{image.name}</span><button onClick={() => { setImage(null); setOnboardingPreview(null); }}><FaTimes /></button><button className="management-ai-prepare" onClick={prepareOnboarding} disabled={onboardingBusy}>{onboardingBusy ? <FaSpinner className="spin" /> : <FaCloudUploadAlt />} Prepare onboarding</button></> : <label><FaPaperclip /> Attach or paste an image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => attachFile(event.target.files?.[0])} /></label>}</div><textarea value={input} onPaste={event => { const file = [...event.clipboardData.files][0]; if (file) { event.preventDefault(); attachFile(file); } }} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(); } }} placeholder="Ask about today’s labs, a student, attendance, faculty, timetable, or paste an onboarding image…" disabled={loading || onboardingBusy} /><button className="management-ai-send" disabled={loading || onboardingBusy || (!input.trim() && !image)} onClick={() => ask()}>{loading ? <FaSpinner className="spin" /> : <FaArrowUp />}</button><small>Enter to send · Shift+Enter for a new line · Actions always require review</small>{error && <p className="management-ai-error">{error}</p>}</footer>
        </motion.section>{showTimetablePlanner && <TimetableProposalPanel token={token} onClose={() => setShowTimetablePlanner(false)} />}{showBroadcastComposer && <BroadcastProposalPanel token={token} onClose={() => setShowBroadcastComposer(false)} />}{showAuditHistory && <ManagementAuditPanel token={token} onClose={() => setShowAuditHistory(false)} />}
    </motion.div></AnimatePresence>;
};

export default ManagementAssistantModal;
