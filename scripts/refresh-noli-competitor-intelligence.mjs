#!/usr/bin/env node

import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const dryRun = args.includes("--dry-run");
const liveFeedOfferFloors = new Map([
  ["northlinelabs.org", 50],
  ["bluumpeptides.com", 60],
  ["ameanopeptides.com", 60],
  ["nexaph.com", 45],
  ["ionpeptide.com", 130],
  ["verifiedpeptides.com", 50],
  ["primelabpeptides.com", 25],
  ["modernaminos.com", 160],
  ["peptidecrafters.com", 55],
  ["biotechpeptides.com", 70],
  ["purerawz.co", 1_200],
  ["oathresearch.com", 65],
  ["certified-pep.com", 60],
]);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const researchDirectory = path.resolve(
  valueFor("--research-dir") ||
    path.join(repositoryRoot, "biologix-strategy-board/research"),
);
const archiveDirectory = path.resolve(
  valueFor("--archive-dir") ||
    path.join(researchDirectory, "noli-research-archive-2026-07-27"),
);

const baseTraffic = path.join(archiveDirectory, "noli-traffic-revenue-all-2026-07-27.json");
const baseCatalogs = [
  "noli-catalog-wave-a-2026-07-27.csv",
  "noli-catalog-wave-b-2026-07-27.csv",
  "noli-catalog-wave-c-2026-07-27.csv",
  "noli-catalog-supplemental-2026-07-27.csv",
].map((file) => path.join(archiveDirectory, file));
const baseSummaries = [
  "noli-catalog-summary-wave-a-2026-07-27.csv",
  "noli-catalog-summary-wave-b-2026-07-27.csv",
  "noli-catalog-summary-wave-c-2026-07-27.csv",
  "noli-catalog-summary-supplemental-2026-07-27.csv",
].map((file) => path.join(archiveDirectory, file));
const uiInputs = [
  "noli-ui-score-wave-a-2026-07-27.json",
  "noli-ui-score-wave-b-2026-07-27.json",
  "noli-ui-score-wave-c-2026-07-27.json",
].map((file) => path.join(archiveDirectory, file));

function run(script, scriptArgs) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 12 * 60 * 1_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} exited ${result.status}`);
  }
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
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
  if (!rows.length) return [];
  const headers = rows.shift();
  return rows
    .filter((candidate) => candidate.some(Boolean))
    .map((candidate) =>
      Object.fromEntries(headers.map((header, index) => [header, candidate[index] || ""]))
    );
}

function assertCaptureQuality(traffic, offers, summaries) {
  const modeled = (traffic.rows || []).filter((row) => row.traffic_basis_visits_model).length;
  const complete = summaries.filter((row) => /^complete_/.test(row.coverage)).length;
  const summaryByDomain = new Map(summaries.map((row) => [row.domain, row]));
  const trafficByDomain = new Map((traffic.rows || []).map((row) => [row.domain, row]));
  if ((traffic.rows || []).length !== 18) {
    throw new Error(`Refresh rejected: expected 18 priority traffic rows, got ${traffic.rows?.length || 0}`);
  }
  if (summaryByDomain.size !== 18) {
    throw new Error(`Refresh rejected: expected 18 unique catalog summaries, got ${summaryByDomain.size}`);
  }
  if (modeled < 14) {
    throw new Error(`Refresh rejected: only ${modeled} traffic models passed`);
  }
  if (complete < 10) {
    throw new Error(`Refresh rejected: only ${complete} complete live catalogs passed`);
  }
  if (offers.length < 2_100) {
    throw new Error(`Refresh rejected: only ${offers.length} main-company offers passed`);
  }
  for (const [domain, minimumOffers] of liveFeedOfferFloors) {
    const summary = summaryByDomain.get(domain);
    const domainOffers = offers.filter((row) => row.domain === domain);
    const pricedOffers = domainOffers.filter((row) => Number(row.current_price) > 0);
    if (!summary || !/^complete_public_(woo|shopify)/.test(summary.coverage)) {
      throw new Error(`Refresh rejected: ${domain} did not return a complete public live feed`);
    }
    if (domainOffers.length < minimumOffers) {
      throw new Error(`Refresh rejected: ${domain} returned only ${domainOffers.length} offers`);
    }
    const minimumPricedRatio = ["northlinelabs.org", "bluumpeptides.com"].includes(domain)
      ? 0.8
      : 0.5;
    if (pricedOffers.length / domainOffers.length < minimumPricedRatio) {
      throw new Error(`Refresh rejected: ${domain} returned too few usable prices`);
    }
    if (
      ["northlinelabs.org", "bluumpeptides.com"].includes(domain) &&
      !trafficByDomain.get(domain)?.traffic_basis_visits_model
    ) {
      throw new Error(`Refresh rejected: ${domain} did not return a usable traffic model`);
    }
    if (summary.captured_at !== traffic.summary?.captured_at) {
      throw new Error(`Refresh rejected: ${domain} freshness timestamp did not match this pull`);
    }
  }
}

function parsePayload(source) {
  return JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf(";")));
}

function assertBuildQuality(payload, previousPayload = null) {
  const stats = payload.stats || {};
  if (stats.domainsInCommercialDataset < 130) {
    throw new Error(`Build rejected: only ${stats.domainsInCommercialDataset || 0} competitor records`);
  }
  if (stats.mainCompanyAdditions !== 16) {
    throw new Error(`Build rejected: expected 16 main-company additions, got ${stats.mainCompanyAdditions || 0}`);
  }
  if (stats.normalizedCatalogOffers < 12_000) {
    throw new Error(`Build rejected: only ${stats.normalizedCatalogOffers || 0} normalized offers`);
  }
  if (stats.retatrutideOffers < 480) {
    throw new Error(`Build rejected: only ${stats.retatrutideOffers || 0} Reta offers`);
  }
  if (stats.liveRefreshedCatalogs !== liveFeedOfferFloors.size) {
    throw new Error(
      `Build rejected: expected ${liveFeedOfferFloors.size} live price feeds, got ${stats.liveRefreshedCatalogs || 0}`,
    );
  }
  for (const [domain, minimumOffers] of liveFeedOfferFloors) {
    const catalog = payload.audits?.[domain]?.catalog;
    if (
      catalog?.refreshMode !== "live" ||
      catalog.variantCount < minimumOffers
    ) {
      throw new Error(`Build rejected: ${domain} priority catalog failed its live-feed floor`);
    }
    if (
      ["northlinelabs.org", "bluumpeptides.com"].includes(domain) &&
      catalog.retaVariantCount < 5
    ) {
      throw new Error(`Build rejected: ${domain} returned fewer than five Reta offers`);
    }
    const previous = previousPayload?.audits?.[domain]?.catalog;
    if (previous?.variantCount > 0) {
      const countRatio = catalog.variantCount / previous.variantCount;
      const minimumRatio = ["northlinelabs.org", "bluumpeptides.com"].includes(domain)
        ? 0.5
        : 0.35;
      const maximumRatio = ["northlinelabs.org", "bluumpeptides.com"].includes(domain)
        ? 2
        : 3;
      if (countRatio < minimumRatio || countRatio > maximumRatio) {
        throw new Error(`Build rejected: ${domain} offer count exceeded its drift guard`);
      }
    }
    if (previous?.priceMedian > 0 && catalog.priceMedian > 0) {
      const priceRatio = catalog.priceMedian / previous.priceMedian;
      if (priceRatio < 0.5 || priceRatio > 2) {
        throw new Error(`Build rejected: ${domain} median price drifted beyond the 0.5×–2× guard`);
      }
    }
  }
  if (
    previousPayload?.capturedAt &&
    Date.parse(payload.capturedAt) <= Date.parse(previousPayload.capturedAt)
  ) {
    throw new Error("Build rejected: the candidate snapshot is not newer than the published snapshot");
  }
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "noli-competitor-refresh-"));
const temporaryArchive = path.join(temporaryRoot, "archive");
const temporaryOutput = path.join(temporaryRoot, "research");

try {
  await Promise.all([
    mkdir(temporaryArchive, { recursive: true }),
    mkdir(temporaryOutput, { recursive: true }),
  ]);

  run(
    path.join(import.meta.dirname, "collect-noli-main-company-gap.mjs"),
    [temporaryArchive],
  );

  const refreshedTrafficPath = path.join(
    temporaryArchive,
    "noli-traffic-revenue-main-company-gap-2026-07-28.json",
  );
  const refreshedCatalogPath = path.join(
    temporaryArchive,
    "noli-catalog-main-company-gap-2026-07-28.csv",
  );
  const refreshedSummaryPath = path.join(
    temporaryArchive,
    "noli-catalog-summary-main-company-gap-2026-07-28.csv",
  );
  const [traffic, offerRows, summaryRows] = await Promise.all([
    readFile(refreshedTrafficPath, "utf8").then(JSON.parse),
    readFile(refreshedCatalogPath, "utf8").then(parseCsv),
    readFile(refreshedSummaryPath, "utf8").then(parseCsv),
  ]);
  assertCaptureQuality(traffic, offerRows, summaryRows);

  const buildArguments = [
    "--traffic",
    baseTraffic,
    "--traffic",
    refreshedTrafficPath,
    ...baseCatalogs.flatMap((file) => ["--catalog", file]),
    "--catalog-refresh",
    refreshedCatalogPath,
    ...baseSummaries.flatMap((file) => ["--catalog-summary", file]),
    "--catalog-summary-refresh",
    refreshedSummaryPath,
    ...uiInputs.flatMap((file) => ["--ui", file]),
    "--out-dir",
    temporaryOutput,
  ];
  run(
    path.join(import.meta.dirname, "build-noli-competitor-intelligence.mjs"),
    buildArguments,
  );

  const payload = parsePayload(
    await readFile(
      path.join(temporaryOutput, "noli-competitor-intelligence-data.js"),
      "utf8",
    ),
  );
  const previousPayload = await readFile(
    path.join(researchDirectory, "noli-competitor-intelligence-data.js"),
    "utf8",
  ).then(parsePayload).catch(() => null);
  assertBuildQuality(payload, previousPayload);

  if (!dryRun) {
    const snapshotRoot = path.join(
      researchDirectory,
      "noli-competitor-snapshots",
    );
    await mkdir(snapshotRoot, { recursive: true });
    const snapshotVersion = String(payload.capturedAt).replace(/[-:.]/g, "");
    if (!/^\d{8}T\d{9}Z$/.test(snapshotVersion)) {
      throw new Error(`Refusing unsafe snapshot version ${snapshotVersion}`);
    }
    const publishStage = await mkdtemp(path.join(snapshotRoot, ".stage-"));
    const publishedSnapshot = path.join(snapshotRoot, snapshotVersion);
    const supportingOutputFiles = [
      "noli-competitor-intelligence-2026-07-27.csv",
      "noli-competitor-catalog-2026-07-27.csv",
      "noli-competitor-catalog-2026-07-27.json",
    ];
    const payloadFile = "noli-competitor-intelligence-data.js";
    const relativeSnapshotRoot = `./noli-competitor-snapshots/${snapshotVersion}`;
    payload.snapshotVersion = snapshotVersion;
    payload.catalogShardBasePath = `${relativeSnapshotRoot}/catalogs`;
    payload.catalogExportPath =
      `${relativeSnapshotRoot}/noli-competitor-catalog-2026-07-27.csv`;
    payload.catalogJsonPath =
      `${relativeSnapshotRoot}/noli-competitor-catalog-2026-07-27.json`;
    payload.commercialExportPath =
      `${relativeSnapshotRoot}/noli-competitor-intelligence-2026-07-27.csv`;
    const pointerStage = path.join(
      researchDirectory,
      `.noli-competitor-data-${snapshotVersion}-${process.pid}.tmp`,
    );
    let snapshotPromoted = false;
    let pointerPromoted = false;
    try {
      await Promise.all([
        ...supportingOutputFiles.map((file) =>
          cp(path.join(temporaryOutput, file), path.join(publishStage, file), {
            errorOnExist: true,
            force: false,
          })
        ),
        cp(
          path.join(temporaryOutput, "noli-competitor-catalogs"),
          path.join(publishStage, "catalogs"),
          { recursive: true, errorOnExist: true, force: false },
        ),
      ]);
      const serializedPayload =
        `window.NOLI_COMPETITOR_INTELLIGENCE = ${JSON.stringify(payload)};\n`;
      await Promise.all([
        writeFile(path.join(publishStage, payloadFile), serializedPayload, {
          flag: "wx",
        }),
        writeFile(pointerStage, serializedPayload, { flag: "wx" }),
      ]);
      await rename(publishStage, publishedSnapshot);
      snapshotPromoted = true;
      // This one same-filesystem rename is the only live commit point. The old
      // payload continues pointing at its intact snapshot until this succeeds.
      await rename(
        pointerStage,
        path.join(researchDirectory, payloadFile),
      );
      pointerPromoted = true;
    } finally {
      await rm(publishStage, { recursive: true, force: true });
      await rm(pointerStage, { force: true });
      if (snapshotPromoted && !pointerPromoted) {
        await rm(publishedSnapshot, { recursive: true, force: true });
      }
    }

    // Keep the current and three prior immutable snapshots for browser tabs
    // opened during a refresh. Cleanup failure never invalidates publication.
    await readdir(snapshotRoot, { withFileTypes: true }).then((entries) =>
      entries
        .filter((entry) =>
          entry.isDirectory() && /^\d{8}T\d{9}Z$/.test(entry.name)
        )
        .map((entry) => entry.name)
        .sort()
        .reverse()
        .slice(4)
    ).then((expired) =>
      Promise.all(
        expired.map((directory) =>
          rm(path.join(snapshotRoot, directory), {
            recursive: true,
            force: true,
          })
        ),
      )
    ).catch((error) => {
      console.warn(`Snapshot cleanup deferred: ${error.message}`);
    });
  }

  console.log(
    JSON.stringify(
      {
        status: dryRun ? "validated" : "published",
        researchDirectory,
        capturedAt: payload.capturedAt,
        stats: payload.stats,
        safetyFloor:
          "A degraded pull is rejected before replacing the last good published snapshot.",
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
