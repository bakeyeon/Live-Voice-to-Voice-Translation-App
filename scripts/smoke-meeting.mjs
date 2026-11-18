// End-to-end check of meeting mode: Chromium's fake microphone plays a WAV file into the app,
// and screenshots of the live subtitles are saved.
// Usage: node scripts/smoke-meeting.mjs <url> <speech.wav> <out-prefix>
import { chromium } from 'playwright';

const [url = 'http://localhost:3000/', wav, out = 'meeting'] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone'] });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('vite')) console.log('console:', m.text()); });
await page.goto(url);
await page.getByRole('button', { name: /Meeting mode/ }).click();
for (const s of [6, 12, 18]) {
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}-${s}s.png` });
  const text = await page.locator('[aria-label="Meeting mode: live subtitles"] main').innerText();
  console.log(`--- ${s}s ---\n${text}`);
}
await browser.close();
