/* =========================================================================
   tests/verify.mjs — staged Playwright verification.
   STAGE=desktop|mobile|crazy|sync   (each stage fits in one run)
   ========================================================================= */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const OUT = '/workspace/downloads/speed-baccarat';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/Speed-baccarat/`;
const STAGE = process.env.STAGE || 'desktop';

const preview = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: '/workspace/projects/speed-baccarat', stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch (e) { /* retry */ }
  await wait(250);
}

const browser = await chromium.launch({
  executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']
});

const errors = [];
async function newPage(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'ko-KR', isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${opts.tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${opts.tag}] PAGEERROR ${e.message}`));
  await page.goto(BASE + (opts.query || ''), { waitUntil: 'load' });
  await wait(1200);
  return { ctx, page };
}

async function signup(page, user) {
  await page.waitForSelector('#authUser', { timeout: 45000 });
  await page.click('.auth-tabs button[data-mode="signup"]');
  await wait(200);
  await page.fill('#authUser', user);
  await page.fill('#authPass', 'pass1234');
  await page.fill('#authPass2', 'pass1234');
  await page.click('.auth-submit');
  await page.waitForSelector('#authUser', { state: 'detached', timeout: 20000 });
  await wait(500);
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });
const stamp = Date.now().toString().slice(-6);
const results = {};

if (STAGE === 'desktop') {
  const { page } = await newPage({ width: 1440, height: 900 }, { tag: 'desktop' });
  await signup(page, `noah${stamp}`);
  await page.waitForSelector('.lobby-card', { timeout: 10000 });
  await wait(700);
  await shot(page, '00_lobby');
  await page.click('.lobby-card[data-table="speed-a"]');
  await wait(500);
  try {
    await page.waitForFunction(() => {
      const s = window.__SB.state();
      return s.phase === 'betting' && s.timeLeft > 6000;
    }, null, { timeout: 45000, polling: 150 });
  } catch (e) {
    console.log('WAIT FAILED; state=', await page.evaluate(() => window.__SB.state()));
    console.log('errors', errors);
    console.log('phase trace', await page.evaluate(() => document.querySelector('#statusBadge')?.textContent));
    await browser.close(); preview.kill('SIGKILL'); process.exit(1);
  }
  await page.click('#chipTray .chip[data-value="25000"]');
  for (const z of ['P', 'B', 'T', 'PP', 'BP']) {
    await page.evaluate((zz) => document.querySelector(`#view-baccarat .zone[data-zone="${zz}"]`)?.click(), z);
    await wait(150);
  }
  await wait(600);
  await shot(page, '01_betting_dealer');
  results.betting = await page.evaluate(() => window.__SB.state());

  await page.waitForFunction(() => ['dealing', 'result'].includes(window.__SB.state().phase), null, { timeout: 30000 });
  await wait(2600);
  await shot(page, '02_dealing_motion');

  await page.waitForFunction(() => window.__SB.state().phase === 'result', null, { timeout: 30000 });
  await wait(1300);
  results.result = await page.evaluate(() => window.__SB.state());
  results.roadmap = await page.evaluate(() => ({
    bead: document.querySelectorAll('#rmBead .bead').length,
    big: document.querySelectorAll('#rmBig .br-cell').length,
    beb: document.querySelectorAll('#rmBeb .dr-dot').length,
    sr: document.querySelectorAll('#rmSr .dr-dot').length,
    cp: document.querySelectorAll('#rmCp .dr-dot').length,
    stats: document.querySelector('#rmStats')?.textContent.replace(/\s+/g, ' ').trim(),
    feed: Array.from(document.querySelectorAll('#cardFeed .pcard')).map((n) => n.textContent).join(' ')
  }));
  await shot(page, '03_result_roadmap');

  await page.click('#rankBtn');
  try {
    await page.waitForSelector('.rank-list .rank-row', { timeout: 20000 });
  } catch (e) {
    console.log('RANK FAIL. modal:', await page.evaluate(() => document.querySelector('#modalRoot')?.innerText?.slice(0, 300)));
    console.log('errors', errors);
    await page.screenshot({ path: `${OUT}/rank_fail.png`, timeout: 120000 });
  }
  await wait(900);
  results.rankMode = await page.evaluate(() => document.querySelector('.rank-tabs .conn')?.textContent);
  await shot(page, '07_ranking');
  await page.context().close();
}

if (STAGE === 'mobile') {
  const { page } = await newPage({ width: 390, height: 844 }, { tag: 'mobile', mobile: true });
  await signup(page, `mob${stamp}`);
  await page.waitForSelector('.lobby-card', { timeout: 10000 });
  await shot(page, '04a_mobile_lobby');
  await page.click('.lobby-card[data-table="speed-b"]');
  await wait(500);
  await page.waitForFunction(() => {
    const s = window.__SB.state();
    return s.phase === 'betting' && s.timeLeft > 5500;
  }, null, { timeout: 45000, polling: 150 });
  await page.click('#chipTray .chip[data-value="5000"]');
  for (const z of ['P', 'B', 'T']) {
    await page.evaluate((zz) => document.querySelector(`#view-baccarat .zone[data-zone="${zz}"]`)?.click(), z);
    await wait(120);
  }
  await page.waitForFunction(() => window.__SB.state().phase === 'dealing', null, { timeout: 30000 });
  await wait(2800);
  await shot(page, '04_mobile');
  results.mobile = await page.evaluate(() => ({
    innerH: window.innerHeight,
    docScroll: document.documentElement.scrollHeight,
    bodyScroll: document.body.scrollHeight,
    state: window.__SB.state()
  }));
  // scroll must not be needed to reach the chip tray
  results.chipTrayVisible = await page.evaluate(() => {
    const r = document.querySelector('#ctChipTray, #chipTray').getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1;
  });
  await page.context().close();
}

if (STAGE === 'crazy') {
  const { page } = await newPage({ width: 1440, height: 900 }, { tag: 'crazy', query: '?game=crazy' });
  await signup(page, `ct${stamp}`);
  await page.waitForSelector('#view-crazy.is-active', { timeout: 10000 });
  await wait(1500);
  await page.click('#ctChipTray .chip[data-value="25000"]');
  for (const z of ['cf', 'pa', 'ch', 'ct', 'n5']) {
    await page.evaluate((zz) => document.querySelector(`#view-crazy .czone[data-zone="${zz}"]`)?.click(), z);
    await wait(120);
  }
  await shot(page, '05_crazy_time_betting');
  await page.waitForFunction(() => ['dealing', 'result'].includes(window.__SB.state().phase), null, { timeout: 60000, polling: 200 });
  await wait(2600);
  await shot(page, '05b_crazy_time_spin');
  await page.waitForFunction(() => window.__SB.state().phase === 'result', null, { timeout: 45000 });
  await wait(1200);
  results.crazy = await page.evaluate(() => window.__SB.state());
  await shot(page, '05_crazy_time_wheel');

  const bonus = await page.waitForSelector('.bonus-overlay', { timeout: 25000 }).catch(() => null);
  if (bonus) {
    await wait(900);
    await shot(page, '06_crazy_time_bonus');
    const title = await page.evaluate(() => document.querySelector('.bonus-overlay h3')?.textContent);
    results.bonusTitle = title;
    for (let i = 0; i < 3; i++) {
      const btn = await page.$('.bonus-overlay .bonus-btn');
      if (btn) { await btn.click(); await wait(3500); }
      const cell = await page.$('.ch-cell');
      if (cell) { await cell.click(); await wait(4000); }
    }
    await wait(3000);
    await shot(page, '06b_crazy_time_bonus_done');
    results.bonusPlayed = true;
  } else {
    results.bonusPlayed = false;
    const next = await page.evaluate(() => window.__SB.sync.crazySpin(window.__SB.state().roundIndex + 1).label);
    results.nextRound = next;
  }
  await page.context().close();
}

if (STAGE === 'sync') {
  const a = await newPage({ width: 1100, height: 720 }, { tag: 'A' });
  const b = await newPage({ width: 1100, height: 720 }, { tag: 'B' });
  await signup(a.page, `syncA${stamp}`);
  await signup(b.page, `syncB${stamp}`);
  await a.page.evaluate(() => document.querySelector('.lobby-card[data-table="speed-c"]').click());
  await b.page.evaluate(() => document.querySelector('.lobby-card[data-table="speed-c"]').click());
  await wait(5000);
  const snap = (page) => page.evaluate(() => {
    const s = window.__SB.state();
    const beads = Array.from(document.querySelectorAll('#rmBead .bead')).map((n) => n.textContent.trim()).join('');
    const big = Array.from(document.querySelectorAll('#rmBig .br-cell')).map((n) => n.className.includes('banker') ? 'B' : 'P').join('');
    return {
      roundIndex: s.roundIndex, hand: s.hand, tableId: s.tableId, beads, big,
      dealer: document.querySelector('.dealer-plate span')?.textContent
    };
  });
  const sa = await snap(a.page);
  const sb = await snap(b.page);
  results.syncA = { roundIndex: sa.roundIndex, hand: sa.hand, dealer: sa.dealer, beads: sa.beads.length, big: sa.big.length };
  results.syncB = { roundIndex: sb.roundIndex, hand: sb.hand, dealer: sb.dealer, beads: sb.beads.length, big: sb.big.length };
  results.sameRound = sa.roundIndex === sb.roundIndex;
  results.sameHand = JSON.stringify(sa.hand) === JSON.stringify(sb.hand);
  results.sameRoadmap = sa.beads === sb.beads && sa.big === sb.big;
  results.sameDealer = sa.dealer === sb.dealer;

  await wait(21000);
  const sa2 = await snap(a.page);
  const sb2 = await snap(b.page);
  results.round2 = { a: sa2.hand, b: sb2.hand, sameRound: sa2.roundIndex === sb2.roundIndex, sameHand: JSON.stringify(sa2.hand) === JSON.stringify(sb2.hand), sameRoadmap: sa2.beads === sb2.beads };
  await a.ctx.close();
  await b.ctx.close();
}

await browser.close();
preview.kill('SIGKILL');
console.log('=== STAGE', STAGE, '===');
console.log(JSON.stringify(results, null, 2));
console.log('console errors:', errors.length);
errors.slice(0, 12).forEach((e) => console.log(' -', e));
process.exit(0);
