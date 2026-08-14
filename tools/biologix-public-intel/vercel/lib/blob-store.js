import {
  BlobPreconditionFailedError,
  del,
  get,
  put,
} from "@vercel/blob";

import { collectPublicSnapshot } from "./collector.js";
import {
  applySnapshot,
  createDay,
  createState,
  healthForState,
  markAttempt,
  markFailure,
  reportFromDays,
  shouldSkipCron,
} from "./state.js";

const STATE_PATH = "biologix-intel/state.json";

export function normalizeBlobEtag(etag) {
  return etag?.replace(/^W\//, "") ?? null;
}

function dayPath(dateKey) {
  return `biologix-intel/days/${dateKey}.json`;
}

async function readJson(pathname) {
  const result = await get(pathname, {
    access: "private",
    useCache: false,
  });
  if (!result) return { value: null, etag: null };
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob read failed for ${pathname}: ${result.statusCode}`);
  }
  return {
    value: JSON.parse(await new Response(result.stream).text()),
    etag: normalizeBlobEtag(result.blob.etag),
  };
}

async function writeJson(pathname, value, etag) {
  return put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    cacheControlMaxAge: 60,
    allowOverwrite: Boolean(etag),
    ...(etag ? { ifMatch: etag } : {}),
  });
}

async function loadState() {
  const record = await readJson(STATE_PATH);
  return {
    state: record.value ?? createState(),
    etag: record.etag,
  };
}

export async function getHealth() {
  const { state } = await loadState();
  return healthForState(state);
}

export async function getLatest() {
  const { state } = await loadState();
  return {
    health: healthForState(state),
    snapshot: state.latest_snapshot,
    public_site_signals: state.public_site_signals,
  };
}

export async function getReport(hours = 24) {
  const { state } = await loadState();
  const parsed = Number.parseInt(hours ?? "24", 10);
  const clampedHours = Number.isFinite(parsed)
    ? Math.min(120 * 24, Math.max(1, parsed))
    : 24;
  const cutoff = Date.now() - clampedHours * 60 * 60 * 1000;
  const dayKeys = state.day_keys.filter(
    (key) => Date.parse(`${key}T23:59:59.999Z`) >= cutoff,
  );
  const days = (
    await Promise.all(dayKeys.map(async (key) => (await readJson(dayPath(key))).value))
  ).filter(Boolean);
  return reportFromDays(days, state, clampedHours);
}

export async function runSnapshot(trigger = "cron") {
  const loaded = await loadState();
  let state = loaded.state;
  let stateEtag = loaded.etag;
  if (trigger === "cron" && shouldSkipCron(state)) {
    return {
      skipped: true,
      reason: "duplicate_trigger_guard",
      ...healthForState(state),
    };
  }

  const attemptedAt = new Date().toISOString();
  state = markAttempt(state, attemptedAt);
  try {
    stateEtag = (await writeJson(STATE_PATH, state, stateEtag)).etag;
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      return {
        skipped: true,
        reason: "concurrent_run_guard",
        ...(await getHealth()),
      };
    }
    throw error;
  }

  try {
    const result = await collectPublicSnapshot(state, trigger);
    const dateKey = result.summary.captured_at.slice(0, 10);
    const dayRecord = await readJson(dayPath(dateKey));
    const applied = applySnapshot(
      state,
      dayRecord.value ?? createDay(dateKey),
      result,
    );
    await writeJson(dayPath(dateKey), applied.day, dayRecord.etag);
    await writeJson(STATE_PATH, applied.state, stateEtag);
    if (applied.expiredDayKeys.length) {
      await del(applied.expiredDayKeys.map(dayPath));
    }
    return {
      skipped: false,
      snapshot: result.summary,
      probable_baskets: result.baskets,
    };
  } catch (error) {
    const failedState = markFailure(state, error, new Date().toISOString());
    try {
      await writeJson(STATE_PATH, failedState, stateEtag);
    } catch {
      // Preserve the original collection error if another invocation won the race.
    }
    throw error;
  }
}
