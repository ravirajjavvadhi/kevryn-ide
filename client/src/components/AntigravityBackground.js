import React, { useRef, useEffect } from 'react';

const AntigravityBackground = () => {
    const canvasRef = useRef(null);
    const mouseRef = useRef({ x: -1000, y: -1000, active: false });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
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
            const particleCount = Math.floor((width * height) / 12000);
            for (let i = 0; i < particleCount; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    size: Math.random() * 2 + 0.5,
                    color: `rgba(139, 92, 246, ${Math.random() * 0.4 + 0.1})`,
                    mass: Math.random() * 0.5 + 0.5
                });
            }

            blobs = [
                { x: width * 0.2, y: height * 0.2, r: 400, vx: 0.1, vy: 0.05, color: 'rgba(139, 92, 246, 0.06)' },
                { x: width * 0.8, y: height * 0.7, r: 500, vx: -0.05, vy: -0.1, color: 'rgba(99, 102, 241, 0.06)' },
                { x: width * 0.5, y: height * 0.5, r: 450, vx: 0.08, vy: -0.05, color: 'rgba(0, 122, 204, 0.04)' }
            ];
        };

        const drawWatermark = (time) => {
            ctx.save();
            ctx.font = 'bold 250px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const shimmer = Math.sin(time * 0.001) * 0.02 + 0.02;

            // Chromatic Abberation / Shimmer Effect
            ctx.strokeStyle = `rgba(139, 92, 246, ${shimmer})`;
            ctx.lineWidth = 4;
            ctx.strokeText('KEVRYN', width / 2 + Math.cos(time * 0.002) * 5, height / 2);

            ctx.strokeStyle = `rgba(99, 102, 241, ${shimmer})`;
            ctx.strokeText('KEVRYN', width / 2 - Math.cos(time * 0.002) * 5, height / 2);

            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, `rgba(139, 92, 246, ${0.03 + shimmer})`);
            grad.addColorStop(1, `rgba(99, 102, 241, ${0.03 + shimmer})`);
            ctx.fillStyle = grad;
            ctx.fillText('KEVRYN', width / 2, height / 2);

            ctx.restore();
        };

        const draw = (time) => {
            ctx.clearRect(0, 0, width, height);

            // 0. Draw Ripples
            ripples = ripples.filter(r => r.life > 0);
            ripples.forEach(r => {
                r.r += 4;
                r.life -= 0.01;
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(139, 92, 246, ${r.life * 0.1})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            // 1. Draw Blobs
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
                // Mouse Gravity
                if (mouseRef.current.active) {
                    const dx = mouseRef.current.x - p.x;
                    const dy = mouseRef.current.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 300) {
                        const force = (300 - dist) / 3000;
                        p.vx += (dx / dist) * force * p.mass;
                        p.vy += (dy / dist) * force * p.mass;
                    }
                }

                p.x += p.vx; p.y += p.vy;
                p.vx *= 0.98; p.vy *= 0.98; // Friction

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
            });

            // 4. Connections
            ctx.lineWidth = 0.5;
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const p1 = particles[i]; const p2 = particles[j];
                    const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
                    if (dist < 100) {
                        ctx.strokeStyle = `rgba(139, 92, 246, ${0.12 - dist / 800})`;
                        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    }
                }
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
};

export default AntigravityBackground;
