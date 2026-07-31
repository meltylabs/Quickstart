import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const DATA_PATH = new URL(
  "../biologix-strategy-board/research/retatrutide-vendor-universe-data.js",
  import.meta.url,
);
const PAGE_PATH = new URL(
  "../biologix-strategy-board/research/operating-blueprint.html",
  import.meta.url,
);
const CHECKOUT_AUDIT_PATH = new URL(
  "../biologix-strategy-board/research/retatrutide-checkout-audit-data.js",
  import.meta.url,
);
const WEB_AUDIT_PATH = new URL(
  "../biologix-strategy-board/research/retatrutide-vendor-audit-web-data.js",
  import.meta.url,
);
const PAYMENT_PROVIDER_PATH = new URL(
  "../biologix-strategy-board/research/retatrutide-payment-provider-data.js",
  import.meta.url,
);
const UI_REVIEW_PATH = new URL(
  "../biologix-strategy-board/research/retatrutide-ui-review-data.js",
  import.meta.url,
);

async function loadDataset() {
  const source = await readFile(DATA_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: DATA_PATH.pathname });
  return context.window.NOLI_RETATRUTIDE_VENDOR_UNIVERSE;
}

async function loadCheckoutAudits() {
  const source = await readFile(CHECKOUT_AUDIT_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: CHECKOUT_AUDIT_PATH.pathname });
  return context.window.NOLI_RETATRUTIDE_CHECKOUT_AUDITS;
}

async function loadWebAudits() {
  const source = await readFile(WEB_AUDIT_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: WEB_AUDIT_PATH.pathname });
  return { data: context.window.NOLI_RETATRUTIDE_VENDOR_AUDITS, bytes: source.length };
}

async function loadPaymentProviders() {
  const source = await readFile(PAYMENT_PROVIDER_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: PAYMENT_PROVIDER_PATH.pathname });
  return context.window.NOLI_RETATRUTIDE_PAYMENT_PROVIDER_CENSUS;
}

async function loadUiReviews() {
  const source = await readFile(UI_REVIEW_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: UI_REVIEW_PATH.pathname });
  return context.window.NOLI_RETATRUTIDE_UI_REVIEWS;
}

test("vendor universe preserves its evidence counts and minimum useful coverage", async () => {
  const data = await loadDataset();

  assert.ok(data.generatedAt);
  assert.ok(data.vendors.length >= 600);
  assert.equal(data.stats.total, data.vendors.length);
  assert.equal(
    data.stats.linkedWebsites,
    data.vendors.filter((vendor) => vendor.url).length,
  );
  assert.equal(
    data.stats.checkoutAudited,
    data.vendors.filter((vendor) => vendor.payments.length > 0).length,
  );
  assert.equal(data.stats.confirmedRetailStorefronts, 84);
  assert.equal(data.stats.probableRetailStorefronts, 28);
  assert.ok(data.stats.checkoutAudited >= 40);
});

test("payment observations remain explicitly bounded evidence", async () => {
  const data = await loadDataset();
  const sparta = data.vendors.find((vendor) => vendor.domain === "spartalabs.net");
  const bluum = data.vendors.find((vendor) => vendor.domain === "bluumpeptides.com");

  assert.match(sparta.paymentEvidence, /checkout/i);
  assert.match(sparta.paymentNote, /tested runtime/i);
  assert.equal(bluum.platform, "Shopify");
  assert.match(bluum.paymentEvidence, /payment policy/i);
  assert.ok(
    data.vendors
      .filter((vendor) => vendor.payments.length)
      .every((vendor) => vendor.paymentEvidence),
  );
});

test("central page loads the searchable universe and keeps full evidence on-page", async () => {
  const html = await readFile(PAGE_PATH, "utf8");

  assert.match(html, /retatrutide-vendor-universe-data\.js/);
  assert.match(html, /retatrutide-checkout-audit-data\.js/);
  assert.match(html, /retatrutide-vendor-audit-web-data\.js/);
  assert.match(html, /retatrutide-payment-provider-data\.js/);
  assert.match(html, /retatrutide-ui-review-data\.js/);
  assert.match(html, /retatrutide-vendor-universe\.js/);
  assert.match(html, /class="shell section vendor-radar" id="vendors"/);
  assert.match(html, /id="vendor-audit-rollups"/);
  assert.match(html, /Automated profile complete/);
  assert.match(html, /How the automated audit works/);
  assert.match(html, /Sparta Labs case file/);
  assert.match(html, /Bluum Peptides case file/);
  assert.match(html, /What the public code reveals about processors and gateways/);
  assert.match(html, /783 exact evidence rows across 149 domains/);
  assert.doesNotMatch(html, /Manual top-50 audit/);
  assert.doesNotMatch(html, /Biologix-Market-Operating-Evidence\.pdf/);
  assert.doesNotMatch(html, /verified zero processors or ISOs/i);
});

test("payment-provider census keeps exact code evidence and activation status", async () => {
  const data = await loadPaymentProviders();
  const lifeLink = data.audits["lifelinkresearch.com"];
  const stripe = lifeLink.payment.providerSignals.find(
    (signal) => signal.provider === "Stripe",
  );

  assert.equal(data.stats.censusDomains, 149);
  assert.equal(data.stats.evidenceRows, 783);
  assert.equal(data.stats.pspInstalledOrCodeExposedDomainCount, 48);
  assert.equal(data.stats.pspActiveProviderLayerDomainCount, 7);
  assert.equal(stripe.evidenceStatus, "active_for_reta_cart_api");
  assert.equal(stripe.codeIdentified, true);
  assert.equal(
    data.providerRollup.NMI.activeForRetaCartDomainCount,
    6,
  );
});

test("current checkout audit stays bounded and machine-readable", async () => {
  const data = await loadCheckoutAudits();
  const audits = Object.values(data.audits);

  assert.equal(audits.length, 48);
  assert.equal(data.stats.storesWithActiveMethodIds, 33);
  assert.equal(data.stats.storesWithRenderedCheckoutLabels, 20);
  assert.ok(audits.every((audit) => audit.payment?.note.includes("processor/ISO")));
  assert.ok(audits.every((audit) => audit.sourcing?.manufacturer));
  assert.ok(audits.every((audit) => Number.isFinite(audit.design?.overall)));
});

test("mobile page receives every domain through a compact evidence projection", async () => {
  const { data, bytes } = await loadWebAudits();

  assert.equal(Object.keys(data.audits).length, 570);
  assert.equal(data.stats.pagesCrawled, 1855);
  assert.ok(data.stats.webProjection.fullEvidenceRecords >= 10_000);
  assert.ok(bytes < 4_000_000);
  assert.ok(
    Object.values(data.audits).every((audit) => (audit.evidence?.length || 0) <= 10),
  );
});

test("UI ratings are screenshot-reviewed and remain a separate evidence layer", async () => {
  const data = await loadUiReviews();
  const reviews = Object.values(data.audits);

  assert.equal(reviews.length, 112);
  assert.equal(data.stats.scoredDomains, 95);
  assert.equal(data.stats.unscoredDomains, 17);
  assert.ok(reviews.every((review) => review.design?.screenshotReviewed));
  assert.ok(
    reviews.every(
      (review) =>
        review.design?.visualPolish == null ||
        Number.isFinite(review.design.visualPolish),
    ),
  );
  assert.ok(reviews.every((review) => /not evidence/i.test(review.design?.disclaimer)));
});
