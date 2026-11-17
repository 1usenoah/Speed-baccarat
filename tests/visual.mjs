/* Visual iteration harness: seeds a local session so the gate stays closed,
   boots the built app in Chromium (SwiftShader WebGL) and captures frames. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/workspace/downloads/speed-baccarat-v2';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/Speed-baccarat/`;

const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: '/workspace/projects/speed-baccarat', stdio: 'ignore' }
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch (e) { /* retry */ }
  await wait(250);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion']
});

const shots = JSON.parse(process.env.SHOTS || '[]');
const allErrors = [];

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: s.viewport || { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
    locale: 'ko-KR'
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('evolab.session.v1', JSON.stringify({ username: 'shotuser', is_vip: false, ts: Date.now() }));
    localStorage.setItem('evolab.wallet.v1', JSON.stringify({ balance: 1000000, totalRefilled: 0 }));
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('requestfailed', (r) => errs.push('REQFAIL ' + r.url()));

  await page.goto(BASE + (s.query || ''), { waitUntil: 'load' });
  await wait(s.wait || 3000);
  if (s.actions) {
    // eslint-disable-next-line no-new-func
    await new Function('page', 'wait', `return (async () => { ${s.actions} })()`)(page, wait);
  }
  if (s.clip) {
    await page.screenshot({ path: path.join(OUT, s.name + '.png'), clip: s.clip });
  } else {
    await page.screenshot({ path: path.join(OUT, s.name + '.png') });
  }
  console.log(`shot ${s.name}: ${errs.length} errors`, errs.slice(0, 5));
  allErrors.push(...errs);
  await ctx.close();
}

await browser.close();
preview.kill('SIGKILL');
console.log('TOTAL ERRORS', allErrors.length, allErrors.slice(0, 10));
process.exit(0);
