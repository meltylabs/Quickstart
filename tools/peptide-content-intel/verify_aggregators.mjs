import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const R='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const d=JSON.parse(fs.readFileSync(`${R}/raw/civilian-cohort.json`,'utf8'));
// A peptide/GLP-1 vendor or telehealth destination. Deliberately excludes
// generic supplement/Amazon links - those are not the affiliate lane we care about.
const VENDOR=/(peptide|peptid|pept|reta|trutide|glp1|glp-1|tirz|sema|biolab|bio-lab|amino|pepkit|spartanbio|peptora|boltpharmacy|researchchem|vial|compound|telehealth|orderly|hims|hers|weightcare|slim|zepbound|mounjaro|ozempic|wegovy)/i;
const NOISE=/(beacons|linktr|tiktok|instagram|youtube|facebook|twitter|x\.com|google|gstatic|cloudflare|fontawesome|amazonaws|cdn|apple|spotify|stripe|paypal|venmo|cashapp|w3\.org|schema\.org|jsdelivr|unpkg|sentry|segment|hotjar|gtm|doubleclick|licdn|pinterest|snapchat|threads|whatsapp|telegram|discord|patreon|onlyfans|fanfix|substack|mailchimp|beehiiv|convertkit|calendly|typeform|forms\.gle|docs\.google|drive\.google)/i;
const out=[];
for (const c of d.creators.filter(x=>x.qualifies)) {
  const link=c.bio_link;
  let vendors=[], all=[], amazonAffiliate=[];
  const isAgg=/beacons\.ai|linktr\.ee|stan\.store|allmylinks|komi\.io|snipfeed|milkshake|withkoji|tap\.bio/i.test(link||'');
  if (isAgg) {
    const r=spawnSync('curl',['-sSL','--max-time','30','-A',UA,link],{encoding:'utf8',maxBuffer:3e7});
    const html=r.stdout||'';
    const s=new Set();
    for (const m of html.matchAll(/https?:\\?\/\\?\/([a-z0-9.-]+\.[a-z]{2,})([^"'\s\\<)]*)/gi)) {
      const host=m[1].replace(/^www\./,'');
      if (NOISE.test(host)) continue;
      s.add(host+(m[2]||'').slice(0,80));
    }
    all=[...s].slice(0,25);
    vendors=all.filter(u=>VENDOR.test(u) && !/amazon\.|amzn\.|a\.co\//i.test(u));
    amazonAffiliate=all.filter(u=>/amazon\.|amzn\.|a\.co\//i.test(u) && /[?&]tag=/i.test(u));
  } else {
    all=[link].filter(Boolean);
    vendors=all.filter(u=>VENDOR.test(u) && !/amazon\.|amzn\./i.test(u));
  }
  const verified = vendors.length>0 || !!c.code_in_bio;
  out.push({...c, amazon_associates_links:amazonAffiliate, aggregator_is_link_hub:isAgg, aggregator_all_outbound:all,
    peptide_vendor_links:vendors,
    affiliate_verified:verified,
    verification:verified
      ? (vendors.length? 'peptide/GLP-1 vendor link confirmed behind bio link' : 'discount code stated in bio')
      : 'bio link exists but NO peptide vendor found behind it - unverified'});
  console.log(`  ${verified?'VERIFIED  ':'unverified'} @${c.handle.padEnd(23)} f=${String(c.followers).padStart(7)} vendors=${vendors.length?vendors.slice(0,2).join(', ').slice(0,58):'none'}`);
}
const v=out.filter(x=>x.affiliate_verified);
const merged=d.creators.map(c=>{const o=out.find(x=>x.handle===c.handle);return o||{...c,affiliate_verified:false};});
fs.writeFileSync(`${R}/raw/civilian-cohort.json`,JSON.stringify({...d,
  verified_affiliate:v.length,creators:merged.sort((a,b)=>(b.affiliate_verified-a.affiliate_verified)||((b.followers||0)-(a.followers||0)))},null,2));
console.log(`\nVERIFIED peptide affiliate: ${v.length} of ${out.length} that had a bio link`);
