import { useEffect, useRef } from 'react';
import { X, Mic, Square, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LogoMark } from './Logo';

type Entry = { id: number; source: string; translation: string; done: boolean };

// Full-screen live subtitles for talks and meetings: the newest translation large, the one before it dimmed,
// and what was actually said in small type above each.
export function MeetingView({ entries, home, target, listening, connecting, spoken, onToggleMic, onToggleSpoken, onClose }: {
  entries: Entry[]; home: string; target: string; listening: boolean; connecting: boolean; spoken: boolean;
  onToggleMic: () => void; onToggleSpoken: () => void; onClose: () => void;
}) {
  const shown = entries.filter((e) => e.source || e.translation).slice(-2);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    try { el?.requestFullscreen?.().catch(() => {}); } catch { /* fullscreen not allowed */ }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  return (
    <motion.div ref={rootRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col text-white bg-slate-950"
      style={{ background: 'radial-gradient(1000px 600px at 10% 0%, rgba(139,92,246,.22), transparent 60%), radial-gradient(900px 600px at 100% 100%, rgba(34,211,238,.16), transparent 60%), #050816' }}
      role="dialog" aria-label="Meeting mode: live subtitles">
      <header className="flex items-center gap-3 px-5 sm:px-8 py-4">
        <LogoMark className="w-8 h-8" />
        <span className="font-logo text-lg"><b className="font-bold">Sentiment</b> <span className="font-light">Interpreter</span></span>
        <span className="ml-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/15">{home} ⇄ {target}</span>
        {listening && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />LIVE
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onToggleSpoken} aria-label={spoken ? 'Mute the spoken translation' : 'Also speak the translation'}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition">
            {spoken ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Leave meeting mode"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-end px-6 sm:px-16 pb-8 gap-8" aria-live="polite">
        {shown.length === 0 ? (
          <p className="text-center text-2xl sm:text-3xl text-white/40 mb-[18vh]">
            {connecting ? 'Connecting…' : listening ? `Listening… speak ${home} or ${target}` : 'Tap the mic to start live subtitles'}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {shown.map((e, i) => {
              const latest = i === shown.length - 1;
              return (
                <motion.div key={e.id} layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: latest ? 1 : 0.38, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }} className="max-w-6xl">
                  <p className={`text-white/50 ${latest ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg'}`}>{e.source || '…'}</p>
                  <p className={`mt-2 font-semibold leading-tight tracking-tight ${latest ? 'text-4xl sm:text-6xl' : 'text-2xl sm:text-4xl'}`}>
                    {e.translation || (!e.done && <span className="text-white/40">…</span>)}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </main>

      <footer className="flex items-center justify-center pb-6">
        <button type="button" onClick={onToggleMic} disabled={connecting} aria-label={listening ? 'Pause subtitles' : 'Start subtitles'}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition shadow-lg disabled:opacity-60 ${
            listening ? 'bg-rose-500 hover:bg-rose-600' : 'bg-gradient-to-br from-violet-500 via-sky-500 to-cyan-400 hover:scale-105'}`}>
          {connecting ? <Loader2 className="w-7 h-7 animate-spin" /> : listening ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-7 h-7" />}
        </button>
      </footer>
    </motion.div>
  );
}
