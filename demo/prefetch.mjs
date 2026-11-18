// Records real Gemini Live responses for each demo scene: every message with its timing, plus the
// interpreter's audio as a 24 kHz WAV. record.mjs replays these into the app, so takes are identical.
// Needs the app server running. Usage: node demo/prefetch.mjs [port]
import WebSocket from 'ws';
import fs from 'fs';

const port = process.argv[2] || '3000';
const SCENES = JSON.parse(fs.readFileSync('demo/scenes.json', 'utf8'));
fs.mkdirSync('demo/cache', { recursive: true });

const wav = (pcm, rate) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

const run = (scene) => new Promise((resolve, reject) => {
  const q = new URLSearchParams({ home: scene.home, lang: scene.target, pace: scene.pace || 'balanced' });
  const ws = new WebSocket(`ws://localhost:${port}/live?${q}`);
  const msgs = [], audio = [];
  let t0 = 0, done = false, firstAudio = null;
  const finish = () => {
    if (done) return; done = true; ws.close();
    fs.writeFileSync(`demo/cache/${scene.id}.json`, JSON.stringify({ scene, firstAudio, messages: msgs }, null, 1));
    if (audio.length) fs.writeFileSync(`demo/cache/${scene.id}.wav`, wav(Buffer.concat(audio), 24000));
    resolve(msgs);
  };
  ws.on('message', async (d) => {
    const m = JSON.parse(d.toString());
    if (m.ready) {
      t0 = Date.now();
      if (scene.text) ws.send(JSON.stringify({ text: scene.text }));
      if (scene.speech) {
        const pcm = Buffer.concat([fs.readFileSync(scene.speech), Buffer.alloc(32000 * 3)]);
        for (let i = 0; i < pcm.length && !done; i += 3200) {
          ws.send(JSON.stringify({ audio: pcm.subarray(i, i + 3200).toString('base64') }));
          await new Promise(r => setTimeout(r, 100));
        }
      }
      return;
    }
    if (m.error) { reject(new Error(m.error)); return; }
    const dt = (Date.now() - t0) / 1000;
    if (m.audio) {
      if (firstAudio === null) firstAudio = dt;
      audio.push(Buffer.from(m.audio, 'base64'));
      msgs.push({ dt, audio: true });         // the audio itself goes into the .wav
    } else {
      msgs.push({ dt, ...m });
    }
    if (m.turnComplete && (!scene.turns || msgs.filter(x => x.turnComplete).length >= scene.turns)) setTimeout(finish, 300);
  });
  setTimeout(finish, 45000);
});

for (const scene of SCENES) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const msgs = await run(scene);
      const said = msgs.filter(m => m.outText).map(m => m.outText).join('');
      console.log(`${scene.id}: ${said || '(no translation)'}`);
      if (said) break;
    } catch (e) {
      console.log(`${scene.id}: ${e.message}, retry ${attempt}`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}
