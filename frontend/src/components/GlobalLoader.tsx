import { useUiStore } from '../lib/store';

export default function GlobalLoader() {
  const { isGlobalLoading, globalLoadingText } = useUiStore();

  if (!isGlobalLoading) return null;

  const dotCount = 120;
  const goldenAngle = 137.508 * (Math.PI / 180);

  // ─── Moderate-depth brand colors: pink, purple, yellow from theme ────────
  // Not too light, not too saturated — a pleasant mid-tone that reads well
  // on both light and dark glassmorphism backgrounds.
  const colorPairs: [string, string][] = [
    ['#f472b6', '#c084fc'], // pink-400  → purple-400
    ['#e879f9', '#a78bfa'], // fuchsia-400 → violet-400
    ['#c084fc', '#f472b6'], // purple-400 → pink-400
    ['#facc15', '#f472b6'], // yellow-400 → pink-400
    ['#f472b6', '#facc15'], // pink-400  → yellow-400
    ['#a78bfa', '#facc15'], // violet-400 → yellow-400
  ];

  const dots = Array.from({ length: dotCount }).map((_, i) => {
    const baseR = Math.pow(i / dotCount, 0.5);
    const theta = i * goldenAngle;

    const petalCount = 8;
    const rMod = 0.8 + 0.2 * Math.cos(petalCount * theta + baseR * Math.PI * 1.5);
    const r = Math.min(baseR * rMod, 1.0);

    // Cartesian target position (max 160 px radius)
    const maxR = 160;
    const tx = +(r * Math.cos(theta) * maxR).toFixed(2);
    const ty = +(r * Math.sin(theta) * maxR).toFixed(2);

    const [colorFrom, colorTo] = colorPairs[i % colorPairs.length];

    // Staggered timing — pre-warmed so flower is full from frame 1
    const duration = 2.8;
    const delay = (i / dotCount) * duration - duration;

    // Dot size grows with radius: 3 px (center) → 12 px (edge)
    const size = 3 + r * 9;

    // Mid-range opacity — visible but not overwhelming
    const maxOpacity = 0.6 + r * 0.35;

    return { id: i, colorFrom, colorTo, tx, ty, delay, duration, size, maxOpacity };
  });

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center
                 bg-white/25 dark:bg-slate-950/35 backdrop-blur-2xl
                 transition-all duration-500 select-none"
    >
      {/* ── Keyframes ───────────────────────────────────────────────────── */}
      <style>{`
        @keyframes flowerBloom {
          0% {
            transform: translate(calc(-50% + 0px), calc(-50% + 0px)) scale(0.08);
            opacity: 0;
          }
          10% { opacity: var(--dot-max-opacity); }
          65% { opacity: var(--dot-max-opacity); }
          100% {
            transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1);
            opacity: 0;
          }
        }
        @keyframes flowerSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes indicatorPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%      { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>

      {/* ── Flower — slow spin makes it feel alive ───────────────────────── */}
      <div
        className="relative mb-20"
        style={{
          width: '340px',
          height: '340px',
          animation: 'flowerSpin 55s linear infinite',
        }}
      >
        {dots.map((dot) => (
          <div
            key={dot.id}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${dot.colorFrom}, ${dot.colorTo})`,
              animation: `flowerBloom ${dot.duration}s ease-in-out ${dot.delay}s infinite`,
              '--tx': `${dot.tx}px`,
              '--ty': `${dot.ty}px`,
              '--dot-max-opacity': `${dot.maxOpacity}`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* ── Status label ────────────────────────────────────────────────── */}
      <div className="absolute bottom-20 flex flex-col items-center gap-3 px-6 max-w-sm w-[90%] text-center">
        <p className="text-krish-pink dark:text-pink-400 font-bold text-lg sm:text-xl tracking-wide">
          {globalLoadingText || 'Loading'}
        </p>

        {/* Three pulsing dots as a minimal activity indicator */}
        <div className="flex items-center gap-2">
          {[0, 0.25, 0.5].map((d, idx) => (
            <span
              key={idx}
              className="block w-2 h-2 rounded-full bg-krish-pink dark:bg-pink-400"
              style={{
                animation: `indicatorPulse 1.2s ease-in-out ${d}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
