import React, { useRef, useEffect } from 'react';

const AntigravityBackground = React.memo(() => {
    const canvasRef = useRef(null);
    const mouseRef = useRef({ x: -1000, y: -1000, active: false });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false }); // Performance win: Opaque background
        let animationFrameId;
        let particles = [];
        let blobs = [];
        let ripples = [];
        let width, height;

        const resize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        const createElements = () => {
            particles = [];
            const particleCount = Math.floor((width * height) / 10000); // Increased density
            for (let i = 0; i < particleCount; i++) {
                const colorType = Math.random();
                let color;
                if (colorType > 0.7) color = `rgba(139, 92, 246, ${Math.random() * 0.4 + 0.1})`; // Purple
                else if (colorType > 0.4) color = `rgba(59, 130, 246, ${Math.random() * 0.4 + 0.1})`; // Blue
                else color = `rgba(167, 139, 250, ${Math.random() * 0.4 + 0.1})`; // Violet

                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.3,
                    size: Math.random() * 2.5 + 0.5,
                    color: color,
                    mass: Math.random() * 0.6 + 0.4
                });
            }

            blobs = [
                { x: width * 0.1, y: height * 0.1, r: 500, vx: 0.12, vy: 0.08, color: 'rgba(139, 92, 246, 0.08)' },
                { x: width * 0.9, y: height * 0.8, r: 600, vx: -0.06, vy: -0.12, color: 'rgba(59, 130, 246, 0.08)' },
                { x: width * 0.5, y: height * 0.4, r: 550, vx: 0.09, vy: -0.07, color: 'rgba(99, 102, 241, 0.06)' },
                { x: width * 0.3, y: height * 0.7, r: 400, vx: -0.1, vy: 0.1, color: 'rgba(124, 58, 237, 0.05)' }
            ];
        };

        const drawWatermark = (time) => {
            ctx.save();
            ctx.font = 'bold 280px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const shimmer = Math.sin(time * 0.001) * 0.015 + 0.015;

            // Chromatic Abberation / Shimmer Effect
            ctx.strokeStyle = `rgba(139, 92, 246, ${shimmer})`;
            ctx.lineWidth = 2;
            ctx.strokeText('KEVRYN', width / 2 + Math.cos(time * 0.002) * 8, height / 2);

            ctx.strokeStyle = `rgba(59, 130, 246, ${shimmer})`;
            ctx.strokeText('KEVRYN', width / 2 - Math.cos(time * 0.002) * 8, height / 2);

            const grad = ctx.createLinearGradient(0, height * 0.4, 0, height * 0.6);
            grad.addColorStop(0, `rgba(139, 92, 246, ${0.02 + shimmer})`);
            grad.addColorStop(1, `rgba(59, 130, 246, ${0.02 + shimmer})`);
            ctx.fillStyle = grad;
            ctx.fillText('KEVRYN', width / 2, height / 2);

            ctx.restore();
        };

        const draw = (time) => {
            // Dark gradient base for depth
            const backgroundGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.8);
            backgroundGrad.addColorStop(0, '#0f111a');
            backgroundGrad.addColorStop(1, '#05060a');
            ctx.fillStyle = backgroundGrad;
            ctx.fillRect(0, 0, width, height);

            // 0. Draw Ripples
            ripples = ripples.filter(r => r.life > 0);
            ripples.forEach(r => {
                r.r += 3.5;
                r.life -= 0.008;
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(139, 92, 246, ${r.life * 0.15})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });

            // 1. Draw Blobs (The "Misty" background)
            blobs.forEach(b => {
                b.x += b.vx; b.y += b.vy;
                if (b.x < -b.r || b.x > width + b.r) b.vx *= -1;
                if (b.y < -b.r || b.y > height + b.r) b.vy *= -1;
                const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
                g.addColorStop(0, b.color);
                g.addColorStop(1, 'transparent');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fill();
            });

            // 2. Draw Watermark
            drawWatermark(time);

            // 3. Update & Draw Particles
            particles.forEach(p => {
                // Mouse Gravity/Repulsion
                if (mouseRef.current.active) {
                    const dx = mouseRef.current.x - p.x;
                    const dy = mouseRef.current.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 400) {
                        const force = (400 - dist) / 4000;
                        // Floating effect: pull slightly towards mouse but with oscillation
                        p.vx += (dx / dist) * force * p.mass;
                        p.vy += (dy / dist) * force * p.mass;
                    }
                }

                p.x += p.vx; p.y += p.vy;
                p.vx *= 0.97; p.vy *= 0.97; // Slightly less friction for "floaty" feel

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();

                // Add small glow to large particles
                if (p.size > 1.8) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = p.color;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            });

            // 4. Connections (Neural network effect)
            ctx.lineWidth = 0.4;
            const connectionDistSq = 120 * 120;
            for (let i = 0; i < particles.length; i += 2) { // Skip some for perf
                const p1 = particles[i];
                for (let j = i + 1; j < particles.length; j += 4) {
                    const p2 = particles[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < connectionDistSq) {
                        const dist = Math.sqrt(distSq);
                        const opacity = (1 - dist / 120) * 0.15;
                        ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
                        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    }
                }
            }

            // 5. Mouse Interaction Glow & Neural Trail
            if (mouseRef.current.active) {
                const g = ctx.createRadialGradient(mouseRef.current.x, mouseRef.current.y, 0, mouseRef.current.x, mouseRef.current.y, 150);
                g.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
                g.addColorStop(1, 'transparent');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(mouseRef.current.x, mouseRef.current.y, 150, 0, Math.PI * 2);
                ctx.fill();

                // Mouse Neural Trail: Connect nearest particles to mouse
                particles.forEach(p => {
                    const dx = mouseRef.current.x - p.x;
                    const dy = mouseRef.current.y - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < 150 * 150) {
                        const dist = Math.sqrt(distSq);
                        ctx.strokeStyle = `rgba(139, 92, 246, ${(1 - dist / 150) * 0.3})`;
                        ctx.beginPath();
                        ctx.moveTo(mouseRef.current.x, mouseRef.current.y);
                        ctx.lineTo(p.x, p.y);
                        ctx.stroke();
                    }
                });
            }

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
        <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, background: '#08080c', pointerEvents: 'none' }} />
    );
});

export default AntigravityBackground;
