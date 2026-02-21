import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaSearch, FaTimes, FaFileAlt, FaChevronRight } from 'react-icons/fa';

const GlobalSearch = ({ SERVER_URL, token, onFileClick, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    const handleSearch = async (val) => {
        setQuery(val);
        if (!val.trim()) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        try {
            // Ensure we use an absolute URL
            const absoluteUrl = SERVER_URL.startsWith('http') ? `${SERVER_URL}/search` : `${window.location.protocol}//${SERVER_URL}/search`;
            const res = await axios.get(`${absoluteUrl}?query=${encodeURIComponent(val)}`, {
                headers: { Authorization: token }
            });
            setResults(res.data);
        } catch (e) {
            console.error("Search Error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="global-search-overlay" onClick={onClose}>
            <div className="global-search-container" onClick={e => e.stopPropagation()}>
                <div className="search-input-wrapper">
                    <FaSearch className="search-icon" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search files (text, functions, variables...)"
                        value={query}
                        onChange={e => handleSearch(e.target.value)}
                    />
                    <button className="close-search" onClick={onClose}><FaTimes /></button>
                </div>

                <div className="search-results">
                    {isLoading && <div className="search-loading">Searching...</div>}
                    {!isLoading && results.length === 0 && query && (
                        <div className="no-results">No matches found for "{query}"</div>
                    )}
                    {results.map((res, i) => (
                        <div key={i} className="search-result-item" onClick={() => { onFileClick(res.file, res.line); onClose(); }}>
                            <div className="result-header">
                                <FaFileAlt className="file-icon" />
                                <span className="file-path">{res.file}</span>
                                <span className="line-num">Line {res.line}</span>
                            </div>
                            <div className="result-preview">
                                {res.text}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default GlobalSearch;
