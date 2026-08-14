import { chromium } from 'playwright';
const B='http://127.0.0.1:8965'; const F=[]; const ok=[];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
p.on('pageerror',e=>F.push('JS EXCEPTION: '+e.message.slice(0,60)));
await p.goto(B+'/index.html');
await p.evaluate(()=>localStorage.setItem('ovo-labs-demo-cart-v2',JSON.stringify([{slug:'bpc-157',quantity:1}])));
await p.goto(B+'/catalog.html',{waitUntil:'networkidle'});

await p.click('[data-cart-open]'); await p.waitForTimeout(600);
const open=await p.evaluate(()=>({open:document.querySelector('[data-cart-drawer]')?.getAttribute('data-open'),
  body:document.body.classList.contains('drawer-open'),
  items:document.querySelectorAll('.cart-item').length,
  crossSell:document.querySelectorAll('.drawer-cross-row').length,
  shipBar:!!document.querySelector('.drawer-ship'),
  checkoutHref:document.querySelector('.cart-checkout')?.getAttribute('href')}));
if(open.open!=='true') F.push('drawer did not open'); else ok.push('drawer opens');
if(open.items!==1) F.push(`drawer shows ${open.items} items, expected 1`); else ok.push('drawer renders the line');
if(!open.shipBar) F.push('shipping progress bar missing'); else ok.push('shipping progress renders');
if(open.crossSell<1) F.push('cross-sell empty'); else ok.push(`cross-sell renders ${open.crossSell}`);
if(!open.checkoutHref?.includes('checkout')) F.push('checkout link wrong: '+open.checkoutHref); else ok.push('checkout link correct');

// focus trap + escape
const focusIn=await p.evaluate(()=>document.activeElement?.closest('[data-cart-drawer]')!==null);
if(!focusIn) F.push('focus not moved into drawer on open'); else ok.push('focus moves into drawer');
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
const closed=await p.evaluate(()=>document.querySelector('[data-cart-drawer]')?.getAttribute('data-open'));
if(closed!=='false') F.push('Escape did not close drawer'); else ok.push('Escape closes drawer');

// quantity from inside the drawer
await p.click('[data-cart-open]'); await p.waitForTimeout(500);
await p.click('[data-cart-quantity][data-delta="1"]'); await p.waitForTimeout(600);
const q=await p.evaluate(()=>JSON.parse(localStorage.getItem('ovo-labs-demo-cart-v2')||'[]')[0]?.quantity);
if(q!==2) F.push(`drawer qty increment gave ${q}, expected 2`); else ok.push('drawer quantity works');

// cross-sell add
const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('ovo-labs-demo-cart-v2')||'[]').length);
await p.click('.drawer-cross-add').catch(()=>{}); await p.waitForTimeout(600);
const after=await p.evaluate(()=>JSON.parse(localStorage.getItem('ovo-labs-demo-cart-v2')||'[]').length);
if(after!==before+1) F.push(`cross-sell add: ${before} -> ${after}, expected +1`); else ok.push('cross-sell add works');

await b.close();
ok.forEach(o=>console.log('  ok  '+o));
console.log(F.length?'FAILURES:':'FAILURES: none'); F.forEach(f=>console.log('  XX  '+f));
