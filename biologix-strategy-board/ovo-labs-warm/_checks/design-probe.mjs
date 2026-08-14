import { chromium } from 'playwright';
import fs from 'fs';
const B='http://127.0.0.1:8965';
const OUT='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/defects.json';
const PAGES=['index','catalog','testing','bundles','notes','faq','policies','company',
 'eligibility','cart','checkout','order-confirmation','404','peptides/retatrutide','peptides/bpc-157'];
const SCALE=[4,8,12,16,24,32,48,64,96];

const probe = () => {
  const SCALE=[4,8,12,16,24,32,48,64,96];
  const R={spacing:[],type:[],color:[],align:{},contrast:[],tap:[],overflow:[],components:{}};
  const lum=c=>{const m=c.match(/[\d.]+/g);if(!m)return null;const[r,g,b]=m.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
  const ratio=(a,b)=>{const l1=lum(a),l2=lum(b);if(l1==null||l2==null)return null;const[h,lo]=[Math.max(l1,l2),Math.min(l1,l2)];return (h+.05)/(lo+.05)};
  const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){const c=getComputedStyle(n).backgroundColor;if(c&&!c.includes('rgba(0, 0, 0, 0)'))return c;n=n.parentElement}return 'rgb(255,255,255)'};

  const els=[...document.querySelectorAll('body *')].filter(e=>{
    const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(e).display!=='none';
  });

  for(const e of els){
    const s=getComputedStyle(e), r=e.getBoundingClientRect();
    const cls=(typeof e.className==='string'?e.className:'').split(' ').filter(Boolean)[0]||e.tagName.toLowerCase();

    // off-scale spacing
    for(const p of ['paddingTop','paddingBottom','paddingLeft','paddingRight','marginTop','marginBottom','gap','rowGap','columnGap']){
      const v=parseFloat(s[p]); if(!v||Number.isNaN(v)) continue;
      if(!SCALE.includes(Math.round(v))) R.spacing.push({cls,prop:p,value:Math.round(v)});
    }
    // type + colour inventory
    R.type.push(`${Math.round(parseFloat(s.fontSize))}/${s.fontWeight}`);
    if(s.color) R.color.push(s.color);

    // left-edge histogram for top-level blocks
    if(r.width>200){ const L=Math.round(r.left); R.align[L]=(R.align[L]||0)+1; }

    // contrast for real text
    const txt=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1);
    if(txt){
      const cr=ratio(s.color,bgOf(e));
      const size=parseFloat(s.fontSize), bold=parseInt(s.fontWeight)>=700;
      const need=(size>=24||(size>=18.66&&bold))?3:4.5;
      if(cr!==null&&cr<need) R.contrast.push({cls,text:e.textContent.trim().slice(0,32),ratio:+cr.toFixed(2),need,size:Math.round(size)});
    }
    // tap targets
    if(['A','BUTTON','INPUT','SELECT'].includes(e.tagName)&&(r.width<44||r.height<44)&&r.width>0)
      R.tap.push({cls,tag:e.tagName,w:Math.round(r.width),h:Math.round(r.height),label:e.textContent.trim().slice(0,24)});
    // overflow past viewport
    if(r.right>window.innerWidth+1) R.overflow.push({cls,right:Math.round(r.right)});

    // component fingerprint for cross-page consistency
    if(cls&&/^[a-z]/.test(cls)) {
      R.components[cls]=`${s.padding}|${s.fontSize}|${s.borderRadius}|${s.gap}`;
    }
  }
  return R;
};

const browser=await chromium.launch();
const db={pages:{},summary:{}};
for(const [label,w,h] of [['d',1440,900],['m',390,844]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  const pg=await ctx.newPage();
  await pg.goto(B+'/index.html');
  await pg.evaluate(()=>localStorage.setItem('ovo-labs-demo-cart-v2',JSON.stringify([{slug:'bpc-157',quantity:2},{slug:'semaglutide',quantity:1}])));
  for(const p of PAGES){
    try{
      await pg.goto(`${B}/${p}.html`,{waitUntil:'networkidle'});
      db.pages[`${label}:${p}`]=await pg.evaluate(probe);
    }catch(e){ db.pages[`${label}:${p}`]={error:e.message.slice(0,80)} }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT,JSON.stringify(db,null,1));
console.log('probed',Object.keys(db.pages).length,'page/width combos');
