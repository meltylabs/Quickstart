import { createHash } from "node:crypto";
import { publicHttp } from "./noli-public-http.mjs";

const MARKETING_PATTERNS = [
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]+\b/i],
  ["Google Analytics", /googletagmanager\.com\/gtag\/js|\bG-[A-Z0-9]{6,}\b|google-analytics\.com/i],
  ["Google Ads tag", /\bAW-\d{5,}\b|googleadservices\.com|googleads\.g\.doubleclick\.net/i],
  ["Meta Pixel", /connect\.facebook\.net|facebook\.com\/tr|fbq\s*\(/i],
  ["TikTok Pixel", /analytics\.tiktok\.com|ttq\.(?:load|page|track)\b/i],
  ["Microsoft Clarity", /clarity\.ms|clarity\s*\(\s*["']set/i],
  ["Pinterest Tag", /ct\.pinterest\.com|pintrk\s*\(/i],
  ["Snap Pixel", /sc-static\.net\/scevent|snaptr\s*\(/i],
  ["Reddit Pixel", /alb\.reddit\.com|rdt\s*\(/i],
  ["Klaviyo", /klaviyo|static\.klaviyo\.com/i],
  ["Attentive", /attentivemobile|attn\.tv/i],
  ["Postscript", /postscript\.io|postscript-sdk/i],
  ["Omnisend", /omnisend/i],
  ["Mailchimp", /mailchimp|list-manage\.com/i],
  ["GoAffPro", /goaffpro/i],
  ["AffiliateWP", /affiliate-wp|affiliatewp/i],
  ["Refersion", /refersion/i],
  ["UpPromote", /uppromote|secomapp.*affiliate/i],
  ["Smile.io", /smile-ui|smile\.io/i],
  ["Yotpo", /yotpo/i],
  ["Judge.me", /judge\.me|judgeme/i],
  ["Loox", /loox/i],
  ["Recharge", /rechargepayments|rechargecdn/i],
];

const PAYMENT_CODE_PATTERNS = [
  ["Bankful code", /bankful|bf-style-css|woo.*bankful/i],
  ["Authorize.Net code", /authorize\.net|accept\.authorize\.net|woocommerce.*authorize/i],
  ["NMI code", /networkmerchants|secure\.nmi\.com|nmi[-_ ]gateway/i],
  ["Stripe code", /js\.stripe\.com|wc[-_ ]stripe|stripe[-_ ]payments/i],
  ["PayPal code", /paypal\.com\/sdk|paypalobjects|woocommerce[-_ ]paypal/i],
  ["Square code", /squareup\.com\/v\d|web\.squarecdn|wc[-_ ]square|square[-_ ]payment/i],
  ["WooPayments code", /woocommerce[-_ ]payments|wcpay/i],
  ["Shop Pay code", /shopify-payment-button|shop[-_ ]pay/i],
  ["Klarna code", /klarna\.com|klarna[-_ ]payments/i],
  ["Affirm code", /affirm\.com\/js|affirm[-_ ]payments/i],
  ["Afterpay code", /afterpay\.com|afterpay[-_ ]gateway/i],
  ["Sezzle code", /sezzle\.com|sezzle[-_ ]payment/i],
  ["Coinbase Commerce code", /commerce\.coinbase\.com|coinbase[-_ ]commerce/i],
  ["Cryptocurrency gateway code", /nowpayments|coinpayments|btcpayserver/i],
];

const PROMOTION_PATTERN =
  /(?:\b\d{1,2}%\s*off\b|\$\d+(?:\.\d{2})?\s*off\b|free shipping|subscribe(?:\s*&|\s+and)?\s*save|buy\s+\d+\s+get|use\s+(?:code|coupon)|promo\s+code|limited[- ]time|bundle\s+(?:and\s+)?save)/i;
const INTERESTING_ROUTE =
  /(affiliate|ambassador|referral|refer-a-friend|reward|loyalty|subscribe|newsletter|sms|blog|article|learn|education|sale|discount)/i;
const BLOCKED_PAGE =
  /(?:just a moment|attention required|verify (?:that )?you are human|captcha|access denied|request blocked|password protected|sign in to continue)/i;

function cleanText(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlLines(html) {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|p|div|li|h[1-6]|section|article|header|footer|nav)\b[^>]*>/gi, "\n")
    .split(/\n+/)
    .map(cleanText)
    .filter((line) => line.length >= 8 && line.length <= 180);
}

function firstMatch(html, expression) {
  return cleanText(html.match(expression)?.[1]) || null;
}

function classifyPromotion(text) {
  if (/free shipping/i.test(text)) return "free-shipping";
  if (/subscribe/i.test(text)) return "subscription";
  if (/bundle/i.test(text)) return "bundle";
  return "discount";
}

function redactContactText(value) {
  return String(value)
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[email redacted]",
    )
    .replace(
      /(?:\+?1[\s.-]*)?(?:\(\d{3}\)|\d{3})[\s.-]+\d{3}[\s.-]+\d{4}\b/g,
      "[phone redacted]",
    );
}

function publicRoutes(html, baseUrl, domain) {
  const routes = [];
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (host !== domain && !host.endsWith(`.${domain}`)) continue;
      url.hash = "";
      if (INTERESTING_ROUTE.test(url.pathname)) routes.push(url.toString());
    } catch {
      // Malformed public markup is ignored.
    }
  }
  return [...new Set(routes)].sort().slice(0, 30);
}

export function inspectStorefrontHtml(html, { domain, url, status, observedAt }) {
  if (!html || BLOCKED_PAGE.test(html)) {
    return {
      status: "unknown",
      url: `https://${domain}/`,
      finalUrl: url,
      httpStatus: status,
      observedAt: null,
      lastAttemptAt: observedAt,
      error: html ? "Public response was a block, login, or verification page" : "Empty public response",
    };
  }
  const signals = (patterns) =>
    patterns.filter(([, pattern]) => pattern.test(html)).map(([label]) => label).sort();
  const promotions = [...new Set(
    htmlLines(html)
      .filter((line) => PROMOTION_PATTERN.test(line))
      .map(redactContactText),
  )]
    .slice(0, 20)
    .map((text) => ({
      kind: classifyPromotion(text),
      text,
      sourceUrl: url,
    }));
  return {
    status: "observed",
    url: `https://${domain}/`,
    finalUrl: url,
    httpStatus: status,
    title: firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
    description: firstMatch(
      html,
      /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    ),
    contentHash: createHash("sha256").update(html).digest("hex"),
    promotions,
    marketingCodes: signals(MARKETING_PATTERNS),
    paymentCodes: signals(PAYMENT_CODE_PATTERNS),
    publicRoutes: publicRoutes(html, url, domain),
    observedAt,
    lastAttemptAt: observedAt,
    caveat:
      "Anonymous public homepage GET. Scripts, routes, and promotion copy show observable storefront infrastructure, not spend, attribution, processor activation, successful checkout, or settlement.",
  };
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name.toLowerCase()] ?? headers[name] ?? null;
}

async function getJson(url, target, request) {
  const response = await request(url, {
    method: "GET",
    expectedDomain: target.domain,
    headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.1" },
  });
  let data;
  try {
    data = JSON.parse(response.body);
  } catch {
    throw new Error(`HTTP ${response.status}; public response was not JSON`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return { ...response, data };
}

async function collectWooPages(target, request, type = null) {
  const records = [];
  const sourceUrls = [];
  let page = 1;
  let advertisedPages = null;
  let complete = false;
  while (page <= 20) {
    const query = new URLSearchParams({ per_page: "100", page: String(page) });
    if (type) query.set("type", type);
    const sourceUrl = `${target.catalogUrl}?${query}`;
    const response = await getJson(sourceUrl, target, request);
    if (!Array.isArray(response.data)) throw new Error("WooCommerce response was not an array");
    sourceUrls.push(sourceUrl);
    records.push(...response.data);
    if (page === 1) {
      const parsedPages = Number(headerValue(response.headers, "x-wp-totalpages"));
      advertisedPages = Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : null;
    }
    if (
      (advertisedPages && page >= advertisedPages) ||
      (!advertisedPages && response.data.length < 100)
    ) {
      complete = true;
      break;
    }
    page += 1;
  }
  return { records, sourceUrls, complete };
}

function wooPrice(prices, field) {
  const raw = Number(prices?.[field]);
  const minorUnit = Number(prices?.currency_minor_unit ?? 2);
  return Number.isFinite(raw) ? raw / 10 ** minorUnit : null;
}

function wooOptions(variation) {
  if (Array.isArray(variation)) {
    return variation
      .map((item) => [item.attribute, item.value].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ");
  }
  if (variation && typeof variation === "object") {
    return Object.entries(variation)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" | ");
  }
  return cleanText(variation);
}

function wooOffer(target, product, sourceUrl) {
  const isVariation = product.type === "variation" || Number(product.parent) > 0;
  const stockStatus =
    product.is_on_backorder === true
      ? "backorder"
      : product.is_in_stock === true
        ? "in_stock"
        : product.is_in_stock === false
          ? "out_of_stock"
          : "unknown";
  return {
    productTitle: cleanText(product.name),
    canonicalUrl: cleanText(product.permalink) || target.homepageUrl,
    publicProductId: String(isVariation ? product.parent || "" : product.id || ""),
    // The prior census uses the public Store API row id as the offer/variant
    // identity for both simple products and variations. Keeping that identity
    // stable prevents every simple product from appearing removed and re-added
    // when the observatory takes over the time series.
    publicVariantId: String(product.id || ""),
    publicSkuId: cleanText(product.sku),
    category: (product.categories || []).map(({ name }) => cleanText(name)).filter(Boolean).join(" | "),
    options: wooOptions(product.variation),
    currentPrice: wooPrice(product.prices, "price"),
    listPrice: wooPrice(product.prices, "regular_price"),
    currency: cleanText(product.prices?.currency_code),
    stockStatus,
    sourceUrl,
    observedAt: null,
    confidence: "high",
    caveat:
      "Anonymous public WooCommerce Store API observation. Availability and purchase limits are not sales or warehouse inventory.",
  };
}

export async function collectWooCatalog(target, request = publicHttp, observedAt = new Date().toISOString()) {
  const parents = await collectWooPages(target, request);
  let variations = { records: [], sourceUrls: [], complete: false };
  let variationError = null;
  try {
    variations = await collectWooPages(target, request, "variation");
  } catch (error) {
    variationError = error.message;
  }
  const actualVariations = variations.records.filter(
    (product) => product.type === "variation" || Number(product.parent) > 0,
  );
  const variableParents = new Set(
    actualVariations.map(({ parent }) => Number(parent)).filter((value) => value > 0),
  );
  const offers = [
    ...parents.records
      .filter((product) => !variableParents.has(Number(product.id)))
      .map((product) => wooOffer(target, product, parents.sourceUrls[0])),
    ...actualVariations.map((product) => wooOffer(target, product, variations.sourceUrls[0])),
  ]
    .filter(({ productTitle }) => productTitle)
    .map((offer) => ({ ...offer, observedAt }));
  if (!offers.length) throw new Error("WooCommerce public feed returned no usable offers");
  const coverage =
    parents.complete &&
    !variationError &&
    (variations.complete || actualVariations.length === 0)
      ? "complete"
      : "partial";
  return {
    status: "observed",
    coverage,
    offers,
    sourceUrls: [...parents.sourceUrls, ...variations.sourceUrls],
    observedAt,
    lastAttemptAt: observedAt,
    adapter: "woocommerce",
    caveat: variationError
      ? `Public parent feed succeeded; variation feed failed (${variationError}), so coverage is partial and removals must not be inferred.`
      : coverage === "complete"
        ? "Anonymous public WooCommerce feed was paginated through all advertised pages. Stock is not sales or warehouse inventory."
        : "Anonymous public WooCommerce capture reached a bounded page limit; coverage is partial and removals must not be inferred.",
  };
}

export async function collectShopifyCatalog(
  target,
  request = publicHttp,
  observedAt = new Date().toISOString(),
) {
  const offers = [];
  const sourceUrls = [];
  let complete = false;
  for (let page = 1; page <= 20; page += 1) {
    const sourceUrl = `${target.catalogUrl}?limit=250&page=${page}`;
    const response = await getJson(sourceUrl, target, request);
    const products = Array.isArray(response.data?.products) ? response.data.products : [];
    sourceUrls.push(sourceUrl);
    for (const product of products) {
      for (const variant of product.variants || []) {
        const options = [variant.option1, variant.option2, variant.option3]
          .filter((value) => value && value !== "Default Title")
          .join(" / ");
        const currency =
          variant.presentment_prices?.[0]?.price?.currency_code ||
          product.presentment_prices?.[0]?.price?.currency_code ||
          null;
        offers.push({
          productTitle: cleanText(product.title),
          canonicalUrl: `https://${target.domain}/products/${product.handle}`,
          publicProductId: String(product.id || ""),
          publicVariantId: String(variant.id || ""),
          publicSkuId: cleanText(variant.sku),
          category: cleanText(product.product_type),
          options,
          currentPrice: variant.price,
          listPrice: variant.compare_at_price,
          currency,
          stockStatus:
            variant.available === true
              ? "in_stock"
              : variant.available === false
                ? "out_of_stock"
                : "unknown",
          sourceUrl,
          observedAt,
          confidence: "high",
          caveat:
            "Anonymous public Shopify product-feed observation. Binary availability is not sales or warehouse inventory.",
        });
      }
    }
    if (products.length < 250) {
      complete = true;
      break;
    }
  }
  if (!offers.length) throw new Error("Shopify public feed returned no usable offers");
  return {
    status: "observed",
    coverage: complete ? "complete" : "partial",
    offers,
    sourceUrls,
    observedAt,
    lastAttemptAt: observedAt,
    adapter: "shopify",
    caveat: complete
      ? "Anonymous public Shopify product feed was paginated until empty. Availability is not sales or warehouse inventory."
      : "Anonymous public Shopify feed reached its bounded page limit; coverage is partial and removals must not be inferred.",
  };
}

async function collectStorefront(target, request, observedAt) {
  try {
    const response = await request(target.homepageUrl, {
      method: "GET",
      expectedDomain: target.domain,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return inspectStorefrontHtml(response.body, {
      domain: target.domain,
      url: response.url || target.homepageUrl,
      status: response.status,
      observedAt,
    });
  } catch (error) {
    return {
      status: "error",
      url: target.homepageUrl,
      observedAt: null,
      lastAttemptAt: observedAt,
      error: error.message,
      caveat: "Current anonymous public homepage capture failed. Unknown activity is not no activity.",
    };
  }
}

async function collectCatalog(target, request, observedAt) {
  try {
    if (target.catalogAdapter === "woocommerce") {
      return await collectWooCatalog(target, request, observedAt);
    }
    if (target.catalogAdapter === "shopify") {
      return await collectShopifyCatalog(target, request, observedAt);
    }
    return {
      status: "unknown",
      coverage: "unknown",
      offers: [],
      sourceUrls: [],
      observedAt: null,
      lastAttemptAt: observedAt,
      adapter: target.catalogAdapter,
      error: "No safe complete public-feed adapter configured",
      caveat:
        "The storefront is page-observed only. Catalog values stay unknown or retain a labeled last-good snapshot; no page gate is crossed.",
    };
  } catch (error) {
    return {
      status: "error",
      coverage: "unknown",
      offers: [],
      sourceUrls: target.catalogUrl ? [target.catalogUrl] : [],
      observedAt: null,
      lastAttemptAt: observedAt,
      adapter: target.catalogAdapter,
      error: error.message,
      caveat:
        "Current anonymous public catalog capture failed. Unknown catalog is not an empty catalog.",
    };
  }
}

export async function collectCompanyObservation(
  target,
  { request = publicHttp, observedAt = new Date().toISOString() } = {},
) {
  const [storefront, catalog] = await Promise.all([
    collectStorefront(target, request, observedAt),
    collectCatalog(target, request, observedAt),
  ]);
  return { domain: target.domain, storefront, catalog };
}

export async function collectObservatory(
  targets,
  { request = publicHttp, observedAt = new Date().toISOString(), concurrency = 4 } = {},
) {
  const observations = [];
  for (let index = 0; index < targets.length; index += concurrency) {
    const batch = targets.slice(index, index + concurrency);
    observations.push(
      ...(await Promise.all(
        batch.map((target) => collectCompanyObservation(target, { request, observedAt })),
      )),
    );
  }
  return observations;
}
