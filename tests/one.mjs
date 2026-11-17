import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 5455;
const BASE = `http://127.0.0.1:${PORT}/Speed-baccarat/`;
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: '/workspace/projects/speed-baccarat', stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) break; } catch (e) { /* retry */ } await wait(250); }
const b = await chromium.launch({ executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('evolab.session.v1', JSON.stringify({ username: 'v2shot7066883' })));
const page = await ctx.newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('crash', () => console.log('PAGE CRASHED'));
await page.goto(BASE, { waitUntil: 'load' });
await wait(4000);
try { console.log('state', JSON.stringify(await page.evaluate(() => window.__SB?.state?.()))); } catch (e) { console.log('eval fail', e.message); }
await wait(3500);
try { await page.screenshot({ path: '/workspace/downloads/speed-baccarat-v3/bac_test.png' }); console.log('shot ok'); } catch (e) { console.log('shot fail', e.message); }
await b.close(); preview.kill('SIGKILL'); process.exit(0);
