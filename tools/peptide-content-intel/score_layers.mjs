#!/usr/bin/env node
/* score_layers.mjs
 * ---------------------------------------------------------------------------
 * Scoring layer for the peptide content-intel research phase.
 *
 * INPUT  : raw/merged-layers.json   (487 videos, 49 civilian TikTok creators,
 *          caption + speech transcript + on-screen OCR already merged)
 * OUTPUT : raw/outliers.json        (one record per video + summary stats)
 *
 * Reads only. Calls nothing. No network, no paid API.
 *
 * WHAT THIS FILE DECIDES, AND WHY (read before trusting a number):
 *
 * 1. OUTLIER is per-creator, never cross-creator. A 51k-play video on a 1.5k
 *    follower account and a 51k-play video on a 60k account are not the same
 *    event. Baseline = median plays of THAT creator's collected videos.
 *
 * 2. LANE is carried through untouched. Every multi-million-play post in this
 *    corpus is telehealth (licensed compounded GLP-1). The research-peptide
 *    lane - the one Biologix competes in - tops out far lower. Summary stats
 *    are therefore reported lane-split as well as pooled, and no pooled number
 *    should be quoted as a research-peptide benchmark.
 *
 * 3. OCR IS NOISY. Animated/mirrored text and burned-in watermarks yield
 *    strings like "БВТОВТА", "HIDABRIS", "AW e". Those are dropped before the
 *    on-screen layer is measured for "richest layer", and the drop ratio is
 *    reported per video as ocr_noise_ratio. Layer booleans themselves are taken
 *    from the input file unchanged so layer coverage stays consistent with what
 *    was already reported upstream (caption 460 / speech 213 / onscreen 377).
 *
 * 4. REPLICATION DIFFICULTY is a transparent additive rubric, not a model
 *    output. Every factor that fired is recorded with its direction and weight
 *    in replication_difficulty_reasons[] so a human can overrule any single
 *    video. Honest limit: the videos themselves were never watched. "High
 *    production" and "charisma monologue" are inferred from duration, speech
 *    volume and on-screen density. Those two factors are proxies and are
 *    labelled as such in the reason strings.
 *
 * 5. COMPLIANCE distinguishes MECHANISM from MENTION. A flag counts as
 *    compliance_blocked only when it fires in what the video actually does
 *    (speech or on-screen text), or in the caption when the caption is the only
 *    layer carrying content. A vendor code sitting in a caption under an
 *    otherwise clean video is recorded separately as a caption-only mention -
 *    it does not make the creative unrepeatable, it just means the caption gets
 *    rewritten.
 * ------------------------------------------------------------------------- */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IN_FILE = path.join(HERE, 'raw', 'merged-layers.json');
const OUT_FILE = path.join(HERE, 'raw', 'outliers.json');

/* -------------------------------------------------------------------------
 * Coded community vocabulary. TikTok returns zero results for "retatrutide"
 * and "tirzepatide", so the cohort substitutes these. Verified live.
 * ---------------------------------------------------------------------- */
const RETA_RX =
  /\b(retatrutide|ratatouille|rata\s?touille|r3t4|r3ta|ret4|rta|retaa+|reda|reta|retat)\b/i;
/* "pepper" singular is deliberately absent: the coded plural is peppers/pepperz/
 * peps, and the singular is usually literal black pepper in a recipe video. */
const PEPTIDE_RX =
  /\b(peptide?s?|pept1de|p3pt!de|pepperz|peppers|peps|tirzepatide|tirz|trz|trize|tesa|tessa|matzi|semaglutide|sema|glp[\s-]?1|glp1|glp[\s-]?one|mounjaro|zepbound|ozempic|wegovy|bpc[\s-]?157|tb[\s-]?500|ipamorelin|cjc[\s-]?1295|tesamorelin|mots[\s-]?c|sermorelin|cagrilintide|cagri|survodutide|mazdutide|aod[\s-]?9604|nad\+?|ghk[\s-]?cu|kpv|glutathione)\b/i;

/* Distinct substance names, used to tell a real peptide stack ("NAD+ plus
 * MOTS-C") from a lifestyle combo ("glp-1 & strength training combo"). */
const SUBSTANCE_RXS = [
  /\b(retatrutide|ratatouille|r3t4|r3ta|retaa+|reta|reda)\b/i,
  /\b(tirzepatide|tirz|trize|zepbound|mounjaro)\b/i,
  /\b(semaglutide|sema|ozempic|wegovy)\b/i,
  /\b(bpc[\s-]?157)\b/i,
  /\b(tb[\s-]?500)\b/i,
  /\b(ipamorelin|cjc[\s-]?1295|sermorelin|tesamorelin|hgh)\b/i,
  /\b(mots[\s-]?c|motsc|matzi)\b/i,
  /\b(nad\+?|nicotinamide)\b/i,
  /\b(ghk[\s-]?cu|ghk)\b/i,
  /\b(cagrilintide|cagri)\b/i,
  /\b(glutathione|aod[\s-]?9604|survodutide|mazdutide|epitalon|selank|semax|snap[\s-]?8)\b/i,
  /\b(glp[\s-]?1|glp1|glp[\s-]?one)\b/i,
];
const countSubstances = (t) => SUBSTANCE_RXS.filter((rx) => rx.test(t)).length;

/* The coded plural "peppers" collides with actual peppers. A grocery haul
 * saying "bell peppers" is not peptide content. */
const FOOD_PEPPER_RX =
  /\b(?:bell|red|green|yellow|orange|chili|chilli|black|hot|jalapeno|banana|mini|sweet|stuffed|roasted|salt\s?(?:and|&)?)\s+peppers?\b/gi;

/* dose numerals. mg / mcg / iu / units are dose units. ml and cc are also
 * container sizes ("30ml serum"), so they only count next to injection
 * language. */
const DOSE_NUM_RX = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|ug|µg|iu|units?)\b/i;
const DOSE_VOL_RX = /\b\d+(?:[.,]\d+)?\s?(?:ml|cc)\b/i;
const DOSE_WORD_RX =
  /\b(?:d0se|dose|doses|dosing|dosage|titrat(?:e|ed|ing|ion)|reconstitut(?:e|ed|ing|ion)|bac\s?water|bacteriostatic|syringe|insulin\s?needle|draw\s?up|pin(?:ning|s|ned)?|inject(?:ion|ions|ing|ed)?|shot\s?day|jab)\b/i;
const DOSE_INSTRUCT_RX =
  /\b(?:start(?:ing)?\s(?:at|with|on)|ramp\s?up|titrat\w*|how\s?much\s?(?:to|do|should|you)|per\s?week|weekly\s?(?:dose|d0se|amount)|every\s?\d+\s?days?|split\s?(?:the\s?)?dose|protocol|cycle\s?length|run\s?it\s?for|once\s?a\s?week|twice\s?a\s?week)\b/i;

/* sourcing / vendor */
const URL_RX =
  /\bhttps?:\/\/[^\s)\]"']+|\b[a-z0-9][a-z0-9-]{1,60}\.(?:co\.uk|com\.au|co\.nz|com|io|net|org|shop|store|app|nl|is|de|eu|us|to|ai|xyz|co)\b/i;
/* a code token must actually look like a code: colon-delimited, or shouty /
 * digit-bearing, or explicitly offered ("use my code X"). "promotes",
 * "code words" and "code that" are not codes. */
const CODE_RX =
  /\b(?:discount|promo|coupon)?\s?\bcode\b\s*[:=]\s*\S{3,20}|\b(?:use|with|my|our|enter)\s(?:my\s|our\s|the\s)?(?:discount\s|promo\s|coupon\s)?code\b|\bcode\s+(?:[A-Z0-9][A-Z0-9_-]{2,18})\b|\b(?:promo|coupon|discount)\s?code\b/;
const VENDOR_RX =
  /\b(?:vendor|vendors|supplier|suppliers|sourcing|(?:my|a|the|legit|trusted|best|good|reliable|favorite)\s(?:source|plug|guy)\b|source[sd]?\s(?:from|for|it|them)|where\s?(?:i|to)\s?(?:get|buy|order|source)|who\s?i\s?(?:order|buy|get)\s?(?:from|it)|link\s?in\s?(?:b\|?o|bio)|linkinbio|my\s?link|affiliate|sponsor(?:ed|ship)|partner(?:ed)?\s?with|order(?:ed|ing)?\s?from|restock|package\s?from|third[\s-]?party\s?test(?:ed|ing)|certificate\s?of\s?analysis|purity\s?report)\b/i;

/* personal outcome. Alternatives carry their own boundaries; a trailing \b on
 * the whole group would silently kill the "SW:" / "CW:" forms. */
const OUTCOME_RX = new RegExp(
  [
    /i\s?(?:lost|dropped|shed)\b/.source,
    /i(?:'|’)?ve\s?lost\b/.source,
    /i\s?(?:am|'m|’m)\s?down\b/.source,
    /(?:down|lost)\s?\d+\s?(?:lbs?|pounds?|kg)\b/.source,
    /\d+\s?(?:lbs?|pounds?|kg)\s?(?:down|lost|gone)\b/.source,
    /my\s?results?\b/.source,
    /worked\s?for\s?me\b/.source,
    /my\s?(?:progress|transformation|journey\s?so\s?far)\b/.source,
    /(?:starting|highest|lowest|goal)\s?weight\b/.source,
    /\b(?:sw|cw|gw)\s?[:=]\s?\d/.source,
    /size\s?\d+\s?to\s?(?:a\s?)?size\s?\d+/.source,
    /my\s?(?:body\s?fat|dexa)\b/.source,
  ].join('|'),
  'i'
);
const BEFORE_AFTER_RX = new RegExp(
  [
    /before\s?(?:and|&|\/|vs\.?)\s?after\b/.source,
    /b\/a\s?pics?\b/.source,
    /progress\s?(?:pic|photo)s?\b/.source,
    /transformation\b/.source,
    /body\s?check\b/.source,
    /(?:down|lost)\s?\d+\s?(?:lbs?|pounds?|kg)\b/.source,
    /\d+\s?(?:lbs?|pounds?)\s?down\b/.source,
    /(?:starting|highest|lowest)\s?weight\b/.source,
    /loose\s?skin\b/.source,
    /my\s?(?:stomach|waist|abs|arms|before)\b/.source,
  ].join('|'),
  'i'
);

/* timeline the creator already owns */
const TIMELINE_RX =
  /\b(week\s?\d+|month\s?\d+|day\s?\d+|\d+\s?(?:weeks?|months?)\s?(?:in|on|update|later|of)|\d+\s?month\s?update|my\s?journey|journey\s?so\s?far|been\s?on\s?(?:it|reta|reda|r3t4)\s?for|since\s?(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

/* stacking. "stack" is explicit on its own; "blend/combo/combine/pair" only
 * counts when two distinct substances are actually named nearby, otherwise
 * "the glp-1 & strength training combo" and a chicken recipe both trip it. */
const STACK_EXPLICIT_RX = /\b(?:stack|stacks|stacked|stacking)\b|\bon\s?top\s?of\s?(?:my|the)\s?(?:reta|reda|peptide|glp)/i;
const STACK_LOOSE_RX = /\b(?:blend|blends|combo|combos|combine[sd]?|pair(?:ed|ing)?\s?with|alongside|together\s?with|plus)\b/i;

/* efficacy magnitude. "60% off" is a discount and "results are not guaranteed"
 * is a disclaimer - neither is a claim, so both are excluded. */
const EFFICACY_RX =
  /\b(?:\d{1,3}(?:\.\d)?\s?%\s?(?:more|faster|better|stronger|greater|weight|fat|body\s?fat|appetite)|works?\s?(?:way\s)?better\s?than|more\s?effective\s?than|stronger\s?than|\d+x\s?(?:more|better|stronger)|melts?\s?fat|burns?\s?fat\s?fast|\d+\s?(?:lbs?|pounds?|kg)\s?in\s?\d+\s?(?:days?|weeks?|months?)|lost\s?\d+\s?(?:lbs?|pounds?|kg)\s?in\b)/i;

/* replication-lowering shapes. A bare "?" anywhere is too loose - a question
 * only lowers difficulty when asking IS the device. */
const AUDIENCE_Q_RX =
  /\b(?:who\s?else|am\s?i\s?the\s?only|anyone\s?else|what\s?(?:do|would)\s?(?:you|y'?all)|would\s?you\b|do\s?you\s?(?:guys\s?)?(?:think|know|want|agree)|drop\s?(?:a|your)\s?(?:comment|answer)|comment\s?(?:below|if|your|yes)|tell\s?me\b|thoughts\?)/i;
const LIST_RX =
  /(?:•|●|·|▪|✅|✔|☑|→|➡|\d\.\s|\b(?:tip|reason|thing|mistake|step|way)s?\s?\d\b|\b(?:\d|two|three|four|five|top\s?\d)\s(?:tips?|reasons?|things?|mistakes?|steps?|ways?|signs?|rules?)\b)/i;
const DOC_RX =
  /\b(coa\b|certificate\s?of\s?analysis|lab\s?(?:report|result)s?|hplc|purity|screenshot|reddit|comment\s?(?:said|says)|study|studies|pubmed|clinical\s?trial|research\s?paper|chart|graph|receipt|invoice|label)\b/i;

/* ------------------------------------------------------------------ utils */
const median = (nums) => {
  const a = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const round = (n, p = 2) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(p)));

/* ------------------------------------------------------- topicality gate
 * A compliance rule fires only when the trigger belongs to peptide/GLP content.
 * Without this, an apparel discount code, a chicken-recipe "combo" and a
 * hair-product "my results" all read as peptide violations - all three were
 * real false positives in the first pass of this script.
 *
 * Two confidence tiers, both recorded:
 *   proximate     - a peptide mention sits within 300 chars of the trigger, or
 *                   the layer is short enough to be one context.
 *   video_topical - the trigger is elsewhere in the video but the post is
 *                   peptide content by caption, hashtags, speech or on-screen.
 * The weaker tier is needed because ASR mangles the coded vocabulary: whole
 * retatrutide transcripts come back as "Rta", "tears up", "turshit" or never
 * name the drug at all while the caption says #ratatouille.
 */
const PROX = 300;
const SHORT_LAYER = 400;
/* topicality is judged on text with culinary peppers removed */
const topicalSurface = (t) => String(t || '').replace(FOOD_PEPPER_RX, ' ');
const isTopical = (t) => {
  const s = topicalSurface(t);
  return PEPTIDE_RX.test(s) || RETA_RX.test(s);
};

function contextHit(text, rx, videoTopical) {
  const t = String(text || '');
  if (!t || !rx.test(t)) return null;
  const topicalLayer = isTopical(t);
  if (topicalLayer) {
    if (t.length <= SHORT_LAYER) return 'proximate';
    const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    for (const m of t.matchAll(g)) {
      const win = t.slice(Math.max(0, m.index - PROX), m.index + m[0].length + PROX);
      if (isTopical(win)) return 'proximate';
    }
  }
  return videoTopical ? 'video_topical' : null;
}

/* ------------------------------------------------------- OCR noise filter
 * Segments arrive " | " separated. A segment survives if it is plausibly
 * readable English. Everything else is watermark bleed or mirrored/animated
 * text that OCR hallucinated into letters.
 * This is deliberately conservative: it only drops what it is fairly sure of.
 */
const COMMON_WORDS = new Set(
  ('the a an and or but if then than that this these those i you he she it we they me my your his her our their is are was were be been being am do does did doing have has had having will would can could should may might must not no yes on in at to for of with from by as so up down out off over under about into more most less least all any some each every other another new old first last next best worse worst good bad big small long short high low fast slow easy hard real true false why what when where who how which here there now today tomorrow yesterday week weeks month months day days year years time times hour minute never always still just only even also because while after before during since until again back way get got go going gone come came take took make made see saw look looked feel felt know knew think thought want wanted need needed try tried keep kept start started stop stopped use used work worked worked help helped love hate like likes drop dropped save saved share shared follow following comment comments post posted video videos people person girl girls guy guys mom dad body weight fat muscle food eat eating ate drink water sleep energy gym workout training cardio protein calories diet hungry hunger craving cravings appetite results result progress journey update dose doses week1 lbs pounds size skin face hair mood anxiety depression brain focus doctor md nurse pharmacy clinic vendor peptide peptides reta retaa research educational disclaimer medical advice legal purposes only not for human consumption warning caution note important watch watching read reading truth honest honestly real talk pov storytime day1 side effects nausea fatigue headache injection shot pin pins vial vials bottle powder mix mixing lab tested testing purity coa batch order ordered shipping shipped arrived package box link bio code discount off sale price cost cheap expensive money spent worth buy bought sell selling'
  ).split(/\s+/)
);

function segmentIsLegible(seg) {
  const s = seg.trim();
  if (s.length < 3) return false;
  // non-latin script (Cyrillic/Greek) => OCR hallucination on this corpus
  if (/[Ͱ-ϿЀ-ӿԀ-ԯ]/.test(s)) return false;
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const nonAscii = (s.match(/[^\x20-\x7E]/g) || []).length;
  if (nonAscii / s.length > 0.25) return false;
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  const vr = vowels / letters.length;
  const tokens = s.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const longTokens = tokens.filter((t) => t.length >= 3);
  if (!longTokens.length) return false;
  const knownHit = longTokens.some((t) => COMMON_WORDS.has(t));
  if (knownHit) return true;
  // no dictionary anchor: demand normal vowel structure AND more than one word,
  // which is what kills "HIDABRIS", "VECOSSEMENX", "RVCA", "AW e".
  if (longTokens.length >= 2 && vr >= 0.2 && vr <= 0.6) return true;
  return false;
}

function cleanOnscreen(raw) {
  const text = String(raw || '');
  if (!text.trim()) return { clean: '', kept: 0, dropped: 0, noiseRatio: 0 };
  const segs = text.split('|').map((s) => s.trim()).filter(Boolean);
  const keep = [];
  const seen = new Set();
  let dropped = 0;
  for (const seg of segs) {
    if (!segmentIsLegible(seg)) {
      dropped++;
      continue;
    }
    const k = seg.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(k)) continue; // OCR repeats the same on-screen line frame after frame
    seen.add(k);
    keep.push(seg);
  }
  return {
    clean: keep.join(' | '),
    kept: keep.length,
    dropped,
    noiseRatio: segs.length ? round(dropped / segs.length, 2) : 0,
  };
}

/* ------------------------------------------------------------- load input */
const rawFile = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
const videos = Array.isArray(rawFile) ? rawFile : rawFile.data;
if (!Array.isArray(videos)) throw new Error('merged-layers.json: no video array found');

/* ------------------------------------------- per-creator play baselines */
const byHandle = new Map();
for (const v of videos) {
  if (!byHandle.has(v.handle)) byHandle.set(v.handle, []);
  byHandle.get(v.handle).push(v);
}
const baseline = new Map();
for (const [handle, vids] of byHandle) {
  const plays = vids.map((v) => v.plays).filter((p) => typeof p === 'number' && Number.isFinite(p));
  baseline.set(handle, { median: median(plays), n: plays.length });
}

/* -------------------------------------------------------- per-video score */
const records = videos.map((v) => {
  const caption = String(v.caption || '');
  const transcript = String(v.transcript || '');
  const onscreenRaw = String(v.onscreen || '');
  const oc = cleanOnscreen(onscreenRaw);

  /* --- layer profile. Layer booleans come from the input unchanged. ------ */
  const L = v.layers || {};
  const hasCaption = !!L.caption;
  const hasSpeech = !!L.speech;
  const hasOnscreen = !!L.onscreen;
  let layer_profile;
  if (hasSpeech && hasOnscreen) layer_profile = 'speech_and_onscreen';
  else if (hasSpeech) layer_profile = 'speech_led';
  else if (hasOnscreen) layer_profile = 'onscreen_led';
  else if (hasCaption) layer_profile = 'caption_only';
  else layer_profile = 'silent_and_blank';

  /* --- richest layer. On-screen is measured AFTER noise removal so a
   *     watermark-stuffed OCR string cannot outrank a real transcript. ---- */
  const candidates = [
    { source: 'transcript', text: transcript, len: transcript.trim().length },
    { source: 'onscreen', text: oc.clean, len: oc.clean.trim().length },
    { source: 'caption', text: caption, len: caption.trim().length },
  ].sort((a, b) => b.len - a.len);
  const winner = candidates[0].len > 0 ? candidates[0] : { source: 'none', text: '', len: 0 };

  /* --- outlier -------------------------------------------------------- */
  const base = baseline.get(v.handle);
  const plays = typeof v.plays === 'number' ? v.plays : null;
  const outlier =
    plays != null && base.median != null && base.median > 0 ? round(plays / base.median, 2) : null;

  const eng =
    plays && plays > 0
      ? round((((v.likes || 0) + (v.comments || 0) + (v.shares || 0)) / plays) * 100, 2)
      : null;
  const shareRate = plays && plays > 0 ? round(((v.shares || 0) / plays) * 100, 2) : null;

  /* --- text surfaces for rule firing ---------------------------------- */
  const mechanismText = [transcript, oc.clean].join(' \n ').trim(); // what the video DOES
  const captionText = caption;
  const anyText = [captionText, mechanismText].join(' \n ');
  const dur = typeof v.duration_sec === 'number' ? v.duration_sec : null;
  const trChars = transcript.trim().length;
  const osChars = oc.clean.trim().length;

  /* --- compliance ------------------------------------------------------
   * mechanism = fires in speech/on-screen, or in caption when the caption is
   * the only layer with content. Caption-only mentions are recorded apart.
   */
  const captionIsOnlyLayer = layer_profile === 'caption_only' || layer_profile === 'silent_and_blank';
  const peptideContext = isTopical(anyText) || isTopical((v.hashtags || []).join(' '));
  const strip = (t) => String(t || '').replace(/\d{1,2}\s?%\s?off/gi, ' '); // discounts are not claims

  const best = (a, b) => (a === 'proximate' || b === 'proximate' ? 'proximate' : a || b || null);
  const rules = [
    {
      flag: 'dosing_instruction',
      test: (t) =>
        contextHit(t, DOSE_NUM_RX, peptideContext) ||
        (DOSE_WORD_RX.test(t) ? contextHit(t, DOSE_VOL_RX, peptideContext) : null) ||
        (DOSE_INSTRUCT_RX.test(t) ? contextHit(t, DOSE_WORD_RX, peptideContext) : null),
    },
    {
      flag: 'sourcing',
      test: (t) =>
        best(
          best(contextHit(t, VENDOR_RX, peptideContext), contextHit(t, CODE_RX, peptideContext)),
          contextHit(t, URL_RX, peptideContext)
        ),
    },
    { flag: 'personal_outcome_claim', test: (t) => contextHit(t, OUTCOME_RX, peptideContext) },
    {
      flag: 'stacking',
      test: (t) =>
        best(
          contextHit(t, STACK_EXPLICIT_RX, peptideContext),
          countSubstances(t) >= 2 ? contextHit(t, STACK_LOOSE_RX, peptideContext) : null
        ),
    },
    { flag: 'efficacy_magnitude', test: (t) => contextHit(strip(t), EFFICACY_RX, peptideContext) },
  ];

  const compliance_flags = [];
  const compliance_flag_sources = {};
  const compliance_flag_confidence = {};
  const compliance_flags_caption_only = [];
  for (const r of rules) {
    const mech = r.test(mechanismText);
    const cap = r.test(captionText);
    if (!mech && !cap) continue;
    const src = [];
    if (mech) {
      if (r.test(transcript)) src.push('speech');
      if (r.test(oc.clean)) src.push('onscreen');
      if (!src.length) src.push('mechanism');
    }
    if (cap) src.push('caption');
    compliance_flag_sources[r.flag] = src;
    compliance_flag_confidence[r.flag] = best(mech, cap);
    if (mech || (cap && captionIsOnlyLayer)) compliance_flags.push(r.flag);
    else compliance_flags_caption_only.push(r.flag);
  }
  const compliance_blocked = compliance_flags.length > 0;

  /* --- replication difficulty ------------------------------------------
   * Additive rubric, base 2, clamped 1-5. Every fired factor is recorded.
   */
  const reasons = [];
  let score = 2;
  const up = (w, key, why) => {
    score += w;
    reasons.push({ factor: key, direction: 'up', weight: w, why });
  };
  const down = (w, key, why) => {
    score -= w;
    reasons.push({ factor: key, direction: 'down', weight: -w, why });
  };

  const inVideo = (rx) =>
    rx.test(mechanismText) || (captionIsOnlyLayer && rx.test(captionText));

  if (inVideo(BEFORE_AFTER_RX))
    up(2, 'personal_before_after_body', 'leans on the creator’s own body / transformation footage');
  if (inVideo(TIMELINE_RX))
    up(1, 'existing_personal_timeline', 'depends on a week/month count the creator already banked');
  if (
    contextHit(mechanismText, DOSE_NUM_RX, peptideContext) ||
    (DOSE_WORD_RX.test(mechanismText) && contextHit(mechanismText, DOSE_VOL_RX, peptideContext)) ||
    (contextHit(mechanismText, DOSE_WORD_RX, peptideContext) &&
      (DOSE_INSTRUCT_RX.test(mechanismText) || /reconstitut|bac\s?water|syringe|draw\s?up/i.test(mechanismText)))
  )
    up(2, 'dosing_or_reconstitution_demo', 'shows or states dose / reconstitution mechanics');
  if (
    contextHit(anyText, VENDOR_RX, peptideContext) ||
    contextHit(anyText, CODE_RX, peptideContext) ||
    contextHit(anyText, URL_RX, peptideContext)
  )
    up(1, 'vendor_relationship', 'requires a vendor, code, haul or sourcing relationship');
  if (hasSpeech && ((trChars >= 900 && osChars < 400) || trChars >= 1500))
    up(1, 'charisma_monologue_proxy', `sustained talking-head delivery (proxy: transcript ${trChars} chars, on-screen ${osChars} chars, duration ${dur ?? 'n/a'}s)`);
  if ((dur != null && dur >= 180) || (dur != null && dur >= 90 && trChars >= 800 && osChars >= 300))
    up(1, 'long_edited_format_proxy', `long edited runtime (proxy: duration ${dur}s)`);

  if (!hasSpeech && hasOnscreen && dur != null && dur <= 15)
    down(1, 'static_text_over_broll', `short silent clip carried by on-screen text (${dur}s)`);
  if (inVideo(LIST_RX))
    down(1, 'bulleted_list', 'list / numbered format, reproducible with a text overlay');
  if (
    AUDIENCE_Q_RX.test(mechanismText) ||
    (mechanismText.length > 0 && mechanismText.length <= 200 && mechanismText.includes('?')) ||
    (captionIsOnlyLayer && (AUDIENCE_Q_RX.test(captionText) || captionText.includes('?')))
  )
    down(1, 'question_to_audience', 'asking the audience is the device, no assets required');
  if (DOC_RX.test(mechanismText))
    down(1, 'document_or_screenshot', 'built around a document, COA, screenshot or comment on screen');
  if (hasSpeech && !hasOnscreen && dur != null && dur <= 45 && trChars < 600)
    down(1, 'voiceover_short_proxy', `short voiceover-length clip (proxy: ${dur}s, ${trChars} transcript chars)`);

  let replication_difficulty = Math.max(1, Math.min(5, score));
  if (compliance_blocked) {
    const hardBlock =
      compliance_flags.includes('dosing_instruction') || compliance_flags.includes('sourcing');
    const floor = hardBlock ? 5 : 4;
    if (replication_difficulty < floor) {
      reasons.push({
        factor: hardBlock ? 'compliance_hard_block' : 'compliance_block',
        direction: 'up',
        weight: floor - replication_difficulty,
        why: `mechanism needs ${compliance_flags.join(' + ')}, which a Biologix affiliate cannot say`,
      });
      replication_difficulty = floor;
    }
  }

  return {
    id: v.id,
    handle: v.handle,
    url: v.url,
    plays,
    followers: v.followers ?? null,
    lane: v.lane,
    duration_sec: dur,

    creator_median_plays: base.median,
    outlier,
    baseline_n: base.n,
    baseline_reliable: base.n >= 5,

    likes: v.likes ?? null,
    comments: v.comments ?? null,
    shares: v.shares ?? null,
    engagement_rate: eng,
    share_rate: shareRate,

    layer_profile,
    layers: { caption: hasCaption, speech: hasSpeech, onscreen: hasOnscreen },
    ocr_noise_ratio: oc.noiseRatio,
    onscreen_segments_kept: oc.kept,
    onscreen_segments_dropped: oc.dropped,
    peptide_topical: peptideContext,
    /* zero text in all three layers is far more likely to be a collection gap
     * than a genuinely wordless post; these carry play counts but no lesson. */
    data_gap_suspected: layer_profile === 'silent_and_blank',

    primary_text: winner.text,
    primary_text_source: winner.source,
    primary_text_chars: winner.len,

    replication_difficulty,
    replication_difficulty_raw: score,
    replication_difficulty_reasons: reasons,

    compliance_blocked,
    compliance_flags,
    compliance_flags_caption_only,
    compliance_flag_sources,
    compliance_flag_confidence,
  };
});

/* ------------------------------------------------------------- summaries */
const distinctCreators = (rows) => new Set(rows.map((r) => r.handle)).size;
const outliersOf = (rows) => rows.map((r) => r.outlier).filter((n) => n != null);

function bucketStats(rows) {
  return {
    n: rows.length,
    creators: distinctCreators(rows),
    median_outlier: round(median(outliersOf(rows)), 2),
    median_plays: round(median(rows.map((r) => r.plays)), 0),
    median_engagement_rate: round(median(rows.map((r) => r.engagement_rate).filter((x) => x != null)), 2),
    clears_evidence_bar: rows.length >= 8 && distinctCreators(rows) >= 3,
  };
}
const groupBy = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

const LANES = ['research_peptide', 'telehealth', 'unclear'];
const PROFILES = ['caption_only', 'speech_led', 'onscreen_led', 'speech_and_onscreen', 'silent_and_blank'];

const by_layer_profile = {};
for (const p of PROFILES) {
  const rows = records.filter((r) => r.layer_profile === p);
  by_layer_profile[p] = {
    ...bucketStats(rows),
    by_lane: Object.fromEntries(
      LANES.map((l) => [l, bucketStats(rows.filter((r) => r.lane === l))])
    ),
  };
}

const by_replication_difficulty = {};
for (let d = 1; d <= 5; d++) {
  const rows = records.filter((r) => r.replication_difficulty === d);
  by_replication_difficulty[d] = {
    ...bucketStats(rows),
    by_lane: Object.fromEntries(
      LANES.map((l) => [l, bucketStats(rows.filter((r) => r.lane === l))])
    ),
  };
}

const by_compliance = {
  blocked: bucketStats(records.filter((r) => r.compliance_blocked)),
  clear: bucketStats(records.filter((r) => !r.compliance_blocked)),
};
by_compliance.blocked.by_lane = Object.fromEntries(
  LANES.map((l) => [l, bucketStats(records.filter((r) => r.compliance_blocked && r.lane === l))])
);
by_compliance.clear.by_lane = Object.fromEntries(
  LANES.map((l) => [l, bucketStats(records.filter((r) => !r.compliance_blocked && r.lane === l))])
);

const flagCounts = {};
for (const r of records) {
  for (const f of r.compliance_flags) flagCounts[f] = (flagCounts[f] || 0) + 1;
}
const flagCreators = {};
for (const f of Object.keys(flagCounts)) {
  flagCreators[f] = distinctCreators(records.filter((r) => r.compliance_flags.includes(f)));
}
const factorCounts = {};
for (const r of records) {
  for (const reason of r.replication_difficulty_reasons) {
    factorCounts[reason.factor] = (factorCounts[reason.factor] || 0) + 1;
  }
}

const by_lane = Object.fromEntries(
  LANES.map((l) => {
    const rows = records.filter((r) => r.lane === l);
    return [
      l,
      {
        ...bucketStats(rows),
        max_plays: rows.length ? Math.max(...rows.map((r) => r.plays ?? 0)) : null,
        median_followers: round(median(rows.map((r) => r.followers)), 0),
        median_replication_difficulty: round(median(rows.map((r) => r.replication_difficulty)), 1),
        pct_compliance_blocked: rows.length
          ? round((rows.filter((r) => r.compliance_blocked).length / rows.length) * 100, 1)
          : null,
      },
    ];
  })
);

const out = {
  generated_at: new Date().toISOString(),
  source: 'raw/merged-layers.json',
  script: 'score_layers.mjs',
  method_notes: [
    'outlier = plays / median plays of that creator’s own collected videos; never cross-creator.',
    'baseline_reliable requires >=5 of that creator’s videos to carry a play count.',
    'layer booleans are taken from merged-layers.json unchanged so coverage stays consistent upstream.',
    'primary_text picks the longest layer AFTER OCR-noise segments are dropped from the on-screen layer.',
    'replication_difficulty is an additive rubric (base 2, clamp 1-5), not a model judgement; the videos were never watched, so charisma_monologue_proxy and long_edited_format_proxy are inferred from duration / transcript length / on-screen density.',
    'compliance_blocked fires only on the video’s mechanism (speech or on-screen), or on caption when caption is the only layer with content. Caption-only mentions are listed separately in compliance_flags_caption_only.',
    'evidence bar: a bucket only clears when n>=8 videos across >=3 creators (clears_evidence_bar).',
    'lane governs benchmarking. Never quote a telehealth or pooled number as a research-peptide benchmark.',
  ],
  summary: {
    videos: records.length,
    creators: distinctCreators(records),
    lanes: Object.fromEntries(LANES.map((l) => [l, records.filter((r) => r.lane === l).length])),
    baseline_reliable: records.filter((r) => r.baseline_reliable).length,
    by_lane,
    count_by_layer_profile: Object.fromEntries(PROFILES.map((p) => [p, by_layer_profile[p].n])),
    count_by_replication_difficulty: Object.fromEntries(
      [1, 2, 3, 4, 5].map((d) => [d, by_replication_difficulty[d].n])
    ),
    median_outlier_by_layer_profile: Object.fromEntries(
      PROFILES.map((p) => [p, by_layer_profile[p].median_outlier])
    ),
    median_outlier_by_compliance: {
      blocked: by_compliance.blocked.median_outlier,
      clear: by_compliance.clear.median_outlier,
    },
    compliance_blocked_count: records.filter((r) => r.compliance_blocked).length,
    compliance_flag_counts: flagCounts,
    compliance_flag_creator_counts: flagCreators,
    difficulty_factor_counts: factorCounts,
    by_layer_profile,
    by_replication_difficulty,
    by_compliance,
  },
  videos: records,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

/* ------------------------------------------------------------ console log */
const S = out.summary;
console.log(`wrote ${OUT_FILE}`);
console.log(`videos ${S.videos} | creators ${S.creators} | baseline_reliable ${S.baseline_reliable}`);
console.log('\nlanes:', JSON.stringify(S.lanes));
console.log('\ncount by layer_profile:');
for (const p of PROFILES) {
  const b = by_layer_profile[p];
  console.log(
    `  ${p.padEnd(20)} n=${String(b.n).padStart(3)} creators=${String(b.creators).padStart(2)} median_outlier=${b.median_outlier} bar=${b.clears_evidence_bar}`
  );
}
console.log('\ncount by replication_difficulty:');
for (let d = 1; d <= 5; d++) {
  const b = by_replication_difficulty[d];
  console.log(
    `  ${d}  n=${String(b.n).padStart(3)} creators=${String(b.creators).padStart(2)} median_outlier=${b.median_outlier} bar=${b.clears_evidence_bar}`
  );
}
console.log('\ncompliance:');
console.log(
  `  blocked n=${by_compliance.blocked.n} creators=${by_compliance.blocked.creators} median_outlier=${by_compliance.blocked.median_outlier}`
);
console.log(
  `  clear   n=${by_compliance.clear.n} creators=${by_compliance.clear.creators} median_outlier=${by_compliance.clear.median_outlier}`
);
console.log('  flags:', JSON.stringify(flagCounts), 'creators:', JSON.stringify(flagCreators));
console.log('\nlane detail:');
for (const l of LANES) {
  const b = by_lane[l];
  console.log(
    `  ${l.padEnd(17)} n=${String(b.n).padStart(3)} creators=${String(b.creators).padStart(2)} median_plays=${b.median_plays} max_plays=${b.max_plays} median_diff=${b.median_replication_difficulty} pct_blocked=${b.pct_compliance_blocked}`
  );
}
console.log('\ndifficulty factors fired:', JSON.stringify(factorCounts, null, 1));
