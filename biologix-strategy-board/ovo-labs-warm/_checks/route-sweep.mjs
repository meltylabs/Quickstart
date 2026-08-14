import { chromium } from 'playwright';
const B='http://127.0.0.1:8965';
const PAGES=['index','catalog','testing','bundles','notes','faq','policies','company','eligibility',
 'cart','checkout','order-confirmation','404','peptides/retatrutide','peptides/bpc-157',
 'peptides/semaglutide','peptides/tirzepatide','peptides/cagrilintide','peptides/tb-500',
 'peptides/cjc-1295','peptides/ipamorelin','peptides/bpc-tb-blend','peptides/cjc-ipamorelin-blend',
 'notes/coa-boundaries','notes/choosing-by-molecule','notes/reading-testing-status'];
const issues=[];
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
p.on('pageerror',e=>issues.push({sev:'critical',pg:cur,what:'JS exception: '+e.message.slice(0,70)}));
p.on('console',m=>{ if(m.type()==='error') issues.push({sev:'high',pg:cur,what:'console: '+m.text().slice(0,70)}); });
p.on('requestfailed',r=>{ const u=r.url(); if(!u.includes('favicon')) issues.push({sev:'high',pg:cur,what:'req failed: '+u.slice(-50)}); });
let cur='';
await p.goto(B+'/index.html');
await p.evaluate(()=>localStorage.setItem('ovo-labs-demo-cart-v2',JSON.stringify([{slug:'bpc-157',quantity:2}])));

for(const pg of PAGES){
  cur=pg;
  const res=await p.goto(`${B}/${pg}.html`,{waitUntil:'networkidle'}).catch(e=>null);
  if(!res||!res.ok()) { issues.push({sev:'critical',pg,what:`HTTP ${res?res.status():'ERR'}`}); continue; }
  const r=await p.evaluate(async()=>{
    window.scrollTo(0,document.body.scrollHeight); await new Promise(x=>setTimeout(x,350)); window.scrollTo(0,0);
    const broken=[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src.slice(-40));
    const empty=[...document.querySelectorAll('a[href],button')].filter(e=>!e.textContent.trim()&&!e.getAttribute('aria-label')).length;
    const badHref=[...document.querySelectorAll('a[href]')].filter(a=>{const h=a.getAttribute('href');return h==='#'||h===''||h==='javascript:void(0)';}).length;
    const rendered=document.querySelector('#site-root')?.children.length||0;
    return {broken,empty,badHref,rendered,title:document.title,h1:document.querySelectorAll('h1').length};
  });
  if(r.rendered===0) issues.push({sev:'critical',pg,what:'site-root empty, page did not render'});
  r.broken.forEach(s=>issues.push({sev:'high',pg,what:'broken image '+s}));
  if(r.empty) issues.push({sev:'medium',pg,what:`${r.empty} control(s) with no label`});
  if(r.badHref) issues.push({sev:'medium',pg,what:`${r.badHref} placeholder href`});
  if(!r.title||r.title.length<8) issues.push({sev:'medium',pg,what:'weak/missing <title>'});
  if(r.h1!==1) issues.push({sev:'medium',pg,what:`${r.h1} h1 elements (want exactly 1)`});
}
await b.close();
const by={critical:[],high:[],medium:[]};
issues.forEach(i=>(by[i.sev]||=[]).push(i));
console.log(`PAGES TESTED: ${PAGES.length}`);
for(const s of ['critical','high','medium']){
  const list=by[s]||[];
  console.log(`\n${s.toUpperCase()}: ${list.length}`);
  const seen=new Set();
  list.forEach(i=>{const k=i.what.slice(0,45); if(seen.has(k))return; seen.add(k); console.log(`  ${i.pg.padEnd(30)} ${i.what}`);});
}
