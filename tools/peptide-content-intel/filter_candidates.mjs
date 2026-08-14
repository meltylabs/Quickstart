import fs from 'node:fs';
const R='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const cands=JSON.parse(fs.readFileSync(`${R}/apify_civilian_candidates.json`,'utf8'));
const CLINICIAN=/(\bmd\b|md$|^dr|\bdr\.?\s|doctor|physician|surgeon|\brn\b|nurse|\bnp\b|\bpa-?c\b|\brd\b|dietit|pharmacist|pharmd|\bphd\b|clinician|practitioner|chiropract|naturopath|dermatolog|yale|harvard)/i;
const COMPANY=/(supply|supplies|official|\bshop\b|\bstore\b|\bhq\b|\binc\b|\bllc\b|\bltd\b|labs?\b|laborator|solutions|group|brand|clinic|medspa|telehealth|pharmacy|wholesale|distribut|vendor|\bteam\b|founder @|collabs?@)/i;
const COACH=/(coach|coaching|trainer|\bcpt\b|nutritionist|mentor|consultant|\bprogram\b|academy|helping you)/i;
const CIVILIAN=/(\bmy\b|\bi\b|journey|down \d+|-\d+ ?lbs?|sw ?\d+|cw ?\d+|gw ?\d+|lost \d+|\d+ ?lbs?|mom|mum|sahm|wife|girl|weightloss|weight loss)/i;
const rows=cands.map(c=>{
  const bioNoUrl=String(c.bio||'').replace(/https?:\/\/\S+/gi,' ').replace(/\b[a-z0-9-]{2,40}\.(?:com|co\.uk|co|io|net|org|shop|store|app)\b\S*/gi,' ').replace(/\S+@\S+/g,' ');
  const idText=`${c.handle} ${bioNoUrl}`;
  const reasons=[];
  if(CLINICIAN.test(idText))reasons.push('clinician / credentialed');
  if(COMPANY.test(idText))reasons.push('company / brand account');
  if(COACH.test(idText))reasons.push('coach / program seller');
  if((c.fans??0)<250)reasons.push(`only ${c.fans} followers`);
  return {...c,civilian_voice:CIVILIAN.test(bioNoUrl),exclusion_reasons:reasons,is_civilian:reasons.length===0};
});
const civ=rows.filter(r=>r.is_civilian);
fs.writeFileSync(`${R}/raw/tiktok-civilian-candidates.json`,JSON.stringify({
  source:'Apify clockworks/tiktok-scraper search on the query vectors that TikTok actually serves (glp1 journey, ozempic, peptides, ratatouille weight loss). The compound names retatrutide and tirzepatide return ZERO results and cannot be used for discovery.',
  probed:rows.length,civilians:civ.length,creators:rows},null,2));
console.log(`CIVILIAN (needs bio-link check): ${civ.length} of ${rows.length}`);
console.log();
for(const r of civ.slice(0,20)) console.log(`  @${r.handle.padEnd(24)} f=${String(r.fans).padStart(8)} voice=${r.civilian_voice?'Y':'n'}  ${String(r.bio).slice(0,58)}`);
console.log('\n--- excluded, with reason ---');
for(const r of rows.filter(x=>!x.is_civilian).slice(0,10)) console.log(`  @${r.handle.padEnd(24)} ${r.exclusion_reasons.join('; ').slice(0,64)}`);
