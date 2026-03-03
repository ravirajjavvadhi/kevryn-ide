import React, { useRef, useEffect } from 'react';

const AntigravityBackground = React.memo(() => {
    const canvasRef = useRef(null);
    const mouseRef = useRef({ x: -1000, y: -1000, active: false });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        let animationFrameId;
        let particles = [];
        let blobs = [];
        let ripples = [];
        let width, height;

        // Cinematic Palette
        const COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#ff0080', '#60a5fa'];

        const resize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        const createElements = () => {
            particles = [];
            // Fixed high density beast mode
            const particleCount = 1000;
            for (let i = 0; i < particleCount; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.35,
                    vy: (Math.random() - 0.5) * 0.35,
                    size: Math.random() * 2.2 + 0.6,
                    color: COLORS[Math.floor(Math.random() * COLORS.length)],
                    opacity: Math.random() * 0.5 + 0.1,
                    mass: Math.random() * 0.6 + 0.4
                });
            }

            blobs = [
                { x: width * 0.1, y: height * 0.2, r: 600, vx: 0.15, vy: 0.1, color: 'rgba(139, 92, 246, 0.12)' },
                { x: width * 0.8, y: height * 0.7, r: 700, vx: -0.08, vy: -0.15, color: 'rgba(6, 182, 212, 0.1)' },
                { x: width * 0.5, y: height * 0.4, r: 650, vx: 0.1, vy: -0.09, color: 'rgba(255, 0, 128, 0.08)' },
                { x: width * 0.3, y: height * 0.8, r: 500, vx: -0.12, vy: 0.12, color: 'rgba(59, 130, 246, 0.08)' }
            ];
        };

        const drawBranding = (time) => {
            ctx.save();
            ctx.font = '900 120px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const shimmer = Math.sin(time * 0.001) * 0.02 + 0.02;

            ctx.globalAlpha = 0.03 + shimmer;
            const grad = ctx.createLinearGradient(width / 2 - 200, 0, width / 2 + 200, 0);
            grad.addColorStop(0, '#8b5cf6');
            grad.addColorStop(0.5, '#06b6d4');
            grad.addColorStop(1, '#ff0080');

            ctx.fillStyle = grad;
            ctx.fillText('KEVRYN STUDIO', width / 2, height / 2);

            ctx.strokeStyle = `rgba(255,255,255,${0.02 + shimmer})`;
            ctx.lineWidth = 1;
            ctx.strokeText('KEVRYN STUDIO', width / 2, height / 2);
            ctx.restore();
        };

        const draw = (time) => {
            // Deep space background
            ctx.fillStyle = '#050510';
            ctx.fillRect(0, 0, width, height);

            // 0. Ripples
            ripples = ripples.filter(r => r.life > 0);
            ripples.forEach(r => {
                r.r += 4;
                r.life -= 0.008;
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(6, 182, 212, ${r.life * 0.2})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            // 1. Nebula Blobs
            blobs.forEach(b => {
                b.x += b.vx; b.y += b.vy;
                if (b.x < -b.r || b.x > width + b.r) b.vx *= -1;
                if (b.y < -b.r || b.y > height + b.r) b.vy *= -1;
                const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
                g.addColorStop(0, b.color);
                g.addColorStop(0.5, b.color.replace('0.', '0.05'));
                g.addColorStop(1, 'transparent');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fill();
            });

            // 2. Branding
            drawBranding(time);

            // 3. Particles
            particles.forEach(p => {
                if (mouseRef.current.active) {
                    const dx = mouseRef.current.x - p.x;
                    const dy = mouseRef.current.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 400) {
                        const force = (400 - dist) / 5000;
                        p.vx += (dx / dist) * force * p.mass;
                        p.vy += (dy / dist) * force * p.mass;
                    }
                }

                p.x += p.vx; p.y += p.vy;
                p.vx *= 0.98; p.vy *= 0.98;

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.globalAlpha = p.opacity;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();

                if (p.size > 1.8) {
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = p.color;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            });

            // 4. Energy Connections
            ctx.lineWidth = 0.5;
            const connectionDistSq = 140 * 140;
            for (let i = 0; i < particles.length; i += 3) {
                const p1 = particles[i];
                for (let j = i + 1; j < particles.length; j += 15) {
                    const p2 = particles[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < connectionDistSq) {
                        const dist = Math.sqrt(distSq);
                        ctx.globalAlpha = (1 - dist / 140) * 0.2;
                        ctx.strokeStyle = p1.color;
                        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1;

            animationFrameId = requestAnimationFrame(draw);
        };

        const handleMouseMove = (e) => {
            mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
        };
        const handleMouseDown = (e) => {
            ripples.push({ x: e.clientX, y: e.clientY, r: 0, life: 1 });
        };

        window.addEventListener('resize', () => { resize(); createElements(); });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        resize(); createElements(); draw(0);

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1, background: '#050510', pointerEvents: 'none' }} />
    );
});

export default AntigravityBackground;
