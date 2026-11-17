import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 5477;
const OUT = '/workspace/downloads/speed-baccarat-v3';
const BASE = `http://127.0.0.1:${PORT}/Speed-baccarat/`;
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: '/workspace/projects/speed-baccarat', stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch (e) { /* retry */ } await wait(250); }
const b = await chromium.launch({ executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('evolab.session.v1', JSON.stringify({ username: 'v2shot7066883' })));
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(BASE + '?game=crazy', { waitUntil: 'load' });
await wait(3000);
// wait for the wheel to finish a spin, then read the stop index and the result text
await page.waitForFunction(() => window.__SB?.state?.().phase === 'result', null, { timeout: 90000, polling: 100 });
await wait(600);
const info = await page.evaluate(() => ({
  banner: document.getElementById('ctBanner')?.textContent,
  badge: document.getElementById('statusBadge')?.textContent,
  hist: document.getElementById('ctHistory')?.textContent
}));
console.log('INFO', JSON.stringify(info));
await page.screenshot({ path: `${OUT}/ct_check_result.png` });
await b.close(); preview.kill('SIGKILL'); process.exit(0);
