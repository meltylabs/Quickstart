import { chromium } from 'playwright';
const B='http://127.0.0.1:8965';
const F=[]; const ok=[];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
p.on('pageerror',e=>F.push('JS EXCEPTION: '+e.message.slice(0,70)));
const seed=async(c)=>{ await p.goto(B+'/index.html'); await p.evaluate(v=>localStorage.setItem('ovo-labs-demo-cart-v2',JSON.stringify(v)),c); };
const w=(ms)=>p.waitForTimeout(ms);

// 1. EMPTY CART states
await seed([]);
for(const pg of ['cart','checkout']){
  await p.goto(`${B}/${pg}.html`,{waitUntil:'networkidle'});
  const t=await p.evaluate(()=>document.body.innerText);
  if(!/empty|nothing to check out|no items/i.test(t)) F.push(`${pg}: empty state missing`);
  else ok.push(`${pg} empty state`);
}

// 2. PROMO CODES
await seed([{slug:'bpc-157',quantity:2}]);
await p.goto(B+'/cart.html',{waitUntil:'networkidle'});
const promo=await p.evaluate(async()=>{
  const out={};
  const f=document.querySelector('[data-promo-form]'); const i=document.querySelector('#promo-input');
  if(!f||!i) return {err:'no promo form'};
  i.value='NOTAREALCODE'; f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
  await new Promise(r=>setTimeout(r,400));
  out.invalid=document.querySelector('[data-promo-feedback]')?.textContent.trim();
  i.value='OVO-FIRST'; f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
  await new Promise(r=>setTimeout(r,500));
  out.valid=document.querySelector('[data-promo-feedback]')?.textContent.trim();
  out.discountRow=[...document.querySelectorAll('.summary-row')].some(r=>/discount/i.test(r.textContent));
  return out;
});
if(!promo.invalid||!/not a valid|invalid/i.test(promo.invalid)) F.push('promo: invalid code gave no error, got '+JSON.stringify(promo.invalid));
else ok.push('promo rejects invalid');
if(!promo.discountRow) F.push('promo: valid code applied no discount row');
else ok.push('promo applies discount');

// 3. QUANTITY EDGES — decrement to zero should remove
await seed([{slug:'bpc-157',quantity:1}]);
await p.goto(B+'/cart.html',{waitUntil:'networkidle'});
await p.evaluate(()=>document.querySelector('[data-cart-quantity][data-delta="-1"]')?.click());
await w(500);
const afterZero=await p.evaluate(()=>JSON.parse(localStorage.getItem('ovo-labs-demo-cart-v2')||'[]'));
if(afterZero.length!==0) F.push(`qty: decrement from 1 left ${JSON.stringify(afterZero)}, expected removal`);
else ok.push('qty decrement to zero removes line');

// 4. RELOAD MID-CHECKOUT preserves draft
await seed([{slug:'bpc-157',quantity:1}]);
await p.goto(B+'/checkout.html',{waitUntil:'networkidle'});
await p.evaluate(()=>{const e=document.querySelector('#email'); e.value='persist@test.com'; e.dispatchEvent(new Event('input',{bubbles:true}));});
await w(400);
await p.reload({waitUntil:'networkidle'});
const persisted=await p.evaluate(()=>document.querySelector('#email')?.value);
if(persisted!=='persist@test.com') F.push(`reload mid-checkout lost the draft (got "${persisted}")`);
else ok.push('checkout draft survives reload');

// 5. BACK BUTTON mid-checkout
await p.goto(B+'/catalog.html',{waitUntil:'networkidle'});
await p.goto(B+'/checkout.html',{waitUntil:'networkidle'});
await p.goBack({waitUntil:'networkidle'});
const backUrl=p.url();
if(!backUrl.includes('catalog')) F.push('back button from checkout went to '+backUrl);
else ok.push('back button works');

// 6. DRAWER open/close + escape
await p.goto(B+'/catalog.html',{waitUntil:'networkidle'});
const trigger=await p.$('[data-cart-open]');
if(!trigger) F.push('SELECTOR GONE: [data-cart-open] not found, drawer untestable');
else await trigger.click();
await w(500);
const opened=await p.evaluate(()=>document.body.classList.contains('drawer-open'));
await p.keyboard.press('Escape'); await w(500);
const closed=await p.evaluate(()=>!document.body.classList.contains('drawer-open'));
if(!opened && trigger) F.push('drawer did not open on cart click');
else if(!closed) F.push('drawer did not close on Escape');
else ok.push('drawer opens and Escape closes');

// 7. TESTING LOOKUP no-match
await p.goto(B+'/testing.html',{waitUntil:'networkidle'});
const lookup=await p.evaluate(async()=>{
  const f=document.querySelector('[data-testing-lookup]'); const i=f?f.querySelector('input'):null;
  if(!i) return 'no lookup form';
  i.value='ZZZNOTHING'; f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
  await new Promise(r=>setTimeout(r,400));
  return document.querySelector('[data-lookup-results]')?.textContent.trim().slice(0,60);
});
if(!/no matching/i.test(String(lookup))) F.push('testing lookup no-match state: '+lookup);
else ok.push('testing lookup handles no-match');

// 8. 404
const r404=await p.goto(B+'/does-not-exist.html').catch(()=>null);
if(r404&&r404.status()===200) F.push('404 route returns 200 for a missing page');
else ok.push('missing page does not 200');

await b.close();
console.log('PASSED:'); ok.forEach(o=>console.log('  ok  '+o));
console.log(F.length?'\nFAILURES:':'\nFAILURES: none'); F.forEach(f=>console.log('  XX  '+f));
