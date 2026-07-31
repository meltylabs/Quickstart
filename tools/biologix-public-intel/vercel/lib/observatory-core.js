import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const OBSERVATORY_PREFIX = "noli-observatory";
export const CADENCES = Object.freeze(["daily", "weekly", "monthly"]);
export const SNAPSHOT_RETENTION_DAYS = 90;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^192\.168\./,
  /^198\.(?:1[89])\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^(?:22[4-9]|23\d|24\d|25[0-5])\./,
];

export function normalizeHost(value) {
  return String(value).trim().toLowerCase().replace(/\.$/, "");
}

export function isPublicIp(address) {
  const family = isIP(address);
  if (family === 4) return !PRIVATE_V4.some((pattern) => pattern.test(address));
  if (family === 6) {
    const normalized = address.toLowerCase();
    const mappedDotted = normalized.match(
      /^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/,
    )?.[1];
    if (mappedDotted) return isPublicIp(mappedDotted);
    const mappedHex = normalized.match(
      /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
    );
    if (mappedHex) {
      const high = Number.parseInt(mappedHex[1], 16);
      const low = Number.parseInt(mappedHex[2], 16);
      return isPublicIp(
        `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
      );
    }
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

export function validateTargetUrl(value, allowedHosts) {
  const url = new URL(value);
  const hostname = normalizeHost(url.hostname);
  const allowlist = new Set(allowedHosts.map(normalizeHost));
  if (url.protocol !== "https:") throw new Error("Only HTTPS targets are allowed");
  if (url.username || url.password) throw new Error("URL credentials are forbidden");
  if (url.port && url.port !== "443") throw new Error("Non-standard ports are forbidden");
  if (isIP(hostname)) throw new Error("Literal IP targets are forbidden");
  if (!allowlist.has(hostname)) throw new Error(`Host is outside target allowlist: ${hostname}`);
  url.hash = "";
  return url;
}

export function parseCronSlot(now = new Date()) {
  const hour = now.getUTCHours();
  const day = now.getUTCDate();
  const weekday = now.getUTCDay();
  if (hour >= 0 && hour <= 4) return { cadence: "daily", shard: hour };
  if (weekday === 0 && hour >= 5 && hour <= 9) {
    return { cadence: "weekly", shard: hour - 5 };
  }
  if (day === 1 && hour >= 10 && hour <= 14) {
    return { cadence: "monthly", shard: hour - 10 };
  }
  return null;
}

export function validateCadence(value) {
  if (!CADENCES.includes(value)) throw new Error(`Invalid cadence: ${value}`);
  return value;
}

export function dateKey(iso) {
  return iso.slice(0, 10);
}

export function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function contentHash(value) {
  return `sha256:${stableHash(value)}`;
}

export function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function stripTags(value) {
  return compactWhitespace(String(value ?? "").replace(/<[^>]*>/g, " "));
}

export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

export function safeSnippet(value, max = 240) {
  return decodeEntities(stripTags(value)).slice(0, max);
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 100) / 100;
}

export function sanitizeAggregate(states, generatedAt = new Date().toISOString()) {
  const byTarget = new Map();
  for (const company of states.flatMap((state) => Object.values(state?.last_good ?? {}))) {
    if (
      !company?.target_id ||
      company.stale === true ||
      company.last_result_status === "partial"
    ) {
      continue;
    }
    const current = byTarget.get(company.target_id) ?? {};
    byTarget.set(company.target_id, {
      ...current,
      ...company,
      commerce: { ...(current.commerce ?? {}), ...(company.commerce ?? {}) },
      marketing: { ...(current.marketing ?? {}), ...(company.marketing ?? {}) },
      trust: { ...(current.trust ?? {}), ...(company.trust ?? {}) },
    });
  }
  const companies = [...byTarget.values()];
  const prices = companies.flatMap((company) =>
    (company.commerce?.offers ?? []).map((offer) => offer.price).filter(Number.isFinite),
  );
  const availability = companies.map((company) => company.commerce?.availability ?? "unknown");
  const trackers = new Map();
  for (const company of companies) {
    for (const tracker of company.marketing?.trackers ?? []) {
      trackers.set(tracker.provider, (trackers.get(tracker.provider) ?? 0) + 1);
    }
  }
  return {
    schema_version: 1,
    generated_at: generatedAt,
    panel: {
      configured_companies: 25,
      companies_with_last_good: companies.length,
      stale_companies: companies.filter((company) => company.stale === true).length,
    },
    commerce: {
      displayed_offer_count: prices.length,
      median_displayed_price: median(prices),
      availability: Object.fromEntries(
        [...new Set(availability)].sort().map((status) => [
          status,
          availability.filter((value) => value === status).length,
        ]),
      ),
      promotion_presence_count: companies.filter(
        (company) => (company.commerce?.promotions ?? []).length > 0,
      ).length,
    },
    marketing: {
      tracker_prevalence: [...trackers]
        .map(([provider, count]) => ({ provider, company_count: count }))
        .sort((a, b) => b.company_count - a.company_count || a.provider.localeCompare(b.provider)),
      affiliate_cue_count: companies.filter((company) => company.marketing?.affiliate_cue).length,
      subscription_cue_count: companies.filter((company) => company.marketing?.subscription_cue).length,
    },
    trust: {
      coa_link_presence_count: companies.filter(
        (company) => (company.trust?.coa_links ?? []).length > 0,
      ).length,
      policy_presence_count: companies.filter(
        (company) => (company.trust?.policies ?? []).length > 0,
      ).length,
    },
    evidence_boundary:
      "Public, unauthenticated GET observations only. Aggregates do not prove sales, legality, quality, processor approval, manufacturer identity, traffic, margin, or settled revenue.",
  };
}

function mergeCompanyStates(target, states) {
  const records = states
    .map((state) => state?.last_good?.[target.id])
    .filter(Boolean);
  const newestRecord = (channel) => records
    .filter((record) => record[channel])
    .sort(
      (left, right) =>
        Date.parse(right.last_observed_at ?? "") -
        Date.parse(left.last_observed_at ?? ""),
    )[0] ?? null;
  const commerceRecord = newestRecord("commerce");
  const marketingRecord = newestRecord("marketing");
  const trustRecord = newestRecord("trust");
  const commerce = commerceRecord?.commerce ?? null;
  const marketing = marketingRecord?.marketing ?? null;
  const observedTimes = records
    .map((record) => record.last_observed_at)
    .filter(Boolean)
    .sort();
  const offers = commerce?.offers ?? [];
  const retaOffers = offers.filter((offer) => offer.is_retatrutide === true);
  const hasCommerce = Boolean(commerce);
  const hasMarketing = Boolean(marketing);
  const commerceCurrent =
    hasCommerce &&
    commerceRecord?.stale !== true &&
    commerceRecord?.last_result_status !== "partial";
  const marketingCurrent =
    hasMarketing &&
    marketingRecord?.stale !== true &&
    marketingRecord?.last_result_status !== "partial";
  const observedState = (present) => (present ? "Observed" : "Unknown");
  const evidenceRecord = commerceRecord ?? marketingRecord ?? trustRecord;
  const evidenceUrl = commerce?.product_url ?? target.homepage_url;
  const history = records
    .map((record) => ({
      observedAt: record.last_observed_at,
      state:
        record.stale || record.last_result_status === "partial"
          ? "Unknown"
          : "Observed",
      type: `${record.cadence ?? "Public"} snapshot`,
      text: record.stale
        ? "The latest attempt failed; this record retains the last good public observation."
        : record.last_result_status === "partial"
          ? "The public observation was partial; prior last-good catalog rows were retained and no removal was inferred."
        : "Public, unauthenticated GET observation completed.",
    }))
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    .slice(0, 12);
  const finitePrices = retaOffers
    .map((offer) => offer.price)
    .filter(Number.isFinite);
  const minimumPrice = finitePrices.length ? Math.min(...finitePrices) : null;
  const maximumPrice = finitePrices.length ? Math.max(...finitePrices) : null;
  const marketingSignals = [
    ...(marketing?.trackers ?? []).map((tracker) => tracker.provider),
    ...(marketing?.affiliate_cue ? ["Affiliate cue"] : []),
    ...(marketing?.referral_cue ? ["Referral cue"] : []),
    ...(marketing?.subscription_cue ? ["Subscription cue"] : []),
  ];
  return {
    domain: target.domain,
    name: target.name,
    cohort: target.cohort,
    baselineAt: observedTimes[0] ?? null,
    domainCreated: {
      value: "Unknown",
      state: "Unknown",
    },
    platform: {
      value: marketing?.platform ?? "Unknown",
      state: observedState(
        marketingCurrent && marketing?.platform !== "unknown",
      ),
    },
    catalog: {
      productCount: Number.isFinite(commerce?.product_count)
        ? commerce.product_count
        : null,
      state: observedState(
        commerceCurrent &&
        commerce?.catalog_complete === true &&
        Number.isFinite(commerce?.product_count),
      ),
    },
    reta: {
      variantCount: hasCommerce ? retaOffers.length : null,
      minimumPrice,
      maximumPrice,
      inStockOffers: hasCommerce
        ? retaOffers.filter((offer) => offer.availability === "in_stock").length
        : null,
      totalOffers: hasCommerce ? retaOffers.length : null,
      currency: retaOffers[0]?.currency ?? "USD",
      state: observedState(
        commerceCurrent &&
        commerce?.catalog_complete === true,
      ),
    },
    traffic: {
      monthlyVisits: null,
      gmvLow: null,
      gmvBase: null,
      gmvHigh: null,
      state: "Unknown",
      method:
        "Direct traffic, conversion, orders, settled revenue and GMV are unavailable from this public GET collector.",
    },
    ui: {
      overall: null,
      mobile: null,
      state: "Unknown",
    },
    checkout: {
      signals: [],
      state: "Unknown",
      boundary:
        "No checkout observation was performed. The monitor does not create accounts, mutate carts, submit checkout, attempt payment, or cross gates.",
    },
    marketing: {
      signals: marketingSignals,
      state: observedState(marketingCurrent),
    },
    history,
    evidence: records.length
      ? [{
          label: "Latest public storefront observation",
          url: evidenceUrl,
          state:
            evidenceRecord?.stale ||
            evidenceRecord?.last_result_status === "partial"
            ? "Unknown"
            : "Observed",
        }]
      : [],
  };
}

export function sanitizePublicPayload(
  targets,
  states,
  generatedAt = new Date().toISOString(),
) {
  const capturedAt = states
    .flatMap((state) => Object.values(state?.last_good ?? {}))
    .map((company) => company?.last_observed_at)
    .filter((value) => Number.isFinite(Date.parse(value ?? "")))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const changes = states
    .flatMap((state) => state?.recent_changes ?? [])
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))
    .slice(0, 100)
    .map((change) => ({
      id: stableHash(
        `${change.domain}|${change.cadence}|${change.type}|${change.observed_at}`,
      ).slice(0, 20),
      domain: change.domain,
      type: change.type,
      observedAt: change.observed_at,
      state: "Observed",
      title: `${change.domain} ${change.type.replaceAll("_", " ")}`,
      detail: `The ${change.cadence} public snapshot detected this change. Raw evidence remains protected.`,
      sourceUrl: `https://${change.domain}/`,
    }));
  return {
    schemaVersion: 1,
    generatedAt,
    capturedAt,
    companies: targets.map((target) => mergeCompanyStates(target, states)),
    changes,
    summary: sanitizeAggregate(states, generatedAt),
  };
}
