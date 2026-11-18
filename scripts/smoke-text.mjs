// Smoke test: sends typed sentences over /live and prints the transcripts and how much audio came back.
// Usage: node scripts/smoke-text.mjs [port] [home] [target] "sentence" ...
import WebSocket from 'ws';

const [port = '3000', home = 'English', target = 'Korean', ...texts] = process.argv.slice(2);
const sentences = texts.length ? texts : ['Thanks so much, you really saved me today!'];
const ws = new WebSocket(`ws://localhost:${port}/live?home=${encodeURIComponent(home)}&lang=${encodeURIComponent(target)}`);
let i = 0, out = '', inT = '', audioBytes = 0, started = 0;
const next = () => {
  if (i >= sentences.length) { ws.close(); return; }
  out = ''; inT = ''; audioBytes = 0; started = Date.now();
  console.log(`\n> ${sentences[i]}`);
  ws.send(JSON.stringify({ text: sentences[i++] }));
};
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.ready) next();
  if (m.error) { console.log('ERROR', m.error); ws.close(); }
  if (m.inText) inT += m.inText;
  if (m.outText) out += m.outText;
  if (m.audio) audioBytes += Buffer.from(m.audio, 'base64').length;
  if (m.turnComplete) {
    console.log(`  heard: ${inT || '(text input)'}\n  said:  ${out}\n  audio: ${(audioBytes / 48000).toFixed(1)} s, ${Date.now() - started} ms`);
    setTimeout(next, 500);
  }
  if (m.closed) console.log('closed', m.reason);
});
ws.on('close', () => process.exit(0));
setTimeout(() => { console.log('timeout'); process.exit(1); }, 90000);
