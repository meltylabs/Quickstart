import json, re, statistics as st
from collections import Counter, defaultdict
BASE='/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel/'
M=json.load(open(BASE+'raw/merged-layers.json'))['data']
O={v['id']:v for v in json.load(open(BASE+'raw/outliers.json'))['videos']}

def segs(o): return [s.strip() for s in o.split('|') if s.strip()]
def is_noise(s):
    if len(s)<3: return True
    L=[c for c in s if c.isalpha()]
    if not L: return True
    if sum(1 for c in s if 'Ѐ'<=c<='ӿ')/max(1,len(L))>0.2: return True
    if len(s)<=12 and not re.search(r'[aeiouAEIOU]',s): return True
    return False
def clean(o):
    out=[];seen=set()
    for s in segs(o):
        if is_noise(s): continue
        k=re.sub(r'[^a-z0-9]','',s.lower())[:28]
        if k in seen: continue
        seen.add(k); out.append(s)
    return out
def cap_sub(c):
    c=re.sub(r'#\w+','',c); c=re.sub(r'@[\w.]+','',c); c=re.sub(r'https?://\S+','',c)
    c=re.sub(r'[^\w\s\'\?\!\.,]','',c)
    return re.sub(r'\s+',' ',c).strip()

def classify(segl):
    txt=' | '.join(segl); t=txt.lower(); first=(segl[0].lower() if segl else '')
    L=set()
    if sum(1 for s in segl if re.match(r'^\s*[•‣●▪\-–\*\+]\s*\S',s) or re.match(r'^o\s+[a-z]',s))>=2: L.add('bulleted_list')
    if sum(1 for s in segl if re.match(r'^\s*\d[\.\)]\s*\S',s))>=2: L.add('numbered_listicle')
    if re.search(r'\b(week|wk|day|month|mo)\s*#?\s*\d+|\b\d+(\.\d+)?\s*(week|wk|day|month|mo)s?\b|\b\d+\s*-\s*\d+\s*(1/2\s*)?month|\bweek\s*\d+\s*vs\s*week\s*\d+',t): L.add('timeline_week_n')
    if re.search(r'\b(update|timeline|progress|so far)\b',t) and re.search(r'\b(week|month|day|\d)',t): L.add('timeline_week_n')
    if re.search(r'before\s*(and|&|\+|/)\s*after|\bbefore\b.*\bafter\b|starting weight|current(ly)? weight|goal weight|\bsw\b[:\s]|\bcw\b[:\s]|down \d+\s*(lbs|ibs|pounds|kg)|lost \d+\s*(lbs|ibs|pounds|kg)|-\s?\d+\s*(lbs|ibs|pounds)|highest weight|lowest weight|\d+\s*(lbs|ibs)\b.*\d+\s*(lbs|ibs)\b',t): L.add('before_after')
    if re.search(r'\bpov\b',t) or re.match(r'^(me|them|him|her|us)\s*:',first) or re.match(r'^me\s+(when|trying|day|on|without|responding|at|after|be)',first) or re.match(r'^when (your|you|mom|i|the|he|she)\b',first) or re.search(r'\|\s*me\s*:',t): L.add('pov_skit')
    if re.match(r'^\s*[\"“‘\']',txt.strip()) or re.search(r'[\"“][^\"”]{10,}[\"”]',txt): L.add('quote_objection')
    if re.search(r'reply to\b.*comment|reply to @|\bcomment\b',t): L.add('reply_to_comment')
    qseg=[s for s in segl if s.strip().endswith('?')]
    if qseg or re.match(r'^(where|how|what|why|which|should|do|does|can|is|are)\b',first): L.add('question_card')
    if re.search(r'\$\s?\d|\bcode\s*[:\s]\s*[a-z]|use code|save \$|\d+\s*%\s*(off|sitewide)|\bsitewide\b|link in bio|in b!o|in link',t): L.add('price_code_card')
    if re.search(r'\b\d+(\.\d+)?\s*(mg|mcg|iu|units?)\b|\bd0se|\bdos(e|ing)\b|\bunits\b|\bmo, ?mi',t): L.add('dose_card')
    if re.search(r'f\.?d\.?a\b|new york times|health news|health policy|\bpanel\b|\bstudy\b|clinical|\bcoa\b|certificate of analysis|purity|\bhplc\b|lab test|third.?party test|test(s|ed|ing)? (once|twice)|disclaimer|educational content|research purposes only',t): L.add('document_screenshot')
    if re.search(r'\bvendor|\bcompan(y|ies)\b|\bunbox|where (do |did |i )?(i )?(get|buy|order)|where i get|\bshop\b|\border from\b|\bbrand\b',t): L.add('vendor_shop')
    if re.search(r'\b\d+\s+(things|tips|reasons|ways|mistakes|rules|signs|steps|lessons)\b|\bhow to\b|\bbeginner|\bguide\b|\btips\b',t): L.add('tips_header')
    if re.search(r'\bstack\b|\bcycl(e|ing|ed)\b|\bprotocol\b|\d+\s*x\s*(per|a|/)\s*(week|wk|day)|\b\d+x vs \d+x|\btitrat',t): L.add('stack_protocol')
    if sum(1 for s in segl if re.search(r'\d',s) and len(s)<=30)>=4 and len(segl)<=14: L.add('stat_card')
    if re.search(r'as a (medical|healthcare|nurse|doctor|provider)|i\'?m a (nurse|doctor|pa|np|provider|pharmacist)|\brn\b|\bnp\b, |healthcare provider',t): L.add('credential_claim')
    if re.search(r'send this to|tag (someone|a friend)|\bshare this\b|\bpsa\b|\bstitch\b|comment .{0,12}(below|and i)',t): L.add('cta_share')
    if not L: L.add('unclassified_statement')
    return L

rows=[]
for v in M:
    if not (v['layers']['onscreen'] and v['onscreen'].strip()): continue
    ov=O[v['id']]; segl=clean(v['onscreen'])
    if not segl: continue
    cs=cap_sub(v.get('caption',''))
    labs=classify(segl)
    rows.append(dict(handle=v['handle'],id=v['id'],url=v['url'],lane=v['lane'],plays=v['plays'],
      outlier=ov['outlier'],dur=v['duration_sec'],speech=v['layers']['speech'],
      caption=v.get('caption',''),cap_sub_len=len(cs),topical=ov['peptide_topical'],
      clean=' | '.join(segl),segl=segl,labels=sorted(labs),eng=ov['engagement_rate'],
      followers=v['followers'],n_seg=len(segl),
      onscreen_only=(not v['layers']['speech']) and len(cs)<25))
json.dump(rows,open(BASE+'raw/onscreen-formats.json','w'),indent=1)

def stats(xs):
    if not xs: return None
    return dict(n=len(xs),creators=len(set(r['handle'] for r in xs)),
      med_outlier=round(st.median(r['outlier'] for r in xs),2),
      med_plays=int(st.median(r['plays'] for r in xs)),
      med_eng=round(st.median(r['eng'] for r in xs),2),
      p_gt3=round(100*sum(1 for r in xs if r['outlier']>=3)/len(xs),1))
print('rows',len(rows),'| onscreen_only',sum(1 for r in rows if r['onscreen_only']))
ALLL=sorted({l for r in rows for l in r['labels']})
for scope,sel in [('ALL',lambda r:True),('TOPICAL',lambda r:r['topical']),
                  ('TOPICAL research_peptide',lambda r:r['topical'] and r['lane']=='research_peptide'),
                  ('ONSCREEN-ONLY',lambda r:r['onscreen_only']),
                  ('ONSCREEN-ONLY topical',lambda r:r['onscreen_only'] and r['topical'])]:
    S=[r for r in rows if sel(r)]
    print(f"\n===== {scope}  n={len(S)} creators={len(set(r['handle'] for r in S))} base_med_outlier={round(st.median([r['outlier'] for r in S]),2) if S else '-'}")
    out=[]
    for lab in ALLL:
        xs=[r for r in S if lab in r['labels']]
        if xs: out.append((lab,stats(xs)))
    for lab,s in sorted(out,key=lambda x:-x[1]['med_outlier']):
        bar='OK ' if s['n']>=8 and s['creators']>=3 else 'thin'
        print(f"  {bar} {lab:22s} n={s['n']:3d} cr={s['creators']:2d} medOutlier={s['med_outlier']:8.2f} medPlays={s['med_plays']:8d} medEng={s['med_eng']:5.2f} %>=3x={s['p_gt3']}")
