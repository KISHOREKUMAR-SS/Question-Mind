import { useEffect, useRef } from 'react';

interface AuroraBackgroundProps {
  isConnected: boolean;
}

export default function AuroraBackground({ isConnected }: AuroraBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isConnectedRef = useRef(isConnected);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use non-nullable const variables for TS type narrowing inside closure functions
    const c = canvas;
    const cx = ctx;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let time = 0;
    let lastTime = performance.now();

    let mouseX = -9999;
    let mouseY = -9999;

    let isBlooming = false;
    let bloomStartTime = 0;

    // Center point
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

    // Synchronized color morph state
    let colorMix = 0; // 0 = Pink, 1 = Yellow
    let targetColorMix = 0;
    let nextColorSwitchTime = 0;

    function easeOutCubic(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }

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
      // Pick targets in the bottom 65% of the screen so they remain visible below the top fade
      const minY = h * 0.35;
      const side = Math.floor(Math.random() * 3);

      if (side === 0) { // Left side
        return { x: rand(20, w * 0.35), y: rand(minY, h - 20) };
      } else if (side === 1) { // Right side
        return { x: rand(w * 0.65, w - 20), y: rand(minY, h - 20) };
      } else { // Bottom center
        return { x: rand(w * 0.35, w * 0.65), y: rand(minY, h - 20) };
      }
    }

    function buildBlobs() {
      blobs.length = 0;
      for (let i = 0; i < 8; i++) {
        const t = pickEdgeTarget();
        blobs.push({
          x: t.x,
          y: t.y,
          vx: rand(-0.25, 0.25),
          vy: rand(-0.25, 0.25),
          tx: t.x,
          ty: t.y,
          nextMoveAt: performance.now() + rand(800, 2000),
          radius: rand(280, 480),
          opacity: rand(0.55, 0.78),
          driftSeed: Math.random() * 1000,
        });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;

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

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      if (isBlooming) return;
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    function drawBackground() {
      const bg = cx.createLinearGradient(0, 0, w, h);
      
      const pColor1 = [255, 196, 226]; // Soft Pink
      const yColor1 = [255, 235, 172]; // Soft Yellow
      const pColor2 = [255, 214, 236];
      const yColor2 = [255, 245, 202];
      
      const currentC1 = mixColors(pColor1, yColor1, colorMix);
      const currentC2 = mixColors(pColor2, yColor2, colorMix);
      
      bg.addColorStop(0, rgba(currentC1, 1.0));
      bg.addColorStop(1, rgba(currentC2, 1.0));
      
      cx.fillStyle = bg;
      cx.fillRect(0, 0, w, h);
    }

    function updateBlobs(now: number, bloomProgress: number) {
      for (const b of blobs) {
        if (isBlooming) {
          const bDx = b.x - centerX;
          const bDy = b.y - centerY;
          const bAng = Math.atan2(bDx, bDy);
          b.x += Math.cos(bAng) * bloomProgress * 18;
          b.y += Math.sin(bAng) * bloomProgress * 18;
          continue;
        }

        if (now > b.nextMoveAt || Math.hypot(b.x - b.tx, b.y - b.ty) < 100) {
          const t = pickEdgeTarget();
          b.tx = t.x;
          b.ty = t.y;
          b.nextMoveAt = now + rand(500, 1200);
        }

        // Speed up color traversal significantly
        b.vx += (b.tx - b.x) * 0.006;
        b.vy += (b.ty - b.y) * 0.006;

        b.vx += Math.sin(time * 1.35 + b.driftSeed) * 0.002;
        b.vy += Math.cos(time * 1.28 + b.driftSeed) * 0.002;

        b.vx = clamp(b.vx, -3.5, 3.5);
        b.vy = clamp(b.vy, -3.5, 3.5);

        b.x += b.vx * 6.5;
        b.y += b.vy * 6.5;

        b.vx *= 0.92;
        b.vy *= 0.92;

        if (b.x < -300) b.x = w + 300;
        if (b.x > w + 300) b.x = -300;
        if (b.y < -300) b.y = h + 300;
        if (b.y > h + 300) b.y = -300;
      }
    }

    function drawBlobs(bloomProgress: number) {
      const activePink = mixColors(PINK, PINK_SOFT, 0.2);
      const activeYellow = mixColors(YELLOW_BG, YELLOW_BG_SOFT, 0.1);
      const currentColor = mixColors(activePink, activeYellow, colorMix);

      for (const b of blobs) {
        const pulse = 0.82 + 0.18 * Math.sin(time * 1.4 + b.driftSeed);
        
        const alphaModifier = isBlooming ? (1 - bloomProgress) : 1;
        const currentOpacity = b.opacity * pulse * alphaModifier;

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



    function drawBloomFlower(bloomProgress: number) {
      if (!isBlooming) return;

      const maxDimension = Math.max(w, h);

      // Layer 1: Outer Petal (Pink-skewed)
      const r1 = easeOutCubic(bloomProgress) * maxDimension * 1.6;
      const a1 = 0.85 * (1 - bloomProgress);
      const g1 = cx.createRadialGradient(centerX, centerY, 0, centerX, centerY, r1);
      g1.addColorStop(0, rgba(PINK, a1 * 0.95));
      g1.addColorStop(0.3, rgba(PINK_SOFT, a1 * 0.75));
      g1.addColorStop(0.65, rgba(PINK_SOFT, a1 * 0.25));
      g1.addColorStop(1, rgba(PINK, 0));
      cx.fillStyle = g1;
      cx.fillRect(0, 0, w, h);

      // Layer 2: Middle Petal (Yellow-skewed)
      const r2 = easeOutCubic(bloomProgress) * maxDimension * 1.1;
      const a2 = 0.95 * (1 - bloomProgress);
      const g2 = cx.createRadialGradient(centerX, centerY, 0, centerX, centerY, r2);
      g2.addColorStop(0, rgba(YELLOW_BG, a2 * 0.95));
      g2.addColorStop(0.4, rgba(YELLOW_BG_SOFT, a2 * 0.6));
      g2.addColorStop(1, rgba(YELLOW_BG, 0));
      cx.fillStyle = g2;
      cx.fillRect(0, 0, w, h);

      // Layer 3: Core Petal (Vibrant Mixed Core)
      const r3 = easeOutCubic(bloomProgress) * maxDimension * 0.7;
      const a3 = 1.0 * (1 - bloomProgress);
      const g3 = cx.createRadialGradient(centerX, centerY, 0, centerX, centerY, r3);
      const coreColor = mixColors(PINK, YELLOW_DOT, 0.4);
      g3.addColorStop(0, rgba(coreColor, a3));
      g3.addColorStop(0.55, rgba(PINK, a3 * 0.5));
      g3.addColorStop(1, rgba(PINK, 0));
      cx.fillStyle = g3;
      cx.fillRect(0, 0, w, h);
    }

    function drawParticles(bloomProgress: number) {
      const hoverRadius = 160;
      const N = particles.length;

      for (let i = 0; i < N; i++) {
        const p = particles[i];

        const waveX = Math.sin(p.oy * 0.01 + time * 1.05) * 8;
        const waveY = Math.cos(p.ox * 0.008 + time * 1.18) * 9;

        if (isBlooming) {
          // Reset velocities to prevent ambient physics interference
          p.vx = 0;
          p.vy = 0;

          // Dampen ambient floating wave to 0 as explosion starts
          const startX = p.ox + waveX * (1 - bloomProgress);
          const startY = p.oy + waveY * (1 - bloomProgress);

          // Get vector from center to original position
          const pDx = (startX - centerX) || (Math.random() - 0.5);
          const pDy = (startY - centerY) || (Math.random() - 0.5);
          const originalDist = Math.hypot(pDx, pDy);
          const pAng = Math.atan2(pDy, pDx);

          // Smooth quadratic expansion progress
          const easeProgress = 1 - Math.pow(1 - bloomProgress, 2);
          
          // Every particle expands radially outward from center
          const maxExpansion = Math.max(w, h) * 0.95;
          const currentDist = originalDist + easeProgress * maxExpansion;

          // Gentle rotation swirl as it expands outward
          const rotation = easeProgress * 0.35;
          const currentAngle = pAng + rotation;

          p.x = centerX + Math.cos(currentAngle) * currentDist;
          p.y = centerY + Math.sin(currentAngle) * currentDist;
        } else {
          // Normal ambient floating behavior
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
        }

        const drawX = p.x;
        const drawY = p.y;
        let radius = 1.45;
        let alpha = 0.16;

        if (isBlooming) {
          // Swell the dots slightly in the middle of the splash to enhance visibility, then shrink
          radius = 1.45 + Math.sin(bloomProgress * Math.PI) * 0.8;
        }

        if (!isBlooming) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < hoverRadius) {
            const force = (hoverRadius - dist) / hoverRadius;
            const petal = Math.sin(dist * 0.18 - time * 6.5);
            radius += force * 0.4 + Math.abs(petal) * 0.12;
            alpha += force * 0.45 + Math.abs(petal) * 0.08;
          }
        }

        const mix = (Math.sin(p.ox * 0.003 + p.oy * 0.002 + time * 0.8) + 1) / 2;
        const c = mix > 0.5 ? DARK_PINK : DARK_YELLOW;

        const edge = Math.max(
          Math.abs(drawX - w * 0.5) / (w * 0.5),
          Math.abs(drawY - h * 0.5) / (h * 0.5)
        );

        const visibilityBoost = 0.85 + clamp(edge, 0, 1) * 0.45;
        
        let alphaModifier = 1;
        if (isBlooming) {
          // Grow bright during the splash and then fade out smoothly
          const alphaFade = 1 - bloomProgress * bloomProgress;
          alphaModifier = (1 + Math.sin(bloomProgress * Math.PI) * 5.0) * alphaFade;
        }
        const finalAlpha = alpha * visibilityBoost * alphaModifier;

        if (finalAlpha <= 0.01) continue;

        // Draw soft ambient halo
        cx.fillStyle = c === DARK_PINK
          ? rgba(DARK_PINK_SOFT, finalAlpha * 0.35)
          : rgba(DARK_YELLOW_SOFT, finalAlpha * 0.38);

        cx.beginPath();
        cx.arc(drawX, drawY, radius + 0.6, 0, Math.PI * 2);
        cx.fill();

        // Draw crisp core dot
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

      // Check if connect signal was fired
      if (isConnectedRef.current && !isBlooming) {
        isBlooming = true;
        bloomStartTime = now;
        mouseX = -9999;
        mouseY = -9999;
      }

      // Smooth color morph cycle
      if (now > nextColorSwitchTime) {
        targetColorMix = targetColorMix === 0 ? 1 : 0;
        nextColorSwitchTime = now + rand(4000, 7000);
      }
      colorMix += (targetColorMix - colorMix) * 0.012;

      // Bloom progress (slowed down to 3.5s for a highly visible, majestic slow-motion splash)
      const bloomProgress = isBlooming ? clamp((now - bloomStartTime) / 3500, 0, 1) : 0;

      drawBackground();
      updateBlobs(now, bloomProgress);
      drawBlobs(bloomProgress);
      
      // Draw background bloom flower petals before particles
      drawBloomFlower(bloomProgress);

      // Draw particles on top of background/blobs/flower, but BEFORE the top fade mask
      // so they are covered/faded out at the top in normal mode (leaving the logo clean)
      drawParticles(bloomProgress);

      // Smooth vertical fade mask at the top (matches Gemini screenshot look)
      const isDark = document.documentElement.classList.contains('dark');
      const fadeColor = isDark ? '15, 23, 42' : '255, 255, 255'; // slate-900 or white

      if (!isBlooming) {
        const fadeHeight = h * 0.75; // Fade over top 75%
        const grad = cx.createLinearGradient(0, 0, 0, fadeHeight);
        
        // Solid for the top part (covers the logo completely)
        grad.addColorStop(0, `rgba(${fadeColor}, 1)`);
        grad.addColorStop(0.35, `rgba(${fadeColor}, 1)`);
        
        // Smooth transition to transparent at the bottom
        grad.addColorStop(1, `rgba(${fadeColor}, 0)`);
        
        cx.fillStyle = grad;
        cx.fillRect(0, 0, w, fadeHeight);
      } else {
        // Fade out the mask during the connect bloom
        const alpha = Math.max(0, 1 - bloomProgress * 1.5); // Fade out slightly faster than the bloom
        if (alpha > 0) {
          const fadeHeight = h * 0.75;
          const grad = cx.createLinearGradient(0, 0, 0, fadeHeight);
          grad.addColorStop(0, `rgba(${fadeColor}, ${alpha})`);
          grad.addColorStop(0.35, `rgba(${fadeColor}, ${alpha})`);
          grad.addColorStop(1, `rgba(${fadeColor}, 0)`);
          
          cx.fillStyle = grad;
          cx.fillRect(0, 0, w, fadeHeight);
        }
      }

      if (isBlooming && bloomProgress >= 1.0) {
        return;
      }

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
}
