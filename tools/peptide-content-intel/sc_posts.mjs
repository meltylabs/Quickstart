#!/usr/bin/env node
/* Pull recent posts for the qualified civilian cohort. 1 credit per creator.
 * These are the posts the affiliate-army playbook is derived from, so only
 * qualified civilians are fetched - no companies, clinicians or coaches. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const ROOT='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const CACHE=`${ROOT}/cache/sc-videos`; fs.mkdirSync(CACHE,{recursive:true});
const KEY=spawnSync('python3',['-c','import sys;sys.path.insert(0,"/Users/alexweinstein/growth-operating/ovo-outbound/inner_resurface");import creds;print(creds.sc_key())'],{encoding:'utf8'}).stdout.trim();
const BUDGET=Number(process.env.CREDIT_BUDGET||80);
let spent=0, remaining=null;

const d=JSON.parse(fs.readFileSync(`${ROOT}/raw/sc-civilian-cohort.json`,'utf8'));
const q=d.creators.filter(c=>c.qualifies);
const out=[];
for(let i=0;i<q.length;i++){
  const c=q[i];
  const cf=`${CACHE}/${c.handle.replace(/[^a-z0-9._-]/gi,'_')}.json`;
  let j;
  if(fs.existsSync(cf)) j=JSON.parse(fs.readFileSync(cf,'utf8'));
  else{
    if(spent>=BUDGET){ console.log(`  BUDGET STOP at ${i}/${q.length}`); break; }
    const r=spawnSync('curl',['-s','--max-time','40',`https://api.scrapecreators.com/v3/tiktok/profile/videos?handle=${encodeURIComponent(c.handle)}`,'-H',`x-api-key: ${KEY}`],{encoding:'utf8',maxBuffer:8e7});
    try{ j=JSON.parse(r.stdout||'{}'); }catch(e){ j={success:false}; }
    if(typeof j.credits_charged==='number') spent+=j.credits_charged;
    if(typeof j.credits_remaining==='number') remaining=j.credits_remaining;
    fs.writeFileSync(cf,JSON.stringify(j));
  }
  const posts=(j.aweme_list||[]).map(a=>{
    const st=a.statistics||{};
    return {
      id:a.aweme_id,
      url:`https://www.tiktok.com/@${c.handle}/video/${a.aweme_id}`,
      desc:a.desc||'',
      duration_sec:(a.video&&a.video.duration)?Math.round(a.video.duration/1000):null,
      created:a.create_time??null,
      plays:st.play_count??null, likes:st.digg_count??null,
      comments:st.comment_count??null, shares:st.share_count??null,
      downloads:st.download_count??null,
      hashtags:(a.cha_list||[]).map(x=>x.cha_name).filter(Boolean),
      sound:(a.added_sound_music_info||{}).title||null,
      sound_is_original:!!((a.added_sound_music_info||{}).is_original),
    };
  });
  out.push({handle:c.handle,followers:c.followers,bio:c.bio,bio_link:c.bio_link,
    peptide_vendor_links:c.peptide_vendor_links,code_in_bio:c.code_in_bio,posts});
  if((i+1)%10===0) console.log(`  ${i+1}/${q.length} creators, ${out.reduce((a,x)=>a+x.posts.length,0)} posts, spent=${spent} remaining=${remaining}`);
}
fs.writeFileSync(`${ROOT}/raw/sc-civilian-posts.json`,JSON.stringify({
  credits_spent:spent,credits_remaining:remaining,
  creators:out.length,posts:out.reduce((a,x)=>a+x.posts.length,0),data:out},null,2));
console.log(`\nDONE creators=${out.length} posts=${out.reduce((a,x)=>a+x.posts.length,0)} spent=${spent} remaining=${remaining}`);
