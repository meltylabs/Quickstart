import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const RESEARCH = new URL("../biologix-strategy-board/research/", import.meta.url);
const ARCHIVE = new URL("noli-research-archive-2026-07-27/", RESEARCH);
const MANIFEST = new URL("manifest.json", ARCHIVE);
const README = new URL("README.md", ARCHIVE);
const PAGE = new URL("operating-blueprint.html", RESEARCH);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some(Boolean));
}

function dangerousSpreadsheetCell(value) {
  const text = String(value || "");
  const trimmed = text.trimStart();
  if (/^[\t\r]/.test(text) || /^[=+@]/.test(trimmed)) return true;
  return /^-/.test(trimmed) && !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed);
}

test("archive manifest preserves every raw input and major published output by checksum", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.snapshotDate, "2026-07-28");
  assert.equal(manifest.rawInputs.length, 21);
  assert.equal(manifest.supportingEvidence.length, 2);
  assert.equal(manifest.publishedOutputs.length, 13);
  assert.equal(manifest.archiveDocuments.length, 11);
  assert.equal(manifest.rollups.domainsInCommercialDataset, 130);
  assert.equal(manifest.rollups.normalizedCatalogOffers, 13_310);
  assert.equal(manifest.rollups.retatrutideOffers, 513);
  assert.equal(manifest.rollups.trafficModeledDomains, 56);
  assert.equal(manifest.rollups.marketing.companies, 18);
  assert.equal(manifest.rollups.marketing.verifiedAdsObserved, 4);
  assert.match(manifest.modelBoundaries.grossCheckout, /not measured revenue or profit/i);

  for (const entry of [
    ...manifest.rawInputs,
    ...manifest.supportingEvidence,
    ...manifest.publishedOutputs,
    ...manifest.archiveDocuments,
  ]) {
    const url = new URL(entry.path, ARCHIVE);
    const [buffer, metadata] = await Promise.all([readFile(url), stat(url)]);
    assert.equal(metadata.size, entry.bytes, entry.path);
    assert.equal(sha256(buffer), entry.sha256, entry.path);
  }
});

test("archive retains reconstruction record counts without screenshots, secrets, or spreadsheet payloads", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const records = Object.fromEntries(
    manifest.rawInputs.map((entry) => [entry.path, entry.records]),
  );
  assert.equal(records["noli-traffic-revenue-all-2026-07-27.csv"], 112);
  assert.equal(records["noli-traffic-revenue-wave-a-2026-07-27.csv"], 36);
  assert.equal(records["noli-traffic-revenue-wave-b-2026-07-27.csv"], 36);
  assert.equal(records["noli-traffic-revenue-wave-c-2026-07-27.csv"], 40);
  assert.equal(records["noli-catalog-wave-a-2026-07-27.csv"], 2_653);
  assert.equal(records["noli-catalog-wave-b-2026-07-27.csv"], 4_620);
  assert.equal(records["noli-catalog-wave-c-2026-07-27.csv"], 3_262);
  assert.equal(records["noli-catalog-supplemental-2026-07-27.csv"], 194);
  assert.equal(records["noli-ui-score-wave-a-2026-07-27.json"], 36);
  assert.equal(records["noli-ui-score-wave-b-2026-07-27.json"], 36);
  assert.equal(records["noli-ui-score-wave-c-2026-07-27.json"], 40);
  assert.equal(records["noli-vendor-ui-capture-manifest-2026-07-27.json"], 112);

  for (const entry of [...manifest.rawInputs, ...manifest.supportingEvidence]) {
    assert.doesNotMatch(entry.path, /\.(?:png|jpe?g|gif|webp|html?)$/i);
    const source = await readFile(new URL(entry.path, ARCHIVE), "utf8");
    assert.doesNotMatch(source, /\/Users\/|ghp_|github_pat_|Bearer\s+[A-Za-z0-9]|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY/);
    if (entry.path.endsWith(".csv")) {
      const [, ...rows] = parseCsv(source);
      assert.equal(
        rows.flat().filter(dangerousSpreadsheetCell).length,
        0,
        `${entry.path} contains a spreadsheet-formula prefix`,
      );
    }
  }
});

test("central page links the durable archive and can rank companies by modeled gross checkout", async () => {
  const [page, readme] = await Promise.all([
    readFile(PAGE, "utf8"),
    readFile(README, "utf8"),
  ]);
  assert.match(page, /noli-research-archive-2026-07-27\/README\.md/);
  assert.match(page, /noli-research-archive-2026-07-27\/manifest\.json/);
  assert.match(page, /Raw traffic and gross-checkout model inputs/);
  assert.match(page, /option value="gmv">Modeled gross checkout/);
  assert.match(readme, /not profit and is not an audited settlement/i);
  assert.match(readme, /Rebuild the normalized intelligence/);
});
