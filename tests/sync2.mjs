import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT=5199, BASE=`http://127.0.0.1:${PORT}/Speed-baccarat/`;
const pv = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{cwd:'/workspace/projects/speed-baccarat',stdio:'ignore'});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<40;i++){try{if((await fetch(BASE)).ok)break;}catch(e){}await wait(250);}
const b = await chromium.launch({executablePath:'/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const mk = async () => { const c = await b.newContext({viewport:{width:900,height:600}}); const p = await c.newPage();
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto(BASE,{waitUntil:'load'}); await wait(1500); return p; };
const A = await mk(), B = await mk();
const probe = (p) => p.evaluate(() => {
  const idx = window.__SB.sync.roundIndexFor('baccarat','speed-c');
  const out = [];
  for (let i = idx-3; i <= idx+3; i++) {
    const h = window.__SB.sync.baccaratHand('speed-c', i);
    out.push(`${i}:${h.result}:${h.playerTotal}-${h.bankerTotal}:${h.steps.map(s=>s.card.rank+s.card.suit).join('')}`);
  }
  return { idx, rounds: out, dealer: window.__SB.sync.roundPhase('baccarat','speed-c') };
});
const ra = await probe(A), rb = await probe(B);
console.log('A idx', ra.idx, 'B idx', rb.idx, 'sameIdx', ra.idx===rb.idx);
console.log('A', ra.rounds[0]);
console.log('B', rb.rounds[0]);
console.log('IDENTICAL HANDS:', JSON.stringify(ra.rounds)===JSON.stringify(rb.rounds));
console.log('phase same:', ra.dealer.phase===rb.dealer.phase, ra.dealer.phase, Math.round(ra.dealer.timeLeft));
// crazy time determinism
const ca = await A.evaluate(()=>{const idx=window.__SB.sync.roundIndexFor('crazy','crazy');return [idx, [0,1,2].map(k=>window.__SB.sync.crazySpin(idx+k)).map(s=>`${s.segment}|${s.topSlotA}|${s.topSlotB}|${s.topSlotWin}|${s.stop}`)];});
const cb = await B.evaluate(()=>{const idx=window.__SB.sync.roundIndexFor('crazy','crazy');return [idx, [0,1,2].map(k=>window.__SB.sync.crazySpin(idx+k)).map(s=>`${s.segment}|${s.topSlotA}|${s.topSlotB}|${s.topSlotWin}|${s.stop}`)];});
console.log('CT same:', JSON.stringify(ca)===JSON.stringify(cb), ca[1]);
await b.close(); pv.kill('SIGKILL'); process.exit(0);
