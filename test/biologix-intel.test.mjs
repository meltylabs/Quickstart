import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateReport,
  buildObservations,
  clusterProbableBaskets,
  detectPublicTechnology,
  detectTrackers,
  diffObservations,
  inventorySummary,
  parseSitemapIndex,
  parseStockQuantity,
  summarizeUrlset,
} from "../src/biologix-intel-core.js";

function product(overrides = {}) {
  return {
    id: 1,
    parent: 0,
    name: "Example",
    type: "simple",
    variation: "",
    sku: "SKU-1",
    prices: { price: "1000", regular_price: "1000", sale_price: "1000" },
    stock_availability: { text: "10 in stock" },
    is_in_stock: true,
    is_on_backorder: false,
    is_purchasable: true,
    permalink: "https://example.com/product/example",
    ...overrides,
  };
}

test("stock parsing distinguishes exact, unknown, and out of stock", () => {
  assert.equal(parseStockQuantity("17 in stock (can be backordered)", true), 17);
  assert.equal(parseStockQuantity("In stock", true), null);
  assert.equal(parseStockQuantity("Out of stock", false), 0);
});

test("variable parent stock is not double-counted when children are exact", () => {
  const parent = product({
    id: 10,
    type: "variable",
    stock_availability: { text: "20 in stock" },
  });
  const variation = product({
    id: 11,
    parent: 10,
    type: "variation",
    variation: "Amount: 10mg",
    stock_availability: { text: "7 in stock" },
  });
  const observations = buildObservations([parent], [variation], []);
  const summary = inventorySummary(observations);
  assert.equal(summary.exact_inventory_units, 7);
  assert.equal(summary.displayed_inventory_value_cents, 7000);
  assert.equal(observations.find((item) => item.key === "product:10").track_inventory, false);
});

test("inventory deltas and synchronized timestamps form an inferred basket", () => {
  const previous = buildObservations([product()], [], [
    { id: 1, modified_gmt: "2026-07-25T00:00:00Z" },
  ]);
  const current = buildObservations(
    [
      product({ stock_availability: { text: "9 in stock" } }),
      product({
        id: 2,
        sku: "SKU-2",
        name: "Second",
        prices: { price: "2000" },
        stock_availability: { text: "4 in stock" },
      }),
    ],
    [],
    [
      { id: 1, modified_gmt: "2026-07-25T00:05:01Z" },
      { id: 2, modified_gmt: "2026-07-25T00:05:04Z" },
    ],
  );
  const previousMap = Object.fromEntries(previous.map((item) => [item.key, item]));
  previousMap["product:2"] = {
    ...current.find((item) => item.key === "product:2"),
    stock_quantity: 5,
  };
  const events = diffObservations(
    previousMap,
    current,
    "2026-07-25T00:05:10Z",
  );
  const baskets = clusterProbableBaskets(
    events,
    "2026-07-25T00:00:00Z",
    "2026-07-25T00:05:10Z",
  );
  assert.equal(events.filter((event) => event.event_type === "inventory_decrease").length, 2);
  assert.equal(baskets.length, 1);
  assert.equal(baskets[0].unit_count, 2);
  assert.equal(baskets[0].displayed_value_cents, 3000);
});

test("tracker and public technology detection is deterministic", () => {
  const html = `
    <script>gtag('config', 'G-ABCDEF12'); fbq('init', '123456789');</script>
    <style>/wp-content/plugins/* should not become a plugin name</style>
    <link href="/wp-content/plugins/woocommerce/a.css">
    <link href="/wp-content/themes/woostify/a.css">
  `;
  assert.deepEqual(detectTrackers(html), [
    { provider: "google_analytics", public_id: "G-ABCDEF12" },
    { provider: "meta_pixel", public_id: "123456789" },
  ]);
  assert.deepEqual(
    detectPublicTechnology(html, { server: "cloudflare", platform: "hostinger" }),
    {
      technologies: ["cloudflare", "hostinger", "woocommerce", "wordpress"],
      plugins: ["woocommerce"],
      themes: ["woostify"],
    },
  );
});

test("sitemap parsers count public pages without retaining page contents", () => {
  const index = `
    <sitemapindex>
      <sitemap><loc>https://example.com/a.xml</loc><lastmod>2026-01-01</lastmod></sitemap>
      <sitemap><loc>https://example.com/b.xml</loc></sitemap>
    </sitemapindex>
  `;
  assert.equal(parseSitemapIndex(index).length, 2);
  const urlset = `
    <urlset>
      <url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://example.com/b</loc><lastmod>2026-02-01</lastmod></url>
    </urlset>
  `;
  assert.deepEqual(summarizeUrlset(urlset), {
    url_count: 2,
    latest_lastmod: "2026-02-01",
  });
});

test("reports retain evidence boundaries and never call inventory a paid sale", () => {
  const state = {
    latest_snapshot: { captured_at: "2026-07-25T01:00:00Z" },
    public_site_signals: { traffic_truth: { visitor_counts_publicly_available: false } },
  };
  const days = [
    {
      snapshots: [{ captured_at: "2026-07-25T01:00:00Z" }],
      events: [
        {
          observed_at: "2026-07-25T01:00:00Z",
          event_type: "inventory_decrease",
          quantity_delta: -2,
          displayed_value_cents: 5000,
        },
      ],
      baskets: [],
    },
  ];
  const report = aggregateReport(days, state, "2026-07-25T00:00:00Z");
  assert.equal(report.movement.observed_units_down, 2);
  assert.equal(report.movement.displayed_price_gmv_signal_cents, 5000);
  assert.equal(report.traffic.direct_visitor_counts_available, false);
  assert.match(report.evidence_boundary.unavailable, /cannot prove payment/);
});
