/* Local screenshot harness for the current build (vite preview + chromium). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || '/workspace/downloads/speed-baccarat-v3';
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT || (5200 + Math.floor(Math.random() * 300)));
const BASE = `http://127.0.0.1:${PORT}/Speed-baccarat/`;

const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: '/workspace/projects/speed-baccarat', stdio: 'ignore' }
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return true;
    } catch (e) { /* retry */ }
    await wait(250);
  }
  return false;
}
console.log('server ready:', await ready());

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion']
});

const errorsAll = [];
async function shot(name, { viewport, mobile = false, query = '', steps = async () => {} }) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 1, locale: 'ko-KR', isMobile: mobile, hasTouch: mobile,
    userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('evolab.session.v1', JSON.stringify({ username: 'v2shot7066883' }));
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(BASE + query, { waitUntil: 'load' });
  console.log('assets', await page.evaluate(() => [...document.querySelectorAll('script[src],link[href]')].map((n) => n.src || n.href).join(' ')));
  await wait(2500);
  await steps(page, wait);
  await page.screenshot({ path: path.join(OUT, name + '-' + Date.now() + '.png') });
  console.log(`shot ${name}: ${errs.length} errors`, errs.slice(0, 8));
  errorsAll.push(...errs);
  await ctx.close();
}

const MODE = process.env.MODE || 'ct';

if (MODE === 'ct') {
  const desk = { width: 1440, height: 900 };
  const mob = { width: 390, height: 844 };
  await shot('ct_desktop_betting', {
    viewport: desk, query: '?game=crazy',
    steps: async (page, w) => { await w(2500); }
  });
  await shot('ct_desktop_spin', {
    viewport: desk, query: '?game=crazy',
    steps: async (page, w) => {
      await page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 150 }).catch(() => {});
      await w(1600);
    }
  });
  await shot('ct_desktop_result', {
    viewport: desk, query: '?game=crazy',
    steps: async (page, w) => {
      await page.waitForFunction(() => window.__SB?.state?.().phase === 'result', null, { timeout: 90000, polling: 150 }).catch(() => {});
      await w(1200);
    }
  });
  await shot('ct_mobile_betting', {
    viewport: mob, mobile: true, query: '?game=crazy',
    steps: async (page, w) => { await w(2500); }
  });
  await shot('ct_mobile_spin', {
    viewport: mob, mobile: true, query: '?game=crazy',
    steps: async (page, w) => {
      await page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 150 }).catch(() => {});
      await w(1700);
    }
  });
} else {
  const desk = { width: 1440, height: 900 };
  const mob = { width: 390, height: 844 };
  await shot('bac_desktop_deal', {
    viewport: desk,
    steps: async (page, w) => {
      await page.waitForSelector('.lobby-card', { timeout: 30000 });
      await page.click('.lobby-card');
      await w(1500);
      await page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 150 }).catch(() => {});
      await w(1400);
    }
  });
  await shot('bac_desktop_squeeze', {
    viewport: desk,
    steps: async (page, w) => {
      await page.waitForSelector('.lobby-card', { timeout: 30000 });
      await page.click('.lobby-card');
      await w(1500);
      await page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 150 }).catch(() => {});
      await w(3400);
    }
  });
  await shot('bac_desktop_result', {
    viewport: desk,
    steps: async (page, w) => {
      await page.waitForSelector('.lobby-card', { timeout: 30000 });
      await page.click('.lobby-card');
      await w(1500);
      await page.waitForFunction(() => window.__SB?.state?.().phase === 'result', null, { timeout: 90000, polling: 150 }).catch(() => {});
      await w(900);
    }
  });
  await shot('bac_mobile', {
    viewport: mob, mobile: true,
    steps: async (page, w) => {
      await page.waitForSelector('.lobby-card', { timeout: 30000 });
      await page.click('.lobby-card');
      await w(1500);
      await page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 150 }).catch(() => {});
      await w(2400);
    }
  });
}

await browser.close();
preview.kill('SIGKILL');
console.log('TOTAL ERRORS', errorsAll.length);
process.exit(0);
