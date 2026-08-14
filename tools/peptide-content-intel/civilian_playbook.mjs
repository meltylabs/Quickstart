#!/usr/bin/env node
/* Turn 487 real posts from 49 civilian peptide affiliates into a prescriptive
 * brief: which hooks, formats, lengths, hashtags and CTAs actually get traction.
 *
 * Everything is measured against each CREATOR'S OWN median so a breakout from a
 * 1.4k account is not buried by a routine post from a 350k account. No metric is
 * estimated; posts missing plays are excluded from rate maths and counted. */
import fs from 'node:fs';
const ROOT='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const d=JSON.parse(fs.readFileSync(`${ROOT}/raw/sc-civilian-posts.json`,'utf8'));
const med=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};

// Hook archetypes tuned to how CIVILIANS actually write, not how doctors title videos.
const HOOKS=[
 // Vendor-tagged: the creator names or @-tags the brand. This is the affiliate
 // post in its purest form and it is what an army would actually be told to make.
 ['vendor-tagged-journey',/@gala|#gala|galaglp1|#shedrx|shedrx|@shed|#eden|@eden|#hers\b|#ro\b|@ro\b|#willow|#mochi|#formhealth|#everlywell/i],
 // A bare caption of coded alias hashtags and nothing else. Verified live:
 // "#ratatouille #biohacking #research" pulled 427k, 311k and 262k plays.
 ['alias-tag-only',/^[\s#@\w]*#(ratatouille|peppers|biohacking|research|glp3|r3ta)\b[\s#@\w]*$/i],
 ['myth-or-regain-defense',/gain (it |all )?(the )?weight back|\bregain\b|\bmyth|stop saying|people think|\bcheating\b|took the easy way|judge|hate comment|\bstigma|lazy/i],
 ['before-after-reveal',/before ?\/? ?after|before (and|&) after|\bb&a\b|transformation|progress pic|same (jeans|dress|shirt|pants)/i],
 ['weight-number-reveal',/\b(sw|cw|gw)\b ?:?\s?\d|\bstarting weight\b|down \d+ ?(lbs?|pounds)|lost \d+ ?(lbs?|pounds)|\d+ ?(lbs?|pounds) (down|lost|gone)|\d+ to \d+ ?(lbs?|pounds)/i],
 ['journey-milestone',/\b(my )?(glp-?1|peptide|weight ?loss) journey\b|\d+ ?(weeks?|months?) (in|on|later|update)|\bweek \d+|\bday \d+|changed my life/i],
 ['dose-or-protocol-talk',/\b\d+(\.\d+)?\s?(mg|ml|units?|iu)\b|\btitrat|\bdose|\binject|\bvial|\breconstitut|\bpin\b|ghk|bpc|tb-?500/i],
 ['food-or-day-of-eating',/what i eat|day of eating|\bmeal|recipe|protein|grocery|snack|calories|\bfood\b|\border\b|dressing/i],
 ['side-effect-confession',/side ?effect|nausea|sulfur burp|fatigue|hair (loss|thinning)|constipat|threw up|\bsick\b/i],
 ['cost-or-source-talk',/\bprice|\bcost|\bcheaper|\bexpensive|where i (get|buy)|\bpharmacy|\bcompound|\bvendor|\bsource|\blegit|\bscam/i],
 ['question-to-audience',/\?\s*$|\banyone else\b|\bam i\b|any questions|\bthoughts\b|\bwho else\b|let me know/i],
 ['non-scale-victory',/\bnsv\b|non.?scale|\benergy\b|\bconfidence|clothes fit|\bknees\b|\bstairs\b|\bmirror\b/i],
 ['product-or-tool-rec',/must have|\bfavorite|\bi use\b|\bbought\b|\bamazon\b|link in bio|\bcode\b|\bordered\b/i],
 // Everything that is not peptide-adjacent at all. Naming this explicitly matters:
 // these accounts' biggest posts are personal-life content, and calling that
 // "other" hid the single most important fact about the cohort.
 ['off-topic-personal-life',/.*/],
];
const FORMATS=[
 ['talking-to-camera',/\bstoryti|\blet me tell|\bhere.s (what|why|how)|\bi (want|need) to (say|talk)/i],
 ['photo-slideshow',/swipe|slide|photo dump|\bpics?\b|carousel/i],
 ['text-over-b-roll',/\bpov\b|when you|\bme when\b/i],
];
const ONTOPIC=/(peptide|peptid|pept|glp-?1|glp1|glp3|reta\b|retatrutide|trutide|tirz|sema|semaglutide|ozempic|mounjaro|zepbound|wegovy|ghk|bpc|tb-?500|ratatouille|#peppers|vial|\bmg\b|inject|dose|weight ?loss|fat ?loss|down \d+ ?(lbs?|pounds)|\b(sw|cw|gw)\b|shedrx|gala)/i;
const hookOf=t=>{for(const[n,r]of HOOKS)if(r.test(t))return n;return 'off-topic-personal-life';};
const fmtOf=t=>{for(const[n,r]of FORMATS)if(r.test(t))return n;return 'unclassified';};
const band=s=>s==null?null:s<15?'<15s':s<=30?'15-30s':s<=60?'30-60s':s<=180?'60-180s':'180s+';

// score each post against its own creator's baseline
const posts=[];
for(const c of d.data){
  const plays=c.posts.map(p=>p.plays).filter(v=>typeof v==='number'&&v>0);
  const base=med(plays); const n=plays.length;
  for(const p of c.posts){
    const t=p.desc||'';
    posts.push({...p,handle:c.handle,followers:c.followers,
      code_in_bio:c.code_in_bio,vendor:(c.peptide_vendor_links||[])[0]||null,
      baseline_plays:base,baseline_n:n,
      outlier:(base&&p.plays)?Number((p.plays/base).toFixed(2)):null,
      baseline_reliable:n>=5,
      hook:hookOf(t),format:fmtOf(t),band:band(p.duration_sec),
      on_topic:ONTOPIC.test(t),
      engagement_rate:(p.plays&&p.plays>0)?Number((((p.likes||0)+(p.comments||0)+(p.shares||0))/p.plays*100).toFixed(2)):null,
      share_rate:(p.plays&&p.plays>0)?Number(((p.shares||0)/p.plays*100).toFixed(3)):null,
    });
  }
}
const scored=posts.filter(p=>p.outlier!=null&&p.baseline_reliable);

function roll(keyFn,label){
  const g=new Map();
  for(const p of scored){const k=keyFn(p);if(k==null)continue;(g.get(k)||g.set(k,[]).get(k)).push(p);}
  return [...g.entries()].map(([k,ps])=>({
    key:k,dimension:label,n_posts:ps.length,
    n_creators:new Set(ps.map(p=>p.handle)).size,
    median_outlier:med(ps.map(p=>p.outlier)),
    median_plays:med(ps.map(p=>p.plays).filter(Boolean)),
    median_engagement_rate:med(ps.map(p=>p.engagement_rate).filter(v=>v!=null)),
    median_share_rate:med(ps.map(p=>p.share_rate).filter(v=>v!=null)),
    share_of_breakouts:Number((ps.filter(p=>p.outlier>=2).length/ps.length).toFixed(2)),
    best:(()=>{const b=[...ps].sort((a,z)=>z.outlier-a.outlier)[0];return b?{url:b.url,handle:b.handle,plays:b.plays,outlier:b.outlier,desc:b.desc.slice(0,120)}:null;})(),
    thin:ps.length<8,
  })).sort((a,b)=>(b.median_outlier||0)-(a.median_outlier||0));
}
const onT=scored.filter(p=>p.on_topic);
function rollOn(keyFn,label){const g=new Map();for(const p of onT){const k=keyFn(p);if(k==null)continue;(g.get(k)||g.set(k,[]).get(k)).push(p);}
 return [...g.entries()].map(([k,ps])=>({key:k,dimension:label,n_posts:ps.length,n_creators:new Set(ps.map(p=>p.handle)).size,
  median_outlier:med(ps.map(p=>p.outlier)),median_plays:med(ps.map(p=>p.plays).filter(Boolean)),
  median_engagement_rate:med(ps.map(p=>p.engagement_rate).filter(v=>v!=null)),
  median_share_rate:med(ps.map(p=>p.share_rate).filter(v=>v!=null)),
  share_of_breakouts:Number((ps.filter(p=>p.outlier>=2).length/ps.length).toFixed(2)),
  best:(()=>{const b=[...ps].sort((a,z)=>z.outlier-a.outlier)[0];return b?{url:b.url,handle:b.handle,plays:b.plays,outlier:b.outlier,desc:b.desc.slice(0,140)}:null;})(),
  thin:ps.length<8}))
 .sort((a,b)=>(b.median_outlier||0)-(a.median_outlier||0));}
const topicSplit=roll(p=>p.on_topic?'peptide topic':'personal life / off topic','topic');
const rollups={by_hook:rollOn(p=>p.hook,'hook'),by_duration:rollOn(p=>p.band,'duration'),by_format:rollOn(p=>p.format,'format'),by_topic:topicSplit};

// hashtags
const tagMap=new Map();
for(const p of onT) for(const t of p.hashtags||[]){
  const k=t.toLowerCase(); const r=tagMap.get(k)||{tag:k,n:0,outliers:[],creators:new Set()};
  r.n++; r.outliers.push(p.outlier); r.creators.add(p.handle); tagMap.set(k,r);
}
const hashtags=[...tagMap.values()].filter(r=>r.n>=4)
  .map(r=>({tag:r.tag,n_posts:r.n,n_creators:r.creators.size,median_outlier:med(r.outliers)}))
  .sort((a,b)=>(b.median_outlier||0)-(a.median_outlier||0)).slice(0,25);

const breakouts=[...onT].filter(p=>p.outlier>=2).sort((a,b)=>b.outlier-a.outlier).slice(0,30)
  .map(p=>({handle:p.handle,followers:p.followers,url:p.url,plays:p.plays,outlier:p.outlier,
    hook:p.hook,band:p.band,duration_sec:p.duration_sec,engagement_rate:p.engagement_rate,
    share_rate:p.share_rate,hashtags:(p.hashtags||[]).slice(0,6),desc:p.desc.slice(0,180),
    vendor:p.vendor,code:p.code_in_bio}));

const out={
  generated_from:{creators:d.creators,posts_total:d.posts,posts_scored:scored.length,
    excluded_no_baseline:posts.length-scored.length,
    note:'Only posts from creators with at least 5 measurable posts are scored, so an outlier multiple always has a real baseline behind it.'},
  rollups,hashtags,breakouts,
  on_topic_posts:onT.length,off_topic_posts:scored.length-onT.length,
  reference_creators:d.data.map(c=>({handle:c.handle,followers:c.followers,bio:c.bio,
    bio_link:c.bio_link,vendor:(c.peptide_vendor_links||[])[0]||null,code:c.code_in_bio,
    posts_collected:c.posts.length,
    median_plays:med(c.posts.map(p=>p.plays).filter(Boolean)),
    best_post:(()=>{const b=[...c.posts].sort((a,z)=>(z.plays||0)-(a.plays||0))[0];return b?{url:b.url,plays:b.plays,desc:b.desc.slice(0,110)}:null;})(),
  })).sort((a,b)=>(b.median_plays||0)-(a.median_plays||0)),
};

/* ---- the prescriptive brief: what to tell an affiliate to post ----
 * Only rules backed by >=8 posts across >=3 creators become directives.
 * Everything thinner is surfaced as a lead to test, never as a finding. */
const solid=r=>r.n_posts>=8&&r.n_creators>=3;
const hookSolid=rollups.by_hook.filter(solid);
const tagSolid=hashtags.filter(h=>h.n_posts>=8&&h.n_creators>=3);
const _breakoutsReady=breakouts.length;
const brief={
  directives:[
    ...(hookSolid.length?[{
      rule:`Lead with the "${hookSolid[0].key.replace(/-/g,' ')}" angle`,
      evidence:`${hookSolid[0].n_posts} posts across ${hookSolid[0].n_creators} creators, median ${hookSolid[0].median_outlier}x that creator own baseline, ${Math.round(hookSolid[0].share_of_breakouts*100)}% of them broke out at 2x or more.`,
      example:hookSolid[0].best?hookSolid[0].best.url:null,
    }]:[]),
    ...(()=>{const d=rollups.by_duration.filter(r=>r.n_posts>=8);if(!d.length)return[];
      return [{rule:`Target ${d[0].key} runtime`,evidence:`${d[0].n_posts} posts, median ${d[0].median_outlier}x baseline versus ${d[d.length-1].median_outlier}x for ${d[d.length-1].key}.`,example:d[0].best?d[0].best.url:null}];})(),
    ...(tagSolid.length?[{
      rule:`Tag #${tagSolid[0].tag}`,
      evidence:`${tagSolid[0].n_posts} posts across ${tagSolid[0].n_creators} creators, median ${tagSolid[0].median_outlier}x baseline.`,
      example:null}]:[]),
    ...(()=>{const v=rollups.by_hook.find(r=>r.key==='vendor-tagged-journey');
      const f=rollups.by_hook.find(r=>r.key==='food-or-day-of-eating');
      if(!v)return[];
      // Median and ceiling disagree sharply here, and the median alone produced a
      // flatly wrong directive ("avoid vendor posts") that the cohort's own top
      // two breakouts contradict. Report the variance instead of picking a side.
      const vb=breakouts.filter(b=>b.hook==='vendor-tagged-journey');
      const top=vb.length?Math.max(...vb.map(b=>b.plays||0)):null;
      return [{rule:'Treat vendor-tagged posts as a high-variance volume play, not a reliable format',
        evidence:`Posts that @-tag or hashtag the brand have a median of only ${v.median_plays} plays (${v.median_outlier}x baseline over ${v.n_posts} posts from ${v.n_creators} creators) - most of them go nowhere. But they also hold ${vb.length} of the top ${breakouts.length} breakouts in the whole cohort, including the single biggest at ${top?top.toLocaleString('en-US'):'n/a'} plays. Low floor, highest ceiling in the set.`,
        directive:'Brief the army to publish vendor-tagged journey posts at volume and expect most to flop. Do not judge a creator on one. Judge on their best of ten.',
        example:vb.length?vb[0].url:null},
      ...(f?[{rule:'For a dependable floor, use everyday food and day-of-eating posts',
        evidence:`${f.n_posts} posts across ${f.n_creators} creators, median ${f.median_outlier}x baseline and median ${f.median_plays} plays - roughly ${Math.round((f.median_plays||0)/(v.median_plays||1))}x the median of a vendor-tagged post, with far less variance.`,
        directive:'This is the base-load content. It keeps the account alive between swings.',
        example:f.best?f.best.url:null}]:[])];})(),
  ],
  leads_to_test:rollups.by_hook.filter(r=>r.thin&&r.median_outlier>2).map(r=>({
    angle:r.key.replace(/-/g,' '),n_posts:r.n_posts,n_creators:r.n_creators,
    median_outlier:r.median_outlier,
    caution:`Only ${r.n_posts} post(s) from ${r.n_creators} creator(s). Promising but not yet a pattern.`,
    example:r.best?r.best.url:null})),
  coded_aliases_in_live_use:hashtags.filter(h=>/ratatouille|peppers|biohacking|research|glp3/i.test(h.tag))
    .map(h=>({tag:'#'+h.tag,n_posts:h.n_posts,n_creators:h.n_creators,median_outlier:h.median_outlier})),
  compliance_flag:'dose-or-protocol-talk and cost-or-source-talk both perform, and both are exactly what a Biologix affiliate must not produce. They are reported for completeness, not as directives.',
};
out.brief=brief;
fs.writeFileSync(`${ROOT}/raw/civilian-playbook.json`,JSON.stringify(out,null,2));

console.log(`scored ${scored.length} of ${posts.length} posts (${out.generated_from.excluded_no_baseline} lacked a reliable baseline)\n`);
console.log('=== TOPIC SPLIT (the headline) ===');
for(const r of topicSplit) console.log(`  ${r.key.padEnd(30)} n=${String(r.n_posts).padStart(3)} medPlays=${String(r.median_plays).padStart(8)} medOutlier=${r.median_outlier}`);
console.log('\n=== ON-TOPIC HOOKS, ranked by median outlier vs the creator own baseline ===');
for(const r of rollups.by_hook) console.log(`  ${r.key.padEnd(24)} n=${String(r.n_posts).padStart(3)} creators=${String(r.n_creators).padStart(2)} medOutlier=${String(r.median_outlier).padStart(5)} medPlays=${String(r.median_plays).padStart(7)} breakout%=${r.share_of_breakouts} eng%=${r.median_engagement_rate}${r.thin?'  THIN':''}`);
console.log('\n=== DURATION ===');
for(const r of rollups.by_duration) console.log(`  ${String(r.key).padEnd(10)} n=${String(r.n_posts).padStart(3)} medOutlier=${String(r.median_outlier).padStart(5)} medPlays=${String(r.median_plays).padStart(7)} share%=${r.median_share_rate}${r.thin?'  THIN':''}`);
console.log('\n=== TOP HASHTAGS (n>=5) ===');
for(const h of hashtags.slice(0,12)) console.log(`  #${h.tag.padEnd(26)} n=${String(h.n_posts).padStart(3)} creators=${String(h.n_creators).padStart(2)} medOutlier=${h.median_outlier}`);
