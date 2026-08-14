#!/usr/bin/env node
/**
 * collect_youtube.mjs — reusable YouTube harvester for peptide / GLP-1 /
 * research-peptide affiliate content intel.
 *
 * HARD RULES BAKED IN:
 *  - Every numeric metric written to output comes verbatim from a yt-dlp JSON
 *    response that is also appended to raw/youtube.raw.jsonl. Nothing is
 *    estimated, interpolated, or inferred. Missing => null + a reason.
 *  - No ScrapeCreators. No network calls other than yt-dlp (+ a plain curl-less
 *    fetch() to youtube.com only for resolving a channel handle -> channelId,
 *    which is metadata resolution, not metrics).
 *  - Resumable: everything is cached under cache/. Re-runs reuse the cache and
 *    only fetch what's missing. raw/youtube.raw.jsonl is REBUILT from the cache
 *    on every run so the raw file always matches the derived output.
 *
 * Usage:
 *   export PATH=/opt/homebrew/bin:$PATH
 *   node collect_youtube.mjs                 # full run
 *   DETAIL_BUDGET=400 node collect_youtube.mjs
 *   ONLY=detail node collect_youtube.mjs     # phases: search|channels|detail|build
 *   FORCE=1 node collect_youtube.mjs         # ignore cache
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------- config ----
const ROOT = "/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel";
const RAW_DIR = path.join(ROOT, "raw");
const CACHE = path.join(ROOT, "cache");
const CACHE_SEARCH = path.join(CACHE, "search");
const CACHE_CHANNEL = path.join(CACHE, "channel");
const CACHE_DETAIL = path.join(CACHE, "detail");
const CACHE_RESOLVE = path.join(CACHE, "resolve");
const OUT_JSON = path.join(RAW_DIR, "youtube.json");
const OUT_RAW = path.join(RAW_DIR, "youtube.raw.jsonl");
const LOG = path.join(ROOT, "collect_youtube.log");

const YTDLP = process.env.YTDLP || "/opt/homebrew/bin/yt-dlp";
const SEARCH_N = Number(process.env.SEARCH_N || 20);
const DETAIL_BUDGET = Number(process.env.DETAIL_BUDGET || 340);
const DETAIL_BATCH = Number(process.env.DETAIL_BATCH || 20);
const FORCE = process.env.FORCE === "1";
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const phaseOn = (p) => ONLY.length === 0 || ONLY.includes(p);

const QUERIES = [
  "retatrutide",
  "retatrutide results",
  "retatrutide week 4",
  "tirzepatide vs retatrutide",
  "research peptides review",
  "peptide vendor review",
  "third party tested peptides",
  "how to buy peptides online",
  "gray market peptides",
  "GLP-1 alternative peptides",
  "compounded tirzepatide",
  "peptide protocol beginner",
  "peptide affiliate code",
  "retatrutide before after",
  "peptide testing lab results",
  "semaglutide vs retatrutide",
  "cheapest peptides",
  "peptide reconstitution",
  "peptide source",
  "reta transformation",
];

// Seed channels exactly as given. `given` is the literal string supplied.
const SEED_CHANNELS = [
  { given: "ThisIsNotCovered", handle: "ThisIsNotCovered" },
  { given: "DrAminHedayatMD", handle: "DrAminHedayatMD" },
  { given: "nicknorwitzPhD", handle: "nicknorwitzPhD" },
  { given: "BodybuildingandBS", handle: "BodybuildingandBS" },
  { given: "JoshHolyfield", handle: "JoshHolyfield" },
  { given: "hunterwilliamscoaching", handle: "hunterwilliamscoaching" },
  { given: "DrBradStanfield", handle: "DrBradStanfield" },
  { given: "Dr. Kevin Joseph", handle: "DrKevinJoseph" },
];
const CHANNEL_UPLOADS_N = Number(process.env.CHANNEL_UPLOADS_N || 25);

// -------------------------------------------------------- affiliate lexicon -
// Match lists only. A match can never invent data: the captured `value` is
// always a verbatim substring of a description yt-dlp returned.
const LINKHUB_HOSTS = [
  "bit.ly", "bitly.com", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly",
  "rb.gy", "shorturl.at", "lnk.to", "linktr.ee", "linktree.com", "beacons.ai",
  "beacons.page", "stan.store", "geni.us", "shopmy.us", "liketk.it", "ltk.app",
  "amzn.to", "amazon.com/shop", "koji.to", "milkshake.app", "campsite.bio",
  "solo.to", "carrd.co", "later.com/linkinbio", "linkin.bio", "flowcode.com",
  "snipfeed.co", "hoo.be", "withkoji.com", "taplink.cc", "allmylinks.com",
  "direct.me", "many.link", "lnk.bio", "shor.by", "linkpop.com", "kit.co",
];
const AFFIL_NETWORK_HOSTS = [
  "goaffpro.com", "refersion.com", "leaddyno.com", "revoffers.com",
  "shareasale.com", "impact.com", "avantlink.com", "pepperjam.com",
  "clickbank.net", "hop.clickbank.net", "cj.com", "anrdoezrs.net",
  "dpbolvw.net", "kqzyfj.com", "jdoqocy.com", "tkqlhce.com", "linksynergy.com",
  "rstyle.me", "sovrn.co", "viglink.com", "partnerize.com", "awin1.com",
  "trackdesk.com", "tapfiliate.com", "firstpromoter.com", "postaffiliatepro.com",
  "referralcandy.com", "uppromote.com", "affiliatly.com", "shrsl.com",
];
// Vendor watchlist. Seeded from
// .context/peptide-affiliate-offers.md plus common research-peptide sellers.
// Presence here is a WATCHLIST assertion by me, not a verified vendor claim.
const VENDOR_DOMAINS = [
  "certapeptides.com", "apollopeptidesciences.com", "apollopeptides.com",
  "retatrutide-rx.com", "peptidegrades.com", "ascensionpeptides.com",
  "viorahealthcare.com", "viora-healthcare.com", "promino-usa.com",
  "peptides-enhanced.com", "livewellpeptides.com", "glp1researchlab.com",
  "researchpeptides.io", "pppepz.com", "polygonpeptides.co",
  "pinnaclepeptidelabs.com", "peptira.com", "mlcrscty.com", "lyzelabs.com",
  "lonestarpeptideco.com", "journeypeptides.com", "idunpeptides.com",
  "everwellmedical.store", "blankpeptides.com", "bastionpeptides.com",
  "based-research.com", "aminoclub.com",
  // widely-referenced research-peptide / testing outfits
  "peptidesciences.com", "corepeptides.com", "limitlesslifenootropics.com",
  "swisschems.is", "swisschems.com", "biotechpeptides.com", "amino.shop",
  "polypeptide.com", "geopeptides.com", "modernaminos.com", "nootropicsdepot.com",
  "janoshik.com", "jano.bio", "peptidetest.com", "simecpeptides.com",
  "qingdaosigma.com", "rcsciences.com", "sarmsamerica.com", "amperefit.com",
  "peptideworldwide.com", "regenpeptides.com", "solutionpeptides.com",
  "usapeptides.com", "wolverinelabs.co", "primepeptides.co", "primepeptides.com",
  "nexuspeptides.com", "genxpeptide.com", "reganpeptides.com", "hlpeptide.com",
  "aminoasylum.gg", "aminoasylum.com", "purerawz.co", "sports-technology-labs.com",
  "loti-labs.com", "peptidesforsale.net", "empirepeptides.com",
  "phoenixpeptides.com", "titanpeptides.com", "elitepeptides.com",
  "bluebiopeptides.com", "novapeptides.com", "peptidepros.net",
  "hunterwilliamsonline.com", "musclechemistry.com", "peptidehub.com",
];
const PEPTIDEISH_TOKENS = [
  "peptide", "pepti", "reta", "trutide", "glp", "glp1", "semaglu", "tirzep",
  "bpc", "tb500", "ipamorelin", "cjc", "sermorelin", "aminos", "amino",
  "researchchem", "research", "chem", "labs", "biotech", "bioscience", "sarms",
];
const BIO_POINTER_PATTERNS = [
  /links?\s+in\s+(?:my\s+)?bio/gi,
  /(?:check|see)\s+(?:out\s+)?(?:my\s+)?bio/gi,
  /in\s+my\s+bio/gi,
  /links?\s+in\s+(?:the\s+)?description/gi,
  /(?:in|see)\s+the\s+description\s+below/gi,
  /links?\s+(?:are\s+)?below/gi,
  /linked\s+below/gi,
  /link\s+in\s+comments?/gi,
  /pinned\s+comment/gi,
  /first\s+comment/gi,
  /(?:dm|pm)\s+me\s+(?:for|to|if)/gi,
  /(?:email|message)\s+me\s+(?:for|to)/gi,
  /comment\s+["“']?[A-Za-z0-9 ]{2,20}["”']?\s+(?:below|and)/gi,
  /join\s+my\s+(?:discord|telegram|patreon)/gi,
];
const CODE_PATTERNS = [
  { re: /\b(?:discount|promo|coupon|referral|affiliate)\s*code\s*(?:is\s*)?[:\-–=]?\s*["“']?([A-Za-z0-9][A-Za-z0-9._\-]{1,24})/gi, why: "labelled discount/promo code" },
  { re: /\buse\s+(?:my\s+|the\s+|discount\s+|promo\s+|coupon\s+)*code\s*[:\-–=]?\s*["“']?([A-Za-z0-9][A-Za-z0-9._\-]{1,24})/gi, why: "\"use code X\"" },
  { re: /\bcode\s*[:\-–=]\s*["“']?([A-Za-z0-9][A-Za-z0-9._\-]{1,24})/gi, why: "\"code: X\"" },
  { re: /\bcode\s+["“']([A-Za-z0-9][A-Za-z0-9._\-]{1,24})["”']/gi, why: "quoted code" },
  { re: /\bcode\s+([A-Z0-9][A-Z0-9._\-]{2,24})\b/g, why: "\"code X\" (uppercase token)" },
  { re: /\buse\s+["“']?([A-Za-z0-9][A-Za-z0-9._\-]{1,24})["”']?\s+at\s+(?:the\s+)?check\s?out/gi, why: "\"use X at checkout\"" },
  { re: /\b([A-Z0-9][A-Z0-9._\-]{2,24})\s+at\s+(?:the\s+)?check\s?out/g, why: "\"X at checkout\"" },
  { re: /\b([A-Z0-9][A-Z0-9._\-]{2,24})\s+(?:for|to\s+get|and\s+get|gets?\s+you)\s+\d{1,2}(?:\.\d+)?\s*%\s*off/g, why: "\"X for N% off\"" },
  { re: /\bcoupon\s*[:\-–=]?\s*["“']?([A-Za-z0-9][A-Za-z0-9._\-]{1,24})/gi, why: "\"coupon X\"" },
];
const DISCOUNT_PHRASE_RE = /(?:\b\d{1,2}(?:\.\d+)?\s*%\s*(?:off|discount|savings?)\b|\bsave\s+\d{1,3}\s*%|\bsave\s+\$\d+|\b\$\d+\s*off\b|\bfree\s+shipping\b|\bbuy\s+one\s+get\s+one\b|\bbogo\b)/gi;
const CODE_STOPWORDS = new Set([
  "THE","AND","FOR","YOU","YOUR","THIS","THAT","WITH","FROM","HERE","BELOW",
  "ABOVE","LINK","LINKS","CODE","CODES","USE","GET","OFF","ALL","NEW","NOW",
  "MY","IS","AT","TO","OR","IN","ON","OF","IT","BE","AS","BY","IF","SO",
  "HTTP","HTTPS","WWW","COM","YOUTUBE","INSTAGRAM","AMAZON","DISCOUNT","PROMO",
  "COUPON","CHECKOUT","APPLIED","AUTOMATICALLY","WHEN","ANY","ORDER","ORDERS",
  "SITE","SHOP","STORE","FIRST","ONE","TWO","VIDEO","SUBSCRIBE","CHANNEL",
]);
const GENERIC_TLDS = "com|net|org|io|co|shop|store|us|to|me|ly|ee|link|bio|life|health|xyz|club|pro|app|cc|sh|gg|tv|is|ai|dev|site|online|space|world|fit|coach|clinic|care|md";

// ------------------------------------------------------------------ utils ---
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
let logStream;
function log(...a) {
  const line = `[${nowIso()}] ${a.join(" ")}`;
  console.log(line);
  try { logStream.write(line + "\n"); } catch { /* noop */ }
}
function ensureDirs() {
  for (const d of [ROOT, RAW_DIR, CACHE, CACHE_SEARCH, CACHE_CHANNEL, CACHE_DETAIL, CACHE_RESOLVE]) {
    fs.mkdirSync(d, { recursive: true });
  }
  logStream = fs.createWriteStream(LOG, { flags: "a" });
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

function runYtdlp(args, { timeoutMs = 600000 } = {}) {
  const r = spawnSync(YTDLP, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    timeout: timeoutMs,
    env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ""}` },
  });
  return {
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    status: r.status,
    error: r.error ? String(r.error) : null,
  };
}
function parseJsonl(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip unparseable */ }
  }
  return out;
}
const failures = [];
function fail(stage, target, reason, extra = {}) {
  const f = { stage, target, reason, at: nowIso(), ...extra };
  failures.push(f);
  log(`FAILURE [${stage}] ${target}: ${reason}`);
  return f;
}

// -------------------------------------------------- affiliate extraction ----
function trimUrl(u) {
  return u.replace(/[)\]}>.,;:!?'"“”]+$/g, "");
}
function hostOf(u) {
  try {
    const withProto = /^https?:\/\//i.test(u) ? u : `http://${u}`;
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
  } catch { return null; }
}
function snippet(text, idx, len, pad = 90) {
  const s = Math.max(0, idx - pad);
  const e = Math.min(text.length, idx + len + pad);
  return (s > 0 ? "…" : "") + text.slice(s, e).replace(/\s+/g, " ").trim() + (e < text.length ? "…" : "");
}
function classifyHost(h) {
  if (!h) return null;
  const notes = [];
  if (LINKHUB_HOSTS.some((x) => h === x || h.endsWith("." + x))) notes.push("link-in-bio / shortener host");
  if (AFFIL_NETWORK_HOSTS.some((x) => h === x || h.endsWith("." + x))) notes.push("affiliate-network host");
  const v = VENDOR_DOMAINS.find((x) => h === x || h.endsWith("." + x));
  if (v) notes.push(`matches peptide-vendor watchlist (${v})`);
  const tok = PEPTIDEISH_TOKENS.find((t) => h.replace(/[^a-z0-9]/g, "").includes(t));
  if (tok && !v) notes.push(`domain contains peptide-adjacent token "${tok}"`);
  return notes;
}
function extractAffiliateSignals(text) {
  const signals = [];
  if (!text) return signals;
  const seen = new Set();
  const push = (kind, value, idx, len, note) => {
    const key = `${kind}::${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const sig = { kind, value, context_snippet: snippet(text, idx, len) };
    if (note) sig.note = note;
    signals.push(sig);
  };

  // 1. explicit URLs
  const urlRe = /https?:\/\/[^\s<>"'`]+/gi;
  const fullHosts = new Set();
  for (let m; (m = urlRe.exec(text)); ) {
    const val = trimUrl(m[0]);
    if (!val) continue;
    const h = hostOf(val);
    if (h) fullHosts.add(h);
    const notes = classifyHost(h) || [];
    push("url", val, m.index, val.length, notes.length ? notes.join("; ") : "explicit http(s) url");
  }

  // 2. bare domains (no scheme) — curated hosts first, then generic
  const bareRe = new RegExp(String.raw`(?<![\w@/.])((?:[a-z0-9][a-z0-9-]{1,60}\.)+(?:${GENERIC_TLDS}))(\/[^\s<>"'\`]*)?(?![\w.-])`, "gi");
  for (let m; (m = bareRe.exec(text)); ) {
    const raw = trimUrl(m[0]);
    const h = hostOf(raw);
    if (!h) continue;
    const notes = classifyHost(h) || [];
    const isKnown = notes.length > 0;
    const hasPath = Boolean(m[2] && m[2].length > 1);
    // Skip generic no-path bare domains that we already saw as a full URL host.
    if (!isKnown && !hasPath && fullHosts.has(h)) continue;
    push("url", raw, m.index, raw.length, (isKnown ? notes.join("; ") + "; " : "") + "bare domain (no scheme) in description");
  }

  // 3. discount / affiliate codes
  for (const { re, why } of CODE_PATTERNS) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) {
      const val = (m[1] || "").replace(/[.,;:!?'"“”]+$/g, "");
      if (!val || val.length < 2) continue;
      if (CODE_STOPWORDS.has(val.toUpperCase())) continue;
      if (/^https?$/i.test(val)) continue;
      if (/^\d+$/.test(val) && val.length < 4) continue;
      push("code", val, m.index, m[0].length, why);
    }
  }

  // 4. bio / offsite pointers
  for (const re of BIO_POINTER_PATTERNS) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) {
      push("bio_pointer", m[0].replace(/\s+/g, " ").trim(), m.index, m[0].length, "call-to-action pointing offsite");
    }
  }

  // 5. discount phrasing without an attached code (extra kind, clearly labelled)
  DISCOUNT_PHRASE_RE.lastIndex = 0;
  for (let m; (m = DISCOUNT_PHRASE_RE.exec(text)); ) {
    push("discount_phrase", m[0].trim(), m.index, m[0].length, "offer phrasing (not one of the 3 base kinds)");
  }

  return signals;
}

// ------------------------------------------------------------- PASS A: search
function searchOnce(prefix, query) {
  const spec = `${prefix}${SEARCH_N}:${query}`;
  const file = path.join(CACHE_SEARCH, `${prefix}-${slug(query)}.jsonl`);
  const errFile = file.replace(/\.jsonl$/, ".err.txt");
  if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 0) {
    log(`cache hit  search ${spec}`);
    return { entries: parseJsonl(fs.readFileSync(file, "utf8")), cached: true };
  }
  log(`fetching   search ${spec}`);
  const r = runYtdlp([
    "--no-warnings", "--ignore-errors", "--skip-download",
    "--socket-timeout", "20", "--retries", "3",
    "--flat-playlist", "--dump-json", spec,
  ]);
  const entries = parseJsonl(r.stdout);
  if (entries.length === 0) {
    fs.writeFileSync(errFile, `status=${r.status}\nerror=${r.error}\n\n${r.stderr}`);
    fail("search", spec, "yt-dlp returned zero parseable JSON lines", {
      ytdlp_status: r.status,
      stderr_head: r.stderr.slice(0, 800),
    });
    return { entries: [], cached: false };
  }
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  if (r.stderr.trim()) fs.writeFileSync(errFile, r.stderr);
  log(`  -> ${entries.length} entries`);
  return { entries, cached: false };
}

// ---------------------------------------------------- seed channel resolving
async function resolveHandleViaHtml(handle) {
  const cacheFile = path.join(CACHE_RESOLVE, `${slug(handle)}.json`);
  if (!FORCE && fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  }
  const url = `https://www.youtube.com/@${handle}/videos`;
  const out = { handle, url, http_status: null, channel_id: null, display_name: null, subscriber_text: null, video_count_text: null, tabs: [], error: null };
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    out.http_status = res.status;
    const html = await res.text();
    const cid = html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/);
    if (cid) out.channel_id = cid[1];
    const og = html.match(/<meta property="og:title" content="([^"]*)"/);
    if (og) out.display_name = og[1];
    const subs = html.match(/"([\d.,]+[KMB]?)\s+subscribers"/);
    if (subs) out.subscriber_text = `${subs[1]} subscribers`;
    const vids = html.match(/"([\d.,]+[KMB]?)\s+videos?"/);
    if (vids) out.video_count_text = `${vids[1]} videos`;
    const yid = html.match(/var ytInitialData\s*=\s*(\{.*?\});<\/script>/s);
    if (yid) {
      try {
        const d = JSON.parse(yid[1]);
        const tabs = d?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
        out.tabs = tabs.map((t) => (t.tabRenderer || t.expandableTabRenderer || {}).title).filter(Boolean);
      } catch { /* leave tabs empty */ }
    }
  } catch (e) {
    out.error = String(e);
  }
  fs.writeFileSync(cacheFile, JSON.stringify(out, null, 2));
  return out;
}

function fetchChannelUploads(label, url, n) {
  const file = path.join(CACHE_CHANNEL, `${slug(label)}.jsonl`);
  if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 0) {
    log(`cache hit  channel ${label}`);
    return { entries: parseJsonl(fs.readFileSync(file, "utf8")), cached: true, url, stderr: "" };
  }
  log(`fetching   channel ${label} <- ${url}`);
  const r = runYtdlp([
    "--no-warnings", "--ignore-errors", "--skip-download",
    "--socket-timeout", "20", "--retries", "3",
    "--flat-playlist", "--playlist-end", String(n),
    "--dump-json", url,
  ]);
  const entries = parseJsonl(r.stdout);
  if (entries.length) {
    fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
  log(`  -> ${entries.length} entries`);
  return { entries, cached: false, url, stderr: r.stderr };
}

// ------------------------------------------------------------ PASS: detail --
function detailCachePath(id) { return path.join(CACHE_DETAIL, `${id}.json`); }
function fetchDetails(ids) {
  const missing = FORCE ? ids.slice() : ids.filter((id) => !fs.existsSync(detailCachePath(id)));
  log(`detail: ${ids.length} requested, ${ids.length - missing.length} cached, ${missing.length} to fetch`);
  const tmpBatch = path.join(CACHE, "_batch.txt");
  for (let i = 0; i < missing.length; i += DETAIL_BATCH) {
    const chunk = missing.slice(i, i + DETAIL_BATCH);
    fs.writeFileSync(tmpBatch, chunk.map((id) => `https://www.youtube.com/watch?v=${id}`).join("\n") + "\n");
    log(`detail batch ${Math.floor(i / DETAIL_BATCH) + 1}/${Math.ceil(missing.length / DETAIL_BATCH)} (${chunk.length} videos)`);
    const r = runYtdlp([
      "--no-warnings", "--ignore-errors", "--skip-download", "--no-playlist",
      "--socket-timeout", "20", "--retries", "3", "--sleep-requests", "1.5",
      "--dump-json", "-a", tmpBatch,
    ], { timeoutMs: 900000 });
    const got = new Set();
    for (const d of parseJsonl(r.stdout)) {
      if (!d.id) continue;
      fs.writeFileSync(detailCachePath(d.id), JSON.stringify(d));
      got.add(d.id);
    }
    for (const id of chunk) {
      if (!got.has(id)) {
        const m = r.stderr.match(new RegExp(`ERROR: \\[youtube\\] ${id}: ([^\\n]{0,300})`));
        fail("detail", id, m ? m[1] : "no JSON returned by yt-dlp --dump-json", { ytdlp_status: r.status });
      }
    }
    log(`  -> ${got.size}/${chunk.length} ok`);
  }
  const loaded = new Map();
  for (const id of ids) {
    const p = detailCachePath(id);
    if (fs.existsSync(p)) {
      try { loaded.set(id, JSON.parse(fs.readFileSync(p, "utf8"))); } catch { /* corrupt */ }
    }
  }
  return loaded;
}

// ------------------------------------------------------------------- main ---
async function main() {
  ensureDirs();
  const startedAt = nowIso();
  log("=== collect_youtube.mjs start ===");
  const ver = runYtdlp(["--version"]).stdout.trim() || "unknown";
  log(`yt-dlp ${ver}`);

  /** id -> { flat: <search/channel entry>, discovered_via: Set } */
  const found = new Map();
  const addFlat = (e, via) => {
    if (!e || !e.id) return;
    let rec = found.get(e.id);
    if (!rec) { rec = { flat: e, discovered_via: new Set() }; found.set(e.id, rec); }
    rec.discovered_via.add(via);
    // Prefer whichever flat record has a view_count present.
    if (rec.flat.view_count == null && e.view_count != null) rec.flat = e;
  };

  // ---------------- PASS A
  const queriesMeta = [];
  if (phaseOn("search")) {
    for (const q of QUERIES) {
      for (const prefix of ["ytsearch", "ytsearchdate"]) {
        const { entries } = searchOnce(prefix, q);
        entries.forEach((e) => addFlat(e, `${prefix}${SEARCH_N}:${q}`));
        queriesMeta.push({ query: q, spec: `${prefix}${SEARCH_N}:${q}`, results_returned: entries.length });
      }
    }
  } else {
    for (const f of fs.readdirSync(CACHE_SEARCH).filter((x) => x.endsWith(".jsonl"))) {
      const entries = parseJsonl(fs.readFileSync(path.join(CACHE_SEARCH, f), "utf8"));
      entries.forEach((e) => addFlat(e, `cache:${f}`));
      queriesMeta.push({ query: f, spec: `cache:${f}`, results_returned: entries.length });
    }
  }
  log(`after PASS A: ${found.size} unique video ids`);

  // ---------------- PASS B
  const channelsMeta = [];
  const seedChannelIds = new Set();
  if (phaseOn("channels")) {
    for (const seed of SEED_CHANNELS) {
      const meta = {
        given: seed.given,
        handle_tried: seed.handle,
        handle_url: `https://www.youtube.com/@${seed.handle}/videos`,
        resolved: false,
        channel_id: null,
        resolution_method: null,
        uploads_seen: 0,
        evidence: null,
      };
      // attempt 1: yt-dlp on the @handle/videos URL
      let res = fetchChannelUploads(`handle-${seed.handle}`, meta.handle_url, CHANNEL_UPLOADS_N);
      if (res.entries.length) {
        meta.resolved = true;
        meta.resolution_method = "yt-dlp @handle/videos";
      } else {
        // attempt 2: resolve handle -> channelId from the live handle page, then
        // retry via /channel/<id>/videos and the UU uploads playlist.
        const html = await resolveHandleViaHtml(seed.handle);
        meta.evidence = html;
        meta.channel_id = html.channel_id;
        if (html.channel_id) {
          res = fetchChannelUploads(`channel-${html.channel_id}`, `https://www.youtube.com/channel/${html.channel_id}/videos`, CHANNEL_UPLOADS_N);
          if (res.entries.length) { meta.resolved = true; meta.resolution_method = "handle page -> channelId -> /channel/<id>/videos"; }
          if (!meta.resolved) {
            const uu = "UU" + html.channel_id.slice(2);
            res = fetchChannelUploads(`uploads-${uu}`, `https://www.youtube.com/playlist?list=${uu}`, CHANNEL_UPLOADS_N);
            if (res.entries.length) { meta.resolved = true; meta.resolution_method = "handle page -> channelId -> UU uploads playlist"; }
          }
        }
      }
      if (meta.resolved) {
        res.entries.forEach((e) => addFlat(e, `channel:${seed.given}`));
        meta.uploads_seen = res.entries.length;
        const cid = res.entries.find((e) => e.channel_id)?.channel_id || meta.channel_id;
        if (cid) { meta.channel_id = cid; seedChannelIds.add(cid); }
      } else {
        fail("channel", seed.given, "could not list uploads for the given handle; NOT substituting another channel", {
          handle_url: meta.handle_url,
          handle_page_http_status: meta.evidence?.http_status ?? null,
          resolved_channel_id: meta.evidence?.channel_id ?? null,
          handle_page_display_name: meta.evidence?.display_name ?? null,
          handle_page_subscriber_text: meta.evidence?.subscriber_text ?? null,
          handle_page_video_count_text: meta.evidence?.video_count_text ?? null,
          handle_page_tabs: meta.evidence?.tabs ?? [],
          ytdlp_stderr_head: (res.stderr || "").slice(0, 400),
        });
      }
      channelsMeta.push(meta);
    }
  }
  log(`after PASS B: ${found.size} unique video ids`);

  // ---------------- DETAIL PASS
  const all = [...found.entries()].map(([id, rec]) => ({ id, ...rec }));
  const seedVideoIds = all.filter((r) => [...r.discovered_via].some((v) => v.startsWith("channel:"))).map((r) => r.id);
  const byViews = all
    .filter((r) => !seedVideoIds.includes(r.id))
    .sort((a, b) => (b.flat.view_count ?? -1) - (a.flat.view_count ?? -1))
    .map((r) => r.id);
  const detailIds = [...new Set([...seedVideoIds, ...byViews])].slice(0, Math.max(DETAIL_BUDGET, seedVideoIds.length));
  log(`detail target: ${detailIds.length} (seed-channel ${seedVideoIds.length} + top-by-view ${detailIds.length - seedVideoIds.length})`);
  const details = phaseOn("detail") ? fetchDetails(detailIds) : new Map();

  // ---------------- REBUILD RAW JSONL from cache (auditable, matches output)
  const rawOut = fs.createWriteStream(OUT_RAW, { flags: "w" });
  const writeRaw = (obj) => rawOut.write(JSON.stringify(obj) + "\n");
  let rawCount = 0;
  for (const dir of [CACHE_SEARCH, CACHE_CHANNEL]) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) {
      for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        try {
          const o = JSON.parse(t);
          writeRaw({ _raw_source: `${path.basename(dir)}/${f}`, _raw_kind: "yt-dlp --flat-playlist --dump-json", ...o });
          rawCount++;
        } catch { /* skip */ }
      }
    }
  }
  for (const f of fs.readdirSync(CACHE_DETAIL).filter((x) => x.endsWith(".json")).sort()) {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(CACHE_DETAIL, f), "utf8"));
      writeRaw({ _raw_source: `detail/${f}`, _raw_kind: "yt-dlp --dump-json (single video)", ...o });
      rawCount++;
    } catch { /* skip */ }
  }
  await new Promise((res) => rawOut.end(res));
  log(`raw jsonl rebuilt: ${rawCount} lines -> ${OUT_RAW}`);

  // ---------------- BUILD posts
  const posts = [];
  for (const rec of all) {
    const d = details.get(rec.id);
    const flat = rec.flat;
    const src = d ? "yt-dlp --dump-json (single video)" : "yt-dlp --flat-playlist --dump-json (search/channel listing)";
    const descFull = d ? (d.description ?? null) : null;
    const descSnippet = flat.description ?? null;
    const descForExtraction = descFull ?? descSnippet ?? "";
    const missing = [];
    const pick = (key, flatKey = key) => {
      if (d && d[key] !== undefined && d[key] !== null) return d[key];
      if (flat[flatKey] !== undefined && flat[flatKey] !== null) return flat[flatKey];
      missing.push(key);
      return null;
    };
    const post = {
      id: rec.id,
      url: d?.webpage_url || flat.url || `https://www.youtube.com/watch?v=${rec.id}`,
      title: pick("title"),
      description: descFull,
      description_snippet_from_search: descFull ? null : descSnippet,
      description_source: descFull
        ? "full description from yt-dlp --dump-json"
        : descSnippet
          ? "TRUNCATED snippet from --flat-playlist (NOT the full description)"
          : null,
      channel: pick("channel"),
      channel_id: pick("channel_id"),
      channel_url: pick("channel_url"),
      channel_follower_count: d?.channel_follower_count ?? null,
      upload_date: d?.upload_date ?? null,
      duration: pick("duration"),
      view_count: pick("view_count"),
      like_count: d?.like_count ?? null,
      comment_count: d?.comment_count ?? null,
      tags: d?.tags ?? null,
      categories: d?.categories ?? null,
      thumbnail: d?.thumbnail ?? (Array.isArray(flat.thumbnails) && flat.thumbnails.length ? flat.thumbnails[flat.thumbnails.length - 1].url : null),
      was_live: d?.was_live ?? null,
      availability: d?.availability ?? flat.availability ?? null,
      affiliate_signals: extractAffiliateSignals(descForExtraction),
      _detail_fetched: Boolean(d),
      _metric_source: src,
      _discovered_via: [...rec.discovered_via],
      _from_seed_channel: [...rec.discovered_via].some((v) => v.startsWith("channel:")),
      _null_fields_reason: null,
    };
    if (!d) {
      post._null_fields_reason =
        "not in the --dump-json detail budget; --flat-playlist search/channel listings do not return upload_date, like_count, comment_count, tags, categories, channel_follower_count, was_live, or the full description. Re-run with a larger DETAIL_BUDGET to fill these.";
    } else {
      const nulls = ["upload_date", "like_count", "comment_count", "tags", "categories", "channel_follower_count", "was_live", "availability"].filter((k) => post[k] == null);
      if (nulls.length) post._null_fields_reason = `yt-dlp --dump-json did not return: ${nulls.join(", ")} (field absent/hidden by YouTube for this video)`;
    }
    posts.push(post);
  }
  posts.sort((a, b) => (b.view_count ?? -1) - (a.view_count ?? -1));

  // ---------------- BUILD creators
  const creatorMap = new Map();
  for (const p of posts) {
    if (!p.channel_id) continue;
    let c = creatorMap.get(p.channel_id);
    if (!c) {
      c = {
        handle: null, channel_id: p.channel_id, url: p.channel_url || null,
        display_name: p.channel || null, follower_count: null,
        video_count_seen: 0, follower_count_source: null, is_seed_channel: false,
      };
      creatorMap.set(p.channel_id, c);
    }
    c.video_count_seen++;
    if (!c.url && p.channel_url) c.url = p.channel_url;
    if (!c.display_name && p.channel) c.display_name = p.channel;
    if (c.follower_count == null && p.channel_follower_count != null) {
      c.follower_count = p.channel_follower_count;
      c.follower_count_source = `yt-dlp --dump-json on video ${p.id}`;
    }
    if (seedChannelIds.has(p.channel_id)) c.is_seed_channel = true;
  }
  // handles come from raw uploader_id (@handle) when yt-dlp gave one
  for (const rec of all) {
    const uid = rec.flat.uploader_id || details.get(rec.id)?.uploader_id;
    const cid = rec.flat.channel_id || details.get(rec.id)?.channel_id;
    if (uid && cid && creatorMap.has(cid) && !creatorMap.get(cid).handle && String(uid).startsWith("@")) {
      creatorMap.get(cid).handle = String(uid);
    }
  }
  const creators = [...creatorMap.values()].sort((a, b) => b.video_count_seen - a.video_count_seen);
  for (const c of creators) {
    if (c.follower_count == null) c.follower_count_source = "null — no video from this channel was in the --dump-json detail budget, and --flat-playlist does not return channel_follower_count";
  }

  // ---------------- WRITE
  const out = {
    platform: "youtube",
    collected_at: runYtdlp(["--version"]).status === 0 ? nowIso() : nowIso(),
    method: `yt-dlp ${ver}`,
    collection_started_at: startedAt,
    integrity: {
      rule: "every numeric metric in this file is copied verbatim from a yt-dlp JSON response also present in raw/youtube.raw.jsonl; nothing is estimated or inferred",
      raw_jsonl: OUT_RAW,
      raw_jsonl_lines: rawCount,
      scrapecreators_used: false,
      detail_budget: DETAIL_BUDGET,
      posts_with_full_detail: posts.filter((p) => p._detail_fetched).length,
      posts_flat_only: posts.filter((p) => !p._detail_fetched).length,
      affiliate_signal_kinds: ["url", "code", "bio_pointer", "discount_phrase (extra kind, offer phrasing with no code attached)"],
    },
    queries: queriesMeta,
    channels: channelsMeta,
    creators,
    posts,
    failures,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  log(`WROTE ${OUT_JSON}`);
  log(`posts=${posts.length} detail=${out.integrity.posts_with_full_detail} creators=${creators.length} failures=${failures.length}`);
  log("=== done ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
