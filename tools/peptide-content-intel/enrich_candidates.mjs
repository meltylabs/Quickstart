import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const R='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const d=JSON.parse(fs.readFileSync(`${R}/raw/tiktok-civilian-candidates.json`,'utf8'));
const AFF=/[?&](ref|aff|affiliate|a|via|code|coupon|promo|rfsn|partner|referral|discount)=|(^|\.)(refer|referral|invite|partner|go|track)\.|\/(ref|refer|invite|partner|r)\/[A-Za-z0-9._-]+/i;
const CODE=/\b(?:code|coupon|promo)\b\s*:?\s*"?([A-Za-z0-9][A-Za-z0-9_-]{2,18})"?|\b\d{1,2}\s?%\s?off\b/i;
const VEND=/(peptide|peptid|pept|reta|trutide|glp|tirz|sema|biolab|amino|research|chem|kit|vial|pharm)/i;
const unesc=v=>v?String(v).replace(/\\u002F/gi,'/').replace(/\\u0026/gi,'&'):v;
const out=[];
for (const c of d.creators.filter(x=>x.is_civilian)) {
  const r=spawnSync('curl',['-sS','--max-time','28','-A',UA,`https://www.tiktok.com/@${c.handle}`],{encoding:'utf8',maxBuffer:4e7});
  const h=r.stdout||'';
  const g=re=>{const m=h.match(re);return m?unesc(m[1]):null;};
  const bioLink=g(/"bioLink":\{"link":"([^"]*)"/);
  const bio=unesc(g(/"signature":"((?:[^"\\]|\\.)*)"/)||c.bio||'');
  let final=null, aggLinks=[];
  if (bioLink){
    const rr=spawnSync('curl',['-s','-o','/dev/null','-L','--max-time','18','-A',UA,'-w','%{url_effective}',bioLink],{encoding:'utf8'});
    final=rr.stdout||null;
    if(/beacons\.ai|linktr\.ee|stan\.store|allmylinks|komi\.io|snipfeed|milkshake/i.test(bioLink)){
      const p=spawnSync('curl',['-sS','--max-time','22','-A',UA,bioLink],{encoding:'utf8',maxBuffer:2e7});
      const s=new Set();
      for(const m of (p.stdout||'').matchAll(/https?:\\?\/\\?\/([a-z0-9.-]+\.[a-z]{2,})([^"'\s\\<]*)/gi)){
        const host=m[1].replace(/^www\./,'');
        if(/beacons|linktr|tiktok|instagram|youtube|facebook|twitter|x\.com|google|gstatic|cloudflare|fontawesome|amazonaws|cdn|apple|spotify|stripe|paypal/i.test(host))continue;
        s.add(host+(m[2]||'').slice(0,70));
      }
      aggLinks=[...s].slice(0,14);
    }
  }
  const all=[bioLink,final,...aggLinks].filter(Boolean).join(' ');
  const codeM=bio.match(CODE);
  const rec={handle:c.handle,url:`https://www.tiktok.com/@${c.handle}`,followers:c.fans,bio,
    bio_link:bioLink,resolves_to:final,aggregator_links:aggLinks,
    code_in_bio:codeM?(codeM[1]||codeM[0]):null,
    affiliate_param:AFF.test(all),vendor_link:VEND.test(all),
    has_affiliate:AFF.test(all)||VEND.test(all)||!!codeM};
  out.push(rec);
  console.log(`  ${rec.has_affiliate?'AFFILIATE':'  no-link '} @${c.handle.padEnd(23)} f=${String(c.fans).padStart(7)} code=${String(rec.code_in_bio||'-').padEnd(12)} ${(bioLink||'').slice(0,44)}`);
}
const y=out.filter(x=>x.has_affiliate);
fs.writeFileSync(`${R}/raw/tiktok-civilian-affiliates.json`,JSON.stringify({
  cohort:'individual civilian creators with an affiliate link',
  discovery:'Apify TikTok search on query vectors TikTok actually serves. The compound names retatrutide/tirzepatide return ZERO results.',
  probed:out.length,with_affiliate:y.length,creators:out.sort((a,b)=>(b.has_affiliate-a.has_affiliate)||((b.followers||0)-(a.followers||0)))},null,2));
console.log(`\nWITH AFFILIATE LINK: ${y.length} of ${out.length}`);
