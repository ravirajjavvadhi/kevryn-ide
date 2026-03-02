import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ onDone }) => {
    const [visible, setVisible] = useState(true);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        const fadeTimer = setTimeout(() => setFadeOut(true), 3500);
        const doneTimer = setTimeout(() => {
            setVisible(false);
            if (onDone) onDone();
        }, 4200);
        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(doneTimer);
        };
    }, [onDone]);

    if (!visible) return null;

    return (
        <div className={`splash-root ${fadeOut ? 'splash-fadeout' : ''}`}>
            {/* Animated grid background */}
            <div className="splash-grid" />

            {/* Floating orbs */}
            <div className="splash-orb splash-orb-1" />
            <div className="splash-orb splash-orb-2" />
            <div className="splash-orb splash-orb-3" />

            {/* Central content */}
            <div className="splash-content">
                {/* Brand name */}
                <div className="splash-brand">
                    <span className="splash-letter-gold">K</span>
                    <span className="splash-letter">E</span>
                    <span className="splash-letter">V</span>
                    <span className="splash-letter-gold">R</span>
                    <span className="splash-letter">Y</span>
                    <span className="splash-letter">N</span>
                </div>

                {/* Animated underline */}
                <div className="splash-line" />

                {/* Slogan */}
                <p className="splash-slogan">
                    Code Beyond Limits. Build Beyond Boundaries.
                </p>

                {/* Loading dots */}
                <div className="splash-dots">
                    <span /><span /><span />
                </div>
            </div>

            {/* Bottom badge */}
            <div className="splash-footer">
                <span className="splash-footer-k">K</span>
                <span className="splash-footer-text">EVRYN CLOUD IDE</span>
                <span className="splash-version">v2.0</span>
            </div>
        </div>
    );
};

export default SplashScreen;
