import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const RESEARCH = new URL("../biologix-strategy-board/research/", import.meta.url);

async function source(name) {
  return readFile(new URL(name, RESEARCH), "utf8");
}

async function loadDataset() {
  const context = { window: {} };
  vm.runInNewContext(await source("competitor-observatory-data.js"), context);
  return context.window.NOLI_COMPETITOR_OBSERVATORY;
}

test("observatory fallback contains the exact fixed cohort and valid evidence states", async () => {
  const data = await loadDataset();
  const states = new Set(["Verified", "Observed", "Estimated", "Unknown"]);
  const domains = data.companies.map(({ domain }) => domain);

  assert.equal(data.companies.length, 25);
  assert.equal(new Set(domains).size, 25);
  assert.ok(data.companies.every(({ evidence }) => Array.isArray(evidence) && evidence.length));
  assert.ok(
    data.companies.every(({ evidence }) =>
      evidence.every(
        ({ state, url }) => states.has(state) && /^(?:https?:\/\/|\.\/)/.test(url),
      ),
    ),
  );
  assert.ok(
    data.changes.every(
      ({ observedAt, sourceUrl, state }) =>
        observedAt && /^https?:\/\//.test(sourceUrl) && states.has(state),
    ),
  );
});

test("compact page is linked from the central blueprint and has a static fallback", async () => {
  const [html, css, script, blueprint] = await Promise.all([
    source("competitor-observatory.html"),
    source("competitor-observatory.css"),
    source("competitor-observatory.js"),
    source("operating-blueprint.html"),
  ]);

  assert.match(html, /competitor-observatory-data\.js/);
  assert.match(html, /competitor-observatory\.js/);
  assert.match(html, /Show all 25/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="method"/);
  assert.match(blueprint, /href="\.\/competitor-observatory\.html"/);
  assert.match(blueprint, /Twenty-five companies\. One current change feed\./);
  assert.match(script, /biologix-public-intel\.vercel\.app\/api\/public\/observatory/);
  assert.match(script, /sourceMode = "static"/);
  assert.match(script, /rel="noopener noreferrer"/);
  assert.match(script, /URLSearchParams/);
  assert.match(script, /HTMLDetailsElement/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("live data is rejected unless all 25 approved domains are present", async () => {
  const script = await source("competitor-observatory.js");
  assert.match(script, /EXPECTED_DOMAINS/);
  assert.match(script, /candidate\.companies\.length !== EXPECTED_DOMAINS\.length/);
  assert.match(script, /new Set\(domains\)\.size !== EXPECTED_DOMAINS\.length/);
  assert.match(script, /Live cohort mismatch/);
  assert.match(script, /controller\.abort\(\)/);
});

test("unknown live sections preserve the researched static baseline", async () => {
  const script = await source("competitor-observatory.js");
  for (const section of [
    "domainCreated",
    "platform",
    "catalog",
    "reta",
    "traffic",
    "ui",
    "checkout",
    "marketing",
  ]) {
    assert.match(
      script,
      new RegExp(`${section}: ${section}State === "Unknown" \\? base\\.${section}`),
    );
  }
  assert.match(script, /live\?\.history/);
  assert.match(script, /\.\.\.base\.history/);
});
