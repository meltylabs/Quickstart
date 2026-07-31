import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const RESEARCH = new URL("biologix-strategy-board/research/", ROOT);

async function loadMarketingWatch() {
  const source = await readFile(
    new URL("noli-marketing-watch-data.js", RESEARCH),
    "utf8",
  );
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.NOLI_MARKETING_WATCH;
}

test("marketing watch keeps exact-domain ad evidence and scoped absence language", async () => {
  const data = await loadMarketingWatch();
  const rows = Object.values(data.byDomain);
  const ads = rows.flatMap((row) =>
    (row.adMonitoring?.verifiedAds || []).map((ad) => ({
      domain: row.domain,
      ...ad,
    }))
  );

  assert.equal(rows.length, 18);
  assert.equal(data.stats.verifiedAdsObserved, 4);
  assert.equal(data.stats.companiesWithVerifiedAds, 3);
  assert.equal(ads.length, 4);
  assert.deepEqual(
    [...new Set(ads.map((ad) => ad.platform))],
    ["Microsoft/Bing"],
  );
  assert.ok(
    ads.every((ad) =>
      new URL(ad.destinationUrl).hostname
        .toLowerCase()
        .replace(/^www\./, "") === ad.domain
    ),
  );
  assert.match(data.methodology.ads, /No result means only no ad observed/i);
  assert.match(data.methodology.trafficSources, /not traffic-source percentages/i);
});

test("automatic collector fails closed on redirects, weak pages, and Snap collisions", async () => {
  const [collector, refresher, component] = await Promise.all([
    readFile(new URL("scripts/collect-noli-marketing-watch.mjs", ROOT), "utf8"),
    readFile(new URL("scripts/refresh-noli-marketing-watch.mjs", ROOT), "utf8"),
    readFile(
      new URL(
        "biologix-strategy-board/research/noli-competitor-intelligence.js",
        ROOT,
      ),
      "utf8",
    ),
  ]);

  assert.match(collector, /\[301, 302, 303, 307, 308\]/);
  assert.match(collector, /assertPublicHttpUrl/);
  assert.match(collector, /refused non-public network target/);
  assert.match(collector, /function pinnedRequest/);
  assert.match(collector, /lookup: \(_hostname, lookupOptions, callback\)/);
  assert.match(collector, /0:0:0:0:0:ffff/);
  assert.match(collector, /expectedDomain: company\.domain/);
  assert.match(collector, /block, login, or verification page/);
  assert.match(
    collector,
    /candidate\.payerMatch && candidate\.exactDestination/,
  );
  assert.match(collector, /web_view_properties\\\.url/);
  assert.match(collector, /dpa_preview\\\.items/);
  assert.match(collector, /destinationField: detailedDestination\.fieldPath/);
  assert.doesNotMatch(collector, /extractObjectUrls/);

  assert.match(refresher, /current\.status !== "reachable"/);
  assert.match(refresher, /withGoogleAdsTag: observable\.filter/);
  assert.match(refresher, /status: "stale-preserved"/);

  assert.match(component, /marketingJsonPath/);
  assert.match(component, /adsByPlatform/);
  assert.doesNotMatch(component, /Historical Bing\/EEA observations/);
});
