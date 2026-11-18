// Checks meeting mode's floating window: clicking Meeting mode should open a Document Picture-in-Picture
// window with live subtitles; screenshots that window. Usage: node scripts/smoke-popout.mjs <url> <speech.wav> <out.png>
import { chromium } from 'playwright';

const [url = 'http://localhost:3000/', wav, out = 'popout.png'] = process.argv.slice(2);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone'] });
const page = await ctx.newPage();
await page.goto(url);
console.log('PiP API:', await page.evaluate(() => 'documentPictureInPicture' in window));
// meeting mode opens the floating window straight away
const pipPage = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
await page.getByRole('button', { name: /Meeting mode/ }).click();
const pip = await pipPage;
await page.waitForTimeout(12000);
console.log('main page notice:', await page.getByText('floating in their own window').count());
if (pip) {
  console.log('pip window text:\n' + (await pip.locator('body').innerText()));
  await pip.screenshot({ path: out });
} else {
  console.log('no PiP window opened');
}
await browser.close();
