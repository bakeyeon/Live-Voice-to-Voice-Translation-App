import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Mic, Square, Loader2, AlertCircle, Keyboard, Volume2, FileText, Send, ArrowLeftRight, Sun, Moon, VolumeX, Presentation, Zap, Gauge, AlignLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Wordmark } from './Logo';
import { MeetingView, openSubtitleWindow } from './MeetingView';

const LANGS = ['English', 'Korean', 'German', 'Japanese', 'Thai', 'Spanish', 'French', 'Italian', 'Portuguese', 'Chinese (Mandarin)', 'Russian', 'Arabic', 'Hindi'];
type Mode = 'voice' | 'text';
type Pace = 'fast' | 'balanced' | 'sentence';
type Entry = { id: number; source: string; translation: string; via: Mode; done: boolean };

function pcmToBase64(f32: Float32Array): string {
  const view = new DataView(new ArrayBuffer(f32.length * 2));
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(view.buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToPcm(base64: string): Float32Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 0x8000;
  return out;
}

const glass = 'bg-white/55 dark:bg-white/[0.04] backdrop-blur-xl border border-white/80 dark:border-white/10 shadow-[0_8px_32px_rgba(15,23,42,0.07)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] rounded-2xl';

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const flip = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* storage unavailable */ }
    setDark(next);
  };
  return (
    <button type="button" onClick={flip} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full border border-white/80 bg-white/60 backdrop-blur-xl text-amber-500 shadow-[0_4px_16px_rgba(15,23,42,0.08)] transition hover:scale-110 dark:border-white/10 dark:bg-white/[0.06] dark:text-cyan-200">
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

function Segmented<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: ReactNode }[];
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 w-14">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-1 p-1 rounded-xl bg-slate-900/5 dark:bg-white/5">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition ${
              value === o.value
                ? 'bg-white text-violet-700 shadow-sm dark:bg-white/15 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}>
            {o.icon}{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [home, setHome] = useState('English');
  const [target, setTarget] = useState('Korean');
  const [input, setInput] = useState<Mode>('voice');
  const [output, setOutput] = useState<Mode>('voice');
  const [pace, setPace] = useState<Pace>(() => {
    try { const p = localStorage.getItem('pace'); if (p === 'fast' || p === 'balanced' || p === 'sentence') return p; } catch { /* storage unavailable */ }
    return 'balanced';
  });
  const [connecting, setConnecting] = useState(false);
  const [listening, setListening] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [meeting, setMeeting] = useState(false);
  const [meetingPip, setMeetingPip] = useState<Window | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wsLangs = useRef('');
  const readyRef = useRef<Promise<WebSocket> | null>(null);
  const playCtx = useRef<AudioContext | null>(null);
  const micCtx = useRef<AudioContext | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const micNode = useRef<ScriptProcessorNode | null>(null);
  const nextStart = useRef(0);
  const outputRef = useRef<Mode>(output);
  const nextId = useRef(1);
  const logEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => { outputRef.current = output; if (output === 'text') stopPlayback(); }, [output]);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [entries]);
  // changing languages or pace starts a fresh session
  useEffect(() => { if (listening) stopMic(); closeSession(); }, [home, target, pace]);
  useEffect(() => { try { localStorage.setItem('pace', pace); } catch { /* storage unavailable */ } }, [pace]);
  useEffect(() => () => { stopMic(); closeSession(); }, []);

  // add to the newest unfinished entry, or start one
  const appendTo = (field: 'source' | 'translation', text: string, via: Mode) => {
    setEntries((list) => {
      const last = list[list.length - 1];
      if (last && !last.done) return [...list.slice(0, -1), { ...last, [field]: last[field] + text }];
      return [...list, { id: nextId.current++, source: '', translation: '', via, done: false, [field]: text }];
    });
  };

  const playChunk = (base64: string) => {
    if (outputRef.current !== 'voice') return;
    if (!playCtx.current) playCtx.current = new AudioContext({ sampleRate: 24000 });
    const ctx = playCtx.current;
    const pcm = base64ToPcm(base64);
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    buf.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (nextStart.current < ctx.currentTime) nextStart.current = ctx.currentTime + 0.05;
    src.start(nextStart.current);
    nextStart.current += buf.duration;
  };
  const stopPlayback = () => {
    if (playCtx.current) { playCtx.current.close(); playCtx.current = null; }
    nextStart.current = 0;
  };

  const closeSession = () => {
    wsRef.current?.close();
    wsRef.current = null;
    readyRef.current = null;
  };

  // one Live session, opened on first use and reused by both voice and text input
  const session = (): Promise<WebSocket> => {
    const langs = `${home}|${target}|${pace}`;
    if (readyRef.current && wsLangs.current === langs && wsRef.current?.readyState === WebSocket.OPEN) return readyRef.current;
    closeSession();
    wsLangs.current = langs;
    setConnecting(true);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/live?home=${encodeURIComponent(home)}&lang=${encodeURIComponent(target)}&pace=${pace}`);
    wsRef.current = ws;
    readyRef.current = new Promise((resolve, reject) => {
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.ready) { setConnecting(false); resolve(ws); }
        if (msg.error) { setError(msg.error); setConnecting(false); setWaiting(false); reject(new Error(msg.error)); }
        if (msg.inText) appendTo('source', msg.inText, 'voice');
        if (msg.outText) appendTo('translation', msg.outText, 'voice');
        if (msg.audio) playChunk(msg.audio);
        if (msg.interrupted) nextStart.current = playCtx.current?.currentTime || 0;
        if (msg.turnComplete) {
          setWaiting(false);
          setEntries((list) => list.map((e, i) => (i === list.length - 1 ? { ...e, done: true } : e)));
        }
      };
      ws.onerror = () => { setError('Connection error'); setConnecting(false); reject(new Error('Connection error')); };
      ws.onclose = () => { if (wsRef.current === ws) { wsRef.current = null; readyRef.current = null; } setConnecting(false); stopMic(); };
    });
    return readyRef.current;
  };

  const startMic = async () => {
    setError(null);
    try {
      if (output === 'voice' && !playCtx.current) playCtx.current = new AudioContext({ sampleRate: 24000 });
      const ws = await session();
      const ctx = new AudioContext({ sampleRate: 16000 });
      micCtx.current = ctx;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = stream;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      micNode.current = node;
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(ctx.destination);
      node.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ audio: pcmToBase64(e.inputBuffer.getChannelData(0)) }));
      };
      setListening(true);
    } catch (err: any) {
      setError(err?.message || 'Could not start the microphone');
      stopMic();
    }
  };
  const stopMic = () => {
    if (micNode.current) { micNode.current.disconnect(); micNode.current = null; }
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    if (micCtx.current) { micCtx.current.close(); micCtx.current = null; }
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ audioEnd: true }));
    setListening(false);
  };

  const sendText = async () => {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    try {
      if (output === 'voice' && !playCtx.current) playCtx.current = new AudioContext({ sampleRate: 24000 });
      const ws = await session();
      setEntries((list) => [...list.map((e) => ({ ...e, done: true })), { id: nextId.current++, source: text, translation: '', via: 'text', done: false }]);
      setWaiting(true);
      ws.send(JSON.stringify({ text }));
      setDraft('');
    } catch (err: any) {
      setError(err?.message || 'Could not send');
    }
  };

  const swap = () => { setHome(target); setTarget(home); };
  const enterMeeting = async () => {
    // open the floating subtitle window first, while the click still counts as a user gesture
    setMeetingPip(await openSubtitleWindow());
    setInput('voice');
    setOutput('text');
    outputRef.current = 'text';
    setEntries((list) => list.map((e) => ({ ...e, done: true })));
    setMeeting(true);
    if (!listening) startMic();
  };
  const leaveMeeting = () => { if (listening) stopMic(); setMeeting(false); setMeetingPip(null); };
  const select = 'w-full p-2.5 rounded-xl bg-white/70 dark:bg-gray-900/60 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400';

  return (
    <div className="min-h-screen text-slate-800 dark:text-white font-sans p-4 sm:p-8 flex flex-col items-center">
      <ThemeToggle />
      <AnimatePresence>
        {meeting && (
          <MeetingView initialPip={meetingPip} entries={entries} home={home} target={target} listening={listening} connecting={connecting}
            spoken={output === 'voice'} onToggleMic={listening ? stopMic : startMic}
            onToggleSpoken={() => setOutput(output === 'voice' ? 'text' : 'voice')} onClose={leaveMeeting} />
        )}
      </AnimatePresence>
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-5">
        <header className="text-center pt-8 sm:pt-2 mb-2">
          <Wordmark />
          <p className="mt-3 text-base sm:text-lg text-slate-500 dark:text-gray-300">Interpreting that keeps the feeling, not just the words.</p>
        </header>

        {/* languages and modes */}
        <section className={`${glass} p-4 sm:p-5 flex flex-col gap-4`}>
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="block mb-1 text-sm font-medium text-violet-700 dark:text-violet-200">My language</span>
              <select value={home} onChange={(e) => setHome(e.target.value)} disabled={listening} className={select}>
                {LANGS.filter((l) => l !== target).map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <button type="button" onClick={swap} disabled={listening} aria-label="Swap languages"
              className="mb-1 w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-violet-600 hover:bg-violet-500/10 dark:text-violet-200 disabled:opacity-40">
              <ArrowLeftRight className="w-5 h-5" />
            </button>
            <label className="flex-1">
              <span className="block mb-1 text-sm font-medium text-violet-700 dark:text-violet-200">Their language</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={listening} className={select}>
                {LANGS.filter((l) => l !== home).map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <Segmented label="Input" value={input} onChange={(v) => { if (listening) stopMic(); setInput(v); }}
            options={[{ value: 'voice', label: 'Voice', icon: <Mic className="w-4 h-4" /> }, { value: 'text', label: 'Text', icon: <Keyboard className="w-4 h-4" /> }]} />
          <Segmented label="Output" value={output} onChange={setOutput}
            options={[{ value: 'voice', label: 'Voice', icon: <Volume2 className="w-4 h-4" /> }, { value: 'text', label: 'Text', icon: <FileText className="w-4 h-4" /> }]} />
          <Segmented label="Pace" value={pace} onChange={setPace}
            options={[{ value: 'fast', label: 'Fast', icon: <Zap className="w-4 h-4" /> }, { value: 'balanced', label: 'Balanced', icon: <Gauge className="w-4 h-4" /> }, { value: 'sentence', label: 'Sentence', icon: <AlignLeft className="w-4 h-4" /> }]} />
          <p className="-mt-2 pl-[4.25rem] text-xs text-slate-500 dark:text-slate-400">
            {pace === 'fast' ? 'Translates at short pauses: quickest, but long sentences may be split.' : pace === 'balanced' ? 'Translates after a brief pause: a good default.' : 'Waits for a full pause: whole sentences, a little slower.'}
          </p>
          <button type="button" onClick={enterMeeting}
            className="mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-500 via-sky-500 to-cyan-500 shadow-[0_6px_20px_rgba(139,92,246,0.25)] hover:brightness-105 transition">
            <Presentation className="w-4 h-4" />Meeting mode: floating live subtitles in {target === 'English' ? home : target}
          </button>
          {/* how to speak so the interpreter keeps up: it translates at each pause, one turn at a time */}
          <div className="rounded-xl px-4 py-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300 bg-violet-50/70 dark:bg-violet-500/10 border border-violet-200/60 dark:border-violet-400/20">
            <p className="font-semibold text-violet-700 dark:text-violet-200 mb-1">💡 Tips for smooth live subtitles</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Speak in short chunks of one or two sentences (about 5 to 10 seconds).</li>
              <li>Pause for about {pace === 'fast' ? 'a quarter of a second' : pace === 'balanced' ? 'half a second' : 'one second'} at the end of each chunk: that pause starts the translation.</li>
              <li>Let the subtitle appear before you go on. Starting the next chunk too soon can cut the previous translation short{pace === 'sentence' ? ', or merge the two' : ''}.</li>
            </ul>
          </div>
        </section>

        {/* conversation */}
        <section className={`${glass} p-4 sm:p-5 min-h-[220px] max-h-[46vh] overflow-y-auto`} aria-live="polite">
          {entries.length === 0 ? (
            <p className="h-[180px] flex items-center justify-center text-center text-slate-400 dark:text-slate-500 text-sm px-6">
              Your conversation will appear here, original above and translation below.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {entries.map((e) => (
                <motion.li key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.05] border border-white/70 dark:border-white/10">
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {e.via === 'voice' ? <Mic className="w-3.5 h-3.5" /> : <Keyboard className="w-3.5 h-3.5" />}
                    {e.source || <span className="italic">listening…</span>}
                  </p>
                  <p className="mt-1.5 text-lg leading-snug text-slate-800 dark:text-white">
                    {e.translation || (!e.done && <span className="inline-flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />translating…</span>)}
                  </p>
                </motion.li>
              ))}
            </ul>
          )}
          <div ref={logEnd} />
        </section>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-start gap-2 p-3 rounded-2xl text-sm text-red-700 dark:text-red-300 bg-red-50/70 dark:bg-red-900/40 backdrop-blur-xl border border-red-300/60 dark:border-red-500/40">
              <AlertCircle className="w-5 h-5 shrink-0" /><span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* input */}
        {input === 'voice' ? (
          <section className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              {listening && (
                <>
                  <motion.div initial={{ scale: 0.8, opacity: 0.5 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-full bg-violet-400 -z-10" />
                  <motion.div initial={{ scale: 0.8, opacity: 0.4 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
                    className="absolute inset-0 rounded-full bg-cyan-300 -z-10" />
                </>
              )}
              <button type="button" onClick={listening ? stopMic : startMic} disabled={connecting}
                aria-label={listening ? 'Stop listening' : 'Start listening'}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-lg disabled:opacity-60 ${
                  listening ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-300/50' : 'bg-gradient-to-br from-violet-500 via-sky-500 to-cyan-400 hover:scale-105 shadow-violet-300/50 dark:shadow-violet-900/50'}`}>
                {connecting ? <Loader2 className="w-9 h-9 animate-spin" /> : listening ? <Square className="w-8 h-8 fill-current" /> : <Mic className="w-9 h-9" />}
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {connecting ? 'Connecting…' : listening ? `Listening — speak ${home} or ${target}` : 'Tap the mic and speak'}
            </p>
          </section>
        ) : (
          <section className={`${glass} p-3 flex items-end gap-2`}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendText(); } }}
              placeholder={`Type in ${home} or ${target}… emoji and ~ count as feeling cues`}
              className="flex-1 resize-none bg-transparent p-2 text-base text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none" />
            <button type="button" onClick={sendText} disabled={!draft.trim() || connecting || waiting} aria-label="Translate"
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-white bg-gradient-to-br from-violet-500 to-cyan-500 disabled:opacity-40 hover:scale-105 transition">
              {connecting || waiting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </section>
        )}

        <footer className="text-center text-xs text-slate-400 dark:text-slate-500 space-y-1 pb-4">
          <p className="flex items-center justify-center gap-1.5">
            {output === 'voice' ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {output === 'voice' ? 'Translations are spoken aloud and written below.' : 'Text only: translations are written, not spoken.'}
          </p>
          <p>Keeps sentiment, formality and friendliness with the SFF rubric · Powered by the Gemini Live API</p>
        </footer>
      </div>
    </div>
  );
}
