// Smoke test for voice input: streams a 16 kHz mono 16-bit PCM file over /live in real time, as a microphone
// would, then a few seconds of silence. Prints each finished turn with its time, so paces can be compared.
// Usage: node scripts/smoke-voice.mjs <port> <home> <target> <file.pcm> [fast|balanced|sentence]
import WebSocket from 'ws';
import fs from 'fs';

const [port = '3000', home = 'English', target = 'Korean', file, pace = 'balanced'] = process.argv.slice(2);
const speech = fs.readFileSync(file);
const speechSec = speech.length / 32000;
const pcm = Buffer.concat([speech, Buffer.alloc(16000 * 2 * 4)]); // + 4 s silence
const ws = new WebSocket(`ws://localhost:${port}/live?home=${encodeURIComponent(home)}&lang=${encodeURIComponent(target)}&pace=${pace}`);
let inT = '', out = '', t0 = 0, firstOut = 0, turns = 0;
const CHUNK = 3200; // 100 ms
ws.on('message', async (d) => {
  const m = JSON.parse(d.toString());
  if (m.ready) {
    t0 = Date.now();
    for (let i = 0; i < pcm.length; i += CHUNK) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ audio: pcm.subarray(i, i + CHUNK).toString('base64') }));
      await new Promise(r => setTimeout(r, 100));
    }
  }
  if (m.error) { console.log('ERROR', m.error); process.exit(1); }
  if (m.inText) inT += m.inText;
  if (m.outText) { if (!firstOut) firstOut = Date.now(); out += m.outText; }
  if (m.turnComplete) {
    turns++;
    console.log(`  turn ${turns} done at ${((Date.now() - t0) / 1000).toFixed(1)} s: ${out.trim()}`);
    out = '';
  }
});
setTimeout(() => {
  console.log(`[${pace}] speech ${speechSec.toFixed(1)} s | first subtitle at ${firstOut ? ((firstOut - t0) / 1000).toFixed(1) : '-'} s | ${turns} turns`);
  process.exit(0);
}, (speechSec + 10) * 1000);
