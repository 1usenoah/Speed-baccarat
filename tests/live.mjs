/* Live-site verification: real login, real rounds, real screenshots. */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/workspace/downloads/speed-baccarat-v2';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'https://1usenoah.github.io/Speed-baccarat/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
});

const errors = [];
const failed = [];
async function open(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile, locale: 'ko-KR' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  await page.goto(BASE, { waitUntil: 'load' });
  return { ctx, page };
}

async function signIn(page) {
  await page.waitForSelector('#authUser', { timeout: 60000 });
  await page.fill('#authUser', 'v2shot7066883');
  await page.fill('#authPass', 'pass1234');
  await page.click('.auth-submit');
  try {
    await page.waitForSelector('#authUser', { state: 'detached', timeout: 15000 });
    return 'login v2shot7066883';
  } catch (e) {
    const alt = 'v2shot' + String(Date.now()).slice(-7);
    await page.click('.auth-tabs button[data-mode="signup"]');
    await page.fill('#authUser', alt);
    await page.fill('#authPass', 'pass1234');
    await page.fill('#authPass2', 'pass1234');
    await page.click('.auth-submit');
    await page.waitForSelector('#authUser', { state: 'detached', timeout: 30000 });
    return 'signup ' + alt;
  }
}

/* ---------- desktop: baccarat dealing ---------- */
{
  const { ctx, page } = await open({ width: 1440, height: 900 });
  const who = await signIn(page);
  console.log('signed in as', who);
  await page.waitForSelector('.lobby-card', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/live_01_lobby.png` });
  await page.click('.lobby-card');
  await wait(1200);
  await page.waitForFunction(() => window.__SB.state().phase === 'dealing', null, { timeout: 60000, polling: 150 });
  await wait(1600);
  await page.screenshot({ path: `${OUT}/live_02_baccarat_dealing.png` });
  await wait(1600);
  await page.screenshot({ path: `${OUT}/live_03_baccarat_squeeze.png` });
  const st = await page.evaluate(() => window.__SB.state());
  console.log('state', JSON.stringify(st));
  await ctx.close();
}

/* ---------- desktop: crazy time spin ---------- */
{
  const { ctx, page } = await open({ width: 1440, height: 900 });
  await signIn(page);
  await page.click('.gs[data-game="crazy"]');
  await wait(6000);
  await page.screenshot({ path: `${OUT}/live_04_crazytime_betting.png` });
  await page.waitForFunction(() => window.__SB.state().phase === 'dealing', null, { timeout: 90000, polling: 200 });
  await wait(3000);
  await page.screenshot({ path: `${OUT}/live_05_crazytime_spin.png` });
  await wait(3000);
  await page.screenshot({ path: `${OUT}/live_06_crazytime_wheel.png` });
  await ctx.close();
}

/* ---------- mobile ---------- */
{
  const { ctx, page } = await open({ width: 390, height: 844 }, true);
  await signIn(page);
  await page.waitForSelector('.lobby-card', { timeout: 20000 });
  await page.click('.lobby-card');
  await wait(2500);
  await page.screenshot({ path: `${OUT}/live_07_mobile_baccarat.png` });
  await page.click('.gs[data-game="crazy"]');
  await wait(6500);
  await page.screenshot({ path: `${OUT}/live_08_mobile_crazytime.png` });
  await ctx.close();
}

await browser.close();
console.log('CONSOLE ERRORS', errors.length, errors.slice(0, 8));
console.log('FAILED REQUESTS', failed.length, failed.slice(0, 8));
process.exit(0);
