#!/usr/bin/env node
/* Enrich TikTok accounts with bio + bio link + follower count, then keep ONLY
 * individual civilian creators who carry an affiliate link.
 *
 * Target shape is @gretatrutide: a normal person, small following, posting her
 * own peptide experience, with an affiliate link in bio
 * (https://spartanbiolab.com/?ref=GRETA).
 *
 * Explicitly EXCLUDED per spec:
 *   - companies / vendor-operated accounts (@trutide: "Premium UK research
 *     supply", 5 followers -> it is the seller, not a creator)
 *   - clinicians and credentialed professionals (MD/DO/RN/NP/PA/RD/PhD/coach)
 *   - clinics, med spas, telehealth brands
 *
 * The profile HTML contains a literal "Couldn't find this account" string even on
 * pages that resolve fine, so that string is NOT used as a failure signal. The
 * embedded JSON is what matters.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const CACHE = `${ROOT}/cache/tt-profile.json`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

// --- exclusion / inclusion signals -------------------------------------------
// Substring, NOT word-boundary: "kendberrymd" and "theglp1nurse" have no
// boundary before the credential and slipped through a \b-based classifier.
const CLINICIAN = /(\bmd\b|md$|^dr|\bdr\.?\s|doctor|physician|surgeon|\brn\b|rn$|nurse|\bnp\b|\bpa-?c\b|\brd\b|rd$|dietit|pharmacist|pharmd|\bphd\b|clinician|practitioner|chiropract|\bdc\b|naturopath|\bdo\b$)/i;
const COMPANY = /(supply|supplies|official|\bshop\b|\bstore\b|\bhq\b|\binc\b|\bllc\b|\bltd\b|\bco\.\b|labs?\b|laborator|solutions|group|brand|clinic|medspa|med spa|telehealth|pharmacy|wholesale|distribut|vendor|dispatch|tested stock|research supply|we ship|order now|worldwide shipping|dm to order|\bteam\b)/i;
const COACH = /(coach|coaching|trainer|\bcpt\b|nutritionist|mentor|consultant|program|academy|\bfitness pro\b)/i;
// A civilian talking about their own experience.
const CIVILIAN_VOICE = /(\bmy\b|\bi\b|\bme\b|journey|down \d+|sw ?\d+|cw ?\d+|gw ?\d+|lost \d+|mom|mum|wife|husband|girl|guy|\bhsv\b|starting weight|current weight|goal weight|week \d+|day \d+)/i;
// An affiliate link, not just any link.
const AFFIL_PARAM = /[?&](ref|aff|affiliate|a|via|code|coupon|promo|rfsn|utm_source|partner|referral|discount)=/i;
// Referral links are not always query params: refer.boltpharmacy.co.uk/w.pickering
// encodes the affiliate in the SUBDOMAIN and PATH.
const AFFIL_PATH = /(^|\.)(refer|referral|invite|partner|share|go|track|click|link)\.|\/(ref|refer|invite|partner|r)\/[A-Za-z0-9._-]+/i;
// A discount code offered in the bio is itself affiliate evidence.
const CODE_IN_BIO = /\b(?:code|coupon|promo)\b\s*[:=]?\s*"?[A-Za-z0-9][A-Za-z0-9_-]{1,18}"?|\b\d{1,2}\s?%\s?off\b|£\d+\s?off|\$\d+\s?off/i;
const VENDORISH = /(peptide|peptid|pept|reta|trutide|glp|tirz|sema|biolab|bio-?lab|labs?\.|research|chem|nootrop|sarm)/i;

function fetchProfile(h) {
  if (cache[h]) return cache[h];
  const r = spawnSync('curl', ['-sS', '--max-time', '30', '-A', UA, `https://www.tiktok.com/@${h}`],
    { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  const html = r.stdout || '';
  const grab = (re) => { const m = html.match(re); return m ? m[1] : null; };
  const numOf = (re) => { const m = html.match(re); return m ? Number(m[1]) : null; };
  const out = {
    handle: h,
    html_bytes: html.length,
    nickname: grab(/"nickname":"((?:[^"\\]|\\.)*)"/),
    bio: grab(/"signature":"((?:[^"\\]|\\.)*)"/),
    bio_link: grab(/"bioLink":\{"link":"([^"]*)"/),
    followers: numOf(/"followerCount":(\d+)/),
    following: numOf(/"followingCount":(\d+)/),
    hearts: numOf(/"heartCount":(\d+)/),
    videos: numOf(/"videoCount":(\d+)/),
    verified: /"verified":true/.test(html) || null,
    private: /"privateAccount":true/.test(html) || null,
  };
  // TikTok embeds URLs with \u002F escapes. Leaving them escaped made curl
  // receive a malformed URL (status 0, host parsed as "u002f").
  const unesc = (v) => {
    if (!v) return v;
    let t = String(v).replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\n/g, '\n');
    try { t = JSON.parse('"' + t.replace(/(?<!\\)"/g, '\\"') + '"'); } catch {}
    return t;
  };
  out.bio = unesc(out.bio);
  out.bio_link = unesc(out.bio_link);
  out.nickname = unesc(out.nickname);
  cache[h] = out;
  return out;
}

// resolve a bio link to its destination so a linktree/shortener still yields the vendor
function resolveLink(u) {
  if (!u) return null;
  const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-L', '--max-time', '20', '-A', UA,
    '-w', '%{url_effective}\t%{http_code}', u], { encoding: 'utf8' });
  const [eff, code] = (r.stdout || '').split('\t');
  let host = null;
  try { host = new URL(eff).hostname.replace(/^www\./, ''); } catch {}
  return { final_url: eff || null, final_host: host, http_status: code ? Number(code) : null };
}

const disc = JSON.parse(fs.readFileSync(`${ROOT}/raw/tiktok-discovered.json`, 'utf8'));
const MIN_FOLLOWERS = Number(process.env.MIN_FOLLOWERS || 250);

const rows = [];
let i = 0;
for (const c of disc.creators) {
  i++;
  const p = fetchProfile(c.handle);
  if (i % 8 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));

  const bio = p.bio || '';
  const nick = p.nickname || '';
  // Strip URLs and discount-code boilerplate before judging identity.
  const bioNoUrls = bio
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[a-z0-9-]{2,40}\.(?:com|co\.uk|co|io|net|org|shop|store|app|nl|is|de|eu|us)\b\S*/gi, ' ')
    .replace(/\bcode\b\s*"?[A-Za-z0-9]+"?/gi, ' ');
  const idText = `${c.handle} ${nick} ${bioNoUrls}`;
  const captions = (c.posts || []).map((x) => x.caption || '').join(' ');

  // affiliate evidence: a bio link with an affiliate param, or a vendor domain
  // anywhere in bio/captions
  let linkInfo = null;
  let aggregatorLinks = [];
  if (p.bio_link) {
    linkInfo = resolveLink(p.bio_link);
    // beacons.ai / linktr.ee hide the real destinations one level down
    if (/beacons\.ai|linktr\.ee|stan\.store|link\.me|allmylinks|snipfeed|komi\.io/i.test(p.bio_link)) {
      const r = spawnSync('curl', ['-sS', '--max-time', '25', '-A', UA, p.bio_link],
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      const html = r.stdout || '';
      const found = new Set();
      for (const m of html.matchAll(/https?:\\?\/\\?\/([a-z0-9.-]+\.[a-z]{2,})([^"'\s\\<]*)/gi)) {
        const host = m[1].replace(/^www\./, '');
        if (/beacons|linktr|tiktok|instagram|youtube|facebook|twitter|x\.com|google|gstatic|cloudflare|fontawesome|amazonaws|cdn|apple|spotify/i.test(host)) continue;
        found.add(host + (m[2] || '').slice(0, 60));
      }
      aggregatorLinks = [...found].slice(0, 12);
    }
  }
  const linkAll = [p.bio_link, linkInfo && linkInfo.final_url, ...aggregatorLinks].filter(Boolean).join(' ');
  const hasAffilParam = AFFIL_PARAM.test(linkAll) || AFFIL_PATH.test(linkAll);
  const vendorDomainInLink = VENDORISH.test(linkAll);
  const vendorInCaption = /\b[a-z0-9-]{3,40}\.(?:com|co\.uk|co|io|net|shop|store|nl|is)\b/i.test(captions) && VENDORISH.test(captions);
  const codeInBio = CODE_IN_BIO.test(bio);
  const hasAffiliate = hasAffilParam || vendorDomainInLink || vendorInCaption || codeInBio;

  const reasons = [];
  if (CLINICIAN.test(idText)) reasons.push('clinician or credentialed professional');
  if (COMPANY.test(idText)) reasons.push('company / vendor-operated account');
  if (COACH.test(idText)) reasons.push('coach / consultant / program seller');
  if (p.private) reasons.push('private account');
  if (p.followers != null && p.followers < MIN_FOLLOWERS) {
    reasons.push(`only ${p.followers} followers - below the ${MIN_FOLLOWERS} floor, which is the signature of a vendor-run posting account rather than a person`);
  }

  rows.push({
    handle: c.handle,
    profile_url: `https://www.tiktok.com/@${c.handle}`,
    nickname: nick || null,
    bio: bio || null,
    followers: p.followers ?? null,
    following: p.following ?? null,
    videos: p.videos ?? null,
    bio_link: p.bio_link || null,
    bio_link_resolves_to: linkInfo ? linkInfo.final_host : null,
    bio_link_final_url: linkInfo ? linkInfo.final_url : null,
    bio_link_status: linkInfo ? linkInfo.http_status : null,
    aggregator_outbound_links: aggregatorLinks,
    has_affiliate_param: hasAffilParam,
    discount_code_in_bio: codeInBio || false,
    affiliate_evidence: hasAffilParam ? 'bio link carries an affiliate parameter or referral path'
      : vendorDomainInLink ? 'bio link resolves to a vendor domain'
      : codeInBio ? 'discount code or money-off offer stated in bio'
      : vendorInCaption ? 'vendor domain named in captions'
      : null,
    civilian_voice: CIVILIAN_VOICE.test(`${bio} ${captions}`),
    on_topic_captions: c.on_topic_captions,
    posts_seen: c.posts_seen,
    median_views: c.median_views,
    max_views: c.max_views,
    outlier_multiple: c.outlier_multiple,
    total_reposts: c.total_reposts,
    exclusion_reasons: reasons,
    qualifies: reasons.length === 0 && hasAffiliate,
    qualifies_but_no_affiliate: reasons.length === 0 && !hasAffiliate,
  });
  const tag = rows[rows.length - 1].qualifies ? 'QUALIFIES' : (reasons.length ? 'excluded' : 'no-affiliate');
  console.log(`  ${tag.padEnd(12)} @${c.handle.padEnd(26)} f=${String(p.followers ?? '?').padStart(7)}  ${(p.bio_link || '').slice(0, 46)}`);
}
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));

const q = rows.filter((r) => r.qualifies);
const nearMiss = rows.filter((r) => r.qualifies_but_no_affiliate);
fs.writeFileSync(`${ROOT}/raw/tiktok-civilians.json`, JSON.stringify({
  platform: 'tiktok', cohort: 'individual_civilian_affiliate',
  spec: 'Individual people posting their own peptide/GLP-1 experience who carry an affiliate link. Excludes companies, vendor-operated accounts, clinics, and credentialed clinicians or coaches.',
  min_followers: MIN_FOLLOWERS,
  reference_example: { handle: 'gretatrutide', bio_link: 'https://spartanbiolab.com/?ref=GRETA', followers: 1361 },
  probed: rows.length, qualifies: q.length, qualifies_but_no_affiliate: nearMiss.length,
  creators: rows.sort((a, b) => (b.qualifies - a.qualifies) || ((b.max_views || 0) - (a.max_views || 0))),
}, null, 2));
console.log(`\nQUALIFIES: ${q.length} | near-miss (civilian but no affiliate link found): ${nearMiss.length} | excluded: ${rows.length - q.length - nearMiss.length}`);
