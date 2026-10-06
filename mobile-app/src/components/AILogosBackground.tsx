import { useEffect, useRef } from 'react';

export default function AILogosBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cx = ctx;

    let w = container.clientWidth;
    let h = container.clientHeight;
    
    // Resize Observer for the container
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        w = entry.contentRect.width;
        h = entry.contentRect.height;
        if (w === 0 || h === 0) continue;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
    });
    resizeObserver.observe(container);

    // ====================================
    // FAST MOVING COLOR CLOUDS
    // ====================================
    interface BlobData {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      scale: number;
      vScale: number;
      phase: number;
      phaseSpeed: number;
      type: 'yellow' | 'pink' | 'mix';
    }

    const blobsCount = 5;
    const blobsData: BlobData[] = [];
    
    for (let i = 0; i < blobsCount; i++) {
      const radius = Math.max(300, w * 0.4 + Math.random() * 200);
      // Alternate type:
      // i = 0, 2: 'yellow'
      // i = 1, 3: 'pink'
      // i = 4: 'mix'
      const type = i === 4 ? 'mix' : (i % 2 === 0 ? 'yellow' : 'pink');

      blobsData.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 12.0,
        vy: (Math.random() - 0.5) * 12.0,
        radius,
        scale: 1.0 + Math.random() * 0.4,
        vScale: (Math.random() - 0.5) * 0.01,
        // Color travel transition phase
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.03 + Math.random() * 0.03, // Fast color transition
        type,
      });
    }

    // ====================================
    // PARTICLES
    // ====================================
    const mouse = { x: -9999, y: -9999 };
    let hoveredLogoCenter: { x: number, y: number } | null = null;
    let isHoveringLogo = false;

    // We'll listen to window mousemove to catch events even if pointer-events-none
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;

      // Check if hovering a logo
      const target = e.target as HTMLElement;
      const logoBtn = target.closest('.ai-logo-btn');
      if (logoBtn) {
        const logoRect = logoBtn.getBoundingClientRect();
        hoveredLogoCenter = {
          x: logoRect.left + logoRect.width / 2 - rect.left,
          y: logoRect.top + logoRect.height / 2 - rect.top
        };
        
        if (!isHoveringLogo) {
          // Just entered a logo: trigger an explosion burst!
          triggerExplosion(hoveredLogoCenter.x, hoveredLogoCenter.y);
          isHoveringLogo = true;
        }
      } else {
        hoveredLogoCenter = null;
        isHoveringLogo = false;
      }
    };

    const handleMouseLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
      hoveredLogoCenter = null;
      isHoveringLogo = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      isExplosion?: boolean;
      life?: number;
      maxLife?: number;
    }

    const particles: Particle[] = [];
    // Ambient particles
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * 2000, // initialized across a wide area
        y: Math.random() * 1000,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.8 + 0.2
      });
    }

    function triggerExplosion(x: number, y: number) {
      // Create a burst of fast moving particles
      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 2;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 2.5 + 1,
          alpha: 1,
          isExplosion: true,
          life: 0,
          maxLife: Math.random() * 40 + 30
        });
      }
    }

    let animationId = 0;
    function animate() {
      const isDark = document.documentElement.classList.contains('dark');
      let pink: number[], yellow: number[];
      if (isDark) {
        // Vibrant bright dark mode colors
        pink = [236, 72, 153]; // Pink-500
        yellow = [253, 224, 71]; // Vibrant light yellow (Yellow-300)
      } else {
        // Bright light mode colors
        pink = [255, 160, 200]; // Beautiful soft pink
        yellow = [255, 245, 140]; // Beautiful light yellow
      }

      // Update Blobs
      blobsData.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.scale += b.vScale;
        b.phase += b.phaseSpeed;

        if (b.scale > 1.5) b.vScale = -Math.abs(b.vScale);
        if (b.scale < 0.8) b.vScale = Math.abs(b.vScale);

        // Keep velocity fast and organic
        b.vx += (Math.random() - 0.5) * 0.5;
        b.vy += (Math.random() - 0.5) * 0.5;
        const speed = Math.hypot(b.vx, b.vy);
        const maxSpeed = 12;
        const minSpeed = 5;
        if (speed > maxSpeed) {
          b.vx = (b.vx / speed) * maxSpeed;
          b.vy = (b.vy / speed) * maxSpeed;
        } else if (speed < minSpeed) {
          b.vx = (b.vx / speed) * minSpeed;
          b.vy = (b.vy / speed) * minSpeed;
        }

        const padding = b.radius * b.scale;
        if (b.x < -padding) b.x = w + padding;
        if (b.x > w + padding) b.x = -padding;
        if (b.y < -padding) b.y = h + padding;
        if (b.y > h + padding) b.y = -padding;
      });

      // 1. Draw base morphing gradient of pink and yellow
      const timeSecs = performance.now() * 0.001;
      const bgAngle = timeSecs * 0.4;
      const bx1 = w / 2 + Math.cos(bgAngle) * w;
      const by1 = h / 2 + Math.sin(bgAngle) * h;
      const bx2 = w / 2 - Math.cos(bgAngle) * w;
      const by2 = h / 2 - Math.sin(bgAngle) * h;

      const bgGrad = cx.createLinearGradient(bx1, by1, bx2, by2);
      
      const bgMix1Raw = (Math.sin(timeSecs * 1.0) + 1) / 2;
      const bgMix2Raw = (Math.cos(timeSecs * 0.8) + 1) / 2;
      
      // Bias background mix towards light yellow (0)
      const bgMix1 = Math.pow(bgMix1Raw, 1.8);
      const bgMix2 = Math.pow(bgMix2Raw, 1.8);
      
      const bgC1 = [
        Math.round(pink[0] * bgMix1 + yellow[0] * (1 - bgMix1)),
        Math.round(pink[1] * bgMix1 + yellow[1] * (1 - bgMix1)),
        Math.round(pink[2] * bgMix1 + yellow[2] * (1 - bgMix1))
      ];
      const bgC2 = [
        Math.round(pink[0] * bgMix2 + yellow[0] * (1 - bgMix2)),
        Math.round(pink[1] * bgMix2 + yellow[1] * (1 - bgMix2)),
        Math.round(pink[2] * bgMix2 + yellow[2] * (1 - bgMix2))
      ];

      bgGrad.addColorStop(0, `rgb(${bgC1[0]}, ${bgC1[1]}, ${bgC1[2]})`);
      bgGrad.addColorStop(1, `rgb(${bgC2[0]}, ${bgC2[1]}, ${bgC2[2]})`);
      cx.fillStyle = bgGrad;
      cx.fillRect(0, 0, w, h);

      // 2. Draw Moving blobs on canvas
      blobsData.forEach(b => {
        let t = 0;
        const sinVal = (Math.sin(b.phase) + 1) / 2; // 0 to 1
        
        if (b.type === 'yellow') {
          // Yellow-dominant blobs stay light yellow, oscillating slightly
          t = sinVal * 0.25; // stays in [0, 0.25] range (almost pure Light Yellow)
        } else if (b.type === 'pink') {
          // Pink-dominant blobs stay pink, oscillating slightly
          t = 0.75 + sinVal * 0.25; // stays in [0.75, 1.0] range (almost pure Pink)
        } else {
          // Mix blob spends more time on Yellow
          t = Math.pow(sinVal, 1.8);
        }

        const r = Math.round(pink[0] * t + yellow[0] * (1 - t));
        const g = Math.round(pink[1] * t + yellow[1] * (1 - t));
        const bb = Math.round(pink[2] * t + yellow[2] * (1 - t));

        const rad = b.radius * b.scale;
        const grad = cx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
        const opacity = isDark ? 0.75 : 0.85;

        grad.addColorStop(0, `rgba(${r}, ${g}, ${bb}, ${opacity})`);
        grad.addColorStop(0.3, `rgba(${r}, ${g}, ${bb}, ${opacity * 0.65})`);
        grad.addColorStop(0.65, `rgba(${r}, ${g}, ${bb}, ${opacity * 0.25})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${bb}, 0)`);

        cx.fillStyle = grad;
        cx.beginPath();
        cx.arc(b.x, b.y, rad, 0, Math.PI * 2);
        cx.fill();
      });

      // Update and Draw Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (p.isExplosion) {
          p.x += p.vx;
          p.y += p.vy;
          p.life!++;
          p.alpha = 1 - (p.life! / p.maxLife!);
          
          if (p.life! >= p.maxLife!) {
            particles.splice(i, 1);
            continue;
          }
        } else {
          // Ambient particle behavior
          // Repel from mouse
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            const angle = Math.atan2(dy, dx);
            const force = (120 - dist) / 120;
            p.x -= Math.cos(angle) * force * 4;
            p.y -= Math.sin(angle) * force * 4;
          }

          // If hovering a logo, suck ambient particles towards it slowly to build up energy
          if (hoveredLogoCenter && dist > 120) {
            const ldx = hoveredLogoCenter.x - p.x;
            const ldy = hoveredLogoCenter.y - p.y;
            const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
            if (ldist < 300) {
              p.vx += (ldx / ldist) * 0.02;
              p.vy += (ldy / ldist) * 0.02;
            }
          }

          p.x += p.vx;
          p.y += p.vy;

          // Dampen velocity back to normal
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (speed > 1) {
            p.vx *= 0.95;
            p.vy *= 0.95;
          }

          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
          
          // Wrap around safely
          if (p.x < -50) p.x = w + 50;
          if (p.x > w + 50) p.x = -50;
          if (p.y < -50) p.y = h + 50;
          if (p.y > h + 50) p.y = -50;
        }

        const colorBase = '255, 255, 255'; // Using white for glow
        
        // Glow
        cx.beginPath();
        cx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        cx.fillStyle = `rgba(${colorBase}, ${p.alpha * 0.15})`;
        cx.fill();

        // Dot
        cx.beginPath();
        cx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        cx.fillStyle = `rgba(${colorBase}, ${p.alpha})`;
        cx.fill();
      }

      // Draw Cursor glow if mouse is inside
      if (mouse.x !== -9999) {
        cx.beginPath();
        cx.arc(mouse.x, mouse.y, 90, 0, Math.PI * 2);
        const grad = cx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 90);
        grad.addColorStop(0, 'rgba(255,255,255,0.15)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = grad;
        cx.fill();
      }

      animationId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 overflow-hidden rounded-2xl bg-transparent pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
