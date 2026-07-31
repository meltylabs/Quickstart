#!/usr/bin/env node

import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { NOLI_PRIORITY_COMPANIES } from "./lib/noli-priority-companies.mjs";
import { toCsv } from "./lib/safe-csv.mjs";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const dryRun = args.includes("--dry-run");
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const researchDirectory = path.resolve(
  valueFor("--research-dir") ||
    path.join(repositoryRoot, "biologix-strategy-board/research"),
);
const expectedDomains = new Set(
  NOLI_PRIORITY_COMPANIES.map((company) => company.domain),
);

function runCollector(outputDirectory) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(import.meta.dirname, "collect-noli-marketing-watch.mjs"),
      outputDirectory,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 12 * 60 * 1_000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Marketing collector exited ${result.status}`);
  }
}

function parsePayload(source) {
  return JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf(";")));
}

function sourceSucceeded(source) {
  return source && source.status !== "source-error";
}

function assertCandidateQuality(candidate, previous) {
  const rows = Object.values(candidate.byDomain || {});
  const domains = new Set(rows.map((row) => row.domain));
  if (rows.length !== expectedDomains.size || domains.size !== expectedDomains.size) {
    throw new Error(
      `Marketing refresh rejected: expected ${expectedDomains.size} unique companies, got ${domains.size}`,
    );
  }
  for (const domain of expectedDomains) {
    if (!domains.has(domain)) {
      throw new Error(`Marketing refresh rejected: missing ${domain}`);
    }
  }
  const onsiteObserved = rows.filter((row) => row.status !== "unresolved").length;
  if (onsiteObserved < 10) {
    throw new Error(
      `Marketing refresh rejected: only ${onsiteObserved} onsite scans returned public evidence`,
    );
  }
  for (const platform of ["Microsoft/Bing", "Snap"]) {
    const succeeded = rows.filter((row) =>
      sourceSucceeded(
        row.adMonitoring?.sources?.find((source) => source.platform === platform),
      )
    ).length;
    if (succeeded < 14) {
      throw new Error(
        `Marketing refresh rejected: only ${succeeded} ${platform} source checks succeeded`,
      );
    }
  }
  if (
    previous?.capturedAt &&
    Date.parse(candidate.capturedAt) <= Date.parse(previous.capturedAt)
  ) {
    throw new Error(
      "Marketing refresh rejected: candidate is not newer than the published snapshot",
    );
  }
}

function mergeAdSources(currentRow, previousRow) {
  const previousSources = new Map(
    (previousRow?.adMonitoring?.sources || []).map((source) => [
      source.platform,
      source,
    ]),
  );
  return (currentRow.adMonitoring?.sources || []).map((source) => {
    const previous = previousSources.get(source.platform);
    if (source.status !== "source-error" || !sourceSucceeded(previous)) {
      return {
        ...source,
        lastAttemptAt: source.checkedAt,
        lastSuccessfulCheckedAt:
          source.status === "source-error"
            ? null
            : source.checkedAt,
      };
    }
    return {
      ...previous,
      status: "stale-preserved",
      lastSuccessfulStatus: previous.lastSuccessfulStatus || previous.status,
      lastSuccessfulCheckedAt:
        previous.lastSuccessfulCheckedAt || previous.checkedAt,
      lastAttemptAt: source.checkedAt,
      error: source.error,
      preservationReason:
        "The current official-source request failed; the last successful observation is retained.",
    };
  });
}

function mergeDomain(current, previous) {
  let merged;
  if (
    current.status !== "reachable" &&
    previous &&
    previous.status !== "unresolved"
  ) {
    merged = {
      ...previous,
      status: "stale-preserved",
      currentAttemptStatus: current.status,
      lastAttemptAt: current.capturedAt,
      lastSuccessfulOnsiteAt:
        previous.lastSuccessfulOnsiteAt || previous.capturedAt,
      currentAttemptError: current.error,
      currentAttemptPagesChecked: current.pagesChecked,
      preservationReason:
        "The current onsite pull was unresolved or partial; the last complete public observation is retained.",
    };
  } else {
    merged = {
      ...current,
      currentAttemptStatus: current.status,
      lastAttemptAt: current.capturedAt,
    };
  }
  const sources = mergeAdSources(current, previous);
  const verifiedAds = sources.flatMap((source) => source.verifiedAds || []);
  merged.adLibraries = current.adLibraries;
  merged.adMonitoring = {
    sources,
    verifiedAds,
    verifiedAdsObserved: verifiedAds.length,
  };
  return merged;
}

function setValues(row) {
  const mechanics = row.mechanics || {};
  return {
    promotions: (row.promotions || []).map((item) => item.text),
    tracking: row.trackingStack || [],
    technology: row.marketingTechnology || [],
    channels: (row.channelSignals || []).map((item) =>
      `${item.channel}: ${item.evidence}`
    ),
    programs: [
      `affiliate:${mechanics.affiliateStatus || "unknown"}`,
      `referral:${mechanics.referralStatus || "unknown"}`,
      `loyalty:${mechanics.loyaltyStatus || "unknown"}`,
      `email:${mechanics.emailCaptureStatus || "unknown"}`,
      `sms:${mechanics.smsCaptureStatus || "unknown"}`,
      `subscription:${Boolean(mechanics.subscriptionDetected)}`,
    ],
    social: Object.entries(row.social || {}).flatMap(([network, links]) =>
      links.map((url) => `${network}:${url}`)
    ),
    content: (row.content?.latestPosts || []).map((post) =>
      post.url || `${post.publishedAt || ""}:${post.title || ""}`
    ),
    ads: (row.adMonitoring?.verifiedAds || []).map((ad) =>
      `${ad.platform}:${ad.adId}:${ad.destinationUrl || ""}`
    ),
  };
}

function difference(left, right) {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((value) => !rightSet.has(value));
}

function changeRecord(current, previous) {
  if (!previous) {
    return {
      changed: false,
      summary: ["Baseline created"],
      added: {},
      removed: {},
    };
  }
  const currentSets = setValues(current);
  const previousSets = setValues(previous);
  const added = {};
  const removed = {};
  const summary = [];
  for (const key of Object.keys(currentSets)) {
    const additions = difference(currentSets[key], previousSets[key]);
    const removals = difference(previousSets[key], currentSets[key]);
    if (additions.length) {
      added[key] = additions;
      summary.push(`${additions.length} ${key} added`);
    }
    if (removals.length) {
      removed[key] = removals;
      summary.push(`${removals.length} ${key} removed`);
    }
  }
  return {
    changed: summary.length > 0,
    summary,
    added,
    removed,
  };
}

function recomputeStats(rows, scanStats) {
  const observable = rows.filter((row) =>
    ["reachable", "partial", "stale-preserved"].includes(row.status)
  );
  const sourceCount = (platform) =>
    rows.filter((row) =>
      sourceSucceeded(
        row.adMonitoring?.sources?.find((source) =>
          source.platform === platform
        ),
      )
    ).length;
  return {
    companies: rows.length,
    monitoredCompanies: rows.length,
    reachable: rows.filter((row) => row.status === "reachable").length,
    partial: rows.filter((row) => row.status === "partial").length,
    unresolved: rows.filter((row) => row.status === "unresolved").length,
    stalePreserved: rows.filter((row) => row.status === "stale-preserved").length,
    onsiteCurrentSuccesses: rows.filter((row) =>
      ["reachable", "partial"].includes(row.currentAttemptStatus)
    ).length,
    onsiteStalePreserved: rows.filter((row) =>
      row.status === "stale-preserved"
    ).length,
    withPromotions: observable.filter((row) => row.promotions?.length).length,
    withPaidSocialPixels: observable.filter((row) =>
      row.trackingStack?.some((name) =>
        ["Meta Pixel", "TikTok Pixel", "Pinterest Tag", "Snap Pixel", "Reddit Pixel"].includes(name)
      )
    ).length,
    withGoogleAdsTag: observable.filter((row) =>
      row.trackingStack?.includes("Google Ads tag")
    ).length,
    withAffiliate: observable.filter((row) =>
      row.mechanics?.affiliateDetected
    ).length,
    withEmailForm: observable.filter((row) =>
      row.mechanics?.emailCaptureDetected
    ).length,
    withLifecycleSignal: observable.filter((row) =>
      !["not-surfaced", "unknown"].includes(
        row.mechanics?.emailCaptureStatus,
      ) ||
      !["not-surfaced", "unknown"].includes(
        row.mechanics?.smsCaptureStatus,
      )
    ).length,
    withSmsCapture: observable.filter((row) =>
      row.mechanics?.smsCaptureDetected
    ).length,
    withPublicContent: observable.filter((row) =>
      row.content?.publicContentHubDetected
    ).length,
    microsoftChecksSucceeded: sourceCount("Microsoft/Bing"),
    snapChecksSucceeded: sourceCount("Snap"),
    currentAttemptMicrosoftChecksSucceeded:
      scanStats.microsoftChecksSucceeded,
    currentAttemptSnapChecksSucceeded: scanStats.snapChecksSucceeded,
    companiesWithVerifiedAds: rows.filter((row) =>
      row.adMonitoring?.verifiedAdsObserved > 0
    ).length,
    verifiedAdsObserved: rows.reduce(
      (sum, row) => sum + (row.adMonitoring?.verifiedAdsObserved || 0),
      0,
    ),
  };
}

function csvRowsFor(payload) {
  return Object.values(payload.byDomain).map((row) => ({
    domain: row.domain,
    brand: row.brand,
    status: row.status,
    current_attempt_status: row.currentAttemptStatus,
    evidence_captured_at: row.capturedAt,
    last_attempt_at: row.lastAttemptAt,
    last_successful_onsite_at: row.lastSuccessfulOnsiteAt,
    positioning_title: row.positioning?.title,
    positioning_h1: row.positioning?.h1,
    positioning_description: row.positioning?.description,
    promotion_copy: row.promotions?.map((item) => item.text).join(" || "),
    promotion_evidence_urls: row.promotions
      ?.map((item) => item.evidenceUrl)
      .join(" || "),
    tracking_stack: row.trackingStack?.join(" | "),
    marketing_technology: row.marketingTechnology?.join(" | "),
    channel_signals: row.channelSignals
      ?.map((item) => `${item.channel}: ${item.evidence}`)
      .join(" || "),
    affiliate_status: row.mechanics?.affiliateStatus,
    affiliate_links: row.mechanics?.affiliateLinks?.join(" | "),
    referral_status: row.mechanics?.referralStatus,
    referral_links: row.mechanics?.referralLinks?.join(" | "),
    loyalty_status: row.mechanics?.loyaltyStatus,
    loyalty_links: row.mechanics?.loyaltyLinks?.join(" | "),
    subscription_detected: row.mechanics?.subscriptionDetected,
    email_capture_status: row.mechanics?.emailCaptureStatus,
    sms_capture_status: row.mechanics?.smsCaptureStatus,
    social_links: Object.entries(row.social || {}).flatMap(([network, links]) =>
      links.map((url) => `${network}: ${url}`)
    ).join(" | "),
    latest_content: row.content?.latestPosts?.map((post) =>
      [post.publishedAt, post.title, post.url].filter(Boolean).join(" | ")
    ).join(" || "),
    verified_public_ads: row.adMonitoring?.verifiedAds?.map((ad) =>
      [
        ad.platform,
        ad.adId,
        ad.firstShown,
        ad.lastShown,
        ad.title,
        ad.destinationUrl,
        ad.sourceUrl,
      ].filter(Boolean).join(" | ")
    ).join(" || "),
    ad_source_status: row.adMonitoring?.sources?.map((source) =>
      `${source.platform}: ${source.status} (${source.coverage})`
    ).join(" || "),
    changes_since_previous: row.changesSincePrevious?.summary?.join(" | "),
    evidence_urls: row.evidenceUrls?.join(" | "),
    caveat: row.caveat,
  }));
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "noli-marketing-refresh-"));
try {
  runCollector(temporaryRoot);
  const candidate = JSON.parse(
    await readFile(
      path.join(temporaryRoot, "noli-marketing-watch-2026-07-28.json"),
      "utf8",
    ),
  );
  const previous = await readFile(
    path.join(researchDirectory, "noli-marketing-watch-data.js"),
    "utf8",
  ).then(parsePayload).catch(() => null);
  assertCandidateQuality(candidate, previous);

  const byDomain = {};
  for (const domain of expectedDomains) {
    const current = candidate.byDomain[domain];
    const prior = previous?.byDomain?.[domain] || null;
    const merged = mergeDomain(current, prior);
    merged.changesSincePrevious = changeRecord(merged, prior);
    byDomain[domain] = merged;
  }
  const rows = Object.values(byDomain);
  const changedCompanies = rows.filter((row) =>
    row.changesSincePrevious.changed
  );
  const payload = {
    schemaVersion: 1,
    generatedAt: candidate.capturedAt,
    capturedAt: candidate.capturedAt,
    stats: {
      ...recomputeStats(rows, candidate.stats),
      companiesChanged: changedCompanies.length,
    },
    methodology: candidate.methodology,
    changeSummary: {
      comparedWith: previous?.capturedAt || null,
      companiesChanged: changedCompanies.map((row) => row.domain),
      note:
        "A change means a public observation changed between successful snapshots. It does not establish spend, performance, or causality.",
    },
    byDomain,
  };

  if (!dryRun) {
    const snapshotRoot = path.join(
      researchDirectory,
      "noli-marketing-snapshots",
    );
    await mkdir(snapshotRoot, { recursive: true });
    const snapshotVersion = String(payload.capturedAt).replace(/[-:.]/g, "");
    if (!/^\d{8}T\d{9}Z$/.test(snapshotVersion)) {
      throw new Error(`Refusing unsafe marketing snapshot version ${snapshotVersion}`);
    }
    const publishStage = await mkdtemp(path.join(snapshotRoot, ".stage-"));
    const publishedSnapshot = path.join(snapshotRoot, snapshotVersion);
    const relativeSnapshotRoot = `./noli-marketing-snapshots/${snapshotVersion}`;
    payload.snapshotVersion = snapshotVersion;
    payload.exportPath =
      `${relativeSnapshotRoot}/noli-marketing-watch-2026-07-28.csv`;
    payload.jsonPath =
      `${relativeSnapshotRoot}/noli-marketing-watch-2026-07-28.json`;
    payload.rawPath =
      `${relativeSnapshotRoot}/noli-marketing-watch-2026-07-28.raw.json`;
    const serialized =
      `window.NOLI_MARKETING_WATCH = ${JSON.stringify(payload)};\n`;
    const csvRows = csvRowsFor(payload);
    const pointerStage = path.join(
      researchDirectory,
      `.noli-marketing-data-${snapshotVersion}-${process.pid}.tmp`,
    );
    let snapshotPromoted = false;
    let pointerPromoted = false;
    try {
      await Promise.all([
        writeFile(
          path.join(publishStage, "noli-marketing-watch-2026-07-28.raw.json"),
          `${JSON.stringify(candidate, null, 2)}\n`,
          { flag: "wx" },
        ),
        writeFile(
          path.join(publishStage, "noli-marketing-watch-2026-07-28.json"),
          `${JSON.stringify(payload, null, 2)}\n`,
          { flag: "wx" },
        ),
        writeFile(
          path.join(publishStage, "noli-marketing-watch-2026-07-28.csv"),
          toCsv(csvRows, Object.keys(csvRows[0])),
          { flag: "wx" },
        ),
        writeFile(
          path.join(publishStage, "noli-marketing-watch-data.js"),
          serialized,
          { flag: "wx" },
        ),
        writeFile(pointerStage, serialized, { flag: "wx" }),
      ]);
      await rename(publishStage, publishedSnapshot);
      snapshotPromoted = true;
      await rename(
        pointerStage,
        path.join(researchDirectory, "noli-marketing-watch-data.js"),
      );
      pointerPromoted = true;
    } finally {
      await rm(publishStage, { recursive: true, force: true });
      await rm(pointerStage, { force: true });
      if (snapshotPromoted && !pointerPromoted) {
        await rm(publishedSnapshot, { recursive: true, force: true });
      }
    }
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
      console.warn(`Marketing snapshot cleanup deferred: ${error.message}`);
    });
  }

  console.log(
    JSON.stringify(
      {
        status: dryRun ? "validated" : "published",
        researchDirectory,
        capturedAt: payload.capturedAt,
        stats: payload.stats,
        safety:
          "Onsite and official ad-source failures preserve last-good observations; absence is scoped, never generalized.",
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
