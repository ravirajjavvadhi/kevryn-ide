import React, { useState, useEffect } from 'react';
import { FaCodeBranch, FaSync, FaCheck, FaArrowUp, FaArrowDown, FaRedo } from 'react-icons/fa';
import axios from 'axios';

const GitPanel = ({ token, refreshTrigger, startRepo }) => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [commitMessage, setCommitMessage] = useState("");
    const [pushing, setPushing] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [repoName, setRepoName] = useState(startRepo || "");

    const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
    const api = axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } });

    useEffect(() => {
        if (startRepo) setRepoName(startRepo);
    }, [startRepo]);

    useEffect(() => {
        if (repoName) fetchStatus();
    }, [refreshTrigger, repoName]);

    const fetchStatus = async () => {
        if (!repoName) return;
        setLoading(true);
        try {
            const res = await api.post('/git/status', { repoName });
            setStatus(res.data);
        } catch (err) {
            console.error("Git Status Error:", err);
            // setStatus(null); 
        } finally {
            setLoading(false);
        }
    };

    const handleStage = async (file) => {
        try {
            await api.post('/git/add', { repoName, files: [file] });
            fetchStatus();
        } catch (err) { alert("Stage failed"); }
    };

    const handleCommit = async () => {
        if (!commitMessage) return alert("Enter a commit message");
        try {
            await api.post('/git/commit', { repoName, message: commitMessage });
            setCommitMessage("");
            fetchStatus();
        } catch (err) { alert("Commit failed"); }
    };

    const handlePush = async () => {
        setPushing(true);
        try {
            await api.post('/git/push', { repoName });
            alert("Pushed successfully!");
            fetchStatus();
        } catch (err) {
            alert("Push failed: " + (err.response?.data?.error || err.message));
        } finally {
            setPushing(false);
        }
    };

    const handlePull = async () => {
        setPulling(true);
        try {
            await api.post('/git/pull', { repoName });
            alert("Pulled successfully!");
            fetchStatus();
        } catch (err) {
            alert("Pull failed: " + (err.response?.data?.error || err.message));
        } finally {
            setPulling(false);
        }
    };

    if (!repoName) return <div style={{ padding: '20px', color: '#888' }}>Please Switch Repository to use Git.</div>;

    if (loading && !status) return <div style={{ padding: '20px', color: '#888' }}>Loading git status...</div>;
    if (!status) return <div style={{ padding: '20px', color: '#888' }}>Not a git repository or backend error.</div>;

    return (
        <div className="git-panel" style={{ color: '#ccc', padding: '10px', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase' }}>Source Control</h3>
                <FaRedo style={{ cursor: 'pointer' }} onClick={fetchStatus} title="Refresh" />
            </div>
            <div style={{ marginBottom: '10px', fontSize: '12px', color: '#007acc' }}>Repo: {repoName}</div>

            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                <button onClick={handlePull} disabled={pulling} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '6px', background: '#333', border: '1px solid #444', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>
                    <FaArrowDown /> {pulling ? '...' : 'Pull'}
                </button>
                <button onClick={handlePush} disabled={pushing} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '6px', background: '#333', border: '1px solid #444', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>
                    <FaArrowUp /> {pushing ? '...' : 'Push'}
                </button>
            </div>

            <div style={{ marginBottom: '15px' }}>
                <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Message"
                    style={{ width: '100%', background: '#252526', border: '1px solid #3c3c3c', color: 'white', padding: '8px', minHeight: '60px', borderRadius: '4px', resize: 'vertical' }}
                />
                <button onClick={handleCommit} style={{ width: '100%', marginTop: '5px', padding: '6px', background: '#0e639c', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
                    <FaCheck /> Commit
                </button>
            </div>

            <div style={{ marginBottom: '10px', fontSize: '12px', fontWeight: 'bold' }}>CHANGES</div>
            {status.files && status.files.length === 0 && <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>No changes detected.</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {status.files && status.files.map((file, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 0', fontSize: '13px' }}>
                        <span style={{ color: file.index === '?' ? '#73c991' : '#e2c08d', width: '15px', display: 'inline-block', textAlign: 'center' }}>
                            {file.index === '?' ? 'U' : 'M'}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.path}>{file.path}</span>
                        <button onClick={() => handleStage(file.path)} style={{ background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer' }} title="Stage Changes">+</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GitPanel;
