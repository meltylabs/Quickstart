#!/usr/bin/env node
/* Find peptide-NATIVE TikTok accounts.
 *
 * The existing TikTok cohort came from the recon doc and turned out to be
 * personality/clip accounts: only 2 of 152 collected posts were on topic.
 * @gretatrutide is the shape we actually want - small, peptide-native, real
 * outliers. This finds more of them from three sources, cheapest first:
 *   1. crosswalk  - tiktok.com/@handle mentioned in the 284 YouTube descriptions
 *                   and 7 Instagram bios we already collected (free, no new fetch)
 *   2. mentions   - @handles inside captions of on-topic TikTok posts we have
 *   3. pattern    - handle names built from topic morphemes (reta, trutide, glp1...)
 * Every candidate is then VERIFIED against TikTok with yt-dlp and only kept if it
 * resolves AND its captions actually mention the topic.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const YTDLP = '/opt/homebrew/bin/yt-dlp';
const OUT = `${ROOT}/raw/tiktok-discovered.json`;
const CACHE = `${ROOT}/cache/tt-probe.json`;
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

const TOPIC = /\b(peptide|peptid|retatrutide|reta\b|trutide|tirzepatide|tirz\b|semaglutide|sema\b|glp[\s-]?1|glp1|mounjaro|zepbound|ozempic|wegovy|bpc[\s-]?157|survodutide|cagrilintide|microdos|down \d+ ?(lbs?|pounds)|sw \d+|cw \d+|gw \d+)/i;
const EXISTING = new Set();

/* ---- source 1: crosswalk from YouTube descriptions + IG bios ---- */
const cands = new Map();
const add = (h, src) => {
  h = String(h).toLowerCase().replace(/^@/, '').replace(/[^a-z0-9._]/g, '');
  if (!h || h.length < 3 || EXISTING.has(h)) return;
  if (!cands.has(h)) cands.set(h, new Set());
  cands.get(h).add(src);
};

const TT_URL = /tiktok\.com\/@([A-Za-z0-9._]{3,30})/g;
for (const [file, label] of [['youtube.json', 'yt_description'], ['instagram.json', 'ig_bio'], ['tiktok.json', 'tt_caption']]) {
  const path = `${ROOT}/raw/${file}`;
  if (!fs.existsSync(path)) continue;
  const d = JSON.parse(fs.readFileSync(path, 'utf8'));
  for (const c of d.creators || []) if (c.handle) EXISTING.add(String(c.handle).toLowerCase());
  const blob = JSON.stringify(d);
  let m;
  while ((m = TT_URL.exec(blob))) add(m[1], label);
  // @mentions inside on-topic captions
  for (const p of d.posts || []) {
    const txt = [p.title, p.caption, p.description].filter(Boolean).join(' ');
    if (!TOPIC.test(txt)) continue;
    for (const mm of txt.matchAll(/@([A-Za-z0-9._]{3,30})/g)) add(mm[1], label + '_mention');
  }
}

/* ---- source 3: handle patterns ---- */
const STEMS = ['reta', 'retatrutide', 'trutide', 'glp1', 'glp', 'tirz', 'tirzepatide', 'sema', 'semaglutide', 'peptide', 'peptides', 'pep'];
const AFFIX = ['', 'girl', 'girlie', 'gal', 'queen', 'mom', 'journey', 'life', 'diary', 'daily', 'era', 'club', 'guide', 'coach', 'lab', 'talk', 'tok', 'sisters', 'babe', 'and me', 'gains', 'guy', 'bro', 'king', 'nurse', 'rd'];
for (const st of STEMS) for (const af of AFFIX) {
  add(st + af, 'pattern');
  if (af) add(st + '_' + af, 'pattern');
  if (af) add('the' + st + af, 'pattern');
}
for (const n of ['greta', 'reta']) for (const af of ['trutide', 'trutidejourney', 'trutidegirl']) add(n + af, 'pattern');

console.log(`${cands.size} candidate handles (crosswalk + mentions + pattern), excluding ${EXISTING.size} already collected`);

/* ---- verify each against TikTok ---- */
const probe = (h) => {
  if (cache[h]) return cache[h];
  const r = spawnSync(YTDLP, ['--dump-single-json', '--flat-playlist', '--no-warnings', '--ignore-config',
    '--socket-timeout', '20', '--playlist-items', '1-12', `https://www.tiktok.com/@${h}`],
    { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 });
  let res = { handle: h, resolved: false, error: (r.stderr || '').split('\n')[0]?.slice(0, 150) || null, posts: [] };
  if (r.status === 0 && r.stdout) {
    try {
      const j = JSON.parse(r.stdout);
      const entries = (j.entries || []).filter(Boolean);
      res = {
        handle: h, resolved: entries.length > 0, error: null,
        follower_count: j.channel_follower_count ?? null,
        posts: entries.map((e) => ({
          id: e.id, url: e.webpage_url || e.url, caption: e.title || '', duration: e.duration ?? null,
          views: e.view_count ?? null, likes: e.like_count ?? null,
          comments: e.comment_count ?? null, reposts: e.repost_count ?? null,
          upload_date: e.upload_date ?? null,
        })),
      };
    } catch (e) { res.error = 'parse: ' + e.message.slice(0, 90); }
  }
  cache[h] = res;
  return res;
};

const keep = [], rejected = [];
let i = 0;
for (const [h, srcs] of cands) {
  i++;
  const r = probe(h);
  if (i % 15 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
  if (!r.resolved) { rejected.push({ handle: h, reason: 'did not resolve', error: r.error }); continue; }
  const onTopic = r.posts.filter((p) => TOPIC.test(p.caption));
  if (!onTopic.length) { rejected.push({ handle: h, reason: 'resolved but zero on-topic captions', posts_seen: r.posts.length }); continue; }
  const views = r.posts.map((p) => p.views).filter((v) => typeof v === 'number');
  const med = views.length ? views.sort((a, b) => a - b)[Math.floor(views.length / 2)] : null;
  keep.push({
    handle: h, sources: [...srcs], follower_count: r.follower_count ?? null,
    posts_seen: r.posts.length, on_topic_posts: onTopic.length,
    on_topic_ratio: Number((onTopic.length / r.posts.length).toFixed(2)),
    median_views: med, max_views: views.length ? Math.max(...views) : null,
    outlier_multiple: med && views.length ? Number((Math.max(...views) / med).toFixed(1)) : null,
    total_reposts: r.posts.reduce((a, p) => a + (p.reposts || 0), 0),
    posts: r.posts,
  });
  console.log(`  KEEP @${h}  ${onTopic.length}/${r.posts.length} on-topic  med=${med} max=${views.length ? Math.max(...views) : '-'}`);
}
fs.writeFileSync(CACHE, JSON.stringify(cache));
keep.sort((a, b) => (b.on_topic_ratio - a.on_topic_ratio) || ((b.max_views || 0) - (a.max_views || 0)));
fs.writeFileSync(OUT, JSON.stringify({
  platform: 'tiktok', mode: 'discovery', collected_at: new Date().toISOString(),
  method: 'yt-dlp verification of candidates from YouTube-description/IG-bio crosswalk, on-topic caption @mentions, and topic-morpheme handle patterns. No paid API.',
  topic_filter: String(TOPIC),
  candidates_probed: cands.size, kept: keep.length, rejected: rejected.length,
  creators: keep, rejected,
}, null, 2));
console.log(`\nKEPT ${keep.length} peptide-native accounts of ${cands.size} probed -> ${OUT}`);
