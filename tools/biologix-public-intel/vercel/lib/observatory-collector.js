import { resolve4, resolve6, resolveMx, resolveNs } from "node:dns/promises";

import {
  compactWhitespace,
  contentHash,
  safeSnippet,
  stableHash,
  validateCadence,
  validateTargetUrl,
} from "./observatory-core.js";
import { fetchBoundedPublic } from "./observatory-fetch.js";

const TRACKERS = [
  ["google_tag_manager", /\bGTM-[A-Z0-9]{5,}\b/i],
  ["google_analytics", /\bG-[A-Z0-9]{6,}\b/i],
  ["google_ads", /\bAW-\d{5,}\b/i],
  ["meta_pixel", /connect\.facebook\.net|fbq\(\s*['"]init/i],
  ["tiktok_pixel", /analytics\.tiktok\.com|ttq\.load/i],
  ["microsoft_clarity", /clarity\.ms\/tag\//i],
  ["hotjar", /hotjar|hjid\s*[:=]/i],
  ["klaviyo", /klaviyo/i],
];

const CATALOG_PAGE_LIMIT = 20;
const CATALOG_OFFER_LIMIT = 3_000;
const WOO_PAGE_SIZE = 100;
const SHOPIFY_PAGE_SIZE = 250;

const SOCIAL_HOSTS = new Map([
  ["instagram.com", "instagram"],
  ["facebook.com", "facebook"],
  ["tiktok.com", "tiktok"],
  ["youtube.com", "youtube"],
  ["x.com", "x"],
  ["twitter.com", "x"],
]);

function extractTitle(html) {
  return safeSnippet(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 180);
}

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = html.match(
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)`, "i"),
  );
  const reversed = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"),
  );
  return safeSnippet(first?.[1] ?? reversed?.[1] ?? "", 300) || null;
}

function extractLinks(html, baseUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      links.push({
        url: new URL(match[1], baseUrl).toString(),
        text: safeSnippet(match[2], 100),
      });
    } catch {
      // Ignore malformed public links.
    }
  }
  return links;
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  return [value, ...Object.values(value).flatMap(flattenJsonLd)];
}

function extractJsonLd(html) {
  const values = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      values.push(...flattenJsonLd(JSON.parse(match[1])));
    } catch {
      // Invalid structured data is recorded only through the page hash.
    }
  }
  return values;
}

function normalizedPrice(value) {
  const price = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(price) && price > 0 && price < 100_000 ? price : null;
}

function extractOffers(html) {
  const offers = [];
  const jsonLd = extractJsonLd(html);
  for (const node of jsonLd) {
    const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : node["@type"];
    if (!/offer/i.test(String(type ?? ""))) continue;
    const price = normalizedPrice(node.price ?? node.lowPrice ?? node.highPrice);
    if (price === null) continue;
    offers.push({
      price,
      currency: String(node.priceCurrency ?? "USD").toUpperCase().slice(0, 3),
      availability: String(node.availability ?? "").split("/").at(-1).toLowerCase() || null,
      source: "json_ld",
    });
  }
  const metaPrice =
    extractMeta(html, "product:price:amount") ??
    html.match(/itemprop=["']price["'][^>]+content=["']([^"']+)/i)?.[1] ??
    null;
  const parsedMeta = normalizedPrice(metaPrice);
  if (parsedMeta !== null && !offers.some((offer) => offer.price === parsedMeta)) {
    offers.push({
      price: parsedMeta,
      currency: extractMeta(html, "product:price:currency") ?? "USD",
      availability: null,
      source: "product_meta",
    });
  }
  return offers.slice(0, 30);
}

function availabilityFor(html, offers) {
  const joined = `${offers.map((offer) => offer.availability).join(" ")} ${safeSnippet(html, 20_000)}`;
  if (/out.?of.?stock|sold.?out|outofstock/i.test(joined)) return "out_of_stock";
  if (/pre.?order|preorder/i.test(joined)) return "preorder";
  if (/in.?stock|instock|add to cart|buy now/i.test(joined)) return "in_stock";
  return "listed_unknown";
}

function promotionsFor(html) {
  const text = compactWhitespace(html.replace(/<script[\s\S]*?<\/script>/gi, " "));
  const patterns = [
    /\b(?:buy one get one|bogo)\b/gi,
    /\bfree shipping(?:\s+(?:on|over|for)\s+[^.!<]{0,50})?/gi,
    /\b\d{1,2}%\s+off\b/gi,
    /\bsave\s+\$?\d+(?:\.\d{1,2})?\b/gi,
    /\bsubscribe(?:\s+and)?\s+save\b/gi,
  ];
  return [...new Set(patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => safeSnippet(match[0], 100)),
  ))].slice(0, 12);
}

function trackersFor(html) {
  return TRACKERS.filter(([, pattern]) => pattern.test(html)).map(([provider]) => ({
    provider,
  }));
}

function platformFor(html, headers = {}) {
  const lowered = html.toLowerCase();
  if (lowered.includes("cdn.shopify.com") || lowered.includes("shopify-section")) return "shopify";
  if (lowered.includes("woocommerce") || lowered.includes("wc-ajax")) return "woocommerce";
  if (lowered.includes("__next_data__") || headers["x-powered-by"] === "Next.js") return "nextjs";
  if (lowered.includes("medusa")) return "medusa";
  return "unknown";
}

function gateFor(html) {
  const text = safeSnippet(html, 20_000).toLowerCase();
  if (
    /verify (?:that )?you are human|cloudflare ray id|attention required|just a moment|cf-chl-|captcha (?:required|challenge)/.test(
      text,
    )
  ) {
    return "security_challenge";
  }
  if (
    /(?:sign|log) in (?:to|before you can) (?:continue|access|shop|view)|(?:please|you must|you need to) (?:sign|log) in|create an account to (?:continue|access|shop|view)/.test(
      text,
    )
  ) {
    return "account";
  }
  if (/are you 21|age verification|confirm your age/.test(text)) return "age";
  if (
    /research(?:er)? verification required|(?:complete|accept|agree to|verify)[^.!]{0,80}research(?:er)? attestation/.test(
      text,
    )
  ) {
    return "research_attestation";
  }
  return "none";
}

function evidence(field, page, snippet, confidence = "high") {
  return {
    id: stableHash(`${field}|${page.url}|${page.hash}`).slice(0, 20),
    field,
    url: page.url,
    captured_at: page.captured_at,
    source_type: "public_html",
    confidence,
    content_hash: page.hash,
    snippet: safeSnippet(snippet),
  };
}

async function getPage(url, target, deps) {
  const result = await fetchBoundedPublic(url, {
    allowedHosts: target.allowed_hosts,
    fetchImpl: deps.fetchImpl,
    lookupImpl: deps.lookupImpl,
  });
  const page = {
    url: result.url,
    status: result.status,
    ok: result.ok,
    duration_ms: result.duration_ms,
    bytes: result.bytes,
    content_type: result.content_type,
    last_modified: result.last_modified,
    etag: result.etag,
    hash: contentHash(result.text),
    captured_at: new Date(deps.now()).toISOString(),
    text: result.text,
  };
  if (!result.ok) {
    throw new Error(`HTTP ${result.status} for ${page.url}`);
  }
  const isHtml =
    /html|xhtml/i.test(page.content_type ?? "") ||
    /<(?:html|title|body|form)\b/i.test(page.text.slice(0, 20_000));
  if (isHtml) {
    const gate = gateFor(page.text);
    if (gate !== "none") {
      throw new Error(`Public response stopped at ${gate} gate for ${page.url}`);
    }
  }
  return page;
}

function commerceFromPage(page, target) {
  const title = extractTitle(page.text);
  const productOffers = extractOffers(page.text);
  const offers = productOffers.map((offer, index) => ({
    key: `page:${stableHash(`${page.url}|${offer.price}|${offer.currency}|${index}`).slice(0, 20)}`,
    public_product_id: null,
    public_variant_id: null,
    public_sku_id: null,
    product_title: title,
    options: null,
    price: offer.price,
    list_price: null,
    currency: offer.currency,
    availability: offer.availability || availabilityFor(page.text, productOffers),
    product_url: page.url,
    source_url: page.url,
    is_retatrutide: isRetatrutide({ title, url: page.url }, target),
  }));
  const promotions = promotionsFor(page.text);
  return {
    product_url: page.url,
    title,
    offers,
    availability: availabilityFor(page.text, offers),
    promotions,
    promotions_observed: true,
    gate: "none",
    catalog_adapter: "product_page",
    coverage: "limited_public_product_page",
    collection_mode: "limited",
    catalog_complete: false,
    product_count: offers.length ? 1 : 0,
    variant_count: offers.length,
    reta_offer_count: offers.filter((offer) => offer.is_retatrutide).length,
    source_urls: [page.url],
    content_hash: page.hash,
    response: {
      status: page.status,
      bytes: page.bytes,
      duration_ms: page.duration_ms,
      last_modified: page.last_modified,
      etag: page.etag,
    },
  };
}

function catalogText(value) {
  return compactWhitespace(String(value ?? "").replace(/<[^>]*>/g, " ")) || null;
}

function safeCatalogUrl(value, target, fallback) {
  try {
    const url = validateTargetUrl(value, target.allowed_hosts);
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

function isKnownRetaUrl(value, target) {
  try {
    const candidate = validateTargetUrl(value, target.allowed_hosts);
    const configured = validateTargetUrl(target.product_url, target.allowed_hosts);
    const normalizePath = (pathname) => pathname.replace(/\/+$/, "") || "/";
    return normalizePath(candidate.pathname) === normalizePath(configured.pathname);
  } catch {
    return false;
  }
}

function isRetatrutide({ title, options, category, url }, target = null) {
  const text = [title, options, category, url].filter(Boolean).join(" ").toLowerCase();
  return (
    /\bretatrutide\b/.test(text) ||
    /\breta(?:[-\s]?(?:3|glp))?\b/.test(text) ||
    /\bglp[-\s]?3[-\s]?r?\b/.test(text) ||
    /\brc[-\s]?3[-\s]?r\b/.test(text) ||
    /\btriple[-\s]?agonist\b/.test(text) ||
    /\bsp[-\s]?3rt\b/.test(text) ||
    (target?.reta_aliases ?? []).some((alias) => text.includes(alias)) ||
    (target ? isKnownRetaUrl(url, target) : false)
  );
}

function normalizeAvailability(value) {
  const lowered = String(value ?? "").toLowerCase();
  if (/backorder|pre.?order/.test(lowered)) return "backorder";
  if (/out.?of.?stock|sold.?out|false/.test(lowered)) return "out_of_stock";
  if (/in.?stock|available|true/.test(lowered)) return "in_stock";
  return "listed_unknown";
}

function aggregateAvailability(offers) {
  const values = [...new Set(offers.map((offer) => offer.availability).filter(Boolean))];
  if (!values.length) return "listed_unknown";
  return values.length === 1 ? values[0] : "mixed";
}

function moneyFromWoo(prices, field) {
  const raw = Number(prices?.[field]);
  const minorUnit = Number(prices?.currency_minor_unit ?? 2);
  if (!Number.isFinite(raw) || raw <= 0 || !Number.isInteger(minorUnit)) return null;
  return raw / 10 ** minorUnit;
}

function wooOptions(variation) {
  if (Array.isArray(variation)) {
    return variation
      .map((item) => [item.attribute, item.value].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ") || null;
  }
  if (variation && typeof variation === "object") {
    return Object.entries(variation)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" | ") || null;
  }
  return catalogText(variation);
}

function normalizedCatalogOffer(raw, target) {
  const id = raw.public_variant_id || raw.public_product_id ||
    stableHash(`${raw.product_url}|${raw.product_title}|${raw.options ?? ""}`).slice(0, 20);
  return {
    ...raw,
    key: `public:${id}`,
    product_title: catalogText(raw.product_title),
    options: catalogText(raw.options),
    currency: raw.currency ? String(raw.currency).toUpperCase().slice(0, 3) : null,
    price: normalizedPrice(raw.price),
    list_price: normalizedPrice(raw.list_price),
    availability: normalizeAvailability(raw.availability),
    is_retatrutide: isRetatrutide({
      title: raw.product_title,
      options: raw.options,
      category: raw.category,
      url: raw.product_url,
    }, target),
  };
}

function dedupeOffers(offers, target) {
  const byKey = new Map();
  for (const offer of offers) {
    const normalized = normalizedCatalogOffer(offer, target);
    if (!normalized.product_title) continue;
    const existing = byKey.get(normalized.key);
    if (!existing || (existing.price === null && normalized.price !== null)) {
      byKey.set(normalized.key, normalized);
    }
  }
  return [...byKey.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .slice(0, CATALOG_OFFER_LIMIT);
}

async function collectPagedJson(target, deps, {
  buildUrl,
  selectItems,
  pageSize,
  label,
}) {
  const records = [];
  const pages = [];
  const errors = [];
  let complete = false;
  for (let pageNumber = 1; pageNumber <= CATALOG_PAGE_LIMIT; pageNumber += 1) {
    const url = buildUrl(pageNumber);
    let page;
    try {
      page = await getPage(url, target, deps);
      const payload = JSON.parse(page.text);
      const items = selectItems(payload);
      if (!Array.isArray(items)) throw new Error(`${label} response was not an array`);
      pages.push(page);
      records.push(...items.map((record) => ({ record, source_url: page.url })));
      if (items.length < pageSize) {
        complete = true;
        break;
      }
    } catch (error) {
      if (!pages.length) throw error;
      errors.push(`${label} page ${pageNumber} failed: ${error.message}`);
      break;
    }
  }
  if (!complete && !errors.length) {
    errors.push(`${label} reached the ${CATALOG_PAGE_LIMIT}-page safety limit`);
  }
  return { records, pages, errors, complete };
}

function wooOffer(target, wrapper) {
  const product = wrapper.record;
  const isVariation = product.type === "variation" || Number(product.parent) > 0;
  const title = catalogText(product.name);
  return {
    public_product_id: String(isVariation ? product.parent || "" : product.id || "") || null,
    public_variant_id: String(product.id || "") || null,
    public_sku_id: catalogText(product.sku),
    product_title: title,
    category: (product.categories ?? [])
      .map((category) => catalogText(category.name))
      .filter(Boolean)
      .join(" | ") || null,
    options: wooOptions(product.variation),
    price: moneyFromWoo(product.prices, "price"),
    list_price: moneyFromWoo(product.prices, "regular_price"),
    currency: catalogText(product.prices?.currency_code),
    availability:
      product.is_on_backorder === true
        ? "backorder"
        : product.is_in_stock === true
          ? "in_stock"
          : product.is_in_stock === false
            ? "out_of_stock"
            : "listed_unknown",
    product_url: safeCatalogUrl(product.permalink, target, target.product_url),
    source_url: wrapper.source_url,
  };
}

function commerceFromCatalog(target, {
  adapter,
  offers,
  pages,
  complete,
  errors,
  promotions = [],
  promotionsObserved = false,
}) {
  const boundedOffers = dedupeOffers(offers, target);
  const truncated = boundedOffers.length < offers.length;
  const catalogComplete = complete && !truncated;
  const sourceUrls = [...new Set(pages.map((page) => page.url))];
  const productIds = new Set(
    boundedOffers.map((offer) => offer.public_product_id || offer.product_url).filter(Boolean),
  );
  return {
    commerce: {
      product_url: target.product_url,
      title: target.name,
      offers: boundedOffers,
      availability: aggregateAvailability(boundedOffers),
      promotions,
      promotions_observed: promotionsObserved,
      gate: "none",
      catalog_adapter: adapter,
      coverage: catalogComplete
        ? `complete_public_${adapter}_feed`
        : `partial_public_${adapter}_feed`,
      collection_mode: catalogComplete ? "full" : "partial",
      catalog_complete: catalogComplete,
      product_count: productIds.size,
      variant_count: boundedOffers.length,
      reta_offer_count: boundedOffers.filter((offer) => offer.is_retatrutide).length,
      source_urls: sourceUrls,
      content_hash: contentHash(pages.map((page) => page.hash).join("|")),
      response: {
        pages: pages.length,
        bytes: pages.reduce((sum, page) => sum + page.bytes, 0),
      },
    },
    pages,
    errors: [
      ...errors,
      ...(truncated ? [`Catalog exceeded the ${CATALOG_OFFER_LIMIT}-offer safety limit`] : []),
    ],
  };
}

async function collectWooCommerce(target, deps, homepage) {
  const baseUrl = new URL(target.catalog_url);
  const buildUrl = (pageNumber, type = null) => {
    const url = new URL(baseUrl);
    url.searchParams.set("per_page", String(WOO_PAGE_SIZE));
    url.searchParams.set("page", String(pageNumber));
    if (type) url.searchParams.set("type", type);
    return url.toString();
  };
  const parents = await collectPagedJson(target, deps, {
    buildUrl: (page) => buildUrl(page),
    selectItems: (payload) => payload,
    pageSize: WOO_PAGE_SIZE,
    label: "WooCommerce parent feed",
  });
  let variations;
  try {
    variations = await collectPagedJson(target, deps, {
      buildUrl: (page) => buildUrl(page, "variation"),
      selectItems: (payload) => payload,
      pageSize: WOO_PAGE_SIZE,
      label: "WooCommerce variation feed",
    });
  } catch (error) {
    variations = {
      records: [],
      pages: [],
      errors: [`WooCommerce variation feed failed: ${error.message}`],
      complete: false,
    };
  }
  const actualVariations = variations.records.filter(({ record }) =>
    record.type === "variation" || Number(record.parent) > 0,
  );
  const variableParents = new Set(
    actualVariations.map(({ record }) => Number(record.parent)).filter((id) => id > 0),
  );
  const offers = [
    ...parents.records
      .filter(({ record }) => !variableParents.has(Number(record.id)))
      .map((record) => wooOffer(target, record)),
    ...actualVariations.map((record) => wooOffer(target, record)),
  ];
  if (!offers.length) throw new Error("WooCommerce public feeds returned no usable offers");
  return commerceFromCatalog(target, {
    adapter: "woocommerce",
    offers,
    pages: [...parents.pages, ...variations.pages],
    complete: parents.complete && variations.complete,
    errors: [...parents.errors, ...variations.errors],
    promotions: homepage ? promotionsFor(homepage.text) : [],
    promotionsObserved: Boolean(homepage),
  });
}

async function collectShopify(target, deps, homepage) {
  const result = await collectPagedJson(target, deps, {
    buildUrl: (pageNumber) => {
      const url = new URL(target.catalog_url);
      url.searchParams.set("limit", String(SHOPIFY_PAGE_SIZE));
      url.searchParams.set("page", String(pageNumber));
      return url.toString();
    },
    selectItems: (payload) => payload?.products,
    pageSize: SHOPIFY_PAGE_SIZE,
    label: "Shopify products feed",
  });
  const offers = result.records.flatMap(({ record: product, source_url: sourceUrl }) =>
    (product.variants ?? []).map((variant) => ({
      public_product_id: String(product.id || "") || null,
      public_variant_id: String(variant.id || "") || null,
      public_sku_id: catalogText(variant.sku),
      product_title: catalogText(product.title),
      category: catalogText(product.product_type),
      options: [variant.option1, variant.option2, variant.option3]
        .filter((value) => value && value !== "Default Title")
        .join(" / ") || null,
      price: variant.price,
      list_price: variant.compare_at_price,
      currency:
        variant.presentment_prices?.[0]?.price?.currency_code ||
        product.presentment_prices?.[0]?.price?.currency_code ||
        "USD",
      availability:
        variant.available === true
          ? "in_stock"
          : variant.available === false
            ? "out_of_stock"
            : "listed_unknown",
      product_url: `https://${target.domain}/products/${product.handle}`,
      source_url: sourceUrl,
    })),
  );
  if (!offers.length) throw new Error("Shopify public feed returned no usable offers");
  return commerceFromCatalog(target, {
    adapter: "shopify",
    offers,
    pages: result.pages,
    complete: result.complete,
    errors: result.errors,
    promotions: homepage ? promotionsFor(homepage.text) : [],
    promotionsObserved: Boolean(homepage),
  });
}

async function collectDailyCommerce(target, deps, homepage) {
  if (target.catalog_adapter === "woocommerce") {
    return collectWooCommerce(target, deps, homepage);
  }
  if (target.catalog_adapter === "shopify") {
    return collectShopify(target, deps, homepage);
  }
  const page =
    homepage && homepage.url === target.product_url
      ? homepage
      : await getPage(target.product_url, target, deps);
  return {
    commerce: commerceFromPage(page, target),
    pages: [page],
    errors: [],
  };
}

function marketingFromPage(page) {
  const links = extractLinks(page.text, page.url);
  const socials = [];
  for (const link of links) {
    try {
      const host = new URL(link.url).hostname.toLowerCase().replace(/^www\./, "");
      const provider = SOCIAL_HOSTS.get(host);
      if (provider) socials.push(provider);
    } catch {
      // Link parsing was already best effort.
    }
  }
  const text = safeSnippet(page.text, 40_000).toLowerCase();
  return {
    platform: platformFor(page.text),
    title: extractTitle(page.text),
    description: extractMeta(page.text, "description"),
    trackers: trackersFor(page.text),
    social_platforms: [...new Set(socials)].sort(),
    affiliate_cue: /\baffiliate|ambassador program|become an ambassador\b/.test(text),
    referral_cue: /\breferral|refer a friend\b/.test(text),
    subscription_cue: /\bsubscribe|subscription|autoship\b/.test(text),
    content_hash: page.hash,
  };
}

function safeSameHostLinks(page, target, matcher, max = 6) {
  const found = [];
  for (const link of extractLinks(page.text, page.url)) {
    if (!matcher.test(`${link.text} ${link.url}`)) continue;
    try {
      const url = validateTargetUrl(link.url, target.allowed_hosts);
      if (url.searchParams.has("add-to-cart")) continue;
      url.search = "";
      if (!found.some((entry) => entry.url === url.toString())) {
        found.push({ url: url.toString(), label: link.text || url.pathname });
      }
    } catch {
      // External and malformed links are not followed.
    }
    if (found.length >= max) break;
  }
  return found;
}

async function dnsSignals(target, deps) {
  const resolver = deps.resolver;
  const settle = async (type, fn) => {
    try {
      const values = await fn(target.domain);
      return { type, status: "observed", count: values.length, values_hash: contentHash(JSON.stringify(values)) };
    } catch (error) {
      return { type, status: "unavailable", error: error.code ?? error.message };
    }
  };
  return Promise.all([
    settle("A", resolver.resolve4),
    settle("AAAA", resolver.resolve6),
    settle("MX", resolver.resolveMx),
    settle("NS", resolver.resolveNs),
  ]);
}

async function trustFromPage(page, target, deps) {
  const policyLinks = safeSameHostLinks(
    page,
    target,
    /\b(privacy|terms|shipping|return|refund|contact|policy)\b/i,
    6,
  );
  const coaLinks = safeSameHostLinks(page, target, /\b(coa|certificate|lab result|testing)\b/i, 6);
  const requested = [...policyLinks, ...coaLinks]
    .filter((entry, index, all) => all.findIndex((item) => item.url === entry.url) === index)
    .slice(0, 8);
  const documents = [];
  for (const link of requested) {
    try {
      const document = await getPage(link.url, target, deps);
      documents.push({
        url: document.url,
        label: link.label,
        status: document.status,
        content_hash: document.hash,
        title: extractTitle(document.text),
      });
    } catch (error) {
      documents.push({ url: link.url, label: link.label, status: null, error: error.message });
    }
  }
  return {
    homepage_hash: page.hash,
    policies: documents.filter((document) =>
      policyLinks.some((link) => link.url === document.url),
    ),
    coa_links: documents.filter((document) =>
      coaLinks.some((link) => link.url === document.url),
    ),
    research_only_cue: /\bresearch use only|not for human consumption\b/i.test(page.text),
    human_use_or_outcome_cue:
      /\b(dosage|inject|administration|weight loss|fat loss|treatment)\b/i.test(page.text),
    dns: await dnsSignals(target, deps),
    document_errors: documents
      .filter((document) => document.error)
      .map((document) => ({ url: document.url, message: document.error })),
  };
}

export async function collectObservatoryTarget(target, cadence, dependencies = {}) {
  validateCadence(cadence);
  const deps = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    lookupImpl: dependencies.lookupImpl,
    now: dependencies.now ?? Date.now,
    resolver: dependencies.resolver ?? { resolve4, resolve6, resolveMx, resolveNs },
  };
  const capturedAt = new Date(deps.now()).toISOString();
  const errors = [];
  const pages = [];
  let homepage = null;
  try {
    homepage = await getPage(target.homepage_url, target, deps);
    pages.push(homepage);
  } catch (error) {
    errors.push({ scope: "homepage", message: error.message });
  }

  if (cadence !== "daily" && !homepage) {
    return {
      target_id: target.id,
      domain: target.domain,
      cadence,
      captured_at: capturedAt,
      status: "failed",
      errors,
      evidence: [],
    };
  }

  let commerce = null;
  if (cadence === "daily") {
    try {
      const daily = await collectDailyCommerce(target, deps, homepage);
      commerce = daily.commerce;
      pages.push(
        ...daily.pages.filter(
          (page) => !pages.some((existing) => existing.url === page.url && existing.hash === page.hash),
        ),
      );
      errors.push(...daily.errors.map((message) => ({ scope: "catalog", message })));
    } catch (error) {
      errors.push({ scope: "catalog", message: error.message });
    }
  }

  const primary =
    cadence === "daily"
      ? pages.find((page) => page.url !== homepage?.url) ?? homepage
      : homepage;
  if (!primary) {
    return {
      target_id: target.id,
      domain: target.domain,
      cadence,
      captured_at: capturedAt,
      status: "failed",
      errors,
      evidence: [],
    };
  }
  if (cadence === "daily" && !commerce) {
    return {
      target_id: target.id,
      display_name: target.name,
      domain: target.domain,
      cohort: target.cohort,
      shard: target.shard,
      cadence,
      captured_at: capturedAt,
      status: "failed",
      errors,
      evidence: [],
    };
  }

  const result = {
    target_id: target.id,
    display_name: target.name,
    domain: target.domain,
    cohort: target.cohort,
    shard: target.shard,
    cadence,
    captured_at: capturedAt,
    status:
      errors.length || (cadence === "daily" && commerce.collection_mode === "partial")
        ? "partial"
        : "complete",
    crawl: {
      pages_observed: pages.length,
      gate: "none",
      catalog_coverage: commerce?.coverage ?? null,
    },
    errors,
    evidence: [
      evidence("page.response", primary, `${primary.status} ${primary.content_type ?? ""}`),
    ],
  };

  if (cadence === "daily") {
    result.commerce = commerce;
    result.evidence.push(
      evidence("commerce.product", primary, result.commerce.title),
      evidence(
        "commerce.offer",
        primary,
        JSON.stringify({
          offer_count: result.commerce.offers.length,
          reta_offer_count: result.commerce.reta_offer_count,
          availability: result.commerce.availability,
          coverage: result.commerce.coverage,
        }),
        result.commerce.offers.length ? "high" : "medium",
      ),
    );
  } else if (cadence === "weekly") {
    result.marketing = marketingFromPage(primary);
    result.evidence.push(
      evidence("marketing.stack", primary, JSON.stringify(result.marketing), "medium"),
    );
  } else {
    result.trust = await trustFromPage(primary, target, deps);
    if (result.trust.document_errors.length) {
      result.status = "partial";
      result.errors.push(
        ...result.trust.document_errors.map((document) => ({
          scope: "trust_document",
          message: `${document.url}: ${document.message}`,
        })),
      );
    }
    result.evidence.push(
      evidence(
        "trust.public_documents",
        primary,
        JSON.stringify({
          policies: result.trust.policies.length,
          coa_links: result.trust.coa_links.length,
        }),
        "medium",
      ),
    );
  }
  return result;
}
