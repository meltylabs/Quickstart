import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  enrichPaymentProviders,
  PROVIDER_BOUNDARY,
} from "./payment-provider-taxonomy.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_INPUT = path.join(
  ROOT,
  "biologix-strategy-board/research/retatrutide-vendor-universe-data.js",
);
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "biologix-strategy-board/research/retatrutide-vendor-audit-data.js",
);
const DEFAULT_CHECKPOINT_DIR = path.join(
  ROOT,
  ".context/retatrutide-vendor-audit/checkpoints",
);

const FOCUSED_PRODUCT_SEEDS = {
  "northlinelabs.org": [
    "https://northlinelabs.org/product/reta-glp-3/",
  ],
};

export const MAX_GLOBAL_CONCURRENCY = 20;
export const SAFE_CRAWL_POLICY = Object.freeze({
  publicPagesOnly: true,
  accountCreation: false,
  captchaOrGateBypass: false,
  fabricatedIdentity: false,
  checkoutSubmission: false,
  transactions: false,
  credentialUse: false,
  perDomainConcurrency: 1,
  maxGlobalConcurrency: MAX_GLOBAL_CONCURRENCY,
  retryBlockedRequests: false,
});

const FINAL_CHECKPOINT_STATUSES = new Set([
  "completed",
  "partial",
  "blocked",
  "failed",
  "skipped",
]);

const SOCIAL_OR_MESSAGING_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "chat.whatsapp.com",
  "wa.me",
  "t.me",
  "telegram.me",
  "discord.com",
  "discord.gg",
];

const MARKETPLACE_OR_DIRECTORY_HOSTS = [
  "alibaba.com",
  "made-in-china.com",
  "globalsources.com",
  "indiamart.com",
  "chemicalbook.com",
  "echemi.com",
  "lookchem.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "walmart.com",
  "dhgate.com",
  "finnrick.com",
  "peptide-compare.com",
  "bfflist.org",
  "bfflink.com",
  "glp1forum.com",
  "thinksteroids.com",
  "peppys.org",
  "peptide.chat",
];

const CONTACT_OR_FILE_SERVICE_HOSTS = [
  "gmail.com",
  "mail.google.com",
  "docs.google.com",
  "drive.google.com",
  "share.google",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "proton.me",
];

const RELEVANT_URL_TERMS = [
  "retatrutide",
  "reta",
  "glp-3",
  "glp3",
  "triple-agonist",
  "product",
  "shop",
  "catalog",
  "collection",
  "coa",
  "certificate",
  "testing",
  "lab-result",
  "quality",
  "shipping",
  "delivery",
  "return",
  "refund",
  "payment",
  "checkout",
  "affiliate",
  "referral",
  "rewards",
  "subscription",
  "subscribe",
  "about",
  "contact",
  "faq",
  "terms",
  "privacy",
  "blog",
  "research",
];

const PLATFORM_DEFINITIONS = [
  {
    value: "WooCommerce",
    pattern:
      /(?:woocommerce|wp-json\/wc\/|wp-content\/plugins\/woocommerce|wc-blocks)/i,
  },
  {
    value: "Shopify",
    pattern:
      /(?:cdn\.shopify\.com|Shopify\.theme|shopify-section|myshopify\.com)/i,
  },
  {
    value: "Medusa",
    pattern: /(?:_medusa_cache_id|medusa[_-](?:cart|region)|\bprod_[a-z0-9]+)/i,
  },
  {
    value: "BigCommerce",
    pattern: /(?:cdn\d*\.bigcommerce\.com|stencil-utils|bigcommerce)/i,
  },
  {
    value: "Magento",
    pattern: /(?:Magento_|mage\/cookies|static\/version\d+\/frontend)/i,
  },
  {
    value: "Wix",
    pattern: /(?:wixstatic\.com|_wixCIDX|wix-code-sdk)/i,
  },
  {
    value: "Squarespace",
    pattern: /(?:static1\.squarespace\.com|Squarespace\.Commerce)/i,
  },
  {
    value: "Webflow",
    pattern: /(?:webflow\.js|data-wf-page|webflow\.com)/i,
  },
  {
    value: "WordPress",
    pattern: /(?:wp-content\/|wp-includes\/|wp-json\/)/i,
  },
  {
    value: "Next.js",
    pattern: /(?:\/_next\/static\/|__NEXT_DATA__|next-router-prefetch)/i,
  },
];

const TRACKER_DEFINITIONS = [
  {
    provider: "google_analytics",
    pattern: /\bG-[A-Z0-9]{6,15}\b/gi,
  },
  {
    provider: "google_universal_analytics",
    pattern: /\bUA-\d{4,12}-\d+\b/gi,
  },
  {
    provider: "google_tag_manager",
    pattern: /\bGTM-[A-Z0-9]{5,12}\b/gi,
  },
  {
    provider: "meta_pixel",
    pattern: /fbq\(\s*["']init["']\s*,\s*["'](\d{6,20})["']/gi,
    capture: 1,
  },
  {
    provider: "tiktok_pixel",
    pattern: /ttq\.(?:load|init)\(\s*["']([A-Z0-9]{8,30})["']/gi,
    capture: 1,
  },
  {
    provider: "reddit_pixel",
    pattern: /rdt\(\s*["']init["']\s*,\s*["']([A-Za-z0-9_-]{6,40})["']/gi,
    capture: 1,
  },
  {
    provider: "microsoft_clarity",
    pattern: /clarity\.ms\/tag\/([a-z0-9]+)/gi,
    capture: 1,
  },
  {
    provider: "hotjar",
    pattern: /hjid\s*[:=]\s*(\d{4,12})/gi,
    capture: 1,
  },
  {
    provider: "pinterest_tag",
    pattern: /pintrk\(\s*["']load["']\s*,\s*["'](\d{5,30})["']/gi,
    capture: 1,
  },
  {
    provider: "snap_pixel",
    pattern: /snaptr\(\s*["']init["']\s*,\s*["']([a-f0-9-]{8,40})["']/gi,
    capture: 1,
  },
  {
    provider: "klaviyo",
    pattern: /(?:static\.klaviyo\.com|klaviyo\.js|\b_learnq\b|\bklaviyo\b)/gi,
    publicIdOptional: true,
  },
  {
    provider: "posthog",
    pattern: /(?:posthog\.init|\/ingest\/(?:e|decide)|app\.posthog\.com)/gi,
    publicIdOptional: true,
  },
  {
    provider: "sentry",
    pattern: /(?:sentry\.io|Sentry\.init)/gi,
    publicIdOptional: true,
  },
];

const PAYMENT_VISIBLE_DEFINITIONS = [
  ["Visa", /\bvisa\b/i],
  ["Mastercard", /\bmaster\s?card\b/i],
  ["American Express", /\b(?:american express|amex)\b/i],
  ["Discover", /\bdiscover\b/i],
  ["Apple Pay", /\bapple pay\b/i],
  ["Google Pay", /\bgoogle pay\b/i],
  ["Amazon Pay", /\bamazon pay\b/i],
  ["PayPal", /\bpaypal\b/i],
  ["Cash App", /\bcash app\b/i],
  ["Venmo", /\bvenmo\b/i],
  ["Zelle", /\bzelle\b/i],
  ["ACH", /\bACH\b/i],
  ["Bank transfer", /\bbank transfer\b/i],
  ["Wire transfer", /\bwire transfer\b/i],
  ["Check", /\b(?:pay by check|personal check|electronic check|e-check|checks accepted)\b/i],
  ["Bitcoin", /\b(?:bitcoin|BTC)\b/i],
  ["Ethereum", /\b(?:ethereum|ETH)\b/i],
  ["USDT", /\bUSDT\b/i],
  ["USDC", /\bUSDC\b/i],
  ["Cryptocurrency", /\b(?:crypto(?:currency)?|digital currency)\b/i],
];

const PAYMENT_INTEGRATION_DEFINITIONS = [
  ["Stripe", /(?:js\.stripe\.com|stripe-elements|stripe[_-](?:payment|gateway))/i],
  ["Square", /(?:squareup\.com|square[_-](?:payment|gateway)|woocommerce-square)/i],
  ["Authorize.Net", /(?:authorize\.net|accept\.authorize\.net|authorizenet)/i],
  ["NMI", /(?:secure\.networkmerchants\.com|\bnmi[_-](?:gateway|payment)|network merchants)/i],
  ["Braintree", /(?:js\.braintreegateway\.com|braintree[_-](?:gateway|payment))/i],
  ["Adyen", /(?:checkoutshopper-live\.adyen\.com|adyen[_-](?:gateway|payment))/i],
  ["CircoFlows", /(?:circoflows|gateway\.circoflows\.com)/i],
  ["NOWPayments", /(?:nowpayments|nowpayments-for-woocommerce)/i],
  ["Link Money", /(?:link\.money|link-money|link_woocommerce)/i],
  ["Bankful", /(?:bankful|bankful-for-woocommerce)/i],
  ["PayGate.to", /(?:paygate\.to|paygate[_-]to)/i],
  ["SeamlessChex", /(?:seamlesschex|seamless[_-](?:ach|check))/i],
  ["Paynote", /(?:paynote|seamlesschex)/i],
  ["Blockonomics", /(?:blockonomics|blockonomics\.co)/i],
  ["Coinbase Commerce", /(?:commerce\.coinbase\.com|coinbase-commerce)/i],
  ["BTCPay Server", /(?:btcpayserver|btcpay[_-](?:gateway|server))/i],
  ["OpenNode", /(?:opennode|opennode\.com)/i],
  ["ForumPay", /(?:forumpay|forumpay\.com)/i],
  ["PayVantage", /(?:payvantage|Payvantage-woocomerce)/i],
  ["ChargeAnywhere", /(?:chargeanywhere|charge_anywhere)/i],
  ["eDebit Direct", /(?:edebit|e-debit direct|direct-draft-plaid)/i],
];

const OFFER_DEFINITIONS = [
  ["free_shipping", /\bfree shipping\b/i],
  ["percentage_discount", /\b(?:save|off)\s+\d{1,2}%|\d{1,2}%\s+off\b/i],
  ["coupon", /\b(?:coupon|promo code|discount code)\b/i],
  ["bundle", /\b(?:bundle|stack|kit|10[- ]pack|multi[- ]pack)\b/i],
  ["bulk_pricing", /\b(?:bulk pricing|volume discount|wholesale pricing)\b/i],
  ["subscription", /\b(?:subscribe(?:\s*&\s*save)?|subscription|auto[- ]?ship)\b/i],
  ["guarantee", /\b(?:money[- ]back|satisfaction|quality) guarantee\b/i],
  ["loyalty", /\b(?:loyalty|rewards|points program)\b/i],
  ["affiliate", /\b(?:affiliate|ambassador) program\b/i],
  ["referral", /\b(?:refer a friend|referral program)\b/i],
];

const CLAIM_DEFINITIONS = [
  [
    "research_only",
    "Research-use restriction",
    /\b(?:research use only|not for human consumption|not for human or animal use|in[- ]vitro use only)\b/i,
    "high",
  ],
  [
    "human_outcome",
    "Weight-loss or body-composition outcome",
    /\b(?:weight loss|lose weight|fat loss|body composition|reduce body weight|slimming)\b/i,
    "medium",
  ],
  [
    "human_outcome",
    "Appetite or metabolic outcome",
    /\b(?:appetite suppression|reduce appetite|hunger control|blood sugar|glucose control|metabolic health)\b/i,
    "medium",
  ],
  [
    "administration",
    "Administration or preparation language",
    /\b(?:dose|dosage|dosing|inject(?:ion|able)?|reconstitut(?:e|ion)|bacteriostatic water|subcutaneous)\b/i,
    "medium",
  ],
  [
    "therapeutic",
    "Disease or treatment language",
    /\b(?:treat(?:ment|s)?|therapy|obesity|diabetes|healing|pain relief|anti[- ]aging)\b/i,
    "medium",
  ],
  [
    "human_evidence",
    "Human clinical-results language",
    /\b(?:clinical trial|participants|patients|phase\s+[123]|weeks of treatment)\b/i,
    "medium",
  ],
];

const SOURCING_DEFINITIONS = [
  ["in_house_manufacturing", /\b(?:manufactured|synthesized|produced) in[- ]house\b/i],
  ["manufacturer_claim", /\b(?:we manufacture|direct manufacturer|peptide manufacturer)\b/i],
  ["us_manufacturing", /\b(?:made|manufactured|produced) in (?:the )?(?:usa|united states)\b/i],
  ["domestic_fulfillment", /\b(?:ships|shipped|fulfilled) from (?:the )?(?:usa|united states)\b/i],
  ["cgmp", /\b(?:cGMP|current good manufacturing practice|GMP[- ]certified)\b/i],
  ["fda_registration", /\bFDA[- ]registered\b/i],
  ["third_party_testing", /\b(?:third[- ]party|independent(?:ly)?) (?:lab )?test(?:ed|ing)\b/i],
  ["batch_testing", /\b(?:batch|lot)[- ]specific (?:COA|testing|analysis)\b/i],
  ["purity_claim", /\b(?:≥|>|at least )?9[5-9](?:\.\d+)?%\s+purity\b/i],
  ["wholesale_oem", /\b(?:OEM|ODM|white label|private label|wholesale supplier|bulk supplier)\b/i],
  ["lyophilized", /\blyophili[sz]ed\b/i],
];

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cleanWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function htmlToText(html) {
  return cleanWhitespace(
    decodeHtmlEntities(
      String(html || "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function extractTagText(html, expression) {
  const match = expression.exec(String(html || ""));
  return match ? htmlToText(match[1]) : null;
}

function extractJsonLdProductNames(html) {
  const names = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const types = Array.isArray(value["@type"])
      ? value["@type"]
      : [value["@type"]];
    if (
      types.some((type) => String(type || "").toLowerCase() === "product") &&
      typeof value.name === "string"
    ) {
      names.push(cleanWhitespace(value.name));
    }
    for (const child of Object.values(value)) visit(child);
  };

  for (const match of String(html || "").matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(decodeHtmlEntities(match[1])));
    } catch {
      // Invalid JSON-LD is ignored; URL, title, H1, and commerce blocks remain.
    }
  }
  return [...new Set(names.filter(Boolean))].slice(0, 20);
}

function hasCloseRetaCommerceBlock(html, retaPattern) {
  const source = String(html || "");
  const flags = retaPattern.flags.includes("g")
    ? retaPattern.flags
    : `${retaPattern.flags}g`;
  for (const match of source.matchAll(new RegExp(retaPattern.source, flags))) {
    const block = htmlToText(
      source.slice(Math.max(0, match.index - 700), match.index + 1_100),
    );
    const hasPrice =
      /(?:US\$|\$|USD\s*|€|EUR\s*|£|GBP\s*)\d{1,5}(?:\.\d{1,2})?/i.test(
        block,
      );
    const hasCommerceAction =
      /\b(?:add to cart|add to bag|buy now|select options|choose options)\b/i.test(
        block,
      );
    if (hasPrice && hasCommerceAction) return true;
  }
  return false;
}

function snippetAround(haystack, needleOrPattern, radius = 110) {
  const source = cleanWhitespace(haystack);
  let index = -1;
  let matchLength = 0;

  if (needleOrPattern instanceof RegExp) {
    const flags = needleOrPattern.flags.replaceAll("g", "");
    const match = new RegExp(needleOrPattern.source, flags).exec(source);
    if (match) {
      index = match.index;
      matchLength = match[0].length;
    }
  } else {
    index = source.toLowerCase().indexOf(String(needleOrPattern).toLowerCase());
    matchLength = String(needleOrPattern).length;
  }

  if (index < 0) return source.slice(0, radius * 2);
  return source.slice(
    Math.max(0, index - radius),
    Math.min(source.length, index + matchLength + radius),
  );
}

export function normalizeDomain(value) {
  if (!value) return null;
  const candidate = /^[a-z]+:\/\//i.test(String(value))
    ? String(value)
    : `https://${value}`;
  try {
    const hostname = new URL(candidate).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    if (
      !hostname ||
      !hostname.includes(".") ||
      !/^[a-z0-9.-]+$/i.test(hostname) ||
      hostname.startsWith(".") ||
      hostname.endsWith(".")
    ) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

function hostMatches(domain, candidates) {
  return candidates.some(
    (candidate) => domain === candidate || domain.endsWith(`.${candidate}`),
  );
}

export function classifyInputVendor(vendor) {
  const domain =
    normalizeDomain(vendor.domain) ||
    normalizeDomain(vendor.url) ||
    normalizeDomain(vendor.productUrl);

  if (!domain) {
    return {
      entityType: "unlinked_vendor",
      crawl: false,
      reason: "No public website domain is available.",
    };
  }
  if (hostMatches(domain, SOCIAL_OR_MESSAGING_HOSTS)) {
    return {
      entityType: "social_or_messaging",
      crawl: false,
      reason: "The public contact is a social or messaging destination, not a storefront.",
    };
  }
  if (hostMatches(domain, MARKETPLACE_OR_DIRECTORY_HOSTS)) {
    return {
      entityType: "marketplace_or_directory",
      crawl: false,
      reason: "The public contact is a marketplace or directory listing.",
    };
  }
  if (hostMatches(domain, CONTACT_OR_FILE_SERVICE_HOSTS)) {
    return {
      entityType: "contact_or_file_service",
      crawl: false,
      reason: "The public contact is an email or file-sharing service, not a storefront.",
    };
  }
  if (/Confirmed US storefront/i.test(vendor.retailStatus || "")) {
    return {
      entityType: "retail_storefront",
      crawl: true,
      reason: "The source census classifies this domain as a confirmed storefront.",
    };
  }
  if (/Probable or gated US storefront/i.test(vendor.retailStatus || "")) {
    return {
      entityType: "probable_retail_storefront",
      crawl: true,
      reason: "The source census classifies this domain as a probable or gated storefront.",
    };
  }
  return {
    entityType: "unknown_public_website",
    crawl: true,
    reason: "The public website requires first-pass classification.",
  };
}

function normalizePublicUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        /^utm_/i.test(key) ||
        ["gclid", "fbclid", "msclkid", "ref", "affiliate", "session"].includes(
          key.toLowerCase(),
        )
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}

function isSameDomain(url, domain) {
  try {
    const host = normalizeDomain(new URL(url).hostname);
    return host === domain || host?.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function isLikelyDocumentOrAsset(url) {
  return /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mp4|mov|otf|png|pptx?|svg|tiff?|txt|webm|webp|woff2?|xlsx?|xml|zip)(?:\?|$)/i.test(
    url,
  );
}

function urlPriority(url, productUrl) {
  const normalized = String(url).toLowerCase();
  let score = 0;
  if (productUrl && normalizePublicUrl(url) === normalizePublicUrl(productUrl)) {
    score += 100;
  }
  if (/retatrutide|glp[-]?3|triple[-_]?agonist/.test(normalized)) score += 90;
  if (/\/(?:product|products|shop|catalog|collection)/.test(normalized)) score += 30;
  if (/coa|certificate|testing|lab[-_]?result|quality/.test(normalized)) score += 24;
  if (/shipping|delivery|return|refund|payment|checkout/.test(normalized)) score += 18;
  if (/affiliate|referral|reward|subscription|subscribe/.test(normalized)) score += 16;
  if (/about|contact|faq|terms|privacy/.test(normalized)) score += 12;
  if (/blog|research|article/.test(normalized)) score += 8;
  score -= normalized.split("/").length;
  return score;
}

function extractLinks(html, pageUrl) {
  const links = [];
  const expression =
    /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || "").matchAll(expression)) {
    const url = normalizePublicUrl(decodeHtmlEntities(match[1]), pageUrl);
    if (!url) continue;
    links.push({
      url,
      text: htmlToText(match[2]),
    });
  }
  return links;
}

function parseSitemapUrls(xml, baseUrl) {
  const urls = [];
  for (const match of String(xml || "").matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const url = normalizePublicUrl(decodeHtmlEntities(match[1]), baseUrl);
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

function parseRobotsPolicy(text) {
  const disallow = [];
  const sitemaps = [];
  let appliesToWildcard = false;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      appliesToWildcard = value === "*";
    } else if (key === "disallow" && appliesToWildcard && value) {
      disallow.push(value);
    } else if (key === "sitemap" && value) {
      const sitemap = normalizePublicUrl(value);
      if (sitemap) sitemaps.push(sitemap);
    }
  }

  return {
    disallow: [...new Set(disallow)],
    sitemaps: [...new Set(sitemaps)],
  };
}

function robotsAllows(url, policy) {
  if (!policy?.disallow?.length) return true;
  try {
    const target = new URL(url);
    return !policy.disallow.some((rule) => {
      if (rule === "/") return true;
      const anchoredAtEnd = rule.endsWith("$");
      const withoutAnchor = anchoredAtEnd ? rule.slice(0, -1) : rule;
      const escaped = withoutAnchor
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replaceAll("*", ".*");
      if (!escaped) return false;
      const expression = new RegExp(`^${escaped}${anchoredAtEnd ? "$" : ""}`);
      return expression.test(`${target.pathname}${target.search}`);
    });
  } catch {
    return false;
  }
}

export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  if (/^\d+$/.test(String(value).trim())) {
    return Number(value) * 1000;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

async function readBodyLimited(response, maximumBytes) {
  if (!response.body) return { text: "", bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maximumBytes - bytes;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const selected = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(decoder.decode(selected, { stream: true }));
    bytes += selected.byteLength;
    if (value.byteLength > remaining) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  chunks.push(decoder.decode());
  return { text: chunks.join(""), bytes, truncated };
}

function createEvidenceFactory({ url, capturedAt, evidence }) {
  return function addEvidence({
    field,
    value,
    snippet,
    confidence = "medium",
    sourceType = "first_party_page",
  }) {
    const normalizedValue =
      typeof value === "string" ? cleanWhitespace(value) : JSON.stringify(value);
    const normalizedSnippet = cleanWhitespace(snippet).slice(0, 320);
    const id = sha256(
      [field, normalizedValue, url, normalizedSnippet, capturedAt].join("\n"),
    ).slice(0, 18);
    if (!evidence.some((item) => item.id === id)) {
      evidence.push({
        id,
        field,
        value:
          typeof value === "string" ? cleanWhitespace(value).slice(0, 240) : value,
        url,
        snippet: normalizedSnippet,
        capturedAt,
        confidence,
        sourceType,
      });
    }
    return id;
  };
}

function signal(value, evidenceId, confidence = "medium", extra = {}) {
  return {
    value,
    confidence,
    evidenceIds: evidenceId ? [evidenceId] : [],
    ...extra,
  };
}

function extractPrices(text, addEvidence, isRetaPage) {
  if (!isRetaPage) return [];
  const prices = [];
  const expression =
    /(?:US\$|\$|USD\s*|€|EUR\s*|£|GBP\s*)(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)/gi;
  for (const match of text.matchAll(expression)) {
    const raw = match[0].trim();
    const numeric = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100000) continue;
    const currency = raw.startsWith("€") || /^EUR/i.test(raw)
      ? "EUR"
      : raw.startsWith("£") || /^GBP/i.test(raw)
        ? "GBP"
        : "USD";
    const id = addEvidence({
      field: "pricing.price",
      value: { amount: numeric, currency, display: raw },
      snippet: snippetAround(text, raw),
      confidence: "medium",
    });
    prices.push({
      amount: numeric,
      currency,
      display: raw,
      confidence: "medium",
      evidenceIds: [id],
    });
    if (prices.length >= 16) break;
  }
  return prices;
}

function extractStrengths(text, addEvidence, isRetaPage) {
  if (!isRetaPage) return [];
  const strengths = [];
  for (const match of text.matchAll(/\b(\d{1,4}(?:\.\d+)?)\s*(mcg|mg|g)\b/gi)) {
    const display = `${match[1]}${match[2].toLowerCase()}`;
    const id = addEvidence({
      field: "reta.strength",
      value: display,
      snippet: snippetAround(text, match[0]),
      confidence: "high",
    });
    strengths.push(signal(display, id, "high"));
    if (strengths.length >= 16) break;
  }
  return strengths;
}

function extractPublicEmails(text, addEvidence) {
  const emails = [];
  for (const match of text.matchAll(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  )) {
    const value = match[0].toLowerCase();
    if (/\.(?:png|jpg|jpeg|gif|webp)$/i.test(value)) continue;
    const id = addEvidence({
      field: "operations.contactEmail",
      value,
      snippet: snippetAround(text, value),
      confidence: "high",
    });
    emails.push(signal(value, id, "high"));
    if (emails.length >= 8) break;
  }
  return emails;
}

function extractCoaLinks(links, addEvidence) {
  const results = [];
  for (const link of links) {
    const combined = `${link.url} ${link.text}`;
    if (!/\b(?:coa|certificate of analysis|lab results?|testing|analytical report)\b/i.test(combined)) {
      continue;
    }
    const id = addEvidence({
      field: "trust.coaLink",
      value: link.url,
      snippet: cleanWhitespace(`${link.text} ${link.url}`),
      confidence: "high",
      sourceType: "first_party_link",
    });
    results.push(signal(link.url, id, "high", { label: link.text || null }));
  }
  return results.slice(0, 20);
}

function extractPlugins(html, addEvidence) {
  const plugins = [];
  for (const match of String(html).matchAll(/\/wp-content\/plugins\/([^/"'?]+)/gi)) {
    const value = match[1].toLowerCase();
    const id = addEvidence({
      field: "platform.plugin",
      value,
      snippet: snippetAround(html, match[0]),
      confidence: "medium",
      sourceType: "html_source",
    });
    plugins.push(signal(value, id, "medium"));
  }
  return plugins.slice(0, 30);
}

export function extractPageSignals({
  html,
  url,
  capturedAt,
  headers = {},
  durationMs = null,
  bytes = null,
}) {
  const evidence = [];
  const addEvidence = createEvidenceFactory({ url, capturedAt, evidence });
  const text = htmlToText(html);
  const title =
    extractTagText(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i) || null;
  const h1 = extractTagText(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || null;
  const descriptionMatch =
    /<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(
      html,
    ) ||
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i.exec(
      html,
    );
  const description = descriptionMatch
    ? cleanWhitespace(decodeHtmlEntities(descriptionMatch[1]))
    : null;
  const links = extractLinks(html, url);
  const retaPattern =
    /\bretatrutide\b|\bGLP[-\s]?3\b|triple[-\s](?:receptor[-\s])?agonist/i;
  const urlObject = new URL(url);
  const mentionsReta = retaPattern.test(
    `${url} ${title || ""} ${h1 || ""} ${text}`,
  );
  const schemaProductNames = extractJsonLdProductNames(html);
  const primaryIdentity = [
    { kind: "url", value: decodeURIComponent(urlObject.pathname) },
    { kind: "title", value: title },
    { kind: "h1", value: h1 },
    ...schemaProductNames.map((value) => ({
      kind: "product_schema_name",
      value,
    })),
  ].filter((item) => item.value);
  const retaIdentitySignals = primaryIdentity.filter((item) =>
    retaPattern.test(item.value),
  );
  const singleProductPath =
    /\/(?:product|products|peptide|peptides)\/(?!category(?:\/|$))[^/?#]+/i.test(
      urlObject.pathname,
    );
  const explicitNonRetaProductIdentity =
    singleProductPath &&
    primaryIdentity.some((item) =>
      ["title", "h1", "product_schema_name"].includes(item.kind),
    ) &&
    retaIdentitySignals.length === 0;
  const collectionOrCatalogPath =
    /\/(?:products?|shop|catalog|collections?|product-category)(?:\/|$)/i.test(
      urlObject.pathname,
    );
  const retaSchemaIdentity = retaIdentitySignals.some(
    (item) => item.kind === "product_schema_name",
  );
  const closeRetaCommerceBlock = hasCloseRetaCommerceBlock(html, retaPattern);
  const isRetaPage =
    mentionsReta &&
    !explicitNonRetaProductIdentity &&
    (retaSchemaIdentity ||
      (singleProductPath && retaIdentitySignals.length > 0) ||
      (retaIdentitySignals.length > 0 && closeRetaCommerceBlock) ||
      (collectionOrCatalogPath && closeRetaCommerceBlock));

  const platform = [];
  for (const definition of PLATFORM_DEFINITIONS) {
    if (!definition.pattern.test(html)) continue;
    const id = addEvidence({
      field: "platform.storefront",
      value: definition.value,
      snippet: snippetAround(html, definition.pattern),
      confidence:
        ["WooCommerce", "Shopify", "Medusa", "BigCommerce", "Magento"].includes(
          definition.value,
        )
          ? "high"
          : "medium",
      sourceType: "html_source",
    });
    platform.push(
      signal(
        definition.value,
        id,
        ["WooCommerce", "Shopify", "Medusa", "BigCommerce", "Magento"].includes(
          definition.value,
        )
          ? "high"
          : "medium",
      ),
    );
  }

  const tracking = [];
  for (const definition of TRACKER_DEFINITIONS) {
    const expression = new RegExp(definition.pattern.source, definition.pattern.flags);
    for (const match of html.matchAll(expression)) {
      const publicId =
        (definition.capture ? match[definition.capture] : match[0]) || null;
      const normalizedId = definition.publicIdOptional
        ? publicId && publicId.length <= 50
          ? publicId
          : null
        : publicId;
      const value = {
        provider: definition.provider,
        publicId: normalizedId,
      };
      const id = addEvidence({
        field: "tracking.tag",
        value,
        snippet: snippetAround(html, match[0]),
        confidence: normalizedId ? "high" : "medium",
        sourceType: "html_source",
      });
      tracking.push({
        ...value,
        confidence: normalizedId ? "high" : "medium",
        evidenceIds: [id],
      });
      if (tracking.length >= 30) break;
    }
  }

  const paymentVisible = [];
  for (const [value, pattern] of PAYMENT_VISIBLE_DEFINITIONS) {
    if (!pattern.test(text)) continue;
    const id = addEvidence({
      field: "payment.visibleMethod",
      value,
      snippet: snippetAround(text, pattern),
      confidence: "medium",
      sourceType: "visible_first_party_language",
    });
    paymentVisible.push(signal(value, id, "medium"));
  }

  const paymentIntegrations = [];
  for (const [value, pattern] of PAYMENT_INTEGRATION_DEFINITIONS) {
    if (!pattern.test(html)) continue;
    const id = addEvidence({
      field: "payment.integrationSignal",
      value,
      snippet: snippetAround(html, pattern),
      confidence: "low",
      sourceType: "html_source",
    });
    paymentIntegrations.push(
      signal(value, id, "low", {
        caveat: "Public source integration signal; activation and acquiring chain are unconfirmed.",
      }),
    );
  }

  const offers = [];
  for (const [value, pattern] of OFFER_DEFINITIONS) {
    if (!pattern.test(text)) continue;
    const id = addEvidence({
      field: "marketing.offer",
      value,
      snippet: snippetAround(text, pattern),
      confidence: "medium",
    });
    offers.push(signal(value, id, "medium"));
  }

  const claims = [];
  for (const [category, value, pattern, confidence] of CLAIM_DEFINITIONS) {
    if (!pattern.test(text)) continue;
    const id = addEvidence({
      field: `claims.${category}`,
      value,
      snippet: snippetAround(text, pattern),
      confidence,
    });
    claims.push(signal(value, id, confidence, { category }));
  }

  const sourcing = [];
  for (const [value, pattern] of SOURCING_DEFINITIONS) {
    if (!pattern.test(text)) continue;
    const id = addEvidence({
      field: "sourcing.claim",
      value,
      snippet: snippetAround(text, pattern),
      confidence: "medium",
    });
    sourcing.push(
      signal(value, id, "medium", {
        caveat: "First-party claim; independent verification is not established by this crawl.",
      }),
    );
  }

  const shipping = [];
  for (const pattern of [
    /\b(?:same[- ]day|next[- ]day|two[- ]day|2[- ]day|3[- ]day) shipping\b/i,
    /\bships? within \d+(?:-\d+)? business days?\b/i,
    /\bfree shipping(?: on orders over [^.!?]{1,50})?/i,
    /\b(?:domestic|international|worldwide) shipping\b/i,
  ]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = cleanWhitespace(match[0]);
    const id = addEvidence({
      field: "operations.shipping",
      value,
      snippet: snippetAround(text, match[0]),
      confidence: "medium",
    });
    shipping.push(signal(value, id, "medium"));
  }

  const returnSignals = [];
  for (const pattern of [
    /\b(?:\d{1,3}[- ]day )?returns?\b/i,
    /\b(?:all sales are final|no returns?|non[- ]returnable)\b/i,
    /\brefund policy\b/i,
  ]) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = cleanWhitespace(match[0]);
    const id = addEvidence({
      field: "operations.returns",
      value,
      snippet: snippetAround(text, match[0]),
      confidence: "medium",
    });
    returnSignals.push(signal(value, id, "medium"));
  }

  const reviewProviders = [];
  for (const [value, pattern] of [
    ["Trustpilot", /trustpilot/i],
    ["Judge.me", /judge\.me|judgeme/i],
    ["Yotpo", /yotpo/i],
    ["Loox", /loox/i],
    ["Stamped", /stamped\.io/i],
    ["Google Reviews", /google reviews/i],
  ]) {
    if (!pattern.test(html)) continue;
    const id = addEvidence({
      field: "trust.reviewProvider",
      value,
      snippet: snippetAround(html, pattern),
      confidence: "medium",
      sourceType: "html_source",
    });
    reviewProviders.push(signal(value, id, "medium"));
  }

  const reviewCountMatch = /\b([\d,]{1,10})\s+(?:verified\s+|customer\s+)?reviews?\b/i.exec(
    text,
  );
  const reviewCount = reviewCountMatch
    ? Number(reviewCountMatch[1].replaceAll(",", ""))
    : null;
  let reviewCountSignal = null;
  if (Number.isFinite(reviewCount)) {
    const id = addEvidence({
      field: "trust.reviewCountClaim",
      value: reviewCount,
      snippet: snippetAround(text, reviewCountMatch[0]),
      confidence: "low",
    });
    reviewCountSignal = signal(reviewCount, id, "low", {
      caveat: "Displayed first-party count; authenticity was not independently verified.",
    });
  }

  const ratingMatch = /\b([1-5](?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?)\b/i.exec(text);
  let ratingSignal = null;
  if (ratingMatch) {
    const value = Number(ratingMatch[1]);
    const id = addEvidence({
      field: "trust.ratingClaim",
      value,
      snippet: snippetAround(text, ratingMatch[0]),
      confidence: "low",
    });
    ratingSignal = signal(value, id, "low", {
      caveat: "Displayed first-party rating; authenticity was not independently verified.",
    });
  }

  const prices = extractPrices(text, addEvidence, isRetaPage);
  const strengths = extractStrengths(text, addEvidence, isRetaPage);
  const emails = extractPublicEmails(text, addEvidence);
  const coaLinks = extractCoaLinks(links, addEvidence);
  const plugins = extractPlugins(html, addEvidence);

  const productForms = [];
  if (isRetaPage) {
    for (const [value, pattern] of [
      ["lyophilized vial", /\blyophili[sz]ed (?:powder|vial)\b/i],
      ["vial", /\bvial\b/i],
      ["powder", /\bpowder\b/i],
      ["oral", /\boral\b/i],
      ["capsule", /\bcapsules?\b/i],
    ]) {
      if (!pattern.test(text)) continue;
      const id = addEvidence({
        field: "reta.form",
        value,
        snippet: snippetAround(text, pattern),
        confidence: "medium",
      });
      productForms.push(signal(value, id, "medium"));
    }
  }

  let listingStatus = null;
  if (isRetaPage) {
    const identity = retaIdentitySignals[0] || {
      kind: "commerce_block",
      value: "Retatrutide commerce block",
    };
    addEvidence({
      field: "reta.productIdentity",
      value: identity.value,
      snippet:
        identity.kind === "commerce_block"
          ? snippetAround(text, retaPattern)
          : cleanWhitespace(identity.value),
      confidence: identity.kind === "commerce_block" ? "medium" : "high",
      sourceType:
        identity.kind === "commerce_block"
          ? "first_party_commerce_block"
          : `first_party_${identity.kind}`,
    });
    const statusDefinition = [
      ["out_of_stock", /\b(?:out of stock|sold out|currently unavailable)\b/i],
      ["preorder", /\b(?:pre[- ]?order|backorder)\b/i],
      ["available", /\b(?:in stock|add to cart|add to bag|buy now)\b/i],
      ["listed", retaPattern],
    ].find(([, pattern]) => pattern.test(text));
    const statusValue = statusDefinition?.[0] || "listed";
    const statusPattern = statusDefinition?.[1] || retaPattern;
    const id = addEvidence({
      field: "reta.listingStatus",
      value: statusValue,
      snippet: snippetAround(text, statusPattern),
      confidence: statusValue === "listed" ? "medium" : "high",
    });
    listingStatus = signal(
      statusValue,
      id,
      statusValue === "listed" ? "medium" : "high",
    );
  }

  const positioning = [];
  for (const [field, value] of [
    ["title", title],
    ["h1", h1],
    ["description", description],
  ]) {
    if (!value) continue;
    const id = addEvidence({
      field: `marketing.positioning.${field}`,
      value,
      snippet: value,
      confidence: "high",
      sourceType: "html_metadata",
    });
    positioning.push(signal(value, id, "high", { kind: field }));
  }

  const contactLinks = links
    .filter((link) => /\bcontact|support|help\b/i.test(`${link.text} ${link.url}`))
    .slice(0, 10)
    .map((link) => {
      const id = addEvidence({
        field: "operations.contactUrl",
        value: link.url,
        snippet: cleanWhitespace(`${link.text} ${link.url}`),
        confidence: "high",
        sourceType: "first_party_link",
      });
      return signal(link.url, id, "high", { label: link.text || null });
    });

  const policyLinks = links
    .filter((link) =>
      /\b(?:shipping|delivery|return|refund|payment|privacy|terms)\b/i.test(
        `${link.text} ${link.url}`,
      ),
    )
    .slice(0, 20)
    .map((link) => {
      const id = addEvidence({
        field: "operations.policyUrl",
        value: link.url,
        snippet: cleanWhitespace(`${link.text} ${link.url}`),
        confidence: "high",
        sourceType: "first_party_link",
      });
      return signal(link.url, id, "high", { label: link.text || null });
    });

  const designEvidence = {};
  const viewport = /<meta\b[^>]*name=["']viewport["']/i.test(html);
  const responsiveCss = /@media\s*\(|\bsrcset=|sizes=["']/i.test(html);
  const mobileNavigation = /\b(?:mobile[-_ ]menu|hamburger|drawer|nav-toggle)\b/i.test(
    html,
  );
  const mobileScore = clamp(
    (viewport ? 4 : 0) + (responsiveCss ? 3 : 0) + (mobileNavigation ? 3 : 0),
    0,
    10,
  );
  designEvidence.mobileUsability = addEvidence({
    field: "design.mobileUsability",
    value: mobileScore,
    snippet: `DOM proxy: viewport=${viewport}; responsiveAssets=${responsiveCss}; mobileNavigation=${mobileNavigation}`,
    confidence: "low",
    sourceType: "automated_dom_proxy",
  });

  const ctaPresent = /\b(?:add to cart|add to bag|buy now|select options)\b/i.test(text);
  const pricePresent = prices.length > 0;
  const strengthPresent = strengths.length > 0;
  const productClarityScore = isRetaPage
    ? clamp(
        (h1 ? 2 : 0) +
          (pricePresent ? 2 : 0) +
          (strengthPresent ? 2 : 0) +
          (listingStatus ? 2 : 0) +
          (ctaPresent ? 2 : 0),
        0,
        10,
      )
    : null;
  if (productClarityScore !== null) {
    designEvidence.productClarity = addEvidence({
      field: "design.productClarity",
      value: productClarityScore,
      snippet: `DOM proxy: h1=${Boolean(h1)}; price=${pricePresent}; strength=${strengthPresent}; status=${Boolean(listingStatus)}; cta=${ctaPresent}`,
      confidence: "low",
      sourceType: "automated_dom_proxy",
    });
  }

  const trustPresentationScore = clamp(
    (coaLinks.length ? 3 : 0) +
      (reviewProviders.length || reviewCountSignal ? 2 : 0) +
      (policyLinks.length ? 2 : 0) +
      (contactLinks.length || emails.length ? 2 : 0) +
      (offers.some((item) => item.value === "guarantee") ? 1 : 0),
    0,
    10,
  );
  designEvidence.trustPresentation = addEvidence({
    field: "design.trustPresentation",
    value: trustPresentationScore,
    snippet: `DOM proxy: coa=${coaLinks.length}; reviews=${reviewProviders.length}; policies=${policyLinks.length}; contact=${contactLinks.length + emails.length}; guarantee=${offers.some((item) => item.value === "guarantee")}`,
    confidence: "low",
    sourceType: "automated_dom_proxy",
  });

  const conversionUxScore = isRetaPage
    ? clamp(
        (ctaPresent ? 3 : 0) +
          (pricePresent ? 2 : 0) +
          (listingStatus ? 1 : 0) +
          (shipping.length ? 1 : 0) +
          (returnSignals.length || policyLinks.length ? 1 : 0) +
          (offers.length ? 2 : 0),
        0,
        10,
      )
    : null;
  if (conversionUxScore !== null) {
    designEvidence.conversionUX = addEvidence({
      field: "design.conversionUX",
      value: conversionUxScore,
      snippet: `DOM proxy: cta=${ctaPresent}; price=${pricePresent}; status=${Boolean(listingStatus)}; shipping=${shipping.length}; policy=${returnSignals.length + policyLinks.length}; offers=${offers.length}`,
      confidence: "low",
      sourceType: "automated_dom_proxy",
    });
  }

  const performanceScore =
    Number.isFinite(durationMs) && Number.isFinite(bytes)
      ? clamp(
          (durationMs < 1000 ? 6 : durationMs < 2000 ? 5 : durationMs < 4000 ? 3 : 1) +
            (bytes < 300_000 ? 4 : bytes < 800_000 ? 3 : bytes < 1_500_000 ? 1 : 0),
          0,
          10,
        )
      : null;
  if (performanceScore !== null) {
    designEvidence.performance = addEvidence({
      field: "design.performance",
      value: performanceScore,
      snippet: `Single-fetch proxy: durationMs=${durationMs}; htmlBytes=${bytes}`,
      confidence: "low",
      sourceType: "automated_network_proxy",
    });
  }

  return {
    url,
    capturedAt,
    title,
    h1,
    description,
    contentHash: sha256(html),
    htmlBytes: bytes ?? Buffer.byteLength(html),
    durationMs,
    headers: {
      server: headers.server || null,
      poweredBy: headers["x-powered-by"] || null,
      contentType: headers["content-type"] || null,
    },
    links,
    platform,
    plugins,
    tracking,
    reta: {
      mentioned: mentionsReta,
      listed: isRetaPage,
      identitySignals: retaIdentitySignals,
      listingStatus,
      strengths,
      forms: productForms,
    },
    pricing: {
      prices,
    },
    marketing: {
      positioning,
      offers,
    },
    trust: {
      coaLinks,
      reviewProviders,
      reviewCount: reviewCountSignal,
      rating: ratingSignal,
    },
    operations: {
      shipping,
      returns: returnSignals,
      contactEmails: emails,
      contactUrls: contactLinks,
      policyUrls: policyLinks,
    },
    payment: {
      visibleMethods: paymentVisible,
      integrationSignals: paymentIntegrations,
    },
    claims,
    sourcing,
    designProxy: {
      mobileUsability: mobileScore,
      productClarity: productClarityScore,
      trustPresentation: trustPresentationScore,
      conversionUX: conversionUxScore,
      performance: performanceScore,
      evidenceIds: Object.values(designEvidence),
    },
    evidence,
  };
}

function confidenceRank(value) {
  return { high: 3, medium: 2, low: 1 }[value] || 0;
}

function mergeSignals(signals, keyFunction = (item) => String(item.value).toLowerCase()) {
  const merged = new Map();
  for (const item of signals.filter(Boolean)) {
    const key = keyFunction(item);
    if (!key) continue;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        ...item,
        evidenceIds: [...new Set(item.evidenceIds || [])].sort(),
      });
      continue;
    }
    current.evidenceIds = [
      ...new Set([...(current.evidenceIds || []), ...(item.evidenceIds || [])]),
    ].sort();
    if (confidenceRank(item.confidence) > confidenceRank(current.confidence)) {
      current.confidence = item.confidence;
    }
  }
  return [...merged.values()].sort((left, right) =>
    keyFunction(left).localeCompare(keyFunction(right)),
  );
}

function mergeNullableNumbers(values) {
  const available = values.filter(Number.isFinite);
  if (!available.length) return null;
  return Math.round((available.reduce((sum, value) => sum + value, 0) / available.length) * 10) / 10;
}

function summarizeEntityType(inputClassification, pages) {
  if (inputClassification.entityType !== "unknown_public_website") {
    return inputClassification.entityType;
  }
  const allText = pages
    .map((page) => `${page.title || ""} ${page.h1 || ""} ${page.description || ""}`)
    .join(" ");
  const hasCommerce =
    pages.some((page) => page.reta.listed || page.pricing.prices.length) ||
    /\b(?:shop|add to cart|checkout|buy now)\b/i.test(allText);
  const hasManufacturerSignals = pages.some((page) =>
    page.sourcing.some((item) =>
      ["manufacturer_claim", "wholesale_oem"].includes(item.value),
    ),
  );
  if (hasCommerce) return "retail_storefront";
  if (hasManufacturerSignals) return "manufacturer_or_supplier";
  return "unknown_public_website";
}

export function summarizeVendorAudit({
  vendor,
  normalizedDomain,
  inputClassification,
  pages,
  errors,
  capturedAt,
  robots,
  status,
}) {
  const evidence = pages
    .flatMap((page) => page.evidence)
    .sort((left, right) => left.id.localeCompare(right.id));
  const platforms = mergeSignals(pages.flatMap((page) => page.platform));
  const platformPrimary =
    platforms
      .slice()
      .sort(
        (left, right) =>
          confidenceRank(right.confidence) - confidenceRank(left.confidence),
      )[0] || null;
  const plugins = mergeSignals(pages.flatMap((page) => page.plugins));
  const tracking = mergeSignals(
    pages.flatMap((page) => page.tracking).map((item) => ({
      ...item,
      value: `${item.provider}:${item.publicId || "present"}`,
    })),
  ).map(({ value: _value, ...item }) => item);
  const retaMentionPages = pages.filter((page) => page.reta.mentioned);
  const retaPages = pages.filter((page) => page.reta.listed);
  const listingStatuses = mergeSignals(
    retaPages.map((page) => page.reta.listingStatus).filter(Boolean),
  );
  const statusPriority = ["available", "preorder", "out_of_stock", "listed"];
  const listingStatus =
    statusPriority.find((candidate) =>
      listingStatuses.some((item) => item.value === candidate),
    ) || null;
  const prices = mergeSignals(
    retaPages.flatMap((page) =>
      page.pricing.prices.map((item) => ({
        ...item,
        value: `${item.currency}:${item.amount}`,
      })),
    ),
  ).map(({ value: _value, ...item }) => item);
  const strengths = mergeSignals(
    retaPages.flatMap((page) => page.reta.strengths),
  );
  const forms = mergeSignals(retaPages.flatMap((page) => page.reta.forms));
  const positioning = mergeSignals(
    pages.flatMap((page) => page.marketing.positioning),
    (item) => `${item.kind}:${String(item.value).toLowerCase()}`,
  ).slice(0, 20);
  const offers = mergeSignals(pages.flatMap((page) => page.marketing.offers));
  const coaLinks = mergeSignals(pages.flatMap((page) => page.trust.coaLinks));
  const reviewProviders = mergeSignals(
    pages.flatMap((page) => page.trust.reviewProviders),
  );
  const reviewCounts = pages.map((page) => page.trust.reviewCount).filter(Boolean);
  const ratings = pages.map((page) => page.trust.rating).filter(Boolean);
  const shipping = mergeSignals(pages.flatMap((page) => page.operations.shipping));
  const returns = mergeSignals(pages.flatMap((page) => page.operations.returns));
  const contactEmails = mergeSignals(
    pages.flatMap((page) => page.operations.contactEmails),
  );
  const contactUrls = mergeSignals(
    pages.flatMap((page) => page.operations.contactUrls),
  );
  const policyUrls = mergeSignals(
    pages.flatMap((page) => page.operations.policyUrls),
  );
  const visibleMethods = mergeSignals(
    pages.flatMap((page) => page.payment.visibleMethods),
  );
  const integrationSignals = mergeSignals(
    pages.flatMap((page) => page.payment.integrationSignals),
  );
  const paymentEvidenceById = new Map(
    pages
      .flatMap((page) => page.evidence || [])
      .filter((item) => item?.id)
      .map((item) => [item.id, item]),
  );
  const providerSignals = enrichPaymentProviders(
    {
      visibleMethods,
      checkoutIntegration: integrationSignals,
      gatewayPsp: integrationSignals,
    },
    {
      capturedAt,
      evidenceById: paymentEvidenceById,
    },
  );
  const claims = mergeSignals(
    pages.flatMap((page) => page.claims),
    (item) => `${item.category}:${String(item.value).toLowerCase()}`,
  );
  const sourcing = mergeSignals(pages.flatMap((page) => page.sourcing));

  const productUrls = retaPages.map((page) => page.url).sort();
  const affiliate = offers.some((item) => item.value === "affiliate");
  const referral = offers.some((item) => item.value === "referral");
  const subscription = offers.some((item) => item.value === "subscription");
  const blogPages = pages.filter((page) => /\/(?:blog|research|article)/i.test(page.url));
  const mobileUsability = mergeNullableNumbers(
    pages.map((page) => page.designProxy.mobileUsability),
  );
  const productClarity = mergeNullableNumbers(
    retaPages.map((page) => page.designProxy.productClarity),
  );
  const trustPresentation = mergeNullableNumbers(
    pages.map((page) => page.designProxy.trustPresentation),
  );
  const conversionUX = mergeNullableNumbers(
    retaPages.map((page) => page.designProxy.conversionUX),
  );
  const performance = mergeNullableNumbers(
    pages.map((page) => page.designProxy.performance),
  );
  const designScores = [
    mobileUsability,
    productClarity,
    trustPresentation,
    conversionUX,
    performance,
  ].filter(Number.isFinite);
  const overall = mergeNullableNumbers(designScores);
  const designReasons = [];
  if (mobileUsability !== null) {
    designReasons.push(
      `Mobile DOM proxy ${mobileUsability}/10 from viewport, responsive assets, and navigation signals.`,
    );
  }
  if (productClarity !== null) {
    designReasons.push(
      `Product clarity proxy ${productClarity}/10 from title, price, strength, status, and CTA visibility.`,
    );
  }
  if (trustPresentation !== null) {
    designReasons.push(
      `Trust presentation proxy ${trustPresentation}/10 from COAs, reviews, policies, contact, and guarantee signals.`,
    );
  }

  return {
    domain: normalizedDomain,
    name: vendor.name || normalizedDomain,
    sourceUrl: vendor.url || vendor.productUrl || null,
    productUrl: vendor.productUrl || null,
    capturedAt,
    entityType: summarizeEntityType(inputClassification, pages),
    classification: {
      value: inputClassification.entityType,
      reason: inputClassification.reason,
      confidence:
        inputClassification.entityType === "unknown_public_website" ? "low" : "high",
      url: vendor.url || vendor.productUrl || null,
      capturedAt,
    },
    status,
    pagesCrawled: pages.length,
    pageUrls: pages.map((page) => page.url).sort(),
    platform: {
      primary: platformPrimary,
      detected: platforms,
      plugins,
      serverHeaders: [
        ...new Set(pages.map((page) => page.headers.server).filter(Boolean)),
      ].sort(),
    },
    reta: {
      listed: retaPages.length > 0,
      listingStatus,
      productUrls,
      contentUrls: retaMentionPages.map((page) => page.url).sort(),
      evidenceIds: retaPages
        .flatMap((page) =>
          page.evidence
            .filter((item) =>
              ["reta.productIdentity", "reta.listingStatus"].includes(item.field),
            )
            .map((item) => item.id),
        )
        .filter(Boolean)
        .sort(),
      strengths,
      forms,
    },
    pricing: {
      prices,
      displayedRange:
        prices.length > 0
          ? {
              minimum: Math.min(...prices.map((item) => item.amount)),
              maximum: Math.max(...prices.map((item) => item.amount)),
              currencies: [...new Set(prices.map((item) => item.currency))].sort(),
              caveat: "Displayed first-party prices only; taxes, shipping, variants, and actual order totals are unverified.",
            }
          : null,
    },
    marketing: {
      positioning,
      offers,
      subscription,
      affiliate,
      referral,
      publicContentPagesCrawled: blogPages.length,
      retatrutideContentPagesCrawled: retaMentionPages.filter(
        (page) => !page.reta.listed,
      ).length,
    },
    tracking,
    trust: {
      coaLinks,
      reviewProviders,
      displayedReviewCounts: reviewCounts,
      displayedRatings: ratings,
      caveat: "Review counts, ratings, COAs, and badges remain first-party claims unless independently verified.",
    },
    operations: {
      shipping,
      returns,
      contactEmails,
      contactUrls,
      policyUrls,
    },
    payment: {
      visibleMethods,
      checkoutIntegration: integrationSignals,
      gatewayPsp: integrationSignals,
      processorIso: [],
      acquirerSponsorBank: [],
      providerSignals,
      evidenceBoundary: PROVIDER_BOUNDARY,
    },
    claims: {
      researchOnly: claims.filter((item) => item.category === "research_only"),
      humanUseOrOutcome: claims.filter((item) =>
        ["human_outcome", "administration", "therapeutic", "human_evidence"].includes(
          item.category,
        ),
      ),
      all: claims,
      caveat:
        "Automated cue detection is evidence triage, not a legal conclusion about intended use or compliance.",
    },
    sourcing: {
      claims: sourcing,
      independentlyVerifiedManufacturer: null,
      caveat:
        "The crawl records sourcing and manufacturing claims but does not identify or verify an undisclosed manufacturer.",
    },
    design: {
      mobileUsability,
      visualPolish: null,
      productClarity,
      trustPresentation,
      conversionUX,
      performance,
      overall,
      reasons: designReasons.slice(0, 3),
      methodology:
        "Automated DOM and single-fetch performance proxies. Visual polish remains pending without screenshot review; scores are not visual judgments.",
      evidenceIds: {
        mobileUsability: pages
          .flatMap((page) => page.designProxy.evidenceIds || [])
          .filter((id) =>
            evidence.some(
              (item) => item.id === id && item.field === "design.mobileUsability",
            ),
          ),
        productClarity: pages
          .flatMap((page) => page.designProxy.evidenceIds || [])
          .filter((id) =>
            evidence.some(
              (item) => item.id === id && item.field === "design.productClarity",
            ),
          ),
        trustPresentation: pages
          .flatMap((page) => page.designProxy.evidenceIds || [])
          .filter((id) =>
            evidence.some(
              (item) => item.id === id && item.field === "design.trustPresentation",
            ),
          ),
        conversionUX: pages
          .flatMap((page) => page.designProxy.evidenceIds || [])
          .filter((id) =>
            evidence.some(
              (item) => item.id === id && item.field === "design.conversionUX",
            ),
          ),
        performance: pages
          .flatMap((page) => page.designProxy.evidenceIds || [])
          .filter((id) =>
            evidence.some(
              (item) => item.id === id && item.field === "design.performance",
            ),
          ),
      },
    },
    robots: {
      fetched: Boolean(robots),
      disallowCount: robots?.disallow?.length || 0,
      sitemapCount: robots?.sitemaps?.length || 0,
    },
    evidence,
    errors: errors.slice().sort((left, right) =>
      `${left.url || ""}:${left.code || ""}`.localeCompare(
        `${right.url || ""}:${right.code || ""}`,
      ),
    ),
  };
}

function checkpointPath(checkpointDir, domain) {
  const safeDomain = domain.replace(/[^a-z0-9.-]+/gi, "_");
  return path.join(checkpointDir, `${safeDomain}.json`);
}

async function readCheckpoint(checkpointDir, domain) {
  try {
    return JSON.parse(await readFile(checkpointPath(checkpointDir, domain), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeCheckpoint(checkpointDir, domain, payload) {
  await mkdir(checkpointDir, { recursive: true });
  const destination = checkpointPath(checkpointDir, domain);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

function headersToObject(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

class PublicDomainSession {
  constructor({
    domain,
    fetchImpl,
    timeoutMs,
    delayMs,
    maximumBodyBytes,
    sleep,
    userAgent,
  }) {
    this.domain = domain;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.delayMs = delayMs;
    this.maximumBodyBytes = maximumBodyBytes;
    this.sleep = sleep;
    this.userAgent = userAgent;
    this.lastStartedAt = 0;
    this.blocked = false;
  }

  async fetch(url) {
    if (this.blocked) {
      return {
        ok: false,
        error: {
          code: "DOMAIN_STOPPED",
          message: "The domain session stopped after a blocking response.",
          url,
        },
      };
    }
    const elapsed = Date.now() - this.lastStartedAt;
    if (elapsed < this.delayMs) {
      await this.sleep(this.delayMs - elapsed);
    }
    this.lastStartedAt = Date.now();
    const startedAt = Date.now();
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.1",
          "user-agent": this.userAgent,
        },
      });
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error.name === "TimeoutError" ? "TIMEOUT" : "FETCH_ERROR",
          message: cleanWhitespace(error.message),
          url,
        },
      };
    }

    const responseHeaders = headersToObject(response.headers);
    const retryAfterMs = parseRetryAfter(responseHeaders["retry-after"]);
    if (response.status === 403 || response.status === 429) {
      this.blocked = true;
      try {
        await response.body?.cancel();
      } catch {
        // Best-effort body cancellation only.
      }
      return {
        ok: false,
        error: {
          code: response.status === 429 ? "RATE_LIMITED" : "ACCESS_BLOCKED",
          message: `Stopped this domain after HTTP ${response.status}; no retry attempted.`,
          url,
          httpStatus: response.status,
          retryAfterMs,
        },
      };
    }

    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        // Best-effort body cancellation only.
      }
      return {
        ok: false,
        error: {
          code: "HTTP_ERROR",
          message: `HTTP ${response.status} ${response.statusText}`.trim(),
          url,
          httpStatus: response.status,
          retryAfterMs,
        },
      };
    }

    const declaredLength = Number(responseHeaders["content-length"]);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > this.maximumBodyBytes * 2
    ) {
      try {
        await response.body?.cancel();
      } catch {
        // Best-effort body cancellation only.
      }
      return {
        ok: false,
        error: {
          code: "BODY_TOO_LARGE",
          message: `Skipped a ${declaredLength}-byte response.`,
          url,
        },
      };
    }

    let body;
    try {
      body = await readBodyLimited(response, this.maximumBodyBytes);
    } catch (error) {
      try {
        await response.body?.cancel();
      } catch {
        // Best-effort body cancellation only.
      }
      return {
        ok: false,
        error: {
          code: error.name === "TimeoutError" ? "TIMEOUT" : "BODY_READ_ERROR",
          message: cleanWhitespace(error.message),
          url,
        },
      };
    }
    return {
      ok: true,
      url: normalizePublicUrl(response.url || url) || url,
      status: response.status,
      headers: responseHeaders,
      text: body.text,
      bytes: body.bytes,
      truncated: body.truncated,
      durationMs: Date.now() - startedAt,
    };
  }
}

function seedUrls(vendor, domain) {
  const candidates = [
    vendor.productUrl,
    vendor.url,
    ...(FOCUSED_PRODUCT_SEEDS[domain] || []),
    `https://${domain}/`,
  ]
    .map((url) => normalizePublicUrl(url))
    .filter((url) => url && isSameDomain(url, domain));
  return [...new Set(candidates)];
}

async function auditOneVendor(vendor, options) {
  const domain =
    normalizeDomain(vendor.domain) ||
    normalizeDomain(vendor.url) ||
    normalizeDomain(vendor.productUrl);
  const inputClassification = classifyInputVendor(vendor);
  const capturedAt = options.capturedAt;

  if (!domain) {
    return {
      key: `unlinked:${sha256(vendor.name || JSON.stringify(vendor)).slice(0, 12)}`,
      audit: {
        domain: null,
        name: vendor.name || "Unknown vendor",
        capturedAt,
        entityType: "unlinked_vendor",
        status: "skipped",
        pagesCrawled: 0,
        platform: { primary: null, detected: [], plugins: [], serverHeaders: [] },
        reta: {
          listed: false,
          listingStatus: null,
          productUrls: [],
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
          publicContentPagesCrawled: 0,
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
          evidenceBoundary:
            "No public domain was available; payment evidence remains unknown.",
        },
        claims: {
          researchOnly: [],
          humanUseOrOutcome: [],
          all: [],
        },
        sourcing: {
          claims: [],
          independentlyVerifiedManufacturer: null,
        },
        design: {
          mobileUsability: null,
          visualPolish: null,
          productClarity: null,
          trustPresentation: null,
          conversionUX: null,
          performance: null,
          overall: null,
          reasons: ["No public website was available for automated scoring."],
        },
        evidence: [],
        errors: [],
      },
    };
  }

  const existingCheckpoint = await readCheckpoint(options.checkpointDir, domain);
  if (
    options.resume &&
    existingCheckpoint &&
    FINAL_CHECKPOINT_STATUSES.has(existingCheckpoint.status) &&
    existingCheckpoint.audit
  ) {
    return {
      key: domain,
      audit: existingCheckpoint.audit,
      cached: true,
    };
  }

  if (!inputClassification.crawl) {
    const audit = summarizeVendorAudit({
      vendor,
      normalizedDomain: domain,
      inputClassification,
      pages: [],
      errors: [],
      capturedAt,
      robots: null,
      status: "skipped",
    });
    await writeCheckpoint(options.checkpointDir, domain, {
      version: 1,
      status: "skipped",
      capturedAt,
      audit,
    });
    return { key: domain, audit };
  }

  const session = new PublicDomainSession({
    domain,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    delayMs: options.perDomainDelayMs,
    maximumBodyBytes: options.maximumBodyBytes,
    sleep: options.sleep,
    userAgent: options.userAgent,
  });
  const previousPages =
    options.resume && existingCheckpoint?.status === "in_progress"
      ? existingCheckpoint.pages || []
      : [];
  const pages = previousPages.slice();
  const errors =
    options.resume && existingCheckpoint?.status === "in_progress"
      ? existingCheckpoint.errors || []
      : [];
  const attemptedPageUrls = new Set([
    ...pages.map((page) => normalizePublicUrl(page.url)),
    ...errors
      .filter((error) => error.stage === "page")
      .map((error) => normalizePublicUrl(error.url)),
  ].filter(Boolean));
  let robots = existingCheckpoint?.robots || null;

  const persistProgress = async () => {
    await writeCheckpoint(options.checkpointDir, domain, {
      version: 1,
      status: "in_progress",
      capturedAt,
      vendor: {
        name: vendor.name || domain,
        domain,
        url: vendor.url || null,
        productUrl: vendor.productUrl || null,
      },
      inputClassification,
      robots,
      pages,
      errors,
    });
  };

  if (!robots) {
    const robotsUrl = `https://${domain}/robots.txt`;
    const robotsResponse = await session.fetch(robotsUrl);
    if (robotsResponse.ok) {
      robots = parseRobotsPolicy(robotsResponse.text);
      robots.fetchedAt = capturedAt;
      robots.url = robotsResponse.url;
    } else {
      errors.push({ ...robotsResponse.error, capturedAt });
      robots = {
        disallow: [],
        sitemaps: [],
        fetchedAt: capturedAt,
        url: robotsUrl,
        unavailable: true,
      };
    }
    await persistProgress();
  }

  if (session.blocked) {
    const audit = summarizeVendorAudit({
      vendor,
      normalizedDomain: domain,
      inputClassification,
      pages,
      errors,
      capturedAt,
      robots,
      status: "blocked",
    });
    await writeCheckpoint(options.checkpointDir, domain, {
      version: 1,
      status: "blocked",
      capturedAt,
      audit,
    });
    return { key: domain, audit };
  }

  const candidateMap = new Map();
  const addCandidate = (url, source) => {
    const normalized = normalizePublicUrl(url);
    if (
      !normalized ||
      !isSameDomain(normalized, domain) ||
      isLikelyDocumentOrAsset(normalized) ||
      !robotsAllows(normalized, robots)
    ) {
      return;
    }
    const existing = candidateMap.get(normalized);
    candidateMap.set(normalized, {
      url: normalized,
      source: existing?.source || source,
      priority: Math.max(
        existing?.priority || Number.NEGATIVE_INFINITY,
        urlPriority(normalized, vendor.productUrl),
      ),
    });
  };

  for (const url of seedUrls(vendor, domain)) addCandidate(url, "source_seed");

  const sitemapUrls = [
    ...(robots.sitemaps || []),
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
  ]
    .map((url) => normalizePublicUrl(url))
    .filter(Boolean);

  for (const sitemapUrl of [...new Set(sitemapUrls)].slice(0, 3)) {
    if (session.blocked) break;
    const sitemapResponse = await session.fetch(sitemapUrl);
    if (!sitemapResponse.ok) {
      errors.push({
        ...sitemapResponse.error,
        capturedAt,
        stage: "sitemap",
        severity: "info",
      });
      continue;
    }
    const sitemapEntries = parseSitemapUrls(sitemapResponse.text, sitemapResponse.url);
    const nestedSitemaps = sitemapEntries
      .filter((url) => /\.xml(?:\?|$)/i.test(url) && !/\.xml\.gz(?:\?|$)/i.test(url))
      .sort((left, right) => urlPriority(right) - urlPriority(left))
      .slice(0, 4);
    for (const nestedUrl of nestedSitemaps) {
      if (session.blocked) break;
      const nestedResponse = await session.fetch(nestedUrl);
      if (!nestedResponse.ok) {
        errors.push({
          ...nestedResponse.error,
          capturedAt,
          stage: "sitemap",
          severity: "info",
        });
        continue;
      }
      for (const pageUrl of parseSitemapUrls(nestedResponse.text, nestedResponse.url)) {
        if (
          RELEVANT_URL_TERMS.some((term) =>
            decodeURIComponent(pageUrl).toLowerCase().includes(term),
          )
        ) {
          addCandidate(pageUrl, "sitemap");
        }
      }
    }
    for (const pageUrl of sitemapEntries.filter(
      (url) => !/\.xml(?:\.gz)?(?:\?|$)/i.test(url),
    )) {
      if (
        RELEVANT_URL_TERMS.some((term) =>
          decodeURIComponent(pageUrl).toLowerCase().includes(term),
        )
      ) {
        addCandidate(pageUrl, "sitemap");
      }
    }
  }

  while (
    pages.length < options.maxPagesPerDomain &&
    attemptedPageUrls.size < options.maxPagesPerDomain * 3 &&
    !session.blocked
  ) {
    const next = [...candidateMap.values()]
      .filter((candidate) => !attemptedPageUrls.has(candidate.url))
      .sort(
        (left, right) =>
          right.priority - left.priority || left.url.localeCompare(right.url),
    )[0];
    if (!next) break;
    attemptedPageUrls.add(next.url);
    const response = await session.fetch(next.url);
    if (!response.ok) {
      errors.push({
        ...response.error,
        capturedAt,
        stage: "page",
        severity: "warning",
      });
      await persistProgress();
      continue;
    }
    const contentType = response.headers["content-type"] || "";
    if (
      contentType &&
      !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)
    ) {
      errors.push({
        code: "UNSUPPORTED_CONTENT_TYPE",
        message: `Skipped ${contentType}.`,
        url: next.url,
        capturedAt,
        stage: "page",
        severity: "info",
      });
      await persistProgress();
      continue;
    }
    const page = extractPageSignals({
      html: response.text,
      url: response.url,
      capturedAt,
      headers: response.headers,
      durationMs: response.durationMs,
      bytes: response.bytes,
    });
    page.discoverySource = next.source;
    page.truncated = response.truncated;
    pages.push(page);

    for (const link of page.links) {
      const combined = `${link.url} ${link.text}`.toLowerCase();
      if (RELEVANT_URL_TERMS.some((term) => combined.includes(term))) {
        addCandidate(link.url, "first_party_link");
      }
    }
    await persistProgress();
  }

  let status = "completed";
  if (session.blocked) status = "blocked";
  else if (!pages.length) status = "failed";
  else if (errors.some((error) => error.severity !== "info")) status = "partial";

  const audit = summarizeVendorAudit({
    vendor,
    normalizedDomain: domain,
    inputClassification,
    pages,
    errors,
    capturedAt,
    robots,
    status,
  });
  await writeCheckpoint(options.checkpointDir, domain, {
    version: 1,
    status,
    capturedAt,
    audit,
  });
  return { key: domain, audit };
}

async function mapWithConcurrency(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      onProgress?.(results[index], index + 1, items.length);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      () => runWorker(),
    ),
  );
  return results;
}

export async function loadVendorUniverse(inputPath = DEFAULT_INPUT) {
  const source = await readFile(inputPath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, {
    filename: inputPath,
    timeout: 2_000,
  });
  const dataset = context.window.NOLI_RETATRUTIDE_VENDOR_UNIVERSE;
  if (!dataset || !Array.isArray(dataset.vendors)) {
    throw new Error(
      `${inputPath} did not define window.NOLI_RETATRUTIDE_VENDOR_UNIVERSE.vendors`,
    );
  }
  return dataset;
}

function dedupeVendors(vendors) {
  const byDomain = new Map();
  const unlinked = [];
  for (const vendor of vendors) {
    const domain =
      normalizeDomain(vendor.domain) ||
      normalizeDomain(vendor.url) ||
      normalizeDomain(vendor.productUrl);
    if (!domain) {
      unlinked.push(vendor);
      continue;
    }
    const current = byDomain.get(domain);
    if (!current) {
      byDomain.set(domain, { ...vendor, domain });
      continue;
    }
    const currentRetail = /Confirmed|Probable/i.test(current.retailStatus || "");
    const incomingRetail = /Confirmed|Probable/i.test(vendor.retailStatus || "");
    byDomain.set(domain, {
      ...(incomingRetail && !currentRetail ? vendor : current),
      domain,
      name:
        !current.name || current.name === current.domain
          ? vendor.name || current.name
          : current.name,
      url: current.url || vendor.url || null,
      productUrl: current.productUrl || vendor.productUrl || null,
      source: [...new Set([...(current.source || []), ...(vendor.source || [])])],
    });
  }
  return [
    ...byDomain.values(),
    ...unlinked.map((vendor, index) => ({
      ...vendor,
      _unlinkedIndex: index,
    })),
  ];
}

function priorityForVendor(vendor) {
  const classification = classifyInputVendor(vendor);
  const entityPriority = {
    retail_storefront: 5,
    probable_retail_storefront: 4,
    unknown_public_website: 3,
    marketplace_or_directory: 2,
    contact_or_file_service: 1,
    social_or_messaging: 1,
    unlinked_vendor: 0,
  }[classification.entityType];
  return (
    entityPriority * 1_000_000 +
    Number(vendor.testCount || 0) * 100 +
    (vendor.productUrl ? 10 : 0)
  );
}

export function buildAuditPayload({
  sourceDataset,
  results,
  generatedAt,
  selectedCount,
}) {
  const audits = {};
  for (const result of results) {
    if (!result?.key || !result.audit) continue;
    audits[result.key] = compactAuditForPublish(result.audit);
  }
  const orderedAudits = Object.fromEntries(
    Object.entries(audits).sort(([left], [right]) => left.localeCompare(right)),
  );
  const values = Object.values(orderedAudits);
  const statusCounts = {};
  const entityTypeCounts = {};
  for (const audit of values) {
    statusCounts[audit.status] = (statusCounts[audit.status] || 0) + 1;
    entityTypeCounts[audit.entityType] =
      (entityTypeCounts[audit.entityType] || 0) + 1;
  }

  return {
    generatedAt,
    methodology:
      "Automated public-page first pass. One sequential session per domain, robots.txt honored where available, no account creation, gate bypass, fabricated identity, checkout submission, transaction, credential use, or blocked-request retry. Unknown remains unknown.",
    source: {
      generatedAt: sourceDataset.generatedAt || null,
      totalVendorRecords: sourceDataset.vendors.length,
      sources: sourceDataset.sources || [],
    },
    stats: {
      selected: selectedCount,
      audited: values.length,
      pagesCrawled: values.reduce(
        (sum, audit) => sum + Number(audit.pagesCrawled || 0),
        0,
      ),
      retaListingsObserved: values.filter((audit) => audit.reta?.listed).length,
      paymentLanguageObserved: values.filter(
        (audit) =>
          audit.payment?.visibleMethods?.length ||
          audit.payment?.checkoutIntegration?.length,
      ).length,
      coaLinksObserved: values.reduce(
        (sum, audit) => sum + (audit.trust?.coaLinks?.length || 0),
        0,
      ),
      statusCounts: Object.fromEntries(
        Object.entries(statusCounts).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      entityTypeCounts: Object.fromEntries(
        Object.entries(entityTypeCounts).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    },
    audits: orderedAudits,
  };
}

function trimEvidenceIdArrays(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) trimEvidenceIdArrays(item);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidenceIds" && Array.isArray(child)) {
      value[key] = [...new Set(child)].sort().slice(0, 1);
      continue;
    }
    if (key === "evidenceIds" && child && typeof child === "object") {
      for (const [dimension, ids] of Object.entries(child)) {
        child[dimension] = Array.isArray(ids)
          ? [...new Set(ids)].sort().slice(0, 1)
          : [];
      }
      continue;
    }
    trimEvidenceIdArrays(child);
  }
}

function collectEvidenceIds(value, output) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceIds(item, output);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence") continue;
    if (key === "evidenceIds" && Array.isArray(child)) {
      for (const id of child) output.add(id);
      continue;
    }
    if (key === "evidenceIds" && child && typeof child === "object") {
      for (const ids of Object.values(child)) {
        for (const id of Array.isArray(ids) ? ids : []) output.add(id);
      }
      continue;
    }
    collectEvidenceIds(child, output);
  }
}

const NORTHLINE_PUBLIC_OBSERVATION = Object.freeze({
  capturedAt: "2026-07-27T22:46:00.000Z",
  productUrl: "https://northlinelabs.org/product/reta-glp-3/",
  qualityUrl: "https://northlinelabs.org/quality/",
  shippingUrl: "https://northlinelabs.org/shipping/",
  shippingPolicyUrl: "https://northlinelabs.org/shipping-policy/",
  coaArchiveUrl: "https://northlinelabs.org/coas/",
  purityReportUrl:
    "https://northlinelabs.org/wp-content/uploads/2026/05/coas/NLL-8620700%20-%20Retatrutide%20-%20Purity.pdf",
  endotoxinReportUrl:
    "https://northlinelabs.org/wp-content/uploads/2026/05/coas/NLL-8620700%20-%20Retatrutide%20-%20Endotoxin.pdf",
  contactUrl: "https://northlinelabs.org/contact/",
  cartUrl: "https://northlinelabs.org/cart/",
});

function applyNorthlinePublicObservation(audit) {
  if (audit?.domain !== "northlinelabs.org") return;

  const observation = NORTHLINE_PUBLIC_OBSERVATION;
  const evidence = Array.isArray(audit.evidence) ? audit.evidence : [];
  const addProductEvidence = createEvidenceFactory({
    url: observation.productUrl,
    capturedAt: observation.capturedAt,
    evidence,
  });
  const addQualityEvidence = createEvidenceFactory({
    url: observation.qualityUrl,
    capturedAt: observation.capturedAt,
    evidence,
  });
  const addShippingEvidence = createEvidenceFactory({
    url: observation.shippingUrl,
    capturedAt: observation.capturedAt,
    evidence,
  });
  const addPolicyEvidence = createEvidenceFactory({
    url: observation.shippingPolicyUrl,
    capturedAt: observation.capturedAt,
    evidence,
  });
  const addContactEvidence = createEvidenceFactory({
    url: observation.contactUrl,
    capturedAt: observation.capturedAt,
    evidence,
  });

  const addClaim = (factory, field, value, snippet, confidence = "medium") =>
    factory({
      field,
      value,
      snippet,
      confidence,
      sourceType: "public_browser_first_party_claim",
    });
  const identityId = addProductEvidence({
    field: "reta.productIdentity",
    value: "Reta GLP-3",
    snippet: "Product H1: Reta GLP-3",
    confidence: "high",
    sourceType: "public_browser_first_party_h1",
  });
  const availableId = addProductEvidence({
    field: "reta.listingStatus",
    value: "available",
    snippet: "In stock, ships today, with an Add to cart action.",
    confidence: "high",
    sourceType: "public_browser_first_party_page",
  });

  const strengthPrices = [
    ["10mg", 79.99],
    ["15mg", 99.99],
    ["20mg", 129.99],
    ["30mg", 189.99],
    ["50mg", 299.99],
  ];
  const strengths = [];
  const prices = [];
  for (const [strength, amount] of strengthPrices) {
    const snippet = `${strength} is displayed at $${amount.toFixed(2)} in the size selector.`;
    const strengthId = addProductEvidence({
      field: "reta.strength",
      value: strength,
      snippet,
      confidence: "high",
      sourceType: "public_browser_first_party_page",
    });
    const priceId = addProductEvidence({
      field: "pricing.price",
      value: { amount, currency: "USD", display: `$${amount.toFixed(2)}` },
      snippet,
      confidence: "high",
      sourceType: "public_browser_first_party_page",
    });
    strengths.push(signal(strength, strengthId, "high"));
    prices.push({
      amount,
      currency: "USD",
      display: `$${amount.toFixed(2)}`,
      confidence: "high",
      evidenceIds: [priceId],
    });
  }

  const formId = addClaim(
    addProductEvidence,
    "reta.form",
    "lyophilized powder",
    "The product page identifies a single vial of sterile lyophilized powder.",
    "high",
  );
  const positioningId = addClaim(
    addProductEvidence,
    "marketing.positioning.description",
    "Research-grade retatrutide with documented testing and fast fulfillment",
    "The page positions the product around research grade, purity documentation, and fulfillment speed.",
    "high",
  );
  const bogoId = addClaim(
    addProductEvidence,
    "marketing.offer",
    "percentage_discount",
    "Buy one, get one 50% off sitewide.",
  );
  const freeShippingId = addClaim(
    addProductEvidence,
    "marketing.offer",
    "free_shipping",
    "Free shipping is advertised for orders over $200.",
  );
  const trackerId = addProductEvidence({
    field: "tracking.tag",
    value: { provider: "google_tag_manager", publicId: null },
    snippet: "The public page includes a Google Tag Manager iframe; no container ID was exposed in the observation.",
    confidence: "medium",
    sourceType: "public_browser_page_source",
  });
  const wordpressId = addProductEvidence({
    field: "platform.detected",
    value: "WordPress",
    snippet: "The linked public lot reports use the site's wp-content/uploads path.",
    confidence: "medium",
    sourceType: "public_browser_first_party_link",
  });

  const coaArchiveId = addQualityEvidence({
    field: "trust.coaLink",
    value: observation.coaArchiveUrl,
    snippet: "The public navigation links to a certificate archive with compound and lot search.",
    confidence: "high",
    sourceType: "public_browser_first_party_link",
  });
  const purityReportId = addProductEvidence({
    field: "trust.coaLink",
    value: observation.purityReportUrl,
    snippet: "The Reta GLP-3 page links a two-page lot-specific purity PDF for NLL-8620700.",
    confidence: "high",
    sourceType: "public_browser_first_party_link",
  });
  const endotoxinReportId = addProductEvidence({
    field: "trust.coaLink",
    value: observation.endotoxinReportUrl,
    snippet: "The Reta GLP-3 page links a lot-specific endotoxin PDF for NLL-8620700.",
    confidence: "high",
    sourceType: "public_browser_first_party_link",
  });
  const reviewCountId = addClaim(
    addProductEvidence,
    "trust.reviewCountClaim",
    867,
    "The product page displays 867 reviews and labels them verified.",
    "low",
  );
  const ratingId = addClaim(
    addProductEvidence,
    "trust.ratingClaim",
    4.8,
    "The product page displays a 4.8 rating.",
    "low",
  );

  const dispatchId = addClaim(
    addShippingEvidence,
    "operations.shipping",
    "same or next business day dispatch",
    "The shipping page says in-stock products dispatch the same or next business day.",
  );
  const trackingShippingId = addClaim(
    addShippingEvidence,
    "operations.shipping",
    "tracked US shipping",
    "The shipping page advertises plain, tracked dispatch; the contact page says UPS-only US shipping.",
  );
  const shippingPolicyId = addPolicyEvidence({
    field: "operations.policyUrl",
    value: observation.shippingPolicyUrl,
    snippet: "A public shipping policy states processing and delivery estimates.",
    confidence: "high",
    sourceType: "public_browser_first_party_link",
  });
  const qualityPolicyId = addQualityEvidence({
    field: "operations.policyUrl",
    value: observation.qualityUrl,
    snippet: "A public quality page explains the site's claimed lot-testing process.",
    confidence: "high",
    sourceType: "public_browser_first_party_link",
  });
  const contactId = addContactEvidence({
    field: "operations.contactUrl",
    value: observation.contactUrl,
    snippet: "The public contact page says support is email-only with an approximately one-business-day reply target.",
    confidence: "high",
    sourceType: "public_browser_first_party_link",
  });
  const returnsId = addClaim(
    addContactEvidence,
    "operations.returns",
    "all sales final",
    "The contact page states all sales are final, with damage or fulfillment issues handled by email.",
  );

  const visibleMethods = [
    ["Visa", /\bVISA\b/],
    ["American Express", /\bAMEX\b/],
    ["Discover", /\bDISCOVER\b/],
    ["Google Pay", /\bG Pay\b/],
  ].map(([value, cue]) => {
    const id = addPolicyEvidence({
      field: "payment.visibleMethod",
      value,
      snippet: `The public shipping-policy footer visibly displays ${cue.source.replaceAll("\\b", "")}.`,
      confidence: "medium",
      sourceType: "public_browser_visible_first_party_language",
    });
    return signal(value, id, "medium", {
      caveat: "Displayed footer language does not prove activation or a successful transaction.",
    });
  });
  const cartId = addProductEvidence({
    field: "payment.publicCartPath",
    value: observation.cartUrl,
    snippet: "The public empty checkout link redirects to a cart page; no order or payment was submitted.",
    confidence: "high",
    sourceType: "public_browser_first_party_link",
  });

  const researchOnlyId = addClaim(
    addProductEvidence,
    "claims.research_only",
    "Research-use restriction",
    "For research use only; not for human or veterinary use; not a drug, food, or supplement.",
    "high",
  );
  const administrationId = addClaim(
    addProductEvidence,
    "claims.administration",
    "Administration or preparation language",
    "The product page includes storage, reconstitution, working-concentration, and handling directions.",
  );
  const thirdPartyId = addClaim(
    addQualityEvidence,
    "sourcing.claim",
    "third_party_testing",
    "The quality page claims every lot is independently assayed by HPLC and mass spectrometry.",
  );
  const batchId = addClaim(
    addProductEvidence,
    "sourcing.claim",
    "batch_testing",
    "The page displays lot NLL-8620700 and links purity and endotoxin reports.",
  );
  const purityId = addClaim(
    addProductEvidence,
    "sourcing.claim",
    "purity_claim",
    "The product page displays 99% or greater HPLC purity.",
  );
  const lyophilizedId = addClaim(
    addProductEvidence,
    "sourcing.claim",
    "lyophilized",
    "The product is described as a sealed, lyophilized powder.",
  );

  const productClarityId = addProductEvidence({
    field: "design.productClarity",
    value: 10,
    snippet: "Public structure includes product identity, five size-price pairs, stock status, dispatch cues, and Add to cart.",
    confidence: "low",
    sourceType: "public_browser_structure_proxy",
  });
  const trustPresentationId = addProductEvidence({
    field: "design.trustPresentation",
    value: 9,
    snippet: "Public structure includes lot number, linked reports, review claims, policies, and contact access.",
    confidence: "low",
    sourceType: "public_browser_structure_proxy",
  });
  const conversionUxId = addProductEvidence({
    field: "design.conversionUX",
    value: 9,
    snippet: "Public structure includes variant pricing, stock, shipping offer, promotion, cart action, and empty cart route.",
    confidence: "low",
    sourceType: "public_browser_structure_proxy",
  });

  audit.status = "completed";
  audit.entityType = "retail_storefront";
  audit.classification = {
    value: "retail_storefront",
    reason: "Current public product page exposes selectable pricing, availability, and a cart action.",
    confidence: "high",
    url: observation.productUrl,
    capturedAt: observation.capturedAt,
  };
  audit.capturedAt = observation.capturedAt;
  audit.pagesCrawled = 7;
  audit.pageUrls = [
    observation.productUrl,
    observation.qualityUrl,
    observation.shippingUrl,
    observation.shippingPolicyUrl,
    observation.coaArchiveUrl,
    observation.contactUrl,
    observation.cartUrl,
  ].sort();
  audit.platform = {
    primary: signal("WordPress", wordpressId, "medium"),
    detected: [signal("WordPress", wordpressId, "medium")],
    plugins: [],
    serverHeaders: audit.platform?.serverHeaders || [],
  };
  audit.reta = {
    listed: true,
    listingStatus: "available",
    productUrls: [observation.productUrl],
    contentUrls: [observation.productUrl],
    evidenceIds: [identityId, availableId],
    strengths,
    forms: [signal("lyophilized powder", formId, "high")],
  };
  audit.pricing = {
    prices,
    displayedRange: {
      minimum: 79.99,
      maximum: 299.99,
      currencies: ["USD"],
      caveat:
        "Displayed first-party variant prices only; taxes, shipping, and actual order totals are unverified.",
    },
  };
  audit.marketing = {
    positioning: [
      signal(
        "Research-grade retatrutide with documented testing and fast fulfillment",
        positioningId,
        "high",
        { kind: "description" },
      ),
    ],
    offers: [
      signal("percentage_discount", bogoId, "medium"),
      signal("free_shipping", freeShippingId, "medium"),
    ],
    subscription: false,
    affiliate: false,
    referral: false,
    publicContentPagesCrawled: 0,
    retatrutideContentPagesCrawled: 0,
  };
  audit.tracking = [
    {
      provider: "google_tag_manager",
      publicId: null,
      confidence: "medium",
      evidenceIds: [trackerId],
    },
  ];
  audit.trust = {
    coaLinks: [
      signal(observation.coaArchiveUrl, coaArchiveId, "high", {
        label: "Certificate archive",
      }),
      signal(observation.purityReportUrl, purityReportId, "high", {
        label: "Purity report",
      }),
      signal(observation.endotoxinReportUrl, endotoxinReportId, "high", {
        label: "Endotoxin report",
      }),
    ],
    reviewProviders: [],
    displayedReviewCounts: [
      signal(867, reviewCountId, "low", {
        caveat: "Displayed first-party count; authenticity was not independently verified.",
      }),
    ],
    displayedRatings: [
      signal(4.8, ratingId, "low", {
        caveat: "Displayed first-party rating; authenticity was not independently verified.",
      }),
    ],
    caveat:
      "Review counts, ratings, COAs, and badges remain first-party claims unless independently verified.",
  };
  audit.operations = {
    shipping: [
      signal("same or next business day dispatch", dispatchId, "medium"),
      signal("tracked US shipping", trackingShippingId, "medium"),
      signal("free shipping over $200", freeShippingId, "medium"),
    ],
    returns: [signal("all sales final", returnsId, "medium")],
    contactEmails: [],
    contactUrls: [
      signal(observation.contactUrl, contactId, "high", { label: "Contact" }),
    ],
    policyUrls: [
      signal(observation.shippingPolicyUrl, shippingPolicyId, "high", {
        label: "Shipping policy",
      }),
      signal(observation.qualityUrl, qualityPolicyId, "high", {
        label: "Quality and testing",
      }),
    ],
  };
  audit.payment = {
    visibleMethods,
    publicCartPath: signal(observation.cartUrl, cartId, "high", {
      caveat: "The empty public route does not prove checkout or payment success.",
    }),
    checkoutIntegration: [],
    gatewayPsp: [],
    processorIso: [],
    acquirerSponsorBank: [],
    evidenceBoundary:
      "Visible footer language and an empty cart route do not prove activation, underwriting, gateway/PSP, processor/ISO, acquirer, sponsor bank, merchant of record, or transaction success.",
  };
  const researchOnly = signal(
    "Research-use restriction",
    researchOnlyId,
    "high",
    { category: "research_only" },
  );
  const administration = signal(
    "Administration or preparation language",
    administrationId,
    "medium",
    { category: "administration" },
  );
  audit.claims = {
    researchOnly: [researchOnly],
    humanUseOrOutcome: [administration],
    all: [researchOnly, administration],
    caveat:
      "Public cue detection is evidence triage, not a legal conclusion about intended use or compliance.",
  };
  audit.sourcing = {
    claims: [
      signal("third_party_testing", thirdPartyId, "medium", {
        caveat: "First-party claim; independent verification is not established by this observation.",
      }),
      signal("batch_testing", batchId, "medium", {
        caveat: "A public lot and reports were observed, but report contents were not independently authenticated.",
      }),
      signal("purity_claim", purityId, "medium", {
        caveat: "First-party claim; independent verification is not established by this observation.",
      }),
      signal("lyophilized", lyophilizedId, "medium", {
        caveat: "First-party product-form claim.",
      }),
    ],
    independentlyVerifiedManufacturer: null,
    caveat:
      "The public pages make testing and product-form claims but do not identify or independently verify an undisclosed manufacturer.",
  };
  audit.design = {
    mobileUsability: null,
    visualPolish: null,
    productClarity: 10,
    trustPresentation: 9,
    conversionUX: 9,
    performance: null,
    overall: 9.3,
    reasons: [
      "Product structure exposes identity, all five size-price pairs, stock, shipping, and cart action.",
      "Trust structure exposes lot information, reports, reviews, policies, and contact access.",
      "Mobile usability, visual polish, and performance remain unscored without a dedicated visual or performance review.",
    ],
    methodology:
      "Focused public-page structure review. No account, cart mutation, checkout submission, transaction, or gate bypass. Visual polish remains pending.",
    evidenceIds: {
      mobileUsability: [],
      productClarity: [productClarityId],
      trustPresentation: [trustPresentationId],
      conversionUX: [conversionUxId],
      performance: [],
    },
  };
  audit.focusedCorrection = {
    sourceUrl: observation.productUrl,
    capturedAt: observation.capturedAt,
    method: "public_browser_observation",
    confidence: "high",
    reason:
      "The raw fetch received a challenge shell, while the same current public pages were readable through a standard public browser view.",
  };
  audit.evidence = evidence;
  audit.errors = [
    ...(audit.errors || []),
    {
      code: "PUBLIC_BROWSER_SUPPLEMENT",
      stage: "focused_correction",
      severity: "info",
      url: observation.productUrl,
      message:
        "Focused public-page evidence supplements the raw-fetch challenge shell; no challenge bypass was attempted.",
    },
  ];
}

export function compactAuditForPublish(sourceAudit) {
  const audit = structuredClone(sourceAudit);
  applyNorthlinePublicObservation(audit);
  const fullEvidence = Array.isArray(audit.evidence) ? audit.evidence : [];

  const caps = [
    [audit.platform, "detected", 8],
    [audit.platform, "plugins", 15],
    [audit.reta, "productUrls", 12],
    [audit.reta, "contentUrls", 12],
    [audit.reta, "strengths", 16],
    [audit.pricing, "prices", 20],
    [audit.marketing, "positioning", 12],
    [audit.marketing, "offers", 12],
    [audit, "tracking", 15],
    [audit.trust, "coaLinks", 12],
    [audit.trust, "reviewProviders", 8],
    [audit.operations, "shipping", 8],
    [audit.operations, "returns", 8],
    [audit.operations, "contactEmails", 8],
    [audit.operations, "contactUrls", 8],
    [audit.operations, "policyUrls", 12],
    [audit.payment, "visibleMethods", 16],
    [audit.payment, "checkoutIntegration", 16],
    [audit.payment, "gatewayPsp", 16],
    [audit.payment, "providerSignals", 20],
    [audit.claims, "researchOnly", 8],
    [audit.claims, "humanUseOrOutcome", 12],
    [audit.claims, "all", 16],
    [audit.sourcing, "claims", 12],
  ];
  for (const [parent, key, maximum] of caps) {
    if (parent && Array.isArray(parent[key])) {
      parent[key] = parent[key].slice(0, maximum);
    }
  }

  if (audit.reta && !Array.isArray(audit.reta.evidenceIds)) {
    audit.reta.evidenceIds = fullEvidence
      .filter((item) => item.field === "reta.listingStatus")
      .map((item) => item.id);
  }
  if (audit.design && !audit.design.evidenceIds) {
    audit.design.evidenceIds = {};
    for (const dimension of [
      "mobileUsability",
      "productClarity",
      "trustPresentation",
      "conversionUX",
      "performance",
    ]) {
      audit.design.evidenceIds[dimension] = fullEvidence
        .filter((item) => item.field === `design.${dimension}`)
        .map((item) => item.id);
    }
  }

  trimEvidenceIdArrays(audit);
  const referencedIds = new Set();
  collectEvidenceIds(audit, referencedIds);
  const evidenceById = new Map(
    fullEvidence
      .filter((item) => referencedIds.has(item.id))
      .map((item) => [item.id, item]),
  );
  audit.evidence = [...evidenceById.values()]
    .map((item) => ({
      ...item,
      snippet: cleanWhitespace(item.snippet).slice(0, 220),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return audit;
}

export function serializeAuditPayload(payload) {
  return (
    "/* Generated by scripts/audit-retatrutide-vendor-universe.mjs. Do not edit by hand. */\n" +
    `window.NOLI_RETATRUTIDE_VENDOR_AUDITS = ${JSON.stringify(payload)};\n`
  );
}

export function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    checkpointDir: DEFAULT_CHECKPOINT_DIR,
    limit: null,
    domains: [],
    entityTypes: [],
    maxPagesPerDomain: 12,
    globalConcurrency: 12,
    perDomainDelayMs: 1_000,
    timeoutMs: 12_000,
    maximumBodyBytes: 2_000_000,
    resume: true,
    capturedAt: new Date().toISOString(),
    userAgent: "Noli public vendor research crawler/1.0",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [rawKey, inlineValue] = argument.split("=", 2);
    const takeValue = () => inlineValue ?? argv[++index];
    if (rawKey === "--input") options.input = path.resolve(takeValue());
    else if (rawKey === "--output") options.output = path.resolve(takeValue());
    else if (rawKey === "--checkpoint-dir") {
      options.checkpointDir = path.resolve(takeValue());
    } else if (rawKey === "--limit") {
      options.limit = Math.max(0, Number.parseInt(takeValue(), 10));
    } else if (rawKey === "--domains") {
      options.domains = takeValue()
        .split(",")
        .map(normalizeDomain)
        .filter(Boolean);
    } else if (rawKey === "--entity-types") {
      options.entityTypes = takeValue()
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (rawKey === "--max-pages") {
      options.maxPagesPerDomain = clamp(
        Number.parseInt(takeValue(), 10),
        1,
        50,
      );
    } else if (rawKey === "--global-concurrency") {
      options.globalConcurrency = clamp(
        Number.parseInt(takeValue(), 10),
        1,
        MAX_GLOBAL_CONCURRENCY,
      );
    } else if (rawKey === "--per-domain-delay-ms") {
      options.perDomainDelayMs = clamp(
        Number.parseInt(takeValue(), 10),
        500,
        60_000,
      );
    } else if (rawKey === "--timeout-ms") {
      options.timeoutMs = clamp(
        Number.parseInt(takeValue(), 10),
        1_000,
        120_000,
      );
    } else if (rawKey === "--maximum-body-bytes") {
      options.maximumBodyBytes = clamp(
        Number.parseInt(takeValue(), 10),
        100_000,
        10_000_000,
      );
    } else if (rawKey === "--captured-at") {
      const value = takeValue();
      if (!Number.isFinite(Date.parse(value))) {
        throw new Error(`Invalid --captured-at value: ${value}`);
      }
      options.capturedAt = new Date(value).toISOString();
    } else if (rawKey === "--force") {
      options.resume = false;
    } else if (rawKey === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function helpText() {
  return `Usage:
  node scripts/audit-retatrutide-vendor-universe.mjs [options]

Options:
  --domains a.com,b.com       Audit an explicit bounded domain sample
  --entity-types a,b          Audit selected source classifications
  --limit N                   Audit the first N prioritized unique vendors
  --max-pages N               Public HTML pages per domain, default 12, max 50
  --global-concurrency N      Concurrent domains, default 12, hard max 20
  --per-domain-delay-ms N     Delay between domain requests, min 500ms
  --timeout-ms N              Per-request timeout, default 12000ms
  --checkpoint-dir PATH       Resumable per-domain cache under .context by default
  --output PATH               Generated JS output path
  --captured-at ISO           Fixed timestamp for reproducible fixtures
  --force                     Ignore final cached domain checkpoints

Safety:
  Public GET requests only. The crawler never creates accounts, bypasses gates,
  submits checkout, transacts, uses credentials, or retries blocked domains.
`;
}

export async function runAudit(rawOptions = {}) {
  const options = {
    ...parseArgs([]),
    ...rawOptions,
  };
  options.globalConcurrency = clamp(
    options.globalConcurrency,
    1,
    MAX_GLOBAL_CONCURRENCY,
  );
  const sourceDataset = await loadVendorUniverse(options.input);
  let vendors = dedupeVendors(sourceDataset.vendors).sort(
    (left, right) =>
      priorityForVendor(right) - priorityForVendor(left) ||
      String(left.domain || left.name).localeCompare(
        String(right.domain || right.name),
      ),
  );

  if (options.domains?.length) {
    const wanted = new Set(options.domains.map(normalizeDomain));
    vendors = vendors.filter((vendor) => wanted.has(normalizeDomain(vendor.domain)));
  }
  if (options.entityTypes?.length) {
    const wantedTypes = new Set(options.entityTypes);
    vendors = vendors.filter((vendor) =>
      wantedTypes.has(classifyInputVendor(vendor).entityType),
    );
  }
  if (Number.isFinite(options.limit)) {
    vendors = vendors.slice(0, options.limit);
  }

  const results = await mapWithConcurrency(
    vendors,
    options.globalConcurrency,
    async (vendor) => {
      try {
        return await auditOneVendor(vendor, {
          ...options,
          fetchImpl: options.fetchImpl || fetch,
          sleep:
            options.sleep ||
            ((milliseconds) =>
              new Promise((resolve) => setTimeout(resolve, milliseconds))),
        });
      } catch (error) {
        const domain =
          normalizeDomain(vendor.domain) ||
          normalizeDomain(vendor.url) ||
          normalizeDomain(vendor.productUrl);
        const inputClassification = classifyInputVendor(vendor);
        const audit = summarizeVendorAudit({
          vendor,
          normalizedDomain: domain,
          inputClassification,
          pages: [],
          errors: [
            {
              code: "UNHANDLED_AUDIT_ERROR",
              message: cleanWhitespace(error.message),
              url: vendor.url || vendor.productUrl || null,
              capturedAt: options.capturedAt,
            },
          ],
          capturedAt: options.capturedAt,
          robots: null,
          status: "failed",
        });
        const key =
          domain ||
          `unlinked:${sha256(vendor.name || JSON.stringify(vendor)).slice(0, 12)}`;
        if (domain) {
          await writeCheckpoint(options.checkpointDir, domain, {
            version: 1,
            status: "failed",
            capturedAt: options.capturedAt,
            audit,
          });
        }
        return { key, audit };
      }
    },
    options.onProgress,
  );
  const payload = buildAuditPayload({
    sourceDataset,
    results,
    generatedAt: options.capturedAt,
    selectedCount: vendors.length,
  });
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, serializeAuditPayload(payload), "utf8");
  return payload;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
  } else {
    const payload = await runAudit({
      ...options,
      onProgress(result, completed, total) {
        const audit = result?.audit;
        const domain = result?.key || "unknown";
        process.stderr.write(
          `[${completed}/${total}] ${domain}: ${audit?.status || "unknown"}; ${audit?.pagesCrawled || 0} pages${result?.cached ? " (cached)" : ""}\n`,
        );
      },
    });
    process.stdout.write(
      `Wrote ${payload.stats.audited} domain audits and ${payload.stats.pagesCrawled} page observations to ${path.relative(ROOT, options.output)}\n`,
    );
  }
}
