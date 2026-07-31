import {
  BIOLOGIX_BASE_URL,
  DEEP_SCAN_INTERVAL_MS,
  POLL_INTERVAL_MINUTES,
  buildObservations,
  clusterProbableBaskets,
  detectPublicTechnology,
  detectTrackers,
  diffObservations,
  inventorySummary,
  parseSitemapIndex,
  publicAggregateProbes,
  relevantNamespaces,
  safeDurationSince,
  summarizeUrlset,
} from "./biologix-intel-core.js";

const REQUEST_TIMEOUT_MS = 18_000;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_SITEMAPS = 20;

function publicHeaders(response) {
  const headerNames = [
    "cache-control",
    "cf-cache-status",
    "last-modified",
    "platform",
    "server",
    "x-litespeed-cache",
    "x-powered-by",
    "x-turbo-charged-by",
  ];
  return Object.fromEntries(
    headerNames
      .map((name) => [name, response.headers.get(name)])
      .filter(([, value]) => value !== null),
  );
}

async function fetchBounded(url, options = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: options.accept ?? "application/json,text/html;q=0.9,*/*;q=0.1",
      "User-Agent":
        "OVO-Public-Intelligence/1.0 (+low-frequency aggregate research)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > (options.maxBytes ?? MAX_TEXT_BYTES)) {
    throw new Error(`Response exceeded byte limit: ${url}`);
  }
  return {
    response,
    text: new TextDecoder().decode(buffer),
    bytes: buffer.byteLength,
    duration_ms: Date.now() - started,
  };
}

function withQuery(url, values) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(values)) {
    parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}

export function freshPublicUrl(url, now = Date.now()) {
  const bucketMs = POLL_INTERVAL_MINUTES * 60_000;
  return withQuery(url, {
    ovo_intel_poll: Math.floor(now / bucketMs),
  });
}

async function fetchJsonCollection(url) {
  const first = await fetchBounded(withQuery(url, { page: 1 }), {
    accept: "application/json",
    maxBytes: 8 * 1024 * 1024,
  });
  if (!first.response.ok) {
    throw new Error(`GET ${url} returned ${first.response.status}`);
  }
  const firstRecords = JSON.parse(first.text);
  if (!Array.isArray(firstRecords)) {
    throw new Error(`Expected JSON list from ${url}`);
  }
  const totalPages = Math.min(
    20,
    Number.parseInt(first.response.headers.get("x-wp-totalpages") ?? "1", 10),
  );
  const remaining =
    totalPages > 1
      ? await Promise.all(
          Array.from({ length: totalPages - 1 }, async (_, index) => {
            const page = index + 2;
            const result = await fetchBounded(withQuery(url, { page }), {
              accept: "application/json",
              maxBytes: 8 * 1024 * 1024,
            });
            if (!result.response.ok) {
              throw new Error(`GET ${url} page ${page} returned ${result.response.status}`);
            }
            const records = JSON.parse(result.text);
            if (!Array.isArray(records)) {
              throw new Error(`Expected JSON list from ${url} page ${page}`);
            }
            return records;
          }),
        )
      : [];
  return {
    records: [...firstRecords, ...remaining.flat()],
    meta: {
      status: first.response.status,
      total_pages: totalPages,
      total_items: Number.parseInt(
        first.response.headers.get("x-wp-total") ?? String(firstRecords.length),
        10,
      ),
      first_page_duration_ms: first.duration_ms,
      headers: publicHeaders(first.response),
    },
  };
}

async function quickHomepageProbe() {
  const result = await fetchBounded(`${BIOLOGIX_BASE_URL}/`, {
    accept: "text/html",
    maxBytes: 3 * 1024 * 1024,
  });
  return {
    status: result.response.status,
    duration_ms: result.duration_ms,
    bytes: result.bytes,
    headers: publicHeaders(result.response),
    trackers: detectTrackers(result.text),
    technology: detectPublicTechnology(
      result.text,
      Object.fromEntries(
        [...result.response.headers].map(([key, value]) => [key, value]),
      ),
    ),
    html: result.text,
  };
}

function publicRouteStatus(response) {
  if (response.status === 401 || response.status === 403) return "authenticated";
  if (response.status === 404) return "not_found";
  if (response.ok) return "public";
  return `http_${response.status}`;
}

async function probeAggregateEndpoint(name, path) {
  try {
    const result = await fetchBounded(`${BIOLOGIX_BASE_URL}${path}`, {
      accept: "application/json",
      maxBytes: 256 * 1024,
    });
    return {
      name,
      path,
      status_code: result.response.status,
      visibility: publicRouteStatus(result.response),
    };
  } catch (error) {
    return { name, path, status_code: null, visibility: "error", error: error.message };
  }
}

async function dnsQuery(type) {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", new URL(BIOLOGIX_BASE_URL).hostname);
  url.searchParams.set("type", type);
  const result = await fetchBounded(url.toString(), {
    accept: "application/dns-json",
    maxBytes: 256 * 1024,
  });
  const payload = JSON.parse(result.text);
  return {
    type,
    status: payload.Status,
    answers: (payload.Answer ?? []).map((answer) => ({
      name: answer.name,
      ttl: answer.TTL,
      data: answer.data,
    })),
  };
}

async function collectSitemapSignals(robotsText) {
  const sitemapFromRobots = robotsText.match(/^Sitemap:\s*(\S+)/im)?.[1];
  const candidates = [
    sitemapFromRobots,
    `${BIOLOGIX_BASE_URL}/sitemap_index.xml`,
    `${BIOLOGIX_BASE_URL}/wp-sitemap.xml`,
  ].filter(Boolean);
  let indexResult = null;
  for (const candidate of [...new Set(candidates)]) {
    try {
      const result = await fetchBounded(candidate, {
        accept: "application/xml,text/xml",
        maxBytes: 2 * 1024 * 1024,
      });
      if (result.response.ok && result.text.includes("<sitemapindex")) {
        indexResult = { url: candidate, ...result };
        break;
      }
    } catch {
      // Try the next public sitemap candidate.
    }
  }
  if (!indexResult) return { available: false, sitemap_count: 0, url_count: 0 };

  const entries = parseSitemapIndex(indexResult.text).slice(0, MAX_SITEMAPS);
  const childResults = await Promise.all(
    entries.map(async (entry) => {
      try {
        const result = await fetchBounded(entry.location, {
          accept: "application/xml,text/xml",
          maxBytes: 4 * 1024 * 1024,
        });
        const summary = summarizeUrlset(result.text);
        return {
          name: new URL(entry.location).pathname.split("/").at(-1),
          status: result.response.status,
          ...summary,
        };
      } catch (error) {
        return {
          name: new URL(entry.location).pathname.split("/").at(-1),
          status: null,
          url_count: 0,
          error: error.message,
        };
      }
    }),
  );
  return {
    available: true,
    index_name: new URL(indexResult.url).pathname.split("/").at(-1),
    index_duration_ms: indexResult.duration_ms,
    sitemap_count: childResults.length,
    url_count: childResults.reduce((total, child) => total + child.url_count, 0),
    sitemaps: childResults,
  };
}

async function collectDeepSignals(homepage) {
  const [robotsResult, wpRootResult, dnsResults, aggregateEndpoints] =
    await Promise.all([
      fetchBounded(`${BIOLOGIX_BASE_URL}/robots.txt`, {
        accept: "text/plain",
        maxBytes: 256 * 1024,
      }),
      fetchBounded(`${BIOLOGIX_BASE_URL}/wp-json/`, {
        accept: "application/json",
        maxBytes: 8 * 1024 * 1024,
      }),
      Promise.all(["A", "AAAA", "NS", "MX"].map(dnsQuery)),
      Promise.all(publicAggregateProbes().map(([name, path]) =>
        probeAggregateEndpoint(name, path),
      )),
    ]);
  const wpRoot = JSON.parse(wpRootResult.text);
  let jetpack = null;
  try {
    const result = await fetchBounded(
      `${BIOLOGIX_BASE_URL}/wp-json/jetpack/v4/connection`,
      { accept: "application/json", maxBytes: 128 * 1024 },
    );
    if (result.response.ok) {
      const payload = JSON.parse(result.text);
      jetpack = {
        installed: true,
        active: Boolean(payload.isActive),
        registered: Boolean(payload.isRegistered),
        user_connected: Boolean(payload.isUserConnected),
        site_marked_public: Boolean(payload.isPublic),
      };
    }
  } catch {
    jetpack = { installed: true, visibility: "unavailable" };
  }

  return {
    captured_at: new Date().toISOString(),
    robots: {
      status: robotsResult.response.status,
      bytes: robotsResult.bytes,
      sitemap_declared: /^Sitemap:\s*(\S+)/im.test(robotsResult.text),
    },
    sitemap: await collectSitemapSignals(robotsResult.text),
    wordpress: {
      name: String(wpRoot.name ?? ""),
      description: String(wpRoot.description ?? ""),
      namespace_count: Array.isArray(wpRoot.namespaces)
        ? wpRoot.namespaces.length
        : 0,
      route_count:
        wpRoot.routes && typeof wpRoot.routes === "object"
          ? Object.keys(wpRoot.routes).length
          : 0,
      relevant_namespaces: relevantNamespaces(wpRoot.namespaces ?? []),
    },
    analytics_and_sales_endpoints: aggregateEndpoints,
    jetpack,
    dns: dnsResults,
    technology: homepage.technology,
    trackers: homepage.trackers,
    traffic_truth: {
      visitor_counts_publicly_available: false,
      reason:
        "Installed tools and tags can be detected publicly, but their visitor and revenue reports require authorization.",
    },
  };
}

export async function collectPublicSnapshot(previousState, trigger) {
  const started = Date.now();
  const parentUrl = freshPublicUrl(
    `${BIOLOGIX_BASE_URL}/wp-json/wc/store/v1/products?per_page=100&orderby=popularity&order=desc`,
    started,
  );
  const variationUrl = freshPublicUrl(
    `${BIOLOGIX_BASE_URL}/wp-json/wc/store/v1/products?per_page=100&type=variation`,
    started,
  );
  const wpProductUrl = freshPublicUrl(
    `${BIOLOGIX_BASE_URL}/wp-json/wp/v2/product?per_page=100&_fields=id,modified_gmt`,
    started,
  );
  const [parents, variations, wpProducts, homepage] = await Promise.all([
    fetchJsonCollection(parentUrl),
    fetchJsonCollection(variationUrl),
    fetchJsonCollection(wpProductUrl),
    quickHomepageProbe(),
  ]);

  const capturedAt = new Date().toISOString();
  const observations = buildObservations(
    parents.records,
    variations.records,
    wpProducts.records,
  );
  const inventory = inventorySummary(observations);
  const events = diffObservations(
    previousState?.latest_observations ?? {},
    observations,
    capturedAt,
  );
  const baskets = clusterProbableBaskets(
    events,
    previousState?.latest_snapshot?.captured_at,
    capturedAt,
  );
  const shouldDeepScan =
    safeDurationSince(previousState?.public_site_signals?.captured_at) === null ||
    safeDurationSince(previousState?.public_site_signals?.captured_at) >=
      DEEP_SCAN_INTERVAL_MS;
  let deepSignals = previousState?.public_site_signals ?? null;
  let deepScanError = null;
  if (shouldDeepScan) {
    try {
      deepSignals = await collectDeepSignals(homepage);
    } catch (error) {
      deepScanError = error.message;
    }
  }

  return {
    summary: {
      captured_at: capturedAt,
      trigger,
      duration_ms: Date.now() - started,
      parent_count: parents.records.length,
      variation_count: variations.records.length,
      ...inventory,
      public_catalog_sources: {
        products: parents.meta,
        variations: variations.meta,
        modification_times: wpProducts.meta,
      },
      homepage: {
        status: homepage.status,
        duration_ms: homepage.duration_ms,
        bytes: homepage.bytes,
        headers: homepage.headers,
        trackers: homepage.trackers,
      },
      event_count: events.length,
      probable_basket_count: baskets.length,
      deep_scan_performed: shouldDeepScan && deepScanError === null,
      deep_scan_error: deepScanError,
    },
    observations,
    events,
    baskets,
    publicSiteSignals: deepSignals,
  };
}
