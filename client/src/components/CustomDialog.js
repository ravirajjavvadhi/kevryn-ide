import React, { useEffect, useRef } from 'react';
import './CustomDialog.css';

/**
 * CustomDialog — replaces native alert / confirm / prompt
 *
 * Props:
 *   type: 'alert' | 'confirm' | 'prompt'
 *   title: string
 *   message: string
 *   defaultValue: string  (for prompt)
 *   onConfirm: (value?) => void
 *   onCancel: () => void
 */
const CustomDialog = ({ type = 'alert', title, message, defaultValue = '', onConfirm, onCancel }) => {
    const inputRef = useRef(null);

    useEffect(() => {
        if (type === 'prompt' && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [type]);

    const handleConfirm = () => {
        if (type === 'prompt') {
            onConfirm(inputRef.current?.value || '');
        } else {
            onConfirm();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape' && type !== 'alert') onCancel?.();
    };

    // Icon by type
    const icon = type === 'confirm' ? '⚠️' : type === 'prompt' ? '✏️' : 'ℹ️';

    return (
        <div className="cdialog-overlay" onKeyDown={handleKeyDown} tabIndex={-1}>
            <div className="cdialog-box">
                {/* Header glow bar */}
                <div className="cdialog-glow-bar" />

                <div className="cdialog-header">
                    <span className="cdialog-icon">{icon}</span>
                    <span className="cdialog-title">{title || 'Kevryn'}</span>
                </div>

                <div className="cdialog-body">
                    <p className="cdialog-message">{message}</p>
                    {type === 'prompt' && (
                        <input
                            ref={inputRef}
                            className="cdialog-input"
                            defaultValue={defaultValue}
                            placeholder="Type your answer..."
                        />
                    )}
                </div>

                <div className="cdialog-actions">
                    {type !== 'alert' && (
                        <button className="cdialog-btn cdialog-btn-cancel" onClick={onCancel}>
                            Cancel
                        </button>
                    )}
                    <button className="cdialog-btn cdialog-btn-confirm" onClick={handleConfirm} autoFocus={type !== 'prompt'}>
                        {type === 'confirm' ? 'Confirm' : 'OK'}
                    </button>
                </div>

                {/* Corner accent */}
                <div className="cdialog-corner-tl" />
                <div className="cdialog-corner-br" />
            </div>
        </div>
    );
};

export default CustomDialog;
