import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBlobEtag } from "../lib/blob-store.js";
import { hasBearerToken } from "../lib/http.js";
import {
  applySnapshot,
  createDay,
  createState,
  healthForState,
  shouldSkipCron,
} from "../lib/state.js";

test("existing health becomes current after a successful snapshot", () => {
  const capturedAt = "2026-07-25T01:00:00.000Z";
  const applied = applySnapshot(createState(), createDay("2026-07-25"), {
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
  assert.equal(health.infrastructure, "vercel_cron_private_blob");
});

test("existing cron guard and bearer authentication remain intact", () => {
  const state = {
    ...createState(),
    last_attempt_at: "2026-07-25T01:00:00.000Z",
  };
  assert.equal(shouldSkipCron(state, Date.parse("2026-07-25T01:03:00.000Z")), true);
  assert.equal(shouldSkipCron(state, Date.parse("2026-07-25T01:05:00.000Z")), false);
  assert.equal(
    hasBearerToken({ headers: { authorization: "Bearer secret" } }, "secret"),
    true,
  );
  assert.equal(
    hasBearerToken({ headers: { authorization: "Bearer wrong" } }, "secret"),
    false,
  );
});

test("existing weak Blob ETags normalize for conditional writes", () => {
  assert.equal(normalizeBlobEtag('W/"etag"'), '"etag"');
  assert.equal(normalizeBlobEtag('"strong"'), '"strong"');
});
