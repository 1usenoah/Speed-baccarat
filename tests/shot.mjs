import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:5199/Speed-baccarat/';
const OUT = '/workspace/downloads/speed-baccarat';
fs.mkdirSync(OUT, { recursive: true });

const url = process.env.URL || BASE + '?test=1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function shoot(name, viewport, actions) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (actions) await actions(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name, 'errors:', errors.length, errors.slice(0, 5));
  await ctx.close();
}

await shoot(process.env.NAME || 'dev_desktop', { width: 1440, height: 900 }, async (page) => {
  await page.waitForTimeout(1200);
  if (process.env.ACT === 'bet') {
    await page.click('#view-baccarat .zone[data-zone="P"]');
    await page.waitForTimeout(300);
  }
});

await browser.close();
