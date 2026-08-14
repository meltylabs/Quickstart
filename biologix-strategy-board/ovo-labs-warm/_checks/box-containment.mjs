import { chromium } from 'playwright';
const B='http://127.0.0.1:8965'; const F=[]; const ok=[];
const b=await chromium.launch();

// --- desktop checks
let ctx=await b.newContext({viewport:{width:1440,height:1000}});
let p=await ctx.newPage();
p.on('pageerror',e=>F.push('JS EXCEPTION: '+e.message.slice(0,60)));

// 1. JSX comment must not render as text anywhere
await p.goto(B+'/index.html');
await p.evaluate(()=>localStorage.setItem('ovo-labs-demo-cart-v2',JSON.stringify([{slug:'tirzepatide',quantity:2}])));
await p.goto(B+'/cart.html',{waitUntil:'networkidle'});
const jsx=await p.evaluate(()=>/\{\/\*|\*\/\}/.test(document.body.innerText));
jsx?F.push('JSX comment still rendering as text on cart'):ok.push('no JSX comment leaking into the page');

// 2. checkout Apply button must actually apply
await p.goto(B+'/checkout.html',{waitUntil:'networkidle'});
const promo=await p.evaluate(async()=>{
  const f=document.querySelector('[data-promo-form]'), i=document.querySelector('#promo-input');
  if(!f||!i) return 'no promo form on checkout';
  const before=[...document.querySelectorAll('.summary-row')].some(r=>/discount/i.test(r.textContent));
  i.value='OVO-FIRST'; f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
  await new Promise(r=>setTimeout(r,600));
  const after=[...document.querySelectorAll('.summary-row')].some(r=>/discount/i.test(r.textContent));
  return {before,after};
});
(typeof promo==='object'&&promo.after)?ok.push('checkout Apply now applies the discount'):F.push('checkout Apply still inert: '+JSON.stringify(promo));

// 3. no control may exceed its parent's box
for(const [pg,sel] of [['peptides/tirzepatide','.quantity-control'],['catalog','.mini-quantity']]){
  await p.goto(`${B}/${pg}.html`,{waitUntil:'networkidle'});
  if(sel==='.mini-quantity'){ await p.click('[data-cart-open]'); await p.waitForTimeout(600); }
  const spill=await p.evaluate((s)=>{
    const c=document.querySelector(s); if(!c) return 'missing';
    const cr=c.getBoundingClientRect();
    return [...c.querySelectorAll('button,input')].filter(e=>{const r=e.getBoundingClientRect();
      return r.height>cr.height+1||r.right>cr.right+1||r.left<cr.left-1;}).length;
  },sel);
  spill===0?ok.push(`${sel} children stay inside the box`):F.push(`${sel}: ${spill} child(ren) spill`);
}
await ctx.close();

// --- mobile checks
ctx=await b.newContext({viewport:{width:390,height:844}});
p=await ctx.newPage();
await p.goto(B+'/peptides/tirzepatide.html',{waitUntil:'networkidle'});
const qty=await p.evaluate(()=>{
  const i=document.querySelector('#pdp-quantity'); if(!i) return 'missing';
  const r=i.getBoundingClientRect(); const s=getComputedStyle(i);
  return {w:Math.round(r.width),h:Math.round(r.height),color:s.color,visible:r.width>8&&r.height>8};
});
qty.visible?ok.push(`quantity value visible at 390 (${qty.w}x${qty.h})`):F.push('quantity value not visible at 390: '+JSON.stringify(qty));
await b.close();
ok.forEach(o=>console.log('  ok  '+o));
console.log(F.length?'FAILURES:':'FAILURES: none'); F.forEach(f=>console.log('  XX  '+f));
