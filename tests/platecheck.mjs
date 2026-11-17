import { chromium } from 'playwright';
const BASE = 'https://1usenoah.github.io/Speed-baccarat/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('evolab.session.v1', JSON.stringify({ username: 'v2shot7066883' })); });
const page = await ctx.newPage();
await page.goto(BASE + '?game=crazy', { waitUntil: 'load' });
await wait(7000);
const out = await page.evaluate(() => {
  const st = window.__SB.crazy?.studio;
  if (!st) return 'no studio';
  const g = st.wheelGroup;
  const V = g.position.constructor;
  const c = st.camera;
  const plates = g.children.filter((o) => o.geometry?.type === 'PlaneGeometry');
  const sample = [0, 7, 14, 21, 28, 35, 42, 49].map((i) => {
    const p = plates[i];
    if (!p) return null;
    const v = new V(0, 0, 0);
    p.getWorldPosition(v);
    const n = v.clone().project(c);
    return {
      i,
      local: [+p.position.x.toFixed(2), +p.position.y.toFixed(2)],
      r: +Math.hypot(p.position.x, p.position.y).toFixed(2),
      ndc: [+n.x.toFixed(2), +n.y.toFixed(2)],
      rot: +p.rotation.z.toFixed(2)
    };
  });
  return { count: plates.length, sample };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
process.exit(0);
