#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import process from "node:process";
import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
} from "node:zlib";
import { NOLI_PRIORITY_COMPANIES } from "./lib/noli-priority-companies.mjs";
import { toCsv } from "./lib/safe-csv.mjs";

const CAPTURED_AT = new Date().toISOString();
const OUTPUT_DIRECTORY = path.resolve(
  process.argv[2] || "biologix-strategy-board/research",
);
const USER_AGENT =
  "NoliPublicMarketingResearch/1.0 (+anonymous public GET; no form, account, cart, or transaction)";
const MAX_HTML_BYTES = 2_000_000;
const MAX_WIRE_BYTES = 12_000_000;
const MAX_LINKED_PAGES = 6;
const MAX_REDIRECTS = 5;
const SNAP_EEA_COUNTRIES = [
  "at", "be", "bg", "hr", "cy", "cz", "de", "dk", "ee", "el", "es", "fi",
  "fr", "hu", "ie", "it", "lt", "lu", "lv", "mt", "nl", "pl", "pt", "ro",
  "se", "si", "sk",
];

const trackingPatterns = [
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]+\b/i],
  ["Google Analytics", /googletagmanager\.com\/gtag\/js|\bG-[A-Z0-9]{6,}\b|google-analytics\.com/i],
  ["Google Ads tag", /\bAW-\d{5,}\b|googleadservices\.com|googleads\.g\.doubleclick\.net/i],
  ["Meta Pixel", /connect\.facebook\.net|facebook\.com\/tr|fbq\s*\(/i],
  ["TikTok Pixel", /analytics\.tiktok\.com|ttq\.(?:load|page|track)\b/i],
  ["Microsoft Clarity", /clarity\.ms|clarity\s*\(\s*["']set/i],
  ["Triple Whale", /triplewhale|triple-whale/i],
  ["Pinterest Tag", /ct\.pinterest\.com|pintrk\s*\(/i],
  ["Snap Pixel", /sc-static\.net\/scevent|min\.js.*snap|snaptr\s*\(/i],
  ["Reddit Pixel", /alb\.reddit\.com|rdt\s*\(/i],
];

const marketingTechnologyPatterns = [
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
  ["Trustpilot", /trustpilot/i],
  ["Loox", /loox/i],
  ["Recharge", /rechargepayments|rechargecdn/i],
  ["Skio", /skio/i],
  ["AfterShip", /aftership/i],
  ["Brevo", /brevo|sendinblue/i],
  ["SliceWP", /slicewp/i],
  ["WP Loyalty", /wp-loyalty|wployalty/i],
];

const socialHosts = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  reddit: ["reddit.com"],
};

const interestingPathPattern =
  /(affiliate|ambassador|referral|refer-a-friend|reward|loyalty|subscribe|newsletter|sms|blog|article|learn|education|sale|discount|contact|about)/i;
const promotionPattern =
  /(\b\d{1,2}%\s*off\b|\$\d+(?:\.\d{2})?\s*off\b|free shipping|subscribe(?:\s*&|\s+and)?\s*save|buy\s+\d+\s+get|use\s+code|promo\s+code|coupon|limited[- ]time|bundle\s+(?:and\s+)?save|earn\s+\d+\s*points?)/i;
const blockedPagePattern =
  /(?:cf-browser-verification|just a moment|attention required|verify (?:that )?you are human|captcha|access denied|request blocked|password protected|enter using password|store is currently unavailable|sign in to continue|login required)/i;
const publicHostChecks = new Map();

function cleanText(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&middot;/gi, "·")
    .replace(/&rarr;/gi, "→")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToLines(html) {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|p|div|li|h[1-6]|section|article|header|footer|nav)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map(cleanText)
    .filter((line) => line.length >= 8 && line.length <= 220);
}

function normalizeDomain(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .split(":")[0];
}

function normalizeName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function companyAliases(company) {
  return [...new Set([
    company.brand,
    ...(company.aliases || []),
    company.domain.split(".")[0].replace(/[-_]/g, " "),
  ].filter(Boolean).map(normalizeName))];
}

function hostMatches(value, domain) {
  try {
    const parsed = new URL(
      /^[a-z]+:\/\//i.test(String(value)) ? String(value) : `https://${value}`,
    );
    return normalizeDomain(parsed.hostname) === normalizeDomain(domain);
  } catch {
    return normalizeDomain(String(value).replace(/^https?:\/\//i, "").split("/")[0]) ===
      normalizeDomain(domain);
  }
}

function hostWithinDomain(value, domain) {
  const host = normalizeDomain(value);
  const root = normalizeDomain(domain);
  return host === root || host.endsWith(`.${root}`);
}

function isPageLike(url) {
  try {
    const parsed = new URL(url);
    return (
      !/\/(?:wp-content|wp-includes|cdn\/shop)\//i.test(parsed.pathname) &&
      !/\.(?:css|js|map|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|ico|pdf|zip)(?:$|\?)/i.test(
        `${parsed.pathname}${parsed.search}`,
      )
    );
  } catch {
    return false;
  }
}

function isPublicIpAddress(address) {
  const normalized = String(address || "").toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b, c] = octets;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family === 6) {
    const mappedDotted = normalized.match(
      /^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/,
    )?.[1];
    if (mappedDotted) return isPublicIpAddress(mappedDotted);
    const mappedHex = normalized.match(
      /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
    );
    if (mappedHex) {
      const upper = Number.parseInt(mappedHex[1], 16);
      const lower = Number.parseInt(mappedHex[2], 16);
      return isPublicIpAddress(
        `${upper >> 8}.${upper & 255}.${lower >> 8}.${lower & 255}`,
      );
    }
    if (
      normalized === "::" ||
      normalized === "::1" ||
      /^(?:0+:){7}0+$/.test(normalized) ||
      /^(?:0+:){7}1$/.test(normalized) ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    ) {
      return false;
    }
    return true;
  }
  return false;
}

async function assertPublicHttpUrl(value, expectedDomain = null) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`unsupported protocol ${parsed.protocol}`);
  }
  if (
    expectedDomain &&
    !hostWithinDomain(parsed.hostname, expectedDomain)
  ) {
    throw new Error(
      `refused unrelated final host ${parsed.hostname}; expected ${expectedDomain}`,
    );
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let check = publicHostChecks.get(hostname);
  if (!check) {
    check = (async () => {
      const literalFamily = isIP(hostname);
      const addresses = literalFamily
        ? [{ address: hostname, family: literalFamily }]
        : await lookup(hostname, { all: true, verbatim: true });
      if (
        !addresses.length ||
        addresses.some(({ address }) => !isPublicIpAddress(address))
      ) {
        throw new Error(`refused non-public network target ${hostname}`);
      }
      return addresses.map(({ address, family }) => ({ address, family }));
    })();
    publicHostChecks.set(hostname, check);
  }
  const addresses = await check;
  return { parsed, addresses };
}

function decodeResponseBody(buffer, contentEncoding) {
  const encoding = String(contentEncoding || "").toLowerCase();
  const options = { maxOutputLength: MAX_HTML_BYTES };
  if (encoding.includes("gzip")) return gunzipSync(buffer, options);
  if (encoding.includes("br")) return brotliDecompressSync(buffer, options);
  if (encoding.includes("deflate")) return inflateSync(buffer, options);
  return buffer.subarray(0, MAX_HTML_BYTES);
}

function pinnedRequest(parsed, options, addresses) {
  return new Promise((resolve, reject) => {
    const body =
      options.body === undefined || options.body === null
        ? null
        : Buffer.isBuffer(options.body)
          ? options.body
          : Buffer.from(String(options.body));
    const headers = {
      "accept-encoding": "gzip, deflate, br",
      ...(options.headers || {}),
    };
    if (
      body &&
      !Object.keys(headers).some((name) => name.toLowerCase() === "content-length")
    ) {
      headers["content-length"] = String(body.length);
    }
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(parsed, {
      method: options.method || "GET",
      headers,
      autoSelectFamily: true,
      lookup: (_hostname, lookupOptions, callback) => {
        const settings =
          typeof lookupOptions === "object" ? lookupOptions : {};
        const family = Number(settings.family || 0);
        const eligible = family
          ? addresses.filter((entry) => entry.family === family)
          : addresses;
        const selected = eligible.length ? eligible : addresses;
        if (settings.all) {
          callback(null, selected);
        } else {
          callback(null, selected[0].address, selected[0].family);
        }
      },
    });
    const timer = setTimeout(() => {
      request.destroy(new Error("request timed out"));
    }, 25_000);
    request.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.once("response", (incoming) => {
      clearTimeout(timer);
      incoming.setTimeout(25_000, () => {
        incoming.destroy(new Error("response body timed out"));
      });
      let consumed = false;
      const consume = async () => {
        if (consumed) return Buffer.alloc(0);
        consumed = true;
        const chunks = [];
        let wireBytes = 0;
        for await (const chunk of incoming) {
          wireBytes += chunk.length;
          if (wireBytes > MAX_WIRE_BYTES) {
            incoming.destroy();
            throw new Error(`response exceeded ${MAX_WIRE_BYTES} wire bytes`);
          }
          chunks.push(chunk);
        }
        return decodeResponseBody(
          Buffer.concat(chunks),
          incoming.headers["content-encoding"],
        );
      };
      resolve({
        status: incoming.statusCode || 0,
        ok:
          Number(incoming.statusCode) >= 200 &&
          Number(incoming.statusCode) < 300,
        headers: {
          get(name) {
            const value = incoming.headers[String(name).toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : value || null;
          },
        },
        body: {
          cancel() {
            consumed = true;
            incoming.destroy();
          },
        },
        async text() {
          const decoded = await consume();
          return decoded.toString("utf8");
        },
      });
    });
    if (body) request.write(body);
    request.end();
  });
}

async function fetchWithSafeRedirects(initialUrl, options, expectedDomain) {
  let currentUrl = initialUrl;
  let requestOptions = { ...options };
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const { parsed, addresses } = await assertPublicHttpUrl(
      currentUrl,
      expectedDomain,
    );
    const response = await pinnedRequest(parsed, requestOptions, addresses);
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: parsed.href };
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`HTTP ${response.status} redirect omitted Location`);
    }
    if (redirects === MAX_REDIRECTS) {
      throw new Error(`redirect limit exceeded (${MAX_REDIRECTS})`);
    }
    await response.body?.cancel();
    currentUrl = new URL(location, parsed).href;
    const method = String(requestOptions.method || "GET").toUpperCase();
    if (
      response.status === 303 ||
      ([301, 302].includes(response.status) && method === "POST")
    ) {
      const { body: _body, ...withoutBody } = requestOptions;
      requestOptions = { ...withoutBody, method: "GET" };
    }
  }
  throw new Error("redirect loop");
}

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /\bhref\s*=\s*["']([^"'#]+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(cleanText(match[1]), baseUrl);
      if (["http:", "https:"].includes(url.protocol)) {
        url.hash = "";
        links.push(url.href);
      }
    } catch {
      // Malformed public hrefs remain omitted.
    }
  }
  return [...new Set(links)];
}

function metaValue(html, selector) {
  const attribute = selector === "description" ? "name" : "property";
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${selector}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${selector}["']`,
    "i",
  );
  const match = html.match(pattern);
  return cleanText(match?.[1] || match?.[2] || "");
}

function tagText(html, tag) {
  return cleanText(html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]
    ?.replace(/<[^>]+>/g, " ") || "");
}

async function fetchText(url, options = {}, attempts = 2) {
  const {
    expectedDomain = null,
    headers: optionHeaders = {},
    ...fetchOptions
  } = options;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { response, finalUrl } = await fetchWithSafeRedirects(url, {
        ...fetchOptions,
        headers: {
          accept: "text/html,application/xhtml+xml,application/json,application/atom+xml;q=0.9,*/*;q=0.2",
          "user-agent": USER_AGENT,
          ...optionHeaders,
        },
      }, expectedDomain);
      const text = (await response.text()).slice(0, MAX_HTML_BYTES);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return {
        url,
        finalUrl,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        text,
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = /HTTP 429/.test(error.message)
          ? 1_500 * attempt
          : 350 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`${url}: ${lastError?.message || "request failed"}`);
}

function evaluateCompanyPage(page, company) {
  if (!page.text) {
    return { usable: false, reason: page.error || "empty response" };
  }
  if (
    !/(?:html|xhtml|xml|json|text\/plain)/i.test(
      page.contentType || "text/html",
    )
  ) {
    return {
      usable: false,
      reason: `unsupported content type ${page.contentType || "unknown"}`,
    };
  }
  let finalDomain;
  try {
    finalDomain = normalizeDomain(new URL(page.finalUrl).hostname);
  } catch {
    return { usable: false, reason: "invalid final URL" };
  }
  if (!hostWithinDomain(finalDomain, company.domain)) {
    return {
      usable: false,
      reason: `unrelated final host ${finalDomain}`,
    };
  }
  const source = page.text.trim();
  if (source.length < 200) {
    return { usable: false, reason: "response too small for onsite evidence" };
  }
  if (blockedPagePattern.test(htmlToLines(source).join(" "))) {
    return { usable: false, reason: "block, login, or verification page" };
  }
  const hasDocumentShape =
    /<!doctype|<html\b|<head\b|<body\b|<title\b|<h1\b|<meta\b|<link\b/i.test(
      source,
    ) ||
    /^[\[{]/.test(source) ||
    /^<\?xml|<(?:feed|rss)\b/i.test(source);
  if (!hasDocumentShape) {
    return { usable: false, reason: "response lacks document structure" };
  }
  return {
    usable: true,
    reason: null,
    identity:
      finalDomain === normalizeDomain(company.domain)
        ? "exact-final-domain"
        : "first-party-subdomain",
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runWorker),
  );
  return results;
}

async function fetchJson(url, options = {}) {
  const response = await fetchText(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.headers || {}),
    },
  }, 3);
  try {
    return {
      ...response,
      json: JSON.parse(response.text),
    };
  } catch (error) {
    throw new Error(`${url}: invalid JSON (${error.message})`);
  }
}

let microsoftRequestQueue = Promise.resolve();
function fetchMicrosoftJson(url) {
  const request = microsoftRequestQueue.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    return fetchJson(url);
  });
  microsoftRequestQueue = request.catch(() => undefined);
  return request;
}

function detectedNames(source, patterns) {
  return patterns.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

function promotionKind(text) {
  if (/free shipping/i.test(text)) return "free-shipping";
  if (/subscribe|auto.?ship/i.test(text)) return "subscription";
  if (/affiliate|ambassador|commission/i.test(text)) return "affiliate";
  if (/referral|refer-a-friend/i.test(text)) return "referral";
  if (/points?|reward|loyalty/i.test(text)) return "loyalty";
  if (/bundle|buy\s+\d+\s+get/i.test(text)) return "bundle";
  return "discount";
}

function adLibraryLinks(company) {
  const { domain } = company;
  const brand = company.brand || domain.split(".")[0].replace(/[-_]/g, " ");
  return [
    {
      network: "Meta Ads Library",
      url:
        `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(brand)}&search_type=keyword_unordered`,
      status: "search-link-only",
    },
    {
      network: "Google Ads Transparency Center",
      url:
        `https://adstransparency.google.com/?region=US&query=${encodeURIComponent(domain)}`,
      status: "search-link-only",
    },
    {
      network: "Microsoft/Bing Ad Library",
      url:
        `https://adlibrary.api.bingads.microsoft.com/api/v1/Advertisers?top=8&skip=0&searchText=${encodeURIComponent(brand)}`,
      status: "automatic-eea-api",
    },
    {
      network: "Snap Ads Gallery",
      url: "https://values.snap.com/privacy/transparency?lang=en-US",
      status: "automatic-eu-api",
    },
    {
      network: "TikTok Commercial Content Library",
      url: "https://library.tiktok.com/ads",
      status: "manual-advertiser-search-required",
    },
    {
      network: "YouTube",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${brand} peptide`)}`,
      status: "search-link-only",
    },
  ];
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function isoDay(value) {
  return `${dateOnly(value)}T00:00:00.000Z`;
}

const snapDestinationFields = new Set([
  "destination_url",
  "landing_page_url",
  "landing_url",
  "website_url",
  "web_view_url",
  "webview_url",
  "click_url",
  "cta_url",
  "deeplink_url",
  "deep_link_url",
]);

function urlsInValue(value, found = []) {
  if (Array.isArray(value)) {
    for (const entry of value) urlsInValue(entry, found);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) urlsInValue(entry, found);
  } else if (typeof value === "string") {
    for (const match of value.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)) {
      found.push(match[0].replace(/[),.;]+$/, ""));
    }
  }
  return found;
}

function extractSnapDestinationUrls(value, pathParts = [], found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      extractSnapDestinationUrls(entry, [...pathParts, String(index)], found)
    );
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, entry] of Object.entries(value)) {
    const field = key.toLowerCase();
    const fieldPath = [...pathParts, key];
    const normalizedPath = fieldPath.map((part) => part.toLowerCase()).join(".");
    const contextQualifiedDestination =
      /(?:^|\.)web_view_properties\.url$/.test(normalizedPath) ||
      /(?:^|\.)web_view_preview\.url$/.test(normalizedPath) ||
      /(?:^|\.)dpa_preview\.items\.\d+\.link$/.test(normalizedPath) ||
      /(?:^|\.)deep_link_properties\.web_view_fallback_url$/.test(
        normalizedPath,
      );
    if (snapDestinationFields.has(field) || contextQualifiedDestination) {
      for (const url of urlsInValue(entry)) {
        found.push({ url, fieldPath: fieldPath.join(".") });
      }
      continue;
    }
    extractSnapDestinationUrls(entry, fieldPath, found);
  }
  return found;
}

async function collectMicrosoftAds(company) {
  const source = adLibraryLinks(company).find((item) =>
    item.network.startsWith("Microsoft")
  );
  const aliases = companyAliases(company);
  const start = new Date(CAPTURED_AT);
  start.setUTCDate(start.getUTCDate() - 365);
  const end = new Date(CAPTURED_AT);
  end.setUTCDate(end.getUTCDate() - 1);
  try {
    const advertiserRows = [];
    const searchNames = [company.brand, ...(company.aliases || [])];
    for (const searchName of searchNames) {
      const searchUrl =
        `https://adlibrary.api.bingads.microsoft.com/api/v1/Advertisers?top=8&skip=0&searchText=${encodeURIComponent(searchName)}`;
      const advertiserResponse = await fetchMicrosoftJson(searchUrl);
      advertiserRows.push(...(advertiserResponse.json.value || []));
    }
    const advertisers = [
      ...new Map(
        advertiserRows
          .filter((advertiser) =>
            aliases.includes(normalizeName(advertiser.AdvertiserName))
          )
          .map((advertiser) => [
            String(advertiser.AdvertiserId),
            advertiser,
          ]),
      ).values(),
    ];
    const adLists = await mapLimit(advertisers, 1, async (advertiser) => {
      const ads = [];
      for (let page = 0; page < 5; page += 1) {
        const query = new URL("https://adlibrary.api.bingads.microsoft.com/api/v1/Ads");
        query.searchParams.set("top", "24");
        query.searchParams.set("skip", String(page * 24));
        query.searchParams.set("advertiserId", String(advertiser.AdvertiserId));
        query.searchParams.set("startDate", dateOnly(start));
        query.searchParams.set("endDate", dateOnly(end));
        const response = await fetchMicrosoftJson(query.href);
        const pageRows = response.json.value || [];
        ads.push(...pageRows.map((ad) => ({ advertiser, ad })));
        if (pageRows.length < 24) break;
      }
      return ads;
    });
    const exactMatches = adLists.flat().filter(({ ad }) =>
      ad.DestinationUrl
        ? hostMatches(ad.DestinationUrl, company.domain)
        : hostMatches(ad.DisplayUrl, company.domain)
    ).slice(0, 30);
    const detailed = await mapLimit(exactMatches, 4, async ({ advertiser, ad }) => {
      const detailUrl =
        `https://adlibrary.api.bingads.microsoft.com/api/v1/Ads/${encodeURIComponent(ad.AdId)}?expand=AdDetails(expand=ImpressionsByCountry,Targets)`;
      const details = await fetchMicrosoftJson(detailUrl).then((response) => response.json)
        .catch(() => ad);
      let assets = [];
      try {
        assets = JSON.parse(details.AssetJson || ad.AssetJson || "[]");
      } catch {
        assets = [];
      }
      return {
        platform: "Microsoft/Bing",
        adId: String(details.AdId || ad.AdId),
        advertiser: details.AdvertiserName || ad.AdvertiserName,
        advertiserId: String(details.AdvertiserId || advertiser.AdvertiserId),
        advertiserVerified: Boolean(advertiser.IsVerified),
        title: cleanText(details.Title || ad.Title) || null,
        body: cleanText(details.Description || ad.Description) || null,
        destinationUrl: details.DestinationUrl || ad.DestinationUrl || null,
        displayUrl: details.DisplayUrl || ad.DisplayUrl || null,
        payer: details.AdDetails?.PaidForByName || null,
        firstShown: details.AdDetails?.StartDate || null,
        lastShown: details.AdDetails?.EndDate || null,
        impressionRange: details.AdDetails?.TotalImpressionsRange || null,
        countries: details.AdDetails?.ImpressionsByCountry || [],
        targets: details.AdDetails?.Targets || [],
        assets: assets.slice(0, 8),
        matchConfidence: "verified-destination-domain",
        sourceUrl: detailUrl,
      };
    });
    return {
      platform: "Microsoft/Bing",
      status: detailed.length ? "verified-ads-observed" : "no-verified-ads-observed",
      checkedAt: CAPTURED_AT,
      coverage:
        `Ads served on Bing.com in the EEA during ${dateOnly(start)}–${dateOnly(end)}; source may lag 1–3 days.`,
      advertisersMatched: advertisers.map((advertiser) => ({
        id: String(advertiser.AdvertiserId),
        name: advertiser.AdvertiserName,
        country: advertiser.AdvertiserCountry,
        verified: Boolean(advertiser.IsVerified),
      })),
      verifiedAds: detailed,
      candidateCount: adLists.flat().length,
      aliasesQueried: searchNames,
      sourceUrl: source.url,
    };
  } catch (error) {
    return {
      platform: "Microsoft/Bing",
      status: "source-error",
      checkedAt: CAPTURED_AT,
      coverage: "EEA Bing.com ad library; current source check failed.",
      advertisersMatched: [],
      verifiedAds: [],
      candidateCount: 0,
      aliasesQueried: [company.brand, ...(company.aliases || [])],
      sourceUrl: source.url,
      error: error.message,
    };
  }
}

async function collectSnapAds(company) {
  const source = adLibraryLinks(company).find((item) =>
    item.network.startsWith("Snap")
  );
  const aliases = companyAliases(company);
  const start = new Date(CAPTURED_AT);
  start.setUTCDate(start.getUTCDate() - 365);
  const end = new Date(CAPTURED_AT);
  end.setUTCDate(end.getUTCDate() - 1);
  const endpoint = "https://adsapi.snapchat.com/v1/ads_library/ads/search";
  try {
    const previews = [];
    for (const searchName of [company.brand, ...(company.aliases || [])]) {
      const body = {
        paying_advertiser_name: searchName,
        countries: SNAP_EEA_COUNTRIES,
        start_date: isoDay(start),
        end_date: isoDay(end),
      };
      let nextUrl = endpoint;
      for (let page = 0; page < 3 && nextUrl; page += 1) {
        const response = await fetchJson(nextUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.json.request_status !== "SUCCESS") {
          throw new Error(
            response.json.display_message ||
              response.json.debug_message ||
              "Snap returned a non-success status",
          );
        }
        previews.push(
          ...(response.json.ad_previews || [])
            .map((entry) =>
              entry.ad_preview || entry.sponsored_content_preview || null
            )
            .filter(Boolean),
        );
        nextUrl = response.json.paging?.next_link || null;
      }
    }
    const uniquePreviews = [
      ...new Map(previews.map((preview, index) => [
        String(preview.id || preview.ad_id || JSON.stringify(preview) || index),
        preview,
      ])).values(),
    ];
    const candidates = uniquePreviews.map((preview) => {
      const destinations = extractSnapDestinationUrls(preview);
      const payer = normalizeName(
        preview.paying_advertiser_name ||
          preview.payer_name ||
          preview.advertiser_name ||
          preview.brand_name ||
          "",
      );
      const exactDestination = destinations.find(({ url }) =>
        hostMatches(url, company.domain)
      ) || null;
      return {
        preview,
        destinations,
        payerMatch: aliases.includes(payer),
        exactDestination,
      };
    });
    const verifiedAds = (await mapLimit(
      candidates.filter((candidate) =>
        candidate.payerMatch && candidate.exactDestination
      ),
      2,
      async ({ preview, exactDestination }) => {
        const adId = String(preview.id || preview.ad_id || "");
        const detailUrl =
          `https://adsapi.snapchat.com/v1/ads_library/ads/${encodeURIComponent(adId)}`;
        const detailed = adId
          ? await fetchJson(detailUrl)
              .then((response) => response.json.ad_preview || preview)
              .catch(() => preview)
          : preview;
        const detailedPayer = normalizeName(
          detailed.paying_advertiser_name ||
            detailed.payer_name ||
            detailed.advertiser_name ||
            detailed.brand_name ||
            "",
        );
        if (detailedPayer && !aliases.includes(detailedPayer)) return null;
        const detailedDestination =
          extractSnapDestinationUrls(detailed).find(({ url }) =>
            hostMatches(url, company.domain)
          ) || exactDestination;
        if (!detailedDestination) return null;
        return {
          platform: "Snap",
          adId,
          advertiser:
            detailed.paying_advertiser_name ||
            detailed.advertiser_name ||
            detailed.brand_name ||
            company.brand,
          title: cleanText(detailed.headline || detailed.name || "") || null,
          body:
            cleanText(detailed.description || detailed.caption || "") || null,
          destinationUrl: detailedDestination.url,
          destinationField: detailedDestination.fieldPath,
          firstShown: detailed.start_date || detailed.start_time || null,
          lastShown: detailed.end_date || detailed.end_time || null,
          status: detailed.status || null,
          callToAction: detailed.call_to_action || null,
          impressionsTotal: detailed.impressions_total ?? null,
          impressionsMap: detailed.impressions_map || null,
          creativeType: detailed.creative_type || detailed.type || null,
          adType: detailed.ad_type || null,
          languages: detailed.languages || [],
          targeting: detailed.targeting_v2 || null,
          reviewStatus: detailed.review_status || null,
          creativeUrl:
            detailed.preview_url ||
            detailed.creative_url ||
            detailed.media_url ||
            null,
          matchConfidence:
            "verified-advertiser-alias-and-structured-destination-domain",
          sourceUrl: adId ? detailUrl : source.url,
        };
      },
    )).filter(Boolean);
    return {
      platform: "Snap",
      status: verifiedAds.length ? "verified-ads-observed" : "no-verified-ads-observed",
      checkedAt: CAPTURED_AT,
      coverage:
        `Ads delivered in the EU during ${dateOnly(start)}–${dateOnly(end)}; exact destination-domain matches only.`,
      verifiedAds,
      candidateCount: candidates.length,
      exactPayerCandidateCount: candidates.filter((candidate) => candidate.payerMatch).length,
      sourceUrl: source.url,
    };
  } catch (error) {
    return {
      platform: "Snap",
      status: "source-error",
      checkedAt: CAPTURED_AT,
      coverage: "EU Snap Ads Gallery rolling 12-month check failed.",
      verifiedAds: [],
      candidateCount: 0,
      exactPayerCandidateCount: 0,
      sourceUrl: source.url,
      error: error.message,
    };
  }
}

async function latestContent(domain, combinedSource, allLinks = []) {
  const posts = [];
  if (/wp-content|wp-json|wordpress/i.test(combinedSource)) {
    try {
      const sourceUrl =
        `https://${domain}/wp-json/wp/v2/posts?per_page=5&_fields=date,link,title`;
      const response = await fetchText(sourceUrl, { expectedDomain: domain });
      const rows = JSON.parse(response.text);
      for (const row of Array.isArray(rows) ? rows : []) {
        posts.push({
          title: cleanText(row.title?.rendered?.replace(/<[^>]+>/g, " ")),
          publishedAt: row.date || null,
          url: row.link || null,
          sourceUrl,
        });
      }
    } catch {
      // Content API is optional; page evidence remains available.
    }
  } else if (/cdn\.shopify|shopify\.com|Shopify\./i.test(combinedSource)) {
    const handles = [
      ...new Set([
        ...allLinks.map((url) => {
          try {
            return new URL(url).pathname.match(/^\/blogs\/([^/]+)/i)?.[1] || null;
          } catch {
            return null;
          }
        }),
        "news",
        "research",
      ].filter(Boolean)),
    ].slice(0, 4);
    for (const handle of handles) {
      try {
        const sourceUrl = `https://${domain}/blogs/${encodeURIComponent(handle)}.atom`;
        const response = await fetchText(sourceUrl, { expectedDomain: domain });
        for (const entry of response.text.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
          const body = entry[1];
          posts.push({
            title: cleanText(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
            publishedAt: cleanText(body.match(/<published>([^<]+)<\/published>/i)?.[1]) || null,
            url: cleanText(body.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]) || null,
            sourceUrl,
          });
          if (posts.length >= 5) break;
        }
        if (posts.length) break;
      } catch {
        // Try the next public blog feed candidate.
      }
    }
  }
  return posts.filter((post) => post.title || post.url).slice(0, 5);
}

async function collectCompany(company) {
  const homepageUrl = `https://${company.domain}/`;
  const adMonitoringPromise = Promise.all([
    collectMicrosoftAds(company),
    collectSnapAds(company),
  ]);
  const pageResult = async (url) =>
    fetchText(url, { expectedDomain: company.domain }).catch((error) => ({
      url,
      finalUrl: url,
      status: null,
      contentType: "",
      text: "",
      error: error.message,
    }));
  const homepage = await pageResult(homepageUrl);
  const homepageDomain = normalizeDomain(
    new URL(homepage.finalUrl || homepageUrl).hostname,
  );
  const homepageLinks = homepage.text
    ? extractLinks(homepage.text, homepage.finalUrl)
    : [];
  const discoveredPages = homepageLinks
    .filter((url) => {
      const parsed = new URL(url);
      return (
        normalizeDomain(parsed.hostname) === homepageDomain &&
        isPageLike(url) &&
        interestingPathPattern.test(parsed.pathname)
      );
    })
    .slice(0, MAX_LINKED_PAGES);
  const linkedPages = [
    ...new Set([
      ...(company.marketingUrls || []),
      ...discoveredPages,
    ]),
  ].filter((url) => url !== homepageUrl);
  const configuredPageUrls = new Set(company.marketingUrls || []);
  const linkedResults = await mapLimit(linkedPages, 4, pageResult);
  const pages = [homepage, ...linkedResults];
  const pageEvaluations = pages.map((page) => ({
    page,
    evaluation: evaluateCompanyPage(page, company),
  }));
  const successfulPages = pageEvaluations
    .filter(({ evaluation }) => evaluation.usable)
    .map(({ page }) => page);
  const combinedSource = successfulPages.map((page) => page.text).join("\n");
  const allLinks = [
    ...new Set(
      [
        ...successfulPages.flatMap((page) =>
          extractLinks(page.text, page.finalUrl)
        ),
        ...successfulPages.map((page) => page.finalUrl),
      ].filter(isPageLike),
    ),
  ];
  const homepageUsable = pageEvaluations[0]?.evaluation.usable;
  const configuredRouteFailure = pageEvaluations
    .slice(1)
    .some(({ page, evaluation }) =>
      configuredPageUrls.has(page.url) && !evaluation.usable
    );
  const status = homepageUsable && !configuredRouteFailure
    ? "reachable"
    : successfulPages.length
      ? "partial"
      : "unresolved";

  const social = {};
  for (const [network, hosts] of Object.entries(socialHosts)) {
    social[network] = allLinks.filter((url) => {
      try {
        return hosts.some((host) =>
          normalizeDomain(new URL(url).hostname) === host ||
          normalizeDomain(new URL(url).hostname).endsWith(`.${host}`)
        );
      } catch {
        return false;
      }
    }).slice(0, 3);
  }

  const promotions = [];
  const promotionKeys = new Set();
  for (const page of successfulPages) {
    for (const line of htmlToLines(page.text)) {
      if (!promotionPattern.test(line) || /cookie|privacy policy/i.test(line)) continue;
      const key = line.toLowerCase();
      if (promotionKeys.has(key)) continue;
      promotionKeys.add(key);
      promotions.push({
        kind: promotionKind(line),
        text: line,
        evidenceUrl: page.finalUrl,
      });
      if (promotions.length >= 10) break;
    }
    if (promotions.length >= 10) break;
  }

  const trackingStack = detectedNames(combinedSource, trackingPatterns);
  const marketingTechnology = detectedNames(
    combinedSource,
    marketingTechnologyPatterns,
  );
  const affiliateLinks = allLinks.filter((url) =>
    isPageLike(url) &&
    /(affiliate|ambassador)/i.test(new URL(url).pathname)
  ).slice(0, 8);
  const referralLinks = allLinks.filter((url) =>
    isPageLike(url) &&
    /(referral|refer-a-friend)/i.test(new URL(url).pathname)
  ).slice(0, 8);
  const loyaltyLinks = allLinks.filter((url) =>
    isPageLike(url) &&
    /(reward|loyalty|points)/i.test(new URL(url).pathname)
  ).slice(0, 8);
  const emailFormObserved =
    /<input[^>]+type=["']email["']/i.test(combinedSource);
  const emailVendorObserved = marketingTechnology.some((name) =>
    ["Klaviyo", "Omnisend", "Mailchimp", "Brevo"].includes(name)
  );
  const smsFormObserved =
    (/<input[^>]+type=["']tel["']/i.test(combinedSource) &&
      /\b(?:sms|text\s+(?:alerts?|updates?)|mobile\s+message)/i.test(combinedSource)) ||
    marketingTechnology.some((name) => ["Attentive", "Postscript"].includes(name));
  const subscriptionDetected =
    /subscribe(?:\s*&|\s+and)?\s*save|auto.?ship|recurring\s+(?:order|delivery)|subscription\s+(?:price|plan|option)/i.test(combinedSource) ||
    marketingTechnology.some((name) => ["Recharge", "Skio"].includes(name));
  const latestPosts = await latestContent(
    company.domain,
    combinedSource,
    allLinks,
  );
  const [microsoftAds, snapAds] = await adMonitoringPromise;
  const verifiedAds = [
    ...microsoftAds.verifiedAds,
    ...snapAds.verifiedAds,
  ];
  const affiliateStatus = affiliateLinks.length
    ? "public-route-observed"
    : marketingTechnology.some((name) =>
        ["AffiliateWP", "GoAffPro", "Refersion", "UpPromote", "SliceWP"].includes(name)
      )
      ? "plugin-marker-only"
      : status === "unresolved"
        ? "unknown"
        : "not-surfaced";
  const loyaltyStatus = loyaltyLinks.length
    ? "public-route-observed"
    : marketingTechnology.some((name) =>
        ["Smile.io", "Yotpo", "WP Loyalty"].includes(name)
      )
      ? "plugin-marker-only"
      : status === "unresolved"
        ? "unknown"
        : "not-surfaced";

  const channelSignals = [];
  const addChannel = (channel, evidence, confidence = "medium") => channelSignals.push({
    channel,
    evidence,
    confidence,
    boundary:
      "Public tooling or content presence indicates channel capability, not spend, attributed visits, or traffic share.",
  });
  const paidSocialSignals = trackingStack.filter((name) =>
    ["Meta Pixel", "TikTok Pixel", "Pinterest Tag", "Snap Pixel", "Reddit Pixel"].includes(name)
  );
  if (paidSocialSignals.length) addChannel("Paid social capable", paidSocialSignals.join(", "));
  if (trackingStack.includes("Google Ads tag")) addChannel("Paid search/display capable", "Google Ads tag");
  if (Object.values(social).some((links) => links.length)) addChannel("Organic social presence", "Public social profile links");
  if (affiliateStatus !== "not-surfaced" && affiliateStatus !== "unknown") {
    addChannel(
      "Affiliate/ambassador",
      affiliateStatus === "public-route-observed"
        ? "Public affiliate or ambassador route"
        : "Affiliate technology marker only",
      affiliateStatus === "public-route-observed" ? "high" : "medium",
    );
  }
  if (emailFormObserved || emailVendorObserved || smsFormObserved) {
    addChannel("Lifecycle", [
      emailFormObserved
        ? "email form"
        : emailVendorObserved
          ? "email vendor marker"
          : null,
      smsFormObserved ? "SMS form/vendor marker" : null,
    ].filter(Boolean).join(" + "));
  }
  if (latestPosts.length || allLinks.some((url) => /\/blog|\/article|\/learn/i.test(url))) {
    addChannel("Organic content", latestPosts.length ? "Recent public posts/feed" : "Public content hub");
  }
  if (verifiedAds.length) {
    addChannel(
      "Verified public ads",
      `${verifiedAds.length} exact destination-domain match${verifiedAds.length === 1 ? "" : "es"} in official EEA/EU ad sources`,
      "high",
    );
  }

  return {
    domain: company.domain,
    brand: company.brand,
    status,
    capturedAt: CAPTURED_AT,
    lastAttemptAt: CAPTURED_AT,
    lastSuccessfulOnsiteAt: successfulPages.length ? CAPTURED_AT : null,
    homepageUrl: homepage.finalUrl || homepageUrl,
    homepageStatus: homepage.status || null,
    error:
      status !== "reachable"
        ? pageEvaluations
            .map(({ page, evaluation }) =>
              evaluation.usable
                ? null
                : `${page.url}: ${evaluation.reason}`
            )
            .filter(Boolean)
            .join(" | ")
        : null,
    pagesChecked: pageEvaluations.map(({ page, evaluation }) => ({
      url: page.url,
      finalUrl: page.finalUrl,
      status: page.status,
      usableForEvidence: evaluation.usable,
      identity: evaluation.identity || null,
      rejectionReason: evaluation.reason,
      error: page.error || null,
    })),
    positioning: {
      title: tagText(homepage.text || successfulPages[0]?.text || "", "title") || null,
      h1: tagText(homepage.text || successfulPages[0]?.text || "", "h1") || null,
      description:
        metaValue(homepage.text || successfulPages[0]?.text || "", "description") ||
        metaValue(homepage.text || successfulPages[0]?.text || "", "og:description") ||
        null,
    },
    promotions,
    trackingStack,
    marketingTechnology,
    mechanics: {
      affiliateDetected:
        affiliateStatus !== "not-surfaced" && affiliateStatus !== "unknown",
      affiliateStatus,
      affiliateLinks,
      referralDetected: referralLinks.length > 0,
      referralStatus: referralLinks.length
        ? "public-route-observed"
        : status === "unresolved"
          ? "unknown"
          : "not-surfaced",
      referralLinks,
      loyaltyDetected:
        loyaltyStatus !== "not-surfaced" && loyaltyStatus !== "unknown",
      loyaltyStatus,
      loyaltyLinks,
      subscriptionDetected,
      emailCaptureDetected: emailFormObserved,
      emailCaptureStatus: emailFormObserved
        ? "public-form-observed"
        : emailVendorObserved
          ? "vendor-marker-only"
          : status === "unresolved"
            ? "unknown"
            : "not-surfaced",
      smsCaptureDetected: smsFormObserved,
      smsCaptureStatus: smsFormObserved
        ? "public-form-or-vendor-observed"
        : status === "unresolved"
          ? "unknown"
          : "not-surfaced",
      freeShippingDetected: promotions.some((item) => item.kind === "free-shipping"),
    },
    social,
    content: {
      latestPosts,
      publicContentHubDetected:
        latestPosts.length > 0 ||
        allLinks.some((url) => /\/blog|\/article|\/learn/i.test(url)),
    },
    adLibraries: adLibraryLinks(company),
    adMonitoring: {
      sources: [microsoftAds, snapAds],
      verifiedAds,
      verifiedAdsObserved: verifiedAds.length,
    },
    channelSignals,
    evidenceUrls: [
      ...new Set([
        ...successfulPages.map((page) => page.finalUrl),
        ...affiliateLinks,
        ...referralLinks,
        ...loyaltyLinks,
        ...Object.values(social).flat(),
        ...latestPosts.map((post) => post.sourceUrl || post.url).filter(Boolean),
      ]),
    ].slice(0, 40),
    caveat:
      status === "unresolved"
        ? "The anonymous public onsite pull failed. Unknown activity is not no activity. Official ad-source checks remain separately scoped."
        : status === "partial"
          ? "The anonymous public onsite pull was incomplete. Partial observations do not replace a prior complete snapshot. Official ad-source checks remain separately scoped."
        : "Anonymous public GET only. Scripts, routes, forms, copy, and exact-domain ad matches show observed infrastructure or ads—not spend, CAC, ROAS, attributed visits, traffic-source share, or campaign profitability.",
  };
}

const rows = await mapLimit(NOLI_PRIORITY_COMPANIES, 2, collectCompany);
const byDomain = Object.fromEntries(rows.map((row) => [row.domain, row]));
const reachable = rows.filter((row) => row.status === "reachable");
const observable = rows.filter((row) => row.status !== "unresolved");
const stats = {
  companies: rows.length,
  reachable: reachable.length,
  partial: rows.filter((row) => row.status === "partial").length,
  unresolved: rows.filter((row) => row.status === "unresolved").length,
  withPromotions: observable.filter((row) => row.promotions.length).length,
  withPaidSocialPixels: observable.filter((row) =>
    row.trackingStack.some((name) =>
      ["Meta Pixel", "TikTok Pixel", "Pinterest Tag", "Snap Pixel", "Reddit Pixel"].includes(name)
    )
  ).length,
  withGoogleAdsTag: observable.filter((row) =>
    row.trackingStack.includes("Google Ads tag")
  ).length,
  withAffiliate: observable.filter((row) => row.mechanics.affiliateDetected).length,
  withEmailForm: observable.filter((row) => row.mechanics.emailCaptureDetected).length,
  withLifecycleSignal: observable.filter((row) =>
    row.mechanics.emailCaptureStatus !== "not-surfaced" ||
    row.mechanics.smsCaptureStatus !== "not-surfaced"
  ).length,
  withSmsCapture: observable.filter((row) => row.mechanics.smsCaptureDetected).length,
  withPublicContent: observable.filter((row) => row.content.publicContentHubDetected).length,
  microsoftChecksSucceeded: rows.filter((row) =>
    row.adMonitoring.sources.find((source) => source.platform === "Microsoft/Bing")
      ?.status !== "source-error"
  ).length,
  snapChecksSucceeded: rows.filter((row) =>
    row.adMonitoring.sources.find((source) => source.platform === "Snap")
      ?.status !== "source-error"
  ).length,
  companiesWithVerifiedAds: rows.filter((row) =>
    row.adMonitoring.verifiedAdsObserved > 0
  ).length,
  verifiedAdsObserved: rows.reduce(
    (sum, row) => sum + row.adMonitoring.verifiedAdsObserved,
    0,
  ),
};
const payload = {
  schemaVersion: 1,
  generatedAt: CAPTURED_AT,
  capturedAt: CAPTURED_AT,
  exportPath: "./noli-marketing-watch-2026-07-28.csv",
  jsonPath: "./noli-marketing-watch-2026-07-28.json",
  stats,
  methodology: {
    scope:
      "Eighteen priority competitors; anonymous public homepage and linked marketing-route GETs plus official anonymous Microsoft/Bing and Snap transparency APIs. No form submission, account, gate acceptance, cart, transaction, credential, undocumented endpoint, or bypass.",
    ads:
      "Automatic ads are promoted only when the official result's destination hostname exactly matches the competitor. Microsoft coverage is EEA Bing.com and Snap coverage is EU delivery; Meta, Google, and TikTok remain official one-click/manual review links. No result means only no ad observed in the stated source, region, period, and alias set.",
    trafficSources:
      "Pixels, tags, social profiles, affiliates, lifecycle forms, and content hubs are channel-capability signals—not traffic-source percentages, spend, attributed visits, or performance.",
  },
  byDomain,
};

const csvRows = rows.map((row) => ({
  domain: row.domain,
  status: row.status,
  captured_at: row.capturedAt,
  homepage_url: row.homepageUrl,
  positioning_title: row.positioning?.title,
  positioning_h1: row.positioning?.h1,
  positioning_description: row.positioning?.description,
  promotion_copy: row.promotions.map((item) => item.text).join(" || "),
  promotion_evidence_urls: row.promotions.map((item) => item.evidenceUrl).join(" || "),
  tracking_stack: row.trackingStack.join(" | "),
  marketing_technology: row.marketingTechnology.join(" | "),
  channel_signals: row.channelSignals.map((item) => `${item.channel}: ${item.evidence}`).join(" || "),
  affiliate_detected: row.mechanics?.affiliateDetected,
  affiliate_status: row.mechanics?.affiliateStatus,
  affiliate_links: row.mechanics?.affiliateLinks?.join(" | "),
  referral_detected: row.mechanics?.referralDetected,
  referral_status: row.mechanics?.referralStatus,
  referral_links: row.mechanics?.referralLinks?.join(" | "),
  loyalty_detected: row.mechanics?.loyaltyDetected,
  loyalty_status: row.mechanics?.loyaltyStatus,
  loyalty_links: row.mechanics?.loyaltyLinks?.join(" | "),
  subscription_detected: row.mechanics?.subscriptionDetected,
  email_capture_detected: row.mechanics?.emailCaptureDetected,
  email_capture_status: row.mechanics?.emailCaptureStatus,
  sms_capture_detected: row.mechanics?.smsCaptureDetected,
  sms_capture_status: row.mechanics?.smsCaptureStatus,
  social_links: Object.entries(row.social || {}).flatMap(([network, links]) =>
    links.map((url) => `${network}: ${url}`)
  ).join(" | "),
  latest_content: row.content?.latestPosts?.map((post) =>
    [post.publishedAt, post.title, post.url].filter(Boolean).join(" | ")
  ).join(" || "),
  meta_ads_library: row.adLibraries?.find((item) => item.network.startsWith("Meta"))?.url,
  google_ads_transparency: row.adLibraries?.find((item) => item.network.startsWith("Google"))?.url,
  tiktok_ads_library: row.adLibraries?.find((item) => item.network.startsWith("TikTok"))?.url,
  verified_public_ads: row.adMonitoring?.verifiedAds?.map((ad) =>
    [
      ad.platform,
      ad.adId,
      ad.firstShown,
      ad.lastShown,
      ad.title,
      ad.destinationUrl,
      ad.sourceUrl,
    ].filter(Boolean).join(" | ")
  ).join(" || "),
  ad_source_status: row.adMonitoring?.sources?.map((source) =>
    `${source.platform}: ${source.status} (${source.coverage})`
  ).join(" || "),
  evidence_urls: row.evidenceUrls?.join(" | "),
  caveat: row.caveat,
}));

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await Promise.all([
  writeFile(
    path.join(OUTPUT_DIRECTORY, "noli-marketing-watch-2026-07-28.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  ),
  writeFile(
    path.join(OUTPUT_DIRECTORY, "noli-marketing-watch-data.js"),
    `window.NOLI_MARKETING_WATCH = ${JSON.stringify(payload)};\n`,
  ),
  writeFile(
    path.join(OUTPUT_DIRECTORY, "noli-marketing-watch-2026-07-28.csv"),
    toCsv(csvRows, Object.keys(csvRows[0])),
  ),
]);

console.log(
  JSON.stringify(
    {
      outputDirectory: OUTPUT_DIRECTORY,
      capturedAt: CAPTURED_AT,
      stats,
      statusByDomain: Object.fromEntries(
        rows.map((row) => [row.domain, {
          status: row.status,
          promotions: row.promotions.length,
          tracking: row.trackingStack,
          marketingTechnology: row.marketingTechnology,
          channels: row.channelSignals.map((item) => item.channel),
        }]),
      ),
    },
    null,
    2,
  ),
);
