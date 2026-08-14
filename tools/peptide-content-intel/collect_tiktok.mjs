#!/usr/bin/env node
/**
 * TikTok peptide / GLP-1 / research-peptide affiliate content collector.
 *
 * HARD RULES (enforced by construction):
 *  - Every numeric metric emitted here comes verbatim from a yt-dlp JSON payload
 *    or a TikTok profile-HTML rehydration payload that is ALSO appended raw to
 *    tiktok.raw.jsonl. Nothing is estimated, rounded, or inferred.
 *  - If a fetch fails, the record is dropped and the exact stderr/status is
 *    pushed into failures[]. Missing fields stay null with a stated reason.
 *  - No ScrapeCreators. No api.scrapecreators.com. No `timeout` binary.
 *
 * Lanes:
 *   PASS A  seed handles                        -> yt-dlp flat harvest (full stats)
 *   PASS B1 hashtag/tag pages                   -> attempted, recorded (expected fail)
 *   PASS B2 handles mined from the recon doc    -> yt-dlp flat harvest
 *   PASS B3 @mentions mined from real captions  -> yt-dlp flat harvest
 *   PASS C  top-N by view_count                 -> per-video --dump-json + cross-check
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const YTDLP = '/opt/homebrew/bin/yt-dlp';
const BASE = '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const RAW_DIR = path.join(BASE, 'raw');
const OUT_JSON = path.join(RAW_DIR, 'tiktok.json');
const OUT_JSONL = path.join(RAW_DIR, 'tiktok.raw.jsonl');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const SEED_HANDLES = ['thewarenglish', 'clipgawwd7', 'kickpersonal', 'jacobnach', 'davidp_ifbbpro'];

const TAGS = [
  'retatrutide',
  'peptides',
  'peptidetok',
  'glp1',
  'tirzepatide',
  'researchpeptides',
  'peptidejourney',
  'glp1journey',
];

const RECON_DOC =
  '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/retatrutide-social-recon.md';

// Handles named in the recon doc as TikTok-active but without a scraped profile.
// These are ATTEMPTED, not assumed. Non-resolving ones land in failures[].
const RECON_NAMED_CANDIDATES = [
  'kingclavicular', // recon #1 Braden Peters "reported canonical handle"
  'mikeknowspeps', // recon: "referenced on Reddit, no reliable profile resolved"
  'josh.holyfield', // recon #8 listed as TikTok-active
  'realnicktrigili', // recon #5
  'peptidepanda', // recon #18 Project Better Man / Peptide Party funnel
  'peptidescouter', // recon #17
  'hunterwilliamscoaching', // recon #9
  'arcanepeptides', // recon #19
];

const PER_HANDLE_ITEMS = 30; // PASS A / B2 target
const MENTION_ITEMS = 15; // PASS B3 (cheaper, wider)
const MAX_MENTION_HANDLES = 18;
const DUMP_JSON_TOP_N = 90; // task floor is 80; overshoot for failure headroom

const SLEEP_YTDLP_MS = 2200;
const SLEEP_CURL_MS = 4000;

const failures = [];
const jsonlFd = fs.openSync(OUT_JSONL, 'w');

function jsonl(kind, payload) {
  fs.writeSync(jsonlFd, JSON.stringify({ _record: kind, _fetched_at: new Date().toISOString(), ...payload }) + '\n');
}

function fail(stage, target, error, extra = {}) {
  const rec = { stage, target, error: String(error).slice(0, 1200), ...extra };
  failures.push(rec);
  jsonl('failure', rec);
  console.error(`  FAIL [${stage}] ${target}: ${String(error).slice(0, 200)}`);
}

function sleepSync(ms) {
  // No `timeout` binary and no async waits: block the thread deterministically.
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function run(cmd, args, timeoutMs = 90000) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 256,
    env: { ...process.env, PATH: '/opt/homebrew/bin:' + process.env.PATH },
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    timedOut: r.error && r.error.code === 'ETIMEDOUT',
    error: r.error ? String(r.error.message) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Profile HTML  ->  real follower/heart/video counts + bio + bio link
 * ------------------------------------------------------------------ */
function fetchProfile(handle) {
  const url = `https://www.tiktok.com/@${handle}`;
  const r = run('curl', ['-sS', '-A', UA, '-w', '\\n__HTTP__%{http_code}', url], 60000);
  if (r.status !== 0) {
    fail('profile_html', handle, r.stderr || r.error || `curl exit ${r.status}`);
    return null;
  }
  const m = r.stdout.match(/\n__HTTP__(\d+)\s*$/);
  const httpCode = m ? Number(m[1]) : null;
  const html = m ? r.stdout.slice(0, m.index) : r.stdout;

  const notFound = /Couldn.{0,3}t find this account/.test(html);
  const statusCodeM = html.match(/"statusCode":(\d+)/);
  const statusCode = statusCodeM ? Number(statusCodeM[1]) : null;

  let userInfo = null;
  const scriptM = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (scriptM) {
    try {
      const scope = JSON.parse(scriptM[1])['__DEFAULT_SCOPE__'] || {};
      userInfo = scope['webapp.user-detail']?.userInfo || null;
    } catch (e) {
      /* fall through to regex below */
    }
  }

  const grab = (re) => {
    const g = html.match(re);
    return g ? g[1] : null;
  };
  const num = (re) => {
    const g = html.match(re);
    return g ? Number(g[1]) : null;
  };

  const profile = {
    handle,
    profile_url: url,
    http_status: httpCode,
    account_resolved: !notFound && (userInfo != null || html.includes(`"uniqueId":"${handle}"`)),
    tiktok_status_code: statusCode,
    nickname: userInfo?.user?.nickname ?? grab(/"nickname":"([^"]*)"/),
    bio: userInfo?.user?.signature ?? grab(/"signature":"((?:[^"\\]|\\.)*)"/),
    bio_link: userInfo?.user?.bioLink?.link ?? grab(/"bioLink":\{"link":"([^"]*)"/),
    sec_uid: userInfo?.user?.secUid ?? null,
    verified: userInfo?.user?.verified ?? null,
    follower_count: userInfo?.stats?.followerCount ?? num(/"followerCount":(\d+)/),
    following_count: userInfo?.stats?.followingCount ?? num(/"followingCount":(\d+)/),
    heart_count: userInfo?.stats?.heartCount ?? num(/"heartCount":(\d+)/),
    video_count: userInfo?.stats?.videoCount ?? num(/"videoCount":(\d+)/),
    source: 'tiktok profile HTML __UNIVERSAL_DATA_FOR_REHYDRATION__',
  };

  jsonl('profile_html', { handle, http_status: httpCode, not_found: notFound, tiktok_status_code: statusCode, parsed: profile, userInfo_present: userInfo != null });

  if (!profile.account_resolved) {
    fail(
      'profile_html',
      handle,
      `TikTok returned "Couldn't find this account" (statusCode=${statusCode}) - handle does not resolve to a public TikTok profile`,
      { http_status: httpCode }
    );
    return profile; // still returned so the caller can skip yt-dlp
  }
  return profile;
}

/* ------------------------------------------------------------------ *
 * yt-dlp flat harvest. On TikTok user pages --flat-playlist already
 * returns the full per-video stats block (verified identical to
 * --dump-json for id 7663514102358117646: 34500/110/4/4).
 * ------------------------------------------------------------------ */
function harvestHandle(handle, nItems) {
  const url = `https://www.tiktok.com/@${handle}`;
  const r = run(
    YTDLP,
    [
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--ignore-config',
      '--socket-timeout',
      '20',
      '--playlist-items',
      `1-${nItems}`,
      url,
    ],
    180000
  );
  if (r.status !== 0 || !r.stdout.trim()) {
    fail('ytdlp_user_flat', handle, r.timedOut ? 'spawnSync ETIMEDOUT (180s)' : r.stderr.trim() || r.error || `exit ${r.status}`);
    return [];
  }
  let doc;
  try {
    doc = JSON.parse(r.stdout);
  } catch (e) {
    fail('ytdlp_user_flat_parse', handle, e.message);
    return [];
  }
  const entries = (doc.entries || []).filter((e) => e && e.id);
  // Raw payload to disk, formats/thumbnails stripped (signed CDN URLs, huge, expire in hours).
  jsonl('ytdlp_user_flat', {
    handle,
    url,
    playlist_count: doc.playlist_count ?? null,
    n_entries: entries.length,
    entries: entries.map(stripHeavy),
  });
  return entries;
}

function stripHeavy(o) {
  const c = { ...o };
  delete c.formats;
  delete c.thumbnails;
  delete c.subtitles;
  delete c.automatic_captions;
  delete c.http_headers;
  delete c.cookies;
  delete c.url;
  return c;
}

function dumpVideo(webpageUrl) {
  const r = run(
    YTDLP,
    ['--dump-json', '--no-warnings', '--ignore-config', '--socket-timeout', '20', webpageUrl],
    120000
  );
  if (r.status !== 0 || !r.stdout.trim()) {
    fail('ytdlp_dump_json', webpageUrl, r.timedOut ? 'spawnSync ETIMEDOUT (120s)' : r.stderr.trim() || r.error || `exit ${r.status}`);
    return null;
  }
  try {
    const j = JSON.parse(r.stdout);
    jsonl('ytdlp_dump_json', { webpage_url: webpageUrl, video: stripHeavy(j) });
    return j;
  } catch (e) {
    fail('ytdlp_dump_json_parse', webpageUrl, e.message);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Affiliate signal extraction (mirrors the youtube lane)
 * ------------------------------------------------------------------ */
const VENDOR_DOMAIN_HINTS = [
  'peptide',
  'peptid',
  'pureus',
  'peppushers',
  'arcane',
  'reta',
  'sarms',
  'aminos',
  'research',
  'chem',
  'labs',
  'lab.',
  'bioteq',
  'polypeptide',
  'nova',
  'qingdao',
  'wuhan',
];
const LINK_SHORTENERS = ['linktr.ee', 'bit.ly', 'beacons.ai', 'stan.store', 'shor.by', 'linkin.bio', 'komi.io', 'snipfeed', 'later.com', 'tinyurl.com', 'geni.us', 'lnk.bio', 'msha.ke'];

function snippet(text, idx, len) {
  const start = Math.max(0, idx - 45);
  const end = Math.min(text.length, idx + len + 45);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

function extractSignals(caption) {
  const text = caption || '';
  const out = [];
  const push = (kind, value, idx, len) => {
    if (!value) return;
    const v = String(value).trim();
    if (out.some((s) => s.kind === kind && s.value.toLowerCase() === v.toLowerCase())) return;
    out.push({ kind, value: v, context_snippet: snippet(text, idx, len) });
  };

  // explicit URLs
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) push('url', m[0].replace(/[.,;)]+$/, ''), m.index, m[0].length);
  // bare domains e.g. thewarenglish.com/coaching
  for (const m of text.matchAll(
    /(?<![\w@/.])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|co|shop|store|app|health|life|us|to|me|ai|bio|link|xyz))(\/[^\s"'<>)\]]*)?/gi
  )) {
    const full = (m[1] + (m[2] || '')).replace(/[.,;)]+$/, '');
    if (/^https?/i.test(full)) continue;
    push('url', full, m.index, full.length);
  }
  // vendor / shortener classification over every URL-ish token found
  for (const s of [...out]) {
    if (s.kind !== 'url') continue;
    const host = s.value.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    const idx = text.toLowerCase().indexOf(host);
    if (LINK_SHORTENERS.some((d) => host.includes(d))) push('link_hub', host, idx < 0 ? 0 : idx, host.length);
    else if (VENDOR_DOMAIN_HINTS.some((d) => host.includes(d))) push('vendor_domain', host, idx < 0 ? 0 : idx, host.length);
  }
  // discount / promo codes
  for (const m of text.matchAll(
    /\b(?:use\s+)?(?:promo\s*|discount\s*|coupon\s*|affiliate\s*)?code\s*(?:is\s*|:\s*|=\s*)?["'“]?([A-Za-z0-9][A-Za-z0-9_-]{1,24})["'”]?/gi
  )) {
    const v = m[1];
    if (/^(in|is|to|for|the|below|bio|above|now|and|at|off|it)$/i.test(v)) continue;
    push('discount_code', v, m.index, m[0].length);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s*%\s*(?:off|discount)\b/gi)) push('discount_offer', m[0], m.index, m[0].length);
  // bio pointer
  for (const m of text.matchAll(/\b(?:link|links)\s*(?:is\s*)?in\s*(?:my\s*)?bio\b|\blinkinbio\b|\bcheck\s+(?:my\s+)?bio\b|\bin\s+my\s+bio\b|👇\s*(?:link|bio)/gi))
    push('bio_pointer', 'link in bio', m.index, m[0].length);
  // comment trigger — keyword only when it is a real trigger token (quoted, ALLCAPS, or after "the word")
  const TRIGGER_STOP = /^(below|if|what|your|you|and|this|that|the|more|down|here|me|us|it|for|to|on|a|an|any|which|who|when|how|why|do|does|i|my|is|are|was|so|but|of|in|with|about|his|her|they|them|then|us)$/i;
  for (const m of text.matchAll(/\bcomment\s+(the\s+word\s+)?["'“]?([A-Za-z0-9!#\-]{2,20})["'”]?/gi)) {
    const explicit = Boolean(m[1]) || /["'“]/.test(m[0]) || m[2] === m[2].toUpperCase();
    const v = explicit && !TRIGGER_STOP.test(m[2]) ? m[2] : m[0].trim();
    push('comment_trigger', v, m.index, m[0].length);
  }
  // DM trigger
  for (const m of text.matchAll(
    /\bdm\s+(?:me\s+)?(the\s+word\s+)?["'“]?([A-Za-z0-9!#\-]{2,20})["'”]?|\bdm\s+me\b|\bsend\s+me\s+a\s+dm\b|\bdms?\s+(?:are\s+)?open\b/gi
  )) {
    const kw = m[2];
    const explicit = kw && (Boolean(m[1]) || /["'“]/.test(m[0]) || kw === kw.toUpperCase()) && !TRIGGER_STOP.test(kw);
    push('dm_trigger', explicit ? kw : m[0].trim().replace(/\s+/g, ' '), m.index, m[0].length);
  }
  // free lead magnet / call CTA
  for (const m of text.matchAll(/\bfree\s+(?:coaching\s+call|call|consult\w*|guide|ebook|training|calculator|assessment|community|discord)\b/gi))
    push('lead_magnet', m[0], m.index, m[0].length);
  // explicit disclosure language
  for (const m of text.matchAll(/#?\b(?:ad|sponsored|paidpartnership|affiliate|affiliatelink|commission)\b/gi))
    push('disclosure_token', m[0], m.index, m[0].length);
  return out;
}

const hashtagsOf = (t) => [...new Set([...(t || '').matchAll(/#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[1].toLowerCase()))];
const mentionsOf = (t) => [...new Set([...(t || '').matchAll(/@([a-zA-Z0-9._]{2,24})/g)].map((m) => m[1].replace(/\.+$/, '').toLowerCase()))];

const PEPTIDE_RX =
  /\b(peptide|peptid|retatrutide|reta\b|tirzepatide|tirz\b|semaglutide|sema\b|glp[\s-]?1|glp1|mounjaro|zepbound|ozempic|wegovy|bpc[\s-]?157|tb[\s-]?500|ipamorelin|cjc[\s-]?1295|tesamorelin|hgh\b|mots[\s-]?c|sermorelin|survodutide|cagrilintide|mazdutide|aod[\s-]?9604|glow\s?protocol|research\s?chem)/i;

/* ------------------------------------------------------------------ *
 * Post normalizer - every field copied, never computed
 * ------------------------------------------------------------------ */
function toPost(e, handle, sourceMethod) {
  const caption = e.description ?? e.title ?? null;
  const id = e.id;
  const webpage_url = e.webpage_url || `https://www.tiktok.com/@${e.uploader || handle}/video/${id}`;
  return {
    platform: 'tiktok',
    id,
    webpage_url,
    uploader: e.uploader ?? handle,
    uploader_id: e.uploader_id ?? null,
    channel: e.channel ?? null,
    channel_id: e.channel_id ?? null,
    channel_follower_count: e.channel_follower_count ?? null,
    title: e.title ?? null,
    caption,
    description: e.description ?? null,
    duration_sec: e.duration ?? null,
    view_count: e.view_count ?? null,
    like_count: e.like_count ?? null,
    comment_count: e.comment_count ?? null,
    repost_count: e.repost_count ?? null,
    save_count: e.save_count ?? null,
    timestamp: e.timestamp ?? null,
    upload_date:
      e.upload_date ??
      (typeof e.timestamp === 'number' ? new Date(e.timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, '') : null),
    published_iso: typeof e.timestamp === 'number' ? new Date(e.timestamp * 1000).toISOString() : null,
    track: e.track ?? null,
    artists: e.artists ?? null,
    thumbnail: e.thumbnail ?? (Array.isArray(e.thumbnails) && e.thumbnails.length ? e.thumbnails[e.thumbnails.length - 1].url : null),
    hashtags: hashtagsOf(caption),
    mentions: mentionsOf(caption),
    peptide_relevant: PEPTIDE_RX.test(caption || ''),
    affiliate_signals: extractSignals(caption),
    caption_truncated: typeof caption === 'string' && /\.\.\.$/.test(caption) && caption === e.title,
    metadata_method: sourceMethod,
    metadata_upgraded_dump_json: false,
  };
}

/* ------------------------------------------------------------------ *
 * Self-test of the caption parsers only (no network). TT_SELFTEST=1
 * ------------------------------------------------------------------ */
if (process.env.TT_SELFTEST) {
  const samples = [
    '👇 Link in bio to book your free coaching call — thewarenglish.com/coaching Every "healthy" food category has a hidden calorie ladder. #fatloss #thewarenglish',
    'Use code CLAV15 for 15% off at arcanepeptides.com 🧪 not medical advice @kingclavicular #retatrutide #peptides',
    'comment RETA and I will DM you the protocol. link in bio 🔗 https://linktr.ee/davidp_ifbbro #glp1 #tirzepatide',
    'my free guide is here: https://peptidepanda.com/?ref=joshh — dm me the word GLOW #ad #peptidetok',
    'no cta here just talking about how reta made me feel',
  ];
  for (const s of samples) {
    console.log('\nCAPTION:', s);
    console.log(' hashtags:', hashtagsOf(s));
    console.log(' mentions:', mentionsOf(s));
    console.log(' peptide_relevant:', PEPTIDE_RX.test(s));
    console.log(' signals:', JSON.stringify(extractSignals(s), null, 1));
  }
  process.exit(0);
}

/* ================================================================== *
 * MAIN
 * ================================================================== */
const collected_at = new Date().toISOString();
const posts = new Map(); // id -> post
const creators = new Map(); // handle -> creator
const queries = { pass_a_seed_handles: [], pass_b1_tags_attempted: [], pass_b2_recon_derived: [], pass_b3_caption_mentions: [] };

function collectHandle(handle, nItems, discovery) {
  handle = handle.toLowerCase();
  if (creators.has(handle)) return;
  console.log(`[handle] @${handle} (${discovery})`);
  const profile = fetchProfile(handle);
  sleepSync(SLEEP_CURL_MS);

  // NOTE: the profile-HTML lane is best-effort ENRICHMENT only (follower/heart/
  // video counts + bio + bio link). TikTok serves a bot-check page to plain curl
  // from most IPs, which makes account_resolved false even for accounts that are
  // demonstrably public and that yt-dlp harvests fine. Verified 2026-07-24:
  // curl said "Couldn't find this account" for @thewarenglish while yt-dlp
  // returned 5 real videos with live view counts for the same handle in the same
  // minute. So we NEVER let a blocked HTML fetch gate the yt-dlp harvest.
  // A handle is only "unresolved" if yt-dlp ALSO yields nothing.
  const htmlBlocked = !profile || !profile.account_resolved;
  const entries = harvestHandle(handle, nItems);
  sleepSync(SLEEP_YTDLP_MS);

  if (htmlBlocked && entries.length === 0) {
    creators.set(handle, {
      handle,
      profile_url: `https://www.tiktok.com/@${handle}`,
      discovery,
      resolved: false,
      resolution_note: profile
        ? `profile HTML blocked/not-found (statusCode ${profile.tiktok_status_code}) AND yt-dlp returned zero videos`
        : 'profile HTML fetch failed AND yt-dlp returned zero videos - see failures[]',
      follower_count: null,
      posts_collected: 0,
    });
    return;
  }
  let added = 0;
  for (const e of entries) {
    const p = toPost(e, handle, 'yt-dlp --flat-playlist (TikTok user feed returns full stats block)');
    if (!posts.has(p.id)) {
      posts.set(p.id, p);
      added++;
    }
  }
  const mine = [...posts.values()].filter((p) => (p.uploader || '').toLowerCase() === handle);
  const views = mine.map((p) => p.view_count).filter((v) => typeof v === 'number');
  const pf = profile || {};
  creators.set(handle, {
    handle,
    display_name: pf.nickname ?? null,
    profile_url: pf.profile_url ?? `https://www.tiktok.com/@${handle}`,
    discovery,
    resolved: true,
    resolved_via: htmlBlocked ? 'yt-dlp only (profile HTML blocked)' : 'profile HTML + yt-dlp',
    // When TikTok bot-blocks the plain-curl HTML fetch these stay null on
    // purpose. Never substitute a proxy or a guess for a follower count.
    profile_html_blocked: htmlBlocked,
    verified: pf.verified ?? null,
    follower_count: pf.follower_count ?? null,
    following_count: pf.following_count ?? null,
    total_likes_heart_count: pf.heart_count ?? null,
    total_video_count: pf.video_count ?? null,
    bio: pf.bio ?? null,
    bio_link: pf.bio_link ?? null,
    bio_affiliate_signals: extractSignals([pf.bio, pf.bio_link].filter(Boolean).join(' \n ')),
    sec_uid: pf.sec_uid ?? null,
    posts_collected: mine.length,
    posts_added_this_pass: added,
    peptide_relevant_posts: mine.filter((p) => p.peptide_relevant).length,
    views_sum_over_collected_posts: views.length ? views.reduce((a, b) => a + b, 0) : null,
    views_max_over_collected_posts: views.length ? Math.max(...views) : null,
    metrics_provenance: htmlBlocked
      ? 'account-level counts UNAVAILABLE (TikTok bot-blocked the profile HTML fetch) and are null, not estimated; per-post metrics = yt-dlp; sums are arithmetic over collected posts only, NOT lifetime account totals'
      : 'follower/heart/video counts = TikTok profile HTML rehydration payload; per-post metrics = yt-dlp; sums are arithmetic over collected posts only, NOT lifetime account totals',
  });
  console.log(
    `  -> ${added} posts (followers=${pf.follower_count ?? 'null/blocked'}${htmlBlocked ? ', yt-dlp only' : ''})`
  );
}

// ---------- PASS A ----------
console.log('=== PASS A: seed handles ===');
for (const h of SEED_HANDLES) {
  queries.pass_a_seed_handles.push(h);
  collectHandle(h, PER_HANDLE_ITEMS, 'pass_a_seed');
}

// ---------- PASS B1: tag pages ----------
console.log('=== PASS B1: hashtag/tag pages ===');
for (const tag of TAGS) {
  const url = `https://www.tiktok.com/tag/${tag}`;
  queries.pass_b1_tags_attempted.push(url);
  console.log(`[tag] ${url}`);
  const r = run(
    YTDLP,
    ['--dump-single-json', '--flat-playlist', '--no-warnings', '--ignore-config', '--socket-timeout', '20', '--playlist-items', '1-30', url],
    120000
  );
  if (r.status !== 0 || !r.stdout.trim()) {
    fail('ytdlp_tag_page', url, r.timedOut ? 'spawnSync ETIMEDOUT (120s)' : r.stderr.trim() || r.error || `exit ${r.status}`);
  } else {
    try {
      const doc = JSON.parse(r.stdout);
      const entries = (doc.entries || []).filter((e) => e && e.id);
      jsonl('ytdlp_tag_page', { url, n_entries: entries.length, entries: entries.map(stripHeavy) });
      for (const e of entries) {
        const p = toPost(e, e.uploader || `tag:${tag}`, `yt-dlp tag page ${url}`);
        if (!posts.has(p.id)) posts.set(p.id, p);
      }
      console.log(`  -> ${entries.length} entries from tag page`);
    } catch (e) {
      fail('ytdlp_tag_page_parse', url, e.message);
    }
  }
  sleepSync(SLEEP_YTDLP_MS);
}

// Independent second attempt at hashtag discovery: raw HTML (no auth).
for (const tag of TAGS.slice(0, 3)) {
  const url = `https://www.tiktok.com/tag/${tag}`;
  const r = run('curl', ['-sS', '-A', UA, '-w', '\\n__HTTP__%{http_code}', url], 60000);
  const httpCode = (r.stdout.match(/__HTTP__(\d+)\s*$/) || [])[1] || null;
  const ids = [...new Set([...r.stdout.matchAll(/\/video\/(\d{15,22})/g)].map((m) => m[1]))];
  jsonl('tag_html_probe', { url, http_status: httpCode, video_ids_found: ids.length, captcha_marker: /captcha/i.test(r.stdout) });
  if (ids.length === 0) {
    fail(
      'tag_html_probe',
      url,
      `HTTP ${httpCode} but 0 video ids in HTML - hashtag feed is client-side rendered and gated (captcha marker present=${/captcha/i.test(r.stdout)}). No hashtag-sourced posts recorded.`
    );
  }
  sleepSync(SLEEP_CURL_MS);
}

// ---------- PASS B2: recon-doc handles ----------
console.log('=== PASS B2: handles mined from recon doc ===');
let reconText = '';
try {
  reconText = fs.readFileSync(RECON_DOC, 'utf8');
} catch (e) {
  fail('recon_doc_read', RECON_DOC, e.message);
}
const reconHandles = new Set();
for (const m of reconText.matchAll(/tiktok\.com\/@([a-zA-Z0-9._]{2,24})/g)) reconHandles.add(m[1].toLowerCase());
for (const m of reconText.matchAll(/`@([a-zA-Z0-9._]{2,24})`/g)) reconHandles.add(m[1].toLowerCase());
for (const c of RECON_NAMED_CANDIDATES) reconHandles.add(c.toLowerCase());
jsonl('recon_handle_extraction', { doc: RECON_DOC, handles: [...reconHandles] });
for (const h of [...reconHandles].sort()) {
  queries.pass_b2_recon_derived.push(h);
  collectHandle(h, PER_HANDLE_ITEMS, 'pass_b2_recon_doc');
}

// ---------- PASS B3: caption @mentions ----------
console.log('=== PASS B3: caption-mention expansion ===');
const mentionCounts = new Map();
for (const p of posts.values()) {
  if (!p.peptide_relevant) continue;
  for (const m of p.mentions) {
    if (creators.has(m)) continue;
    mentionCounts.set(m, (mentionCounts.get(m) || 0) + 1);
  }
}
const mentionRanked = [...mentionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_MENTION_HANDLES);
jsonl('mention_candidates', { all: [...mentionCounts.entries()], attempted: mentionRanked });
for (const [h, n] of mentionRanked) {
  queries.pass_b3_caption_mentions.push({ handle: h, mention_count_in_collected_captions: n });
  collectHandle(h, MENTION_ITEMS, `pass_b3_caption_mention (seen ${n}x)`);
}

// ---------- PASS C: full --dump-json for top N by view_count ----------
console.log('=== PASS C: per-video --dump-json for top by view_count ===');
const ranked = [...posts.values()]
  .filter((p) => typeof p.view_count === 'number')
  .sort((a, b) => b.view_count - a.view_count)
  .slice(0, DUMP_JSON_TOP_N);
let upgraded = 0;
const crosschecks = [];
for (const [i, p] of ranked.entries()) {
  process.stdout.write(`  [${i + 1}/${ranked.length}] ${p.webpage_url} ... `);
  const j = dumpVideo(p.webpage_url);
  sleepSync(SLEEP_YTDLP_MS);
  if (!j) {
    console.log('fail');
    continue;
  }
  const before = { view_count: p.view_count, like_count: p.like_count, comment_count: p.comment_count, repost_count: p.repost_count };
  const fresh = toPost(j, p.uploader, 'yt-dlp --dump-json (single video page)');
  fresh.metadata_upgraded_dump_json = true;
  fresh.flat_playlist_metrics_at_first_pass = before;
  fresh.metrics_match_flat_pass =
    before.view_count === fresh.view_count &&
    before.like_count === fresh.like_count &&
    before.comment_count === fresh.comment_count &&
    before.repost_count === fresh.repost_count;
  crosschecks.push({ id: p.id, match: fresh.metrics_match_flat_pass, before, after: { view_count: fresh.view_count, like_count: fresh.like_count, comment_count: fresh.comment_count, repost_count: fresh.repost_count } });
  posts.set(p.id, fresh);
  upgraded++;
  console.log(`ok (views=${fresh.view_count}, match=${fresh.metrics_match_flat_pass})`);
}
jsonl('dump_json_crosscheck', { n: crosschecks.length, mismatches: crosschecks.filter((c) => !c.match) });

// refresh creator post counts after PASS C rewrites
for (const [h, c] of creators) {
  if (!c.resolved) continue;
  const mine = [...posts.values()].filter((p) => (p.uploader || '').toLowerCase() === h);
  const views = mine.map((p) => p.view_count).filter((v) => typeof v === 'number');
  c.posts_collected = mine.length;
  c.peptide_relevant_posts = mine.filter((p) => p.peptide_relevant).length;
  c.views_sum_over_collected_posts = views.length ? views.reduce((a, b) => a + b, 0) : null;
  c.views_max_over_collected_posts = views.length ? Math.max(...views) : null;
}

const allPosts = [...posts.values()].sort((a, b) => (b.view_count ?? -1) - (a.view_count ?? -1));
const out = {
  platform: 'tiktok',
  collected_at,
  finished_at: new Date().toISOString(),
  method: {
    tooling: `yt-dlp ${run(YTDLP, ['--version']).stdout.trim()} at ${YTDLP}; curl for profile HTML; no auth, no cookies, no ScrapeCreators`,
    per_post_metrics:
      'yt-dlp JSON only. TikTok user-feed --flat-playlist returns the full stats block; verified byte-identical to --dump-json on a control video (id 7663514102358117646: 34500 views / 110 likes / 4 comments / 4 reposts from both paths).',
    creator_metrics:
      'follower_count / heart_count / video_count / bio / bio_link parsed from the public TikTok profile HTML __UNIVERSAL_DATA_FOR_REHYDRATION__ payload. Raw payload saved to tiktok.raw.jsonl.',
    top_n_dump_json: `top ${DUMP_JSON_TOP_N} by view_count re-fetched individually with --dump-json; flat-vs-dump metric agreement recorded per post in metrics_match_flat_pass`,
    null_policy:
      'Any metric TikTok did not return is null. channel_follower_count is null on every post because TikTok video payloads from yt-dlp do not carry it; the account-level follower_count on the creator record is the real number.',
    rate_limiting: `${SLEEP_YTDLP_MS}ms between yt-dlp calls, ${SLEEP_CURL_MS}ms between profile HTML fetches`,
    raw_evidence: OUT_JSONL,
  },
  queries,
  counts: {
    creators_total: creators.size,
    creators_resolved: [...creators.values()].filter((c) => c.resolved).length,
    creators_unresolved: [...creators.values()].filter((c) => !c.resolved).length,
    posts_total: allPosts.length,
    posts_peptide_relevant: allPosts.filter((p) => p.peptide_relevant).length,
    posts_with_full_dump_json: upgraded,
    posts_with_affiliate_signals: allPosts.filter((p) => p.affiliate_signals.length > 0).length,
    failures: failures.length,
  },
  creators: [...creators.values()].sort((a, b) => (b.follower_count ?? -1) - (a.follower_count ?? -1)),
  posts: allPosts,
  failures,
};
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
fs.closeSync(jsonlFd);
console.log(`\nWROTE ${OUT_JSON}`);
console.log(JSON.stringify(out.counts, null, 2));
