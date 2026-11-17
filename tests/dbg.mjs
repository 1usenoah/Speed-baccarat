import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT=5199, BASE=`http://127.0.0.1:${PORT}/Speed-baccarat/`;
const pv = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort','--host','127.0.0.1'],{cwd:'/workspace/projects/speed-baccarat',stdio:'ignore'});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<40;i++){try{if((await fetch(BASE)).ok)break;}catch(e){}await wait(250);}
const b = await chromium.launch({executablePath:'/workspace/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({viewport:{width:1280,height:800}});
const page = await ctx.newPage();
page.on('console',m=>console.log('CONSOLE',m.type(),m.text()));
page.on('pageerror',e=>console.log('PAGEERROR',e.message,'\n',e.stack));
await page.goto(BASE,{waitUntil:'load'});
await wait(1500);
await page.click('.auth-tabs button[data-mode="signup"]');
await page.fill('#authUser','dbguser1');
await page.fill('#authPass','pass1234');
await page.fill('#authPass2','pass1234');
await page.click('.auth-submit');
await wait(1500);
console.log('authErr:', await page.evaluate(()=>document.querySelector('#authErr')?.textContent||'(none)'));
console.log('modal?', await page.evaluate(()=>!!document.querySelector('.modal-backdrop')));
console.log('state after signup', await page.evaluate(()=>window.__SB.state()));
console.log('modal:', await page.evaluate(()=>document.querySelector('#modalRoot')?.innerText||'(none)'));
console.log('lobby cards:', await page.evaluate(()=>document.querySelectorAll('.lobby-card').length));
await page.evaluate(()=>{const c=document.querySelector('.lobby-card[data-table=\"speed-a\"]'); c && c.click();});
for (let i=0;i<14;i++){ await wait(2000); console.log(i, JSON.stringify(await page.evaluate(()=>{const s=window.__SB.state(); return {now:Date.now(),p:s.phase,t:s.timeLeft,r:s.roundIndex,ridx:window.__SB.baccarat.roundIndex};}))); }
console.log('err', await page.evaluate(()=>window.__lastErr||null));
await b.close(); pv.kill('SIGKILL'); process.exit(0);
