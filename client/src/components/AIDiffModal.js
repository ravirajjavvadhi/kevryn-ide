import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaCheck, FaCode } from 'react-icons/fa';

const AIDiffModal = ({
    isOpen,
    onClose,
    onAccept,
    oldCode,
    newCode,
    fileName,
    language = 'javascript'
}) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="diff-modal-overlay">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="diff-modal-container"
                >
                    <div className="diff-modal-header">
                        <div className="diff-modal-title">
                            <FaCode className="title-icon" />
                            <span>Review Changes: <span className="file-name">{fileName}</span></span>
                        </div>
                        <button className="close-btn" onClick={onClose}>
                            <FaTimes />
                        </button>
                    </div>

                    <div className="diff-modal-editor-wrapper">
                        <DiffEditor
                            original={oldCode}
                            modified={newCode}
                            language={language}
                            theme="vs-dark"
                            options={{
                                renderSideBySide: true,
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                            }}
                        />
                    </div>

                    <div className="diff-modal-footer">
                        <div className="diff-info">
                            <span className="info-badge old">Original</span>
                            <span className="info-badge new">AI Suggestion</span>
                        </div>
                        <div className="diff-actions">
                            <button className="btn-cancel" onClick={onClose}>
                                <FaTimes /> Discard
                            </button>
                            <button className="btn-accept" onClick={() => onAccept(newCode)}>
                                <FaCheck /> Accept & Apply
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AIDiffModal;
