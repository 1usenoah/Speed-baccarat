import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 5488;
const BASE = `http://127.0.0.1:${PORT}/Speed-baccarat/`;
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: '/workspace/projects/speed-baccarat', stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch (e) {} await wait(250); }
const b = await chromium.launch({ executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('evolab.session.v1', JSON.stringify({ username: 'v2shot7066883' })));
const page = await ctx.newPage();
await page.goto(BASE + '?game=crazy', { waitUntil: 'load' });
await wait(4000);
// freeze the wheel at index 0, then 41 (CASH HUNT), then 15 (10) and photograph each
for (const idx of [0, 41, 15, 53]) {
  await page.evaluate(async (i) => {
    const st = window.__ctStudio;
    st.wheelGroup.rotation.z = 0;
    st.wheelGroup.rotation.z = i * (Math.PI * 2) / 54;
  }, idx);
  await wait(500);
  await page.screenshot({ path: `/workspace/downloads/speed-baccarat-v3/idx_${idx}.png` });
}
await b.close(); preview.kill('SIGKILL'); process.exit(0);
