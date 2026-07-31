import { BlobPreconditionFailedError, del, get, put } from "@vercel/blob";

import { collectObservatoryTarget } from "./observatory-collector.js";
import {
  CADENCES,
  OBSERVATORY_PREFIX,
  SNAPSHOT_RETENTION_DAYS,
  dateKey,
  sanitizePublicPayload,
  stableHash,
  validateCadence,
} from "./observatory-core.js";
import {
  OBSERVATORY_TARGETS,
  SHARD_COUNT,
  targetsForShard,
} from "./observatory-targets.js";

const DUE_MS = {
  daily: 20 * 60 * 60 * 1000,
  weekly: 6 * 24 * 60 * 60 * 1000,
  monthly: 27 * 24 * 60 * 60 * 1000,
};
const HEALTH_STALE_MS = {
  daily: 36 * 60 * 60 * 1000,
  weekly: 8 * 24 * 60 * 60 * 1000,
  monthly: 35 * 24 * 60 * 60 * 1000,
};
const MAX_RECENT_CHANGES = 300;

function statePath(cadence, shard) {
  return `${OBSERVATORY_PREFIX}/state/${cadence}/shard-${shard}.json`;
}

function immutableSnapshotPath(cadence, shard, capturedAt) {
  const runKey = capturedAt.replace(/[:.]/g, "-");
  const suffix = stableHash(`${cadence}|${shard}|${capturedAt}`).slice(0, 12);
  return `${OBSERVATORY_PREFIX}/snapshots/${cadence}/${dateKey(capturedAt)}/shard-${shard}-${runKey}-${suffix}.json`;
}

function validateShard(value) {
  const shard = Number.parseInt(value, 10);
  if (!Number.isInteger(shard) || shard < 0 || shard >= SHARD_COUNT) {
    throw new Error(`Invalid observatory shard: ${value}`);
  }
  return shard;
}

function newState(cadence, shard) {
  return {
    version: 1,
    cadence,
    shard,
    last_attempt_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    successful_runs: 0,
    failed_runs: 0,
    last_good: {},
    target_status: {},
    snapshot_refs: [],
    recent_changes: [],
  };
}

function normalizeEtag(etag) {
  return etag?.replace(/^W\//, "") ?? null;
}

async function readJson(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result) return { value: null, etag: null };
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob read failed for ${pathname}: ${result.statusCode}`);
  }
  return {
    value: JSON.parse(await new Response(result.stream).text()),
    etag: normalizeEtag(result.blob.etag),
  };
}

async function writeMutable(pathname, value, etag) {
  return put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    cacheControlMaxAge: 60,
    allowOverwrite: Boolean(etag),
    ...(etag ? { ifMatch: etag } : {}),
  });
}

async function writeImmutable(pathname, value) {
  return put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    cacheControlMaxAge: 60,
    allowOverwrite: false,
    addRandomSuffix: false,
  });
}

function elapsed(value, now) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;
}

function isDue(state, cadence, now) {
  const age = elapsed(state.last_attempt_at, now);
  return age === null || age >= DUE_MS[cadence];
}

function offerKey(offer) {
  return offer?.key ??
    offer?.public_variant_id ??
    offer?.public_product_id ??
    null;
}

function commerceOfferMaps(previousCommerce, currentCommerce) {
  const previousOffers = previousCommerce?.offers ?? [];
  const currentOffers = currentCommerce?.offers ?? [];
  const previousByKey = new Map(
    previousOffers.map((offer) => [offerKey(offer), offer]).filter(([key]) => key),
  );
  const currentByKey = new Map(
    currentOffers.map((offer) => [offerKey(offer), offer]).filter(([key]) => key),
  );
  const authoritative =
    currentCommerce?.catalog_complete === true ||
    currentCommerce?.catalog_adapter === "product_page";
  const observedKeys = new Set(
    currentCommerce?.observed_offer_keys ??
    [...currentByKey.keys()],
  );
  return {
    authoritative,
    currentByKey,
    observedKeys,
    previousByKey,
  };
}

function catalogOffersChanged(previousCommerce, currentCommerce) {
  const { authoritative, currentByKey, observedKeys, previousByKey } =
    commerceOfferMaps(previousCommerce, currentCommerce);
  const additions = [...observedKeys].some(
    (key) => currentByKey.has(key) && !previousByKey.has(key),
  );
  if (!authoritative) return additions;
  const removals = [...previousByKey.keys()].some(
    (key) => !currentByKey.has(key),
  );
  return additions || removals;
}

function sharedOfferFieldChanged(previousCommerce, currentCommerce, fields) {
  const { currentByKey, observedKeys, previousByKey } =
    commerceOfferMaps(previousCommerce, currentCommerce);
  return [...observedKeys].some((key) => {
    const previous = previousByKey.get(key);
    const current = currentByKey.get(key);
    if (!previous || !current) return false;
    return fields.some(
      (field) => (previous[field] ?? null) !== (current[field] ?? null),
    );
  });
}

function changeTypes(previous, current, cadence) {
  if (!previous) return [];
  const types = [];
  if (cadence === "daily") {
    if (catalogOffersChanged(previous.commerce, current.commerce)) {
      types.push("catalog_changed");
    }
    if (
      sharedOfferFieldChanged(
        previous.commerce,
        current.commerce,
        ["price", "list_price"],
      )
    ) {
      types.push("displayed_price_changed");
    }
    if (
      sharedOfferFieldChanged(
        previous.commerce,
        current.commerce,
        ["availability"],
      )
    ) {
      types.push("availability_changed");
    }
    if (
      current.commerce?.promotions_observed !== false &&
      JSON.stringify(previous.commerce?.promotions ?? []) !==
      JSON.stringify(current.commerce?.promotions ?? [])
    ) {
      types.push("promotion_changed");
    }
  }
  if (cadence === "weekly" && previous.marketing?.content_hash !== current.marketing?.content_hash) {
    types.push("marketing_surface_changed");
  }
  if (cadence === "monthly" && previous.trust?.homepage_hash !== current.trust?.homepage_hash) {
    types.push("trust_surface_changed");
  }
  return types;
}

function mergeCommerce(previous, current) {
  if (!current) return previous;
  const incoming =
    previous && current.promotions_observed === false
      ? {
          ...current,
          promotions: previous.promotions ?? [],
          promotions_retained_from_last_good: true,
        }
      : current;
  const authoritative =
    incoming.catalog_complete === true ||
    incoming.catalog_adapter === "product_page";
  if (!previous || authoritative) return incoming;

  const observedKeys = (incoming.offers ?? [])
    .map(offerKey)
    .filter(Boolean);
  const mergedOffers = new Map(
    (previous.offers ?? [])
      .map((offer) => [offerKey(offer), { ...offer, retained_from_last_good: true }])
      .filter(([key]) => key),
  );
  for (const offer of incoming.offers ?? []) {
    const key = offerKey(offer);
    if (key) mergedOffers.set(key, { ...offer, retained_from_last_good: false });
  }
  const offers = [...mergedOffers.values()]
    .sort((left, right) => String(offerKey(left)).localeCompare(String(offerKey(right))));
  return {
    ...previous,
    ...incoming,
    offers,
    catalog_complete: false,
    product_count: previous.product_count ?? current.product_count ?? null,
    observed_product_count: incoming.product_count ?? null,
    observed_offer_keys: observedKeys,
    retained_offer_count: offers.filter((offer) => offer.retained_from_last_good).length,
  };
}

function mergeSuccessfulTarget(previous, result) {
  const commerce = result.commerce
    ? mergeCommerce(previous?.commerce, result.commerce)
    : previous?.commerce;
  return {
    ...(previous ?? {}),
    target_id: result.target_id,
    display_name: result.display_name,
    domain: result.domain,
    cohort: result.cohort,
    cadence: result.cadence,
    last_observed_at: result.captured_at,
    last_result_status: result.status,
    stale: false,
    ...(commerce ? { commerce } : {}),
    ...(result.marketing ? { marketing: result.marketing } : {}),
    ...(result.trust ? { trust: result.trust } : {}),
  };
}

export function applyObservatoryRun(state, snapshot, snapshotPath) {
  const next = structuredClone(state);
  const changes = [];
  const usableResults = snapshot.results.filter(
    (result) => result.status !== "failed",
  );
  const failedResults = snapshot.results.filter(
    (result) => result.status === "failed",
  );
  for (const result of snapshot.results) {
    const previous = next.last_good[result.target_id] ?? null;
    next.target_status[result.target_id] = {
      status: result.status,
      observed_at: result.captured_at,
      error_count: result.errors?.length ?? 0,
    };
    if (result.status === "failed") {
      if (previous) {
        next.last_good[result.target_id] = {
          ...previous,
          stale: true,
          stale_since: previous.stale_since ?? result.captured_at,
        };
      }
      continue;
    }
    const current = mergeSuccessfulTarget(previous, result);
    next.last_good[result.target_id] = current;
    for (const type of changeTypes(previous, current, snapshot.cadence)) {
      changes.push({
        domain: result.domain,
        cadence: snapshot.cadence,
        type,
        observed_at: result.captured_at,
      });
    }
  }
  next.last_attempt_at = snapshot.captured_at;
  next.snapshot_refs = [...next.snapshot_refs, snapshotPath];
  next.recent_changes = [...next.recent_changes, ...changes].slice(-MAX_RECENT_CHANGES);
  if (usableResults.length === 0) {
    next.last_error_at = snapshot.captured_at;
    next.last_error = `All ${failedResults.length} observatory targets failed`;
    next.failed_runs += 1;
    return next;
  }
  next.last_success_at = snapshot.captured_at;
  next.successful_runs += 1;
  if (failedResults.length > 0) {
    next.last_error_at = snapshot.captured_at;
    next.last_error = `${failedResults.length} of ${snapshot.results.length} observatory targets failed`;
  } else {
    next.last_error = null;
  }
  return next;
}

export function partitionSnapshotRefs(
  refs,
  now,
  retentionDays = SNAPSHOT_RETENTION_DAYS,
) {
  const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);
  cutoff.setUTCHours(0, 0, 0, 0);
  const kept = [];
  const expired = [];
  for (const pathname of refs) {
    const key = pathname.match(/\/(\d{4}-\d{2}-\d{2})\//)?.[1];
    const timestamp = Date.parse(`${key ?? ""}T00:00:00.000Z`);
    if (Number.isFinite(timestamp) && timestamp < cutoff.getTime()) {
      expired.push(pathname);
    } else {
      kept.push(pathname);
    }
  }
  return { kept, expired };
}

function failedState(state, error, failedAt) {
  return {
    ...state,
    last_attempt_at: failedAt,
    last_error_at: failedAt,
    last_error: error instanceof Error ? error.message : String(error),
    failed_runs: state.failed_runs + 1,
  };
}

export async function runObservatoryShard(
  cadenceValue,
  shardValue,
  options = {},
) {
  const cadence = validateCadence(cadenceValue);
  const shard = validateShard(shardValue);
  const force = options.force === true;
  const now = options.now ?? Date.now();
  const pathname = statePath(cadence, shard);
  const loaded = await readJson(pathname);
  let state = loaded.value ?? newState(cadence, shard);
  let etag = loaded.etag;
  if (!force && !isDue(state, cadence, now)) {
    return {
      skipped: true,
      reason: "cadence_not_due",
      cadence,
      shard,
      last_attempt_at: state.last_attempt_at,
    };
  }

  const attemptedAt = new Date(now).toISOString();
  state = { ...state, last_attempt_at: attemptedAt };
  try {
    etag = (await writeMutable(pathname, state, etag)).etag;
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      return { skipped: true, reason: "concurrent_run_guard", cadence, shard };
    }
    throw error;
  }

  try {
    const targets = targetsForShard(shard);
    const settled = await Promise.allSettled(
      targets.map((target) =>
        (options.collector ?? collectObservatoryTarget)(target, cadence, {
          now: () => now,
        }),
      ),
    );
    const results = settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      const target = targets[index];
      return {
        target_id: target.id,
        display_name: target.name,
        domain: target.domain,
        cohort: target.cohort,
        shard,
        cadence,
        captured_at: attemptedAt,
        status: "failed",
        errors: [{ scope: "collector", message: result.reason?.message ?? String(result.reason) }],
        evidence: [],
      };
    });
    const snapshot = {
      schema_version: 1,
      captured_at: attemptedAt,
      trigger: options.trigger ?? "cron",
      cadence,
      shard,
      safety_boundary:
        "Public GET only. No accounts, forms, checkout submission, transactions, gate bypass, customer data, or evasion.",
      results,
    };
    const snapshotPath = immutableSnapshotPath(cadence, shard, attemptedAt);
    await writeImmutable(snapshotPath, snapshot);
    state = applyObservatoryRun(state, snapshot, snapshotPath);
    const retention = partitionSnapshotRefs(state.snapshot_refs, now);
    state.snapshot_refs = retention.kept;
    if (retention.expired.length) await del(retention.expired);
    await writeMutable(pathname, state, etag);
    return {
      skipped: false,
      cadence,
      shard,
      snapshot_path: snapshotPath,
      complete: results.filter((result) => result.status === "complete").length,
      partial: results.filter((result) => result.status === "partial").length,
      failed: results.filter((result) => result.status === "failed").length,
    };
  } catch (error) {
    try {
      await writeMutable(pathname, failedState(state, error, attemptedAt), etag);
    } catch {
      // Preserve the collection failure if a concurrent state update won.
    }
    throw error;
  }
}

export async function getObservatoryStates() {
  const records = await Promise.all(
    CADENCES.flatMap((cadence) =>
      Array.from({ length: SHARD_COUNT }, (_, shard) =>
        readJson(statePath(cadence, shard)).then((record) =>
          record.value ?? newState(cadence, shard),
        ),
      ),
    ),
  );
  return records;
}

export async function getPublicObservatory() {
  const states = await getObservatoryStates();
  return sanitizePublicPayload(OBSERVATORY_TARGETS, states);
}

export function summarizeObservatoryHealth(states, now = Date.now()) {
  const targetStatuses = states.flatMap((state) =>
    Object.values(state.target_status ?? {}),
  );
  const failedTargets = targetStatuses.filter(
    (target) => target.status === "failed",
  ).length;
  const partialTargets = targetStatuses.filter(
    (target) => target.status === "partial",
  ).length;
  const staleCompanies = states.flatMap((state) =>
    Object.values(state.last_good ?? {}),
  ).filter((company) => company.stale === true).length;
  const attemptedStates = states.filter((state) => state.last_attempt_at).length;
  const missingSuccessStates = states.filter(
    (state) => state.last_attempt_at && !state.last_success_at,
  ).length;
  const staleCadenceStates = states.filter((state) => {
    if (!state.last_success_at || !HEALTH_STALE_MS[state.cadence]) return false;
    const age = elapsed(state.last_success_at, now);
    return age !== null && age > HEALTH_STALE_MS[state.cadence];
  }).length;
  const expectedStates = CADENCES.length * SHARD_COUNT;
  const initialized =
    states.length === expectedStates && attemptedStates === expectedStates;
  const degraded =
    states.some((state) => state.last_error) ||
    failedTargets > 0 ||
    partialTargets > 0 ||
    staleCompanies > 0 ||
    missingSuccessStates > 0 ||
    staleCadenceStates > 0;
  return {
    status: !initialized ? "initializing" : degraded ? "degraded" : "healthy",
    target_count: OBSERVATORY_TARGETS.length,
    shard_count: SHARD_COUNT,
    cadence_state_count: states.length,
    expected_cadence_states: expectedStates,
    attempted_states: attemptedStates,
    missing_success_states: missingSuccessStates,
    stale_cadence_states: staleCadenceStates,
    failed_targets: failedTargets,
    partial_targets: partialTargets,
    stale_companies: staleCompanies,
    cadence_states: states.map((state) => ({
      cadence: state.cadence,
      shard: state.shard,
      last_attempt_at: state.last_attempt_at,
      last_success_at: state.last_success_at,
      last_error: state.last_error,
    })),
    collector: "public_get_only_no_customer_data",
    storage: "private_vercel_blob",
  };
}

export async function getObservatoryHealth() {
  return summarizeObservatoryHealth(await getObservatoryStates());
}

export async function getObservatoryLatest(cadenceValue, shardValue) {
  const cadence = validateCadence(cadenceValue);
  const shard = validateShard(shardValue);
  return (await readJson(statePath(cadence, shard))).value ?? newState(cadence, shard);
}

export async function getRawEvidence(pathname) {
  const safePattern = new RegExp(
    `^${OBSERVATORY_PREFIX}/snapshots/(daily|weekly|monthly)/\\d{4}-\\d{2}-\\d{2}/shard-[0-4]-[A-Za-z0-9-]+\\.json$`,
  );
  if (!safePattern.test(pathname)) throw new Error("Invalid raw snapshot path");
  const record = await readJson(pathname);
  if (!record.value) throw new Error("Raw snapshot not found");
  return record.value;
}
