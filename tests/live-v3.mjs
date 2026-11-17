/* Live verification against GitHub Pages: screenshots + console/404 audit. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://1usenoah.github.io/Speed-baccarat/';
const OUT = '/workspace/downloads/speed-baccarat-v2';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion']
});

const allErrors = [];
const all404 = [];

async function session({ viewport, mobile = false, query = '', tag }) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 1, locale: 'ko-KR', isMobile: mobile, hasTouch: mobile,
    userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined
  });
  await ctx.addInitScript(() => localStorage.setItem('evolab.session.v1', JSON.stringify({ username: 'v2shot7066883' })));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('response', (r) => { if (r.status() === 404) all404.push(r.url()); if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(BASE + query, { waitUntil: 'load' });
  await wait(3500);
  if (query.includes('crazy') === false) {
    await page.waitForSelector('.lobby-card', { timeout: 30000 }).catch(() => {});
    await page.click('.lobby-card').catch(() => {});
    await wait(1500);
  }
  return {
    page, ctx,
    async shot(name) {
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log(`shot ${name}`);
    },
    done() { allErrors.push(...errs.map((e) => `${tag}: ${e}`)); return ctx.close(); }
  };
}

// ---------- desktop crazy time
{
  const s = await session({ viewport: { width: 1440, height: 900 }, query: '?game=crazy', tag: 'ct-desktop' });
  await s.shot('v3_ct_desktop_betting');
  await s.page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 120 }).catch(() => {});
  await wait(1900);
  await s.shot('v3_ct_desktop_spin');
  await s.page.waitForFunction(() => window.__SB?.state?.().phase === 'result', null, { timeout: 90000, polling: 120 }).catch(() => {});
  await wait(900);
  await s.shot('v3_ct_desktop_result');
  await s.done();
}
// ---------- desktop baccarat
{
  const s = await session({ viewport: { width: 1440, height: 900 }, tag: 'bac-desktop' });
  await s.page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 60 }).catch(() => {});
  await wait(900);
  await s.shot('v3_bac_desktop_deal');
  await wait(1200);
  await s.shot('v3_bac_desktop_squeeze');
  await wait(1400);
  await s.shot('v3_bac_desktop_squeeze2');
  await s.page.waitForFunction(() => window.__SB?.state?.().phase === 'result', null, { timeout: 90000, polling: 120 }).catch(() => {});
  await wait(500);
  await s.shot('v3_bac_desktop_result');
  await s.done();
}
// ---------- mobile
{
  const s = await session({ viewport: { width: 390, height: 844 }, mobile: true, query: '?game=crazy', tag: 'ct-mobile' });
  await s.shot('v3_ct_mobile_betting');
  await s.page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 120 }).catch(() => {});
  await wait(2000);
  await s.shot('v3_ct_mobile_spin');
  await s.done();
}
{
  const s = await session({ viewport: { width: 390, height: 844 }, mobile: true, tag: 'bac-mobile' });
  await s.page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 60 }).catch(() => {});
  await wait(2400);
  await s.shot('v3_bac_mobile');
  await s.done();
}

console.log('CONSOLE ERRORS', allErrors.length, JSON.stringify(allErrors.slice(0, 8), null, 1));
console.log('404s', all404.length, JSON.stringify(all404.slice(0, 8)));
await browser.close();
process.exit(0);
