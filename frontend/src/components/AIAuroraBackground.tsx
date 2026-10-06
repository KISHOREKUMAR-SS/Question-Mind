import { useEffect, useRef } from 'react';

export default function AIAuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const c = canvas;
    const cx = ctx;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let time = 0;
    let lastTime = performance.now();

    let mouseX = -9999;
    let mouseY = -9999;

    let centerX = 0;
    let centerY = 0;

    const gap = 22;
    const particles: { ox: number; oy: number; x: number; y: number; vx: number; vy: number }[] = [];
    const blobs: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      tx: number;
      ty: number;
      nextMoveAt: number;
      radius: number;
      opacity: number;
      driftSeed: number;
    }[] = [];

    const PINK = [255, 52, 190];
    const PINK_SOFT = [255, 126, 214];
    const YELLOW_DOT = [220, 168, 0];
    const YELLOW_DOT_SOFT = [255, 216, 62];
    const YELLOW_BG = [255, 224, 92];
    const YELLOW_BG_SOFT = [255, 239, 140];

    const DARK_PINK = [219, 39, 119];
    const DARK_PINK_SOFT = [244, 114, 182];
    const DARK_YELLOW = [202, 138, 4];
    const DARK_YELLOW_SOFT = [250, 204, 21];

    let colorMix = 0; 
    let targetColorMix = 0;
    let nextColorSwitchTime = 0;

    function clamp(v: number, min: number, max: number) {
      return Math.max(min, Math.min(max, v));
    }

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function rgba(colorArr: number[], a: number) {
      return `rgba(${colorArr[0]}, ${colorArr[1]}, ${colorArr[2]}, ${a})`;
    }

    function mixColors(c1: number[], c2: number[], t: number) {
      return [
        Math.round(lerp(c1[0], c2[0], t)),
        Math.round(lerp(c1[1], c2[1], t)),
        Math.round(lerp(c1[2], c2[2], t)),
      ];
    }

    function rand(min: number, max: number) {
      return min + Math.random() * (max - min);
    }

    function buildParticles() {
      particles.length = 0;
      for (let x = 0; x <= w + gap; x += gap) {
        for (let y = 0; y <= h + gap; y += gap) {
          particles.push({
            ox: x,
            oy: y,
            x,
            y,
            vx: 0,
            vy: 0,
          });
        }
      }
    }

    function pickEdgeTarget() {
      return { x: rand(0, w), y: rand(0, h) };
    }

    function buildBlobs() {
      blobs.length = 0;
      for (let i = 0; i < 5; i++) {
        const t = pickEdgeTarget();
        blobs.push({
          x: t.x,
          y: t.y,
          vx: rand(-0.25, 0.25),
          vy: rand(-0.25, 0.25),
          tx: t.x,
          ty: t.y,
          nextMoveAt: performance.now() + rand(800, 2000),
          radius: rand(150, 300),
          opacity: rand(0.55, 0.8),
          driftSeed: Math.random() * 1000,
        });
      }
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = entry.contentRect.width;
        h = entry.contentRect.height;
        if (w === 0 || h === 0) continue;

        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
        c.style.width = '100%';
        c.style.height = '100%';

        cx.setTransform(dpr, 0, 0, dpr, 0, 0);

        centerX = w / 2;
        centerY = h / 2;

        buildParticles();
        buildBlobs();
      }
    });

    if (c.parentElement) {
      resizeObserver.observe(c.parentElement);
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = c.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    function drawBackground() {
      const bg = cx.createLinearGradient(0, 0, w, h);
      
      const pColor1 = [255, 196, 226]; 
      const yColor1 = [255, 235, 172]; 
      const pColor2 = [255, 214, 236];
      const yColor2 = [255, 245, 202];
      
      const currentC1 = mixColors(pColor1, yColor1, colorMix);
      const currentC2 = mixColors(pColor2, yColor2, colorMix);
      
      bg.addColorStop(0, rgba(currentC1, 1.0));
      bg.addColorStop(1, rgba(currentC2, 1.0));
      
      cx.fillStyle = bg;
      cx.fillRect(0, 0, w, h);
    }

    function updateBlobs(now: number) {
      for (const b of blobs) {
        if (now > b.nextMoveAt || Math.hypot(b.x - b.tx, b.y - b.ty) < 50) {
          const t = pickEdgeTarget();
          b.tx = t.x;
          b.ty = t.y;
          b.nextMoveAt = now + rand(500, 1200);
        }

        b.vx += (b.tx - b.x) * 0.006;
        b.vy += (b.ty - b.y) * 0.006;

        b.vx += Math.sin(time * 1.35 + b.driftSeed) * 0.002;
        b.vy += Math.cos(time * 1.28 + b.driftSeed) * 0.002;

        b.vx = clamp(b.vx, -2.5, 2.5);
        b.vy = clamp(b.vy, -2.5, 2.5);

        b.x += b.vx * 4.5;
        b.y += b.vy * 4.5;

        b.vx *= 0.92;
        b.vy *= 0.92;

        if (b.x < -150) b.x = w + 150;
        if (b.x > w + 150) b.x = -150;
        if (b.y < -150) b.y = h + 150;
        if (b.y > h + 150) b.y = -150;
      }
    }

    function drawBlobs() {
      const activePink = mixColors(PINK, PINK_SOFT, 0.2);
      const activeYellow = mixColors(YELLOW_BG, YELLOW_BG_SOFT, 0.1);
      const currentColor = mixColors(activePink, activeYellow, colorMix);

      for (const b of blobs) {
        const pulse = 0.82 + 0.18 * Math.sin(time * 1.4 + b.driftSeed);
        const currentOpacity = b.opacity * pulse;

        if (currentOpacity <= 0.01) continue;

        const speed = clamp(Math.hypot(b.vx, b.vy) / 1.5, 0, 1);
        const boost = 1 + speed * 0.35;

        const coreBoost = 0.6 + speed * 0.4;
        const sideBoost = 0.2 + speed * 0.2;

        const gx = b.x;
        const gy = b.y;
        const g = cx.createRadialGradient(gx, gy, 0, gx, gy, b.radius * boost);
        g.addColorStop(0, rgba(currentColor, currentOpacity * coreBoost));
        g.addColorStop(0.25, rgba(currentColor, currentOpacity * 0.7));
        g.addColorStop(0.55, rgba(currentColor, currentOpacity * sideBoost));
        g.addColorStop(1, rgba(currentColor, 0));

        cx.fillStyle = g;
        cx.fillRect(0, 0, w, h);
      }
    }

    function drawParticles() {
      const hoverRadius = 120;
      const N = particles.length;

      for (let i = 0; i < N; i++) {
        const p = particles[i];

        const waveX = Math.sin(p.oy * 0.01 + time * 1.05) * 8;
        const waveY = Math.cos(p.ox * 0.008 + time * 1.18) * 9;

        const tx = p.ox + waveX;
        const ty = p.oy + waveY;
        p.vx += (tx - p.x) * 0.055;
        p.vy += (ty - p.y) * 0.055;

        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < hoverRadius) {
          const force = (hoverRadius - dist) / hoverRadius;
          const ang = Math.atan2(dy, dx);

          const push = force * 4.2;
          p.vx += Math.cos(ang) * push;
          p.vy += Math.sin(ang) * push;

          p.x += Math.cos(ang) * force * 6;
          p.y += Math.sin(ang) * force * 6;
        }

        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x += p.vx;
        p.y += p.vy;

        const drawX = p.x;
        const drawY = p.y;
        let radius = 1.45;
        let alpha = 0.16;

        if (dist < hoverRadius) {
          const force = (hoverRadius - dist) / hoverRadius;
          const petal = Math.sin(dist * 0.18 - time * 6.5);
          radius += force * 0.4 + Math.abs(petal) * 0.12;
          alpha += force * 0.45 + Math.abs(petal) * 0.08;
        }

        const mix = (Math.sin(p.ox * 0.003 + p.oy * 0.002 + time * 0.8) + 1) / 2;
        const c = mix > 0.5 ? DARK_PINK : DARK_YELLOW;

        const finalAlpha = alpha * 1.2;

        if (finalAlpha <= 0.01) continue;

        cx.fillStyle = c === DARK_PINK
          ? rgba(DARK_PINK_SOFT, finalAlpha * 0.35)
          : rgba(DARK_YELLOW_SOFT, finalAlpha * 0.38);

        cx.beginPath();
        cx.arc(drawX, drawY, radius + 0.6, 0, Math.PI * 2);
        cx.fill();

        cx.fillStyle = rgba(c, finalAlpha);
        cx.beginPath();
        cx.arc(drawX, drawY, radius, 0, Math.PI * 2);
        cx.fill();
      }
    }

    let animationId = 0;
    function animate(now: number) {
      const dt = Math.min(32, now - lastTime) / 16.67;
      lastTime = now;
      time += 0.0175 * dt;

      if (now > nextColorSwitchTime) {
        targetColorMix = targetColorMix === 0 ? 1 : 0;
        nextColorSwitchTime = now + rand(4000, 7000);
      }
      colorMix += (targetColorMix - colorMix) * 0.012;

      drawBackground();
      updateBlobs(now);
      drawBlobs();
      drawParticles();

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
}
