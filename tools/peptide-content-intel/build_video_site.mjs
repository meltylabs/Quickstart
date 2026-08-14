#!/usr/bin/env node
/* build_video_site.mjs — emits biologix-strategy-board/content-intel/videos-data.js
 *
 * Reads (read-only, no network, no paid API):
 *   raw/merged-layers.json     487 videos x {caption, speech, on-screen} layers
 *   raw/outliers.json          per-video outlier + replication_difficulty + compliance
 *   raw/sc-civilian-cohort.json 49 qualified civilian creators (bio, vendor, code)
 *   raw/cohort-lanes.json      research_peptide / telehealth / unclear creator split
 *
 * Writes window.PEPTIDE_VIDEOS.
 *
 * THE ONE METHOD DECISION THAT MATTERS
 * ------------------------------------
 * outliers.json `outlier` = plays / that creator's median plays across ALL of
 * their collected videos. The collection is a hard cap of ~10 per creator made
 * of a cluster of last-week posts plus 2-3 much older posts that were almost
 * certainly picked because they performed. So the historical tail is a
 * survivorship-selected greatest-hits set and every old video scores as a
 * monster. Ranking formats off that column invents viral patterns.
 *
 * This script therefore ALSO computes out30: plays divided by the same
 * creator's median plays inside the <=30-day census window only, and only when
 * that creator has at least MIN_BASELINE_N posts in the window. Everything the
 * page ranks on defaults to out30. The raw outlier is still carried and shown,
 * flagged, because suppressing it would just make people go back to the file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const OUT = path.resolve(HERE, '../../biologix-strategy-board/content-intel/videos-data.js');

const TRANSCRIPT_MAX = 1200;
const ONSCREEN_MAX = 800;
const CENSUS_DAYS = 30;      // age window the age-controlled baseline is built from
const MIN_BASELINE_N = 4;    // posts a creator needs inside the window for out30
const MATURE_DAYS = 2;       // plays under 2 days old have not matured
const BAR_VIDEOS = 8;        // evidence bar
const BAR_CREATORS = 3;

const log = [];
const note = (m) => { log.push(m); console.log(m); };

const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));

/* ------------------------------------------------------------------ math -- */
const median = (a) => {
  const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const uniq = (a) => Array.from(new Set(a));

/* TikTok video ids carry the creation unix second in the top 32 bits. Verified
   against sc-civilian-cohort search_posts.created (7603344544276466958 ->
   1770291604 vs recorded 1770291622, an 18-second delta). Neither
   merged-layers.json nor outliers.json carries a date field, so this is the
   only source of post age. */
const idTimestamp = (id) => {
  try { return Number(BigInt(String(id)) >> 32n); } catch { return null; }
};

/* ------------------------------------------------------------- OCR noise -- */
/* On-screen text arrives as ' | '-joined OCR segments. Animated, mirrored or
   partially-drawn text yields garbage ("З'ЯЗИЗТЯА", "чон2", "**HO | voY").
   Marked, never dropped silently, and never counted as content. */
const NON_LATIN = /[Ͱ-ӿ԰-ۿऀ-ॿ一-鿿]/;
const noisySegment = (seg, seen) => {
  const t = seg.trim();
  if (!t) return 'empty';
  if (NON_LATIN.test(t)) return 'non-latin glyphs';
  const letters = t.replace(/[^a-z]/gi, '');
  if (letters.length >= 3 && !/[aeiouy]/i.test(letters)) return 'no vowels';
  const alnum = t.replace(/[^a-z0-9]/gi, '').length;
  if (t.length >= 4 && alnum / t.length < 0.5) return 'mostly symbols';
  const key = t.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.length >= 4 && seen.has(key)) return 'repeat of an earlier frame';
  if (key.length >= 4) seen.add(key);
  return null;
};

const splitOnscreen = (raw) => {
  const seen = new Set();
  return String(raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => {
      const why = noisySegment(t, seen);
      return why ? { t, noise: why } : { t };
    });
};

/* --------------------------------------------------------------- loaders -- */
const merged = read('merged-layers.json');
const videosIn = Array.isArray(merged) ? merged : merged.data;
const outliersDoc = read('outliers.json');
const cohortDoc = read('sc-civilian-cohort.json');
const lanesDoc = read('cohort-lanes.json');

note(`read merged-layers.json: ${videosIn.length} videos (header claims ${merged.videos ?? 'n/a'})`);
note(`read outliers.json: ${outliersDoc.videos.length} scored videos, generated ${outliersDoc.generated_at}`);

const oById = new Map(outliersDoc.videos.map((v) => [String(v.id), v]));
const missingScore = videosIn.filter((v) => !oById.has(String(v.id)));
if (missingScore.length) note(`WARN dropped ${missingScore.length} videos with no row in outliers.json: ${missingScore.map((v) => v.id).join(', ')}`);

const cohortByHandle = new Map(cohortDoc.creators.filter((c) => c.qualifies).map((c) => [c.handle, c]));
note(`read sc-civilian-cohort.json: ${cohortDoc.creators.length} probed, ${cohortByHandle.size} qualify`);

const laneByHandle = new Map();
const laneRowByHandle = new Map();
for (const key of Object.keys(lanesDoc)) {
  const lane = key === 'research_peptide_lane' ? 'research_peptide'
    : key === 'telehealth_lane' ? 'telehealth' : 'unclear';
  for (const row of lanesDoc[key]) { laneByHandle.set(row.h, lane); laneRowByHandle.set(row.h, row); }
}
note(`read cohort-lanes.json: ${laneByHandle.size} creators mapped to a lane`);

const NOW = Math.floor(Date.now() / 1000);

/* --------------------------------------------------------------- shaping -- */
let trimmedTranscripts = 0, trimmedOnscreen = 0, noAge = 0;
let charsDroppedT = 0, charsDroppedO = 0;

const videos = videosIn.filter((v) => oById.has(String(v.id))).map((v) => {
  const o = oById.get(String(v.id));
  const ts = idTimestamp(v.id);
  if (ts == null) noAge += 1;
  const ageDays = ts == null ? null : (NOW - ts) / 86400;

  const fullT = String(v.transcript || '');
  const fullO = String(v.onscreen || '');
  let tr = fullT;
  if (tr.length > TRANSCRIPT_MAX) { tr = tr.slice(0, TRANSCRIPT_MAX); trimmedTranscripts += 1; charsDroppedT += fullT.length - TRANSCRIPT_MAX; }
  let osRaw = fullO;
  if (osRaw.length > ONSCREEN_MAX) { osRaw = osRaw.slice(0, ONSCREEN_MAX); trimmedOnscreen += 1; charsDroppedO += fullO.length - ONSCREEN_MAX; }

  const segs = splitOnscreen(osRaw);
  const laneOfCreator = laneByHandle.get(v.handle) || null;

  return {
    id: String(v.id),
    h: v.handle,
    f: v.followers == null ? null : v.followers,
    url: v.url || null,
    cap: v.caption || '',
    cap_chars: String(v.caption || '').length,
    tags: Array.isArray(v.hashtags) ? v.hashtags : [],
    plays: v.plays == null ? null : v.plays,
    likes: v.likes == null ? null : v.likes,
    comments: v.comments == null ? null : v.comments,
    shares: v.shares == null ? null : v.shares,
    dur: v.duration_sec == null ? null : v.duration_sec,
    ts,
    age: r1(ageDays),
    /* full-precision age drives every window/maturity decision; `age` is the
       rounded display value only, so the page's counts reproduce exactly when
       someone recomputes them from the raw files with the stated rule. */
    age_exact: ageDays,
    lane: v.lane,
    creator_lane: laneOfCreator,
    prof: o.layer_profile,
    lay: { c: !!v.layers.caption, s: !!v.layers.speech, o: !!v.layers.onscreen },
    reta: { c: !!v.reta_in.caption, s: !!v.reta_in.speech, o: !!v.reta_in.onscreen },
    sig: {
      reta: !!v.signals.reta, pep: !!v.signals.peptide,
      dose: !!v.signals.dosing, out: !!v.signals.outcome
    },
    on_topic: !!v.on_topic,
    tr,
    tr_chars: fullT.length,
    tr_trimmed: fullT.length > TRANSCRIPT_MAX,
    os: segs,
    os_chars: fullO.length,
    os_trimmed: fullO.length > ONSCREEN_MAX,
    os_noise_ratio: o.ocr_noise_ratio == null ? null : r2(o.ocr_noise_ratio),
    diff: o.replication_difficulty,
    diff_reasons: (o.replication_difficulty_reasons || []).map((r) => ({ f: r.factor, d: r.direction, w: r.weight, why: r.why })),
    out: o.outlier == null ? null : r2(o.outlier),
    base_all: o.creator_median_plays == null ? null : o.creator_median_plays,
    base_all_n: o.baseline_n == null ? null : o.baseline_n,
    er: o.engagement_rate == null ? null : o.engagement_rate,
    sr: o.share_rate == null ? null : o.share_rate,
    comp: !!o.compliance_blocked,
    flags: o.compliance_flags || [],
    flags_cap: o.compliance_flags_caption_only || [],
    gap: !!o.data_gap_suspected,
    primary_source: o.primary_text_source || null
  };
});

note(`trimmed ${trimmedTranscripts} transcripts over ${TRANSCRIPT_MAX} chars (${charsDroppedT} chars past the cap, full length kept in tr_chars)`);
note(`trimmed ${trimmedOnscreen} on-screen strings over ${ONSCREEN_MAX} chars (${charsDroppedO} chars past the cap, full length kept in os_chars)`);
if (noAge) note(`WARN ${noAge} videos had an unparseable id and carry no age`);

/* ------------------------------------------------------- age-controlled -- */
const inWindow = (v) => v.age_exact != null && v.age_exact <= CENSUS_DAYS;
const byCreatorWindow = new Map();
for (const v of videos) {
  if (!inWindow(v)) continue;
  if (!byCreatorWindow.has(v.h)) byCreatorWindow.set(v.h, []);
  byCreatorWindow.get(v.h).push(v);
}
const baseline30 = new Map();
for (const [h, rows] of byCreatorWindow) {
  baseline30.set(h, { n: rows.length, med: median(rows.map((r) => r.plays)) });
}
let noBaseline = 0;
for (const v of videos) {
  const b = baseline30.get(v.h);
  v.base30_n = b ? b.n : 0;
  v.base30 = b ? b.med : null;
  const usable = b && b.n >= MIN_BASELINE_N && b.med > 0 && v.plays != null && inWindow(v);
  v.out30 = usable ? r2(v.plays / b.med) : null;
  v.cw = inWindow(v);
  v.mature = v.age_exact != null && v.age_exact >= MATURE_DAYS;
  if (!usable) noBaseline += 1;
}
const scored30 = videos.filter((v) => v.out30 != null);
const ranked = videos.filter((v) => v.out30 != null && v.mature);
note(`census window <=${CENSUS_DAYS}d: ${videos.filter(inWindow).length} videos across ${byCreatorWindow.size} creators`);
note(`out30 defined for ${scored30.length} videos (creator needs >=${MIN_BASELINE_N} posts in window); ${noBaseline} videos have no age-matched baseline and render as "no age-matched baseline"`);
note(`ranking set (out30 defined AND age>=${MATURE_DAYS}d): ${ranked.length} videos across ${uniq(ranked.map((v) => v.h)).length} creators`);

/* ------------------------------------------------------------- rollups --- */
const groupStats = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const ks = keyFn(r);
    for (const k of (Array.isArray(ks) ? ks : [ks])) {
      if (k == null) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
  }
  return Array.from(m.entries()).map(([k, g]) => {
    const creators = uniq(g.map((r) => r.h));
    const hits = g.filter((r) => r.out30 != null && r.out30 >= 2).length;
    return {
      key: String(k),
      n: g.length,
      creators: creators.length,
      med_out30: r2(median(g.map((r) => r.out30))),
      med_out_raw: r2(median(g.map((r) => r.out))),
      med_plays: median(g.map((r) => r.plays)),
      med_er: r2(median(g.map((r) => r.er))),
      hit_rate: g.length ? r1((hits / g.length) * 100) : null,
      bar: g.length >= BAR_VIDEOS && creators.length >= BAR_CREATORS,
      best: (() => {
        const b = g.filter((r) => r.out30 != null).sort((a, c) => c.out30 - a.out30)[0] || null;
        return b ? { id: b.id, h: b.h, out30: b.out30, plays: b.plays } : null;
      })()
    };
  }).sort((a, b) => b.n - a.n);
};

const AGE_BUCKETS = [[0, 7], [7, 30], [30, 90], [90, 365], [365, Infinity]];
const ageTable = AGE_BUCKETS.map(([lo, hi]) => {
  const g = videos.filter((v) => v.age_exact != null && v.age_exact >= lo && v.age_exact < hi);
  return {
    key: hi === Infinity ? '365d+' : `${lo}–${hi}d`,
    n: g.length,
    creators: uniq(g.map((v) => v.h)).length,
    med_out_raw: r2(median(g.map((v) => v.out))),
    med_plays: median(g.map((v) => v.plays))
  };
});

const OUT30_BUCKETS = [[0, 2], [2, 5], [5, 10], [10, 20], [20, 30]];
const out30Table = OUT30_BUCKETS.map(([lo, hi]) => {
  const g = scored30.filter((v) => v.age_exact >= lo && v.age_exact < hi);
  return {
    key: `${lo}–${hi}d`,
    n: g.length,
    creators: uniq(g.map((v) => v.h)).length,
    med_out30: r2(median(g.map((v) => v.out30))),
    med_plays: median(g.map((v) => v.plays))
  };
});

const rollups = {
  difficulty: {
    label: 'Replication difficulty',
    note: 'Additive rubric from outliers.json (base 2, clamped 1-5). Inferred from duration, transcript length and on-screen density; the videos were never watched.',
    rows: groupStats(ranked, (v) => `d${v.diff}`).sort((a, b) => a.key.localeCompare(b.key))
  },
  lane: {
    label: 'Lane',
    note: 'Lane governs benchmarking. A telehealth number is never a research-peptide benchmark.',
    rows: groupStats(ranked, (v) => v.lane)
  },
  layer_profile: {
    label: 'Layer profile',
    note: 'Which layers carried content. caption_only means speech and on-screen were both empty.',
    rows: groupStats(ranked, (v) => v.prof)
  },
  compliance: {
    label: 'Compliance',
    note: 'blocked = the video’s own mechanism (speech or on-screen) carries dosing, sourcing, outcome, stacking or efficacy-magnitude content a Biologix affiliate cannot produce.',
    rows: groupStats(ranked, (v) => (v.comp ? 'blocked' : 'clear'))
  },
  factor: {
    label: 'Difficulty factor',
    note: 'A video can carry several factors, so these buckets overlap and do not sum to the census.',
    rows: groupStats(ranked, (v) => v.diff_reasons.map((r) => r.f))
  },
  signal: {
    label: 'Signal',
    note: 'Keyword signals detected across all three layers combined.',
    rows: groupStats(ranked, (v) => {
      const out = [];
      if (v.sig.reta) out.push('retatrutide');
      if (v.sig.pep) out.push('peptide');
      if (v.sig.dose) out.push('dosing');
      if (v.sig.out) out.push('outcome claim');
      if (!out.length) out.push('none of the four');
      return out;
    })
  }
};

/* research-peptide-lane-only difficulty table, because the pooled one is the banned move */
const rollupResearchDifficulty = groupStats(
  ranked.filter((v) => v.lane === 'research_peptide'),
  (v) => `d${v.diff}`
).sort((a, b) => a.key.localeCompare(b.key));

/* ---------------------------------------------------------- coded terms -- */
/* TikTok returns zero search results for the compound names, so the cohort
   substitutes coded vocabulary. Counted over caption + speech + on-screen. */
const CODED = [
  { term: 'ratatouille', means: 'retatrutide', re: /ratatouille/i },
  { term: 'r3t4 / reta / retaa', means: 'retatrutide', re: /\br3t4\b|\bretaa?\b|\breta\b/i },
  { term: 'reda', means: 'retatrutide', re: /\breda\b/i },
  { term: 'peppers / pepperz / peps', means: 'peptides', re: /\bpepperz?\b|\bpeppers\b|\bpeps\b/i },
  { term: 'pins', means: 'injections', re: /\bpins?\b/i },
  { term: 'd0se', means: 'dose', re: /d0se/i },
  { term: 'b|o', means: 'bio', re: /b\|o/i },
  { term: 'GLP-ONE / GLP one', means: 'GLP-1', re: /glp[\s-]?one/i },
  { term: 'tirz / trize', means: 'tirzepatide', re: /\btirz\b|\btrize\b/i },
  { term: 'sema', means: 'semaglutide', re: /\bsema\b/i }
];
const allTextOf = (v) => [v.cap, v.tags.join(' '), v.tr, v.os.filter((s) => !s.noise).map((s) => s.t).join(' ')].join(' ');
const codedRows = CODED.map((c) => {
  const g = videos.filter((v) => c.re.test(allTextOf(v)));
  const creators = uniq(g.map((v) => v.h));
  const g30 = g.filter((v) => v.out30 != null && v.mature);
  return {
    term: c.term, means: c.means,
    n: g.length, creators: creators.length,
    med_out30: r2(median(g30.map((v) => v.out30))),
    ranked_n: g30.length,
    bar: g.length >= BAR_VIDEOS && creators.length >= BAR_CREATORS
  };
}).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
note(`coded vocabulary: ${codedRows.length} of ${CODED.length} terms appear at least once`);

/* ----------------------------------------------------------- reta table -- */
const retaVideos = videos.filter((v) => v.sig.reta);
const retaLayerTable = [
  { key: 'caption', n: videos.filter((v) => v.reta.c).length },
  { key: 'speech', n: videos.filter((v) => v.reta.s).length },
  { key: 'on-screen', n: videos.filter((v) => v.reta.o).length },
  { key: 'any layer', n: retaVideos.length }
].map((r) => ({
  ...r,
  creators: uniq(videos.filter((v) => (
    r.key === 'caption' ? v.reta.c : r.key === 'speech' ? v.reta.s : r.key === 'on-screen' ? v.reta.o : v.sig.reta
  )).map((v) => v.h)).length
}));

const freshLane = (lane, retaFlag) => {
  const g = videos.filter((v) => v.lane === lane && v.age_exact != null && v.age_exact < 7 && v.sig.reta === retaFlag);
  return { n: g.length, creators: uniq(g.map((v) => v.h)).length, med_plays: median(g.map((v) => v.plays)) };
};

/* --------------------------------------------------------------- totals -- */
const totals = {
  videos: videos.length,
  creators: uniq(videos.map((v) => v.h)).length,
  lanes: ['research_peptide', 'telehealth', 'unclear'].map((l) => ({
    key: l, n: videos.filter((v) => v.lane === l).length,
    creators: uniq(videos.filter((v) => v.lane === l).map((v) => v.h)).length,
    max_plays: Math.max(...videos.filter((v) => v.lane === l).map((v) => v.plays || 0)),
    med_plays: median(videos.filter((v) => v.lane === l).map((v) => v.plays))
  })),
  layers: {
    caption: videos.filter((v) => v.lay.c).length,
    speech: videos.filter((v) => v.lay.s).length,
    onscreen: videos.filter((v) => v.lay.o).length,
    any: videos.filter((v) => v.lay.c || v.lay.s || v.lay.o).length,
    none: videos.filter((v) => !v.lay.c && !v.lay.s && !v.lay.o).length
  },
  reta: { caption: videos.filter((v) => v.reta.c).length, any: retaVideos.length, creators: uniq(retaVideos.map((v) => v.h)).length },
  census_window: videos.filter(inWindow).length,
  ranked: ranked.length,
  ranked_creators: uniq(ranked.map((v) => v.h)).length,
  null_duration: videos.filter((v) => v.dur == null).length,
  ocr_noise_videos: videos.filter((v) => v.os.some((s) => s.noise)).length,
  compliance_blocked: videos.filter((v) => v.comp).length,
  data_gap: videos.filter((v) => v.gap).length,
  median_age: r1(median(videos.map((v) => v.age_exact))),
  under_7d: videos.filter((v) => v.age_exact != null && v.age_exact < 7).length
};

/* ------------------------------------------------------------- creators -- */
const creators = uniq(videos.map((v) => v.h)).map((h) => {
  const g = videos.filter((v) => v.h === h);
  const c = cohortByHandle.get(h) || null;
  const laneRow = laneRowByHandle.get(h) || null;
  const g30 = g.filter((v) => v.out30 != null && v.mature);
  return {
    h,
    f: g[0].f,
    lane: laneByHandle.get(h) || null,
    n: g.length,
    n30: baseline30.has(h) ? baseline30.get(h).n : 0,
    base30: baseline30.has(h) ? baseline30.get(h).med : null,
    base_all: g[0].base_all,
    med_plays: median(g.map((v) => v.plays)),
    max_plays: Math.max(...g.map((v) => v.plays || 0)),
    med_diff: median(g.map((v) => v.diff)),
    blocked: g.filter((v) => v.comp).length,
    reta: g.filter((v) => v.sig.reta).length,
    best30: g30.sort((a, b) => b.out30 - a.out30)[0]?.id || null,
    bio: c ? String(c.bio || '').replace(/\s+/g, ' ').trim() : null,
    nickname: c ? c.nickname : null,
    bio_link: c ? c.bio_link : null,
    vendor_links: c ? (c.peptide_vendor_links || []) : [],
    code: c ? c.code_in_bio : null,
    civilian_voice: c ? !!c.civilian_voice : null,
    url: c ? c.url : `https://www.tiktok.com/@${h}`,
    lane_vendor: laneRow ? laneRow.vendor : null
  };
}).sort((a, b) => b.n - a.n || a.h.localeCompare(b.h));

/* --------------------------------------------------------------- copy ---- */
/* Findings are authored text that passed adversarial verification. The numbers
   inside `recomputed` are re-derived from the files on every build, so drift
   between the authored prose and the current data is visible rather than
   hidden. */
const findings = [
  {
    id: 'method-correction',
    rank: 1,
    lens: 'Easiest-to-replicate content that still gets traction — replication difficulty 1-2 crossed against outlier, with the outlier metric rebuilt because the shipped one is confounded by scrape design.',
    headline: 'The outlier column in outliers.json cannot rank formats. It ranks post age.',
    claim: 'METHOD CORRECTION FIRST — the `outlier` field in outliers.json cannot be used to rank formats. The scrape pulled ~7-8 recent posts plus 2-3 historical top posts per creator, so the historical tail is a survivorship-selected greatest-hits set and every old video looks like a monster outlier. Any format read off the raw field will invent viral patterns that do not exist. I rebuilt an age-controlled metric (out30 = plays / creator median within the <=30-day census window) and re-ran everything on it.',
    verdict: 'CONFIRMED',
    n_videos: 487,
    n_creators: 49,
    evidence: 'Age distribution is bimodal: a cluster of last-week posts, a gap, then a historical tail. Per-creator age sequences confirm it (maicyrobison: 2,3,4,6,9,10,13 days then 462,503,531; tawnieannie: 1,2,3,3,4,4,4 then 365,405,489). After rebuilding, out30 is flat across the window.',
    so_what: 'Do not brief affiliates off the raw outlier column, and do not let anyone quote "this format does 45x" from the historical tail. Benchmark new posts against the creator’s own last-30-day median only.',
    examples: [
      'https://www.tiktok.com/@maicyrobison/video/7479996269893635370',
      'https://www.tiktok.com/@fitjourneyem/video/7603344544276466958'
    ],
    tables: ['age', 'out30']
  },
  {
    id: 'reta-ceiling',
    rank: 2,
    lens: 'The videos with signals.reta true — which layer carries the retatrutide reference, what the videos are about, how they perform against the same creators’ non-reta output, and the realistic play ceiling for reta content in the research-peptide lane.',
    headline: 'Every play number here is contaminated by post age plus a capped, bimodal sample.',
    claim: 'Every performance number in this dataset is contaminated by post age plus a bimodal sampling design, and the outlier metric in outliers.json is structurally inflated as a result. The collection is capped at 10 videos per creator and those 10 are a cluster of last-week posts plus 2-3 much older posts that were almost certainly picked because they performed. So "outlier" is partly measuring "this is why the creator got scraped."',
    verdict: 'CONFIRMED',
    n_videos: 487,
    n_creators: 49,
    evidence: 'A hard cap of 10 videos per creator. Most creators’ samples span far more than 30 days. chrisriosss’s apparent "reta underperforms his baseline by 100x" is entirely this artifact — his non-reta videos are 91-105 days old and his reta videos are all 2-4 days old.',
    so_what: 'Do not brief an affiliate against any absolute play number in this dataset, and do not use outliers.json outlier scores as a ranking of what to copy. The only defensible benchmark for a new post is the age-matched one. Set week-one expectation at roughly 1k plays, not 100k.',
    examples: [
      'https://www.tiktok.com/@chrisriosss/video/7627332204338646302',
      'https://www.tiktok.com/@chrisriosss/video/7665207377867689247',
      'https://www.tiktok.com/@kplockedin/video/7647331347098291486',
      'https://www.tiktok.com/@caylapepz/video/7627252350331211039'
    ],
    tables: ['reta']
  }
];

const leads = [
  {
    id: 'cheap-content',
    headline: 'Difficulty-1 posts are not penalised relative to a creator’s other posts.',
    original_claim: 'Cheap content is not penalized — it is modestly rewarded. Difficulty-1 posts beat the SAME creator’s difficulty 2-5 posts. Direct answer to "is the easy stuff working": yes, and going harder does not buy reach.',
    status: 'REFUTED as stated — survives only as a lead',
    why_refuted: [
      'The stated n does not reproduce. No configuration of window, minimum posts per arm, lane subset or metric yields "63 d1 vs 60 d2-5 = 123 videos across 18 creators."',
      'The full-census result is not significant. Within-creator paired d1 vs d2-5, min 2 per arm: 37 creators, 367 videos, d1 wins in 22 of 37, median ratio 1.17, two-sided sign test p=0.32. Only the 30-day + min-3 slice reaches p=0.008.',
      'The d1-2 vs d3-5 leg reproduces nowhere and flips sign. On the full census, d1-2 wins in only 12 of 26 creators, median ratio 0.72 — the harder arm wins.',
      'The difficulty table was truncated at d4, hiding the contradicting bucket. d5 is the single best-performing bucket in the file and clears the evidence bar.',
      'Lane violation. Paired d1 vs d2-5: research_peptide 4 of 10 creators, median ratio 0.73. The pooled "cheap wins" signal is carried entirely by telehealth and unclear.',
      'Causal language on observational, proxy-coded data. replication_difficulty is an additive rubric inferred from duration and text density; the videos were never watched.',
      'Examples were cherry-picked and one is a lane violation. caylapepz is a loser in the very test being illustrated; kplockedin’s 2.02M-play post is above the research-lane ceiling.'
    ],
    fair_to_the_claim: 'Single-creator dominance is NOT the failure mode. Leave-one-creator-out on the full-census median ratio ranges only 1.169-1.184, and trimming the two most extreme creators from each tail leaves 1.172 with 20 of 33 wins. The median statistic is robust; it is simply small, non-significant, absent in the governing lane, and reported with numbers that are not in the file.',
    survives_as: 'Difficulty-1 posts are not penalised relative to a creator’s other posts. Full census, 367 videos, 37 creators, median within-creator ratio 1.17, p=0.32. Directionally neutral-to-slightly-positive. Test it; do not brief it.',
    tables: ['difficulty', 'difficulty_research']
  }
];

/* live recomputation of the numbers those two findings lean on */
const recomputed = {
  age_table: ageTable,
  out30_table: out30Table,
  reta_layers: retaLayerTable,
  reta_fresh: {
    all: (() => { const g = retaVideos.filter((v) => v.age_exact != null && v.age_exact < 7); return { n: g.length, creators: uniq(g.map((v) => v.h)).length, med_plays: median(g.map((v) => v.plays)), max_plays: g.length ? Math.max(...g.map((v) => v.plays || 0)) : null }; })(),
    research_reta: freshLane('research_peptide', true),
    research_non_reta: freshLane('research_peptide', false)
  },
  reta_big: retaVideos.filter((v) => (v.plays || 0) > 20000)
    .sort((a, b) => b.plays - a.plays)
    .map((v) => ({ id: v.id, h: v.h, plays: v.plays, age: v.age, lane: v.lane })),
  per_creator_cap: (() => {
    const m = new Map();
    for (const v of videos) m.set(v.h, (m.get(v.h) || 0) + 1);
    const d = new Map();
    for (const n of m.values()) d.set(n, (d.get(n) || 0) + 1);
    return Array.from(d.entries()).sort((a, b) => b[0] - a[0]).map(([n, c]) => ({ videos_per_creator: n, creators: c }));
  })(),
  age_sequences: ['maicyrobison', 'tawnieannie', 'caylapepz', 'chrisriosss'].map((h) => ({
    h, ages: videos.filter((v) => v.h === h).map((v) => v.age).sort((a, b) => a - b)
  })).filter((r) => r.ages.length)
};

/* --------------------------------------------------------------- output -- */
const payload = {
  generated_at: new Date().toISOString(),
  source: {
    merged: 'raw/merged-layers.json',
    outliers: 'raw/outliers.json',
    cohort: 'raw/sc-civilian-cohort.json',
    lanes: 'raw/cohort-lanes.json',
    outliers_generated_at: outliersDoc.generated_at
  },
  census: {
    now: new Date(NOW * 1000).toISOString(),
    window_days: CENSUS_DAYS,
    min_baseline_n: MIN_BASELINE_N,
    mature_days: MATURE_DAYS,
    bar_videos: BAR_VIDEOS,
    bar_creators: BAR_CREATORS,
    transcript_max: TRANSCRIPT_MAX,
    onscreen_max: ONSCREEN_MAX
  },
  method_notes: outliersDoc.method_notes,
  build_log: log,
  totals,
  findings,
  leads,
  recomputed,
  rollups,
  rollup_research_difficulty: rollupResearchDifficulty,
  coded_terms: codedRows,
  creators,
  videos
};

const js = '/* generated by .context/peptide-content-intel/build_video_site.mjs — do not edit by hand */\n' +
  'window.PEPTIDE_VIDEOS = ' + JSON.stringify(payload) + ';\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, js);
const kb = Math.round(Buffer.byteLength(js) / 1024);
note(`wrote ${OUT} (${kb} KB, budget 4096 KB)`);
if (kb > 4096) { console.error('OVER BUDGET'); process.exit(1); }
