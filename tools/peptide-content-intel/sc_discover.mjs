#!/usr/bin/env node
/* Civilian peptide-affiliate discovery via ScrapeCreators.
 *
 * COST: 1 credit per call. Hard-capped by CREDIT_BUDGET; the script refuses to
 * exceed it and prints spend after every phase. Cached, so re-runs are free.
 *
 * Query vectors deliberately EXCLUDE the compound names. Verified twice, through
 * two independent providers: TikTok returns zero results for "retatrutide" and
 * "tirzepatide" while returning full results for the approved brands, the journey
 * language, and the coded aliases. Searching the drug name spends credits for
 * nothing.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const CACHE=`${ROOT}/cache/sc`;
fs.mkdirSync(CACHE,{recursive:true});
const KEY=spawnSync('python3',['-c','import sys;sys.path.insert(0,"/Users/alexweinstein/growth-operating/ovo-outbound/inner_resurface");import creds;print(creds.sc_key())'],{encoding:'utf8'}).stdout.trim();
if(!KEY) { console.error('no SC key'); process.exit(1); }

const CREDIT_BUDGET=Number(process.env.CREDIT_BUDGET||400);
let spent=0, lastRemaining=null;

function sc(path, cacheKey){
  const cf=`${CACHE}/${cacheKey}.json`;
  if(fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf,'utf8'));
  if(spent>=CREDIT_BUDGET){ throw new Error(`CREDIT BUDGET ${CREDIT_BUDGET} reached - stopping`); }
  const r=spawnSync('curl',['-s','--max-time','40',`https://api.scrapecreators.com${path}`,'-H',`x-api-key: ${KEY}`],{encoding:'utf8',maxBuffer:6e7});
  let j; try{ j=JSON.parse(r.stdout||'{}'); }catch(e){ j={success:false,parse_error:e.message}; }
  if(typeof j.credits_charged==='number') spent+=j.credits_charged;
  if(typeof j.credits_remaining==='number') lastRemaining=j.credits_remaining;
  fs.writeFileSync(cf,JSON.stringify(j));
  return j;
}

// Query vectors TikTok actually serves. No compound names.
const QUERIES=[
 'glp1 journey','glp1 weight loss','my glp1 journey','glp1 girlie','glp1 results',
 'peptides weight loss','peptide journey','research peptides','ratatouille weight loss',
 'sw cw gw journey','down 50 pounds glp1','microdosing glp1','compounded glp1',
 'vials weight loss','glp1 code discount','peptide discount code','glp1 affiliate',
 'reta journey','glp3','my peptide results','weight loss shot journey','glp1 mom',
];

const seen=new Map(); // handle -> {followers, plays, queries}
console.log(`phase 1: keyword search over ${QUERIES.length} vectors (1 credit each)`);
for(const q of QUERIES){
  let j;
  try{ j=sc(`/v1/tiktok/search/keyword?query=${encodeURIComponent(q)}`,`kw_${q.replace(/[^a-z0-9]+/gi,'_')}`); }
  catch(e){ console.log('  '+e.message); break; }
  const items=j.search_item_list||[];
  let added=0;
  for(const it of items){
    const aw=it.aweme_info||{}; const a=aw.author||{}; const st=aw.statistics||{};
    const h=a.unique_id; if(!h) continue;
    const r=seen.get(h)||{handle:h,followers:a.follower_count??null,signature:a.signature||'',nickname:a.nickname||'',queries:new Set(),max_plays:0,posts:[]};
    r.queries.add(q); r.max_plays=Math.max(r.max_plays,st.play_count||0);
    r.posts.push({id:aw.aweme_id,desc:aw.desc||'',plays:st.play_count??null,likes:st.digg_count??null,
      comments:st.comment_count??null,shares:st.share_count??null,created:aw.create_time??null});
    if(!seen.has(h)) added++;
    seen.set(h,r);
  }
  console.log(`  "${q}" -> ${items.length} items, +${added} new handles (spent ${spent})`);
}
console.log(`\nphase 1 done: ${seen.size} unique handles, ${spent} credits spent, ${lastRemaining} remaining`);

const out=[...seen.values()].map(r=>({...r,queries:[...r.queries]}));
fs.writeFileSync(`${ROOT}/raw/sc-tiktok-search.json`,JSON.stringify({
  provider:'ScrapeCreators /v1/tiktok/search/keyword',
  note:'Compound names (retatrutide, tirzepatide) return ZERO results through both ScrapeCreators and TikTok native search - verified. These vectors are the ones that work.',
  queries:QUERIES,credits_spent:spent,credits_remaining:lastRemaining,
  handles:out.length,creators:out.sort((a,b)=>(b.max_plays||0)-(a.max_plays||0))},null,2));
console.log(`wrote raw/sc-tiktok-search.json`);
