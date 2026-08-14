#!/usr/bin/env node
/**
 * Instagram collector for peptide / GLP-1 / research-peptide affiliate content intel.
 *
 * HARD RULES ENFORCED BY THIS SCRIPT:
 *  - Only source of truth is the public IG endpoint /api/v1/users/web_profile_info/.
 *  - NO paid API. ScrapeCreators is out of credits (HTTP 402) and is never called.
 *  - Every numeric metric emitted must exist in the raw response saved to instagram.raw.jsonl.
 *  - Absent metric => null. Never substitute likes for views. Never estimate.
 *  - IG returns video_view_count === 0 for many reels that provably have views
 *    (e.g. jacobnach Da0eF5Oz4o7: 286,713 likes with vvc 0). Therefore 0 is treated as
 *    "not exposed" -> null, and the raw value is preserved in video_view_count_raw.
 *
 * Usage: node collect_instagram.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const OUT_DIR = '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel/raw';
const OUT_JSON = path.join(OUT_DIR, 'instagram.json');
const RAW_JSONL = path.join(OUT_DIR, 'instagram.raw.jsonl');

const IG_APP_ID = '936619743392459';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const SLEEP_BETWEEN_HANDLES_MS = 4000;
const RETRY_DELAY_MS = 15000;

// ---------------------------------------------------------------------------
// Handle roster.
// `mentioned_as` records how the doc referenced the handle so downstream never
// misattributes an unrelated IG account that happens to share a YouTube slug.
// ---------------------------------------------------------------------------
const HANDLES = [
  // Explicitly requested core set
  { handle: 'kingclavicular', source: 'task-brief + retatrutide-social-recon.md', mentioned_as: 'cross-platform (reported canonical handle; IG not previously resolved)' },
  { handle: 'jacobnach', source: 'task-brief + retatrutide-social-recon.md', mentioned_as: 'instagram' },
  { handle: 'davidp_ifbbpro', source: 'task-brief + retatrutide-social-recon.md', mentioned_as: 'instagram' },
  { handle: 'thewarenglish', source: 'task-brief + retatrutide-social-recon.md', mentioned_as: 'instagram' },
  { handle: 'realnicktrigili', source: 'task-brief + retatrutide-social-recon.md', mentioned_as: 'instagram' },
  { handle: 'josh.holyfield', source: 'task-brief + retatrutide-social-recon.md', mentioned_as: 'instagram' },
  // Additional handles mined out of retatrutide-social-recon.md
  { handle: 'kickpersonal', source: 'retatrutide-social-recon.md', mentioned_as: 'tiktok clip aggregator - IG existence unverified' },
  { handle: 'clipgawwd7', source: 'retatrutide-social-recon.md', mentioned_as: 'tiktok clip aggregator - IG existence unverified' },
  { handle: 'mikeknowspeps', source: 'retatrutide-social-recon.md', mentioned_as: 'reddit mention, blocked-data appendix' },
  { handle: 'projectbetterman', source: 'retatrutide-social-recon.md', mentioned_as: 'public identity in peptidepanda PARTY funnel' },
  { handle: 'hunterwilliamscoaching', source: 'retatrutide-social-recon.md', mentioned_as: 'youtube channel handle - IG may be unrelated' },
  { handle: 'nicknorwitzPhD', source: 'retatrutide-social-recon.md', mentioned_as: 'youtube channel handle - IG may be unrelated' },
  { handle: 'ThisIsNotCovered', source: 'retatrutide-social-recon.md', mentioned_as: 'youtube channel handle - IG may be unrelated' },
  { handle: 'DrAminHedayatMD', source: 'retatrutide-social-recon.md', mentioned_as: 'youtube channel handle - IG may be unrelated' },
  { handle: 'BodybuildingandBS', source: 'retatrutide-social-recon.md', mentioned_as: 'youtube channel handle for realnicktrigili - IG may be unrelated' },
  { handle: 'JoshHolyfield', source: 'retatrutide-social-recon.md', mentioned_as: 'youtube channel handle variant of josh.holyfield' },
];

// Peptide vendor / affiliate-network domains harvested from
// .context/peptide-affiliate-offers.md and .context/retatrutide-social-recon.md
const VENDOR_DOMAINS = [
  'alphaomegapeptide.com', 'aminoclub.com', 'apollopeptides.refersion.com', 'apollopeptidesciences.com',
  'arcanepeptides.com', 'ascensionpeptides.com', 'based-research.com', 'bastionpeptides.com',
  'blankpeptides.com', 'bodyhackguide.co', 'certapeptides.com', 'courses.drafroese.com',
  'drjonesdc.com', 'everwellmedical.store', 'glp1researchlab.com', 'hunterwilliamshealth.com',
  'idunpeptides.com', 'journeypeptides.com', 'livewellpeptides.com', 'lonestarpeptideco.com',
  'lyzelabs.com', 'mlcrscty.com', 'modernaminos.com', 'orbitrexpeptide.is', 'otmens.com',
  'peppal.app', 'peppushers.com', 'peptide.partners', 'peptidegrades.com', 'peptidepalapp.com',
  'peptidepanda.com', 'peptides-enhanced.com', 'peptidescouter.com', 'peptidex.app', 'peptira.com',
  'pinkponypeptides.com', 'pinnaclepeptidelabs.com', 'polygonpeptides.co.uk', 'pppepz.com',
  'promino-usa.com', 'pspeptides.com', 'pureuspeptide.com', 'researchpeptides.io',
  'retatrutide-rx.com', 'thewarenglish.com', 'viora-healthcare.leaddyno.com', 'viorahealthcare.com',
  'zhyoeixwmcqo.goaffpro.com', 'goaffpro.com', 'refersion.com', 'leaddyno.com',
];

// Generic keyword match so vendors NOT in the known list still get flagged.
const VENDOR_KEYWORDS = [
  'peptide', 'peptid', 'pep-', 'reta', 'retatrutide', 'tirzepatide', 'semaglutide', 'glp1', 'glp-1',
  'research-chem', 'researchchem', 'sarms', 'bpc157', 'bpc-157', 'tb500', 'amino',
];

// Link-aggregator hosts worth deep-crawling for outbound vendor links.
const AGGREGATOR_HOSTS = [
  'linktr.ee', 'beacons.ai', 'beacons.page', 'stan.store', 'komi.io', 'snipfeed.co',
  'allmylinks.com', 'taplink.cc', 'bio.link', 'linkin.bio', 'hoo.be', 'msha.ke',
  'campsite.bio', 'lnk.bio', 'direct.me', 'solo.to', 'flowcode.com', 'shor.by',
  'linkpop.com', 'later.com', 'withkoji.com', 'carrd.co', 'milkshake.app', 'tap.bio',
  'linkme.bio', 'contactinbio.com', 'shorby.com', 'flowpage.com', 'zaap.bio', 'pillar.io',
];

// Social / infra hosts that are never "outbound vendor links".
const NOISE_HOSTS = [
  'instagram.com', 'www.instagram.com', 'facebook.com', 'www.facebook.com', 'fb.com',
  'twitter.com', 'x.com', 'tiktok.com', 'www.tiktok.com', 'youtube.com', 'www.youtube.com',
  'youtu.be', 'threads.net', 'threads.com', 'snapchat.com', 'linkedin.com', 'pinterest.com',
  'reddit.com', 'apple.com', 'apps.apple.com', 'play.google.com', 'google.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'gstatic.com', 'googletagmanager.com',
  'google-analytics.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cloudflare.com', 'cdnjs.cloudflare.com',
  'schema.org', 'w3.org', 'www.w3.org', 'gravatar.com', 'wp.com', 'jquery.com',
  'sentry.io', 'stripe.com', 'js.stripe.com', 'paypal.com', 'vercel.app', 'squarespace.com',
  'shopify.com', 'cdn.shopify.com', 'wixstatic.com', 'wix.com', 'fontawesome.com',
  'mozilla.org', 'linktr.ee/s', 'about.linktr.ee',
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowISO = () => new Date().toISOString();

function appendRaw(obj) {
  fs.appendFileSync(RAW_JSONL, JSON.stringify(obj) + '\n');
}

/** Run curl. Never throws on non-2xx; returns {code, stdout, stderr}. */
async function curl(args, maxBuffer = 40 * 1024 * 1024) {
  try {
    const { stdout, stderr } = await execFileAsync('/usr/bin/curl', args, { maxBuffer });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || String(err),
      code: err.code,
    };
  }
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function isAggregator(u) {
  const h = hostOf(u);
  if (!h) return false;
  return AGGREGATOR_HOSTS.some((a) => h === a || h.endsWith('.' + a));
}

function isNoise(u) {
  const h = hostOf(u);
  if (!h) return true;
  return NOISE_HOSTS.some((n) => h === n.replace(/^www\./, '') || h.endsWith('.' + n.replace(/^www\./, '')));
}

function vendorMatch(u) {
  const h = hostOf(u);
  if (!h) return null;
  const known = VENDOR_DOMAINS.find((d) => h === d || h.endsWith('.' + d));
  if (known) return { host: h, match: 'known_vendor_domain', matched_on: known };
  const kw = VENDOR_KEYWORDS.find((k) => h.includes(k));
  if (kw) return { host: h, match: 'vendor_keyword_in_host', matched_on: kw };
  const kwPath = VENDOR_KEYWORDS.find((k) => u.toLowerCase().includes(k));
  if (kwPath) return { host: h, match: 'vendor_keyword_in_url', matched_on: kwPath };
  return null;
}

/** Un-wrap Instagram's l.instagram.com link shim to the real destination. */
function unshim(u) {
  if (!u) return u;
  try {
    const url = new URL(u);
    if (url.hostname === 'l.instagram.com' || url.hostname === 'l.facebook.com') {
      const real = url.searchParams.get('u');
      if (real) return decodeURIComponent(real);
    }
  } catch { /* leave as-is */ }
  return u;
}

// ---------------------------------------------------------------------------
// affiliate signal extraction
// ---------------------------------------------------------------------------
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s"'<>)\]]+/gi;
const BARE_DOMAIN_RE = /\b[a-z0-9][a-z0-9-]{1,60}\.(?:com|co|io|net|org|store|app|shop|is|uk|ai|us|xyz|life|health|to|link|bio|club|labs?)\b(?:\/[^\s"'<>)\]]*)?/gi;
const CODE_RE = /\b(?:code|coupon|promo|discount|use)\s*[:=]?\s*["'“]?([A-Z0-9][A-Z0-9_-]{2,19})\b/gi;
const STANDALONE_CODE_RE = /\b([A-Z0-9]{3,15})\b(?=\s*(?:for|to get|at checkout|gets? you|=|save))/g;

function extractAffiliateSignals(text, ctxLabel) {
  if (!text || typeof text !== 'string') return null;
  const t = text;
  const signals = {
    context: ctxLabel,
    urls: [],
    bare_domains: [],
    discount_codes: [],
    vendor_domain_hits: [],
    link_in_bio: false,
    dm_cta: false,
    comment_cta: false,
    affiliate_disclosure_words: [],
    peptide_terms: [],
  };

  for (const m of t.match(URL_RE) || []) {
    const cleaned = m.replace(/[.,;:!?)]+$/, '');
    const full = cleaned.startsWith('http') ? cleaned : 'https://' + cleaned;
    if (!signals.urls.includes(full)) signals.urls.push(full);
  }
  const urlHosts = new Set(signals.urls.map(hostOf).filter(Boolean));
  for (const m of t.match(BARE_DOMAIN_RE) || []) {
    const d = m.replace(/[.,;:!?)]+$/, '').toLowerCase();
    const h = d.split('/')[0];
    if (urlHosts.has(h)) continue;
    if (!signals.bare_domains.includes(d)) signals.bare_domains.push(d);
  }

  let cm;
  CODE_RE.lastIndex = 0;
  while ((cm = CODE_RE.exec(t)) !== null) {
    const code = cm[1];
    if (/^(?:THE|AND|FOR|YOU|ALL|NEW|GET|OFF|USE|DM|MY|IS|IT|TO|AT|ON|IN|OF|HTTPS|HTTP|WWW|COM)$/.test(code)) continue;
    if (!signals.discount_codes.includes(code)) signals.discount_codes.push(code);
  }
  STANDALONE_CODE_RE.lastIndex = 0;
  while ((cm = STANDALONE_CODE_RE.exec(t)) !== null) {
    const code = cm[1];
    if (code.length < 3) continue;
    if (/^(?:THE|AND|FOR|YOU|ALL|NEW|GET|OFF|USE|WHY|HOW|NOT|BUT|WAS|ARE|CAN|HAS|ITS|OUR|OWN|ONE|TWO|GLP|IFBB)$/.test(code)) continue;
    if (!signals.discount_codes.includes(code)) signals.discount_codes.push(code);
  }

  const lower = t.toLowerCase();
  const allCandidates = [...signals.urls, ...signals.bare_domains.map((d) => 'https://' + d)];
  for (const u of allCandidates) {
    const v = vendorMatch(u);
    if (v && !signals.vendor_domain_hits.some((x) => x.url === u)) {
      signals.vendor_domain_hits.push({ url: u, ...v });
    }
  }

  signals.link_in_bio = /link\s*(?:is\s*)?in\s*(?:my\s*)?bio|linkinbio|link n bio|bio link|👆|check\s+my\s+bio/i.test(t);
  signals.dm_cta = /\bdm\b|\bdms\b|direct message|send me a message|message me/i.test(t);
  signals.comment_cta = /comment\s+["'“]?[A-Za-z0-9]+["'”]?\s*(?:below|and|to|for)|drop a comment|comment the word/i.test(t);

  for (const w of ['affiliate', 'sponsored', '#ad', 'paid partnership', 'commission', 'partner link', 'discount code', 'research use only', 'ruo', 'not for human consumption', 'disclosure', 'disclaimer']) {
    if (lower.includes(w)) signals.affiliate_disclosure_words.push(w);
  }
  for (const w of ['retatrutide', 'reta', 'tirzepatide', 'tirz', 'semaglutide', 'sema', 'glp-1', 'glp1', 'peptide', 'bpc-157', 'bpc157', 'tb-500', 'tb500', 'ipamorelin', 'cjc-1295', 'mots-c', 'nad+', 'tesamorelin', 'aod', 'ghk-cu', 'cagrilintide', 'survodutide', 'mounjaro', 'ozempic', 'zepbound', 'wegovy']) {
    if (new RegExp(`\\b${w.replace(/[+.]/g, '\\$&')}\\b`, 'i').test(t)) signals.peptide_terms.push(w);
  }

  const hasAny =
    signals.urls.length || signals.bare_domains.length || signals.discount_codes.length ||
    signals.vendor_domain_hits.length || signals.link_in_bio || signals.dm_cta ||
    signals.comment_cta || signals.affiliate_disclosure_words.length || signals.peptide_terms.length;
  return hasAny ? signals : null;
}

// ---------------------------------------------------------------------------
// IG profile fetch
// ---------------------------------------------------------------------------
async function fetchProfile(handle, attempt) {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
  const args = [
    '-sS', '-w', '\n__HTTP_STATUS__:%{http_code}',
    '--max-time', '30',
    '-H', `x-ig-app-id: ${IG_APP_ID}`,
    '-H', `User-Agent: ${UA}`,
    '-H', 'Accept: */*',
    url,
  ];
  const res = await curl(args);
  const raw = res.stdout || '';
  const m = raw.match(/\n__HTTP_STATUS__:(\d+)$/);
  const status = m ? parseInt(m[1], 10) : null;
  const body = m ? raw.slice(0, m.index) : raw;

  let parsed = null;
  let parseError = null;
  if (body.trim()) {
    try { parsed = JSON.parse(body); } catch (e) { parseError = e.message; }
  }

  appendRaw({
    kind: 'ig_web_profile_info',
    handle,
    attempt,
    requested_at: nowISO(),
    request_url: url,
    http_status: status,
    curl_ok: res.ok,
    curl_stderr: res.stderr ? String(res.stderr).slice(0, 800) : null,
    body_bytes: body.length,
    parse_error: parseError,
    body: parsed !== null ? parsed : body.slice(0, 20000),
  });

  return { status, parsed, parseError, body, curl_ok: res.ok, curl_stderr: res.stderr };
}

// ---------------------------------------------------------------------------
// bio link resolution
// ---------------------------------------------------------------------------
async function resolveLink(handle, bioLink) {
  const out = {
    handle,
    bio_link: bioLink.url,
    bio_link_title: bioLink.title ?? null,
    bio_link_source: bioLink.source,
    resolved_url: null,
    http_status: null,
    redirect_chain: null,
    resolve_method: null,
    is_link_aggregator: null,
    page_title: null,
    outbound_vendor_links: [],
    outbound_all_links: [],
    error: null,
  };

  const target = bioLink.url;

  // Pass 1: HEAD, follow redirects.
  let res = await curl([
    '-sS', '-I', '-L', '--max-time', '15', '--max-redirs', '10',
    '-A', UA, '-w', '\n__FINAL_URL__:%{url_effective}\n__HTTP_STATUS__:%{http_code}\n__REDIRECTS__:%{num_redirects}', target,
  ]);
  let raw = res.stdout || '';
  let statusM = raw.match(/__HTTP_STATUS__:(\d+)/);
  let finalM = raw.match(/__FINAL_URL__:(\S+)/);
  let redirM = raw.match(/__REDIRECTS__:(\d+)/);
  let status = statusM ? parseInt(statusM[1], 10) : null;
  out.resolve_method = 'HEAD -L';

  appendRaw({
    kind: 'bio_link_resolve_head', handle, bio_link: target, requested_at: nowISO(),
    curl_ok: res.ok, http_status: status,
    final_url: finalM ? finalM[1] : null,
    num_redirects: redirM ? parseInt(redirM[1], 10) : null,
    headers: raw.slice(0, 8000),
    curl_stderr: res.stderr ? String(res.stderr).slice(0, 500) : null,
  });

  // Pass 2: many hosts reject HEAD (403/405/501) -> retry with GET.
  if (!status || status === 403 || status === 405 || status === 501 || status >= 500 || status === 0) {
    res = await curl([
      '-sS', '-L', '--max-time', '20', '--max-redirs', '10', '-o', '/dev/null',
      '-A', UA, '-w', '__FINAL_URL__:%{url_effective}\n__HTTP_STATUS__:%{http_code}\n__REDIRECTS__:%{num_redirects}', target,
    ]);
    raw = res.stdout || '';
    statusM = raw.match(/__HTTP_STATUS__:(\d+)/);
    finalM = raw.match(/__FINAL_URL__:(\S+)/);
    redirM = raw.match(/__REDIRECTS__:(\d+)/);
    const getStatus = statusM ? parseInt(statusM[1], 10) : null;
    out.resolve_method = 'HEAD -L then GET -L fallback';
    appendRaw({
      kind: 'bio_link_resolve_get_fallback', handle, bio_link: target, requested_at: nowISO(),
      curl_ok: res.ok, http_status: getStatus,
      final_url: finalM ? finalM[1] : null,
      num_redirects: redirM ? parseInt(redirM[1], 10) : null,
      curl_stderr: res.stderr ? String(res.stderr).slice(0, 500) : null,
    });
    if (getStatus) status = getStatus;
  }

  out.http_status = status ?? null;
  out.resolved_url = finalM ? finalM[1] : null;
  out.redirect_chain = redirM ? parseInt(redirM[1], 10) : null;
  if (status === 0 || status === null) out.error = 'curl could not obtain an HTTP status (DNS/TLS/timeout)';

  const landing = out.resolved_url || target;
  out.is_link_aggregator = isAggregator(landing);

  // Fetch HTML of the landing page and mine outbound links.
  // Done for every reachable link (not just known aggregators) because creators
  // use custom link pages (e.g. linksjacobnach.com) that are aggregators in practice.
  if (status && status >= 200 && status < 400) {
    const htmlRes = await curl([
      '-sS', '-L', '--max-time', '20', '--max-redirs', '10',
      '-A', UA, '-H', 'Accept: text/html,application/xhtml+xml',
      '--compressed', landing,
    ]);
    const html = (htmlRes.stdout || '').slice(0, 3_000_000);
    appendRaw({
      kind: 'bio_link_landing_html', handle, bio_link: target, landing_url: landing,
      requested_at: nowISO(), curl_ok: htmlRes.ok, html_bytes: html.length,
      html_excerpt: html.slice(0, 60000),
    });

    if (html) {
      const titleM = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
      if (titleM) out.page_title = titleM[1].replace(/\s+/g, ' ').trim();

      const landingHost = hostOf(landing);
      const found = new Map();

      // href/src attributes
      for (const m of html.matchAll(/(?:href|data-href|data-url)\s*=\s*["']([^"']+)["']/gi)) {
        found.set(m[1], 'html_attr');
      }
      // JSON-embedded URLs (linktr.ee / beacons ship links inside __NEXT_DATA__)
      for (const m of html.matchAll(/https?:\\?\/\\?\/[a-zA-Z0-9._~%-]+\.[a-zA-Z]{2,}(?:\\?\/[^"'\s\\<>]*)?/g)) {
        const u = m[0].replace(/\\\//g, '/');
        if (!found.has(u)) found.set(u, 'embedded_json_or_text');
      }

      for (const [rawUrl, how] of found) {
        let u = rawUrl.trim();
        if (u.startsWith('//')) u = 'https:' + u;
        if (!/^https?:\/\//i.test(u)) continue;
        u = u.replace(/["'\\]+$/, '').replace(/[,;)]+$/, '');
        const h = hostOf(u);
        if (!h) continue;
        if (h === landingHost) continue;      // internal
        if (isNoise(u)) continue;             // socials / CDNs / infra
        const entry = { url: u, host: h, found_via: how };
        if (!out.outbound_all_links.some((x) => x.url === u)) out.outbound_all_links.push(entry);
        const v = vendorMatch(u);
        if (v && !out.outbound_vendor_links.some((x) => x.url === u)) {
          out.outbound_vendor_links.push({ url: u, ...v, found_via: how });
        }
      }
      // Keep the raw dump bounded but keep vendor list complete.
      if (out.outbound_all_links.length > 300) {
        out.outbound_all_links = out.outbound_all_links.slice(0, 300);
        out.outbound_all_links_truncated_at = 300;
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(RAW_JSONL, '');
  appendRaw({
    kind: 'run_meta',
    started_at: nowISO(),
    script: import.meta.url,
    method: 'unauthenticated GET https://www.instagram.com/api/v1/users/web_profile_info/ with x-ig-app-id header, via /usr/bin/curl',
    paid_apis_used: 'none - ScrapeCreators deliberately not called (out of credits, HTTP 402)',
    handles_queued: HANDLES.map((h) => h.handle),
  });

  const creators = [];
  const posts = [];
  const failures = [];
  const bio_funnels = [];

  for (let i = 0; i < HANDLES.length; i++) {
    const { handle, source, mentioned_as } = HANDLES[i];
    process.stderr.write(`\n[${i + 1}/${HANDLES.length}] ${handle} ... `);

    let r = await fetchProfile(handle, 1);
    if (r.status !== 200 || !r.parsed?.data?.user) {
      process.stderr.write(`status=${r.status} -> retry in 15s ... `);
      await sleep(RETRY_DELAY_MS);
      r = await fetchProfile(handle, 2);
    }

    if (r.status !== 200 || !r.parsed?.data?.user) {
      const reason =
        r.status === 404 ? 'HTTP 404 - IG account does not exist at this handle'
        : r.status === 400 ? 'HTTP 400 - IG rejected the request (rate limit / login-gated) after 1 retry'
        : r.status === 401 ? 'HTTP 401 - login required'
        : r.status ? `HTTP ${r.status}`
        : `no HTTP status from curl: ${String(r.curl_stderr).slice(0, 200)}`;
      failures.push({
        handle, stage: 'web_profile_info', http_status: r.status, reason,
        parse_error: r.parseError ?? null, attempts: 2,
        raw_saved_to: RAW_JSONL,
      });
      process.stderr.write(`FAILED (${reason})`);
      if (i < HANDLES.length - 1) await sleep(SLEEP_BETWEEN_HANDLES_MS);
      continue;
    }

    const u = r.parsed.data.user;

    // --- bio links -------------------------------------------------------
    const bioLinks = (u.bio_links || []).map((b) => ({
      title: b.title ?? null,
      url: b.url ?? null,
      lynx_url: b.lynx_url ?? null,
      link_type: b.link_type ?? null,
    }));

    const creator = {
      handle,
      handle_source: source,
      mentioned_as,
      username: u.username ?? null,
      id: u.id ?? null,
      full_name: u.full_name ?? null,
      biography: u.biography ?? null,
      bio_links: bioLinks,
      external_url: u.external_url ?? null,
      external_url_linkshimmed: u.external_url_linkshimmed ?? null,
      followers: u.edge_followed_by?.count ?? null,
      following: u.edge_follow?.count ?? null,
      posts_total: u.edge_owner_to_timeline_media?.count ?? null,
      is_verified: u.is_verified ?? null,
      is_private: u.is_private ?? null,
      is_business_account: u.is_business_account ?? null,
      is_professional_account: u.is_professional_account ?? null,
      business_category_name: u.business_category_name ?? null,
      category_name: u.category_name ?? null,
      category_enum: u.category_enum ?? null,
      profile_pic_url_hd: u.profile_pic_url_hd ?? null,
      profile_url: `https://www.instagram.com/${u.username}/`,
      bio_affiliate_signals: extractAffiliateSignals(
        [u.biography || '', u.external_url || '', bioLinks.map((b) => `${b.title || ''} ${b.url || ''}`).join(' ')].join('\n'),
        'biography+bio_links'
      ),
      timeline_posts_returned: u.edge_owner_to_timeline_media?.edges?.length ?? 0,
      collected_at: nowISO(),
      metric_source: 'instagram web_profile_info (unauthenticated)',
    };
    creators.push(creator);

    // --- posts -----------------------------------------------------------
    const edges = u.edge_owner_to_timeline_media?.edges || [];
    for (const { node: n } of edges) {
      const caption = n.edge_media_to_caption?.edges?.[0]?.node?.text ?? null;
      const rawVVC = Object.prototype.hasOwnProperty.call(n, 'video_view_count') ? n.video_view_count : undefined;

      // IG zeroes video_view_count on many reels that provably have views.
      // Treat 0 as "not exposed" -> null. NEVER substitute likes.
      let vvc = null;
      let vvcNote = null;
      if (!n.is_video) {
        vvcNote = 'not a video - IG exposes no view count for images/carousels';
      } else if (rawVVC === undefined || rawVVC === null) {
        vvcNote = 'field absent from IG response';
      } else if (rawVVC === 0) {
        vvcNote = 'IG returned 0 for a video - treated as NOT EXPOSED (null), not a real zero. Verified sentinel: jacobnach reel Da0eF5Oz4o7 has 286,713 likes with video_view_count 0.';
      } else {
        vvc = rawVVC;
      }

      posts.push({
        handle,
        username: u.username ?? null,
        shortcode: n.shortcode ?? null,
        url: n.shortcode ? `https://www.instagram.com/p/${n.shortcode}/` : null,
        display_url: n.display_url ?? null,
        thumbnail_src: n.thumbnail_src ?? null,
        is_video: n.is_video ?? null,
        product_type: n.product_type ?? null,
        typename: n.__typename ?? null,
        video_view_count: vvc,
        video_view_count_raw: rawVVC === undefined ? null : rawVVC,
        video_view_count_note: vvcNote,
        likes: n.edge_liked_by?.count ?? null,
        likes_preview: n.edge_media_preview_like?.count ?? null,
        comments: n.edge_media_to_comment?.count ?? null,
        comments_disabled: n.comments_disabled ?? null,
        like_and_view_counts_disabled: n.like_and_view_counts_disabled ?? null,
        taken_at_timestamp: n.taken_at_timestamp ?? null,
        taken_at_iso: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null,
        accessibility_caption: n.accessibility_caption ?? null,
        caption,
        caption_hashtags: caption ? [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) || []))] : [],
        caption_mentions: caption ? [...new Set((caption.match(/@[A-Za-z0-9._]+/g) || []))] : [],
        pinned: Array.isArray(n.pinned_for_users) ? n.pinned_for_users.length > 0 : null,
        coauthors: (n.coauthor_producers || []).map((c) => c.username).filter(Boolean),
        location: n.location?.name ?? null,
        affiliate_signals: extractAffiliateSignals(caption, 'caption'),
        metric_source: 'instagram web_profile_info edge_owner_to_timeline_media (unauthenticated)',
      });
    }

    process.stderr.write(`OK ${creator.followers} followers, ${edges.length} posts`);
    if (i < HANDLES.length - 1) await sleep(SLEEP_BETWEEN_HANDLES_MS);
  }

  // --- bio funnel mapping ------------------------------------------------
  process.stderr.write('\n\n=== resolving bio links ===\n');
  const linkJobs = [];
  for (const c of creators) {
    const seen = new Set();
    const push = (url, title, src) => {
      const real = unshim(url);
      if (!real || !/^https?:\/\//i.test(real)) return;
      const key = real.replace(/\/+$/, '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      linkJobs.push({ handle: c.handle, url: real, title: title ?? null, source: src });
    };
    if (c.external_url) push(c.external_url, 'external_url', 'external_url');
    for (const b of c.bio_links) {
      if (b.url) push(b.url, b.title, 'bio_links.url');
      else if (b.lynx_url) push(b.lynx_url, b.title, 'bio_links.lynx_url');
    }
  }

  for (let i = 0; i < linkJobs.length; i++) {
    const job = linkJobs[i];
    process.stderr.write(`[link ${i + 1}/${linkJobs.length}] ${job.handle} ${job.url} ... `);
    try {
      const f = await resolveLink(job.handle, job);
      bio_funnels.push(f);
      process.stderr.write(`${f.http_status} -> ${f.resolved_url} (${f.outbound_vendor_links.length} vendor links)\n`);
    } catch (e) {
      bio_funnels.push({
        handle: job.handle, bio_link: job.url, bio_link_title: job.title,
        bio_link_source: job.source, resolved_url: null, http_status: null,
        outbound_vendor_links: [], outbound_all_links: [], error: String(e).slice(0, 300),
      });
      failures.push({ handle: job.handle, stage: 'bio_link_resolve', target: job.url, reason: String(e).slice(0, 300) });
      process.stderr.write(`ERROR ${String(e).slice(0, 120)}\n`);
    }
    await sleep(1200);
  }

  // --- assemble ----------------------------------------------------------
  const videoPosts = posts.filter((p) => p.is_video);
  const out = {
    platform: 'instagram',
    collected_at: nowISO(),
    method: {
      endpoint: 'https://www.instagram.com/api/v1/users/web_profile_info/?username=HANDLE',
      auth: 'none (unauthenticated public endpoint, x-ig-app-id: 936619743392459 + desktop Chrome UA)',
      transport: '/usr/bin/curl',
      rate_limiting: '4s sleep between handles; single retry after 15s on non-200',
      bio_link_resolution: 'curl -sIL --max-time 15 (HEAD, follow redirects), GET -L fallback when HEAD is rejected; landing HTML fetched and outbound links mined',
      paid_apis_used: 'none. ScrapeCreators NOT called (out of credits / HTTP 402).',
      raw_responses: RAW_JSONL,
      collector_script: '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel/collect_instagram.mjs',
    },
    data_integrity: {
      rule: 'Every numeric field traces to a raw response line in instagram.raw.jsonl. Nothing estimated, extrapolated, or inferred.',
      video_view_count: 'IG returns 0 for many reels that demonstrably have views, so 0 is normalized to null and preserved in video_view_count_raw. Likes are NEVER substituted for views.',
      images_and_carousels: 'IG exposes no view count for non-video media -> video_view_count is null by definition.',
      followers_of_failed_handles: 'null / absent - no row emitted at all when the profile call failed.',
    },
    counts: {
      handles_attempted: HANDLES.length,
      creators_collected: creators.length,
      posts_collected: posts.length,
      video_posts: videoPosts.length,
      video_posts_with_real_view_count: videoPosts.filter((p) => p.video_view_count !== null).length,
      video_posts_view_count_suppressed_by_ig: videoPosts.filter((p) => p.is_video && p.video_view_count === null).length,
      bio_links_resolved: bio_funnels.length,
      failures: failures.length,
    },
    creators,
    posts,
    failures,
    bio_funnels,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  appendRaw({ kind: 'run_meta_end', finished_at: nowISO(), counts: out.counts });

  process.stderr.write('\n\n=== DONE ===\n');
  process.stderr.write(JSON.stringify(out.counts, null, 2) + '\n');
  process.stderr.write(`wrote ${OUT_JSON}\n`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
