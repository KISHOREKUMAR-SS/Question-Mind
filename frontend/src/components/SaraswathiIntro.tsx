import { useEffect, useState, useRef } from 'react';
import { SkipForward } from 'lucide-react';
import audioUrl from '../assets/Saraswathi Devi .mp3';
import bgImageUrl from '../assets/Saraswathi Maa.jpeg';

interface SaraswathiIntroProps {
  onVisualComplete: () => void;
  onAudioComplete: () => void;
}

export default function SaraswathiIntro({ onVisualComplete, onAudioComplete }: SaraswathiIntroProps) {
  const [frameIndex, setFrameIndex] = useState(1);
  const [timeLeft, setTimeLeft] = useState(20);
  const [visualDone, setVisualDone] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<any>(null);
  const frameIntervalRef = useRef<any>(null);

  // Autoplay audio on mount and setup interaction fallback
  useEffect(() => {
    const playAudio = () => {
      if (audioRef.current) {
        audioRef.current.volume = 0.7;
        audioRef.current.play().then(() => {
          // Autoplay worked, clean up listeners
          window.removeEventListener('click', playAudio);
          window.removeEventListener('keydown', playAudio);
        }).catch((err) => {
          console.warn("Autoplay blocked. Waiting for click/keydown:", err);
        });
      }
    };

    playAudio();
    window.addEventListener('click', playAudio);
    window.addEventListener('keydown', playAudio);

    return () => {
      window.removeEventListener('click', playAudio);
      window.removeEventListener('keydown', playAudio);
    };
  }, []);

  // Frame looping (100ms = 10 FPS) and 20-second timer
  useEffect(() => {
    // Frame animation loop
    frameIntervalRef.current = setInterval(() => {
      setFrameIndex((prev) => (prev >= 64 ? 1 : prev + 1));
    }, 100);

    // 20-second countdown for the visual animation
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleVisualFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleVisualFinish = () => {
    setVisualDone(true);
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    onVisualComplete();
  };

  const handleAudioEnded = () => {
    onAudioComplete();
  };

  const currentFrameUrl = new URL(
    `../assets/Sarawathi Maa/ezgif-frame-${String(frameIndex).padStart(3, '0')}.jpg`,
    import.meta.url
  ).href;

  return (
    <div className={`fixed inset-0 z-[9999] w-screen h-screen overflow-hidden transition-opacity duration-1000 bg-[#fff8e1] ${
      visualDone ? 'opacity-0 pointer-events-none' : 'opacity-100'
    }`}>
      {/* Devotional Audio Element - Plays until finished */}
      <audio 
        ref={audioRef} 
        src={audioUrl} 
        loop={false} 
        onEnded={handleAudioEnded}
      />

      {/* Skip Control - White Glass Effect */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={handleVisualFinish}
          className="flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 border border-white/30 text-white rounded-xl font-bold transition-all hover:text-amber-200 active:scale-95 text-sm backdrop-blur-md shadow-lg"
        >
          <span>Skip Intro</span>
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Background Sequence Copy (fills screen with the animation sequence, unblurred) */}
      <img
        src={currentFrameUrl}
        alt="Saraswathi Maa Animation BG"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
      />

      {/* Foreground Sharp Sequence Copy (resizes to fit screen without trimming) */}
      <img
        src={currentFrameUrl}
        alt="Saraswathi Maa Animation"
        className="absolute inset-0 w-full h-full object-contain z-10 select-none pointer-events-none"
      />
    </div>
  );
}
