import { chromium } from 'playwright';
const B='http://127.0.0.1:8965';
const b=await chromium.launch(); const fails=[];
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
p.on('console',m=>{ if(m.type()==='error') fails.push('CONSOLE: '+m.text().slice(0,80)); });
p.on('requestfailed',r=>fails.push('REQ FAILED: '+r.url().slice(-60)));

// 1. full purchase path
await p.goto(B+'/catalog.html',{waitUntil:'networkidle'});
await p.evaluate(()=>localStorage.clear());
await p.reload({waitUntil:'networkidle'});
const addBtn=await p.$('.product-card:not(:has(.add-button[disabled])) .add-button');
if(!addBtn) fails.push('no enabled add button on catalog');
else { await addBtn.click(); await p.waitForTimeout(500); }
let cart=await p.evaluate(()=>JSON.parse(localStorage.getItem('ovo-labs-demo-cart-v2')||'[]'));
if(cart.length!==1) fails.push(`add-to-cart broken: cart=${JSON.stringify(cart)}`);

// 2. sell gate under DOM bypass
await p.goto(B+'/catalog.html',{waitUntil:'networkidle'});
const gate=await p.evaluate(async()=>{
  const c=[...document.querySelectorAll('.product-card')].find(x=>/Retatrutide/.test(x.textContent));
  const btn=c?.querySelector('.add-button'); if(!btn) return 'no retatrutide card';
  const before=JSON.parse(localStorage.getItem('ovo-labs-demo-cart-v2')||'[]').length;
  btn.disabled=false; btn.click();
  await new Promise(r=>setTimeout(r,400));
  const after=JSON.parse(localStorage.getItem('ovo-labs-demo-cart-v2')||'[]').length;
  return after===before ? 'held' : 'BREACHED';
});
if(gate!=='held') fails.push('SELL GATE: '+gate);

// 3. checkout completes
await p.goto(B+'/checkout.html',{waitUntil:'networkidle'});
let done='';
try{ done=await p.evaluate(async()=>{
  const w=(ms)=>new Promise(r=>setTimeout(r,ms));
  const set=(id,v)=>{const e=document.querySelector('#'+id); if(!e) return false; e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); return true;};
  if(!document.querySelector('[data-checkout-form]')) return 'no form';
  set('email','a@b.com'); set('phone','4155550142');
  document.querySelector('[data-next="contact"]')?.click(); await w(200);
  set('firstName','A'); set('lastName','B'); set('address1','1 Market St'); set('city','SF');
  const st=document.querySelector('#state'); if(st){st.value='CA';st.dispatchEvent(new Event('change',{bubbles:true}));}
  set('zip','94105');
  document.querySelector('[data-next="shipping"]')?.click(); await w(200);
  document.querySelector('[data-next="delivery"]')?.click(); await w(200);
  document.querySelector('[data-next="payment"]')?.click(); await w(200);
  const t=document.querySelector('[name="terms"]'); if(t){t.checked=true;t.dispatchEvent(new Event('change',{bubbles:true}));}
  await w(150);
  document.querySelector('[data-place-order]')?.click(); await w(800);
  return location.pathname;
}); }catch(e){ await p.waitForTimeout(600); done=p.url(); }
if(!String(done).includes('order-confirmation')) fails.push('checkout did not complete: '+done);

// 4. payment stores no card data
const card=await p.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('ovo-labs-orders-v1')||'[]')[0]||{}).includes('4242'));
if(card) fails.push('ORDER CONTAINS CARD DATA');

// 5. search
await p.goto(B+'/catalog.html',{waitUntil:'networkidle'});
const s=await p.evaluate(async()=>{
  const i=document.querySelector('.search-input'); if(!i) return 'no search';
  i.value='reta'; i.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,500));
  return document.querySelectorAll('.search-result').length;
});
if(!(s>0)) fails.push('search returned '+s);

await b.close();
console.log(fails.length? 'FUNCTIONAL FAILURES:\n  '+fails.join('\n  ') : 'FUNCTIONAL: all green (add-to-cart, sell gate, full checkout, no card data, search)');
