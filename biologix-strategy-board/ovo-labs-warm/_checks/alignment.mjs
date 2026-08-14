import { chromium } from 'playwright';
const B='http://127.0.0.1:8965';
const PAGES=['index','catalog','testing','bundles','notes','faq','policies','company',
 'eligibility','cart','checkout','order-confirmation','peptides/retatrutide'];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto(B+'/index.html');
await p.evaluate(()=>localStorage.setItem('ovo-labs-demo-cart-v2',JSON.stringify([{slug:'bpc-157',quantity:2}])));
for(const pg of PAGES){
  await p.goto(`${B}/${pg}.html`,{waitUntil:'networkidle'});
  const r=await p.evaluate(()=>{
    const shell=document.querySelector('.shell');
    if(!shell) return null;
    const SL=Math.round(shell.getBoundingClientRect().left);
    // headings + primary text blocks that SHOULD share the shell axis
    const sel='h1,h2,h3,.eyebrow,p,li,label,.summary-row,.spec-row,.testing-row,.document-row';
    const off={};
    for(const e of document.querySelectorAll(sel)){
      const r=e.getBoundingClientRect();
      if(r.width<80||r.height===0) continue;
      if(e.closest('.cart-drawer,.mobile-drawer,.order-summary,.testing-document,aside')) continue;
      const L=Math.round(r.left);
      if(Math.abs(L-SL)>2 && L<SL+120){ (off[L] ||= new Set()).add(String(e.className).split(' ')[0]||e.tagName); }
    }
    return {SL, off:Object.fromEntries(Object.entries(off).map(([k,v])=>[k,[...v].slice(0,4)]))};
  });
  if(!r) { console.log(`${pg}: no shell`); continue; }
  const bad=Object.keys(r.off);
  console.log(`${pg.padEnd(24)} shell=${r.SL}  ${bad.length? 'OFF-AXIS: '+bad.map(k=>`${k}(${r.off[k].join('/')})`).join('  ') : 'aligned'}`);
}
await b.close();
