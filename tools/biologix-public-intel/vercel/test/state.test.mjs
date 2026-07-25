import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBlobEtag } from "../lib/blob-store.js";
import {
  applySnapshot,
  createDay,
  createState,
  healthForState,
  shouldSkipCron,
} from "../lib/state.js";
import { hasBearerToken } from "../lib/http.js";

test("health becomes current after a successful snapshot", () => {
  const state = createState();
  const capturedAt = "2026-07-25T01:00:00.000Z";
  const applied = applySnapshot(state, createDay("2026-07-25"), {
    summary: { captured_at: capturedAt, trigger: "cron" },
    observations: [],
    events: [],
    baskets: [],
    publicSiteSignals: null,
  });
  const health = healthForState(
    applied.state,
    Date.parse("2026-07-25T01:01:00.000Z"),
  );
  assert.equal(health.status, "healthy");
  assert.equal(health.successful_runs, 1);
  assert.equal(health.infrastructure, "vercel_cron_private_blob");
});

test("cron duplicate guard only skips recent attempts", () => {
  const recent = {
    ...createState(),
    last_attempt_at: "2026-07-25T01:00:00.000Z",
  };
  assert.equal(
    shouldSkipCron(recent, Date.parse("2026-07-25T01:03:00.000Z")),
    true,
  );
  assert.equal(
    shouldSkipCron(recent, Date.parse("2026-07-25T01:05:00.000Z")),
    false,
  );
});

test("bearer authentication accepts Vercel's Node request headers", () => {
  assert.equal(
    hasBearerToken({ headers: { authorization: "Bearer secret" } }, "secret"),
    true,
  );
  assert.equal(
    hasBearerToken({ headers: { authorization: "Bearer wrong" } }, "secret"),
    false,
  );
});

test("weak Blob read ETags normalize for conditional writes", () => {
  assert.equal(
    normalizeBlobEtag('W/"d41cd3df8fc9aba147758c3dd2d42c1c"'),
    '"d41cd3df8fc9aba147758c3dd2d42c1c"',
  );
  assert.equal(normalizeBlobEtag('"strong"'), '"strong"');
  assert.equal(normalizeBlobEtag(null), null);
});
