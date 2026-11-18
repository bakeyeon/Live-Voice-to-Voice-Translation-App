import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mic, Square, Volume2, VolumeX, Loader2, PictureInPicture2, ArrowDownToLine } from 'lucide-react';
import { motion } from 'motion/react';
import { LogoMark } from './Logo';

type Entry = { id: number; source: string; translation: string; done: boolean };
type Props = {
  entries: Entry[]; home: string; target: string; listening: boolean; connecting: boolean; spoken: boolean;
  onToggleMic: () => void; onToggleSpoken: () => void; onClose: () => void;
};

// Document Picture-in-Picture (Chrome / Edge): a small always-on-top window that can float over slides or a video call.
const pipApi = (): any => (window as any).documentPictureInPicture;

function Captions({ entries, home, target, listening, connecting, spoken, onToggleMic, onToggleSpoken, onClose, popped, onPop }: Props & {
  popped: boolean; onPop: (() => void) | null;
}) {
  const latest = [...entries].reverse().find((e) => e.source || e.translation);
  const btn = 'w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition';
  return (
    <div className={`flex flex-col gap-1.5 text-white ${popped ? 'h-full p-4' : ''}`}>
      <div className="flex items-center gap-2 text-xs">
        <LogoMark className="w-5 h-5" />
        <span className="font-semibold text-white/80">{home} ⇄ {target}</span>
        {listening && <span className="flex items-center gap-1 font-semibold text-rose-300"><span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />LIVE</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={btn} onClick={onToggleMic} disabled={connecting} aria-label={listening ? 'Pause subtitles' : 'Start subtitles'}>
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : listening ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-4 h-4" />}
          </button>
          <button type="button" className={btn} onClick={onToggleSpoken} aria-label={spoken ? 'Mute the spoken translation' : 'Also speak the translation'}>
            {spoken ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          {onPop && (
            <button type="button" className={btn} onClick={onPop} aria-label={popped ? 'Put the subtitles back in the page' : 'Pop out: float the subtitles over other windows'}
              title={popped ? 'Back to the page' : 'Pop out over other windows'}>
              {popped ? <ArrowDownToLine className="w-4 h-4" /> : <PictureInPicture2 className="w-4 h-4" />}
            </button>
          )}
          <button type="button" className={btn} onClick={onClose} aria-label="Close subtitles"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div aria-live="polite" className={popped ? 'flex-1 flex flex-col justify-end' : ''}>
        {latest ? (
          <>
            {/* live subtitles keep the newest words: older lines slide off the top */}
            <div className="overflow-hidden flex flex-col justify-end" style={{ maxHeight: '2.7em', fontSize: popped ? 'clamp(12px, 2.6vw, 20px)' : '15px', lineHeight: 1.35 }}>
              <p className="text-white/55">{latest.source || '…'}</p>
            </div>
            <div className="overflow-hidden flex flex-col justify-end" style={{ maxHeight: '3.45em', fontSize: popped ? 'clamp(18px, 5.2vw, 44px)' : 'clamp(20px, 2.6vw, 32px)', lineHeight: 1.15 }}>
              <p className="font-semibold tracking-tight">{latest.translation || <span className="text-white/40">…</span>}</p>
            </div>
          </>
        ) : (
          <p className="text-white/50 py-2" style={{ fontSize: popped ? 'clamp(14px, 3.5vw, 24px)' : '18px' }}>
            {connecting ? 'Connecting…' : listening ? `Listening… speak ${home} or ${target}` : 'Tap the mic to start live subtitles'}
          </p>
        )}
      </div>
    </div>
  );
}

// Opens the always-on-top subtitle window and brings the page's styles into it. Must be called from a click.
export async function openSubtitleWindow(): Promise<Window | null> {
  if (!pipApi()) return null;
  try {
    const w: Window = await pipApi().requestWindow({ width: 900, height: 170 });
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => w.document.head.appendChild(n.cloneNode(true)));
    w.document.documentElement.classList.add('dark');
    w.document.title = 'Sentiment Interpreter subtitles';
    Object.assign(w.document.body.style, { margin: '0', height: '100vh', background: 'radial-gradient(600px 300px at 0% 0%, rgba(139,92,246,.25), transparent 60%), #070b18' });
    return w;
  } catch (e) {
    console.warn('Picture-in-Picture not available', e);
    return null;
  }
}

// Meeting mode: subtitles in an always-on-top floating window over other apps (Chrome / Edge),
// or a translucent bar at the bottom of the page where that isn't available.
export function MeetingView({ initialPip = null, ...props }: Props & { initialPip?: Window | null }) {
  const [pip, setPip] = useState<Window | null>(initialPip);
  const canPip = !!pipApi();
  // closing the floating window with its own X brings the subtitles back into the page
  useEffect(() => {
    if (!pip) return;
    const back = () => setPip(null);
    pip.addEventListener('pagehide', back);
    return () => pip.removeEventListener('pagehide', back);
  }, [pip]);

  const popOut = async () => { const w = await openSubtitleWindow(); if (w) setPip(w); };
  const popIn = () => { pip?.close(); setPip(null); };
  const close = () => { pip?.close(); setPip(null); props.onClose(); };
  // the window is closed explicitly (close / popIn); no cleanup effect, which React's dev-mode double mount would trigger

  if (pip) {
    return (
      <>
        {createPortal(<Captions {...props} onClose={close} popped onPop={popIn} />, pip.document.body)}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-full text-sm text-white bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-lg">
          <PictureInPicture2 className="w-4 h-4 text-violet-300" />Subtitles are floating in their own window
          <button type="button" onClick={popIn} className="font-semibold text-cyan-300 hover:underline">Bring back</button>
        </motion.div>
      </>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
      role="region" aria-label="Meeting mode: live subtitles"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(960px,calc(100vw-2rem))] px-5 py-3.5 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <Captions {...props} onClose={close} popped={false} onPop={canPip ? popOut : null} />
    </motion.div>
  );
}
