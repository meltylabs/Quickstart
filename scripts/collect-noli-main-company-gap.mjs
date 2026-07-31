#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { NOLI_PRIORITY_COMPANIES } from "./lib/noli-priority-companies.mjs";
import { toCsv } from "./lib/safe-csv.mjs";

const CAPTURED_AT = new Date().toISOString();
const CAPTURE_DATE = CAPTURED_AT.slice(0, 10);
const STATIC_PAGE_CAPTURED_AT = "2026-07-28T19:27:08.058Z";
const OUTPUT_DIRECTORY = path.resolve(
  process.argv[2] ||
    "biologix-strategy-board/research/noli-research-archive-2026-07-27",
);
const USER_AGENT =
  "NoliPublicCatalogResearch/1.0 (+anonymous public GET; no cart, account, or transaction)";

const companies = NOLI_PRIORITY_COMPANIES;

const catalogHeaders = [
  "domain",
  "product_title",
  "canonical_url",
  "public_product_id",
  "public_variant_id",
  "public_sku_id",
  "category",
  "strength_size_options",
  "current_price",
  "compare_at_list_price",
  "currency",
  "stock_status",
  "backorder",
  "min_purchase",
  "max_purchase",
  "exact_public_quantity",
  "source_url",
  "extraction_method",
  "captured_at",
  "confidence",
  "caveat",
];

const summaryHeaders = [
  "domain",
  "product_count",
  "variant_count",
  "price_min",
  "price_median",
  "price_max",
  "currency",
  "visible_stock_records",
  "visible_in_stock_rate",
  "exact_quantity_records",
  "exact_quantity_sum",
  "reta_product_count",
  "reta_options_prices",
  "coverage",
  "extraction_methods",
  "source_urls",
  "captured_at",
  "confidence",
  "caveat",
];

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

function dateAgeDays(created) {
  const start = Date.parse(`${created}T00:00:00Z`);
  const end = Date.parse(`${CAPTURE_DATE}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000);
}

function registrySource(company) {
  return (
    company.registrySource ||
    `https://rdap.verisign.com/com/v1/domain/${company.domain.toUpperCase()}`
  );
}

function moneyFromWoo(prices, field) {
  const raw = Number(prices?.[field]);
  const minorUnit = Number(prices?.currency_minor_unit ?? 2);
  return Number.isFinite(raw) ? round(raw / 10 ** minorUnit, minorUnit) : "";
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#038;|&#38;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isReta(row) {
  const text = [
    row.product_title,
    row.category,
    row.strength_size_options,
  ]
    .join(" ")
    .toLowerCase();
  return (
    /\bretatrutide\b/.test(text) ||
    /\breta\b/.test(text) ||
    /\bglp[\s-]?3(?:r)?\b/.test(text) ||
    /\btriple[\s-]?agonist\b/.test(text) ||
    /\bdp3-r\b/.test(text)
  );
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
          "user-agent": USER_AGENT,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`HTTP ${response.status}; response was not JSON`);
      }
      if (!response.ok) {
        const code = parsed?.code ? `; ${parsed.code}` : "";
        throw new Error(`HTTP ${response.status}${code}`);
      }
      return { data: parsed, headers: response.headers, url };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw new Error(`${url}: ${lastError?.message || "request failed"}`);
}

async function fetchWooPages(domain, type = "") {
  const makeUrl = (page) => {
    const query = new URLSearchParams({ per_page: "100", page: String(page) });
    if (type) query.set("type", type);
    return `https://${domain}/wp-json/wc/store/v1/products?${query}`;
  };
  const first = await fetchJson(makeUrl(1));
  if (!Array.isArray(first.data)) {
    throw new Error(`${domain}: Store API did not return an array`);
  }
  const headerPages = Number(first.headers.get("x-wp-totalpages"));
  const pages = [{ ...first, page: 1 }];
  let truncated = false;
  if (Number.isFinite(headerPages) && headerPages > 0) {
    const pageCount = Math.min(headerPages, 30);
    truncated = headerPages > pageCount;
    const remaining = await Promise.all(
      Array.from({ length: pageCount - 1 }, async (_, index) => {
        const page = index + 2;
        return { ...(await fetchJson(makeUrl(page))), page };
      }),
    );
    pages.push(...remaining);
  } else {
    while (pages.at(-1).data.length === 100 && pages.length < 30) {
      const page = pages.length + 1;
      pages.push({ ...(await fetchJson(makeUrl(page))), page });
    }
    truncated = pages.length === 30 && pages.at(-1).data.length === 100;
  }
  return { pages, truncated, advertisedPages: headerPages || null };
}

function wooRow(domain, product, sourceUrl, variableParentIds) {
  const isVariation = product.type === "variation" || Number(product.parent) > 0;
  if (!isVariation && variableParentIds.has(Number(product.id))) return null;
  const prices = product.prices || {};
  const stockStatus = product.is_in_stock === true
    ? "in_stock"
    : product.is_in_stock === false
      ? "out_of_stock"
      : "unknown";
  const maximum = Number(product.add_to_cart?.maximum);
  return {
    domain,
    product_title: cleanText(product.name),
    canonical_url: cleanText(product.permalink) || `https://${domain}/`,
    public_product_id: String(isVariation ? product.parent : product.id || ""),
    public_variant_id: isVariation ? String(product.id || "") : "",
    public_sku_id: cleanText(product.sku),
    category: (product.categories || []).map((item) => cleanText(item.name)).filter(Boolean).join(" | "),
    strength_size_options: cleanText(product.variation),
    current_price: moneyFromWoo(prices, "price"),
    compare_at_list_price: moneyFromWoo(prices, "regular_price"),
    currency: cleanText(prices.currency_code).toUpperCase(),
    stock_status: stockStatus,
    backorder: product.is_on_backorder === true
      ? "yes"
      : product.is_on_backorder === false
        ? "no"
        : "unknown",
    min_purchase: Number.isFinite(Number(product.add_to_cart?.minimum))
      ? Number(product.add_to_cart.minimum)
      : "",
    max_purchase: Number.isFinite(maximum) && maximum < 9_999 ? maximum : "",
    exact_public_quantity: Number(product.low_stock_remaining) > 0
      ? Number(product.low_stock_remaining)
      : "",
    source_url: sourceUrl,
    extraction_method: isVariation
      ? "WooCommerce Store API variation"
      : "WooCommerce Store API",
    captured_at: CAPTURED_AT,
    confidence: "high",
    caveat:
      "Anonymous public Store API point-in-time capture. Binary stock and purchase limits are not sales or warehouse inventory.",
  };
}

async function collectWoo(company) {
  const [parentResult, variationResult] = await Promise.all([
    fetchWooPages(company.domain),
    fetchWooPages(company.domain, "variation").catch((error) => ({
      error: error.message,
      pages: [],
      truncated: false,
    })),
  ]);
  const parentPages = parentResult.pages;
  const variationPages = variationResult.pages;
  const variations = variationPages.flatMap((page) =>
    page.data.map((product) => ({ product, sourceUrl: page.url }))
  );
  const variableParentIds = new Set(
    variations.map(({ product }) => Number(product.parent)).filter((value) => value > 0),
  );
  const rows = [
    ...parentPages.flatMap((page) =>
      page.data.map((product) =>
        wooRow(company.domain, product, page.url, variableParentIds)
      )
    ),
    ...variations.map(({ product, sourceUrl }) =>
      wooRow(company.domain, product, sourceUrl, variableParentIds)
    ),
  ].filter(Boolean);
  const incompleteReasons = [
    parentResult.truncated ? "parent catalog exceeded the 3,000-row safety cap" : null,
    variationResult.truncated ? "variation catalog exceeded the 3,000-row safety cap" : null,
    variationResult.error ? `variation endpoint failed: ${variationResult.error}` : null,
  ].filter(Boolean);
  if (!rows.length) {
    return {
      rows,
      coverage: "unresolved_empty_public_woo_feed",
      confidence: "low",
      caveat:
        "The public WooCommerce endpoint returned no usable offers. Unknown catalog does not mean no catalog.",
    };
  }
  return {
    rows,
    coverage: incompleteReasons.length
      ? "partial_public_woo_store_api"
      : "complete_public_woo_store_api",
    confidence: incompleteReasons.length ? "medium" : "high",
    caveat: incompleteReasons.length
      ? `Anonymous public WooCommerce capture is partial: ${incompleteReasons.join("; ")}.`
      : "Anonymous public WooCommerce Store API was paginated through all advertised pages. No account, gate, cart, or transaction was used.",
  };
}

async function collectShopify(company) {
  const rows = [];
  const sources = [];
  let exhausted = false;
  for (let page = 1; page <= 20; page += 1) {
    const url = `https://${company.domain}/products.json?limit=250&page=${page}`;
    const { data } = await fetchJson(url);
    const products = Array.isArray(data?.products) ? data.products : [];
    sources.push(url);
    for (const product of products) {
      for (const variant of product.variants || []) {
        const options = [variant.option1, variant.option2, variant.option3]
          .filter((value) => value && value !== "Default Title")
          .join(" / ");
        rows.push({
          domain: company.domain,
          product_title: cleanText(product.title),
          canonical_url: `https://${company.domain}/products/${product.handle}`,
          public_product_id: String(product.id || ""),
          public_variant_id: String(variant.id || ""),
          public_sku_id: cleanText(variant.sku),
          category: cleanText(product.product_type),
          strength_size_options: options,
          current_price: Number.isFinite(Number(variant.price)) ? Number(variant.price) : "",
          compare_at_list_price: Number.isFinite(Number(variant.compare_at_price))
            ? Number(variant.compare_at_price)
            : "",
          currency: "USD",
          stock_status: variant.available === true
            ? "in_stock"
            : variant.available === false
              ? "out_of_stock"
              : "unknown",
          backorder: "unknown",
          min_purchase: "",
          max_purchase: "",
          exact_public_quantity: "",
          source_url: url,
          extraction_method: "Shopify public products feed",
          captured_at: CAPTURED_AT,
          confidence: "high",
          caveat:
            "Anonymous public Shopify feed point-in-time capture. Availability is binary and is not sales or warehouse inventory.",
        });
      }
    }
    if (products.length < 250) {
      exhausted = true;
      break;
    }
  }
  if (!rows.length) {
    return {
      rows,
      coverage: "unresolved_empty_public_shopify_feed",
      confidence: "low",
      caveat:
        "The public Shopify feed returned no usable offers. Unknown catalog does not mean no catalog.",
      sources,
    };
  }
  return {
    rows,
    coverage: exhausted
      ? "complete_public_shopify_feed"
      : "partial_public_shopify_feed_safety_cap",
    confidence: exhausted ? "high" : "medium",
    caveat: exhausted
      ? "Anonymous public Shopify product feed was paginated until empty. No account, gate, cart, or transaction was used."
      : "Anonymous public Shopify feed reached the 5,000-product safety cap, so coverage is partial.",
    sources,
  };
}

function manualRow({
  domain,
  title,
  url,
  productId,
  options,
  price = "",
  listPrice = "",
  currency = "USD",
  stock = "unknown",
  sourceUrl = url,
  caveat,
}) {
  return {
    domain,
    product_title: title,
    canonical_url: url,
    public_product_id: productId,
    public_variant_id: "",
    public_sku_id: "",
    category: "Research peptides",
    strength_size_options: options,
    current_price: price,
    compare_at_list_price: listPrice,
    currency,
    stock_status: stock,
    backorder: "unknown",
    min_purchase: "",
    max_purchase: "",
    exact_public_quantity: "",
    source_url: sourceUrl,
    extraction_method: "Anonymous public first-party product page",
    captured_at: STATIC_PAGE_CAPTURED_AT,
    confidence: "medium",
    caveat:
      caveat ||
      "Point-in-time first-party product-page observation. No account, gate, cart, or transaction was used.",
  };
}

function collectManual(company) {
  const byDomain = {
    "primelabpeptides.com": [
      [6, 90, 150],
      [12, 150, 180],
      [24, 195, 280],
    ].map(([mg, price, listPrice]) =>
      manualRow({
        domain: company.domain,
        title: `Retatrutide – ${mg}mg`,
        url: "https://primelabpeptides.com/collections/ready-to-ship",
        productId: `PLP-RETA-${mg}`,
        options: `${mg}mg single vial`,
        price,
        listPrice,
        caveat:
          "First-party collection-page fallback captured July 28, 2026; it is static unless a later live Shopify pull succeeds.",
      })
    ).concat([
      manualRow({
        domain: company.domain,
        title: "Retatrutide – 12mg (10 Vials)",
        url: "https://primelabpeptides.com/collections/bulk-offers",
        productId: "PLP-RETA-12-X10",
        options: "12mg × 10 vials",
        price: 875,
        listPrice: 1800,
        caveat:
          "First-party collection-page fallback captured July 28, 2026; it is static unless a later live Shopify pull succeeds.",
      }),
      manualRow({
        domain: company.domain,
        title: "Retatrutide – 24mg (10 Vials)",
        url: "https://primelabpeptides.com/collections/bulk-offers",
        productId: "PLP-RETA-24-X10",
        options: "24mg × 10 vials",
        price: 1300,
        listPrice: 2600,
        caveat:
          "First-party collection-page fallback captured July 28, 2026; it is static unless a later live Shopify pull succeeds.",
      }),
    ]),
    "directpeptides.com": [
      manualRow({
        domain: company.domain,
        title: "DP3-R",
        url: "https://directpeptides.com/products/dp3-r",
        productId: "DP3-R",
        options: "5mg / 10mg / 15mg / 30mg; single vial or 10-pack",
        price: 139,
        caveat:
          "The public page displayed $139 alongside multiple strength and pack options; treat it as a displayed starting/default price, not a price for every option.",
      }),
    ],
    "peptidessource.com": [
      [5, 42, 60],
      [15, 108.5, 155],
      [20, 147, 210],
      [30, 178.5, 255],
      [40, 238, 340],
      [50, 266, 380],
    ].map(([mg, price, listPrice]) =>
      manualRow({
        domain: company.domain,
        title: `GLP-3 RTA ${mg}mg`,
        url: "https://www.peptidessource.com/product-tag/weight-loss-peptide/",
        productId: `PS-RTA-${mg}`,
        options: `${mg}mg`,
        price,
        listPrice,
        sourceUrl: "https://www.peptidessource.com/product-tag/weight-loss-peptide/",
        caveat:
          "Public category-page price snapshot. Category pages can lag or differ from a product page and checkout.",
      })
    ),
    "particlepeptides.com": [
      manualRow({
        domain: company.domain,
        title: "GLP-3 10mg",
        url: "https://particlepeptides.com/en/buy-peptides/95-glp-3-10mg.html",
        productId: "PP-GLP3-10",
        options: "10mg",
        price: 113.81,
        currency: "EUR",
        stock: "in_stock",
        caveat:
          "International benchmark only. The public page explicitly states that delivery to the United States is unavailable.",
      }),
    ],
    "apex-peptides.com": [
      manualRow({
        domain: company.domain,
        title: "Retatrutide",
        url: "https://apex-peptides.com/products/retatrutide",
        productId: "APEX-RETA",
        options: "",
        caveat:
          "A first-party product route exists, but public price and offer details were not visible without a site gate. No gate was crossed.",
      }),
    ],
    "planetpeptide.com": [
      manualRow({
        domain: company.domain,
        title: "Retatrutide-RUO 30mg",
        url: "https://planetpeptide.com/shop/retatrutide-ruo-30mg/",
        productId: "PLANET-RETA-30",
        options: "30mg single vial",
        price: 140,
      }),
      manualRow({
        domain: company.domain,
        title: "Retatrutide-RUO 10mg bulk",
        url: "https://planetpeptide.com/product-category/bulk-offers/",
        productId: "PLANET-RETA-10-X10",
        options: "10mg × 10 vials",
        price: 650,
      }),
      manualRow({
        domain: company.domain,
        title: "Retatrutide-RUO 20mg bulk",
        url: "https://planetpeptide.com/product-category/bulk-offers/",
        productId: "PLANET-RETA-20-X10",
        options: "20mg × 10 vials",
        price: 950,
      }),
    ],
  };
  const rows = byDomain[company.domain] || [];
  return {
    rows,
    coverage: company.domain === "apex-peptides.com"
      ? "gated_public_catalog_unknown"
      : "partial_public_first_party_pages",
    confidence: "medium",
    caveat:
      "This is a bounded first-party page snapshot captured July 28, 2026, not a live feed or complete catalog enumeration. No account, gate, cart, or transaction was used.",
  };
}

function summarizeCatalog(company, result) {
  const rows = result.rows || [];
  const productKeys = new Set(
    rows.map((row) => row.public_product_id || row.canonical_url || row.product_title),
  );
  const prices = rows
    .map((row) => Number(row.current_price))
    .filter((value) => Number.isFinite(value) && value > 0);
  const currencies = [...new Set(rows.map((row) => row.currency).filter(Boolean))];
  const visibleStock = rows.filter((row) => row.stock_status !== "unknown");
  const inStock = visibleStock.filter((row) => row.stock_status === "in_stock");
  const exactQuantity = rows
    .map((row) => Number(row.exact_public_quantity))
    .filter((value) => Number.isFinite(value) && value > 0);
  const retaRows = rows.filter(isReta);
  const retaProducts = new Set(
    retaRows.map((row) => row.public_product_id || row.canonical_url || row.product_title),
  );
  const sourceUrls = [
    ...new Set([
      ...(result.sources || []),
      ...rows.map((row) => row.source_url).filter(Boolean),
    ]),
  ];
  return {
    domain: company.domain,
    product_count: productKeys.size,
    variant_count: rows.length,
    price_min: prices.length ? Math.min(...prices) : "",
    price_median: prices.length ? round(median(prices), 2) : "",
    price_max: prices.length ? Math.max(...prices) : "",
    currency: currencies.length === 1 ? currencies[0] : currencies.length ? "MIXED" : "",
    visible_stock_records: visibleStock.length,
    visible_in_stock_rate: visibleStock.length ? round(inStock.length / visibleStock.length, 4) : "",
    exact_quantity_records: exactQuantity.length,
    exact_quantity_sum: exactQuantity.length ? exactQuantity.reduce((sum, value) => sum + value, 0) : "",
    reta_product_count: retaProducts.size,
    reta_options_prices: retaRows
      .slice(0, 30)
      .map((row) => {
        const options = row.strength_size_options ? ` [${row.strength_size_options}]` : "";
        const price = Number(row.current_price) > 0
          ? `${row.currency || ""} ${row.current_price}`.trim()
          : "price unknown";
        return `${row.product_title}${options}: ${price}`;
      })
      .join(" | "),
    coverage: result.coverage,
    extraction_methods: [...new Set(rows.map((row) => row.extraction_method).filter(Boolean))].join(" | "),
    source_urls: sourceUrls.join(" | "),
    captured_at:
      rows.map((row) => row.captured_at).filter(Boolean).sort().at(-1) ||
      CAPTURED_AT,
    confidence: result.confidence,
    caveat: result.caveat,
  };
}

async function collectCatalog(company) {
  try {
    if (company.catalog === "woo") return await collectWoo(company);
    if (company.catalog === "shopify") {
      try {
        return await collectShopify(company);
      } catch (error) {
        const fallback = collectManual(company);
        return {
          ...fallback,
          caveat:
            `The live public Shopify feed failed (${error.message}); a July 28, 2026 first-party page snapshot is retained as a clearly static, partial fallback.`,
        };
      }
    }
    return collectManual(company);
  } catch (error) {
    return {
      rows: [],
      coverage: "unresolved_transport_failure",
      confidence: "low",
      caveat:
        `Anonymous public catalog capture failed: ${error.message}. Unknown catalog does not mean no catalog.`,
    };
  }
}

async function trafficRow(company) {
  const rankSource = `https://rank.to/api/?d=${company.domain}&n=30`;
  let ranks = [];
  let trafficError = null;
  try {
    const response = await fetchJson(rankSource);
    ranks = Object.entries(response.data?.ranks || {})
      .map(([date, rank]) => ({ date, rank: Number(rank) }))
      .filter((entry) => Number.isFinite(entry.rank) && entry.rank > 0)
      .sort((left, right) => left.date.localeCompare(right.date));
  } catch (error) {
    trafficError = error.message;
  }
  const monthlyPaces = ranks.map((entry) => 90_000_000_000 * entry.rank ** -1.05);
  const latestObservation = ranks.at(-1) || null;
  const latestRank = latestObservation?.rank ?? null;
  const latestRankDate = latestObservation?.date || null;
  const rankFreshnessDays = latestRankDate
    ? Math.floor(
        (Date.parse(`${CAPTURE_DATE}T00:00:00Z`) -
          Date.parse(`${latestRankDate}T00:00:00Z`)) /
          86_400_000,
      )
    : null;
  const rankIsCurrent =
    rankFreshnessDays != null &&
    rankFreshnessDays >= 0 &&
    rankFreshnessDays <= 7;
  const current = latestRank && rankIsCurrent
    ? Math.round(90_000_000_000 * latestRank ** -1.05)
    : null;
  const trailing = monthlyPaces.length && rankIsCurrent
    ? Math.round(monthlyPaces.reduce((sum, value) => sum + value, 0) / monthlyPaces.length)
    : null;
  const basis = rankIsCurrent
    ? ranks.length >= 28
      ? trailing
      : current
    : null;
  return {
    domain: company.domain,
    wave: company.wave || "Main company addition",
    cohort: company.cohort || "main-company-gap",
    market_scope: company.marketScope || "active-us-facing",
    domain_created: company.created,
    domain_age_days: dateAgeDays(company.created),
    domain_age_source: registrySource(company),
    rank_observations: ranks.length,
    latest_rank: latestRank,
    latest_rank_date: latestRankDate,
    rank_freshness_days: rankFreshnessDays,
    current_monthly_visits_model: current,
    trailing30_visits_model: ranks.length >= 28 ? trailing : null,
    traffic_basis_visits_model: basis,
    traffic_confidence: ranks.length >= 28 ? "low-medium" : ranks.length ? "low" : "none",
    aov_low: basis ? 100 : null,
    aov_base: basis ? 175 : null,
    aov_high: basis ? 250 : null,
    cvr_low: basis ? "1%" : null,
    cvr_base: basis ? "2%" : null,
    cvr_high: basis ? "3%" : null,
    orders_base: basis ? Math.round(basis * 0.02) : null,
    gmv_low: basis ? Math.round(basis * 0.01 * 100) : null,
    gmv_base: basis ? Math.round(basis * 0.02 * 175) : null,
    gmv_high: basis ? Math.round(basis * 0.03 * 250) : null,
    storefront_url: `https://${company.domain}/`,
    rank_source: rankSource,
    caveat: trafficError
      ? `No usable Rank.to response in this capture (${trafficError}). Unknown traffic is not zero traffic.`
      : !rankIsCurrent && latestRankDate
        ? `The latest public rank observation was ${latestRankDate}, ${rankFreshnessDays} days before this pull, so no current traffic or gross-checkout model is shown.`
      : ranks.length >= 28
        ? "Thirty-day rank observations were converted to an order-of-magnitude monthly-visit model. This is not analytics, measured traffic, revenue, or profit."
        : ranks.length
          ? `Only ${ranks.length}/30 ranked days were available, so the latest-rank pace is used. This is an order-of-magnitude model, not analytics or measured revenue.`
          : "No public rank history was available. Unknown traffic is not zero traffic.",
    rank_observations_raw: ranks,
  };
}

const [trafficRows, catalogResults] = await Promise.all([
  Promise.all(companies.map(trafficRow)),
  Promise.all(companies.map(collectCatalog)),
]);
const catalogRows = catalogResults.flatMap((result) => result.rows || []);
const summaryRows = companies.map((company, index) =>
  summarizeCatalog(company, catalogResults[index])
);

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await Promise.all([
  writeFile(
    path.join(OUTPUT_DIRECTORY, "noli-traffic-revenue-main-company-gap-2026-07-28.json"),
    `${JSON.stringify(
      {
        summary: {
          captured_at: CAPTURED_AT,
          companies: trafficRows.length,
          main_company_additions: trafficRows.filter((row) => row.cohort === "main-company-gap").length,
          priority_existing_refreshes: trafficRows.filter((row) => row.cohort === "priority-existing-refresh").length,
          modeled_domains: trafficRows.filter((row) => row.traffic_basis_visits_model).length,
          methodology:
            "Rank.to daily rank converted with 9e10 × rank^-1.05. Mean daily pace is used with 28+ observations; otherwise latest-rank pace is used. A latest observation older than seven days is retained but not modeled as current. All figures are models, not analytics or measured revenue.",
        },
        rows: trafficRows,
      },
      null,
      2,
    )}\n`,
  ),
  writeFile(
    path.join(OUTPUT_DIRECTORY, "noli-catalog-main-company-gap-2026-07-28.csv"),
    toCsv(catalogRows, catalogHeaders),
  ),
  writeFile(
    path.join(OUTPUT_DIRECTORY, "noli-catalog-summary-main-company-gap-2026-07-28.csv"),
    toCsv(summaryRows, summaryHeaders),
  ),
]);

console.log(
  JSON.stringify(
    {
      outputDirectory: OUTPUT_DIRECTORY,
      capturedAt: CAPTURED_AT,
      companies: companies.length,
      trafficModeled: trafficRows.filter((row) => row.traffic_basis_visits_model).length,
      catalogOffers: catalogRows.length,
      completeCatalogs: summaryRows.filter((row) => /^complete_/.test(row.coverage)).length,
      partialCatalogs: summaryRows.filter((row) => /^partial_/.test(row.coverage)).length,
      unresolvedCatalogs: summaryRows.filter((row) => /(unknown|unresolved)/.test(row.coverage)).length,
      catalogStatuses: Object.fromEntries(
        summaryRows.map((row) => [row.domain, {
          coverage: row.coverage,
          offers: row.variant_count,
        }]),
      ),
    },
    null,
    2,
  ),
);
