import {
  POLL_INTERVAL_MINUTES,
  RETENTION_DAYS,
  aggregateReport,
  compactObservationMap,
  safeDurationSince,
} from "./biologix-intel-core.js";

const MAX_DAILY_EVENTS = 300;

export function createState() {
  return {
    version: 1,
    day_keys: [],
    latest_snapshot: null,
    latest_observations: {},
    public_site_signals: null,
    last_attempt_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    successful_runs: 0,
    failed_runs: 0,
  };
}

export function createDay(date) {
  return {
    date,
    snapshots: [],
    events: [],
    baskets: [],
    events_truncated: 0,
  };
}

export function healthForState(state, now = Date.now()) {
  const lastSuccessAge = safeDurationSince(state.last_success_at, now);
  const healthy =
    lastSuccessAge !== null &&
    lastSuccessAge <= (POLL_INTERVAL_MINUTES + 10) * 60_000 &&
    !state.last_error;

  return {
    status:
      state.last_success_at === null
        ? "awaiting_first_run"
        : healthy
          ? "healthy"
          : "degraded",
    cadence_minutes: POLL_INTERVAL_MINUTES,
    last_attempt_at: state.last_attempt_at,
    last_success_at: state.last_success_at,
    last_success_age_seconds:
      lastSuccessAge === null ? null : Math.floor(lastSuccessAge / 1000),
    last_error_at: state.last_error_at,
    last_error: state.last_error,
    successful_runs: state.successful_runs,
    failed_runs: state.failed_runs,
    retention_days: RETENTION_DAYS,
    collector: "public_get_only_no_customer_data",
    infrastructure: "vercel_cron_private_blob",
  };
}

export function shouldSkipCron(state, now = Date.now()) {
  const age = safeDurationSince(state.last_attempt_at, now);
  return age !== null && age < 4 * 60_000;
}

export function markAttempt(state, attemptedAt) {
  return {
    ...state,
    last_attempt_at: attemptedAt,
  };
}

export function applySnapshot(state, day, result) {
  const nextDay = structuredClone(day);
  nextDay.snapshots.push(result.summary);
  nextDay.events.push(...result.events);
  nextDay.baskets.push(...result.baskets);
  if (nextDay.events.length > MAX_DAILY_EVENTS) {
    const overflow = nextDay.events.length - MAX_DAILY_EVENTS;
    nextDay.events.splice(0, overflow);
    nextDay.events_truncated += overflow;
  }

  const dateKey = result.summary.captured_at.slice(0, 10);
  const dayKeys = [...new Set([...state.day_keys, dateKey])].sort();
  const expiredDayKeys = dayKeys.splice(
    0,
    Math.max(0, dayKeys.length - RETENTION_DAYS),
  );
  const nextState = {
    ...state,
    day_keys: dayKeys,
    latest_snapshot: result.summary,
    latest_observations: compactObservationMap(result.observations),
    public_site_signals: result.publicSiteSignals,
    last_success_at: result.summary.captured_at,
    last_error: null,
    successful_runs: state.successful_runs + 1,
  };

  return { state: nextState, day: nextDay, expiredDayKeys };
}

export function markFailure(state, error, failedAt) {
  return {
    ...state,
    last_error_at: failedAt,
    last_error: error instanceof Error ? error.message : String(error),
    failed_runs: state.failed_runs + 1,
  };
}

export function reportFromDays(days, state, hours, now = Date.now()) {
  const parsed = Number.parseInt(hours ?? "24", 10);
  const clampedHours = Number.isFinite(parsed)
    ? Math.min(RETENTION_DAYS * 24, Math.max(1, parsed))
    : 24;
  const since = new Date(now - clampedHours * 60 * 60 * 1000);
  return {
    health: healthForState(state, now),
    ...aggregateReport(days, state, since.toISOString()),
  };
}
