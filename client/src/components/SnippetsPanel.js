import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaPlus, FaSearch, FaTimes, FaTrash, FaEdit, FaPaste, FaCopy, FaCode, FaSave, FaCheck, FaCut } from 'react-icons/fa';

const _raw = (process.env.REACT_APP_SERVER_URL || 'http://localhost:5000').trim();
const SERVER_URL = _raw.startsWith('http') ? _raw : `https://${_raw}`;

const LANGUAGES = [
    'all', 'javascript', 'typescript', 'python', 'html', 'css', 'java', 'cpp', 'c',
    'json', 'markdown', 'sql', 'bash', 'plaintext'
];

const LANGUAGE_COLORS = {
    javascript: '#f7df1e',
    typescript: '#3178c6',
    python: '#3776ab',
    html: '#e34c26',
    css: '#1572b6',
    java: '#b07219',
    cpp: '#f34b7d',
    c: '#555555',
    json: '#292929',
    markdown: '#083fa1',
    sql: '#e38c00',
    bash: '#4eaa25',
    plaintext: '#666'
};

export default function SnippetsPanel({ token, editorRef, getLanguage, fileName }) {
    const [snippets, setSnippets] = useState([]);
    const [search, setSearch] = useState('');
    const [langFilter, setLangFilter] = useState('all');
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [form, setForm] = useState({ title: '', code: '', language: 'javascript', tags: '', description: '' });
    const [loading, setLoading] = useState(false);

    const api = axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } });

    const fetchSnippets = useCallback(async () => {
        try {
            const params = {};
            if (search) params.search = search;
            if (langFilter !== 'all') params.language = langFilter;
            const res = await api.get('/snippets', { params });
            setSnippets(res.data);
        } catch (err) {
            console.error('Failed to fetch snippets:', err);
        }
    }, [search, langFilter, token]);

    useEffect(() => {
        fetchSnippets();
    }, [fetchSnippets]);

    // Debounced search
    useEffect(() => {
        const timeout = setTimeout(fetchSnippets, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    const handleSave = async () => {
        if (!form.title.trim() || !form.code.trim()) return alert('Title and code are required');
        setLoading(true);
        try {
            const payload = {
                ...form,
                tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
            };
            if (editingId) {
                await api.put(`/snippets/${editingId}`, payload);
            } else {
                await api.post('/snippets', payload);
            }
            setForm({ title: '', code: '', language: 'javascript', tags: '', description: '' });
            setIsCreating(false);
            setEditingId(null);
            fetchSnippets();
        } catch (err) {
            alert('Failed to save snippet');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this snippet?')) return;
        try {
            await api.delete(`/snippets/${id}`);
            fetchSnippets();
        } catch (err) {
            alert('Failed to delete');
        }
    };

    const handleEdit = (snippet) => {
        setForm({
            title: snippet.title,
            code: snippet.code,
            language: snippet.language,
            tags: snippet.tags.join(', '),
            description: snippet.description || ''
        });
        setEditingId(snippet._id);
        setIsCreating(true);
    };

    const handleInsert = (code) => {
        if (editorRef?.current) {
            const editor = editorRef.current;
            const selection = editor.getSelection();
            editor.executeEdits('snippet-insert', [{
                range: selection,
                text: code,
                forceMoveMarkers: true
            }]);
            editor.focus();
        }
    };

    const handleCopy = async (code, id) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    const handleSaveSelection = () => {
        if (!editorRef?.current) return alert('Open a file first');
        const editor = editorRef.current;
        const selection = editor.getSelection();
        const selectedText = editor.getModel().getValueInRange(selection);
        if (!selectedText || !selectedText.trim()) return alert('Select some code in the editor first');

        setForm({
            title: '',
            code: selectedText,
            language: getLanguage ? getLanguage(fileName || '') : 'javascript',
            tags: '',
            description: `Saved from ${fileName || 'editor'}`
        });
        setEditingId(null);
        setIsCreating(true);
    };

    const handleCancel = () => {
        setIsCreating(false);
        setEditingId(null);
        setForm({ title: '', code: '', language: 'javascript', tags: '', description: '' });
    };

    return (
        <div className="snippets-panel">
            {/* Header */}
            <div className="snippets-header">
                <span className="snippets-title"><FaCode size={13} /> Snippets</span>
                <div className="snippets-header-actions">
                    <button className="snippet-icon-btn save-sel-btn" onClick={handleSaveSelection} title="Save Selection as Snippet">
                        <FaCut size={11} />
                    </button>
                    <button className="snippet-icon-btn" onClick={() => { setIsCreating(true); setEditingId(null); setForm({ title: '', code: '', language: 'javascript', tags: '', description: '' }); }} title="New Snippet">
                        <FaPlus size={11} />
                    </button>
                </div>
            </div>

            {/* Search & Filter */}
            <div className="snippets-filters">
                <div className="snippets-search-wrap">
                    <FaSearch size={10} className="snippets-search-icon" />
                    <input
                        type="text"
                        placeholder="Search snippets..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="snippets-search"
                    />
                    {search && <FaTimes size={10} className="snippets-clear-btn" onClick={() => setSearch('')} />}
                </div>
                <select
                    value={langFilter}
                    onChange={e => setLangFilter(e.target.value)}
                    className="snippets-lang-filter"
                >
                    {LANGUAGES.map(l => (
                        <option key={l} value={l}>{l === 'all' ? '🌐 All' : l}</option>
                    ))}
                </select>
            </div>

            {/* Create / Edit Form */}
            {isCreating && (
                <div className="snippet-form">
                    <div className="snippet-form-title">{editingId ? '✏️ Edit Snippet' : '✨ New Snippet'}</div>
                    <input
                        type="text"
                        placeholder="Snippet title..."
                        value={form.title}
                        onChange={e => setForm({ ...form, title: e.target.value })}
                        className="snippet-form-input"
                        autoFocus
                    />
                    <textarea
                        placeholder="Paste your code here..."
                        value={form.code}
                        onChange={e => setForm({ ...form, code: e.target.value })}
                        className="snippet-form-code"
                        rows={6}
                    />
                    <div className="snippet-form-row">
                        <select
                            value={form.language}
                            onChange={e => setForm({ ...form, language: e.target.value })}
                            className="snippet-form-select"
                        >
                            {LANGUAGES.filter(l => l !== 'all').map(l => (
                                <option key={l} value={l}>{l}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Tags (comma sep)"
                            value={form.tags}
                            onChange={e => setForm({ ...form, tags: e.target.value })}
                            className="snippet-form-input snippet-form-tags"
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="Description (optional)"
                        value={form.description}
                        onChange={e => setForm({ ...form, description: e.target.value })}
                        className="snippet-form-input"
                    />
                    <div className="snippet-form-actions">
                        <button className="snippet-btn snippet-btn-save" onClick={handleSave} disabled={loading}>
                            <FaSave size={11} /> {loading ? 'Saving...' : 'Save'}
                        </button>
                        <button className="snippet-btn snippet-btn-cancel" onClick={handleCancel}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Snippets List */}
            <div className="snippets-list">
                {snippets.length === 0 && !isCreating && (
                    <div className="snippets-empty">
                        <FaCode size={28} style={{ opacity: 0.2, marginBottom: '10px' }} />
                        <div>No snippets yet</div>
                        <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.5 }}>
                            Click + to create one, or select code and save it
                        </div>
                    </div>
                )}
                {snippets.map(s => (
                    <div
                        key={s._id}
                        className={`snippet-card ${expandedId === s._id ? 'expanded' : ''}`}
                    >
                        <div className="snippet-card-header" onClick={() => setExpandedId(expandedId === s._id ? null : s._id)}>
                            <div className="snippet-card-title">
                                <span
                                    className="snippet-lang-badge"
                                    style={{ background: LANGUAGE_COLORS[s.language] || '#666' }}
                                >
                                    {s.language}
                                </span>
                                <span className="snippet-card-name">{s.title}</span>
                            </div>
                            <div className="snippet-card-actions" onClick={e => e.stopPropagation()}>
                                <button
                                    className="snippet-action-btn"
                                    onClick={() => handleInsert(s.code)}
                                    title="Insert at cursor"
                                >
                                    <FaPaste size={10} />
                                </button>
                                <button
                                    className="snippet-action-btn"
                                    onClick={() => handleCopy(s.code, s._id)}
                                    title="Copy to clipboard"
                                >
                                    {copiedId === s._id ? <FaCheck size={10} style={{ color: '#4caf50' }} /> : <FaCopy size={10} />}
                                </button>
                                <button className="snippet-action-btn" onClick={() => handleEdit(s)} title="Edit">
                                    <FaEdit size={10} />
                                </button>
                                <button className="snippet-action-btn delete-btn" onClick={() => handleDelete(s._id)} title="Delete">
                                    <FaTrash size={10} />
                                </button>
                            </div>
                        </div>

                        {/* Tags */}
                        {s.tags && s.tags.length > 0 && (
                            <div className="snippet-tags">
                                {s.tags.map((tag, i) => (
                                    <span key={i} className="snippet-tag" onClick={() => setSearch(tag)}>#{tag}</span>
                                ))}
                            </div>
                        )}

                        {/* Description */}
                        {s.description && (
                            <div className="snippet-desc">{s.description}</div>
                        )}

                        {/* Code Preview / Full Code */}
                        <div className="snippet-code-wrap">
                            <pre className={`snippet-code ${expandedId === s._id ? 'expanded' : ''}`}>
                                <code>{s.code}</code>
                            </pre>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
