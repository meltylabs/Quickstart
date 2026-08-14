#!/usr/bin/env node
/* Enrich the 365 discovered TikTok handles with bio + bioLink + stats, then keep
 * only individual civilians who carry an affiliate link.
 *
 * 1 credit per handle. Hard-capped by CREDIT_BUDGET. Cached per handle, so a
 * re-run costs nothing for handles already fetched.
 *
 * Uses SC's own isOrganization / commerceUserInfo flags for company detection,
 * which beat regex guessing on the handle. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const ROOT='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const CACHE=`${ROOT}/cache/sc-profile`; fs.mkdirSync(CACHE,{recursive:true});
const KEY=spawnSync('python3',['-c','import sys;sys.path.insert(0,"/Users/alexweinstein/growth-operating/ovo-outbound/inner_resurface");import creds;print(creds.sc_key())'],{encoding:'utf8'}).stdout.trim();
const BUDGET=Number(process.env.CREDIT_BUDGET||400);
let spent=0, remaining=null;

const CLINICIAN=/(\bmd\b|md$|^dr[\s._]|\bdr\.|doctor|physician|surgeon|\brn\b|rn$|nurse|\bnp\b|\bpa-?c\b|\brd\b|rd$|dietit|pharmacist|pharmd|\bphd\b|clinician|practitioner|chiropract|naturopath|dermatolog|\bdo\b$|aesthetic nurse|injector)/i;
const COMPANY=/(supply|supplies|official|\bshop\b|\bstore\b|\bhq\b|\binc\b|\bllc\b|\bltd\b|labs?\b|laborator|solutions|group|\bbrand\b|clinic|medspa|med spa|telehealth|pharmacy|wholesale|distribut|vendor|dispatch|we ship|order now|worldwide shipping|dm to order|\bteam\b|\bnews\b|\btv\b|magazine)/i;
const COACH=/(coach|coaching|trainer|\bcpt\b|nutritionist|mentor|consultant|academy|helping (you|women|men)|transform your)/i;
const CIVILIAN_VOICE=/(\bmy\b|\bi\b|\bme\b|journey|down \d+|-\d+ ?lbs?|sw ?:?\d+|cw ?:?\d+|gw ?:?\d+|lost \d+|\d+ ?lbs? (down|lost|gone)|mom|mum|sahm|wife|husband|girl|guy|documenting)/i;
const AFF_PARAM=/[?&](ref|aff|affiliate|a|via|code|coupon|promo|rfsn|partner|referral|discount|bp)=|(^|\/\/|\.)(refer|referral|invite|partner|go|track)\.|\/(ref|refer|invite|partner|r)\/[A-Za-z0-9._-]+/i;
const CODE_IN_BIO=/\b(?:code|coupon|promo)\b\s*:?\s*"?([A-Za-z0-9][A-Za-z0-9_-]{2,18})"?|\b\d{1,2}\s?%\s?off\b|[£$]\d+\s?off/i;
const VENDOR=/(peptide|peptid|pept|reta|trutide|glp1|glp-1|tirz|sema|biolab|bio-lab|amino|pepkit|spartanbio|peptora|boltpharmacy|researchchem|vial|compound|telehealth|orderly|weightcare|slim|zepbound|mounjaro|ozempic|wegovy|shed|ellie)/i;
const NOISE=/(beacons|linktr|tiktok|instagram|youtube|facebook|twitter|x\.com|google|gstatic|cloudflare|fontawesome|amazonaws|cdn|apple|spotify|stripe|paypal|venmo|cashapp|w3\.org|schema\.org|jsdelivr|unpkg|sentry|segment|hotjar|gtm|doubleclick|licdn|pinterest|snapchat|threads|whatsapp|telegram|discord|patreon|onlyfans|substack|mailchimp|beehiiv|convertkit|calendly|typeform|forms\.gle|docs\.google|drive\.google|amazon|amzn)/i;
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function profile(h){
  const cf=`${CACHE}/${h.replace(/[^a-z0-9._-]/gi,'_')}.json`;
  if(fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf,'utf8'));
  if(spent>=BUDGET) return null;
  const r=spawnSync('curl',['-s','--max-time','35',`https://api.scrapecreators.com/v1/tiktok/profile?handle=${encodeURIComponent(h)}`,'-H',`x-api-key: ${KEY}`],{encoding:'utf8',maxBuffer:3e7});
  let j; try{ j=JSON.parse(r.stdout||'{}'); }catch(e){ j={success:false}; }
  if(typeof j.credits_charged==='number') spent+=j.credits_charged;
  if(typeof j.credits_remaining==='number') remaining=j.credits_remaining;
  fs.writeFileSync(cf,JSON.stringify(j));
  return j;
}
function crawlAgg(url){
  const r=spawnSync('curl',['-sSL','--max-time','25','-A',UA,url],{encoding:'utf8',maxBuffer:2e7});
  const s=new Set();
  for(const m of (r.stdout||'').matchAll(/https?:\\?\/\\?\/([a-z0-9.-]+\.[a-z]{2,})([^"'\s\\<)]*)/gi)){
    const host=m[1].replace(/^www\./,''); if(NOISE.test(host)) continue;
    s.add(host+(m[2]||'').slice(0,90));
  }
  return [...s].slice(0,25);
}

const disc=JSON.parse(fs.readFileSync(`${ROOT}/raw/sc-tiktok-search.json`,'utf8'));
const rows=[]; let i=0;
for(const c of disc.creators){
  i++;
  const j=profile(c.handle);
  if(!j){ console.log(`  BUDGET STOP at ${i}/${disc.creators.length}`); break; }
  const u=j.user||{}; const st=j.statsV2||j.stats||{};
  const bio=u.signature||''; const nick=u.nickname||'';
  const followers=Number(st.followerCount??c.followers??0)||null;
  const bioLink=(u.bioLink&&u.bioLink.link)||null;
  const bioNoUrl=bio.replace(/https?:\/\/\S+/gi,' ').replace(/\b[a-z0-9-]{2,40}\.(?:com|co\.uk|co|io|net|org|shop|store|app|nl|is)\b\S*/gi,' ').replace(/\bcode\b\s*"?[A-Za-z0-9]+"?/gi,' ').replace(/\S+@\S+/g,' ');
  const idText=`${c.handle} ${nick} ${bioNoUrl}`;

  let agg=[], vendors=[];
  if(bioLink){
    if(/beacons\.ai|linktr\.ee|stan\.store|allmylinks|komi\.io|snipfeed|milkshake|withkoji|tap\.bio|hoo\.be/i.test(bioLink)) agg=crawlAgg(bioLink);
    else agg=[bioLink];
    vendors=agg.filter(x=>VENDOR.test(x)&&!/amazon|amzn/i.test(x));
  }
  const codeM=bio.match(CODE_IN_BIO);
  const affParam=AFF_PARAM.test([bioLink,...agg].filter(Boolean).join(' '));
  const hasAff=vendors.length>0||!!codeM||(affParam&&vendors.length>0);

  const reasons=[];
  if(u.isOrganization) reasons.push('TikTok flags this as an organization account');
  if(CLINICIAN.test(idText)) reasons.push('clinician / credentialed');
  if(COMPANY.test(idText)) reasons.push('company / brand account');
  if(COACH.test(idText)) reasons.push('coach / program seller');
  if(u.privateAccount) reasons.push('private account');
  if(followers!=null&&followers<250) reasons.push(`only ${followers} followers`);
  if(followers!=null&&followers>1000000) reasons.push(`${followers} followers - media/celebrity scale, not a civilian affiliate`);

  rows.push({handle:c.handle,url:`https://www.tiktok.com/@${c.handle}`,nickname:nick,bio,
    followers,hearts:Number(st.heartCount||0)||null,videos:Number(st.videoCount||0)||null,
    is_organization:!!u.isOrganization,private:!!u.privateAccount,
    bio_link:bioLink,bio_link_risk:(u.bioLink&&u.bioLink.risk)??null,
    aggregator_links:agg,peptide_vendor_links:vendors,code_in_bio:codeM?(codeM[1]||codeM[0]):null,
    civilian_voice:CIVILIAN_VOICE.test(bioNoUrl),
    queries:c.queries,max_plays:c.max_plays,search_posts:c.posts,
    exclusion_reasons:reasons,
    affiliate_verified:hasAff,
    qualifies:reasons.length===0&&hasAff});
  if(i%25===0) console.log(`  ${i}/${disc.creators.length}  spent=${spent}  remaining=${remaining}  qualified so far=${rows.filter(r=>r.qualifies).length}`);
}
const q=rows.filter(r=>r.qualifies);
fs.writeFileSync(`${ROOT}/raw/sc-civilian-cohort.json`,JSON.stringify({
  cohort:'individual civilian TikTok creators promoting peptides with an affiliate link',
  goal:'Show what regular people promoting peptides actually post, what gets traction, and turn it into a prescriptive brief for an affiliate army.',
  discovery:'ScrapeCreators /v1/tiktok/search/keyword on query vectors TikTok serves. Compound names return zero through both SC and TikTok native search.',
  credits_spent:spent,credits_remaining:remaining,
  probed:rows.length,qualifies:q.length,
  creators:rows.sort((a,b)=>(b.qualifies-a.qualifies)||((b.max_plays||0)-(a.max_plays||0)))},null,2));
console.log(`\nDONE  probed=${rows.length}  QUALIFIED=${q.length}  credits spent=${spent}  remaining=${remaining}`);
