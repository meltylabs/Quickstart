import assert from "node:assert/strict";
import test from "node:test";

import {
  isPublicIp,
  parseCronSlot,
  sanitizePublicPayload,
  validateTargetUrl,
} from "../lib/observatory-core.js";
import { fetchBoundedPublic } from "../lib/observatory-fetch.js";
import {
  OBSERVATORY_TARGETS,
  assertTargetRegistry,
  targetsForShard,
} from "../lib/observatory-targets.js";
import {
  applyObservatoryRun,
  partitionSnapshotRefs,
  summarizeObservatoryHealth,
} from "../lib/observatory-store.js";
import { OPTIONS } from "../api/public/observatory.js";

test("the fixed panel contains five shards of five unique companies", () => {
  assert.equal(assertTargetRegistry(), true);
  assert.equal(OBSERVATORY_TARGETS.length, 25);
  for (let shard = 0; shard < 5; shard += 1) {
    assert.equal(targetsForShard(shard).length, 5);
  }
});

test("hourly dispatcher creates only the intended cadence windows", () => {
  assert.deepEqual(parseCronSlot(new Date("2026-07-29T02:05:00Z")), {
    cadence: "daily",
    shard: 2,
  });
  assert.deepEqual(parseCronSlot(new Date("2026-08-02T07:05:00Z")), {
    cadence: "weekly",
    shard: 2,
  });
  assert.deepEqual(parseCronSlot(new Date("2026-08-01T12:05:00Z")), {
    cadence: "monthly",
    shard: 2,
  });
  assert.equal(parseCronSlot(new Date("2026-07-29T18:05:00Z")), null);
});

test("SSRF validation rejects foreign hosts, IP literals and private DNS", async () => {
  assert.throws(
    () => validateTargetUrl("https://evil.example/", ["example.com"]),
    /allowlist/,
  );
  assert.throws(
    () => validateTargetUrl("https://127.0.0.1/", ["127.0.0.1"]),
    /Literal IP/,
  );
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("10.0.0.1"), false);
  assert.equal(isPublicIp("::ffff:127.0.0.1"), false);
  assert.equal(isPublicIp("::ffff:7f00:1"), false);
  assert.equal(isPublicIp("::ffff:8.8.8.8"), true);
  assert.equal(isPublicIp("ff02::1"), false);

  await assert.rejects(
    () =>
      fetchBoundedPublic("https://example.com/", {
        allowedHosts: ["example.com"],
        lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
        fetchImpl: async () => new Response("should not execute"),
      }),
    /blocked address/,
  );
});

test("bounded fetch follows only allowlisted redirects", async () => {
  const fetchImpl = async (url, options) => {
    assert.ok(options.dispatcher, "request must use a DNS-pinned dispatcher");
    if (url.pathname === "/") {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://example.com/product" },
      });
    }
    return new Response("ok", { status: 200 });
  };
  const result = await fetchBoundedPublic("https://example.com/", {
    allowedHosts: ["example.com"],
    lookupImpl: async () => [{ address: "8.8.8.8", family: 4 }],
    fetchImpl,
  });
  assert.equal(result.text, "ok");
  assert.equal(result.url, "https://example.com/product");
});

test("last-good data survives failed attempts and is marked stale", () => {
  const state = {
    version: 1,
    cadence: "daily",
    shard: 0,
    last_attempt_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    successful_runs: 0,
    failed_runs: 0,
    last_good: {
      biologix: {
        target_id: "biologix",
        domain: "biologixlabsresearch.com",
        commerce: { availability: "in_stock", offers: [{ price: 74.99, currency: "USD" }] },
      },
    },
    target_status: {},
    snapshot_refs: [],
    recent_changes: [],
  };
  const next = applyObservatoryRun(
    state,
    {
      cadence: "daily",
      captured_at: "2026-07-29T00:00:00.000Z",
      results: [{
        target_id: "biologix",
        domain: "biologixlabsresearch.com",
        cadence: "daily",
        captured_at: "2026-07-29T00:00:00.000Z",
        status: "failed",
        errors: [{ message: "timeout" }],
      }],
    },
    "noli-observatory/snapshots/daily/2026-07-29/shard-0-run.json",
  );
  assert.equal(next.last_good.biologix.commerce.offers[0].price, 74.99);
  assert.equal(next.last_good.biologix.stale, true);
  assert.equal(next.last_success_at, null);
  assert.equal(next.successful_runs, 0);
  assert.equal(next.failed_runs, 1);
  assert.match(next.last_error, /All 1 observatory targets failed/);
});

test("first observations establish a baseline without inventing changes", () => {
  const state = {
    version: 1,
    cadence: "daily",
    shard: 0,
    last_attempt_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    successful_runs: 0,
    failed_runs: 0,
    last_good: {},
    target_status: {},
    snapshot_refs: [],
    recent_changes: [],
  };
  const next = applyObservatoryRun(
    state,
    {
      cadence: "daily",
      captured_at: "2026-07-29T00:00:00.000Z",
      results: [{
        target_id: "biologix",
        display_name: "Biologix Labs Research",
        domain: "biologixlabsresearch.com",
        cohort: "anchor",
        cadence: "daily",
        captured_at: "2026-07-29T00:00:00.000Z",
        status: "complete",
        commerce: {
          availability: "in_stock",
          offers: [{ price: 74.99, currency: "USD" }],
        },
      }],
    },
    "noli-observatory/snapshots/daily/2026-07-29/shard-0-baseline.json",
  );
  assert.deepEqual(next.recent_changes, []);
  assert.equal(next.successful_runs, 1);
});

test("partial catalogs retain unseen offers and compare only observed keys", () => {
  const baseState = {
    version: 1,
    cadence: "daily",
    shard: 0,
    last_attempt_at: null,
    last_success_at: "2026-07-28T00:00:00.000Z",
    last_error_at: null,
    last_error: null,
    successful_runs: 1,
    failed_runs: 0,
    last_good: {
      biologix: {
        target_id: "biologix",
        domain: "biologixlabsresearch.com",
        commerce: {
          catalog_adapter: "woocommerce",
          catalog_complete: true,
          product_count: 2,
          offers: [
            { key: "a", price: 80, availability: "in_stock" },
            { key: "b", price: 120, availability: "in_stock" },
          ],
        },
      },
    },
    target_status: {},
    snapshot_refs: [],
    recent_changes: [],
  };
  const run = (price) => applyObservatoryRun(
    structuredClone(baseState),
    {
      cadence: "daily",
      captured_at: "2026-07-29T00:00:00.000Z",
      results: [{
        target_id: "biologix",
        display_name: "Biologix Labs Research",
        domain: "biologixlabsresearch.com",
        cohort: "anchor",
        cadence: "daily",
        captured_at: "2026-07-29T00:00:00.000Z",
        status: "partial",
        commerce: {
          catalog_adapter: "woocommerce",
          catalog_complete: false,
          product_count: 1,
          offers: [{ key: "a", price, availability: "in_stock" }],
          promotions: [],
        },
      }],
    },
    "noli-observatory/snapshots/daily/2026-07-29/shard-0-partial.json",
  );
  const unchanged = run(80);
  assert.equal(unchanged.last_good.biologix.commerce.offers.length, 2);
  assert.equal(unchanged.last_good.biologix.commerce.retained_offer_count, 1);
  assert.equal(unchanged.last_good.biologix.commerce.product_count, 2);
  assert.deepEqual(unchanged.recent_changes, []);

  const changed = run(75);
  assert.equal(changed.last_good.biologix.commerce.offers.length, 2);
  assert.equal(changed.recent_changes.length, 1);
  assert.equal(changed.recent_changes[0].type, "displayed_price_changed");
});

test("catalog, price, stock, and promotion changes remain categorical", () => {
  const state = {
    version: 1,
    cadence: "daily",
    shard: 0,
    last_attempt_at: null,
    last_success_at: "2026-07-28T00:00:00.000Z",
    last_error_at: null,
    last_error: null,
    successful_runs: 1,
    failed_runs: 0,
    last_good: {
      biologix: {
        target_id: "biologix",
        domain: "biologixlabsresearch.com",
        commerce: {
          catalog_adapter: "woocommerce",
          catalog_complete: true,
          promotions: ["10% off"],
          offers: [
            { key: "a", price: 80, list_price: 90, availability: "in_stock" },
            { key: "b", price: 120, list_price: 130, availability: "out_of_stock" },
            { key: "c", price: 140, list_price: 150, availability: "in_stock" },
          ],
        },
      },
    },
    target_status: {},
    snapshot_refs: [],
    recent_changes: [],
  };
  const next = applyObservatoryRun(
    state,
    {
      cadence: "daily",
      captured_at: "2026-07-29T00:00:00.000Z",
      results: [{
        target_id: "biologix",
        display_name: "Biologix Labs Research",
        domain: "biologixlabsresearch.com",
        cohort: "anchor",
        cadence: "daily",
        captured_at: "2026-07-29T00:00:00.000Z",
        status: "complete",
        commerce: {
          catalog_adapter: "woocommerce",
          catalog_complete: true,
          promotions: ["15% off"],
          promotions_observed: true,
          offers: [
            { key: "a", price: 75, list_price: 90, availability: "out_of_stock" },
            { key: "b", price: 120, list_price: 130, availability: "out_of_stock" },
            { key: "d", price: 160, list_price: 170, availability: "in_stock" },
          ],
        },
      }],
    },
    "noli-observatory/snapshots/daily/2026-07-29/shard-0-categorical.json",
  );
  assert.deepEqual(
    next.recent_changes.map((change) => change.type),
    [
      "catalog_changed",
      "displayed_price_changed",
      "availability_changed",
      "promotion_changed",
    ],
  );
});

test("a failed homepage cannot manufacture a promotion removal", () => {
  const state = {
    version: 1,
    cadence: "daily",
    shard: 0,
    last_attempt_at: null,
    last_success_at: "2026-07-28T00:00:00.000Z",
    last_error_at: null,
    last_error: null,
    successful_runs: 1,
    failed_runs: 0,
    last_good: {
      biologix: {
        target_id: "biologix",
        domain: "biologixlabsresearch.com",
        commerce: {
          catalog_adapter: "woocommerce",
          catalog_complete: true,
          promotions: ["10% off"],
          offers: [{ key: "a", price: 80, availability: "in_stock" }],
        },
      },
    },
    target_status: {},
    snapshot_refs: [],
    recent_changes: [],
  };
  const next = applyObservatoryRun(
    state,
    {
      cadence: "daily",
      captured_at: "2026-07-29T00:00:00.000Z",
      results: [{
        target_id: "biologix",
        display_name: "Biologix Labs Research",
        domain: "biologixlabsresearch.com",
        cohort: "anchor",
        cadence: "daily",
        captured_at: "2026-07-29T00:00:00.000Z",
        status: "partial",
        errors: [{ scope: "homepage", message: "HTTP 403" }],
        commerce: {
          catalog_adapter: "woocommerce",
          catalog_complete: true,
          promotions: [],
          promotions_observed: false,
          offers: [{ key: "a", price: 80, availability: "in_stock" }],
        },
      }],
    },
    "noli-observatory/snapshots/daily/2026-07-29/shard-0-no-homepage.json",
  );
  assert.deepEqual(next.last_good.biologix.commerce.promotions, ["10% off"]);
  assert.equal(
    next.last_good.biologix.commerce.promotions_retained_from_last_good,
    true,
  );
  assert.deepEqual(next.recent_changes, []);
});

test("snapshot references older than 90 days are pruned", () => {
  const result = partitionSnapshotRefs(
    [
      "noli-observatory/snapshots/daily/2026-04-01/shard-0-old.json",
      "noli-observatory/snapshots/daily/2026-05-01/shard-0-edge.json",
      "noli-observatory/snapshots/daily/2026-07-29/shard-0-new.json",
    ],
    Date.parse("2026-07-30T00:00:00.000Z"),
  );
  assert.deepEqual(result.expired, [
    "noli-observatory/snapshots/daily/2026-04-01/shard-0-old.json",
  ]);
  assert.equal(result.kept.length, 2);
});

test("health requires all cadence shards and degrades when a cadence is stale", () => {
  const now = Date.parse("2026-07-30T00:00:00.000Z");
  const states = ["daily", "weekly", "monthly"].flatMap((cadence) =>
    Array.from({ length: 5 }, (_, shard) => ({
      cadence,
      shard,
      last_attempt_at: "2026-07-29T23:00:00.000Z",
      last_success_at: "2026-07-29T23:00:00.000Z",
      last_error: null,
      target_status: {},
      last_good: {},
    })),
  );
  assert.equal(
    summarizeObservatoryHealth(states.slice(0, 1), now).status,
    "initializing",
  );
  assert.equal(summarizeObservatoryHealth(states, now).status, "healthy");

  const stale = structuredClone(states);
  stale[0].last_success_at = "2026-07-28T00:00:00.000Z";
  const staleHealth = summarizeObservatoryHealth(stale, now);
  assert.equal(staleHealth.status, "degraded");
  assert.equal(staleHealth.stale_cadence_states, 1);

  const missing = structuredClone(states);
  missing[0].last_success_at = null;
  const missingHealth = summarizeObservatoryHealth(missing, now);
  assert.equal(missingHealth.status, "degraded");
  assert.equal(missingHealth.missing_success_states, 1);
});

test("public payload matches the 25-company UI contract and contains no raw evidence", () => {
  const payload = sanitizePublicPayload(OBSERVATORY_TARGETS, []);
  assert.equal(payload.capturedAt, null);
  assert.equal(payload.companies.length, 25);
  assert.deepEqual(
    new Set(payload.companies.map((company) => company.domain)).size,
    25,
  );
  for (const company of payload.companies) {
    assert.equal(company.platform.state, "Unknown");
    assert.equal(company.catalog.state, "Unknown");
    assert.equal(company.reta.state, "Unknown");
    assert.ok(Array.isArray(company.history));
    assert.ok(Array.isArray(company.evidence));
    assert.deepEqual(company.checkout.signals, []);
    assert.equal(company.checkout.state, "Unknown");
  }
  assert.ok(!JSON.stringify(payload).includes("Public GET only"));
  assert.ok(!JSON.stringify(payload).includes("snippet"));
  assert.ok(!JSON.stringify(payload).includes("provider_code_signals"));
});

test("public payload freshness is the newest successful observation", () => {
  const [olderTarget, newerTarget] = OBSERVATORY_TARGETS;
  const payload = sanitizePublicPayload([olderTarget, newerTarget], [{
    last_good: {
      [olderTarget.id]: {
        target_id: olderTarget.id,
        domain: olderTarget.domain,
        last_observed_at: "2026-07-28T00:00:00.000Z",
      },
      [newerTarget.id]: {
        target_id: newerTarget.id,
        domain: newerTarget.domain,
        last_observed_at: "2026-07-29T00:00:00.000Z",
      },
    },
    recent_changes: [],
  }]);
  assert.equal(payload.capturedAt, "2026-07-29T00:00:00.000Z");
});

test("public price ranges stay unknown when offers contain no numeric prices", () => {
  const target = OBSERVATORY_TARGETS[0];
  const payload = sanitizePublicPayload([target], [{
    last_good: {
      [target.id]: {
        target_id: target.id,
        domain: target.domain,
        cadence: "daily",
        last_observed_at: "2026-07-29T00:00:00.000Z",
        commerce: {
          availability: "unknown",
          offers: [{ price: null, currency: "USD" }],
        },
      },
    },
    recent_changes: [],
  }]);
  assert.equal(payload.companies[0].reta.minimumPrice, null);
  assert.equal(payload.companies[0].reta.maximumPrice, null);
});

test("full-catalog mapping keeps non-Reta offers out of Reta pricing", () => {
  const target = OBSERVATORY_TARGETS[0];
  const payload = sanitizePublicPayload([target], [{
    last_good: {
      [target.id]: {
        target_id: target.id,
        domain: target.domain,
        cadence: "daily",
        last_observed_at: "2026-07-29T00:00:00.000Z",
        commerce: {
          catalog_complete: true,
          product_count: 2,
          offers: [
            {
              key: "public:cheap-non-reta",
              price: 5,
              currency: "USD",
              availability: "in_stock",
              is_retatrutide: false,
            },
            {
              key: "public:reta",
              price: 80,
              currency: "USD",
              availability: "in_stock",
              is_retatrutide: true,
            },
          ],
        },
      },
    },
    recent_changes: [],
  }]);
  assert.equal(payload.companies[0].catalog.productCount, 2);
  assert.equal(payload.companies[0].catalog.state, "Observed");
  assert.equal(payload.companies[0].reta.variantCount, 1);
  assert.equal(payload.companies[0].reta.minimumPrice, 80);
  assert.equal(payload.companies[0].reta.maximumPrice, 80);
  assert.equal(payload.companies[0].reta.inStockOffers, 1);
});

test("partial full feeds are not promoted over the researched UI baseline", () => {
  const target = OBSERVATORY_TARGETS[0];
  const payload = sanitizePublicPayload([target], [{
    last_good: {
      [target.id]: {
        target_id: target.id,
        domain: target.domain,
        cadence: "daily",
        last_observed_at: "2026-07-29T00:00:00.000Z",
        last_result_status: "partial",
        commerce: {
          catalog_adapter: "woocommerce",
          catalog_complete: false,
          product_count: 1,
          offers: [{
            key: "public:reta",
            price: 80,
            currency: "USD",
            availability: "in_stock",
            is_retatrutide: true,
          }],
        },
      },
    },
    recent_changes: [],
  }]);
  assert.equal(payload.companies[0].catalog.state, "Unknown");
  assert.equal(payload.companies[0].reta.state, "Unknown");
  assert.equal(payload.companies[0].history[0].state, "Unknown");
});

test("a limited product page remains Unknown instead of replacing full baselines", () => {
  const target = OBSERVATORY_TARGETS.find(
    (entry) => entry.catalog_adapter === "product_page",
  );
  const payload = sanitizePublicPayload([target], [{
    last_good: {
      [target.id]: {
        target_id: target.id,
        domain: target.domain,
        cadence: "daily",
        last_observed_at: "2026-07-29T00:00:00.000Z",
        last_result_status: "complete",
        commerce: {
          catalog_adapter: "product_page",
          catalog_complete: false,
          product_count: 1,
          offers: [{
            key: "public:one-reta-offer",
            price: 80,
            currency: "USD",
            availability: "in_stock",
            is_retatrutide: true,
          }],
        },
      },
    },
    recent_changes: [],
  }]);
  assert.equal(payload.companies[0].catalog.state, "Unknown");
  assert.equal(payload.companies[0].reta.state, "Unknown");
});

test("a fresh monthly record cannot hide stale daily commerce", () => {
  const target = OBSERVATORY_TARGETS[0];
  const payload = sanitizePublicPayload([target], [
    {
      last_good: {
        [target.id]: {
          target_id: target.id,
          domain: target.domain,
          cadence: "daily",
          last_observed_at: "2026-07-28T00:00:00.000Z",
          last_result_status: "complete",
          stale: true,
          commerce: {
            catalog_adapter: "woocommerce",
            catalog_complete: true,
            product_count: 1,
            offers: [{
              key: "public:reta",
              price: 80,
              currency: "USD",
              availability: "in_stock",
              is_retatrutide: true,
            }],
          },
        },
      },
      recent_changes: [],
    },
    {
      last_good: {
        [target.id]: {
          target_id: target.id,
          domain: target.domain,
          cadence: "monthly",
          last_observed_at: "2026-07-29T00:00:00.000Z",
          last_result_status: "complete",
          stale: false,
          trust: { homepage_hash: "sha256:fresh" },
        },
      },
      recent_changes: [],
    },
  ]);
  assert.equal(payload.companies[0].catalog.state, "Unknown");
  assert.equal(payload.companies[0].reta.state, "Unknown");
  assert.equal(payload.companies[0].history.length, 2);
  assert.match(payload.companies[0].history[1].text, /retains the last good/i);
});

test("public preflight allows only credential-free GET and OPTIONS", () => {
  const response = OPTIONS();
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});
