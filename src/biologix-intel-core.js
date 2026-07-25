export const BIOLOGIX_BASE_URL = "https://biologixlabsresearch.com";
export const POLL_INTERVAL_MINUTES = 15;
export const DEEP_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const RETENTION_DAYS = 120;

const TRACKER_PATTERNS = [
  ["google_tag_manager", /\bGTM-[A-Z0-9]{5,}\b/gi],
  ["google_analytics", /\bG-[A-Z0-9]{6,}\b/gi],
  ["universal_analytics", /\bUA-\d{4,}-\d+\b/gi],
  ["google_ads", /\bAW-\d{5,}\b/gi],
  ["meta_pixel", /fbq\(\s*['"]init['"]\s*,\s*['"](\d{5,})['"]/gi],
  ["tiktok_pixel", /ttq\.load\(\s*['"]([A-Z0-9]{8,})['"]/gi],
  ["microsoft_clarity", /clarity\.ms\/tag\/([a-z0-9]+)/gi],
  ["hotjar", /hjid\s*[:=]\s*(\d+)/gi],
];

const GENERIC_TRACKER_MARKERS = [
  ["brevo", ["sibautomation.com", "sendinblue"]],
  ["meta_pixel_present", ["connect.facebook.net/en_us/fbevents.js"]],
  ["tiktok_pixel_present", ["analytics.tiktok.com"]],
  ["optinmonster", ["optinmonster.com", "omappapi.com"]],
];

const RELEVANT_NAMESPACE_PATTERNS = [
  /^bankful\//,
  /^jetpack\//,
  /^linkmoney\//,
  /^omapp\//,
  /^rankmath\//,
  /^sendinblue-woo\//,
  /^wc-admin$/,
  /^wc-analytics$/,
  /^wc-push-notifications$/,
  /^wc-telemetry$/,
  /^wc\/store/,
  /^woocommerce/,
  /^wpforms\//,
];

const PUBLIC_AGGREGATE_PROBES = [
  ["rankmath_analytics", "/wp-json/rankmath/v1/an/analyticsSummary"],
  ["rankmath_dashboard", "/wp-json/rankmath/v1/an/dashboard"],
  ["rankmath_keywords", "/wp-json/rankmath/v1/an/keywordsSummary"],
  ["rankmath_link_stats", "/wp-json/rankmath/v1/links/links-stats"],
  ["rankmath_ai_visibility", "/wp-json/rankmath/v1/ai-visibility/overview"],
  ["woocommerce_sales", "/wp-json/wc/v1/reports/sales"],
  ["woocommerce_top_sellers", "/wp-json/wc/v1/reports/top_sellers"],
  ["woocommerce_revenue", "/wp-json/wc-analytics/reports/revenue/stats"],
  ["woocommerce_orders", "/wp-json/wc-analytics/reports/orders/stats"],
];

export function parseStockQuantity(stockText, inStock) {
  const text = String(stockText ?? "").trim();
  const match = text.match(/^(-?\d+)\s+in stock\b/i);
  if (match) return Number.parseInt(match[1], 10);
  if (!inStock && text.toLowerCase().startsWith("out of stock")) return 0;
  return null;
}

export function cents(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function detectTrackers(html) {
  const found = new Map();
  for (const [provider, pattern] of TRACKER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of html.matchAll(pattern)) {
      const publicId = String(match[1] ?? match[0]).toUpperCase();
      found.set(`${provider}:${publicId}`, { provider, public_id: publicId });
    }
  }

  const lowered = html.toLowerCase();
  for (const [provider, markers] of GENERIC_TRACKER_MARKERS) {
    if (markers.some((marker) => lowered.includes(marker))) {
      found.set(`${provider}:present`, { provider, public_id: "present" });
    }
  }

  return [...found.values()].sort((a, b) =>
    `${a.provider}:${a.public_id}`.localeCompare(`${b.provider}:${b.public_id}`),
  );
}

export function detectPublicTechnology(html, headers = {}) {
  const lowered = html.toLowerCase();
  const plugins = new Set();
  for (const match of html.matchAll(/\/wp-content\/plugins\/([^/'"?]+)/gi)) {
    const slug = match[1].toLowerCase();
    if (/^[a-z0-9][a-z0-9._-]*$/.test(slug)) plugins.add(slug);
  }

  const themes = new Set();
  for (const match of html.matchAll(/\/wp-content\/themes\/([^/'"?]+)/gi)) {
    themes.add(match[1].toLowerCase());
  }

  const technologies = new Set(["wordpress"]);
  if (lowered.includes("woocommerce")) technologies.add("woocommerce");
  if (lowered.includes("elementor")) technologies.add("elementor");
  if (lowered.includes("rank-math")) technologies.add("rank-math");
  if (lowered.includes("litespeed")) technologies.add("litespeed");
  if (String(headers.server ?? "").toLowerCase().includes("cloudflare")) {
    technologies.add("cloudflare");
  }
  if (String(headers.platform ?? "").toLowerCase().includes("hostinger")) {
    technologies.add("hostinger");
  }

  return {
    technologies: [...technologies].sort(),
    plugins: [...plugins].sort(),
    themes: [...themes].sort(),
  };
}

function normalizeObservation(item, options) {
  const prices = item.prices ?? {};
  const stockText = String(item.stock_availability?.text ?? "");
  const productId = Number(item.id);
  const parentId = Number(item.parent || productId);
  return {
    key: `${options.recordType}:${productId}`,
    record_type: options.recordType,
    product_type: String(item.type ?? ""),
    product_id: productId,
    parent_id: parentId,
    name: String(item.name ?? ""),
    variation: String(item.variation ?? ""),
    sku: String(item.sku ?? ""),
    price_cents: cents(prices.price),
    regular_price_cents: cents(prices.regular_price),
    sale_price_cents: cents(prices.sale_price),
    stock_quantity: options.quantity,
    stock_text: stockText,
    in_stock: Boolean(item.is_in_stock),
    on_backorder: Boolean(item.is_on_backorder),
    purchasable: Boolean(item.is_purchasable),
    track_inventory: Boolean(options.trackInventory),
    popularity_rank: options.rank ?? null,
    modified_gmt: options.modifiedById.get(parentId) ?? null,
    permalink: String(item.permalink ?? ""),
  };
}

export function buildObservations(parents, variations, wpProducts = []) {
  const modifiedById = new Map(
    wpProducts
      .filter((product) => product?.id !== undefined)
      .map((product) => [Number(product.id), product.modified_gmt ?? null]),
  );
  const variationQuantities = new Map();
  const exactChildParents = new Set();

  for (const variation of variations) {
    const quantity = parseStockQuantity(
      variation.stock_availability?.text,
      Boolean(variation.is_in_stock),
    );
    variationQuantities.set(Number(variation.id), quantity);
    if (quantity !== null) exactChildParents.add(Number(variation.parent || 0));
  }

  const observations = [];
  parents.forEach((parent, index) => {
    const quantity = parseStockQuantity(
      parent.stock_availability?.text,
      Boolean(parent.is_in_stock),
    );
    const productId = Number(parent.id);
    const productType = String(parent.type ?? "");
    const trackInventory =
      quantity !== null &&
      Boolean(parent.is_purchasable) &&
      (productType === "simple" ||
        (productType === "variable" && !exactChildParents.has(productId)));
    observations.push(
      normalizeObservation(parent, {
        recordType: "product",
        rank: index + 1,
        quantity,
        trackInventory,
        modifiedById,
      }),
    );
  });

  for (const variation of variations) {
    const quantity = variationQuantities.get(Number(variation.id));
    observations.push(
      normalizeObservation(variation, {
        recordType: "variation",
        rank: null,
        quantity,
        trackInventory: quantity !== null && Boolean(variation.is_purchasable),
        modifiedById,
      }),
    );
  }
  return observations;
}

export function inventorySummary(observations) {
  const tracked = observations.filter(
    (item) => item.track_inventory && item.stock_quantity !== null,
  );
  return {
    exact_inventory_units: tracked.reduce(
      (total, item) => total + (item.stock_quantity ?? 0),
      0,
    ),
    displayed_inventory_value_cents: tracked.reduce(
      (total, item) =>
        total + (item.stock_quantity ?? 0) * (item.price_cents ?? 0),
      0,
    ),
    exact_quantity_records: tracked.length,
    positive_stock_records: tracked.filter((item) => item.stock_quantity > 0).length,
    zero_stock_records: tracked.filter((item) => item.stock_quantity === 0).length,
    hidden_purchasable_quantity_records: observations.filter(
      (item) =>
        item.record_type === "variation" &&
        item.purchasable &&
        item.stock_quantity === null,
    ).length,
    backorder_capable_records: observations.filter((item) =>
      item.stock_text.toLowerCase().includes("can be backordered"),
    ).length,
    max_exact_stock_quantity: tracked.reduce(
      (maximum, item) => Math.max(maximum, item.stock_quantity ?? 0),
      0,
    ),
  };
}

function eventId(capturedAt, eventType, key) {
  return `${capturedAt}:${eventType}:${key}`;
}

export function diffObservations(previousByKey, current, capturedAt) {
  if (!previousByKey || Object.keys(previousByKey).length === 0) return [];
  const events = [];

  for (const item of current) {
    const previous = previousByKey[item.key];
    if (!previous) {
      events.push({
        id: eventId(capturedAt, "catalog_added", item.key),
        observed_at: capturedAt,
        event_type: "catalog_added",
        item_key: item.key,
        parent_id: item.parent_id,
        name: item.name,
        variation: item.variation,
        sku: item.sku,
        evidence_level: "observed",
      });
      continue;
    }

    if (
      previous.track_inventory &&
      item.track_inventory &&
      previous.stock_quantity !== null &&
      item.stock_quantity !== null &&
      previous.stock_quantity !== item.stock_quantity
    ) {
      const delta = item.stock_quantity - previous.stock_quantity;
      events.push({
        id: eventId(capturedAt, "inventory", item.key),
        observed_at: capturedAt,
        event_type: delta < 0 ? "inventory_decrease" : "inventory_increase",
        item_key: item.key,
        parent_id: item.parent_id,
        name: item.name,
        variation: item.variation,
        sku: item.sku,
        old_value: previous.stock_quantity,
        new_value: item.stock_quantity,
        quantity_delta: delta,
        price_cents: item.price_cents,
        displayed_value_cents:
          delta < 0 ? Math.abs(delta) * (item.price_cents ?? 0) : 0,
        modified_gmt: item.modified_gmt,
        evidence_level: "observed",
      });
    }

    if (previous.price_cents !== item.price_cents) {
      events.push({
        id: eventId(capturedAt, "price", item.key),
        observed_at: capturedAt,
        event_type: "price_change",
        item_key: item.key,
        parent_id: item.parent_id,
        name: item.name,
        variation: item.variation,
        sku: item.sku,
        old_value: previous.price_cents,
        new_value: item.price_cents,
        evidence_level: "observed",
      });
    }

    if (
      item.record_type === "product" &&
      previous.popularity_rank !== item.popularity_rank
    ) {
      events.push({
        id: eventId(capturedAt, "rank", item.key),
        observed_at: capturedAt,
        event_type: "popularity_rank_change",
        item_key: item.key,
        parent_id: item.parent_id,
        name: item.name,
        variation: "",
        old_value: previous.popularity_rank,
        new_value: item.popularity_rank,
        evidence_level: "observed",
      });
    }

    if (previous.in_stock !== item.in_stock) {
      events.push({
        id: eventId(capturedAt, "availability", item.key),
        observed_at: capturedAt,
        event_type: "availability_change",
        item_key: item.key,
        parent_id: item.parent_id,
        name: item.name,
        variation: item.variation,
        old_value: previous.in_stock,
        new_value: item.in_stock,
        evidence_level: "observed",
      });
    }
  }

  const currentKeys = new Set(current.map((item) => item.key));
  for (const previous of Object.values(previousByKey)) {
    if (!currentKeys.has(previous.key)) {
      events.push({
        id: eventId(capturedAt, "catalog_removed", previous.key),
        observed_at: capturedAt,
        event_type: "catalog_removed",
        item_key: previous.key,
        parent_id: previous.parent_id,
        name: previous.name,
        variation: previous.variation,
        sku: previous.sku,
        evidence_level: "observed",
      });
    }
  }
  return events;
}

export function clusterProbableBaskets(events, previousCapturedAt, capturedAt) {
  const windowStart = Date.parse(previousCapturedAt ?? "") || 0;
  const windowEnd = Date.parse(capturedAt) + 30_000;
  const candidates = events
    .filter((event) => {
      if (event.event_type !== "inventory_decrease" || !event.modified_gmt) {
        return false;
      }
      const modified = Date.parse(event.modified_gmt);
      return modified >= windowStart && modified <= windowEnd;
    })
    .sort((a, b) => Date.parse(a.modified_gmt) - Date.parse(b.modified_gmt));

  const rawGroups = [];
  let current = [];
  for (const event of candidates) {
    if (
      current.length === 0 ||
      Date.parse(event.modified_gmt) -
        Date.parse(current[current.length - 1].modified_gmt) <=
        5_000
    ) {
      current.push(event);
    } else {
      rawGroups.push(current);
      current = [event];
    }
  }
  if (current.length) rawGroups.push(current);

  return rawGroups
    .filter((group) => group.length >= 2)
    .map((group) => {
      const groupId = `basket:${capturedAt}:${group
        .map((event) => event.item_key)
        .sort()
        .join("|")}`;
      for (const event of group) event.group_id = groupId;
      return {
        group_id: groupId,
        observed_at: capturedAt,
        occurred_at: group[0].modified_gmt,
        item_count: group.length,
        unit_count: group.reduce(
          (total, event) => total + Math.abs(event.quantity_delta ?? 0),
          0,
        ),
        displayed_value_cents: group.reduce(
          (total, event) => total + (event.displayed_value_cents ?? 0),
          0,
        ),
        confidence: 0.7,
        classification: "probable_basket_not_confirmed_sale",
        event_ids: group.map((event) => event.id),
      };
    });
}

export function parseSitemapIndex(xml) {
  const entries = [];
  const sitemapBlocks = xml.match(/<sitemap\b[\s\S]*?<\/sitemap>/gi) ?? [];
  for (const block of sitemapBlocks) {
    const location = block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim();
    if (!location) continue;
    const lastmod = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
    entries.push({ location, lastmod: lastmod ?? null });
  }
  return entries;
}

export function summarizeUrlset(xml) {
  const urlBlocks = xml.match(/<url\b[\s\S]*?<\/url>/gi) ?? [];
  const lastmods = urlBlocks
    .map((block) => block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim())
    .filter(Boolean)
    .sort();
  return {
    url_count: urlBlocks.length,
    latest_lastmod: lastmods.at(-1) ?? null,
  };
}

export function relevantNamespaces(namespaces) {
  return [...new Set(namespaces)]
    .filter((namespace) =>
      RELEVANT_NAMESPACE_PATTERNS.some((pattern) => pattern.test(namespace)),
    )
    .sort();
}

export function publicAggregateProbes() {
  return [...PUBLIC_AGGREGATE_PROBES];
}

export function aggregateReport(dayRecords, latestState, sinceIso) {
  const cutoff = Date.parse(sinceIso);
  const snapshots = dayRecords
    .flatMap((day) => day?.snapshots ?? [])
    .filter((snapshot) => Date.parse(snapshot.captured_at) >= cutoff)
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
  const events = dayRecords
    .flatMap((day) => day?.events ?? [])
    .filter((event) => Date.parse(event.observed_at) >= cutoff);
  const baskets = dayRecords
    .flatMap((day) => day?.baskets ?? [])
    .filter((basket) => Date.parse(basket.observed_at) >= cutoff);

  const decreases = events.filter(
    (event) => event.event_type === "inventory_decrease",
  );
  const increases = events.filter(
    (event) => event.event_type === "inventory_increase",
  );
  const latest = latestState?.latest_snapshot ?? null;
  return {
    generated_at: new Date().toISOString(),
    window: {
      since: sinceIso,
      first_snapshot_at: snapshots[0]?.captured_at ?? null,
      last_snapshot_at: snapshots.at(-1)?.captured_at ?? null,
      snapshot_count: snapshots.length,
    },
    current: latest,
    movement: {
      observed_units_down: decreases.reduce(
        (total, event) => total + Math.abs(event.quantity_delta ?? 0),
        0,
      ),
      observed_units_up: increases.reduce(
        (total, event) => total + Math.abs(event.quantity_delta ?? 0),
        0,
      ),
      displayed_price_gmv_signal_cents: decreases.reduce(
        (total, event) => total + (event.displayed_value_cents ?? 0),
        0,
      ),
      inventory_decrease_records: decreases.length,
      inventory_increase_records: increases.length,
      price_changes: events.filter((event) => event.event_type === "price_change")
        .length,
      popularity_rank_changes: events.filter(
        (event) => event.event_type === "popularity_rank_change",
      ).length,
      availability_changes: events.filter(
        (event) => event.event_type === "availability_change",
      ).length,
    },
    probable_baskets: {
      count: baskets.length,
      units: baskets.reduce((total, basket) => total + basket.unit_count, 0),
      displayed_value_cents: baskets.reduce(
        (total, basket) => total + basket.displayed_value_cents,
        0,
      ),
      classification: "inference_not_confirmed_sale",
      confidence: 0.7,
      recent: baskets.slice(-50).reverse(),
    },
    recent_inventory_events: [...decreases, ...increases]
      .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))
      .slice(0, 100),
    public_site_signals: latestState?.public_site_signals ?? null,
    traffic: {
      direct_visitor_counts_available: false,
      observed_public_signals: [
        "storefront inventory movement",
        "public popularity-order movement",
        "public product modification timestamps",
        "sitemap growth and modification times",
        "public analytics-tag and technology presence",
        "origin response timing and cache headers",
      ],
      unavailable_without_authorized_or_paid_data: [
        "visitors",
        "sessions",
        "pageviews",
        "traffic sources",
        "conversion rate",
        "paid and settled sales",
        "refunds and chargebacks",
      ],
    },
    evidence_boundary: {
      observed:
        "Public GET responses and changes between scheduled snapshots.",
      inferred:
        "Probable baskets use correlated inventory decreases and public modification timestamps.",
      unavailable:
        "Inventory movement cannot prove payment, settlement, fulfillment, customer identity, or traffic.",
    },
  };
}

export function compactObservationMap(observations) {
  return Object.fromEntries(observations.map((item) => [item.key, item]));
}

export function safeDurationSince(value, now = Date.now()) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null;
}
