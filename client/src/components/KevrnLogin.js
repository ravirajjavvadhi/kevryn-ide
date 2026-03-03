import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { FaGithub, FaEye, FaEyeSlash } from 'react-icons/fa';

/* ============================================================
   KEVRYN – CINEMATIC LOGIN v2.0
   Full canvas particle system + aurora + 3D tilt + typewriter
   ============================================================ */

// ── Particle Canvas ─────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#60a5fa', '#22d3ee'];

    // Generate particles only client-side
    const particles = Array.from({ length: 800 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 2.2 + 0.6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: Math.random() * 0.8 + 0.2,
      opacityDir: Math.random() > 0.5 ? 1 : -1,
      opacitySpeed: Math.random() * 0.006 + 0.003,
    }));

    // Shooting stars
    const shootingStars = [];
    let lastShot = 0;
    const spawnShoot = () => {
      shootingStars.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.4,
        len: Math.random() * 120 + 80,
        speed: Math.random() * 8 + 6,
        opacity: 1,
        angle: Math.PI / 4,
        life: 1,
      });
    };

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    const onMouse = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouse);

    const draw = (time) => {
      ctx.clearRect(0, 0, w, h);

      // Shooting stars
      if (time - lastShot > (Math.random() * 3000 + 2000)) {
        spawnShoot();
        lastShot = time;
      }
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i];
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed;
        s.life -= 0.018;
        if (s.life <= 0) { shootingStars.splice(i, 1); continue; }
        const grad = ctx.createLinearGradient(
          s.x, s.y,
          s.x - Math.cos(s.angle) * s.len,
          s.y - Math.sin(s.angle) * s.len
        );
        grad.addColorStop(0, `rgba(255,255,255,${s.life})`);
        grad.addColorStop(0.3, `rgba(99,179,255,${s.life * 0.6})`);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Particles
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        // Magnetic pull toward cursor
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          p.vx += (dx / dist) * 0.025;
          p.vy += (dy / dist) * 0.025;
        }
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.x += p.vx;
        p.y += p.vy;
        p.opacity += p.opacityDir * p.opacitySpeed;
        if (p.opacity >= 1 || p.opacity <= 0.1) p.opacityDir *= -1;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Connection lines to nearby particles within 120px of mouse
        if (dist < 120) {
          for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const qx = mx - q.x;
            const qy = my - q.y;
            const qdist = Math.sqrt(qx * qx + qy * qy);
            if (qdist < 120) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              const alpha = (1 - qdist / 120) * 0.15;
              ctx.strokeStyle = `rgba(99,179,255,${alpha})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: -1, background: 'transparent'
      }}
    />
  );
}

// ── Typewriter Hook ──────────────────────────────────────────
function useTypewriter(text, speed = 60) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const id = setInterval(() => {
      setDisplayed(text.slice(0, ++i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return displayed;
}

// ── 3D Tilt Hook ─────────────────────────────────────────────
function useTilt(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rx = ((e.clientY - cy) / rect.height) * -8;
      const ry = ((e.clientX - cx) / rect.width) * 8;
      el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };
    const onLeave = () => {
      el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [ref]);
}

// ── Main Login Component ─────────────────────────────────────
export default function KevrnLogin({
  isFacultyLogin,
  setIsFacultyLogin,
  isLogin,
  setIsLogin,
  handleAuth,
  authData,
  setAuthData,
  handleGoogleLoginSuccess,
  SERVER_URL,
  runConnectionCheck,
}) {
  const cardRef = useRef(null);
  useTilt(cardRef);
  const subtitle = isFacultyLogin
    ? 'Secure access for educators & administrators.'
    : 'Your personal cloud workspace.';
  const typeText = useTypewriter(subtitle, 50);
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e) => {
    setIsLoading(true);
    try { await handleAuth(e); }
    finally { setIsLoading(false); }
  };

  return (
    <>
      {/* ── Styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .kl-root {
          position: fixed; inset: 0;
          background: #050510;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Inter', sans-serif;
          overflow: hidden; z-index: 1;
        }

        /* Aurora Layers */
        .kl-aurora {
          position: fixed; inset: 0; pointer-events: none; z-index: 1;
          overflow: hidden;
        }
        .kl-aurora-wave {
          position: absolute;
          width: 200%; height: 200%;
          top: -50%; left: -50%;
          border-radius: 40%;
          animation: auroraWave linear infinite;
          filter: blur(90px);
          opacity: 0.10;
        }
        .kl-aurora-wave:nth-child(1) {
          background: radial-gradient(ellipse at center, #3b82f6 0%, transparent 70%);
          animation-duration: 20s;
        }
        .kl-aurora-wave:nth-child(2) {
          background: radial-gradient(ellipse at center, #06b6d4 0%, transparent 70%);
          animation-duration: 25s;
          animation-direction: reverse;
          transform: translate(20%, 10%);
        }
        .kl-aurora-wave:nth-child(3) {
          background: radial-gradient(ellipse at center, #8b5cf6 0%, transparent 70%);
          animation-duration: 30s;
          transform: translate(-10%, 20%);
        }
        @keyframes auroraWave {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1); }
        }

        /* Nebula orbs */
        .kl-nebula {
          position: fixed; pointer-events: none; z-index: 1;
          border-radius: 50%;
          filter: blur(100px);
          animation: nebulaDrift ease-in-out infinite alternate;
        }
        @keyframes nebulaDrift {
          0%   { transform: translate(0, 0); }
          100% { transform: translate(60px, 40px); }
        }

        /* Small floating orbs */
        .kl-orb {
          position: fixed; pointer-events: none; z-index: 2;
          border-radius: 50%;
          animation: orbPulse ease-in-out infinite alternate;
        }
        @keyframes orbPulse {
          0%   { transform: scale(1) translateY(0);  box-shadow: 0 0 20px currentColor; }
          100% { transform: scale(1.4) translateY(-12px); box-shadow: 0 0 40px currentColor; }
        }

        /* Card wrapper */
        .kl-card-wrapper {
          position: relative; z-index: 10;
          width: 100%; max-width: 440px;
          margin: 0 16px;
          transition: transform 0.1s ease;
          transform-style: preserve-3d;
        }

        /* Spinning conic border */
        .kl-border-ring {
          position: absolute; inset: -2px; border-radius: 26px; z-index: -1;
          background: conic-gradient(from 0deg, #3b82f6, #06b6d4, #8b5cf6, transparent, #3b82f6);
          animation: spinBorder 4s linear infinite;
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          padding: 2px;
        }
        @keyframes spinBorder {
          to { transform: rotate(360deg); }
        }

        /* Glassmorphic card */
        .kl-card {
          background: rgba(10, 12, 40, 0.72);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(59, 130, 246, 0.18);
          border-radius: 24px;
          padding: 36px 32px 28px;
          animation: cardEnter 0.8s cubic-bezier(.22,1,.36,1) both;
        }
        @keyframes cardEnter {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Tab switcher */
        .kl-tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 4px;
          margin-bottom: 28px;
          animation: fadeSlideDown 0.5s ease both;
          animation-delay: 0.1s;
        }
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .kl-tab {
          flex: 1; padding: 9px 0; border: none; border-radius: 9px;
          font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.35s cubic-bezier(.22,1,.36,1);
          color: rgba(255,255,255,0.45);
          background: transparent;
        }
        .kl-tab.active {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          box-shadow: 0 4px 15px rgba(59,130,246,0.35);
        }

        /* Logo */
        .kl-logo-wrap {
          display: flex; justify-content: center; margin-bottom: 24px;
          animation: logoFlip 0.8s ease both;
          animation-delay: 0.2s;
        }
        @keyframes logoFlip {
          from { opacity: 0; transform: perspective(400px) rotateY(-90deg); }
          to   { opacity: 1; transform: perspective(400px) rotateY(0deg); }
        }
        .kl-logo-ring {
          position: relative; width: 72px; height: 72px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(59, 130, 246, 0.15);
          border-radius: 18px;
          box-shadow: 0 0 50px rgba(59, 130, 246, 0.4), 0 0 100px rgba(139, 92, 246, 0.2);
        }
        .kl-logo-ring::before {
          content: '';
          position: absolute; inset: -2px; border-radius: 20px;
          background: conic-gradient(#3b82f6, #06b6d4, #8b5cf6, #3b82f6);
          animation: spinBorder 4s linear infinite;
          padding: 2px;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        .kl-logo-inner {
          width: 58px; height: 58px; border-radius: 14px;
          background: rgba(10,12,40,0.85);
          display: flex; align-items: center; justify-content: center;
          position: relative; z-index: 1;
          box-shadow: inset 0 0 15px rgba(59, 130, 246, 0.3);
        }
        .kl-logo-text {
          background: linear-gradient(135deg, #60a5fa, #22d3ee, #a78bfa);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradShift 3s ease infinite;
          font-family: 'Inter', sans-serif;
          font-weight: 900; font-size: 24px;
          filter: drop-shadow(0 0 8px rgba(96, 165, 250, 0.5));
        }
        @keyframes gradShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* Heading */
        .kl-heading {
          text-align: center; color: #e8eaf6;
          font-size: 1.75rem; font-weight: 800;
          margin: 0 0 6px; letter-spacing: -0.5px;
          animation: fadeSlideDown 0.5s ease both;
          animation-delay: 0.3s;
        }
        .kl-heading span { color: #60a5fa; }

        /* Subtitle typewriter */
        .kl-subtitle {
          text-align: center; color: #7986cb;
          font-size: 13.5px; margin: 0 0 24px;
          min-height: 20px;
          animation: fadeSlideUp 0.5s ease both;
          animation-delay: 0.35s;
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .kl-cursor {
          display: inline-block; width: 2px; height: 13px;
          background: #06b6d4; margin-left: 1px;
          vertical-align: middle;
          animation: blink 0.8s step-end infinite;
        }
        @keyframes blink { 50% { opacity: 0; } }

        /* Inputs */
        .kl-input-wrap {
          position: relative; margin-bottom: 14px;
        }
        .kl-input-wrap:nth-child(odd)  { animation: slideFromLeft  0.5s ease both; }
        .kl-input-wrap:nth-child(even) { animation: slideFromRight 0.5s ease both; }
        @keyframes slideFromLeft  {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideFromRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .kl-input-wrap:nth-child(1) { animation-delay: 0.4s; }
        .kl-input-wrap:nth-child(2) { animation-delay: 0.5s; }

        .kl-input {
          width: 100%; box-sizing: border-box;
          padding: 13px 16px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(59,130,246,0.15);
          border-radius: 12px; color: #e8eaf6;
          font-size: 14px; font-family: 'Inter', sans-serif;
          outline: none;
          /* Stable transitions to prevent blinking */
          transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
          backface-visibility: hidden;
        }
        .kl-input::placeholder { color: rgba(255,255,255,0.25); }
        .kl-input:focus {
          border-color: #3b82f6;
          background: rgba(59,130,246,0.08);
          box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
        }
        .kl-input-eye {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          color: rgba(255,255,255,0.3); cursor: pointer;
          padding: 4px; display: flex; align-items: center;
          transition: color 0.2s;
        }
        .kl-input-eye:hover { color: #60a5fa; }

        /* Submit button */
        .kl-btn-wrap {
          margin-top: 6px; margin-bottom: 6px;
          animation: scaleIn 0.5s ease both;
          animation-delay: 0.6s;
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        .kl-submit {
          position: relative; overflow: hidden;
          width: 100%; padding: 14px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border: none; border-radius: 12px;
          color: white; font-size: 15px; font-weight: 700;
          font-family: 'Inter', sans-serif;
          cursor: pointer; letter-spacing: 0.3px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(59,130,246,0.4);
        }
        .kl-submit:hover {
          transform: translateY(-1px) scale(1.01);
          box-shadow: 0 8px 30px rgba(59,130,246,0.6);
        }
        .kl-submit:active { transform: scale(0.98); }
        .kl-submit::after {
          content: '';
          position: absolute; top: 0; left: -100%;
          width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          transform: skewX(-20deg);
          animation: shimmer 2.2s ease infinite;
        }
        @keyframes shimmer {
          0%   { left: -100%; }
          60%  { left: 130%; }
          100% { left: 130%; }
        }
        .kl-faculty-btn {
          background: linear-gradient(135deg, #6d28d9, #4c1d95) !important;
          box-shadow: 0 4px 20px rgba(109,40,217,0.4) !important;
        }
        .kl-faculty-btn:hover {
          box-shadow: 0 8px 30px rgba(109,40,217,0.6) !important;
        }

        /* Spinner */
        .kl-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block; vertical-align: middle; margin-right: 8px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Divider */
        .kl-divider {
          display: flex; align-items: center; gap: 12px;
          margin: 20px 0;
          animation: fadeSlideUp 0.5s ease both;
          animation-delay: 0.7s;
        }
        .kl-divider-line {
          flex: 1; height: 1px; background: rgba(255,255,255,0.08);
        }
        .kl-divider-text {
          font-size: 11px; font-weight: 700; letter-spacing: 1px;
          color: rgba(255,255,255,0.25);
          white-space: nowrap;
        }

        /* OAuth buttons */
        .kl-oauth-wrap {
          display: flex; flex-direction: column; gap: 10px;
          animation: fadeSlideUp 0.5s ease both;
          animation-delay: 0.8s;
        }
        .kl-oauth-btn {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          padding: 12px 20px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #e8eaf6; font-size: 14px; font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer; width: 100%; box-sizing: border-box;
          transition: all 0.3s ease;
        }
        .kl-oauth-btn:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(59,130,246,0.4);
          box-shadow: 0 0 15px rgba(59,130,246,0.12);
          transform: translateY(-1px);
        }
        .kl-google-g {
          width: 18px; height: 18px; flex-shrink: 0;
        }

        /* Sign up link */
        .kl-signup {
          text-align: center; margin-top: 20px;
          font-size: 13.5px; color: rgba(255,255,255,0.35);
          animation: fadeSlideUp 0.5s ease both;
          animation-delay: 0.9s;
        }
        .kl-signup-link {
          color: #60a5fa; font-weight: 600; cursor: pointer;
          text-decoration: none; border-bottom: 1px solid transparent;
          transition: border-color 0.2s;
        }
        .kl-signup-link:hover { border-bottom-color: #60a5fa; }

        /* Diagnostic */
        .kl-diag {
          text-align: center; margin-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.04);
          padding-top: 12px;
        }
        .kl-diag-btn {
          background: none; border: none;
          color: rgba(255,255,255,0.08);
          font-size: 10px; cursor: pointer;
          text-decoration: underline;
        }
        .kl-diag-btn:hover { color: rgba(255,255,255,0.2); }

        /* Google login override */
        .kl-google-wrap > div { width: 100% !important; }
        .kl-google-wrap iframe { width: 100% !important; border-radius: 12px !important; }

        @media (max-width: 480px) {
          .kl-card { padding: 28px 20px 22px; }
          .kl-heading { font-size: 1.45rem; }
        }
      `}</style>

      {/* ── Canvas particles ── */}
      <ParticleCanvas />

      {/* ── Aurora ── */}
      <div className="kl-aurora">
        <div className="kl-aurora-wave" />
        <div className="kl-aurora-wave" />
        <div className="kl-aurora-wave" />
      </div>

      {/* ── Nebula orbs ── */}
      {[
        { w: 700, h: 700, top: '-15%', left: '-10%', color: '#3b82f6', dur: '30s', opacity: 0.07 },
        { w: 600, h: 600, top: '20%', right: '-8%', color: '#06b6d4', dur: '38s', opacity: 0.07 },
        { w: 800, h: 800, bottom: '-20%', left: '20%', color: '#8b5cf6', dur: '45s', opacity: 0.06 },
      ].map((n, i) => (
        <div
          key={i}
          className="kl-nebula"
          style={{
            width: n.w, height: n.h,
            top: n.top, left: n.left, right: n.right, bottom: n.bottom,
            background: n.color,
            opacity: n.opacity,
            animationDuration: n.dur,
            animationDelay: `${i * 3}s`,
          }}
        />
      ))}

      {/* ── Small glowing orbs ── */}
      {[
        { size: 12, top: '20%', left: '10%', color: '#3b82f6', dur: '4s' },
        { size: 8, top: '70%', left: '8%', color: '#06b6d4', dur: '5.5s' },
        { size: 14, top: '15%', right: '12%', color: '#8b5cf6', dur: '3.5s' },
        { size: 9, top: '75%', right: '9%', color: '#60a5fa', dur: '6s' },
      ].map((o, i) => (
        <div
          key={i}
          className="kl-orb"
          style={{
            width: o.size, height: o.size,
            top: o.top, left: o.left, right: o.right,
            background: o.color,
            color: o.color,
            boxShadow: `0 0 20px ${o.color}`,
            animationDuration: o.dur,
            animationDelay: `${i * 1.2}s`,
          }}
        />
      ))}

      {/* ── Login Card ── */}
      <div className="kl-root">
        <div className="kl-card-wrapper" ref={cardRef}>
          <div className="kl-border-ring" />
          <div className="kl-card">

            {/* Tab Switcher */}
            <div className="kl-tabs">
              <button
                className={`kl-tab${!isFacultyLogin ? ' active' : ''}`}
                onClick={() => setIsFacultyLogin(false)}
              >Personal</button>
              <button
                className={`kl-tab${isFacultyLogin ? ' active' : ''}`}
                onClick={() => setIsFacultyLogin(true)}
              >Faculty</button>
            </div>

            {/* Logo */}
            <div className="kl-logo-wrap">
              <div className="kl-logo-ring">
                <div className="kl-logo-inner">
                  <span className="kl-logo-text">KR</span>
                </div>
              </div>
            </div>

            {/* Heading */}
            <h1 className="kl-heading">
              Welcome to <span>Kevryn</span>
            </h1>

            {/* Typewriter subtitle */}
            <p className="kl-subtitle">
              {typeText}
              <span className="kl-cursor" />
            </p>

            {/* Form */}
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="kl-input-wrap">
                <input
                  suppressHydrationWarning
                  className="kl-input"
                  type="text"
                  placeholder={isFacultyLogin ? 'Faculty ID / Email' : 'Username'}
                  value={authData.username}
                  onChange={e => setAuthData({ ...authData, username: e.target.value })}
                  required
                />
              </div>

              <div className="kl-input-wrap" style={{ position: 'relative' }}>
                <input
                  suppressHydrationWarning
                  className="kl-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Password"
                  value={authData.password}
                  onChange={e => setAuthData({ ...authData, password: e.target.value })}
                  style={{ paddingRight: '44px' }}
                  required
                />
                <button
                  type="button"
                  className="kl-input-eye"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? <FaEyeSlash size={15} /> : <FaEye size={15} />}
                </button>
              </div>

              <div className="kl-btn-wrap">
                <button
                  type="submit"
                  className={`kl-submit${isFacultyLogin ? ' kl-faculty-btn' : ''}`}
                  disabled={isLoading}
                >
                  {isLoading && <span className="kl-spinner" />}
                  {isLogin
                    ? (isFacultyLogin ? 'Access Dashboard' : 'Enter Studio')
                    : 'Get Started'}
                </button>
              </div>
            </form>

            {/* Divider + OAuth (Personal only) */}
            {!isFacultyLogin && (
              <>
                <div className="kl-divider">
                  <div className="kl-divider-line" />
                  <span className="kl-divider-text">OR CONTINUE WITH</span>
                  <div className="kl-divider-line" />
                </div>

                <div className="kl-oauth-wrap">
                  {/* Google */}
                  <div className="kl-google-wrap" style={{ width: '100%' }}>
                    <GoogleLogin
                      onSuccess={handleGoogleLoginSuccess}
                      onError={() => console.log('Google Login Failed')}
                      theme="filled_black"
                      shape="rectangular"
                      width="100%"
                      text="signin_with"
                    />
                  </div>

                  {/* GitHub */}
                  <button
                    type="button"
                    className="kl-oauth-btn"
                    onClick={() => window.location.href = `${SERVER_URL}/auth/github`}
                  >
                    <FaGithub size={18} />
                    Continue with GitHub
                  </button>
                </div>
              </>
            )}

            {/* Sign Up / Log In toggle */}
            <p className="kl-signup">
              {isLogin ? "Don't have an account? " : 'Already using Kevryn? '}
              <span
                className="kl-signup-link"
                onClick={() => setIsLogin(v => !v)}
              >
                {isLogin ? 'Sign Up' : 'Log In'}
              </span>
            </p>

            {/* Diagnostic */}
            <div className="kl-diag">
              <button className="kl-diag-btn" onClick={runConnectionCheck}>
                Diagnostic Tool
              </button>
            </div>

          </div>{/* .kl-card */}
        </div>{/* .kl-card-wrapper */}
      </div>
    </>
  );
}
