import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { FaHistory, FaUndo, FaClock, FaUser, FaChevronDown, FaChevronUp, FaFileSignature } from 'react-icons/fa';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

export default function TimelinePanel({ token, activeFileId, onRestoreComplete }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [restoringId, setRestoringId] = useState(null);

    const api = useMemo(() => axios.create({ baseURL: SERVER_URL, headers: { Authorization: token } }), [token]);

    const fetchTimeline = useCallback(async () => {
        if (!activeFileId) {
            console.log('[TIMELINE] No activeFileId, skipping fetch');
            return;
        }
        setLoading(true);
        setError(null);
        console.log(`[TIMELINE] Fetching history for ${activeFileId}...`);
        try {
            const res = await api.get(`/files/${activeFileId}/timeline`);
            console.log(`[TIMELINE] Received ${res.data.length} records`);
            setHistory(res.data);
        } catch (err) {
            console.error('[TIMELINE] Failed to fetch timeline:', err);
            setError(err.response?.data?.error || 'Failed to fetch timeline');
        } finally {
            setLoading(false);
        }
    }, [activeFileId, api]);

    useEffect(() => {
        fetchTimeline();
    }, [fetchTimeline]);

    const handleRestore = async (historyId) => {
        if (!window.confirm('Restore file to this version? Current changes will be saved to history.')) return;
        setRestoringId(historyId);
        try {
            const res = await api.post(`/files/history/${historyId}/restore`);
            if (res.data.success) {
                if (onRestoreComplete) onRestoreComplete(res.data.content);
                fetchTimeline(); // Refresh history
                alert('File restored successfully!');
            }
        } catch (err) {
            alert('Failed to restore file');
        } finally {
            setRestoringId(null);
        }
    };

    if (!activeFileId) {
        return (
            <div className="timeline-empty">
                <FaFileSignature size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
                <div>Select a file to see its history</div>
            </div>
        );
    }

    return (
        <div className="timeline-panel">
            <div className="timeline-header">
                <span className="timeline-title"><FaHistory size={13} /> File Timeline</span>
                <button className="timeline-refresh-btn" onClick={fetchTimeline} disabled={loading} title="Refresh">
                    <FaClock size={11} className={loading ? 'spinning' : ''} />
                </button>
            </div>

            <div className="timeline-list">
                {loading && history.length === 0 && (
                    <div className="timeline-loading">Loading history...</div>
                )}

                {error && (
                    <div className="timeline-empty" style={{ color: '#ef4444' }}>
                        <div>{error}</div>
                        <button className="timeline-refresh-btn" style={{ marginTop: '10px', width: 'auto', padding: '0 12px' }} onClick={fetchTimeline}>Retry</button>
                    </div>
                )}

                {!loading && !error && history.length === 0 && (
                    <div className="timeline-empty">
                        <FaClock size={24} style={{ opacity: 0.1, marginBottom: '8px' }} />
                        <div>No history found for this file.</div>
                        <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>Snapshots are created when you save changes.</div>
                    </div>
                )}

                {history.map((record) => (
                    <div key={record._id} className={`timeline-card ${expandedId === record._id ? 'expanded' : ''}`}>
                        <div className="timeline-card-header" onClick={() => setExpandedId(expandedId === record._id ? null : record._id)}>
                            <div className="timeline-info">
                                <div className="timeline-filename">
                                    <FaFileSignature size={10} style={{ marginRight: '4px', opacity: 0.7 }} />
                                    {record.fileId?.name || 'File'}
                                </div>
                                <div className="timeline-date">
                                    <FaClock size={9} style={{ marginRight: '4px', opacity: 0.7 }} />
                                    {new Date(record.savedAt).toLocaleString()}
                                </div>
                                <div className="timeline-user">
                                    <FaUser size={9} /> {record.savedBy?.username || 'Unknown'}
                                </div>
                            </div>
                            <div className="timeline-actions" onClick={e => e.stopPropagation()}>
                                <button
                                    className="timeline-restore-btn"
                                    onClick={() => handleRestore(record._id)}
                                    disabled={restoringId === record._id}
                                    title="Restore this version"
                                >
                                    {restoringId === record._id ? '...' : <FaUndo size={11} />}
                                </button>
                                {expandedId === record._id ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
                            </div>
                        </div>

                        {expandedId === record._id && (
                            <div className="timeline-preview">
                                <pre><code>{record.content.substring(0, 500)}{record.content.length > 500 ? '...' : ''}</code></pre>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
