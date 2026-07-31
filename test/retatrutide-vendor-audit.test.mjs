import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_GLOBAL_CONCURRENCY,
  SAFE_CRAWL_POLICY,
  buildAuditPayload,
  classifyInputVendor,
  compactAuditForPublish,
  extractPageSignals,
  normalizeDomain,
  parseArgs,
  parseRetryAfter,
  serializeAuditPayload,
  summarizeVendorAudit,
} from "../scripts/audit-retatrutide-vendor-universe.mjs";

const CAPTURED_AT = "2026-07-27T20:00:00.000Z";

function fixturePage() {
  return `<!doctype html>
    <html>
      <head>
        <title>Apex Research | Retatrutide 10mg</title>
        <meta name="description" content="Independently tested research compounds">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://cdn.shopify.com/shopifycloud/storefront.js"></script>
        <script>gtag('config', 'G-ABCDEF12'); fbq('init', '123456789');</script>
        <script src="https://js.stripe.com/v3/"></script>
        <style>@media (max-width: 700px) { .mobile-menu { display: block } }</style>
      </head>
      <body>
        <nav class="mobile-menu">Menu</nav>
        <h1>Retatrutide 10mg Lyophilized Vial</h1>
        <p>For research use only. Not for human consumption.</p>
        <p>Clinical trial participants achieved weight loss after weeks of treatment.</p>
        <p>Every lot is independently third-party tested at 99.4% purity.</p>
        <p>$89.00. In stock. Add to cart.</p>
        <p>Free shipping. Subscribe &amp; save 10%. Affiliate program.</p>
        <p>Visa, Apple Pay, and ACH accepted.</p>
        <p>Contact support@apex.example</p>
        <a href="/pages/contact">Contact</a>
        <a href="/policies/shipping-policy">Shipping policy</a>
        <a href="/policies/refund-policy">Refund policy</a>
        <a href="/files/reta-10mg-coa.pdf">Certificate of Analysis</a>
        <div data-judgeme-widget>152 reviews 4.8 stars</div>
      </body>
    </html>`;
}

test("normalization and source classification keep retail, social, and directories separate", () => {
  assert.equal(normalizeDomain("https://www.Example.com/a"), "example.com");
  assert.equal(
    classifyInputVendor({
      domain: "shop.example.com",
      retailStatus: "Confirmed US storefront",
    }).entityType,
    "retail_storefront",
  );
  assert.equal(
    classifyInputVendor({ url: "https://chat.whatsapp.com/example" }).entityType,
    "social_or_messaging",
  );
  assert.equal(
    classifyInputVendor({
      url: "https://supplier.en.made-in-china.com/",
    }).entityType,
    "marketplace_or_directory",
  );
  assert.equal(
    classifyInputVendor({ url: "https://gmail.com/" }).entityType,
    "contact_or_file_service",
  );
  assert.equal(
    classifyInputVendor({ url: "https://etsy.com/listing/example" }).entityType,
    "marketplace_or_directory",
  );
  assert.equal(normalizeDomain('"https'), null);
});

test("published audits retain referenced evidence without shipping every duplicate capture", () => {
  const page = extractPageSignals({
    html: fixturePage(),
    url: "https://apex.example/products/retatrutide",
    capturedAt: CAPTURED_AT,
    durationMs: 750,
    bytes: 35_000,
  });
  const audit = summarizeVendorAudit({
    vendor: {
      name: "Apex Research",
      domain: "apex.example",
      url: "https://apex.example/",
    },
    normalizedDomain: "apex.example",
    inputClassification: {
      entityType: "retail_storefront",
      crawl: true,
      reason: "Fixture",
    },
    pages: [page, page, page],
    errors: [],
    capturedAt: CAPTURED_AT,
    robots: { disallow: [], sitemaps: [] },
    status: "completed",
  });
  const compact = compactAuditForPublish(audit);
  const referenced = new Set(
    compact.platform.primary.evidenceIds,
  );

  assert.ok(compact.evidence.length < audit.evidence.length);
  assert.ok(compact.platform.primary.evidenceIds.length <= 1);
  assert.ok(
    compact.evidence.some((item) => referenced.has(item.id)),
  );
  assert.ok(compact.design.evidenceIds.mobileUsability.length > 0);
});

test("page extraction finds business signals and preserves evidence boundaries", () => {
  const page = extractPageSignals({
    html: fixturePage(),
    url: "https://apex.example/products/retatrutide",
    capturedAt: CAPTURED_AT,
    headers: {
      server: "cloudflare",
      "content-type": "text/html",
    },
    durationMs: 750,
    bytes: 35_000,
  });

  assert.equal(page.reta.listed, true);
  assert.equal(page.reta.mentioned, true);
  assert.equal(page.reta.listingStatus.value, "available");
  assert.ok(page.reta.strengths.some((item) => item.value === "10mg"));
  assert.ok(page.pricing.prices.some((item) => item.amount === 89));
  assert.ok(page.platform.some((item) => item.value === "Shopify"));
  assert.ok(
    page.tracking.some(
      (item) =>
        item.provider === "google_analytics" && item.publicId === "G-ABCDEF12",
    ),
  );
  assert.ok(
    page.payment.visibleMethods.some((item) => item.value === "Apple Pay"),
  );
  assert.ok(
    page.payment.integrationSignals.some((item) => item.value === "Stripe"),
  );
  assert.ok(page.trust.coaLinks.length > 0);
  assert.ok(page.marketing.offers.some((item) => item.value === "subscription"));
  assert.ok(page.claims.some((item) => item.category === "research_only"));
  assert.ok(page.claims.some((item) => item.category === "human_outcome"));
  assert.ok(page.sourcing.some((item) => item.value === "third_party_testing"));
  assert.ok(page.evidence.length > 20);
  assert.ok(
    page.evidence.every(
      (item) =>
        item.url === "https://apex.example/products/retatrutide" &&
        item.capturedAt === CAPTURED_AT &&
        ["high", "medium", "low"].includes(item.confidence),
    ),
  );
});

test("research articles can carry claims without becoming product listings", () => {
  const page = extractPageSignals({
    html: `
      <html><head><title>Retatrutide published research</title></head>
      <body>
        <h1>Retatrutide clinical trial summary</h1>
        <p>Participants experienced weight loss during a phase 3 clinical trial.</p>
        <p>Check the references for the complete methodology.</p>
      </body></html>
    `,
    url: "https://apex.example/blog/retatrutide-research",
    capturedAt: CAPTURED_AT,
    durationMs: 500,
    bytes: 2_000,
  });

  assert.equal(page.reta.mentioned, true);
  assert.equal(page.reta.listed, false);
  assert.equal(page.reta.listingStatus, null);
  assert.equal(page.pricing.prices.length, 0);
  assert.equal(page.payment.visibleMethods.some((item) => item.value === "Check"), false);
  assert.ok(page.claims.some((item) => item.category === "human_outcome"));
});

test("a non-Reta product page is not reclassified by a related Reta card", () => {
  const page = extractPageSignals({
    html: `
      <html>
        <head>
          <title>AOD-9604 5mg | Apex Research</title>
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Product","name":"AOD-9604 5mg"}
          </script>
        </head>
        <body>
          <h1>AOD-9604 5mg</h1>
          <main><p>$49.00</p><button>Add to cart</button></main>
          <aside>
            <h2>Related: Retatrutide 10mg</h2>
            <p>$89.00</p><button>Add to cart</button>
          </aside>
        </body>
      </html>
    `,
    url: "https://apex.example/products/aod-9604",
    capturedAt: CAPTURED_AT,
    durationMs: 500,
    bytes: 4_000,
  });

  assert.equal(page.reta.mentioned, true);
  assert.equal(page.reta.listed, false);
  assert.equal(page.reta.listingStatus, null);
  assert.equal(page.pricing.prices.length, 0);
  assert.equal(
    page.evidence.some((item) => item.field === "reta.productIdentity"),
    false,
  );
});

test("focused Northline public evidence fills product facts without inventing payment-chain facts", () => {
  const compact = compactAuditForPublish({
    domain: "northlinelabs.org",
    name: "Northline Labs",
    status: "partial",
    entityType: "unknown_public_website",
    pagesCrawled: 1,
    pageUrls: ["https://northlinelabs.org/"],
    platform: {
      primary: null,
      detected: [],
      plugins: [],
      serverHeaders: ["cloudflare"],
    },
    reta: {
      listed: false,
      listingStatus: null,
      productUrls: [],
      contentUrls: [],
      evidenceIds: [],
      strengths: [],
      forms: [],
    },
    pricing: { prices: [], displayedRange: null },
    marketing: {
      positioning: [],
      offers: [],
      subscription: false,
      affiliate: false,
      referral: false,
    },
    tracking: [],
    trust: {
      coaLinks: [],
      reviewProviders: [],
      displayedReviewCounts: [],
      displayedRatings: [],
    },
    operations: {
      shipping: [],
      returns: [],
      contactEmails: [],
      contactUrls: [],
      policyUrls: [],
    },
    payment: {
      visibleMethods: [],
      checkoutIntegration: [],
      gatewayPsp: [],
      processorIso: [],
      acquirerSponsorBank: [],
    },
    claims: { researchOnly: [], humanUseOrOutcome: [], all: [] },
    sourcing: { claims: [], independentlyVerifiedManufacturer: null },
    design: {
      mobileUsability: null,
      visualPolish: null,
      productClarity: null,
      trustPresentation: null,
      conversionUX: null,
      performance: null,
      evidenceIds: {},
    },
    evidence: [],
    errors: [],
  });

  assert.equal(compact.status, "completed");
  assert.equal(compact.entityType, "retail_storefront");
  assert.equal(compact.reta.listed, true);
  assert.equal(compact.reta.listingStatus, "available");
  assert.deepEqual(
    compact.reta.strengths.map((item) => item.value),
    ["10mg", "15mg", "20mg", "30mg", "50mg"],
  );
  assert.deepEqual(
    compact.pricing.prices.map((item) => item.amount),
    [79.99, 99.99, 129.99, 189.99, 299.99],
  );
  assert.ok(
    compact.payment.visibleMethods.some((item) => item.value === "Google Pay"),
  );
  assert.deepEqual(compact.payment.checkoutIntegration, []);
  assert.deepEqual(compact.payment.gatewayPsp, []);
  assert.deepEqual(compact.payment.processorIso, []);
  assert.deepEqual(compact.payment.acquirerSponsorBank, []);
  assert.equal(compact.trust.displayedReviewCounts[0].confidence, "low");
  assert.equal(compact.sourcing.independentlyVerifiedManufacturer, null);
  assert.equal(compact.design.visualPolish, null);
  assert.ok(
    compact.evidence.every(
      (item) =>
        item.url.startsWith("https://northlinelabs.org/") &&
        item.capturedAt === "2026-07-27T22:46:00.000Z",
    ),
  );
});

test("vendor summary never promotes an integration signal into a processor or bank claim", () => {
  const page = extractPageSignals({
    html: fixturePage(),
    url: "https://apex.example/products/retatrutide",
    capturedAt: CAPTURED_AT,
    durationMs: 750,
    bytes: 35_000,
  });
  const audit = summarizeVendorAudit({
    vendor: {
      name: "Apex Research",
      domain: "apex.example",
      url: "https://apex.example/",
      productUrl: "https://apex.example/products/retatrutide",
    },
    normalizedDomain: "apex.example",
    inputClassification: {
      entityType: "retail_storefront",
      crawl: true,
      reason: "Fixture",
    },
    pages: [page],
    errors: [],
    capturedAt: CAPTURED_AT,
    robots: { disallow: [], sitemaps: [] },
    status: "completed",
  });

  assert.equal(audit.payment.gatewayPsp[0].confidence, "low");
  assert.equal(audit.payment.providerSignals[0].provider, "Stripe");
  assert.equal(audit.payment.providerSignals[0].codeIdentified, true);
  assert.deepEqual(audit.payment.processorIso, []);
  assert.deepEqual(audit.payment.acquirerSponsorBank, []);
  assert.match(audit.payment.evidenceBoundary, /does not.*prove activation/i);
  assert.equal(audit.design.visualPolish, null);
  assert.ok(Number.isFinite(audit.design.productClarity));
  assert.match(audit.design.methodology, /visual polish remains pending/i);
});

test("CLI hard-caps concurrency and retains the no-retry safety policy", () => {
  const options = parseArgs([
    "--global-concurrency",
    "999",
    "--per-domain-delay-ms",
    "1",
    "--max-pages",
    "999",
  ]);
  assert.equal(options.globalConcurrency, MAX_GLOBAL_CONCURRENCY);
  assert.equal(options.perDomainDelayMs, 500);
  assert.equal(options.maxPagesPerDomain, 50);
  assert.deepEqual(SAFE_CRAWL_POLICY, {
    publicPagesOnly: true,
    accountCreation: false,
    captchaOrGateBypass: false,
    fabricatedIdentity: false,
    checkoutSubmission: false,
    transactions: false,
    credentialUse: false,
    perDomainConcurrency: 1,
    maxGlobalConcurrency: 20,
    retryBlockedRequests: false,
  });
});

test("Retry-After parsing supports seconds and HTTP dates without retrying", () => {
  assert.equal(parseRetryAfter("15", 0), 15_000);
  assert.equal(
    parseRetryAfter("Mon, 27 Jul 2026 20:00:15 GMT", Date.parse(CAPTURED_AT)),
    15_000,
  );
  assert.equal(parseRetryAfter("not-a-date", 0), null);
});

test("generated payload is deterministic, JSON-safe, and keyed by domain", () => {
  const audit = {
    domain: "apex.example",
    status: "completed",
    entityType: "retail_storefront",
    pagesCrawled: 1,
    reta: { listed: true },
    payment: { visibleMethods: [], checkoutIntegration: [] },
    trust: { coaLinks: [] },
  };
  const payload = buildAuditPayload({
    sourceDataset: {
      generatedAt: CAPTURED_AT,
      sources: ["https://source.example"],
      vendors: [{ domain: "apex.example" }],
    },
    results: [{ key: "apex.example", audit }],
    generatedAt: CAPTURED_AT,
    selectedCount: 1,
  });
  const serialized = serializeAuditPayload(payload);

  assert.deepEqual(Object.keys(payload.audits), ["apex.example"]);
  assert.equal(payload.stats.audited, 1);
  assert.match(
    serialized,
    /^\/\* Generated[\s\S]*window\.NOLI_RETATRUTIDE_VENDOR_AUDITS = /,
  );
  const json = serialized
    .replace(/^\/\*[\s\S]*?\*\/\nwindow\.NOLI_RETATRUTIDE_VENDOR_AUDITS = /, "")
    .replace(/;\n$/, "");
  assert.doesNotThrow(() => JSON.parse(json));
  assert.equal(serialized, serializeAuditPayload(payload));
});
