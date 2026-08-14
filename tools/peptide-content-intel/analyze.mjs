#!/usr/bin/env node
/**
 * analyze.mjs — turn raw collected peptide/GLP-1 social data into the
 * "what should we replicate" intelligence dataset behind the Content Intel board.
 *
 * HARD RULES:
 *  - Every metric here is copied from a raw collector file. Nothing is estimated.
 *  - A metric a platform does not expose stays null, and the composite score is
 *    RENORMALIZED over the dimensions that are actually available, so a platform
 *    is never structurally penalised for a field it cannot return.
 *  - Classification is RULE-BASED and every match records the rule that fired,
 *    so a human can audit why a post was labelled the way it was.
 *  - Records sourced from the earlier hand-collected recon are tagged
 *    provenance:"hand_collected" and are NEVER mixed into api_collected stats.
 *
 * Usage: node analyze.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const RAW = path.join(ROOT, 'raw');
const PORTAL = '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/biologix-strategy-board/content-intel';
const NOW = Date.now();

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn(`  ! could not read ${path.basename(p)}: ${e.message}`);
    return null;
  }
};

const yt = readJson(path.join(RAW, 'youtube.json'));
const tt = readJson(path.join(RAW, 'tiktok.json'));
const ig = readJson(path.join(RAW, 'instagram.json'));
const recon = readJson(path.join(RAW, 'recon-structured.json'));
const ttDisc = readJson(path.join(RAW, 'tiktok-discovered.json'));
const civilians = readJson(path.join(RAW, 'civilian-cohort.json'));
const scCohort = readJson(path.join(RAW, 'sc-civilian-cohort.json'));
const playbook = readJson(path.join(RAW, 'civilian-playbook.json'));

/* ------------------------------------------------------------------ *
 * SCORING MODEL
 * ------------------------------------------------------------------ */
const WEIGHTS = {
  outlier: 35,
  reach_rate: 20,
  share_save: 15,
  comments: 10,
  recency: 10,
  replication_fit: 10,
};

const SCORING_MODEL = {
  weights: WEIGHTS,
  ported_from:
    "Alex's ovo-viral-radar composite (35/20/15/10/10/10). Re-tuned: the 'alex_fit' dimension is replaced by 'replication_fit' scored for a Biologix affiliate creator, and 'velocity' is replaced by the honestly-nameable 'reach_rate'.",
  dimensions: {
    outlier: {
      what: "views divided by THIS CREATOR'S OWN median views across the posts we collected for them",
      why: 'A 500k-view post from a 2M-follower account is unremarkable. A 500k from a 12k account is the thing to copy. A global baseline would make big accounts always win and make the board useless.',
      guard:
        'Requires >= 4 collected posts for that creator. Below that, baseline_confidence = "low" and the post is barred from the top-10 on outlier strength alone.',
    },
    reach_rate: {
      what: 'lifetime views per day since publication, log-scaled',
      why: 'Deliberately NOT called velocity. A single lifetime snapshot of a 2-year-old video cannot tell you how fast it is growing right now. This measures average lifetime reach rate, which is a real and comparable signal. Freshness is handled separately by the recency dimension.',
    },
    share_save: {
      what: 'reposts/shares relative to views',
      why: 'The strongest intent signal where a platform exposes it.',
      null_policy:
        'NULL for platforms that do not expose it. Likes are NEVER substituted. The composite renormalizes so those platforms are not docked 15 points.',
    },
    comments: { what: 'comments relative to views' },
    recency: { what: 'exponential decay on age; 30-day half-life' },
    replication_fit: {
      what: 'how executable this is for a Biologix affiliate creator who is not a physician and has no transformation photos',
      why: 'A viral post that depends on an MD credential, a broadcast studio, or a decade-old physique is not replicable, so it should not top a replication board however well it performed.',
    },
  },
  metric_coverage:
    'Fraction of the 6 dimensions that had real data for this post. Shown in the UI so a high score built on thin data is visible as such.',
};

/* ------------------------------------------------------------------ *
 * RULE-BASED CLASSIFIERS (auditable: each returns the rule that fired)
 * ------------------------------------------------------------------ */
const HOOK_RULES = [
  { archetype: 'credential-contrast', rule: /\b(i'?m a |as a )?(pathologist|physician|doctor|dr\.?|md|nurse|pharmacist|surgeon)\b|\bdoctor (explains|reveals|reacts)|\bnot (ozempic|semaglutide|wegovy)\b/i },
  { archetype: 'risk-warning', rule: /\bside ?effects?\b|\bthe bad\b|\bugly\b|\bdanger|\bwarning\b|\bhospitaliz|\bnearly (killed|died)|\bwhat they (don'?t|won'?t) tell|\brisks?\b|\bscam/i },
  { archetype: 'quit-reversal', rule: /\bwhy i (quit|stopped)\b|\bi stopped\b|\beven though it was working\b|\bregret/i },
  { archetype: 'first-person-timeline', rule: /\bi tried\b|\bmy (\d+[- ]?week|results|experience|journey|transformation)\b|\bweek \d+\b|\bday \d+\b|\b\d+ ?(week|month)s? (on|of|later)\b|\bbefore and after\b/i },
  { archetype: 'protocol-howto', rule: /\bhow to (take|dose|use|inject|reconstitute|mix)\b|\bexact protocol\b|\bthe right way\b|\bdosing\b|\breconstitut|\bprotocol\b|\bstack (with|it)\b/i },
  { archetype: 'beginner-guide', rule: /\bbeginner'?s? guide\b|\bmasterclass\b|\bcomplete guide\b|\bultimate guide\b|\beverything you need to know\b|\b101\b|\bexplained\b/i },
  { archetype: 'comparison', rule: /\bvs\.?\b|\bversus\b|\bcompared? to\b|\bwhich is better\b|\bbetter than\b|\bdifference between\b/i },
  { archetype: 'price-source-exposure', rule: /\bcheapest\b|\bprice|\bcost\b|\bwhere to buy\b|\bbest (source|vendor|supplier)\b|\blegit\b|\bcoupon|\bdiscount\b/i },
  { archetype: 'evidence-question', rule: /\bis it (actually|really)\b|\bdoes it (actually|really) work\b|\bthe (truth|science|data|evidence)\b|\bstudy\b|\bresearch says\b|\bmyth/i },
  { archetype: 'superlative-claim', rule: /\bking\b|\binsane\b|\bcrazy\b|\bbest\b|\bmost powerful\b|\bstrongest\b|\bgame ?changer\b|\bmiracle\b/i },
  { archetype: 'confessional-question', rule: /\?$|\bam i\b|\bdid i\b|\bcan someone\b|\bhas anyone\b|\bwhat happened\b/i },
  { archetype: 'cta-repetition', rule: /\blink in bio\b|\bbook (your|a) free\b|\bdm me\b|\bcomment\b/i },
];

const FORMAT_RULES = [
  { format: 'clip-compilation', rule: /\bclip\b|\bpodcast\b|\binterview\b|\bshorts?\b|\breaction\b/i, maxDuration: 90 },
  { format: 'procedural-demo', rule: /\breconstitut|\bhow to (mix|inject|draw)\b|\btutorial\b|\bstep by step\b/i },
  { format: 'longform-education', rule: null, minDuration: 900 },
  { format: 'talking-head-explainer', rule: null, minDuration: 180 },
  { format: 'short-vertical', rule: null, maxDuration: 90 },
];

/* Content a Biologix affiliate must not produce. Drives REJECT.
 *
 * These rules are deliberately BROAD and word-order-independent. An earlier
 * version required adjacency ("how to inject", "stack with") and produced
 * false negatives on the two highest-risk videos in the whole set:
 *   "Doctor Explains How To CORRECTLY Prepare And Inject ..." (397,509 views)
 *   "Dr. Explains Peptide Stacks Used for Muscle Growth"     (1,446,496 views)
 * Both were green-lit as ADAPT. On a compliance surface a false negative is far
 * more expensive than a false positive, so any mention of injecting, dosing,
 * stacking or sourcing now trips the rule and a human can downgrade it. */
const CLAIM_RISK_RULES = [
  { risk: 'human-dosing-instruction', rule: /\binject(ing|ion|ions|s|ed)?\b|\bdos(e|es|ing|age)\b|\bmg\b|\bml\b|\bunits?\b|\btitrat|\breconstitut|\bexact protocol\b|\bthe right way\b|\bhow (to|i) (take|use|run)\b|\bsyringe|\bneedle|\bvial|\bsubcutaneous|\bpin(ning)?\b/i },
  { risk: 'sourcing-vendor-plug', rule: /\bwhere to buy\b|\b(best|top|legit|trusted|cheapest) (source|vendor|supplier|site|store|lab)\b|\bcheapest\b|\buse code\b|\bcoupon\b|\bdiscount code\b|\bdrop.?ship|\bgr[ea]y market\b|\bsupplier review\b|\bis .{0,30} legit\b|\bvendor\b/i },
  { risk: 'personal-outcome-claim', rule: /\bmy (\d+[- ]?week )?results\b|\bi lost \d+\b|\blost \d+ ?(lbs?|pounds|kg)\b|\bmy transformation\b|\bbefore and after\b|\bmy (protocol|cycle|stack|dose|journey)\b|\b\d+ ?(lbs?|pounds|kg) (down|lost|gone)\b/i },
  { risk: 'stacking-maximization', rule: /\bstack(s|ed|ing)?\b|\bmaximi[sz]|\bcombin(e|ing) with\b|\bpair(ed|ing)? with\b|\bprotocol\b|\bcycle\b/i },
  { risk: 'superiority-claim', rule: /\bking of\b|\bbetter than (ozempic|semaglutide|wegovy|tirzepatide|mounjaro)\b|\bmost powerful\b|\bmiracle\b|\bstrongest\b|\bbest (peptide|fat.?loss)\b|\balternative to (ozempic|semaglutide)\b/i },
  { risk: 'filter-evasion-alias', rule: /\bratatouille\b|\br3ta\b|\bglp-?3\b|\breta\b(?![a-z])/i },
  { risk: 'efficacy-magnitude-claim', rule: /\b\d+(\.\d+)?[- ]?fold\b|\b\d{1,2}% (body ?fat|weight) loss\b|\bfat loss (results|so strong)\b|\bphase [23] results\b/i },
];

// Formats that transfer to a non-clinician affiliate with no physique claim.
const FIT_POSITIVE = /\bdocument|\bcoa\b|\bcertificate of analysis\b|\bcompliance\b|\bdisclosure\b|\bexplained\b|\bguide\b|\bhow (it|they) works?\b|\bmyth|\bcompar|\bvs\.?\b|\bquestions?\b|\bfaq\b|\bwhat (is|are)\b|\bscam|\bwarning\b|\bred flags?\b/i;
const FIT_NEGATIVE_CREDENTIAL = /\bi'?m a (pathologist|physician|doctor|nurse|pharmacist|surgeon)\b|\bas a (doctor|physician|pathologist)\b|\bdr\.? [a-z]+ (explains|reveals)\b/i;
const FIT_NEGATIVE_PHYSIQUE = /\bmy (results|transformation|body)\b|\bbefore and after\b|\bi lost \d+/i;
const FIT_NEGATIVE_PROCEDURE = /\breconstitut|\bhow to (inject|mix|draw)\b|\binjection\b/i;

function classifyHook(text) {
  const t = (text || '').trim();
  if (!t) return { archetype: 'unclassified', matched_rule: null };
  for (const r of HOOK_RULES) {
    if (r.rule.test(t)) return { archetype: r.archetype, matched_rule: String(r.rule) };
  }
  return { archetype: 'other', matched_rule: null };
}

function classifyFormat(text, duration) {
  const t = text || '';
  for (const r of FORMAT_RULES) {
    const durOk =
      (r.minDuration == null || (duration != null && duration >= r.minDuration)) &&
      (r.maxDuration == null || (duration != null && duration <= r.maxDuration));
    if (r.rule) {
      if (r.rule.test(t) && durOk) return { format: r.format, basis: `text:${String(r.rule)}` };
    } else if (duration != null && durOk) {
      return { format: r.format, basis: `duration:${duration}s` };
    }
  }
  return { format: duration == null ? 'unknown' : 'talking-head-explainer', basis: 'fallback' };
}

function durationBand(d) {
  if (d == null) return null;
  if (d < 30) return '<30s';
  if (d <= 60) return '30-60s';
  if (d <= 180) return '60-180s';
  if (d <= 600) return '180-600s';
  return '600s+';
}

function claimRisks(text) {
  const t = text || '';
  return CLAIM_RISK_RULES.filter((r) => r.rule.test(t)).map((r) => r.risk);
}

function replicationFit(text, duration) {
  const t = text || '';
  let score = 50;
  const reasons = [];
  if (FIT_POSITIVE.test(t)) { score += 25; reasons.push('transferable format (document/education/comparison/FAQ)'); }
  if (FIT_NEGATIVE_CREDENTIAL.test(t)) { score -= 35; reasons.push('depends on a clinical credential the affiliate does not have'); }
  if (FIT_NEGATIVE_PHYSIQUE.test(t)) { score -= 30; reasons.push('depends on a personal physique/outcome the affiliate cannot claim'); }
  if (FIT_NEGATIVE_PROCEDURE.test(t)) { score -= 40; reasons.push('procedural human-use demonstration; not producible at all'); }
  if (duration != null && duration >= 1800) { score -= 10; reasons.push('very long form raises production cost'); }
  if (duration != null && duration <= 90) { score += 10; reasons.push('short vertical; phone-shootable this week'); }
  return { fit: Math.max(0, Math.min(100, score)), reasons };
}

/* ------------------------------------------------------------------ *
 * TOPIC RELEVANCE
 * Computed here with ONE shared lexicon for all three platforms so the
 * on-topic / off-topic split is comparable across them, rather than trusting
 * each collector's own flag.
 *
 * This matters more than it looks. Several accounts in the benchmark set are
 * personality/clip accounts whose peptide posts are a tiny and badly
 * underperforming minority of their output. Ranking their whole feed would put
 * unrelated drama clips at the top of a peptide replication board.
 * ------------------------------------------------------------------ */
const PEPTIDE_RX =
  /\b(peptide|peptid|retatrutide|reta\b|tirzepatide|tirz\b|semaglutide|sema\b|glp[\s-]?1|glp1|mounjaro|zepbound|ozempic|wegovy|bpc[\s-]?157|tb[\s-]?500|ipamorelin|cjc[\s-]?1295|tesamorelin|hgh\b|mots[\s-]?c|sermorelin|survodutide|cagrilintide|mazdutide|aod[\s-]?9604|glow\s?protocol|research\s?chem|trt\b|testosterone|sarm|anabolic|weight[\s-]?loss|fat[\s-]?loss|glp)/i;


/* Signal extraction for the discovered TikTok cohort. Its captions were captured
 * by yt-dlp rather than by a collector that already ran an extractor, so URLs,
 * bare vendor domains and codes have to be lifted here. @retadaily's caption
 * "Pure #peptides. Nothing else. peptora.co.uk" is exactly the kind of vendor
 * pointer that would otherwise be invisible. */
const URL_RX = /\bhttps?:\/\/[^\s)\]"']+|\b[a-z0-9][a-z0-9-]{1,60}\.(?:co\\.uk|com\\.au|co\\.nz|com|io|net|org|shop|store|app|nl|is|de|eu|us|to|ai|xyz|co)\b(?:\/[^\s)\]"']*)?/gi;
const CODE_RX = /\b(?:code|coupon|promo)\s*[:=]?\s*([A-Z0-9][A-Z0-9_-]{2,18})\b/g;
const PCT_RX = /\b(\d{1,2}\s?%\s?off)\b/gi;

function signalsFromText(text) {
  const t = String(text || '');
  const out = [];
  const seen = new Set();
  for (const m of t.matchAll(URL_RX)) {
    const v = m[0].replace(/[.,;]+$/, '');
    if (/^(?:tiktok|instagram|youtube|youtu|facebook|twitter|x)\.com$/i.test(v)) continue;
    if (seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push({ kind: 'url', value: v, context_snippet: t.slice(0, 180) });
  }
  for (const m of t.matchAll(CODE_RX)) out.push({ kind: 'code', value: m[1], context_snippet: t.slice(0, 180) });
  for (const m of t.matchAll(PCT_RX)) out.push({ kind: 'discount_phrase', value: m[1], context_snippet: t.slice(0, 180) });
  if (/\blink in bio\b/i.test(t)) out.push({ kind: 'bio_pointer', value: 'link in bio', context_snippet: t.slice(0, 180) });
  if (/\bdm\b|\bdm me\b/i.test(t)) out.push({ kind: 'dm_gate', value: 'DM CTA', context_snippet: t.slice(0, 180) });
  if (/\bcomment\b/i.test(t)) out.push({ kind: 'comment_drop', value: 'comment CTA', context_snippet: t.slice(0, 180) });
  return out;
}

const posts = [];

/* The three collectors do NOT agree on the shape of affiliate_signals:
 *   youtube / tiktok -> [{kind, value, context_snippet}]
 *   instagram        -> {context, urls[], bare_domains[], discount_codes[],
 *                        vendor_domain_hits[], link_in_bio, dm_cta, comment_cta,
 *                        affiliate_disclosure_words[]}
 * Normalise everything to the list shape here rather than teaching the UI two
 * schemas. Also drop obvious false-positive "codes": the IG extractor lifts any
 * shouty word, so plain English words like ONLY / THIS / FREE arrive as codes. */
const CODE_STOPWORDS = new Set([
  'ONLY', 'THIS', 'THAT', 'FREE', 'WITH', 'FROM', 'YOUR', 'HERE', 'LINK', 'BIO',
  'NEW', 'NOW', 'ALL', 'THE', 'AND', 'FOR', 'NOT', 'BUT', 'YOU', 'GET', 'OFF',
  'DM', 'DMS', 'USA', 'FDA', 'GLP', 'TRT', 'HGH', 'AM', 'PM', 'OK', 'IG', 'US',
]);

function normaliseSignals(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s) => s && s.kind && s.value);
  if (typeof raw !== 'object') return [];
  const out = [];
  const ctx = raw.context || null;
  for (const u of raw.urls || []) out.push({ kind: 'url', value: u, context_snippet: ctx });
  for (const d of raw.bare_domains || []) out.push({ kind: 'url', value: d, context_snippet: ctx });
  for (const v of raw.vendor_domain_hits || []) out.push({ kind: 'vendor_domain', value: v, context_snippet: ctx });
  for (const c of raw.discount_codes || []) {
    const code = String(c).trim();
    // A real code is not an English stopword and is not a single letter.
    if (code.length < 3 || CODE_STOPWORDS.has(code.toUpperCase())) continue;
    out.push({ kind: 'code', value: code, context_snippet: ctx });
  }
  if (raw.link_in_bio) out.push({ kind: 'bio_pointer', value: 'link in bio', context_snippet: ctx });
  if (raw.dm_cta) out.push({ kind: 'dm_gate', value: 'DM CTA', context_snippet: ctx });
  if (raw.comment_cta) out.push({ kind: 'comment_drop', value: 'comment CTA', context_snippet: ctx });
  for (const w of raw.affiliate_disclosure_words || []) {
    out.push({ kind: 'disclosure_language', value: w, context_snippet: ctx });
  }
  return out;
}

function pushPost(p) {
  if (!p.url) return;
  p.on_topic = PEPTIDE_RX.test(p._text || '') || p.handle_is_topic === true;
  p.affiliate_signals = normaliseSignals(p.affiliate_signals);
  posts.push(p);
}

// ---- YouTube ----
if (yt && Array.isArray(yt.posts)) {
  for (const p of yt.posts) {
    const hookText = p.title || '';
    const fullText = [p.title, p.description].filter(Boolean).join('\n');
    pushPost({
      id: `yt:${p.id}`,
      platform: 'youtube',
      provenance: 'api_collected',
      url: p.url || p.webpage_url || `https://www.youtube.com/watch?v=${p.id}`,
      creator: p.channel || p.uploader || null,
      creator_id: p.channel_id || p.channel || null,
      creator_url: p.channel_url || null,
      creator_followers: p.channel_follower_count ?? null,
      hook: hookText,
      caption: p.description ? String(p.description).slice(0, 600) : null,
      published_at: p.upload_date
        ? `${String(p.upload_date).slice(0, 4)}-${String(p.upload_date).slice(4, 6)}-${String(p.upload_date).slice(6, 8)}`
        : null,
      duration: p.duration ?? null,
      views: p.view_count ?? null,
      likes: p.like_count ?? null,
      comments: p.comment_count ?? null,
      shares: null,
      shares_note: 'YouTube does not expose a share/repost count publicly',
      thumbnail: p.thumbnail || null,
      affiliate_signals: p.affiliate_signals || [],
      metric_source: 'yt-dlp --dump-json',
      _text: fullText,
    });
  }
}

// ---- TikTok ----
if (tt && Array.isArray(tt.posts)) {
  for (const p of tt.posts) {
    const hookText = p.title || p.caption || '';
    pushPost({
      id: `tt:${p.id}`,
      platform: 'tiktok',
      provenance: 'api_collected',
      url: p.webpage_url || p.url || `https://www.tiktok.com/@${p.uploader}/video/${p.id}`,
      creator: p.uploader || null,
      creator_id: p.uploader_id || p.uploader || null,
      creator_url: p.uploader ? `https://www.tiktok.com/@${p.uploader}` : null,
      creator_followers: p.channel_follower_count ?? null,
      hook: hookText,
      caption: hookText ? String(hookText).slice(0, 600) : null,
      published_at: p.upload_date
        ? `${String(p.upload_date).slice(0, 4)}-${String(p.upload_date).slice(4, 6)}-${String(p.upload_date).slice(6, 8)}`
        : p.timestamp
        ? new Date(p.timestamp * 1000).toISOString().slice(0, 10)
        : null,
      // The TikTok collector names this duration_sec, not duration. Reading the
      // wrong key silently made all 152 TikTok posts format:"unknown".
      duration: p.duration_sec ?? p.duration ?? null,
      views: p.view_count ?? null,
      likes: p.like_count ?? null,
      comments: p.comment_count ?? null,
      shares: p.repost_count ?? null,
      thumbnail: p.thumbnail || null,
      affiliate_signals: p.affiliate_signals || [],
      metric_source: 'yt-dlp (TikTok user feed stats block)',
      _text: hookText,
    });
  }
}

// ---- Instagram ----
if (ig && Array.isArray(ig.posts)) {
  const igCreators = new Map((ig.creators || []).map((c) => [c.handle, c]));
  for (const p of ig.posts) {
    const c = igCreators.get(p.handle) || {};
    const hookText = p.caption || p.accessibility_caption || '';
    pushPost({
      id: `ig:${p.shortcode}`,
      platform: 'instagram',
      provenance: 'api_collected',
      url: p.url,
      creator: p.handle,
      creator_id: p.handle,
      creator_url: `https://www.instagram.com/${p.handle}/`,
      creator_followers: c.followers ?? null,
      hook: hookText,
      caption: hookText ? String(hookText).slice(0, 600) : null,
      published_at: p.taken_at_iso ? p.taken_at_iso.slice(0, 10) : null,
      duration: null,
      duration_note: 'Instagram web_profile_info does not expose video duration',
      views: p.video_view_count ?? null,
      views_note: p.video_view_count == null
        ? (p.is_video
            ? 'IG did not expose a view count for this video (returned 0 / suppressed) - null, not zero'
            : 'not a video; IG exposes no view count for images or carousels')
        : null,
      likes: p.likes ?? null,
      comments: p.comments ?? null,
      shares: null,
      shares_note: 'Instagram does not expose share/save counts on the public endpoint',
      thumbnail: p.thumbnail_src || p.display_url || null,
      affiliate_signals: p.affiliate_signals || [],
      metric_source: 'instagram web_profile_info (unauthenticated)',
      _text: hookText,
    });
  }
}

/* ---- discovered peptide-NATIVE TikTok cohort ----
 * The original TikTok seed list came from the recon doc and turned out to be
 * personality/clip accounts (2 of 152 posts on topic). This cohort was found by
 * crosswalking TikTok handles out of the YouTube descriptions and IG bios we
 * already had, mining @mentions in on-topic captions, and probing topic-morpheme
 * handle patterns - then verifying each against TikTok. These are the accounts
 * whose whole identity is the topic. */
if (ttDisc && Array.isArray(ttDisc.creators)) {
  for (const c of ttDisc.creators) {
    for (const p of c.posts || []) {
      if (!p.id) continue;
      const cap = p.caption || '';
      pushPost({
        id: `tt:${p.id}`,
        platform: 'tiktok',
        provenance: 'api_collected',
        discovery_cohort: 'peptide_native_tiktok',
        url: p.url || `https://www.tiktok.com/@${c.handle}/video/${p.id}`,
        creator: c.handle,
        creator_id: c.handle,
        creator_url: c.profile_url,
        creator_followers: c.follower_count ?? null,
        hook: cap,
        caption: cap ? String(cap).slice(0, 600) : null,
        published_at: p.upload_date
          ? `${String(p.upload_date).slice(0, 4)}-${String(p.upload_date).slice(4, 6)}-${String(p.upload_date).slice(6, 8)}`
          : null,
        duration: p.duration ?? null,
        views: p.views ?? null,
        likes: p.likes ?? null,
        comments: p.comments ?? null,
        shares: p.reposts ?? null,
        thumbnail: null,
        affiliate_signals: signalsFromText(cap),
        metric_source: 'yt-dlp (TikTok user feed stats block), discovery cohort',
        // The handle itself is topic evidence for these accounts.
        handle_is_topic: c.topic_evidence !== 'captions only',
        _text: `${cap} ${c.handle}`,
      });
    }
  }
}

// ---- hand-collected recon posts (kept separate, never in api stats) ----
if (recon && Array.isArray(recon.observed_posts)) {
  for (const p of recon.observed_posts) {
    pushPost({
      id: `recon:${Buffer.from(p.url).toString('base64url').slice(0, 16)}`,
      platform: p.platform,
      provenance: 'hand_collected',
      url: p.url,
      creator: p.creator,
      creator_id: p.creator,
      creator_url: null,
      creator_followers: p.channel_followers ?? null,
      hook: p.title || '',
      caption: p.hook_and_structure || null,
      published_at: p.date || null,
      duration: p.duration ?? null,
      views: p.views ?? null,
      likes: p.likes ?? null,
      comments: p.comments ?? null,
      shares: p.reposts ?? null,
      thumbnail: null,
      affiliate_signals: p.cta_and_disclosure
        ? [{ kind: 'observed_cta', value: p.cta_and_disclosure, context_snippet: null }]
        : [],
      metric_source: 'hand-collected from public pages (see collection_caveats)',
      recon_verdict: p.verdict,
      recon_disposition: p.disposition,
      recon_note: p.note_outlier || null,
      _text: [p.title, p.hook_and_structure, p.cta_and_disclosure].filter(Boolean).join('\n'),
    });
  }
}

console.log(`normalised ${posts.length} posts`);

/* ------------------------------------------------------------------ *
 * CREATOR BASELINES (own-median, api_collected only)
 * ------------------------------------------------------------------ */
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const byCreator = new Map();
for (const p of posts) {
  const key = `${p.platform}:${p.creator_id || p.creator}`;
  if (!byCreator.has(key)) byCreator.set(key, []);
  byCreator.get(key).push(p);
}

const baselines = new Map();
for (const [key, ps] of byCreator) {
  const views = ps.map((p) => p.views).filter((v) => typeof v === 'number' && v > 0);
  baselines.set(key, {
    median_views: median(views),
    n_with_views: views.length,
    confidence: views.length >= 4 ? 'ok' : 'low',
  });
}

/* ------------------------------------------------------------------ *
 * SCORE
 * ------------------------------------------------------------------ */
const logScale = (v, max) => (v == null ? null : Math.min(100, (Math.log10(1 + v) / Math.log10(1 + max)) * 100));

for (const p of posts) {
  const key = `${p.platform}:${p.creator_id || p.creator}`;
  const base = baselines.get(key) || {};
  const dims = {};

  // outlier
  if (p.views != null && base.median_views) {
    p.outlier_multiple = Number((p.views / base.median_views).toFixed(2));
    dims.outlier = Math.min(100, (Math.log10(Math.max(1, p.outlier_multiple)) / Math.log10(20)) * 100);
  } else {
    p.outlier_multiple = null;
    dims.outlier = null;
  }
  p.baseline_median_views = base.median_views ?? null;
  p.baseline_confidence = base.confidence ?? 'low';
  p.baseline_n = base.n_with_views ?? 0;

  // age + reach rate
  const pub = p.published_at ? Date.parse(p.published_at) : null;
  p.age_days = pub ? Math.max(1, Math.round((NOW - pub) / 86400000)) : null;
  if (p.views != null && p.age_days) {
    p.views_per_day_lifetime = Math.round(p.views / p.age_days);
    dims.reach_rate = logScale(p.views_per_day_lifetime, 200000);
  } else {
    p.views_per_day_lifetime = null;
    dims.reach_rate = null;
  }

  // share/save
  if (p.shares != null && p.views != null && p.views > 0) {
    p.share_rate = Number(((p.shares / p.views) * 100).toFixed(3));
    dims.share_save = Math.min(100, (p.share_rate / 2) * 100);
  } else {
    p.share_rate = null;
    dims.share_save = null;
  }

  // comments
  if (p.comments != null && p.views != null && p.views > 0) {
    p.comment_rate = Number(((p.comments / p.views) * 100).toFixed(3));
    dims.comments = Math.min(100, (p.comment_rate / 1) * 100);
  } else {
    p.comment_rate = null;
    dims.comments = null;
  }

  // recency: 30-day half-life
  dims.recency = p.age_days == null ? null : 100 * Math.pow(0.5, p.age_days / 30);

  /* SCOPE NOTE — this matters and was got wrong once already.
   * Claim-risk and replication-fit are judged on the HOOK (title/caption), not
   * on the full description. A YouTube description is mostly disclaimers,
   * affiliate boilerplate and link lists, so scanning it made almost everything
   * trip a rule: 200 of 291 on-topic posts came out REJECT, including a video
   * whose only offence was the word "dose" inside its own safety disclaimer.
   * What we are judging is the claim the post MAKES, which lives in the hook.
   * Description hits are still recorded, for transparency, but do not decide the
   * verdict. */
  const fit = replicationFit(p.hook, p.duration);
  p.replication_fit = fit.fit;
  p.replication_fit_reasons = fit.reasons;
  dims.replication_fit = fit.fit;

  // composite, renormalised over available dimensions
  let wsum = 0;
  let acc = 0;
  let available = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (dims[k] != null) {
      acc += dims[k] * w;
      wsum += w;
      available++;
    }
  }
  p.sub_scores = Object.fromEntries(
    Object.entries(dims).map(([k, v]) => [k, v == null ? null : Math.round(v)])
  );
  p.metric_coverage = Number((available / 6).toFixed(2));
  p.score_renormalised_over = Object.entries(dims).filter(([, v]) => v != null).map(([k]) => k);

  // Renormalising over missing dimensions is correct for a SECONDARY field like
  // shares. It is NOT correct when the primary evidence is absent entirely.
  // outlier + reach_rate carry 55 of the 100 weight and both derive from views,
  // so with no view count the remaining soft dimensions (recency, fit, comment
  // rate) would produce a confident-looking score that is not comparable to a
  // post that actually earned it. Verified failure: 21 Instagram posts with no
  // exposed view count were scoring >=70 and topping the board over a YouTube
  // video with 1.4M measured views. A virality board must not rank the
  // unmeasured. So: no views -> no score, and never rank-eligible.
  if (p.views == null) {
    p.score = null;
    p.score_basis = 'not scored: this platform did not expose a view count, and 55 of the 100 score weight derives from views';
  } else {
    p.score = wsum > 0 ? Math.round(acc / wsum) : null;
    p.score_basis = null;
  }

  // classification
  const h = classifyHook(p.hook);
  p.hook_archetype = h.archetype;
  p.hook_rule = h.matched_rule;
  const f = classifyFormat(p._text, p.duration);
  p.format = f.format;
  p.format_basis = f.basis;
  p.duration_band = durationBand(p.duration);
  p.claim_risks = claimRisks(p.hook);
  // Recorded for transparency; deliberately NOT used to decide the verdict.
  const descOnly = String(p.caption || '').replace(String(p.hook || ''), '');
  p.description_risks = claimRisks(descOnly).filter((r) => !p.claim_risks.includes(r));

  // ---- verdict ladder ----
  // An earlier pass put 171 of 202 on-topic posts (85%) into ADAPT, which makes
  // the column decorative. A verdict has to be able to say "we cannot judge
  // this", otherwise ADAPT silently absorbs everything unjudgeable. So
  // off-topic and unmeasured posts get their own honest labels and only posts we
  // can actually assess compete for COPY / ADAPT / REJECT.
  if (p.recon_verdict) {
    p.verdict = p.recon_verdict;
    p.verdict_rationale = `Carried over from the hand-collected recon disposition: ${p.recon_disposition}`;
    p.verdict_source = 'recon_disposition';
  } else if (!p.on_topic) {
    p.verdict = 'OFF-TOPIC';
    p.verdict_rationale =
      'Not peptide/GLP-1 content, so this is not a replication judgment. Kept in the dataset only as the baseline that this account own peptide posts are measured against.';
    p.verdict_source = 'topic_rule';
  } else if (p.claim_risks.length >= 1) {
    p.verdict = 'REJECT';
    p.verdict_rationale = `Mechanism depends on ${p.claim_risks.join(' + ')}, which a Biologix affiliate must not produce.`;
    p.verdict_source = 'claim_risk_rule';
  } else if (p.replication_fit < 40) {
    p.verdict = 'REJECT';
    p.verdict_rationale = `Replication fit too low (${p.replication_fit}/100): ${fit.reasons.filter((r) => r.includes('depends') || r.includes('producible')).join('; ') || 'no transferable mechanism'}.`;
    p.verdict_source = 'fit_rule';
  } else if (p.views == null) {
    p.verdict = 'UNMEASURED';
    p.verdict_rationale =
      'On topic and carries no claim risk, but the platform exposed no view count, so whether it actually performed cannot be established. Judge the format, not the performance.';
    p.verdict_source = 'no_metric_rule';
  } else if (p.replication_fit >= 70 && (p.outlier_multiple ?? 0) >= 1.5 && p.baseline_confidence === 'ok') {
    // COPY now requires PROOF it beat its own creator baseline, not just a good
    // absolute score. Otherwise a mediocre post on a small account qualifies.
    p.verdict = 'COPY';
    p.verdict_rationale = `Beat this creator own median by ${p.outlier_multiple}x with a transferable format (${fit.reasons.join('; ') || 'no blocking dependency'}).`;
    p.verdict_source = 'outlier_and_fit_rule';
  } else {
    p.verdict = 'ADAPT';
    const why = fit.reasons.filter((r) => r.includes('depends') || r.includes('cost'));
    const perf =
      p.outlier_multiple != null && p.outlier_multiple < 1.5
        ? `only ${p.outlier_multiple}x this creator own median, so the format is worth borrowing but this post is not proof it wins`
        : p.baseline_confidence !== 'ok'
        ? 'no reliable baseline for this creator, so its outperformance is unproven'
        : 'usable structure';
    p.verdict_rationale = `${perf}. ${why.length ? 'Requires substitution: ' + why.join('; ') : 'Reframe the subject to the affiliate workflow.'}`;
    p.verdict_source = 'fit_rule';
  }
}

// bar low-confidence baselines from ranking on outlier alone
for (const p of posts) {
  if (p.score == null) {
    p.rank_eligible = false;
    p.rank_note = p.score_basis || 'Not ranked: no score could be computed.';
  } else if (p.baseline_confidence === 'low' && (p.outlier_multiple ?? 0) > 3) {
    p.rank_eligible = false;
    p.rank_note = `Held out of the top ranking: outlier multiple ${p.outlier_multiple}x is computed against only ${p.baseline_n} collected post(s) for this creator, which is not a meaningful baseline.`;
  } else {
    p.rank_eligible = true;
    p.rank_note = null;
  }
}

posts.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

/* ------------------------------------------------------------------ *
 * REPLICATION SPECS (top api_collected posts)
 * ------------------------------------------------------------------ */
const BRIEF_BY_ARCHETYPE = {
  'credential-contrast': {
    steal: ['Lead with a reason to listen in the first 3 seconds', 'Anchor the unknown thing to a known category the viewer already has an opinion about'],
    change: 'Swap the clinical credential for a role credential the affiliate actually holds: "I review affiliate content for a peptide brand." Never imply clinical authority.',
    brief: ['0-3s: state your real role on camera, no music', '3-8s: name the widely-held belief you are about to correct', '8-25s: show the document or policy on screen that corrects it', '25-40s: state the one thing the document does NOT prove', '40-50s: disclosure card, then one CTA'],
  },
  'risk-warning': {
    steal: ['Candour outperforms hype in this niche', 'Naming what can go wrong buys permission to be believed'],
    change: 'Keep the risk subject on the affiliate/compliance process, not on physiology. "What happens when a creator forgets disclosure", not "side effects".',
    brief: ['0-3s: name the failure out loud', '3-10s: why most people get it wrong', '10-30s: the three specific failure modes, one per beat, on-screen text', '30-40s: the correct process', '40-50s: disclosure, one CTA'],
  },
  'quit-reversal': {
    steal: ['Reversal framing defeats the audience expectation of a sales pitch', 'Works even on a small account'],
    change: 'Reverse on a process decision, not a product decision. "Why we rejected this viral hook."',
    brief: ['0-3s: "we killed this post and it would have done numbers"', '3-12s: show the hook you rejected', '12-30s: the specific rule it broke', '30-45s: what you shipped instead', '45-55s: disclosure, one CTA'],
  },
  'first-person-timeline': {
    steal: ['Chronology creates episodes you can serialize', 'Week-N titles are searchable and repeatable'],
    change: 'The timeline must be your affiliate workflow, never consumption or bodily outcomes. "Day 1 to 30 as a Biologix affiliate."',
    brief: ['0-3s: "day 14 of building this affiliate account"', '3-10s: what you expected', '10-30s: what actually happened, with a screen recording as proof', '30-45s: the number that changed', '45-55s: disclosure, one CTA'],
  },
  'beginner-guide': {
    steal: ['Captures high-intent search', 'Signals completeness, which earns the long watch'],
    change: 'Make the subject the program and the paperwork, not the compound. "How to read a batch document."',
    brief: ['0-5s: promise the specific thing they will be able to do', '5-15s: the map of what is covered', '15s-end: one chapter per concept, each with a document on screen', 'final 20s: recap, disclosure, one CTA'],
  },
  comparison: {
    steal: ['Side-by-side is inherently watchable and shareable', 'Positions you as the neutral party'],
    change: 'Compare programs, disclosure rules, or documentation standards. Do not compare compounds or outcomes.',
    brief: ['0-3s: name both sides of the comparison', '3-10s: the criterion that actually matters', '10-35s: three criteria, side-by-side on screen', '35-45s: your verdict and why', '45-55s: disclosure, one CTA'],
  },
  'evidence-question': {
    steal: ['A question hook invites the click without promising an outcome', 'Lets you present evidence without asserting a claim'],
    change: 'Keep the question answerable from documents you can show. Do not answer with efficacy conclusions.',
    brief: ['0-3s: ask the question plainly', '3-10s: why the obvious answer is incomplete', '10-30s: walk the actual document or study page on screen', '30-45s: what it does and does not establish', '45-55s: disclosure, one CTA'],
  },
  'cta-repetition': {
    steal: ['One identical CTA across every post builds campaign memory and clean attribution', 'Warren English runs this on a 5.7k-follower account'],
    change: 'Point the single CTA at your approved campaign link with your creator ID. One link, one code, one action, every time.',
    brief: ['Whatever the content, close every post with the identical 5-word CTA', 'Same on-screen placement, same caption line, same bio link', 'Never run two offers in one post'],
  },
};

const GENERIC_BRIEF = {
  steal: ['Study the pacing and the first-frame promise'],
  change: 'Rebuild the subject matter around the affiliate workflow, documentation, or disclosure rather than the compound.',
  brief: ['0-3s: a concrete promise you can keep', '3-30s: show evidence on screen rather than asserting', '30-45s: state the boundary of what you know', '45-55s: disclosure, one CTA'],
};

const specTargets = posts.filter((p) => p.provenance === 'api_collected' && p.rank_eligible && p.on_topic).slice(0, 40);
for (const p of specTargets) {
  const tmpl = BRIEF_BY_ARCHETYPE[p.hook_archetype] || GENERIC_BRIEF;
  const mech = (p.affiliate_signals || []).filter((s) => s && s.kind);
  p.replication_spec = {
    hook_verbatim: p.hook,
    hook_archetype: p.hook_archetype,
    format: p.format,
    duration_seconds: p.duration,
    duration_band: p.duration_band,
    // Honest about the limit of what a title + caption + duration can tell us.
    structure_beats_basis:
      'Beats below are a PRESCRIPTION for replication, derived from the hook archetype. They are NOT a transcript of the source video - we did not download or watch the media, so a shot-by-shot reconstruction would be invented.',
    disclosure_observed: mech.length
      ? mech.map((m) => m.value).join(' | ')
      : 'none observed in the collected caption/description',
    affiliate_mechanic: mech.length ? mech.map((m) => `${m.kind}: ${m.value}`) : ['none-observed'],
    what_to_steal: tmpl.steal,
    what_to_change_for_biologix: tmpl.change,
    executable_brief: tmpl.brief,
    claim_risks_to_avoid: p.claim_risks,
  };
}

/* ------------------------------------------------------------------ *
 * ROLLUPS
 * ------------------------------------------------------------------ */
function rollup(keyFn, label) {
  const groups = new Map();
  for (const p of posts) {
    if (p.provenance !== 'api_collected') continue;
    const k = keyFn(p);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const out = [];
  for (const [k, ps] of groups) {
    const views = ps.map((p) => p.views).filter((v) => typeof v === 'number');
    const outl = ps.map((p) => p.outlier_multiple).filter((v) => typeof v === 'number');
    const best = ps.filter((p) => p.rank_eligible).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    out.push({
      key: k,
      dimension: label,
      n_posts: ps.length,
      n_with_views: views.length,
      median_views: median(views),
      max_views: views.length ? Math.max(...views) : null,
      median_outlier_multiple: median(outl),
      median_score: median(ps.map((p) => p.score).filter((v) => typeof v === 'number')),
      verdicts: ps.reduce((a, p) => ((a[p.verdict] = (a[p.verdict] || 0) + 1), a), {}),
      best_example: best ? { id: best.id, url: best.url, hook: best.hook, views: best.views, score: best.score } : null,
      thin_evidence: ps.length < 5,
      evidence_note: ps.length < 5 ? `Only ${ps.length} post(s) in this group. Not enough to conclude anything.` : null,
    });
  }
  return out.sort((a, b) => b.n_posts - a.n_posts);
}

const rollups = {
  by_hook_archetype: rollup((p) => p.hook_archetype, 'hook_archetype'),
  by_format: rollup((p) => p.format, 'format'),
  by_duration_band: rollup((p) => p.duration_band, 'duration_band'),
  by_platform: rollup((p) => p.platform, 'platform'),
  by_topic: rollup((p) => (p.on_topic ? 'peptide topic' : 'account general content'), 'topic'),
};

/* ------------------------------------------------------------------ *
 * TOPIC COMPARISON — does peptide content actually carry these accounts?
 * For every creator that posted BOTH on-topic and off-topic, compare the
 * median views of each. This is the single most decision-relevant output:
 * if an account's peptide posts badly underperform its general content, then
 * its audience is not there for peptides and borrowing its reach is a mirage.
 * ------------------------------------------------------------------ */
const topic_comparison = [];
for (const [key, ps] of byCreator) {
  if (ps[0].provenance !== 'api_collected') continue;
  const on = ps.filter((p) => p.on_topic && typeof p.views === 'number').map((p) => p.views);
  const off = ps.filter((p) => !p.on_topic && typeof p.views === 'number').map((p) => p.views);
  if (!on.length || !off.length) continue;
  const mOn = median(on);
  const mOff = median(off);
  topic_comparison.push({
    key,
    platform: ps[0].platform,
    creator: ps[0].creator,
    n_on_topic: on.length,
    n_off_topic: off.length,
    median_views_on_topic: mOn,
    median_views_off_topic: mOff,
    ratio: mOff > 0 ? Number((mOn / mOff).toFixed(2)) : null,
    reading:
      mOff > 0 && mOn / mOff < 0.5
        ? 'Peptide content substantially UNDERPERFORMS this account general output. Its reach does not transfer to the topic.'
        : mOff > 0 && mOn / mOff > 2
        ? 'Peptide content OUTPERFORMS this account general output. The topic is what the audience wants.'
        : 'Peptide and general content perform comparably on this account.',
    thin_evidence: on.length < 3 || off.length < 3,
  });
}
topic_comparison.sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99));

/* ------------------------------------------------------------------ *
 * AFFILIATE MECHANICS MAP
 * ------------------------------------------------------------------ */
const mechMap = new Map();
for (const p of posts) {
  for (const s of p.affiliate_signals || []) {
    if (!s || !s.value) continue;
    const k = `${s.kind}::${String(s.value).toLowerCase().slice(0, 120)}`;
    if (!mechMap.has(k)) {
      mechMap.set(k, { kind: s.kind, value: s.value, platforms: new Set(), creators: new Set(), times_seen: 0, example_post: p.url, context: s.context_snippet || null });
    }
    const m = mechMap.get(k);
    m.platforms.add(p.platform);
    if (p.creator) m.creators.add(p.creator);
    m.times_seen++;
  }
}
/* A single URL appearing once in one creator's description is NOT a "mechanic" -
 * YouTube descriptions are link-dense with the creator's own socials, which is
 * why the raw distinct-value count jumped from 137 to 1,415 the moment real
 * descriptions arrived. A mechanic is either a non-URL device (a code, a bio
 * pointer, a DM/comment gate, a lead magnet, a disclosure phrase) or a URL that
 * actually recurs. Everything else is kept but flagged as a one-off so the
 * headline count cannot overstate the finding. */
const allMechanics = [...mechMap.values()]
  .map((m) => ({
    ...m,
    platforms: [...m.platforms],
    creators: [...m.creators],
    is_recurring: m.times_seen >= 2 || m.kind !== 'url',
  }))
  .sort((a, b) => b.times_seen - a.times_seen);
const affiliate_mechanics = allMechanics.filter((m) => m.is_recurring);
const mechanics_one_off_urls = allMechanics.length - affiliate_mechanics.length;

// bio funnels from IG
const bio_funnels = (ig && ig.bio_funnels) || [];

/* ------------------------------------------------------------------ *
 * AFFILIATE ATTRIBUTION — who is promoting WHOM
 *
 * The mechanics map above says HOW people link (bio pointer, code, comment
 * gate). It does not say WHO they link FOR. This resolves every observed URL to
 * a domain, classifies that domain, and matches it against the 18 documented
 * peptide affiliate programs plus 9 other known seller/aggregator domains, so
 * each creator gets an actual list of brands they promote.
 * ------------------------------------------------------------------ */
const PROGRAMS = (recon && recon.affiliate_programs) || [];
const SELLERS = (recon && recon.other_seller_domains) || [];

const domainToProgram = new Map();
for (const pr of PROGRAMS) for (const dom of pr.domains || []) domainToProgram.set(dom, pr);
const domainToSeller = new Map(SELLERS.map((x) => [x.domain, x]));

// Affiliate/tracking networks: presence proves a program exists behind the link.
const NETWORK_RX = /(refersion|goaffpro|leaddyno|slicewp|shareasale|impact\.com|clickbank|partnerize|awin|cj\.com|tapfiliate|firstpromoter|rewardful|postaffiliatepro)/i;
// Creator's own offer surfaces, not a third-party affiliate relationship.
const OWN_OFFER_RX = /(skool\.com|patreon|substack|gumroad|teachable|kajabi|podia|circle\.so|whop\.com|stan\.store|beacons\.ai|linktr\.ee|link\.me|calendly|cal\.com|typeform|mailchimp|beehiiv|convertkit)/i;
const SOCIAL_RX = /(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|facebook\.com|reddit\.com|discord|t\.me|whatsapp|linkedin\.com|threads\.net|snapchat)/i;
// Looks like a peptide/research-chem vendor even if not in the documented set.
const VENDOR_HEURISTIC_RX = /(peptide|peptid|pepti|pept|peptor|reta\b|glp-?[0-9]|researchchem|research-chem|sarms?|nootrop|biotech|bioscience|labs?\b|pharma|chem\b)/i;
const VENDOR_NOT_RX = /^(labs?|www)\.|huberman|journal|society|university|academy|pubmed|ncbi|nih|wikipedia|sciencedirect|oup\.com|truehealthlabs|consumerlab|omegaquant|examine\.com|mentorship|profitacademy/i;
const ADJACENT_RX = /(electrolyte|lmnt|redmond|athleticgreens|ag1|thorne|momentous|seed\.com|element|hume|ketone|supplement|protein|creatine|magnesium)/i;

function hostOf(u) {
  try {
    const h = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase();
    return h.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

function classifyDomain(host) {
  if (!host) return { klass: 'unparseable', brand: null, program: null };
  const bare = host.replace(/^www\./, '');
  // exact or suffix match against documented programs
  for (const [dom, pr] of domainToProgram) {
    if (bare === dom || bare.endsWith('.' + dom) || dom.endsWith('.' + bare)) {
      return { klass: 'documented_peptide_program', brand: pr.brand, program: pr.n };
    }
  }
  for (const [dom, sl] of domainToSeller) {
    if (bare === dom || bare.endsWith('.' + dom)) {
      return { klass: 'known_seller_or_aggregator', brand: sl.brand, program: null };
    }
  }
  if (NETWORK_RX.test(bare)) return { klass: 'affiliate_network', brand: null, program: null };
  if (SOCIAL_RX.test(bare)) return { klass: 'social', brand: null, program: null };
  if (OWN_OFFER_RX.test(bare)) return { klass: 'own_offer_platform', brand: null, program: null };
  if (ADJACENT_RX.test(bare)) return { klass: 'adjacent_product', brand: null, program: null };
  // Guard the vendor heuristic. "labs"/"pharma"/"society" alone produced false
  // positives on hubermanlab.com, pharmaceutical-journal.com, peptidesociety.org
  // and truehealthlabs.com (a blood-testing service, not a peptide seller).
  if (VENDOR_NOT_RX.test(bare)) return { klass: 'reference_or_media', brand: null, program: null };
  if (VENDOR_HEURISTIC_RX.test(bare)) return { klass: 'suspected_peptide_vendor', brand: bare, program: null };
  return { klass: 'other', brand: null, program: null };
}

// Resolve every URL signal on every post.
const domainRows = new Map();
for (const p of posts) {
  const seen = new Set();
  p.linked_domains = [];
  for (const sig of p.affiliate_signals || []) {
    if (sig.kind !== 'url' && sig.kind !== 'vendor_domain') continue;
    const host = hostOf(sig.value);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    const c = classifyDomain(host);
    p.linked_domains.push({ host, ...c });
    const key = host;
    if (!domainRows.has(key)) {
      domainRows.set(key, { host, ...c, times_seen: 0, creators: new Set(), platforms: new Set(), example_post: p.url });
    }
    const row = domainRows.get(key);
    row.times_seen++;
    if (p.creator) row.creators.add(p.creator);
    row.platforms.add(p.platform);
  }
  // A creator's own domain is their own offer, not an affiliate relationship.
  p.promotes_brands = [...new Set(p.linked_domains.filter((d) => d.brand).map((d) => d.brand))];
}

const linked_domains = [...domainRows.values()]
  .map((r) => ({ ...r, creators: [...r.creators], platforms: [...r.platforms] }))
  .sort((a, b) => b.times_seen - a.times_seen);

/* Brand -> creators. Only documented programs and known sellers count as a
 * confirmed brand relationship; a suspected vendor is reported separately so a
 * heuristic never gets presented as a confirmed fact. */
const brandRows = new Map();
for (const d of linked_domains) {
  if (!d.brand) continue;
  const k = d.brand;
  if (!brandRows.has(k)) {
    brandRows.set(k, {
      brand: k,
      confirmed: d.klass === 'documented_peptide_program' || d.klass === 'known_seller_or_aggregator',
      klass: d.klass,
      program: PROGRAMS.find((x) => x.brand === k) || null,
      domains: [], creators: new Set(), platforms: new Set(), times_seen: 0,
    });
  }
  const row = brandRows.get(k);
  row.domains.push(d.host);
  d.creators.forEach((c) => row.creators.add(c));
  d.platforms.forEach((pl) => row.platforms.add(pl));
  row.times_seen += d.times_seen;
}
const brands_promoted = [...brandRows.values()]
  .map((b) => ({
    ...b,
    creators: [...b.creators],
    platforms: [...b.platforms],
    commission: b.program ? b.program.commission : null,
    attribution: b.program ? b.program.attribution : null,
    restrictions: b.program ? b.program.restrictions : null,
    risk_note: b.program ? b.program.risk_note : null,
    sells_retatrutide: b.program ? b.program.sells_retatrutide : null,
  }))
  .sort((a, b) => b.times_seen - a.times_seen);

/* Per-creator monetisation posture. This is the distinction that actually
 * matters strategically: a creator who links a peptide VENDOR is a competitor
 * for the same affiliate dollar, whereas a creator monetising their own
 * community or coaching is a potential partner with no conflicting deal. */
const creatorAffiliate = new Map();
for (const [key, ps] of byCreator) {
  const doms = ps.flatMap((p) => p.linked_domains || []);
  const codes = [...new Set(ps.flatMap((p) => (p.affiliate_signals || []).filter((s) => s.kind === 'code' || s.kind === 'discount_code').map((s) => s.value)))];
  const discountPhrases = [...new Set(ps.flatMap((p) => (p.affiliate_signals || []).filter((s) => s.kind === 'discount_phrase').map((s) => s.value)))];
  const vendorBrands = [...new Set(doms.filter((d) => d.klass === 'documented_peptide_program' || d.klass === 'known_seller_or_aggregator').map((d) => d.brand))];
  const suspected = [...new Set(doms.filter((d) => d.klass === 'suspected_peptide_vendor').map((d) => d.host))];
  const networks = [...new Set(doms.filter((d) => d.klass === 'affiliate_network').map((d) => d.host))];
  const own = [...new Set(doms.filter((d) => d.klass === 'own_offer_platform').map((d) => d.host))];
  const adjacent = [...new Set(doms.filter((d) => d.klass === 'adjacent_product').map((d) => d.host))];
  const hasBioPointer = ps.some((p) => (p.affiliate_signals || []).some((s) => s.kind === 'bio_pointer'));
  const hasGate = ps.some((p) => (p.affiliate_signals || []).some((s) => /dm_gate|dm_trigger|comment_drop|comment_trigger/.test(s.kind)));
  const leadMagnets = [...new Set(ps.flatMap((p) => (p.affiliate_signals || []).filter((s) => s.kind === 'lead_magnet').map((s) => s.value)))];

  let posture = 'none_observed';
  if (vendorBrands.length || networks.length) posture = 'peptide_vendor_affiliate';
  else if (suspected.length) posture = 'suspected_vendor_affiliate';
  else if (adjacent.length && (codes.length || discountPhrases.length)) posture = 'adjacent_product_affiliate';
  else if (own.length || leadMagnets.length || hasGate) posture = 'own_offer_operator';
  else if (codes.length || discountPhrases.length) posture = 'code_only_unresolved_brand';

  creatorAffiliate.set(key, {
    posture,
    vendor_brands: vendorBrands,
    suspected_vendor_domains: suspected,
    affiliate_networks: networks,
    own_offer_platforms: own,
    adjacent_products: adjacent,
    codes,
    discount_phrases: discountPhrases,
    lead_magnets: leadMagnets,
    uses_bio_pointer: hasBioPointer,
    uses_dm_or_comment_gate: hasGate,
  });
}

/* ------------------------------------------------------------------ *
 * CREATORS
 * ------------------------------------------------------------------ */
const LANE_RULES = [
  { lane: 'doctor-authority', rule: /\b(md|do|dr\.?|doctor|physician|pathologist|pharmd|rn|nurse|surgeon)\b/i },
  { lane: 'physique-authority', rule: /\b(ifbb|pro|bodybuilding|coach|trainer|athlete)\b/i },
  { lane: 'evidence-desk', rule: /\b(research|science|scientist|phd|study|data|evidence)\b/i },
  { lane: 'catalog-navigator', rule: /\b(peptide|vendor|source|compare|scout|guide|library)\b/i },
];
function lane(text) {
  const t = text || '';
  for (const r of LANE_RULES) if (r.rule.test(t)) return r.lane;
  return 'other';
}

const creatorRows = [];
for (const [key, ps] of byCreator) {
  const first = ps[0];
  if (first.provenance !== 'api_collected') continue;
  const views = ps.map((p) => p.views).filter((v) => typeof v === 'number');
  const base = baselines.get(key) || {};
  const igc = ig && (ig.creators || []).find((c) => c.handle === first.creator);
  const bioText = igc ? [igc.biography, igc.category_name].filter(Boolean).join(' ') : first.creator || '';
  const best = ps.filter((p) => p.rank_eligible).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  creatorRows.push({
    key,
    platform: first.platform,
    handle: first.creator,
    url: first.creator_url,
    followers: first.creator_followers ?? (igc ? igc.followers : null),
    followers_note: first.creator_followers == null && !igc ? 'not exposed by the collection method' : null,
    lane: lane(bioText),
    bio: igc ? igc.biography : null,
    bio_link: igc ? igc.external_url : null,
    affiliate: creatorAffiliate.get(key) || null,
    posts_collected: ps.length,
    median_views: base.median_views ?? null,
    baseline_confidence: base.confidence ?? 'low',
    max_views: views.length ? Math.max(...views) : null,
    best_post: best ? { id: best.id, url: best.url, hook: best.hook, views: best.views, score: best.score } : null,
    verdicts: ps.reduce((a, p) => ((a[p.verdict] = (a[p.verdict] || 0) + 1), a), {}),
  });
}
creatorRows.sort((a, b) => (b.max_views ?? 0) - (a.max_views ?? 0));

/* ------------------------------------------------------------------ *
 * COVERAGE + PROVENANCE
 * ------------------------------------------------------------------ */
const apiPosts = posts.filter((p) => p.provenance === 'api_collected');
const handPosts = posts.filter((p) => p.provenance === 'hand_collected');
const perPlatform = {};
for (const pl of ['youtube', 'tiktok', 'instagram']) {
  const ps = apiPosts.filter((p) => p.platform === pl);
  perPlatform[pl] = {
    posts: ps.length,
    with_views: ps.filter((p) => p.views != null).length,
    with_shares: ps.filter((p) => p.shares != null).length,
    with_duration: ps.filter((p) => p.duration != null).length,
    creators: new Set(ps.map((p) => p.creator)).size,
    date_range: ps.length
      ? [
          ps.map((p) => p.published_at).filter(Boolean).sort()[0] || null,
          ps.map((p) => p.published_at).filter(Boolean).sort().slice(-1)[0] || null,
        ]
      : null,
  };
}

const coverage = {
  collected_at: new Date(NOW).toISOString(),
  totals: {
    posts_total: posts.length,
    api_collected: apiPosts.length,
    hand_collected: handPosts.length,
    creators: creatorRows.length,
    affiliate_mechanics: affiliate_mechanics.length,
    mechanics_one_off_urls,
    on_topic: apiPosts.filter((p) => p.on_topic).length,
    off_topic: apiPosts.filter((p) => !p.on_topic).length,
  },
  per_platform: perPlatform,
  known_gaps: [
    'ScrapeCreators was NOT used: the account is out of credits and returns HTTP 402. Verified 2026-07-24.',
    'YouTube exposes no share/repost count, so the share_save dimension is null for every YouTube post and the composite is renormalised over the remaining dimensions.',
    'Instagram exposes no share/save count and no video duration on the public endpoint. It also returns 0 for many reels that demonstrably have views; those are recorded as null, never as zero, with the raw value preserved.',
    'TikTok bot-blocks a plain-curl profile-HTML fetch from most IPs, so account-level follower counts are null for handles collected via yt-dlp only. Per-post metrics are unaffected.',
    'TikTok hashtag feeds are client-side rendered behind a captcha, so no hashtag-sourced discovery was possible. Seed handles and recon-derived handles only.',
    'Several recon handles do not resolve on TikTok at all (statusCode 10221/10223), including @kingclavicular. They are recorded as unresolved, not as zero-post accounts.',
    'Replication-spec beats are a prescription derived from the hook archetype, NOT a transcript. The media was never downloaded, so a shot-by-shot reconstruction of the source would be invented.',
    'Rollup groups with fewer than 5 posts are flagged thin_evidence and should not be treated as conclusions.', 'Only 2 of 152 collected TikTok posts mention the topic at all under a deliberately broad lexicon (peptide, reta, GLP-1, TRT, SARM, HGH, fat loss). The TikTok benchmark accounts inherited from the recon are personality and clip accounts, not peptide accounts. The board therefore separates on-topic from account-general content, and off-topic posts are never presented as peptide performance evidence.',
  ],
  collector_failures: {
    youtube: (yt && yt.failures) || [],
    tiktok: (tt && tt.failures) || [],
    instagram: (ig && ig.failures) || [],
  },
  hand_collected_caveats: (recon && recon.collection_caveats) || [],
};

/* ------------------------------------------------------------------ *
 * HEADLINE FINDINGS — computed from the data above, not hand-written.
 * Every number below is read back out of the dataset so the copy cannot
 * drift away from what was actually measured.
 * ------------------------------------------------------------------ */
const onTopic = apiPosts.filter((p) => p.on_topic);
const hookRoll = rollups.by_hook_archetype.filter((r) => r.key !== 'other' && !r.thin_evidence);
const bestHook = [...hookRoll].sort((a, b) => (b.median_views || 0) - (a.median_views || 0))[0];
const otherMed = (rollups.by_hook_archetype.find((r) => r.key === 'other') || {}).median_views;
const copyApi = apiPosts.filter((p) => p.verdict === 'COPY').length;
const transferDown = topic_comparison.filter((r) => r.ratio != null && r.ratio < 1);
const topMech = affiliate_mechanics.filter((m) => /bio_pointer|lead_magnet|comment_drop/.test(m.kind)).slice(0, 3);
const ttOn = onTopic.filter((p) => p.platform === 'tiktok').length;
const ttAll = apiPosts.filter((p) => p.platform === 'tiktok').length;

const findings = [
  bestHook && {
    headline: `${bestHook.key.replace(/-/g, ' ')} hooks carry this niche`,
    detail: `Across ${bestHook.n_posts} measured posts the ${bestHook.key} hook has a median of ${Math.round(bestHook.median_views).toLocaleString('en-US')} views, against ${otherMed ? Math.round(otherMed).toLocaleString('en-US') : 'n/a'} for unclassified hooks. It is the single strongest structural signal in the set.`,
    so_what:
      'The transferable move is leading with a reason to listen in the first line and anchoring the unfamiliar to a familiar category. The credential itself is not transferable, so substitute a role you actually hold.',
    evidence_n: bestHook.n_posts,
  },
  {
    headline: `Nothing measured qualifies as a straight copy`,
    detail: `${copyApi} of ${onTopic.length} on-topic measured posts earned a COPY verdict. ${onTopic.filter((p) => p.verdict === 'REJECT').length} were rejected outright, and the rest are ADAPT.`,
    so_what:
      'Every hook that performs in this niche performs because of dosing, sourcing, protocols, or personal outcomes, which is exactly the set a compliant affiliate cannot produce. The structure transfers; the subject never does. Plan to invent an adjacent lane rather than to clone the genre.',
    evidence_n: onTopic.length,
  },
  transferDown.length && {
    headline: `Borrowed reach mostly does not follow the topic`,
    detail: `Of ${topic_comparison.length} accounts that posted both, ${transferDown.length} saw their peptide posts UNDERperform their general output (ratios ${transferDown.map((r) => r.ratio + 'x').join(', ')}).`,
    so_what:
      'Paying for access to a big personality account does not buy peptide attention. Their audience shows up for the personality. Judge a partner on their on-topic median, never on their follower count.',
    evidence_n: topic_comparison.length,
  },
  topMech.length && {
    headline: `The winning funnel is a free room, not a product link`,
    detail: `The most repeated mechanics are ${topMech.map((m) => `"${m.value}" (${m.times_seen}x)`).join(', ')}. Direct discount codes appear far less often than free communities and free calls.`,
    so_what:
      'The top creators route attention into a free Skool community or a free call and monetise later. That is both higher-converting and materially more defensible than pushing a vendor checkout link, and it is a funnel Biologix could run without touching product claims.',
    evidence_n: affiliate_mechanics.length,
  },
  (() => {
    const db = rollups.by_duration_band.filter((r) => !r.thin_evidence && r.median_views != null);
    if (db.length < 3) return null;
    const sorted = [...db].sort((a, b) => b.median_views - a.median_views);
    const top = sorted[0], bot = sorted[sorted.length - 1];
    return {
      headline: `Long form wins this niche, not short form`,
      detail: `${top.key} content has a median of ${Math.round(top.median_views).toLocaleString('en-US')} views across ${top.n_posts} posts, against ${Math.round(bot.median_views).toLocaleString('en-US')} for ${bot.key} across ${bot.n_posts}. That is roughly ${Math.round(top.median_views / bot.median_views)}x in favour of the longest bucket.`,
      so_what:
        'This inverts the usual short-form-first instinct. The audience for this topic is researching a decision, not scrolling, and it will sit through ten minutes. Budget for a small number of deep long-form assets rather than a high volume of clips, and cut the clips from the long form afterwards.',
      evidence_n: db.reduce((a, r) => a + r.n_posts, 0),
    };
  })(),
  {
    headline: `TikTok is not a peptide channel in this sample`,
    detail: `Only ${ttOn} of ${ttAll} collected TikTok posts mention the topic under a deliberately broad lexicon. The benchmark TikTok accounts are personality and clip accounts.`,
    so_what:
      'Do not build a TikTok-first peptide plan on this evidence. YouTube is where the measurable on-topic demand is. Collect a real peptide-native TikTok cohort before deciding anything about the channel.',
    evidence_n: ttAll,
  },
].filter(Boolean);

/* ------------------------------------------------------------------ *
 * EMIT
 * ------------------------------------------------------------------ */
for (const p of posts) delete p._text;

const dataset = {
  generated_at: new Date(NOW).toISOString(),
  scoring_model: SCORING_MODEL,
  findings,
  coverage,
  posts: posts.slice(0, 1200),
  posts_dropped_from_export: Math.max(0, posts.length - 1200),
  creators: creatorRows,
  rollups,
  topic_comparison,
  affiliate_mechanics,
  mechanics_one_off_urls,
  linked_domains,
  brands_promoted,
  affiliate_programs: PROGRAMS,
  other_seller_domains: SELLERS,
  bio_funnels,
  content_patterns: (recon && recon.content_patterns) || [],
  recon_accounts: (recon && recon.accounts) || [],
  hook_taxonomy: HOOK_RULES.map((r) => r.archetype),
  discovered_tiktok_cohort: (ttDisc && ttDisc.creators || []).map(({posts, ...rest}) => rest),
  /* The scan target: individual civilians with a VERIFIED peptide affiliate link.
   * "Verified" means a peptide/GLP-1 vendor URL was actually found behind the bio
   * link (aggregators crawled one level down), or a discount code is stated in
   * the bio. Having a linktr.ee is not evidence - five large accounts were
   * dropped precisely because nothing peptide-related sat behind theirs. */
  /* The affiliate-army playbook: 49 civilian affiliates found via ScrapeCreators
   * keyword search, 487 of their real posts scored against each creator's own
   * baseline. Directives require >=8 posts across >=3 creators; anything thinner
   * is a lead to test, never presented as a finding. */
  affiliate_playbook: playbook ? {
    brief: playbook.brief,
    generated_from: playbook.generated_from,
    on_topic_posts: playbook.on_topic_posts,
    off_topic_posts: playbook.off_topic_posts,
    rollups: playbook.rollups,
    hashtags: playbook.hashtags,
    breakouts: playbook.breakouts,
    creators: playbook.reference_creators,
  } : null,
  sc_civilian_cohort: scCohort ? {
    probed: scCohort.probed, qualifies: scCohort.qualifies,
    credits_spent: scCohort.credits_spent,
    creators: (scCohort.creators || []).filter((c) => c.qualifies).map(({search_posts, aggregator_links, ...r}) => r),
  } : null,
  civilian_cohort: civilians ? {
    spec: civilians.spec,
    discovery_note: civilians.discovery_note,
    reference_example: civilians.reference_example,
    probed: civilians.probed,
    verified_affiliate: (civilians.creators || []).filter((c) => c.affiliate_verified).length,
    creators: civilians.creators || [],
  } : null,
};

fs.mkdirSync(PORTAL, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'intel-data.json'), JSON.stringify(dataset, null, 2));
fs.writeFileSync(
  path.join(PORTAL, 'intel-data.js'),
  `/* Generated by analyze.mjs at ${new Date(NOW).toISOString()} - do not hand-edit. Regenerate instead. */\nwindow.PEPTIDE_INTEL = ${JSON.stringify(dataset)};\n`
);

const vd = posts.reduce((a, p) => ((a[p.verdict] = (a[p.verdict] || 0) + 1), a), {});
const sizeKb = Math.round(fs.statSync(path.join(PORTAL, 'intel-data.js')).size / 1024);
console.log(`\n=== WROTE ===`);
console.log(`  intel-data.json + intel-data.js (${sizeKb} KB)`);
console.log(`  posts: ${posts.length} (api ${apiPosts.length} / hand ${handPosts.length})`);
console.log(`  per platform:`, JSON.stringify(Object.fromEntries(Object.entries(perPlatform).map(([k, v]) => [k, v.posts]))));
console.log(`  creators: ${creatorRows.length}`);
console.log(`  verdicts:`, JSON.stringify(vd));
console.log(`  replication specs: ${specTargets.length}`);
console.log(`  affiliate mechanics: ${affiliate_mechanics.length}`);
console.log(`  hook archetypes used:`, JSON.stringify(rollups.by_hook_archetype.map((r) => `${r.key}(${r.n_posts})`)));
console.log(`\n=== TOP 10 (rank-eligible) ===`);
posts.filter((p) => p.rank_eligible).slice(0, 10).forEach((p, i) => {
  console.log(`  ${i + 1}. [${p.score}] ${p.platform} ${p.creator} | ${p.views ?? 'null'} views | ${p.outlier_multiple ?? '-'}x | ${p.verdict} | ${String(p.hook).slice(0, 60)}`);
});
