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
} from "../lib/biologix-intel-core.js";
import { freshPublicUrl } from "../lib/collector.js";

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

test("existing stock parsing remains intact", () => {
  assert.equal(parseStockQuantity("17 in stock (can be backordered)", true), 17);
  assert.equal(parseStockQuantity("In stock", true), null);
  assert.equal(parseStockQuantity("Out of stock", false), 0);
});

test("existing catalog cache key rotates once per poll window", () => {
  const url = "https://example.com/wp-json/wc/store/v1/products?per_page=100";
  const first = freshPublicUrl(url, Date.UTC(2026, 6, 25, 12, 1));
  const sameWindow = freshPublicUrl(url, Date.UTC(2026, 6, 25, 12, 14));
  const nextWindow = freshPublicUrl(url, Date.UTC(2026, 6, 25, 12, 15));
  assert.equal(first, sameWindow);
  assert.notEqual(first, nextWindow);
});

test("existing observation and probable-basket logic remains intact", () => {
  const previous = buildObservations([product()], [], [
    { id: 1, modified_gmt: "2026-07-25T00:00:00Z" },
  ]);
  const current = buildObservations(
    [
      product({ stock_availability: { text: "9 in stock" } }),
      product({
        id: 2,
        sku: "SKU-2",
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
  const events = diffObservations(previousMap, current, "2026-07-25T00:05:10Z");
  const baskets = clusterProbableBaskets(
    events,
    "2026-07-25T00:00:00Z",
    "2026-07-25T00:05:10Z",
  );
  assert.equal(inventorySummary(current).exact_inventory_units, 13);
  assert.equal(baskets.length, 1);
  assert.equal(baskets[0].displayed_value_cents, 3000);
});

test("existing tracker, technology and sitemap parsing remains intact", () => {
  const html = `
    <script>gtag('config', 'G-ABCDEF12'); fbq('init', '123456789');</script>
    <link href="/wp-content/plugins/woocommerce/a.css">
    <link href="/wp-content/themes/woostify/a.css">
  `;
  assert.equal(detectTrackers(html).length, 2);
  assert.deepEqual(
    detectPublicTechnology(html, { server: "cloudflare", platform: "hostinger" }),
    {
      technologies: ["cloudflare", "hostinger", "woocommerce", "wordpress"],
      plugins: ["woocommerce"],
      themes: ["woostify"],
    },
  );
  assert.equal(
    parseSitemapIndex("<sitemapindex><sitemap><loc>https://x.test/a.xml</loc></sitemap></sitemapindex>").length,
    1,
  );
  assert.equal(
    summarizeUrlset("<urlset><url><loc>https://x.test/a</loc></url></urlset>").url_count,
    1,
  );
});

test("existing report keeps the paid-sale evidence boundary", () => {
  const report = aggregateReport(
    [{
      snapshots: [{ captured_at: "2026-07-25T01:00:00Z" }],
      events: [{
        observed_at: "2026-07-25T01:00:00Z",
        event_type: "inventory_decrease",
        quantity_delta: -2,
        displayed_value_cents: 5000,
      }],
      baskets: [],
    }],
    { latest_snapshot: { captured_at: "2026-07-25T01:00:00Z" } },
    "2026-07-25T00:00:00Z",
  );
  assert.equal(report.movement.observed_units_down, 2);
  assert.match(report.evidence_boundary.unavailable, /cannot prove payment/);
});
