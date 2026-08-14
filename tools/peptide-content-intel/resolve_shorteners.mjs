#!/usr/bin/env node
/* Resolve shortened / redirecting affiliate URLs to their real destination.
 * 31 bit.ly and 21 amzn.to links in the corpus hide where the money goes, so
 * without this the brand attribution has a blind spot exactly where affiliate
 * links are most likely to be. Cached; safe to re-run. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = '/Users/alexweinstein/conductor/workspaces/Quickstart/moroni/.context/peptide-content-intel';
const CACHE = `${ROOT}/cache/redirects.json`;
const SHORTENER = /^(bit\.ly|amzn\.to|a\.co|tinyurl\.com|t\.co|ow\.ly|rb\.gy|shorturl\.at|geni\.us|lnk\.to|linktw\.in|rebrand\.ly|cutt\.ly|is\.gd|buff\.ly|trib\.al|smarturl\.it|drbrg\.co|nbcnews\.to|hubs\.ly|shrsl\.com|glnk\.io|magic\.ly)$/i;

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const data = JSON.parse(fs.readFileSync(`${ROOT}/intel-data.json`, 'utf8'));

const targets = new Map();
for (const p of data.posts) {
  for (const s of p.affiliate_signals || []) {
    if (s.kind !== 'url') continue;
    let host;
    try { host = new URL(/^https?:\/\//i.test(s.value) ? s.value : 'https://' + s.value).hostname.replace(/^www\./, ''); } catch { continue; }
    if (SHORTENER.test(host) && !targets.has(s.value)) targets.set(s.value, host);
  }
}
console.log(`${targets.size} shortened URLs to resolve (${Object.keys(cache).length} cached)`);

let n = 0, fresh = 0;
for (const [url, host] of targets) {
  n++;
  if (cache[url]) continue;
  const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-L', '--max-time', '20',
    '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    '-w', '%{url_effective}\t%{http_code}', url], { encoding: 'utf8' });
  const [eff, code] = (r.stdout || '').split('\t');
  let finalHost = null;
  try { finalHost = new URL(eff).hostname.replace(/^www\./, ''); } catch {}
  cache[url] = { shortener: host, final_url: eff || null, final_host: finalHost, http_status: code ? Number(code) : null };
  fresh++;
  if (fresh % 10 === 0) {
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    console.log(`  ${n}/${targets.size} (${fresh} fresh)`);
  }
}
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));

const byFinal = {};
for (const v of Object.values(cache)) {
  if (!v.final_host) continue;
  byFinal[v.final_host] = (byFinal[v.final_host] || 0) + 1;
}
console.log(`\nresolved ${Object.keys(cache).length} total. Destinations:`);
Object.entries(byFinal).sort((a, b) => b[1] - a[1]).slice(0, 30)
  .forEach(([h, c]) => console.log(`  ${String(c).padStart(3)}x ${h}`));
