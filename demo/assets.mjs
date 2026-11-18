// Renders the stage graphics for the demo as PNGs (background, phone frame, feature cards, captions)
// into demo/build/, plus build/timeline.json for compose.py.
// Usage: node demo/assets.mjs   (after record.mjs)
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'demo/build';
fs.mkdirSync(OUT, { recursive: true });
const events = JSON.parse(fs.readFileSync('demo/raw/events.json', 'utf8'));
const script = JSON.parse(fs.readFileSync('demo/script.json', 'utf8'));
const DUR = JSON.parse(fs.readFileSync('demo/voice/durations.json', 'utf8'));
const END = events.at(-1).t;

const L = {
  W: 1920, H: 1080,
  screen: { x: 304, y: 92, w: 416, h: 900 },
  bezel: 16,
  card: { x: 870, y: 178, w: 900, h: 600 },
  zoom: { x: 40, y: 92, w: 448, h: 480 },
  caption: { x: 870, y: 818, w: 900 },
};

const LOGO = `<svg viewBox="0 0 48 48"><defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".5" stop-color="#38bdf8"/><stop offset="1" stop-color="#22d3ee"/></linearGradient><linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#f87171"/><stop offset=".5" stop-color="#facc15"/><stop offset="1" stop-color="#4ade80"/></linearGradient></defs><rect x="2" y="2" width="44" height="44" rx="13" fill="url(#t)"/><path d="M13 11.5h22a4.5 4.5 0 0 1 4.5 4.5v12a4.5 4.5 0 0 1-4.5 4.5H20l-6.5 5v-5H13A4.5 4.5 0 0 1 8.5 28V16A4.5 4.5 0 0 1 13 11.5z" fill="#fff" fill-opacity=".16" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><rect x="14" y="16" width="20" height="3" rx="1.5" fill="url(#b)"/><g stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M15 25v2M19.5 23v6M24 21.5v9M28.5 23.5v5M33 25v2"/></g></svg>`;
const WORDMARK = (size) => `<span class="sora" style="font-size:${size}px;line-height:1"><span class="grad" style="font-weight:700">Sentiment</span> <span style="font-weight:300;color:#334155">Interpreter</span></span>`;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;600;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Inter, 'Segoe UI', system-ui, sans-serif; color: #1e293b; background: transparent; }
  .sora { font-family: Sora, Inter, sans-serif; }
  .grad { background: linear-gradient(90deg, #8b5cf6, #0ea5e9, #06b6d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .card { width: ${L.card.w}px; height: ${L.card.h}px; padding: 40px 44px; border-radius: 32px;
    background: rgba(255,255,255,.72); border: 1.5px solid rgba(255,255,255,.9);
    box-shadow: 0 24px 60px rgba(15,23,42,.10), 0 2px 6px rgba(15,23,42,.04); position: relative; }
  .chip { display: inline-block; padding: 8px 18px; border-radius: 999px; font: 600 22px Inter, sans-serif; color: #6d28d9; background: rgba(237,233,254,.9); border: 1px solid rgba(196,181,253,.7); }
  h2 { font: 700 46px/1.15 Sora, sans-serif; letter-spacing: -.01em; margin: 18px 0 14px; }
  p { font-size: 28px; line-height: 1.45; color: #475569; }
  .row { display: flex; align-items: center; gap: 16px; font-size: 26px; color: #334155; margin: 16px 0; }
  .ico { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: rgba(241,245,249,.9); font-size: 24px; flex: none; }
  .pair { display: flex; flex-direction: column; gap: 10px; margin-top: 26px; padding: 22px 26px; border-radius: 22px; background: rgba(248,250,252,.85); border: 1px solid rgba(226,232,240,.9); }
  .pair .src { font-size: 26px; color: #64748b; }
  .pair .out { font: 600 38px/1.3 Inter, sans-serif; color: #0f172a; }
  code { font: 500 24px 'Cascadia Code', Consolas, monospace; background: rgba(241,245,249,.95); padding: 4px 10px; border-radius: 8px; color: #0f172a; }
  .cap { width: ${L.caption.w}px; padding: 22px 32px; border-radius: 24px; background: rgba(15,23,42,.86); color: #f8fafc;
    font: 500 30px/1.4 Inter, sans-serif; text-align: center; box-shadow: 0 16px 40px rgba(15,23,42,.18); }
  .slide { position: relative; height: 330px; margin-top: 26px; border-radius: 20px; overflow: hidden; background: linear-gradient(135deg, #e0f2fe, #ede9fe); border: 1px solid rgba(203,213,225,.9); }
  .slide .t { position: absolute; left: 34px; top: 30px; font: 700 34px Sora, sans-serif; color: #1e293b; }
  .slide .b { position: absolute; left: 34px; top: 90px; width: 360px; height: 14px; border-radius: 7px; background: rgba(148,163,184,.45); box-shadow: 0 30px 0 rgba(148,163,184,.35), 0 60px 0 rgba(148,163,184,.3); }
  .float { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); width: 88%; padding: 16px 22px; border-radius: 16px; background: #0b1020; color: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.35); }
  .float .bar { display: flex; align-items: center; gap: 10px; font: 600 16px Inter, sans-serif; color: rgba(255,255,255,.75); }
  .float .src { margin-top: 8px; font-size: 18px; color: rgba(255,255,255,.55); }
  .float .out { margin-top: 4px; font: 700 27px/1.25 Inter, sans-serif; }
`;

const cards = {
  intro: () => `<div class="card"><div style="display:flex;align-items:center;gap:22px;margin-top:40px">
      <div style="width:110px;height:110px">${LOGO}</div>${WORDMARK(58)}</div>
      <p style="margin-top:44px;font-size:34px;color:#334155">Interpreting that keeps the feeling, not just the words.</p>
      <p style="margin-top:14px">Speak or type in one language; hear or read it in another, with the same warmth, politeness and mood.</p>
      <div style="margin-top:34px;display:flex;gap:12px;flex-wrap:wrap"><span class="chip">🎙️ Voice in</span><span class="chip">⌨️ Text in</span><span class="chip">🔊 Voice out</span><span class="chip">📝 Text out</span></div></div>`,
  text: () => `<div class="card"><span class="chip">⌨️ Text → 🔊 Voice</span>
      <h2>Type it, hear it</h2>
      <p>Type a message and the interpreter says it in the other language, out loud.</p>
      <div class="pair"><span class="src">Aww thank you so much~ you're the best 😊</span><span class="out" style="color:#94a3b8">…</span></div></div>`,
  feeling: () => `<div class="card"><span class="chip">💜 Feeling cues</span>
      <h2>The feeling carries over</h2>
      <div class="pair"><span class="src">Aww thank you so much~ you're the best 😊</span><span class="out">어머 정말 고마워요~ 최고!</span></div>
      <div class="row" style="margin-top:28px"><span class="ico">✨</span><span>“Aww” → 어머 · “~” stays · warm, smiling voice</span></div></div>`,
  voice: () => `<div class="card"><span class="chip">🎙️ Voice → 📝 Text</span>
      <h2>Speak it, read it</h2>
      <p>The interpreter hears the tone of the speech itself, not just a transcript.</p>
      <div class="pair"><span class="src">German · Komm doch mal vorbei, ich freu mich!</span><span class="out">놀러와! 기다릴게.</span></div>
      <p style="margin-top:20px;font-size:25px"><i>doch mal</i> makes it a warm, casual invitation, and it stays casual in Korean.</p></div>`,
  pace: () => `<div class="card"><span class="chip">⏱ Pace</span>
      <h2>How soon it translates</h2>
      <div class="row"><span class="ico">⚡</span><span><b>Fast</b>: after a 0.25 s pause</span></div>
      <div class="row"><span class="ico">⏱</span><span><b>Balanced</b>: after 0.5 s, the default</span></div>
      <div class="row"><span class="ico">¶</span><span><b>Sentence</b>: after 1 s, whole sentences</span></div>
      <p style="margin-top:14px;font-size:24px">💡 Speak in short chunks and let each subtitle appear before you go on.</p></div>`,
  meeting: () => `<div class="card"><span class="chip">🖥️ Meeting mode</span>
      <h2 style="margin-bottom:0">Subtitles over your slides</h2>
      <div class="slide"><span class="t">Q3 results</span><span class="b"></span>
        <div class="float"><div class="bar"><span style="width:20px;height:20px">${LOGO}</span>English ⇄ Korean <span style="color:#fda4af">● LIVE</span></div>
          <div class="src">Thanks so much for joining today, everyone.</div>
          <div class="out">오늘 참석해 주셔서 정말 감사합니다.</div></div></div>
      <p style="margin-top:16px;font-size:23px">In Chrome and Edge the subtitles float in their own always-on-top window.</p></div>`,
  rubric: () => `<div class="card"><span class="chip">📐 SFF rubric</span>
      <h2>Sentiment · Formality · Friendliness</h2>
      <p>The interpreter judges the original against shared anchor sentences, then matches the same levels in its words and its voice.</p>
      <div class="row"><span class="ico">😊</span><span>Positive → bright, a smile in the voice</span></div>
      <div class="row"><span class="ico">🎩</span><span>Formal → calm, measured, polite</span></div>
      <div class="row"><span class="ico">🤝</span><span>Friendly → close and relaxed</span></div></div>`,
  outro: () => `<div class="card"><div style="display:flex;align-items:center;gap:18px;margin-top:10px"><div style="width:72px;height:72px">${LOGO}</div>${WORDMARK(44)}</div>
      <p style="margin-top:30px;font-size:28px"><code style="font-size:25px">github.com/bakeyeon/Live-Voice-to-Voice-Translation-App</code></p>
      <p style="margin-top:26px;font-size:24px">Sibling of <b>Sentiment Translator</b>, which scores the same SFF rubric.</p>
      <p style="margin-top:12px;font-size:24px">SFF concept: <i>The Grue Divide</i> (PANDORA @ EMNLP 2026)</p>
      <p style="margin-top:12px;font-size:24px">Built on the Gemini Live API · redesigned with Claude Code</p></div>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: L.W, height: L.H }, deviceScaleFactor: 1 });
const render = async (html, file, sel, transparent = true) => {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.locator(sel).first().screenshot({ path: `${OUT}/${file}`, omitBackground: transparent });
};

await render(`<div id="bg" style="width:${L.W}px;height:${L.H}px;position:relative;background:
    radial-gradient(1200px 700px at 10% -5%, rgba(196,181,253,.5), transparent 62%),
    radial-gradient(1000px 650px at 105% 5%, rgba(103,232,249,.42), transparent 60%),
    radial-gradient(1200px 700px at 55% 115%, rgba(153,246,228,.42), transparent 62%), #f6f8fb;">
    <div style="position:absolute;left:${L.card.x}px;top:92px;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px">${LOGO}</div>${WORDMARK(30)}
      <span style="margin-left:10px;font-size:20px;color:#64748b">demo</span></div></div>`, 'bg.png', '#bg', false);

const S = L.screen, B = L.bezel;
await render(`<div id="ph" style="width:${S.w + 2 * B}px;height:${S.h + 2 * B}px;position:relative">
    <svg width="${S.w + 2 * B}" height="${S.h + 2 * B}" style="position:absolute;inset:0">
      <defs><mask id="m"><rect width="100%" height="100%" fill="#fff"/><rect x="${B}" y="${B}" width="${S.w}" height="${S.h}" rx="40" fill="#000"/></mask></defs>
      <rect width="100%" height="100%" rx="${40 + B}" fill="#0f172a" mask="url(#m)"/>
      <rect x="1" y="1" width="${S.w + 2 * B - 2}" height="${S.h + 2 * B - 2}" rx="${39 + B}" fill="none" stroke="#475569" stroke-width="2" mask="url(#m)"/>
      <rect x="${B + S.w / 2 - 60}" y="${B + 10}" width="120" height="30" rx="15" fill="#0f172a"/>
    </svg></div>`, 'frame.png', '#ph');

const cardEvents = events.filter(e => e.type === 'card');
const items = [];
cardEvents.forEach((e, i) => {
  const end = i + 1 < cardEvents.length ? cardEvents[i + 1].t : END;
  items.push({ kind: 'card', n: i, id: e.id, start: e.t, end, rect: null });
});
const voices = events.filter(e => e.type === 'voice');
voices.forEach((v, i) => {
  const next = i + 1 < voices.length ? voices[i + 1].t : END;
  items.push({ kind: 'caption', n: i, id: v.id, start: v.t, end: Math.min(next - 0.05, v.t + DUR[v.id] + 0.9) });
});
for (const it of items) {
  if (it.kind === 'card') {
    await render(cards[cardEvents[it.n].id](cardEvents[it.n]), `card_${it.n}.png`, '.card');
    it.file = `card_${it.n}.png`;
  } else {
    await render(`<div class="cap">${script.lines[it.id].cap}</div>`, `cap_${it.n}.png`, '.cap');
    it.file = `cap_${it.n}.png`;
  }
}
const START = Math.max(0, cardEvents[0].t - 0.6);
fs.writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ L, start: START, end: END, items, events }, null, 1));
await browser.close();
console.log('cards', items.filter(i => i.kind === 'card').length, 'captions', items.filter(i => i.kind === 'caption').length);
