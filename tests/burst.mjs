import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const PORT = 5466;
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
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.lobby-card', { timeout: 30000 });
await page.click('.lobby-card');
await wait(1200);
await page.waitForFunction(() => window.__SB?.state?.().phase === 'dealing', null, { timeout: 90000, polling: 100 });
fs.mkdirSync(OUT, { recursive: true });
for (let i = 0; i < 12; i++) {
  await page.screenshot({ path: `${OUT}/burst_${String(i).padStart(2, '0')}.png` });
  await wait(320);
}
console.log('burst done', await page.evaluate(() => JSON.stringify(window.__SB.state())));
await b.close(); preview.kill('SIGKILL'); process.exit(0);
