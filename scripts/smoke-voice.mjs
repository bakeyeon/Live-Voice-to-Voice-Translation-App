// Smoke test for voice input: streams a 16 kHz mono 16-bit PCM file over /live in real time,
// as a microphone would, then a little silence, and prints both transcripts.
// Usage: node scripts/smoke-voice.mjs <port> <home> <target> <file.pcm>
import WebSocket from 'ws';
import fs from 'fs';

const [port = '3000', home = 'English', target = 'Korean', file] = process.argv.slice(2);
const pcm = Buffer.concat([fs.readFileSync(file), Buffer.alloc(16000 * 2 * 1.5)]); // + 1.5 s silence
const ws = new WebSocket(`ws://localhost:${port}/live?home=${encodeURIComponent(home)}&lang=${encodeURIComponent(target)}`);
let inT = '', out = '', audioBytes = 0;
const CHUNK = 3200; // 100 ms
ws.on('message', async (d) => {
  const m = JSON.parse(d.toString());
  if (m.ready) {
    for (let i = 0; i < pcm.length; i += CHUNK) {
      ws.send(JSON.stringify({ audio: pcm.subarray(i, i + CHUNK).toString('base64') }));
      await new Promise(r => setTimeout(r, 100));
    }
  }
  if (m.error) { console.log('ERROR', m.error); process.exit(1); }
  if (m.inText) inT += m.inText;
  if (m.outText) out += m.outText;
  if (m.audio) audioBytes += Buffer.from(m.audio, 'base64').length;
  if (m.turnComplete) {
    console.log(`heard: ${inT}\nsaid:  ${out}\naudio: ${(audioBytes / 48000).toFixed(1)} s`);
    ws.close();
  }
});
ws.on('close', () => process.exit(0));
setTimeout(() => { console.log('timeout; heard so far:', inT, '| said:', out); process.exit(1); }, 60000);
