/* Dev screenshot harness: boots a static preview server, opens the page in
   Chromium (SwiftShader GL for headless WebGL) and captures screenshots. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/workspace/downloads/speed-baccarat';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/Speed-baccarat/`;

const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: '/workspace/projects/speed-baccarat', stdio: 'ignore' }
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return true;
    } catch (e) { /* retry */ }
    await wait(250);
  }
  return false;
}

const ok = await ready();
console.log('server ready:', ok);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']
});

const shots = JSON.parse(process.env.SHOTS || '[]');
const errorsAll = [];

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: s.viewport,
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(BASE + (s.query || ''), { waitUntil: 'load' });
  await wait(s.wait || 2500);
  if (s.js) {
    await page.evaluate(s.js);
    await wait(s.after || 400);
  }
  if (s.actions) {
    // eslint-disable-next-line no-new-func
    await new Function('page', 'wait', `return (async () => { ${s.actions} })()`)(page, wait);
  }
  await page.screenshot({ path: path.join(OUT, s.name + '.png') });
  console.log(`shot ${s.name}: ${errs.length} errors`, errs.slice(0, 6));
  errorsAll.push(...errs);
  await ctx.close();
}

await browser.close();
preview.kill('SIGKILL');
console.log('TOTAL ERRORS', errorsAll.length);
process.exit(0);
