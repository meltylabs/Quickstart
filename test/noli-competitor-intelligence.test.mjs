import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { csvCell, toCsv } from "../scripts/lib/safe-csv.mjs";

const RESEARCH = new URL("../biologix-strategy-board/research/", import.meta.url);
const DATA_PATH = new URL("noli-competitor-intelligence-data.js", RESEARCH);
const CATALOG_PATH = new URL("noli-competitor-catalog-2026-07-27.json", RESEARCH);
const SUMMARY_CSV_PATH = new URL("noli-competitor-intelligence-2026-07-27.csv", RESEARCH);
const NORTHLINE_CATALOG_PATH = new URL(
  "noli-competitor-catalogs/northlinelabs.org.json",
  RESEARCH,
);
const PAGE_PATH = new URL("operating-blueprint.html", RESEARCH);
const COMPONENT_PATH = new URL("noli-competitor-intelligence.js", RESEARCH);
const CSS_PATH = new URL("noli-competitor-intelligence.css", RESEARCH);

async function loadIntelligence() {
  const source = await readFile(DATA_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: DATA_PATH.pathname });
  return context.window.NOLI_COMPETITOR_INTELLIGENCE;
}

test("CSV exports neutralize spreadsheet formulas without corrupting numeric values", () => {
  assert.equal(csvCell("=HYPERLINK(\"https://example.test\")"), `"'=HYPERLINK(""https://example.test"")"`);
  assert.equal(csvCell("+SUM(1,2)"), `"' +SUM(1,2)"`.replace("' ", "'"));
  assert.equal(csvCell("@payload"), "'@payload");
  assert.equal(csvCell("-malicious"), "'-malicious");
  assert.equal(csvCell(-12.5), "-12.5");
  assert.equal(
    toCsv([{ title: "=1+1", price: -12.5 }], ["title", "price"]),
    "title,price\n'=1+1,-12.5\n",
  );
});

test("commercial dataset keeps measured facts separate from models", async () => {
  const data = await loadIntelligence();
  const audits = Object.values(data.audits);

  assert.equal(data.stats.coreCompetitorDomains, 129);
  assert.equal(data.stats.supplementalCaseProfiles, 2);
  assert.equal(data.stats.supplementalOnlyDomains, 1);
  assert.equal(data.stats.domainsInCommercialDataset, 130);
  assert.equal(data.stats.verifiedDomainAges, 130);
  assert.equal(data.stats.trafficModeledDomains, 56);
  assert.equal(data.stats.publicCatalogsAttempted, 130);
  assert.equal(data.stats.normalizedCatalogOffers, 13_310);
  assert.equal(data.stats.retatrutideOffers, 513);
  assert.equal(audits.length, 130);
  assert.ok(
    audits
      .filter((audit) => audit.commercial.gmvBase != null)
      .every((audit) => /model|modeled/i.test(audit.commercial.caveat)),
  );
  assert.match(data.methodology.gmv, /not measured revenue or profit/i);
  assert.match(data.methodology.stock, /not sales/i);
});

test("Northline and Biologix cases preserve exact evidence boundaries", async () => {
  const data = await loadIntelligence();
  const northline = data.audits["northlinelabs.org"];
  const biologix = data.audits["biologixlabsresearch.com"];

  assert.equal(northline.commercial.trailing30VisitsModel, 57_470);
  assert.equal(northline.commercial.currentMonthlyVisitsModel, 83_086);
  assert.equal(northline.commercial.gmvBase, 195_455);
  assert.ok(northline.catalog.variantCount >= 40);
  assert.match(northline.commercial.caveat, /not measured revenue/i);

  assert.equal(biologix.commercial.trafficBasisVisitsModel, null);
  assert.equal(
    biologix.commercial.caseStudy.observedPrivateSignal.dailyGrossDisplayed,
    53_540.86,
  );
  assert.equal(
    biologix.commercial.caseStudy.observedPrivateSignal.dailyOrdersDisplayed,
    216,
  );
  assert.ok(biologix.catalog.variantCount >= 50);
  assert.match(biologix.commercial.caveat, /not an audited settlement/i);

  const northlineCatalog = JSON.parse(await readFile(NORTHLINE_CATALOG_PATH, "utf8"));
  assert.equal(northlineCatalog.domain, "northlinelabs.org");
  assert.equal(northlineCatalog.offers.length, northline.catalog.variantCount);
});

test("wave-specific schemas retain coverage, identity, timestamps, and UI findings", async () => {
  const data = await loadIntelligence();
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const sparta = data.audits["spartalabs.net"];
  const spartaOffers = catalog.byDomain["spartalabs.net"];
  const peptara = data.audits["peptara.org"];
  const waveCUnavailable = Object.entries(data.audits)
    .map(([domain, audit]) => ({ domain, audit }))
    .filter(({ audit }) =>
      /^(gated_public_catalog_unknown|unresolved_transport_failure)$/.test(
        audit.catalog.coverage,
      ),
    );
  const waveBDesign = data.audits["licensedpeptides.com"].design;

  assert.equal(data.stats.fullyEnumeratedCatalogs, 97);
  assert.equal(data.stats.partialCatalogs, 10);
  assert.equal(data.stats.unknownOrGatedCatalogs, 23);
  assert.equal(sparta.catalog.coverage, "complete_public_catalog");
  assert.equal(sparta.catalog.productCount, 12);
  assert.equal(sparta.catalog.variantCount, 28);
  assert.match(sparta.catalog.capturedAt, /^2026-07-28T/);
  assert.ok(spartaOffers.every((row) => row.publicOfferId));
  assert.ok(spartaOffers.every((row) => row.capturedAt && row.extractionMethod));
  assert.equal(peptara.catalog.variantCount, 92);
  assert.equal(peptara.catalog.retaVariantCount, 8);
  assert.equal(waveCUnavailable.length, 10);
  assert.deepEqual(
    waveCUnavailable
      .filter(({ audit }) => audit.catalog.variantCount > 0)
      .map(({ domain, audit }) => ({
        domain,
        variantCount: audit.catalog.variantCount,
      })),
    [{ domain: "apex-peptides.com", variantCount: 1 }],
  );
  assert.equal(waveBDesign.accessStatus, "account-gate");
  assert.ok(waveBDesign.reasons.length >= 2);
  assert.equal(waveBDesign.confidence, "medium");
});

test("full catalog is deduplicated, priced, and never turns stock status into quantity", async () => {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const rows = Object.entries(catalog.byDomain).flatMap(([domain, offers]) =>
    offers.map((offer) => ({ domain, ...offer })),
  );

  assert.equal(rows.length, catalog.stats.offers);
  assert.ok(rows.length >= 9_000);
  assert.ok(rows.every((row) => row.exactPublicQuantity == null || row.exactPublicQuantity > 0));
  assert.ok(rows.every((row) => row.currentPrice == null || row.currentPrice >= 0));
  assert.ok(rows.every((row) => row.domain && row.productTitle));
  assert.match(catalog.stockBoundary, /not sales or warehouse inventory/i);

  const keys = rows.map((row) => {
    if (row.publicVariantId) return `${row.domain}|variant:${row.publicVariantId}`;
    if (row.publicOfferId) return `${row.domain}|offer:${row.publicOfferId}`;
    if (row.publicSkuId) {
      return [
        row.domain,
        `sku:${row.publicSkuId}`,
        row.canonicalUrl?.split("?")[0] || "",
        row.productTitle.toLowerCase(),
        String(row.options || "").toLowerCase(),
        row.currentPrice ?? "",
        row.currency || "",
      ].join("|");
    }
    return [
      row.domain,
      row.canonicalUrl?.split("?")[0] || "",
      row.productTitle,
      row.options || "",
      row.currentPrice ?? "",
      row.currency || "",
    ].join("|");
  });
  assert.equal(new Set(keys).size, keys.length);
});

test("central page exposes compact mobile intelligence and lazy full catalogs", async () => {
  const [html, component, css, summaryCsv] = await Promise.all([
    readFile(PAGE_PATH, "utf8"),
    readFile(COMPONENT_PATH, "utf8"),
    readFile(CSS_PATH, "utf8"),
    readFile(SUMMARY_CSV_PATH, "utf8"),
  ]);

  assert.match(html, /noli-competitor-intelligence-data\.js/);
  assert.match(html, /noli-competitor-intelligence\.js/);
  assert.match(html, /noli-competitor-intelligence\.css/);
  assert.match(html, /Price, traffic, ads, and marketing—in one place/);
  assert.match(html, /noli-marketing-watch-data\.js/);
  assert.match(html, /data-ci-search/);
  assert.match(html, /Full catalog CSV/);
  assert.match(component, /catalogShardBasePath\.replace[\s\S]+\$\{safeDomain\}\.json/);
  assert.match(component, /Load full catalog/);
  assert.match(component, /Public traffic panels:/);
  assert.match(component, /Checkout scenario:/);
  assert.match(component, /UI review:/);
  assert.match(component, /commercial\.externalPanels/);
  assert.match(component, /catalogPromises\.delete\(domain\)/);
  assert.match(component, /catalogJsonPath/);
  assert.match(component, /marketingJsonPath/);
  assert.match(component, /Snap: 0 exact-domain matches in this snapshot/);
  assert.match(summaryCsv.split("\n", 1)[0], /cvr_base_assumption/);
  assert.match(summaryCsv.split("\n", 1)[0], /aov_base_assumption/);
  assert.match(summaryCsv.split("\n", 1)[0], /rank_source/);
  assert.match(summaryCsv.split("\n", 1)[0], /commercial_caveat/);
  assert.match(summaryCsv.split("\n", 1)[0], /ui_findings/);
  assert.match(css, /@media \(max-width: 460px\)/);
  assert.match(css, /overflow-x: auto/);
});
