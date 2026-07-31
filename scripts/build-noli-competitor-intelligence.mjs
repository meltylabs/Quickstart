#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { toCsv } from "./lib/safe-csv.mjs";

const GENERATED_AT = new Date().toISOString();
const GENERATED_DATE = GENERATED_AT.slice(0, 10);
const args = process.argv.slice(2);
const valuesFor = (flag) =>
  args.flatMap((value, index) => (value === flag && args[index + 1] ? [args[index + 1]] : []));
const valueFor = (flag) => valuesFor(flag).at(-1);

const trafficPaths = valuesFor("--traffic");
const catalogPaths = valuesFor("--catalog");
const catalogRefreshPaths = valuesFor("--catalog-refresh");
const catalogSummaryPaths = valuesFor("--catalog-summary");
const catalogSummaryRefreshPaths = valuesFor("--catalog-summary-refresh");
const uiPaths = valuesFor("--ui");
const outputDirectory = valueFor("--out-dir");

if (!trafficPaths.length || !catalogPaths.length || !catalogSummaryPaths.length || !uiPaths.length || !outputDirectory) {
  console.error(
    [
      "Usage:",
      "  node scripts/build-noli-competitor-intelligence.mjs",
      "    --traffic TRAFFIC.json [--traffic TRAFFIC.json ...]",
      "    --catalog CATALOG.csv [--catalog CATALOG.csv ...]",
      "    --catalog-refresh CURRENT.csv [--catalog-refresh CURRENT.csv ...]",
      "    --catalog-summary SUMMARY.csv [--catalog-summary SUMMARY.csv ...]",
      "    --catalog-summary-refresh CURRENT.csv [--catalog-summary-refresh CURRENT.csv ...]",
      "    --ui UI.json [--ui UI.json ...]",
      "    --out-dir DIRECTORY",
    ].join("\n"),
  );
  process.exit(2);
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value !== ""));
}

async function readCsv(filePath) {
  const rows = parseCsv(await readFile(filePath, "utf8"));
  if (!rows.length) return [];
  const header = rows.shift();
  return rows.map((row) =>
    Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])),
  );
}

function normalizeDomain(value) {
  if (!value) return "";
  try {
    const source = String(value).includes("://") ? String(value) : `https://${value}`;
    return new URL(source).hostname.toLowerCase().replace(/^www\./, "").replace(/^shop\./, "");
  } catch {
    return String(value).toLowerCase().replace(/^www\./, "").replace(/^shop\./, "").split("/")[0];
  }
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumberOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function integerOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed == null ? null : Math.round(parsed);
}

function round(value, places = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

function normalizedUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.href;
  } catch {
    return cleanText(value);
  }
}

function productUrlWithoutVariant(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return cleanText(value).split("?")[0].replace(/\/$/, "");
  }
}

function isRetaOffer(row) {
  const text = [
    row.productTitle,
    row.category,
    row.options,
  ].join(" ").toLowerCase();
  return (
    /\bretatrutide\b/.test(text) ||
    /\breta\b/.test(text) ||
    /\bglp[\s-]?3(?:r)?\b/.test(text) ||
    /\b3rt\b/.test(text) ||
    /\bthree[\s-]?r\b/.test(text) ||
    /\btriple[\s-]?agonist\b/.test(text) ||
    /\bly[\s-]?3437943\b/.test(text) ||
    /\b(?:ion-?3r|amp-?3p|nxp-?3p|dp3-?r)\b/.test(text)
  );
}

function normalizeCatalogRow(row) {
  const domain = normalizeDomain(row.domain);
  const title = cleanText(row.product_title);
  const canonicalUrl = normalizedUrl(row.canonical_url);
  const publicProductId = cleanText(row.public_product_id) || null;
  const publicVariantId = cleanText(row.public_variant_id) || null;
  const publicOfferId = cleanText(row.public_offer_id || row.product_id) || null;
  const publicSkuId = cleanText(row.public_sku_id || row.sku) || null;
  if (!domain || /^UNKNOWN\s+-/i.test(title)) return null;

  const stockStatus = cleanText(row.stock_status).toLowerCase() || "unknown";
  const rawPrice = numberOrNull(row.current_price);
  const hasPublicOffer =
    Boolean(
      title ||
      canonicalUrl ||
      publicProductId ||
      publicVariantId ||
      publicOfferId ||
      publicSkuId,
    ) ||
    (rawPrice != null && rawPrice > 0);
  if (!hasPublicOffer) return null;
  const explicitlyFree = rawPrice === 0 && /\bfree\b/i.test(title);
  const currentPrice = rawPrice != null && (rawPrice > 0 || explicitlyFree) ? rawPrice : null;
  const rawListPrice = numberOrNull(row.compare_at_list_price);
  const listPrice = rawListPrice != null && rawListPrice > 0 ? rawListPrice : null;
  const rawQuantity = integerOrNull(row.exact_public_quantity);
  const exactPublicQuantity = rawQuantity != null && rawQuantity > 0 ? rawQuantity : null;
  const rawMaximum = integerOrNull(row.max_purchase);
  const maximumPurchase = rawMaximum != null && rawMaximum < 9_999 ? rawMaximum : null;

  const normalized = {
    domain,
    productTitle:
      title ||
      `Untitled public orphan variation ${publicVariantId || publicOfferId || publicSkuId || "with public price"}`,
    canonicalUrl,
    publicProductId,
    publicVariantId,
    publicOfferId,
    publicSkuId,
    category: cleanText(row.category) || null,
    options: cleanText(row.strength_size_options || row.option_name) || null,
    currentPrice,
    listPrice,
    currency: cleanText(row.currency).toUpperCase() || null,
    stockStatus,
    backorder: cleanText(row.backorder).toLowerCase() || null,
    minimumPurchase: integerOrNull(row.min_purchase),
    maximumPurchase,
    exactPublicQuantity,
    sourceUrl: normalizedUrl(row.source_url),
    extractionMethod: cleanText(row.extraction_method) || null,
    capturedAt: cleanText(row.captured_at || row.extracted_at_utc) || null,
    confidence: cleanText(row.confidence).toLowerCase() || "unknown",
    caveat: [
      cleanText(row.caveat),
      title
        ? null
        : "The public feed exposed this offer without a parent title; it is retained by its public ID, URL, or price.",
    ].filter(Boolean).join(" ") || null,
  };
  normalized.isRetatrutide = isRetaOffer(normalized);
  return normalized;
}

function catalogDedupeKey(row) {
  if (row.publicVariantId) return `${row.domain}|variant:${row.publicVariantId}`;
  if (row.publicOfferId) return `${row.domain}|offer:${row.publicOfferId}`;
  if (row.publicSkuId) {
    return [
      row.domain,
      `sku:${row.publicSkuId}`,
      productUrlWithoutVariant(row.canonicalUrl),
      row.productTitle.toLowerCase(),
      String(row.options || "").toLowerCase(),
      row.currentPrice ?? "",
      row.currency || "",
    ].join("|");
  }
  return [
    row.domain,
    productUrlWithoutVariant(row.canonicalUrl),
    row.productTitle.toLowerCase(),
    String(row.options || "").toLowerCase(),
    row.currentPrice ?? "",
    row.currency || "",
  ].join("|");
}

function productDedupeKey(row) {
  if (row.publicProductId) return `${row.domain}|product:${row.publicProductId}`;
  const productUrl = productUrlWithoutVariant(row.canonicalUrl);
  return `${row.domain}|${productUrl || row.productTitle.toLowerCase()}`;
}

function formatMoney(value, currency) {
  if (!Number.isFinite(value)) return null;
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${round(value, 2)}`;
  }
}

function formatInteger(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : null;
}

function dateAgeDays(created) {
  if (!created) return null;
  const start = Date.parse(`${created}T00:00:00Z`);
  const end = Date.parse(`${GENERATED_DATE}T00:00:00Z`);
  return Number.isFinite(start) ? Math.floor((end - start) / 86_400_000) : null;
}

const trafficSources = await Promise.all(
  trafficPaths.map(async (filePath) => JSON.parse(await readFile(filePath, "utf8"))),
);
const trafficRows = trafficSources.flatMap((source) =>
  Array.isArray(source) ? source : source.rows || []
);
const baseCatalogSourceRows = (
  await Promise.all(catalogPaths.map((filePath) => readCsv(filePath)))
).flat();
const refreshedCatalogSourceRows = (
  await Promise.all(catalogRefreshPaths.map((filePath) => readCsv(filePath)))
).flat();
const baseCatalogSummaryRows = (
  await Promise.all(catalogSummaryPaths.map((filePath) => readCsv(filePath)))
).flat();
const refreshedCatalogSummaryRows = (
  await Promise.all(catalogSummaryRefreshPaths.map((filePath) => readCsv(filePath)))
).flat();
const refreshedSummaryDomains = new Set(
  refreshedCatalogSummaryRows.map((row) => normalizeDomain(row.domain)).filter(Boolean),
);
const catalogSourceRows = [
  ...baseCatalogSourceRows.filter(
    (row) => !refreshedSummaryDomains.has(normalizeDomain(row.domain)),
  ),
  ...refreshedCatalogSourceRows,
];
const catalogSummaryRows = [
  ...baseCatalogSummaryRows.filter(
    (row) => !refreshedSummaryDomains.has(normalizeDomain(row.domain)),
  ),
  ...refreshedCatalogSummaryRows,
];
const uiSources = await Promise.all(
  uiPaths.map(async (filePath) => JSON.parse(await readFile(filePath, "utf8"))),
);

const normalizedCatalog = [];
const seenCatalogRows = new Set();
for (const rawRow of catalogSourceRows) {
  const row = normalizeCatalogRow(rawRow);
  if (!row) continue;
  const key = catalogDedupeKey(row);
  if (seenCatalogRows.has(key)) continue;
  seenCatalogRows.add(key);
  normalizedCatalog.push(row);
}

normalizedCatalog.sort((left, right) =>
  left.domain.localeCompare(right.domain) ||
  left.productTitle.localeCompare(right.productTitle) ||
  String(left.options || "").localeCompare(String(right.options || "")) ||
  (left.currentPrice ?? Number.POSITIVE_INFINITY) - (right.currentPrice ?? Number.POSITIVE_INFINITY),
);

const catalogsByDomain = Object.groupBy(normalizedCatalog, (row) => row.domain);
const rawSummaryByDomain = new Map(
  catalogSummaryRows.map((row) => [normalizeDomain(row.domain), row]),
);

const uiByDomain = new Map();
for (const source of uiSources) {
  const records = source.byDomain || source.audits || source;
  for (const [domainValue, review] of Object.entries(records || {})) {
    if (!review || typeof review !== "object" || domainValue === "meta") continue;
    const domain = normalizeDomain(review.domain || domainValue);
    if (domain) uiByDomain.set(domain, review);
  }
}

const externalTrafficPanels = {
  "simplepeptide.com": [
    {
      provider: "Semrush",
      monthlyVisits: 273_570,
      period: "June 2026",
      sourceUrl: "https://www.semrush.com/website/simplepeptide.com/overview/",
    },
  ],
  "swisschems.is": [
    {
      provider: "Semrush",
      monthlyVisits: 276_970,
      period: "June 2026",
      sourceUrl: "https://www.semrush.com/website/swisschems.is/overview/?source=trending-websites",
    },
  ],
  "primepeptides.co": [
    {
      provider: "Semrush",
      monthlyVisits: 160_460,
      period: "June 2026",
      sourceUrl: "https://www.semrush.com/website/primepeptides.co/overview/",
    },
  ],
  "corepeptides.com": [
    {
      provider: "Similarweb via HypeStat",
      monthlyVisits: 29_018,
      period: "public panel checked July 2026",
      sourceUrl: "https://hypestat.com/info/corepeptides.com",
    },
    {
      provider: "Semrush via HypeStat",
      monthlyVisits: 131_629,
      period: "public panel checked July 2026",
      sourceUrl: "https://hypestat.com/info/corepeptides.com",
    },
    {
      provider: "HypeStat",
      monthlyVisits: 29_906,
      period: "public panel checked July 2026",
      sourceUrl: "https://hypestat.com/info/corepeptides.com",
    },
  ],
  "biolongevitylabs.com": [
    {
      provider: "HypeStat",
      monthlyVisits: 720,
      period: "public panel checked July 2026",
      sourceUrl: "https://hypestat.com/info/biolongevitylabs.com",
    },
  ],
  "ameanopeptides.com": [
    {
      provider: "Semrush",
      monthlyVisits: 239_820,
      period: "June 2026",
      sourceUrl: "https://www.semrush.com/website/ameanopeptides.com/overview/",
    },
  ],
  "nexaph.com": [
    {
      provider: "Semrush",
      monthlyVisits: 214_760,
      period: "June 2026",
      sourceUrl: "https://www.semrush.com/website/nexaph.com/overview/",
    },
  ],
  "verifiedpeptides.com": [
    {
      provider: "HypeStat",
      monthlyVisits: 97_600,
      period: "public panel checked July 2026",
      sourceUrl: "https://hypestat.com/info/verifiedpeptides.com",
    },
  ],
  "purerawz.co": [
    {
      provider: "Semrush",
      monthlyVisits: 71_690,
      period: "June 2026",
      sourceUrl: "https://www.semrush.com/website/purerawz.co/overview/",
    },
  ],
};

const caseOverrides = {
  "northlinelabs.org": {
    domain: "northlinelabs.org",
    wave: "Supplemental case",
    domain_created: "2025-12-19",
    domain_age_days: dateAgeDays("2025-12-19"),
    domain_age_source: "https://rdap.publicinterestregistry.org/rdap/domain/northlinelabs.org",
    rank_observations: 30,
    latest_rank: 565_815,
    current_monthly_visits_model: 82_023,
    trailing30_visits_model: 55_638,
    traffic_basis_visits_model: 55_638,
    traffic_confidence: "low-medium",
    aov_low: 175,
    aov_base: 190,
    aov_high: 210,
    cvr_low: "1.5%",
    cvr_base: "1.79%",
    cvr_high: "2.5%",
    orders_base: 996,
    gmv_low: 146_000,
    gmv_base: 189_225,
    gmv_high: 292_000,
    storefront_url: "https://northlinelabs.org/",
    rank_source: "https://rank.to/api/?d=northlinelabs.org&n=30",
    caveat:
      "Modeled trailing-30-day gross checkout volume, not measured revenue, profit, or settlement. Current pace is higher after rapid rank growth: about 82,023 modeled monthly visits, 1,468 orders at 1.79%, and $278,960 gross checkout at $190 AOV.",
    caseStudy: {
      label: "Northline",
      observedPrivateSignal: null,
      decision:
        "Use the trailing 30-day integral for the base case and the latest-rank pace only as the current run-rate scenario.",
    },
  },
  "biologixlabsresearch.com": {
    domain: "biologixlabsresearch.com",
    wave: "Supplemental case",
    domain_created: "2025-09-14",
    domain_age_days: dateAgeDays("2025-09-14"),
    domain_age_source: "https://rdap.verisign.com/com/v1/domain/biologixlabsresearch.com",
    rank_observations: 0,
    latest_rank: null,
    current_monthly_visits_model: null,
    trailing30_visits_model: null,
    traffic_basis_visits_model: null,
    traffic_confidence: "private-signal-only",
    aov_low: null,
    aov_base: 247.87,
    aov_high: null,
    cvr_low: null,
    cvr_base: null,
    cvr_high: null,
    orders_base: null,
    gmv_low: null,
    gmv_base: null,
    gmv_high: null,
    storefront_url: "https://biologixlabsresearch.com/",
    rank_source: "https://rank.to/api/?d=biologixlabsresearch.com&n=30",
    caveat:
      "No independent public traffic panel returned a usable domain estimate. A private screen shown to Alex displayed $53,540.86 and 216 orders for one day; that is a strong private signal but not an audited settlement or a stable daily average.",
    caseStudy: {
      label: "Biologix / Braden",
      observedPrivateSignal: {
        dailyGrossDisplayed: 53_540.86,
        dailyOrdersDisplayed: 216,
        displayedAov: 247.87,
        sustained30DayGrossIllustration: 1_606_225.8,
        sustained30DayOrdersIllustration: 6_480,
        impliedMonthlyVisitsAt179Pct: 362_011,
        impliedMonthlyVisitsAt4Pct: 162_000,
        impliedMonthlyVisitsAt5Pct: 129_600,
        impliedMonthlyVisitsAt8Pct: 81_000,
      },
      publicFootprint: {
        currentBusinessEmail: "support@biologixlabsresearch.com",
        contactSource: "https://biologixlabsresearch.com/contact-us/",
        officialPhone: null,
        identityStatus:
          "No public source verified Braden's surname or a founder, owner, or officer title.",
        forumStatus:
          "No exact brand/domain discussion surfaced on Reddit, BlackHatWorld, the major peptide/bodybuilding forums checked, or public social search.",
        independentReviewStatus:
          "No stable independent customer-review corpus surfaced. Automated reputation sites conflict and are not customer evidence.",
        vendorHostedReviewCount: 1,
        affiliateClaim:
          "The first-party partner page advertises 15% commission and weekly payouts.",
        affiliateSource: "https://biologixlabsresearch.com/partners/",
        scanDate: "2026-07-28",
        boundary:
          "No leaked contact data was used and no pseudonymous account was attributed without explicit public self-identification.",
      },
      decision:
        "Treat the live Woo screen as better evidence than public inventory movement. Verify settlements, refunds, reserves, new/returning mix, and traffic before using it as a valuation base.",
    },
  },
};

const trafficByDomain = new Map(
  trafficRows.map((row) => [normalizeDomain(row.domain), row]),
);
for (const [domain, override] of Object.entries(caseOverrides)) {
  const current = trafficByDomain.get(domain);
  if (domain !== "northlinelabs.org" || !current) {
    trafficByDomain.set(domain, override);
    continue;
  }
  const basis = numberOrNull(current.traffic_basis_visits_model);
  const currentPace = numberOrNull(current.current_monthly_visits_model);
  const ordersBase = basis == null ? null : Math.round(basis * 0.0179);
  const gmvLow = basis == null ? null : Math.round(basis * 0.015 * 175);
  const gmvBase = basis == null ? null : Math.round(basis * 0.0179 * 190);
  const gmvHigh = basis == null ? null : Math.round(basis * 0.025 * 210);
  const currentPaceGmv = currentPace == null
    ? null
    : Math.round(currentPace * 0.0179 * 190);
  trafficByDomain.set(domain, {
    ...override,
    ...current,
    aov_low: 175,
    aov_base: 190,
    aov_high: 210,
    cvr_low: "1.5%",
    cvr_base: "1.79%",
    cvr_high: "2.5%",
    orders_base: ordersBase,
    gmv_low: gmvLow,
    gmv_base: gmvBase,
    gmv_high: gmvHigh,
    caveat: basis == null
      ? "The current public rank pull failed, so no traffic or gross-checkout run rate is shown."
      : `Modeled from the current public rank history. Current-pace gross checkout is about ${formatMoney(currentPaceGmv, "USD")} at 1.79% conversion and $190 AOV.`,
    caseStudy: override.caseStudy,
  });
}

const allDomains = new Set([
  ...trafficByDomain.keys(),
  ...rawSummaryByDomain.keys(),
  ...Object.keys(catalogsByDomain),
]);

function buildCatalogSummary(domain) {
  const rows = catalogsByDomain[domain] || [];
  const raw = rawSummaryByDomain.get(domain) || {};
  const productKeys = new Set(rows.map(productDedupeKey));
  const positivePrices = rows.map((row) => row.currentPrice).filter((value) => value != null && value > 0);
  const currencies = unique(rows.map((row) => row.currency));
  const visibleStockRows = rows.filter((row) => row.stockStatus !== "unknown");
  const inStockRows = visibleStockRows.filter((row) => row.stockStatus === "in_stock");
  const exactRows = rows.filter((row) => row.exactPublicQuantity != null);
  const retaRows = rows.filter((row) => row.isRetatrutide);
  const retaProductKeys = new Set(retaRows.map(productDedupeKey));
  const sourceCoverage = cleanText(raw.coverage);
  const sourceStatus = cleanText(raw.status).toLowerCase();
  const coverage = sourceCoverage || ({
    complete: "complete_public_catalog",
    access_gated: "gated_public_catalog_unknown",
    transport_failure: "unresolved_transport_failure",
  })[sourceStatus] || (rows.length ? "partial_public_catalog" : "unknown");
  const confidence = cleanText(raw.confidence).toLowerCase() || (rows.length ? "medium" : "unknown");
  const rawCaveat = cleanText(raw.caveat);
  const extractionMethods = unique(rows.map((row) => row.extractionMethod));
  const isCurrentRefreshDomain = refreshedSummaryDomains.has(domain);
  const hasLiveFeedMethod = extractionMethods.some((method) =>
    /(WooCommerce|Shopify public products feed)/i.test(method)
  );
  const refreshMode = !isCurrentRefreshDomain
    ? "archived"
    : /^complete_/i.test(coverage) && hasLiveFeedMethod
      ? "live"
      : /^partial_/i.test(coverage) && hasLiveFeedMethod
        ? "live-partial"
        : /^partial_/i.test(coverage)
          ? "static"
          : "unresolved";
  const normalizationCaveat = [
    "Duplicate public offers were removed.",
    "Blank and placeholder zero prices are excluded from price statistics.",
    "Exact quantity is retained only when a positive public quantity field is explicitly exposed.",
    "Stock is a point-in-time storefront signal, not sales or warehouse inventory.",
  ].join(" ");

  return {
    productCount: integerOrNull(raw.product_count) ?? productKeys.size,
    variantCount: rows.length || integerOrNull(raw.variant_count || raw.variant_row_count) || 0,
    priceMin: positivePrices.length ? Math.min(...positivePrices) : null,
    priceMedian: round(median(positivePrices), 2),
    priceMax: positivePrices.length ? Math.max(...positivePrices) : null,
    currency: currencies.length === 1 ? currencies[0] : currencies.length ? "MIXED" : cleanText(raw.currency) || null,
    pricedOfferCount: positivePrices.length,
    visibleStockRecords: visibleStockRows.length,
    visibleInStockRate: visibleStockRows.length ? round(inStockRows.length / visibleStockRows.length, 4) : null,
    exactQuantityRecords: exactRows.length,
    retaProductCount: retaProductKeys.size,
    retaVariantCount: retaRows.length,
    retaOffers: retaRows.slice(0, 30).map((row) => ({
      title: row.productTitle,
      options: row.options,
      currentPrice: row.currentPrice,
      listPrice: row.listPrice,
      currency: row.currency,
      stockStatus: row.stockStatus,
      url: row.canonicalUrl,
    })),
    coverage,
    extractionMethods,
    refreshMode,
    capturedAt:
      unique(rows.map((row) => row.capturedAt)).sort().at(-1) ||
      cleanText(raw.captured_at || raw.extracted_at_utc) ||
      null,
    confidence,
    caveat: [rawCaveat, normalizationCaveat].filter(Boolean).join(" "),
  };
}

function buildCommercialSummary(domain) {
  const raw = trafficByDomain.get(domain) || {};
  const panels = externalTrafficPanels[domain] || [];
  const panelValues = panels.map((panel) => panel.monthlyVisits).filter(Number.isFinite);
  const hasModeledCommercialValue = [
    raw.current_monthly_visits_model,
    raw.trailing30_visits_model,
    raw.traffic_basis_visits_model,
    raw.orders_base,
    raw.gmv_low,
    raw.gmv_base,
    raw.gmv_high,
  ].some((value) => numberOrNull(value) != null);
  const rawCaveat =
    cleanText(raw.caveat) ||
    "No public rank history was available. Unknown traffic is not zero traffic.";
  const modelBoundary =
    "Traffic, orders, and gross checkout figures are modeled scenarios—not measured revenue, profit, analytics, or settlement.";
  return {
    cohort: cleanText(raw.cohort || raw.wave) || null,
    mainCompanyAddition: cleanText(raw.cohort).toLowerCase() === "main-company-gap",
    marketScope: cleanText(raw.market_scope) || null,
    domainCreated: cleanText(raw.domain_created) || null,
    domainAgeDays: integerOrNull(raw.domain_age_days),
    domainAgeSource: normalizedUrl(raw.domain_age_source),
    rankObservations: integerOrNull(raw.rank_observations) || 0,
    latestRank: integerOrNull(raw.latest_rank),
    latestRankDate: cleanText(raw.latest_rank_date) || null,
    rankFreshnessDays: integerOrNull(raw.rank_freshness_days),
    currentMonthlyVisitsModel: integerOrNull(raw.current_monthly_visits_model),
    trailing30VisitsModel: integerOrNull(raw.trailing30_visits_model),
    trafficBasisVisitsModel: integerOrNull(raw.traffic_basis_visits_model),
    trafficConfidence: cleanText(raw.traffic_confidence) || "none",
    aovLow: numberOrNull(raw.aov_low),
    aovBase: numberOrNull(raw.aov_base),
    aovHigh: numberOrNull(raw.aov_high),
    cvrLow: cleanText(raw.cvr_low) || null,
    cvrBase: cleanText(raw.cvr_base) || null,
    cvrHigh: cleanText(raw.cvr_high) || null,
    ordersBase: integerOrNull(raw.orders_base),
    gmvLow: integerOrNull(raw.gmv_low),
    gmvBase: integerOrNull(raw.gmv_base),
    gmvHigh: integerOrNull(raw.gmv_high),
    storefrontUrl: normalizedUrl(raw.storefront_url) || `https://${domain}/`,
    rankSource: normalizedUrl(raw.rank_source),
    externalPanels: panels,
    externalPanelRange: panelValues.length
      ? { minimum: Math.min(...panelValues), maximum: Math.max(...panelValues) }
      : null,
    caveat: hasModeledCommercialValue
      ? `${modelBoundary} ${rawCaveat}`
      : rawCaveat,
    caseStudy: raw.caseStudy || null,
  };
}

function buildDesignSummary(domain) {
  const review = uiByDomain.get(domain);
  if (!review) return null;
  const scores = review.scores || review.design || {};
  const overall = numberOrNull(review.overall ?? scores.overall);
  return {
    overall,
    mobileUsability: numberOrNull(scores.mobileUsability),
    visualPolish: numberOrNull(scores.visualPolish),
    productClarity: numberOrNull(scores.productClarity),
    trustPresentation: numberOrNull(scores.trustPresentation),
    conversionUx: numberOrNull(scores.conversionUX ?? scores.conversionUx),
    performance: numberOrNull(scores.performance),
    accessStatus: cleanText(review.accessStatus || review.firstLoadState) || null,
    accessScope: cleanText(review.firstLoadScope) || null,
    reasons: Array.isArray(review.reasons)
      ? review.reasons.map(cleanText).filter(Boolean).slice(0, 4)
      : [],
    confidence: cleanText(review.confidence) || null,
    strongestLesson: cleanText(review.strongestDesignLesson) || null,
    biggestFailure: cleanText(review.biggestUXFailure) || null,
    scoredUrl: normalizedUrl(review.scoredUrl || review.productUrl || review.homepageUrl),
    screenshotReviewed: true,
    disclaimer:
      "A screenshot-reviewed storefront score. It is not evidence of product quality, safety, legality, traffic, or revenue.",
  };
}

const summaries = [...allDomains].map((domain) => {
  const commercial = buildCommercialSummary(domain);
  const catalog = buildCatalogSummary(domain);
  const design = buildDesignSummary(domain);
  const caseStudy = caseOverrides[domain]?.caseStudy || null;
  return { domain, commercial, catalog, design, caseStudy };
});

summaries.sort((left, right) =>
  (right.commercial.trafficBasisVisitsModel ?? -1) -
    (left.commercial.trafficBasisVisitsModel ?? -1) ||
  (right.catalog.variantCount ?? 0) - (left.catalog.variantCount ?? 0) ||
  left.domain.localeCompare(right.domain),
);

const audits = Object.fromEntries(
  summaries.map((summary) => {
    const { domain, commercial, catalog, design, caseStudy } = summary;
    const evidence = unique([
      commercial.domainAgeSource,
      commercial.rankSource,
      commercial.storefrontUrl,
      ...commercial.externalPanels.map((panel) => panel.sourceUrl),
      ...(catalogsByDomain[domain] || []).slice(0, 4).map((row) => row.sourceUrl),
    ]).map((url, index) => ({
      label: index === 0 ? "Domain registry" : index === 1 ? "Traffic model" : `Commercial evidence ${index + 1}`,
      url,
    }));
    return [
      domain,
      {
        commercial,
        catalog,
        design: design
          ? {
              ...design,
              scoringBasis: "Screenshot-reviewed mobile and desktop storefront audit.",
            }
          : undefined,
        caseStudy,
        evidence,
      },
    ];
  }),
);

const fullyEnumerated = summaries.filter((row) => /^complete_/i.test(row.catalog.coverage)).length;
const partialCatalogs = summaries.filter((row) => /^partial_/i.test(row.catalog.coverage)).length;
const unknownCatalogs = summaries.filter((row) =>
  /(unknown|gated|unresolved)/i.test(row.catalog.coverage),
).length;
const liveRefreshedCatalogs = summaries.filter((row) =>
  /^live(?:-partial)?$/.test(row.catalog.refreshMode)
).length;
const staticRefreshCatalogs = summaries.filter((row) =>
  row.catalog.refreshMode === "static"
).length;
const unresolvedRefreshCatalogs = summaries.filter((row) =>
  row.catalog.refreshMode === "unresolved"
).length;
const archivedCatalogs = summaries.filter((row) =>
  row.catalog.refreshMode === "archived"
).length;
const capturedAt = unique(summaries.map((row) => row.catalog.capturedAt)).sort().at(-1) || "2026-07-27";
const coreCompetitorDomains = new Set(
  trafficRows.map((row) => normalizeDomain(row.domain)),
);
const supplementalCaseProfiles = Object.keys(caseOverrides);

const stats = {
  coreCompetitorDomains: coreCompetitorDomains.size,
  supplementalCaseProfiles: supplementalCaseProfiles.length,
  supplementalOnlyDomains: supplementalCaseProfiles.filter(
    (domain) => !coreCompetitorDomains.has(domain),
  ).length,
  domainsInCommercialDataset: summaries.length,
  mainCompanyAdditions: summaries.filter((row) => row.commercial.mainCompanyAddition).length,
  verifiedDomainAges: summaries.filter((row) => row.commercial.domainCreated).length,
  trafficModeledDomains: summaries.filter((row) => row.commercial.trafficBasisVisitsModel != null).length,
  publicCatalogsAttempted: rawSummaryByDomain.size,
  fullyEnumeratedCatalogs: fullyEnumerated,
  partialCatalogs,
  unknownOrGatedCatalogs: unknownCatalogs,
  liveRefreshedCatalogs,
  staticRefreshCatalogs,
  unresolvedRefreshCatalogs,
  archivedCatalogs,
  normalizedCatalogOffers: normalizedCatalog.length,
  pricedCatalogOffers: normalizedCatalog.filter((row) => row.currentPrice != null && row.currentPrice > 0).length,
  retatrutideOffers: normalizedCatalog.filter((row) => row.isRetatrutide).length,
  exactQuantityRecords: normalizedCatalog.filter((row) => row.exactPublicQuantity != null).length,
  screenshotReviewedDomains: uiByDomain.size,
  screenshotScoredDomains: [...uiByDomain.values()].filter(
    (review) => numberOrNull(review.overall ?? review.scores?.overall) != null,
  ).length,
};

const payload = {
  generatedAt: GENERATED_AT,
  capturedAt,
  catalogShardBasePath: "./noli-competitor-catalogs",
  catalogExportPath: "./noli-competitor-catalog-2026-07-27.csv",
  commercialExportPath: "./noli-competitor-intelligence-2026-07-27.csv",
  stats,
  methodology: {
    traffic:
      "Rank.to daily rank converted with 9e10 × rank^-1.05. A 30-day integral is used with 28+ observations; otherwise the latest-rank monthly pace is used. These are order-of-magnitude models, not analytics.",
    gmv:
      "Modeled visits × stated conversion scenario × modeled AOV. This is hypothetical gross checkout volume before refunds, disputes, taxes, reserves, settlement loss, or costs—not measured revenue or profit.",
    catalog:
      "Anonymous public GET only. Public Shopify/Woo/API feeds, sitemaps, JSON-LD, and visible product pages were paginated when available. No account, gate acceptance, cart, order, payment, form, credential, or bypass.",
    stock:
      "In stock is a binary storefront signal. Exact quantity is retained only when a positive quantity is explicitly exposed. Stock status and public inventory movement are not sales or warehouse inventory.",
    design:
      "Screenshot-reviewed desktop and 390px-mobile heuristic. UI quality is separate from product quality, legality, payment durability, traffic, and revenue.",
  },
  caseStudies: Object.fromEntries(
    Object.keys(caseOverrides).map((domain) => [domain, audits[domain]]),
  ),
  topTrafficModels: summaries
    .filter((row) => row.commercial.trafficBasisVisitsModel != null)
    .slice(0, 20)
    .map((row) => ({
      domain: row.domain,
      visits: row.commercial.trafficBasisVisitsModel,
      gmvBase: row.commercial.gmvBase,
      confidence: row.commercial.trafficConfidence,
    })),
  topCatalogs: [...summaries]
    .filter((row) => row.catalog.retaVariantCount > 0)
    .sort((left, right) => right.catalog.variantCount - left.catalog.variantCount)
    .slice(0, 20)
    .map((row) => ({
      domain: row.domain,
      products: row.catalog.productCount,
      offers: row.catalog.variantCount,
      medianPrice: row.catalog.priceMedian,
      currency: row.catalog.currency,
      coverage: row.catalog.coverage,
    })),
  topDesign: [...summaries]
    .filter((row) => row.design?.overall != null)
    .sort((left, right) => right.design.overall - left.design.overall)
    .slice(0, 20)
    .map((row) => ({
      domain: row.domain,
      overall: row.design.overall,
      accessStatus: row.design.accessStatus,
      reasons: row.design.reasons.slice(0, 2),
      strongestLesson: row.design.strongestLesson,
      biggestFailure: row.design.biggestFailure,
    })),
  audits,
};

const webCatalogsByDomain = Object.fromEntries(
  Object.entries(catalogsByDomain).map(([domain, rows]) => [
    domain,
    rows.map((row) => ({
      domain: row.domain,
      productTitle: row.productTitle,
      canonicalUrl: row.canonicalUrl,
      publicProductId: row.publicProductId,
      publicVariantId: row.publicVariantId,
      publicOfferId: row.publicOfferId,
      publicSkuId: row.publicSkuId,
      category: row.category,
      options: row.options,
      currentPrice: row.currentPrice,
      listPrice: row.listPrice,
      currency: row.currency,
      stockStatus: row.stockStatus,
      backorder: row.backorder,
      minimumPurchase: row.minimumPurchase,
      maximumPurchase: row.maximumPurchase,
      exactPublicQuantity: row.exactPublicQuantity,
      isRetatrutide: row.isRetatrutide,
      sourceUrl: row.sourceUrl,
      confidence: row.confidence,
      extractionMethod: row.extractionMethod,
      capturedAt: row.capturedAt,
      caveat: row.caveat,
    })),
  ]),
);

const catalogPayload = {
  generatedAt: GENERATED_AT,
  capturedAt,
  stats: {
    domains: Object.keys(catalogsByDomain).length,
    offers: normalizedCatalog.length,
    pricedOffers: stats.pricedCatalogOffers,
    retatrutideOffers: stats.retatrutideOffers,
    exactQuantityRecords: stats.exactQuantityRecords,
  },
  methodology: payload.methodology.catalog,
  stockBoundary: payload.methodology.stock,
  byDomain: webCatalogsByDomain,
};

const summaryRows = summaries.map((row) => ({
  domain: row.domain,
  cohort: row.commercial.cohort,
  main_company_addition: row.commercial.mainCompanyAddition,
  market_scope: row.commercial.marketScope,
  storefront_url: row.commercial.storefrontUrl,
  domain_created: row.commercial.domainCreated,
  domain_age_days: row.commercial.domainAgeDays,
  domain_age_source: row.commercial.domainAgeSource,
  rank_observations: row.commercial.rankObservations,
  latest_rank: row.commercial.latestRank,
  latest_rank_date: row.commercial.latestRankDate,
  rank_freshness_days: row.commercial.rankFreshnessDays,
  rank_source: row.commercial.rankSource,
  traffic_basis_visits_model: row.commercial.trafficBasisVisitsModel,
  current_monthly_visits_model: row.commercial.currentMonthlyVisitsModel,
  trailing30_visits_model: row.commercial.trailing30VisitsModel,
  traffic_confidence: row.commercial.trafficConfidence,
  external_panel_minimum: row.commercial.externalPanelRange?.minimum,
  external_panel_maximum: row.commercial.externalPanelRange?.maximum,
  external_public_panels: row.commercial.externalPanels.map((panel) =>
    [
      panel.provider,
      panel.monthlyVisits,
      panel.period,
      panel.sourceUrl,
    ].filter((value) => value != null && value !== "").join(" | ")
  ).join(" || "),
  cvr_low_assumption: row.commercial.cvrLow,
  cvr_base_assumption: row.commercial.cvrBase,
  cvr_high_assumption: row.commercial.cvrHigh,
  aov_low_assumption: row.commercial.aovLow,
  aov_base_assumption: row.commercial.aovBase,
  aov_high_assumption: row.commercial.aovHigh,
  orders_base_model: row.commercial.ordersBase,
  gmv_low_model: row.commercial.gmvLow,
  gmv_base_model: row.commercial.gmvBase,
  gmv_high_model: row.commercial.gmvHigh,
  commercial_caveat: row.commercial.caveat,
  catalog_coverage: row.catalog.coverage,
  catalog_refresh_mode: row.catalog.refreshMode,
  catalog_captured_at: row.catalog.capturedAt,
  catalog_confidence: row.catalog.confidence,
  catalog_extraction_methods: row.catalog.extractionMethods.join(" | "),
  product_count: row.catalog.productCount,
  variant_offer_count: row.catalog.variantCount,
  priced_offer_count: row.catalog.pricedOfferCount,
  price_min: row.catalog.priceMin,
  price_median: row.catalog.priceMedian,
  price_max: row.catalog.priceMax,
  currency: row.catalog.currency,
  reta_product_count: row.catalog.retaProductCount,
  reta_variant_offer_count: row.catalog.retaVariantCount,
  visible_stock_records: row.catalog.visibleStockRecords,
  visible_in_stock_rate: row.catalog.visibleInStockRate,
  exact_quantity_records: row.catalog.exactQuantityRecords,
  catalog_caveat: row.catalog.caveat,
  ui_overall: row.design?.overall,
  ui_visual_polish: row.design?.visualPolish,
  ui_mobile_usability: row.design?.mobileUsability,
  ui_product_clarity: row.design?.productClarity,
  ui_trust_presentation: row.design?.trustPresentation,
  ui_conversion_ux: row.design?.conversionUx,
  ui_performance: row.design?.performance,
  ui_access_status: row.design?.accessStatus,
  ui_confidence: row.design?.confidence,
  ui_findings: row.design?.reasons.join(" | "),
  ui_strongest_lesson: row.design?.strongestLesson,
  ui_biggest_failure: row.design?.biggestFailure,
  ui_scored_url: row.design?.scoredUrl,
  model_boundary:
    "Traffic and GMV are modeled, not measured. Catalog and stock are point-in-time public observations.",
}));

const catalogCsvRows = normalizedCatalog.map((row) => ({
  domain: row.domain,
  product_title: row.productTitle,
  canonical_url: row.canonicalUrl,
  public_product_id: row.publicProductId,
  public_variant_id: row.publicVariantId,
  public_offer_id: row.publicOfferId,
  public_sku_id: row.publicSkuId,
  category: row.category,
  strength_size_options: row.options,
  current_price: row.currentPrice,
  compare_at_list_price: row.listPrice,
  currency: row.currency,
  stock_status: row.stockStatus,
  backorder: row.backorder,
  min_purchase: row.minimumPurchase,
  max_purchase: row.maximumPurchase,
  exact_public_quantity: row.exactPublicQuantity,
  is_retatrutide: row.isRetatrutide,
  source_url: row.sourceUrl,
  extraction_method: row.extractionMethod,
  captured_at: row.capturedAt,
  confidence: row.confidence,
  caveat: row.caveat,
}));

await mkdir(outputDirectory, { recursive: true });
const catalogShardDirectory = path.join(outputDirectory, "noli-competitor-catalogs");
await mkdir(catalogShardDirectory, { recursive: true });
await Promise.all([
  writeFile(
    path.join(outputDirectory, "noli-competitor-intelligence-data.js"),
    `window.NOLI_COMPETITOR_INTELLIGENCE = ${JSON.stringify(payload)};\n`,
  ),
  writeFile(
    path.join(outputDirectory, "noli-competitor-catalog-2026-07-27.json"),
    `${JSON.stringify(catalogPayload)}\n`,
  ),
  writeFile(
    path.join(outputDirectory, "noli-competitor-intelligence-2026-07-27.csv"),
    toCsv(summaryRows, Object.keys(summaryRows[0])),
  ),
  writeFile(
    path.join(outputDirectory, "noli-competitor-catalog-2026-07-27.csv"),
    toCsv(catalogCsvRows, Object.keys(catalogCsvRows[0])),
  ),
  ...summaries.map((summary) =>
    writeFile(
      path.join(catalogShardDirectory, `${summary.domain}.json`),
      `${JSON.stringify({
        generatedAt: GENERATED_AT,
        capturedAt: summary.catalog.capturedAt,
        refreshMode: summary.catalog.refreshMode,
        domain: summary.domain,
        offers: webCatalogsByDomain[summary.domain] || [],
        methodology: payload.methodology.catalog,
        stockBoundary: payload.methodology.stock,
      })}\n`,
    ),
  ),
]);

console.log(
  JSON.stringify(
    {
      outputDirectory,
      generatedAt: capturedAt,
      stats,
      topTrafficModel: payload.topTrafficModels[0] || null,
      topCatalog: payload.topCatalogs[0] || null,
      topDesign: payload.topDesign[0] || null,
      examples: {
        northline: {
          commercial: audits["northlinelabs.org"]?.commercial,
          catalog: audits["northlinelabs.org"]?.catalog,
        },
        biologix: {
          commercial: audits["biologixlabsresearch.com"]?.commercial,
          catalog: audits["biologixlabsresearch.com"]?.catalog,
        },
      },
    },
    null,
    2,
  ),
);
