// Records Sentiment Interpreter at phone size for the demo, into demo/raw/ (screencast frames + events.json).
// The app's /live WebSocket is answered from demo/cache/ (real Gemini Live responses saved by prefetch.mjs),
// so every take is identical. The speaker's speech and the interpreter's voice are logged as audio clips
// for compose.py to mix in.
// Needs the app running (npm run dev, or APP_URL) and demo/tts.py + demo/prefetch.mjs run first.
// Usage: node demo/record.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const W = 390, H = 844, SCALE = 2;
const OUT = 'demo/raw';
const DUR = JSON.parse(fs.readFileSync('demo/voice/durations.json', 'utf8'));
const cache = (id) => JSON.parse(fs.readFileSync(`demo/cache/${id}.json`, 'utf8'));
const wavSeconds = (f) => { const b = fs.readFileSync(f); return (b.length - 44) / b.readUInt32LE(28); };
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/frames`, { recursive: true });

const browser = await chromium.launch({
  args: ['--force-device-scale-factor=2', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, permissions: ['microphone'] });
await ctx.addInitScript(() => {
  try { localStorage.setItem('theme', 'light'); localStorage.setItem('pace', 'balanced'); } catch {}
  // no floating window in the recording: meeting mode shows its in-page subtitle bar
  try { Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true }); } catch {}
});

const page = await ctx.newPage();
const events = [];
let t0 = Date.now();
const log = (type, extra = {}) => events.push({ type, t: (Date.now() - t0) / 1000, ...extra });
const sleep = (ms) => page.waitForTimeout(ms);

// ---------- the mocked interpreter ----------
const voiceQueue = [];          // voice scenes waiting for the microphone to start
let replayDone = Promise.resolve();
await page.routeWebSocket(/\/live/, (ws) => {
  ws.send(JSON.stringify({ ready: true }));
  let micScene = null;
  const replay = (id, sourceClip) => {
    const c = cache(id);
    if (sourceClip) log('clip', { file: sourceClip, gain: 0.9 });
    const spoken = c.scene.text && fs.existsSync(`demo/cache/${id}.wav`);
    if (spoken && c.firstAudio != null) setTimeout(() => log('clip', { file: `demo/cache/${id}.wav`, gain: 1.0 }), c.firstAudio * 1000);
    let last = 0;
    for (const m of c.messages) {
      if (m.audio) continue;            // audio is mixed into the video, not played in the page
      const { dt, ...msg } = m;
      last = Math.max(last, dt);
      setTimeout(() => { try { ws.send(JSON.stringify(msg)); } catch {} }, dt * 1000);
    }
    const audioEnd = spoken ? (c.firstAudio || 0) + wavSeconds(`demo/cache/${id}.wav`) : 0;
    replayDone = new Promise((r) => setTimeout(r, Math.max(last, audioEnd) * 1000 + 300));
    log('replay', { id });
  };
  ws.onMessage((data) => {
    const m = JSON.parse(String(data));
    if (m.text) {
      const id = ['text-warm'].find((k) => cache(k).scene.text === m.text);
      if (id) replay(id);
    } else if (m.audio && !micScene && voiceQueue.length) {
      micScene = voiceQueue.shift();
      replay(micScene.id, micScene.clip);
    } else if (m.audioEnd) {
      micScene = null;
    }
  });
});

// ---------- screencast at 2x ----------
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async (f) => {
  const file = `${OUT}/frames/${String(frames.length).padStart(6, '0')}.jpg`;
  frames.push({ file, ts: f.metadata.timestamp });
  fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
t0 = Date.now();

await page.goto(APP_URL);
await page.waitForSelector('text=Sentiment');
await page.addStyleTag({ content: `
  .demo-tap { position: fixed; z-index: 100000; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; pointer-events: none;
    background: rgba(139,92,246,.25); border: 2px solid rgba(124,58,237,.5); animation: demo-tap .6s ease-out forwards; }
  @keyframes demo-tap { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
  html { scroll-behavior: smooth; }
`});

// ---------- helpers ----------
let voiceEnd = 0;
const settle = async (gap = 350) => { const left = voiceEnd + gap - Date.now(); if (left > 0) await sleep(left); };
const say = async (id) => { await settle(); log('voice', { id }); voiceEnd = Date.now() + DUR[id] * 1000; };
const card = (id, extra = {}) => log('card', { id, ...extra });
const hold = async (ms) => { const until = Math.max(Date.now() + ms, voiceEnd + 300); await sleep(until - Date.now()); };
const ripple = (x, y) => page.evaluate(([x, y]) => {
  const d = document.createElement('div'); d.className = 'demo-tap'; d.style.left = x + 'px'; d.style.top = y + 'px';
  document.body.append(d); setTimeout(() => d.remove(), 700);
}, [x, y]);
const tap = async (loc) => {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  await sleep(300);
  log('tap');
  await ripple(b.x + b.width / 2, b.y + b.height / 2);
  await loc.tap();
};
const scrollTo = async (y) => { await page.evaluate(v => scrollTo(0, v), y); await sleep(900); };
const scrollToBottom = async () => { await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await sleep(900); };
const scrollToEl = async (loc, offset) => {
  const y = await loc.evaluate((e, o) => e.getBoundingClientRect().top + scrollY - o, offset);
  await scrollTo(y);
};
const radio = (group, name) => page.getByRole('radiogroup', { name: group }).getByRole('radio', { name });

// ---------- intro ----------
await sleep(600);
card('intro');
await say('intro1');
await hold(800);
await scrollToEl(page.getByRole('radiogroup', { name: 'Input' }), 230);
await say('intro2');
await hold(600);

// ---------- 1. typing → spoken Korean ----------
card('text');
await tap(radio('Input', 'Text'));
await sleep(400);
await scrollToBottom();
await say('text');
const box = page.getByPlaceholder(/Type in/);
await tap(box);
await page.keyboard.type("Aww thank you so much~ you're the best 😊", { delay: 70 });
await settle(200);
await tap(page.getByRole('button', { name: 'Translate' }));
log('send');
await sleep(500);
await replayDone;
card('feeling');
await scrollToBottom();
await say('textAfter');
await hold(1500);

// ---------- 2. speech → Korean text ----------
card('voice');
await scrollToEl(page.getByRole('radiogroup', { name: 'Input' }), 160);
await tap(radio('Input', 'Voice'));
await tap(radio('Output', 'Text'));
await say('voice');
await scrollToBottom();
await settle(200);
voiceQueue.push({ id: 'voice-german', clip: 'demo/speech/de.wav' });
await tap(page.getByRole('button', { name: 'Start listening' }));
await sleep(800);
await replayDone;
await sleep(600);
await tap(page.getByRole('button', { name: 'Stop listening' }));
await say('voiceAfter');
await hold(1200);

// ---------- 3. pace and tips ----------
card('pace');
await scrollToEl(page.getByRole('radiogroup', { name: 'Pace' }), 200);
await say('pace');
await tap(radio('Pace', 'Fast'));
await sleep(1300);
await tap(radio('Pace', 'Sentence'));
await sleep(1300);
await tap(radio('Pace', 'Balanced'));
await hold(1200);

// ---------- 4. meeting mode ----------
card('meeting');
await scrollToEl(page.getByRole('button', { name: /Meeting mode/ }), 330);
await say('meeting');
await hold(300);
voiceQueue.push({ id: 'meeting', clip: 'demo/speech/meeting.wav' });
await tap(page.getByRole('button', { name: /Meeting mode/ }));
await sleep(800);
await replayDone;
await sleep(500);
await say('meetingAfter');
await hold(1200);
await tap(page.getByRole('button', { name: 'Close subtitles' }));
await sleep(600);

// ---------- rubric + outro ----------
await scrollTo(0);
card('rubric');
await say('rubric');
await hold(1200);
card('outro');
await say('outro');
await hold(1800);
log('end');

await cdp.send('Page.stopScreencast');
await ctx.close();
await browser.close();
const start = t0 / 1000, endT = events.at(-1).t;
const lines = [];
frames.forEach((f, i) => {
  const from = i === 0 ? 0 : f.ts - start;
  const to = i + 1 < frames.length ? frames[i + 1].ts - start : endT;
  if (to > from) lines.push(`file '${f.file.split('/').pop()}'`, `duration ${(to - from).toFixed(4)}`);
});
lines.push(lines.at(-2));
fs.writeFileSync(`${OUT}/frames/list.txt`, lines.join('\n'));
fs.writeFileSync(`${OUT}/events.json`, JSON.stringify(events, null, 1));
console.log('frames:', frames.length, '| end', endT.toFixed(1), '| clips', events.filter(e => e.type === 'clip').map(e => `${e.file.split('/').pop()}@${e.t.toFixed(1)}`).join(' '));
