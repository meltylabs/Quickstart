import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCandidateSnapshot,
  diffSnapshots,
  evidenceValue,
  normalizeOffer,
  OBSERVATORY_BOUNDARIES,
  reconcileWithLastGood,
  snapshotIsExpired,
} from "../scripts/lib/noli-observatory-core.mjs";
import {
  collectWooCatalog,
  inspectStorefrontHtml,
} from "../scripts/lib/noli-observatory-collector.mjs";
import {
  assertObservatoryRegistry,
  NOLI_OBSERVATORY_REGISTRY,
} from "../scripts/lib/noli-observatory-targets.mjs";
import {
  isPublicIpAddress,
  publicHttp,
} from "../scripts/lib/noli-public-http.mjs";

const ROOT = new URL("../", import.meta.url);

function oneTargetRegistry() {
  return {
    version: "fixture.v1",
    validFrom: "2026-07-01",
    lockedUntil: "2026-10-01",
    targets: [
      {
        domain: "example.com",
        brand: "Example",
        cohort: "fixture",
        catalogAdapter: "woocommerce",
        homepageUrl: "https://example.com/",
        catalogUrl: "https://example.com/wp-json/wc/store/v1/products",
      },
    ],
  };
}

function observation({
  price = 80,
  stockStatus = "in_stock",
  extraOffer = false,
  catalogStatus = "observed",
  coverage = "complete",
  storefrontStatus = "observed",
  promotions = [{ kind: "discount", text: "10% off", sourceUrl: "https://example.com/" }],
  marketingCodes = ["Meta Pixel"],
  paymentCodes = ["Stripe code"],
} = {}) {
  return {
    domain: "example.com",
    catalog: {
      status: catalogStatus,
      coverage,
      observedAt: "2026-07-29T10:00:00.000Z",
      sourceUrls: ["https://example.com/products.json"],
      offers: [
        {
          productTitle: "Retatrutide 10mg",
          publicProductId: "p1",
          publicVariantId: "v1",
          currentPrice: price,
          currency: "USD",
          stockStatus,
          canonicalUrl: "https://example.com/products/reta",
          sourceUrl: "https://example.com/products.json",
        },
        ...(extraOffer
          ? [
              {
                productTitle: "Retatrutide 20mg",
                publicProductId: "p1",
                publicVariantId: "v2",
                currentPrice: 120,
                currency: "USD",
                stockStatus: "in_stock",
                canonicalUrl: "https://example.com/products/reta",
                sourceUrl: "https://example.com/products.json",
              },
            ]
          : []),
      ],
    },
    storefront: {
      status: storefrontStatus,
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      httpStatus: 200,
      observedAt: "2026-07-29T10:00:00.000Z",
      promotions,
      marketingCodes,
      paymentCodes,
    },
  };
}

test("fixed registry contains exactly the approved 25 companies and cohorts", () => {
  assertObservatoryRegistry(NOLI_OBSERVATORY_REGISTRY);
  assert.equal(NOLI_OBSERVATORY_REGISTRY.targets.length, 25);
  assert.equal(NOLI_OBSERVATORY_REGISTRY.lockedUntil, "2026-10-27");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(
        NOLI_OBSERVATORY_REGISTRY.targets.reduce(
          (counts, target) => ({
            ...counts,
            [target.cohort]: (counts[target.cohort] || 0) + 1,
          }),
          {},
        ),
      ),
    ),
    {
      anchors: 4,
      commerce: 7,
      payment: 5,
      testing: 5,
      design_growth: 4,
    },
  );
  for (const domain of [
    "biologixlabsresearch.com",
    "northlinelabs.org",
    "bluumpeptides.com",
    "spartalabs.net",
  ]) {
    assert.ok(NOLI_OBSERVATORY_REGISTRY.targets.some((target) => target.domain === domain));
  }
});

test("normalization labels evidence and rejects unsafe or placeholder values", () => {
  const offer = normalizeOffer(
    {
      title: "GLP-3R",
      price: 0,
      stock_status: "made_up",
      canonical_url: "https://unrelated.example/product",
      source_url: "https://unrelated.example/feed",
    },
    "example.com",
    "2026-07-29T00:00:00.000Z",
  );
  assert.equal(offer.currentPrice, null);
  assert.equal(offer.stockStatus, "unknown");
  assert.equal(offer.canonicalUrl, "https://example.com/");
  assert.equal(offer.sourceUrl, "https://example.com/");
  assert.equal(offer.isRetatrutide, true);
  assert.equal(offer.evidence, "observed");

  const archived = normalizeOffer(
    { title: "Reta", public_offer_id: "9973/14566" },
    "example.com",
    "2026-07-29T00:00:00.000Z",
  );
  const live = normalizeOffer(
    { title: "Reta", public_variant_id: "14566" },
    "example.com",
    "2026-07-30T00:00:00.000Z",
  );
  assert.equal(archived.key, live.key);

  assert.equal(evidenceValue(123, "estimated", { model: "fixture" }).kind, "estimated");
  assert.equal(evidenceValue(null).kind, "unknown");
  assert.match(OBSERVATORY_BOUNDARIES.payment, /does not establish/i);
  assert.match(OBSERVATORY_BOUNDARIES.unknown, /never means zero/i);
});

test("diff detects catalog, price, stock, offer, promotion, marketing, and payment-code changes", () => {
  const registry = oneTargetRegistry();
  const previous = createCandidateSnapshot({
    capturedAt: "2026-07-29T10:00:00.000Z",
    registry,
    observations: [observation()],
  });
  const current = createCandidateSnapshot({
    capturedAt: "2026-07-30T10:00:00.000Z",
    registry,
    observations: [
      observation({
        price: 75,
        stockStatus: "out_of_stock",
        extraOffer: true,
        promotions: [
          { kind: "free-shipping", text: "Free shipping", sourceUrl: "https://example.com/" },
        ],
        marketingCodes: ["Google Ads tag"],
        paymentCodes: ["Bankful code"],
      }),
    ],
  });
  const events = diffSnapshots(previous, current).events;
  const types = new Set(events.map(({ type }) => type));
  for (const expected of [
    "price_changed",
    "stock_changed",
    "offer_added",
    "catalog_size_changed",
    "promotion_started",
    "promotion_ended",
    "marketing_signal_added",
    "marketing_signal_removed",
    "payment_code_added",
    "payment_code_removed",
  ]) {
    assert.ok(types.has(expected), `missing ${expected}`);
  }
  assert.ok(events.every(({ evidence }) => evidence === "observed"));
  assert.ok(
    events
      .filter(({ category }) => category === "payment")
      .every(({ caveat }) => /does not establish/i.test(caveat)),
  );
});

test("failed pulls retain last-good data and never manufacture removals", () => {
  const registry = oneTargetRegistry();
  const previous = createCandidateSnapshot({
    capturedAt: "2026-07-29T10:00:00.000Z",
    registry,
    observations: [observation()],
  });
  const candidate = createCandidateSnapshot({
    capturedAt: "2026-07-30T10:00:00.000Z",
    registry,
    observations: [
      {
        domain: "example.com",
        catalog: {
          status: "error",
          coverage: "unknown",
          offers: [],
          lastAttemptAt: "2026-07-30T10:00:00.000Z",
          error: "HTTP 403",
        },
        storefront: {
          status: "error",
          lastAttemptAt: "2026-07-30T10:00:00.000Z",
          error: "timeout",
        },
      },
    ],
  });
  const reconciled = reconcileWithLastGood(candidate, previous);
  const company = reconciled.companies[0];
  assert.equal(company.catalog.status, "stale");
  assert.equal(company.catalog.offers.length, 1);
  assert.equal(company.catalog.error, "HTTP 403");
  assert.equal(company.storefront.status, "stale");
  assert.equal(company.metrics.catalogOffers.stale, true);
  assert.deepEqual(diffSnapshots(previous, reconciled).events, []);
});

test("offer removals are suppressed whenever either catalog is partial", () => {
  const registry = oneTargetRegistry();
  const previous = createCandidateSnapshot({
    capturedAt: "2026-07-29T10:00:00.000Z",
    registry,
    observations: [observation({ extraOffer: true, coverage: "partial" })],
  });
  const current = createCandidateSnapshot({
    capturedAt: "2026-07-30T10:00:00.000Z",
    registry,
    observations: [observation({ coverage: "partial" })],
  });
  const events = diffSnapshots(previous, current).events;
  assert.ok(!events.some(({ type }) => type === "offer_removed"));
  assert.ok(!events.some(({ type }) => type === "catalog_size_changed"));
});

test("storefront inspection extracts only bounded public signals", () => {
  const result = inspectStorefrontHtml(
    `<!doctype html>
      <title>Example Labs</title>
      <meta name="description" content="Public research catalog">
      <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
      <script src="https://js.stripe.com/v3/"></script>
      <script src="https://static.klaviyo.com/app.js"></script>
      <a href="/affiliate-program">Affiliate program</a>
      <p>Use code LAB10 for 10% off — help@example.com — 1-855-471-8544</p>`,
    {
      domain: "example.com",
      url: "https://example.com/",
      status: 200,
      observedAt: "2026-07-29T00:00:00.000Z",
    },
  );
  assert.equal(result.status, "observed");
  assert.deepEqual(result.marketingCodes, ["Klaviyo", "Meta Pixel"]);
  assert.deepEqual(result.paymentCodes, ["Stripe code"]);
  assert.equal(result.promotions.length, 1);
  assert.match(result.promotions[0].text, /\[email redacted\]/);
  assert.match(result.promotions[0].text, /\[phone redacted\]/);
  assert.doesNotMatch(result.promotions[0].text, /help@example\.com|855-471-8544/);
  assert.deepEqual(result.publicRoutes, ["https://example.com/affiliate-program"]);
  assert.match(result.caveat, /not spend/i);
  assert.match(result.caveat, /not.*processor activation/i);
});

test("Woo collector paginates anonymous GETs and normalizes public offers", async () => {
  const target = oneTargetRegistry().targets[0];
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    const isVariation = parsed.searchParams.get("type") === "variation";
    return {
      status: 200,
      url,
      headers: { "x-wp-totalpages": "1" },
      body: JSON.stringify(
        isVariation
          ? []
          : [
              {
                id: 1,
                name: "Retatrutide 10mg",
                permalink: "https://example.com/product/reta/",
                type: "simple",
                prices: {
                  price: "8000",
                  regular_price: "9000",
                  currency_code: "USD",
                  currency_minor_unit: 2,
                },
                is_in_stock: true,
                is_on_backorder: false,
                categories: [{ name: "Peptides" }],
              },
            ],
      ),
    };
  };
  const catalog = await collectWooCatalog(
    target,
    request,
    "2026-07-29T00:00:00.000Z",
  );
  assert.equal(catalog.status, "observed");
  assert.equal(catalog.coverage, "complete");
  assert.equal(catalog.offers.length, 1);
  assert.equal(catalog.offers[0].currentPrice, 80);
  assert.equal(catalog.offers[0].publicVariantId, "1");
  assert.ok(calls.every(({ options }) => options.method === "GET"));
  assert.ok(calls.every(({ options }) => options.expectedDomain === "example.com"));
});

test("public HTTP rejects write methods and private network targets", async () => {
  await assert.rejects(
    publicHttp("https://example.com/", {
      method: "POST",
      expectedDomain: "example.com",
    }),
    /only permits GET or HEAD/i,
  );
  assert.equal(isPublicIpAddress("127.0.0.1"), false);
  assert.equal(isPublicIpAddress("10.0.0.1"), false);
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("::ffff:7f00:1"), false);
  await assert.rejects(
    publicHttp("http://127.0.0.1/", {
      method: "GET",
      expectedDomain: "127.0.0.1",
    }),
    /requires HTTPS/i,
  );
});

test("retention is exactly 90 days and refresh publishes immutable snapshots", async () => {
  assert.equal(
    snapshotIsExpired(
      { capturedAt: "2026-05-01T00:00:00.000Z" },
      new Date("2026-07-31T00:00:00.001Z"),
    ),
    true,
  );
  assert.equal(
    snapshotIsExpired(
      { capturedAt: "2026-05-02T00:00:00.000Z" },
      new Date("2026-07-31T00:00:00.000Z"),
    ),
    false,
  );
  const refresh = await readFile(
    new URL("scripts/refresh-noli-observatory.mjs", ROOT),
    "utf8",
  );
  assert.match(refresh, /writeFile\(file,[\s\S]*flag: "wx"/);
  assert.match(refresh, /OBSERVATORY_RETENTION_DAYS/);
  assert.match(refresh, /retain|retention/i);
  assert.doesNotMatch(refresh, /POST|PUT|PATCH|DELETE/);
});
