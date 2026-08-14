import { chromium } from 'playwright';
const B='http://127.0.0.1:8965';
const PAGES=['index','catalog','testing','bundles','cart','checkout','peptides/retatrutide','faq','policies'];
const b=await chromium.launch(); const bad=[];
for(const [tag,w] of [['mob',390],['desk',1440]]){
  const ctx=await b.newContext({viewport:{width:w,height:844}});
  const p=await ctx.newPage();
  await p.goto(B+'/index.html');
  await p.evaluate(()=>localStorage.setItem('ovo-labs-demo-cart-v2',JSON.stringify([{slug:'bpc-157',quantity:2}])));
  for(const pg of PAGES){
    await p.goto(`${B}/${pg}.html`,{waitUntil:'networkidle'});
    const r=await p.evaluate(()=>{
      const de=document.documentElement;
      const zero=[...document.querySelectorAll('body *')].filter(e=>{
        const b=e.getBoundingClientRect(); const s=getComputedStyle(e);
        return s.display!=='none' && e.children.length>0 && b.width===0 && b.height>0;
      }).length;
      return {ov:de.scrollWidth-de.clientWidth, zero};
    });
    if(r.ov>1||r.zero>0) bad.push(`${tag}:${pg} overflow=${r.ov} zeroWidthContainers=${r.zero}`);
  }
  await ctx.close();
}
await b.close();
console.log(bad.length?bad.join('\n'):'CLEAN: no overflow, no collapsed containers on any page at either width');
