#!/usr/bin/env node
/* Pull spoken transcripts for every collected civilian post.
 *
 * This is the layer the whole caption-based analysis was missing. Only 1% of
 * captions say "retatrutide", but the audio carries dosing frequency,
 * reconstitution tutorials and before/afters. Verified live:
 *   @papi.peptide caption "DM me SOURCE" -> spoken "Should you be doing
 *   Ratatouille once a week or twice a week?"
 *
 * 1 credit per video, charged even when the video has no speech (roughly 40% of
 * them are music-only B-roll). Cached per video id; hard-capped by CREDIT_BUDGET.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const ROOT='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const CACHE=`${ROOT}/cache/sc-transcript`; fs.mkdirSync(CACHE,{recursive:true});
const KEY=spawnSync('python3',['-c','import sys;sys.path.insert(0,"/Users/alexweinstein/growth-operating/ovo-outbound/inner_resurface");import creds;print(creds.sc_key())'],{encoding:'utf8'}).stdout.trim();
const BUDGET=Number(process.env.CREDIT_BUDGET||600);
let spent=0, remaining=null, withSpeech=0, empty=0;

// WEBVTT -> plain text, de-duplicating the repeated caption lines TikTok emits
function vttToText(v){
  if(!v) return '';
  const lines=String(v).split(/\r?\n/);
  const out=[]; let prev='';
  for(const l of lines){
    const t=l.trim();
    if(!t||t==='WEBVTT'||/^\d+$/.test(t)||/-->/.test(t)) continue;
    if(t===prev) continue;
    out.push(t); prev=t;
  }
  return out.join(' ').replace(/\s{2,}/g,' ').trim();
}

const d=JSON.parse(fs.readFileSync(`${ROOT}/raw/sc-civilian-posts.json`,'utf8'));
const jobs=[];
for(const c of d.data) for(const p of c.posts) jobs.push({handle:c.handle,followers:c.followers,post:p});
console.log(`${jobs.length} videos to transcribe (1 credit each, budget ${BUDGET})`);

const results=[];
for(let i=0;i<jobs.length;i++){
  const {handle,followers,post}=jobs[i];
  const cf=`${CACHE}/${post.id}.json`;
  let j;
  if(fs.existsSync(cf)) j=JSON.parse(fs.readFileSync(cf,'utf8'));
  else{
    if(spent>=BUDGET){ console.log(`  BUDGET STOP at ${i}/${jobs.length}`); break; }
    const r=spawnSync('curl',['-s','--max-time','50',`https://api.scrapecreators.com/v1/tiktok/video/transcript?url=${encodeURIComponent(post.url)}`,'-H',`x-api-key: ${KEY}`],{encoding:'utf8',maxBuffer:3e7});
    try{ j=JSON.parse(r.stdout||'{}'); }catch(e){ j={success:false}; }
    if(typeof j.credits_charged==='number') spent+=j.credits_charged;
    if(typeof j.credits_remaining==='number') remaining=j.credits_remaining;
    fs.writeFileSync(cf,JSON.stringify(j));
  }
  const text=vttToText(j.transcript);
  if(text) withSpeech++; else empty++;
  results.push({handle,followers,id:post.id,url:post.url,
    caption:post.desc||'',hashtags:post.hashtags||[],
    plays:post.plays,likes:post.likes,comments:post.comments,shares:post.shares,
    duration_sec:post.duration_sec,
    transcript:text, transcript_chars:text.length,
    has_speech:!!text});
  if((i+1)%50===0) console.log(`  ${i+1}/${jobs.length}  speech=${withSpeech} empty=${empty}  spent=${spent} remaining=${remaining}`);
}
fs.writeFileSync(`${ROOT}/raw/sc-transcripts.json`,JSON.stringify({
  note:'Spoken transcripts. Captions understate content massively - only 1% of captions name retatrutide while the audio carries dosing, reconstitution and outcome talk. Videos with no speech (music-only B-roll) are recorded as has_speech:false and still cost 1 credit.',
  videos:results.length,with_speech:withSpeech,no_speech:empty,
  credits_spent:spent,credits_remaining:remaining,
  data:results},null,2));
console.log(`\nDONE ${results.length} videos | with speech ${withSpeech} | no speech ${empty} | spent ${spent} | remaining ${remaining}`);
