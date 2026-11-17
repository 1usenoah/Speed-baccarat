import { chromium } from 'playwright';
const BASE = 'https://1usenoah.github.io/Speed-baccarat/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({
  executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('#authUser', { timeout: 60000 });
await page.fill('#authUser', 'v2shot7066883');
await page.fill('#authPass', 'pass1234');
await page.click('.auth-submit');
await wait(9000);
const state = await page.evaluate(() => ({
  gateOpen: !!document.querySelector('#authUser'),
  note: document.querySelector('.auth-note')?.textContent || document.querySelector('.auth-error')?.textContent || '',
  user: window.__SB?.state?.().user || null
}));
console.log(JSON.stringify(state));
await b.close();
process.exit(0);
