import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT=5199, BASE=`http://127.0.0.1:${PORT}/Speed-baccarat/`;
const pv = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{cwd:'/workspace/projects/speed-baccarat',stdio:'ignore'});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<40;i++){try{if((await fetch(BASE)).ok)break;}catch(e){}await wait(250);}
const b = await chromium.launch({executablePath:'/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const page = await ctx.newPage();
page.on('console',m=>{if(m.type()==='error')console.log('ERR',m.text())});
page.on('pageerror',e=>console.log('PAGEERR',e.message));
await page.goto(BASE+'?game=crazy',{waitUntil:'load'});
await wait(2500);
console.log('crazy obj?', await page.evaluate(()=>({c: !!window.__SB.crazy, st: window.__SB.state().phase, badges: document.querySelector('#statusBadge')?.textContent})));
await page.click('.auth-tabs button[data-mode="signup"]');
await page.fill('#authUser','c'+String(Date.now()).slice(-7));
await page.fill('#authPass','pass1234');
await page.fill('#authPass2','pass1234');
await page.click('.auth-submit');
await wait(3000);
console.log('after signup', await page.evaluate(()=>({c: !!window.__SB.crazy, st: window.__SB.state(), badge: document.querySelector('#statusBadge')?.textContent})));
for(let i=0;i<18;i++){await wait(1500);console.log(i, JSON.stringify(await page.evaluate(()=>{const g=window.__SB.crazy;const s=window.__SB.state();return {p:g.phase,t:s.timeLeft,r:s.roundIndex,ticks:g.tickCount,sp:g.spinning,se:g.settled,cat:g.cfgErr||null,err:window.__lastErr?window.__lastErr.slice(0,120):null};})));}
await b.close(); pv.kill('SIGKILL'); process.exit(0);
