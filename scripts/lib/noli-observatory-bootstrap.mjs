import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCandidateSnapshot } from "./noli-observatory-core.mjs";

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function readGeneratedPayload(pathname) {
  const source = await readFile(pathname, "utf8");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`No generated JSON payload in ${pathname}`);
  return JSON.parse(source.slice(start, end + 1));
}

function coverageFromAudit(audit) {
  const value = String(audit?.catalog?.coverage || "");
  if (/^complete_/.test(value) || value === "complete_public_catalog") return "complete";
  if (/partial/i.test(value)) return "partial";
  return "unknown";
}

/**
 * Converts the prior point-in-time catalog census into a labeled baseline.
 * This creates no historical events; it only gives page-only and temporarily
 * unreachable stores an honest last-good value on the first live refresh.
 */
export async function loadObservatoryBootstrap({ researchDirectory, registry }) {
  const intelligencePath = path.join(
    researchDirectory,
    "noli-competitor-intelligence-data.js",
  );
  const intelligence = await readGeneratedPayload(intelligencePath).catch(() => ({ audits: {} }));
  const observations = [];
  const capturedTimes = [];

  for (const target of registry.targets) {
    const shardPath = path.join(
      researchDirectory,
      "noli-competitor-catalogs",
      `${target.domain}.json`,
    );
    const shard = await readJson(shardPath).catch(() => null);
    if (!shard?.offers?.length) {
      observations.push({
        domain: target.domain,
        catalog: {
          status: "unknown",
          coverage: "unknown",
          offers: [],
          observedAt: null,
          error: "No prior public catalog shard",
        },
        storefront: { status: "unknown" },
      });
      continue;
    }
    const observedAt = shard.capturedAt || shard.generatedAt;
    if (observedAt) capturedTimes.push(observedAt);
    observations.push({
      domain: target.domain,
      catalog: {
        status: "observed",
        coverage: coverageFromAudit(intelligence.audits?.[target.domain]),
        offers: shard.offers,
        sourceUrls: [...new Set(shard.offers.map(({ sourceUrl }) => sourceUrl).filter(Boolean))],
        observedAt,
        adapter: target.catalogAdapter,
        caveat:
          "Prior anonymous public catalog census imported as the observatory baseline. It is a point-in-time observation, not current inventory or sales.",
      },
      storefront: { status: "unknown" },
    });
  }

  const capturedAt = capturedTimes.sort().at(-1) || new Date().toISOString();
  const snapshot = createCandidateSnapshot({
    capturedAt,
    registry,
    observations,
  });
  return {
    ...snapshot,
    snapshotId: `bootstrap-${snapshot.snapshotId}`,
    bootstrap: true,
    summary: {
      ...snapshot.summary,
      caveat:
        "This baseline is imported from the prior public census. The first live snapshot establishes current freshness; no changes before that live comparison are invented.",
    },
  };
}
