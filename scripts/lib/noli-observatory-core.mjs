import { createHash } from "node:crypto";

export const OBSERVATORY_SCHEMA_VERSION = 1;
export const OBSERVATORY_RETENTION_DAYS = 90;

export const OBSERVATORY_BOUNDARIES = Object.freeze({
  observed:
    "Observed means an anonymous public page or feed exposed the value at the stated time. It does not prove sales, settlement, inventory, attribution, or a vendor relationship.",
  estimated:
    "Estimated means a documented model derived from public inputs. It is not analytics, booked revenue, profit, traffic, orders, CAC, LTV, or a settlement record.",
  unknown:
    "Unknown means the public capture could not establish the value. Unknown never means zero, absent, inactive, or unavailable to a customer.",
  stock:
    "Storefront availability is a point-in-time public signal. It is not sales velocity, units on hand, or warehouse inventory.",
  payment:
    "Public code can identify an integration marker. It does not establish the merchant's processor, ISO, acquirer, approval, activation, successful checkout, or settlement.",
  marketing:
    "Public scripts and routes show observable capability, not spend, traffic share, CAC, ROAS, or attributed revenue.",
});

const STOCK_VALUES = new Set(["in_stock", "out_of_stock", "backorder", "unknown"]);
const CHANNEL_STATUSES = new Set(["observed", "stale", "unknown", "error"]);

function cleanString(value) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function finiteNumber(value, { allowZero = true } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (!allowZero && parsed <= 0)) return null;
  return parsed;
}

function sortedUnique(values) {
  return [...new Set((values || []).map(cleanString).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function stableHash(value, length = 20) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameDomainUrl(value, domain) {
  const normalized = canonicalUrl(value);
  if (!normalized) return null;
  const host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  const expected = String(domain).toLowerCase().replace(/^www\./, "");
  return host === expected || host.endsWith(`.${expected}`) ? normalized : null;
}

export function evidenceValue(
  value,
  kind = value === null || value === undefined ? "unknown" : "observed",
  details = {},
) {
  if (!["observed", "estimated", "unknown"].includes(kind)) {
    throw new Error(`Unsupported evidence kind ${kind}`);
  }
  return {
    value: value ?? null,
    kind,
    sourceUrl: details.sourceUrl || null,
    observedAt: details.observedAt || null,
    stale: Boolean(details.stale),
    model: kind === "estimated" ? details.model || null : null,
    caveat: details.caveat || OBSERVATORY_BOUNDARIES[kind],
  };
}

export function isRetatrutideOffer(value) {
  const text = [
    value?.productTitle,
    value?.title,
    value?.category,
    value?.options,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /\bretatrutide\b/.test(text) ||
    /\breta(?:[-\s]?(?:3|glp))?\b/.test(text) ||
    /\bglp[-\s]?3r?\b/.test(text) ||
    /\btriple[-\s]?agonist\b/.test(text) ||
    /\bsp[-\s]?3rt\b/.test(text)
  );
}

export function normalizeOffer(raw, domain, observedAt) {
  const productTitle = cleanString(raw.productTitle ?? raw.product_title ?? raw.title);
  if (!productTitle) return null;

  const currentPrice = finiteNumber(
    raw.currentPrice ?? raw.current_price ?? raw.price,
    { allowZero: false },
  );
  const listPrice = finiteNumber(
    raw.listPrice ?? raw.compare_at_list_price ?? raw.regularPrice,
    { allowZero: false },
  );
  const stockCandidate = cleanString(raw.stockStatus ?? raw.stock_status)?.toLowerCase();
  const stockStatus = STOCK_VALUES.has(stockCandidate) ? stockCandidate : "unknown";
  const publicProductId = cleanString(raw.publicProductId ?? raw.public_product_id);
  const publicVariantId = cleanString(raw.publicVariantId ?? raw.public_variant_id);
  const publicOfferId = cleanString(raw.publicOfferId ?? raw.public_offer_id);
  const publicSkuId = cleanString(raw.publicSkuId ?? raw.public_sku_id);
  const options = cleanString(raw.options ?? raw.strength_size_options);
  const productUrl =
    sameDomainUrl(raw.canonicalUrl ?? raw.canonical_url ?? raw.url, domain) ||
    `https://${domain}/`;
  const sourceUrl =
    sameDomainUrl(raw.sourceUrl ?? raw.source_url, domain) || productUrl;
  const publicIdentity =
    publicVariantId ||
    publicOfferId?.split(/[/:]/).filter(Boolean).at(-1) ||
    publicProductId;
  const identity =
    publicIdentity
      ? `public:${publicIdentity}`
      : [
          productUrl.split("?")[0],
          publicSkuId || "",
          productTitle.toLowerCase(),
          (options || "").toLowerCase(),
        ].join("|");

  return {
    key: `${domain}:${stableHash(identity)}`,
    productTitle,
    options,
    category: cleanString(raw.category),
    currentPrice,
    listPrice,
    currency: cleanString(raw.currency)?.toUpperCase() || null,
    stockStatus,
    publicProductId,
    publicVariantId,
    publicOfferId,
    publicSkuId,
    canonicalUrl: productUrl,
    sourceUrl,
    isRetatrutide:
      typeof raw.isRetatrutide === "boolean"
        ? raw.isRetatrutide
        : isRetatrutideOffer({ productTitle, options, category: raw.category }),
    observedAt: raw.observedAt ?? raw.capturedAt ?? raw.captured_at ?? observedAt,
    evidence: "observed",
    confidence: cleanString(raw.confidence) || "high",
    caveat: cleanString(raw.caveat) || OBSERVATORY_BOUNDARIES.observed,
  };
}

export function normalizeOffers(rawOffers, domain, observedAt) {
  const byKey = new Map();
  for (const raw of rawOffers || []) {
    const offer = normalizeOffer(raw, domain, observedAt);
    if (!offer) continue;
    const existing = byKey.get(offer.key);
    if (!existing || (!existing.currentPrice && offer.currentPrice)) {
      byKey.set(offer.key, offer);
    }
  }
  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function normalizePromotions(values, domain) {
  const byKey = new Map();
  for (const item of values || []) {
    const text = cleanString(typeof item === "string" ? item : item.text);
    if (!text) continue;
    const kind = cleanString(typeof item === "string" ? null : item.kind) || "promotion";
    const sourceUrl =
      sameDomainUrl(typeof item === "string" ? null : item.sourceUrl, domain) ||
      `https://${domain}/`;
    const key = stableHash(`${kind}|${text.toLowerCase()}`);
    byKey.set(key, { key, kind, text, sourceUrl, evidence: "observed" });
  }
  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function normalizeChannelStatus(value) {
  return CHANNEL_STATUSES.has(value) ? value : "unknown";
}

export function normalizeCatalogChannel(raw, domain, capturedAt) {
  const status = normalizeChannelStatus(raw?.status);
  const offers = normalizeOffers(raw?.offers, domain, raw?.observedAt || capturedAt);
  const coverage = ["complete", "partial", "unknown"].includes(raw?.coverage)
    ? raw.coverage
    : "unknown";
  return {
    status,
    coverage,
    offers,
    sourceUrls: sortedUnique(raw?.sourceUrls).filter((url) => sameDomainUrl(url, domain)),
    observedAt: status === "observed" ? raw?.observedAt || capturedAt : raw?.observedAt || null,
    lastAttemptAt: raw?.lastAttemptAt || capturedAt,
    staleSince: raw?.staleSince || null,
    adapter: cleanString(raw?.adapter),
    error: cleanString(raw?.error),
    caveat:
      cleanString(raw?.caveat) ||
      (status === "observed"
        ? OBSERVATORY_BOUNDARIES.stock
        : OBSERVATORY_BOUNDARIES.unknown),
  };
}

export function normalizeStorefrontChannel(raw, domain, capturedAt) {
  const status = normalizeChannelStatus(raw?.status);
  return {
    status,
    url: sameDomainUrl(raw?.url, domain) || `https://${domain}/`,
    finalUrl: sameDomainUrl(raw?.finalUrl, domain),
    httpStatus: finiteNumber(raw?.httpStatus),
    title: cleanString(raw?.title),
    description: cleanString(raw?.description),
    contentHash: cleanString(raw?.contentHash),
    promotions: normalizePromotions(raw?.promotions, domain),
    marketingCodes: sortedUnique(raw?.marketingCodes),
    paymentCodes: sortedUnique(raw?.paymentCodes),
    publicRoutes: sortedUnique(raw?.publicRoutes).filter((url) => sameDomainUrl(url, domain)),
    observedAt: status === "observed" ? raw?.observedAt || capturedAt : raw?.observedAt || null,
    lastAttemptAt: raw?.lastAttemptAt || capturedAt,
    staleSince: raw?.staleSince || null,
    error: cleanString(raw?.error),
    caveat:
      cleanString(raw?.caveat) ||
      (status === "observed"
        ? `${OBSERVATORY_BOUNDARIES.marketing} ${OBSERVATORY_BOUNDARIES.payment}`
        : OBSERVATORY_BOUNDARIES.unknown),
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function companyMetrics(company) {
  const { catalog } = company;
  const prices = catalog.offers.map(({ currentPrice }) => currentPrice).filter(Number.isFinite);
  const observedAt = catalog.observedAt;
  const stale = catalog.status === "stale";
  const observedKind = catalog.status === "unknown" || catalog.status === "error"
    ? "unknown"
    : "observed";
  const metric = (value, caveat = OBSERVATORY_BOUNDARIES.observed) =>
    evidenceValue(observedKind === "unknown" ? null : value, observedKind, {
      observedAt,
      stale,
      caveat,
    });
  return {
    catalogOffers: metric(catalog.offers.length, catalog.caveat),
    retatrutideOffers: metric(
      catalog.offers.filter(({ isRetatrutide }) => isRetatrutide).length,
      catalog.caveat,
    ),
    priceMinimum: metric(prices.length ? Math.min(...prices) : null, catalog.caveat),
    priceMedian: metric(prices.length ? median(prices) : null, catalog.caveat),
    priceMaximum: metric(prices.length ? Math.max(...prices) : null, catalog.caveat),
    monthlyTraffic: evidenceValue(null, "unknown", {
      caveat: "No first-party analytics or current documented traffic model is part of this snapshot.",
    }),
    revenue: evidenceValue(null, "unknown", {
      caveat: "Exact revenue, margin, orders, chargebacks, and settlement are not observable from a public storefront.",
    }),
  };
}

function normalizeCompany(target, observation, capturedAt) {
  const company = {
    domain: target.domain,
    brand: target.brand,
    cohort: target.cohort,
    catalogAdapter: target.catalogAdapter,
    catalog: normalizeCatalogChannel(observation?.catalog, target.domain, capturedAt),
    storefront: normalizeStorefrontChannel(observation?.storefront, target.domain, capturedAt),
  };
  company.metrics = companyMetrics(company);
  return company;
}

function summarize(companies) {
  return {
    companies: companies.length,
    fullyFresh: companies.filter(
      ({ catalog, storefront }) =>
        catalog.status === "observed" && storefront.status === "observed",
    ).length,
    withFreshCatalog: companies.filter(({ catalog }) => catalog.status === "observed").length,
    withStaleCatalog: companies.filter(({ catalog }) => catalog.status === "stale").length,
    withUnknownCatalog: companies.filter(({ catalog }) =>
      ["unknown", "error"].includes(catalog.status),
    ).length,
    reachableStorefronts: companies.filter(({ storefront }) => storefront.status === "observed")
      .length,
    retainedStaleStorefronts: companies.filter(({ storefront }) => storefront.status === "stale")
      .length,
    offers: companies.reduce((sum, { catalog }) => sum + catalog.offers.length, 0),
    retatrutideOffers: companies.reduce(
      (sum, { catalog }) =>
        sum + catalog.offers.filter(({ isRetatrutide }) => isRetatrutide).length,
      0,
    ),
  };
}

export function snapshotIdFor(capturedAt) {
  const date = new Date(capturedAt);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid capturedAt ${capturedAt}`);
  return date.toISOString().replace(/[-:.]/g, "");
}

export function createCandidateSnapshot({
  capturedAt = new Date().toISOString(),
  registry,
  observations = [],
}) {
  const byDomain = new Map(observations.map((observation) => [observation.domain, observation]));
  const companies = registry.targets.map((target) =>
    normalizeCompany(target, byDomain.get(target.domain), capturedAt),
  );
  return {
    schemaVersion: OBSERVATORY_SCHEMA_VERSION,
    snapshotId: snapshotIdFor(capturedAt),
    capturedAt,
    registry: {
      version: registry.version,
      validFrom: registry.validFrom,
      lockedUntil: registry.lockedUntil,
      domains: registry.targets.map(({ domain }) => domain),
    },
    retentionDays: OBSERVATORY_RETENTION_DAYS,
    collectionPolicy: {
      methods: ["GET", "HEAD"],
      scope: "anonymous public first-party pages and feeds only",
      prohibited:
        "No accounts, forms, carts, checkout submission, transactions, gate bypass, access-control evasion, or private-group access.",
    },
    boundaries: OBSERVATORY_BOUNDARIES,
    companies,
    summary: summarize(companies),
  };
}

function retainLastGood(current, previous, capturedAt) {
  if (current.status === "observed") return current;
  if (!previous || !["observed", "stale"].includes(previous.status)) return current;
  return {
    ...structuredClone(previous),
    status: "stale",
    lastAttemptAt: current.lastAttemptAt || capturedAt,
    staleSince: previous.staleSince || current.lastAttemptAt || capturedAt,
    error: current.error || "Current public capture did not return usable data",
    caveat: `${previous.caveat || ""} Last-good data retained after a failed or unresolved current capture; absence was not inferred.`.trim(),
  };
}

export function reconcileWithLastGood(candidate, previous = null) {
  if (!previous) return candidate;
  const expected = candidate.registry.domains.join("|");
  const prior = previous.registry?.domains?.join("|");
  if (
    previous.registry?.version !== candidate.registry.version ||
    expected !== prior
  ) {
    throw new Error("Refusing to reconcile snapshots from different fixed registries");
  }
  const previousByDomain = new Map(previous.companies.map((company) => [company.domain, company]));
  const companies = candidate.companies.map((company) => {
    const old = previousByDomain.get(company.domain);
    const reconciled = {
      ...company,
      catalog: retainLastGood(company.catalog, old?.catalog, candidate.capturedAt),
      storefront: retainLastGood(company.storefront, old?.storefront, candidate.capturedAt),
    };
    reconciled.metrics = companyMetrics(reconciled);
    return reconciled;
  });
  return { ...candidate, companies, summary: summarize(companies) };
}

function event({
  current,
  previous,
  domain,
  category,
  type,
  field,
  key = null,
  before = null,
  after = null,
  sourceUrl = null,
  caveat = OBSERVATORY_BOUNDARIES.observed,
  previousStatus = "observed",
}) {
  const identity = [
    previous.snapshotId,
    current.snapshotId,
    domain,
    category,
    type,
    field,
    key || "",
  ].join("|");
  return {
    id: stableHash(identity, 24),
    domain,
    category,
    type,
    field,
    key,
    before,
    after,
    beforeSnapshotId: previous.snapshotId,
    afterSnapshotId: current.snapshotId,
    detectedAt: current.capturedAt,
    comparison:
      previousStatus === "stale" ? "since_last_successful_observation" : "adjacent_observations",
    sourceUrl,
    evidence: "observed",
    confidence: "high",
    caveat,
  };
}

function diffSignals({
  previous,
  current,
  domain,
  field,
  category,
  addedType,
  removedType,
  previousValues,
  currentValues,
  sourceUrl,
  previousStatus,
}) {
  const before = new Set(previousValues);
  const after = new Set(currentValues);
  return [
    ...[...after].filter((value) => !before.has(value)).map((value) =>
      event({
        previous,
        current,
        domain,
        category,
        type: addedType,
        field,
        key: stableHash(value),
        after: value,
        sourceUrl,
        previousStatus,
        caveat:
          category === "payment"
            ? OBSERVATORY_BOUNDARIES.payment
            : category === "marketing"
              ? OBSERVATORY_BOUNDARIES.marketing
              : OBSERVATORY_BOUNDARIES.observed,
      }),
    ),
    ...[...before].filter((value) => !after.has(value)).map((value) =>
      event({
        previous,
        current,
        domain,
        category,
        type: removedType,
        field,
        key: stableHash(value),
        before: value,
        sourceUrl,
        previousStatus,
        caveat:
          category === "payment"
            ? OBSERVATORY_BOUNDARIES.payment
            : category === "marketing"
              ? OBSERVATORY_BOUNDARIES.marketing
              : OBSERVATORY_BOUNDARIES.observed,
      }),
    ),
  ];
}

function promotionComparable(item) {
  return `${item.kind}|${item.text}`;
}

function diffStorefront(previousSnapshot, currentSnapshot, oldCompany, company) {
  const old = oldCompany.storefront;
  const next = company.storefront;
  if (next.status !== "observed" || !["observed", "stale"].includes(old.status)) return [];
  const args = {
    previous: previousSnapshot,
    current: currentSnapshot,
    domain: company.domain,
    sourceUrl: next.finalUrl || next.url,
    previousStatus: old.status,
  };
  return [
    ...diffSignals({
      ...args,
      category: "marketing",
      field: "promotions",
      addedType: "promotion_started",
      removedType: "promotion_ended",
      previousValues: old.promotions.map(promotionComparable),
      currentValues: next.promotions.map(promotionComparable),
    }),
    ...diffSignals({
      ...args,
      category: "marketing",
      field: "marketingCodes",
      addedType: "marketing_signal_added",
      removedType: "marketing_signal_removed",
      previousValues: old.marketingCodes,
      currentValues: next.marketingCodes,
    }),
    ...diffSignals({
      ...args,
      category: "payment",
      field: "paymentCodes",
      addedType: "payment_code_added",
      removedType: "payment_code_removed",
      previousValues: old.paymentCodes,
      currentValues: next.paymentCodes,
    }),
  ];
}

function diffCatalog(previousSnapshot, currentSnapshot, oldCompany, company) {
  const old = oldCompany.catalog;
  const next = company.catalog;
  if (next.status !== "observed" || !["observed", "stale"].includes(old.status)) return [];
  const oldOffers = new Map(old.offers.map((offer) => [offer.key, offer]));
  const nextOffers = new Map(next.offers.map((offer) => [offer.key, offer]));
  const events = [];
  const shared = [...nextOffers.keys()].filter((key) => oldOffers.has(key));
  const args = {
    previous: previousSnapshot,
    current: currentSnapshot,
    domain: company.domain,
    category: "catalog",
    previousStatus: old.status,
  };
  for (const key of shared) {
    const before = oldOffers.get(key);
    const after = nextOffers.get(key);
    for (const [field, type] of [
      ["currentPrice", "price_changed"],
      ["listPrice", "list_price_changed"],
      ["stockStatus", "stock_changed"],
    ]) {
      if (before[field] !== after[field]) {
        events.push(
          event({
            ...args,
            type,
            field,
            key,
            before: before[field],
            after: after[field],
            sourceUrl: after.sourceUrl,
            caveat:
              field === "stockStatus"
                ? OBSERVATORY_BOUNDARIES.stock
                : "Observed public offer value changed between captures; the exact change time and business cause are unknown.",
          }),
        );
      }
    }
  }
  if (old.coverage === "complete" && next.coverage === "complete") {
    for (const [key, offer] of nextOffers) {
      if (!oldOffers.has(key)) {
        events.push(
          event({
            ...args,
            type: "offer_added",
            field: "offers",
            key,
            after: offer,
            sourceUrl: offer.sourceUrl,
          }),
        );
      }
    }
    for (const [key, offer] of oldOffers) {
      if (!nextOffers.has(key)) {
        events.push(
          event({
            ...args,
            type: "offer_removed",
            field: "offers",
            key,
            before: offer,
            sourceUrl: offer.sourceUrl,
          }),
        );
      }
    }
    if (old.offers.length !== next.offers.length) {
      events.push(
        event({
          ...args,
          type: "catalog_size_changed",
          field: "offerCount",
          before: old.offers.length,
          after: next.offers.length,
          sourceUrl: next.sourceUrls[0] || null,
        }),
      );
    }
  }
  return events;
}

export function diffSnapshots(previous, current) {
  if (!previous) {
    return {
      schemaVersion: OBSERVATORY_SCHEMA_VERSION,
      generatedAt: current.capturedAt,
      fromSnapshotId: null,
      toSnapshotId: current.snapshotId,
      events: [],
      boundary: "The first snapshot establishes a baseline; it does not manufacture historical changes.",
    };
  }
  if (previous.registry?.version !== current.registry?.version) {
    throw new Error("Refusing to diff snapshots from different registry versions");
  }
  const previousByDomain = new Map(previous.companies.map((company) => [company.domain, company]));
  const events = current.companies.flatMap((company) => {
    const old = previousByDomain.get(company.domain);
    if (!old) return [];
    return [
      ...diffCatalog(previous, current, old, company),
      ...diffStorefront(previous, current, old, company),
    ];
  });
  events.sort((left, right) =>
    [left.domain, left.category, left.type, left.key || ""]
      .join("|")
      .localeCompare([right.domain, right.category, right.type, right.key || ""].join("|")),
  );
  return {
    schemaVersion: OBSERVATORY_SCHEMA_VERSION,
    generatedAt: current.capturedAt,
    fromSnapshotId: previous.snapshotId,
    toSnapshotId: current.snapshotId,
    events,
    boundary:
      "Events compare public observations. They do not establish the exact change time, cause, sales impact, payment activation, inventory movement, or campaign performance.",
  };
}

export function snapshotIsExpired(snapshot, now = new Date(), retentionDays = OBSERVATORY_RETENTION_DAYS) {
  const capturedAt = Date.parse(snapshot?.capturedAt);
  if (!Number.isFinite(capturedAt)) return true;
  return now.getTime() - capturedAt > retentionDays * 86_400_000;
}
