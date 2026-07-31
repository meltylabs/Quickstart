#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const archiveDirectory = path.resolve(
  process.argv[2] ||
    path.join(
      repositoryRoot,
      "biologix-strategy-board/research/noli-research-archive-2026-07-27",
    ),
);
const researchDirectory = path.dirname(archiveDirectory);

const rawInputDefinitions = [
  {
    file: "noli-traffic-revenue-all-2026-07-27.csv",
    layer: "traffic-and-gross-checkout-input",
    description:
      "Flat 112-company traffic, domain-age, AOV, CVR, order, and low/base/high gross-checkout model input.",
  },
  {
    file: "noli-traffic-revenue-all-2026-07-27.json",
    layer: "traffic-and-gross-checkout-input",
    description:
      "Machine-readable 112-company traffic and gross-checkout model input with sources and caveats.",
  },
  {
    file: "noli-traffic-revenue-wave-a-2026-07-27.csv",
    layer: "raw-public-traffic-capture",
    description:
      "Wave A collector output retaining daily rank history, source dates, price clues, and model inputs.",
  },
  {
    file: "noli-traffic-revenue-wave-b-2026-07-27.csv",
    layer: "raw-public-traffic-capture",
    description:
      "Wave B collector output retaining daily rank history, source dates, price clues, and model inputs.",
  },
  {
    file: "noli-traffic-revenue-wave-c-2026-07-27.csv",
    layer: "raw-public-traffic-capture",
    description:
      "Wave C collector output retaining daily rank history, source dates, price clues, and model inputs.",
  },
  {
    file: "noli-traffic-revenue-wave-a-2026-07-27.raw.json",
    layer: "raw-public-traffic-capture",
    description:
      "Wave A registry responses, daily Rank.to observations, public page statuses, byte counts, and extracted price clues.",
  },
  {
    file: "noli-traffic-revenue-main-company-gap-2026-07-28.json",
    layer: "traffic-and-gross-checkout-input",
    description:
      "Sixteen newly promoted main-company records plus Northline and Bluum priority refreshes, with daily rank history, domain ages, sources, and model boundaries.",
  },
  {
    file: "noli-catalog-wave-a-2026-07-27.csv",
    layer: "raw-catalog-capture",
    description:
      "Wave A public catalog offers before cross-wave normalization and deduplication.",
  },
  {
    file: "noli-catalog-wave-b-2026-07-27.csv",
    layer: "raw-catalog-capture",
    description:
      "Wave B public catalog offers before cross-wave normalization and deduplication.",
  },
  {
    file: "noli-catalog-wave-c-2026-07-27.csv",
    layer: "raw-catalog-capture",
    description:
      "Wave C public catalog offers and explicit access/transport sentinels before normalization.",
  },
  {
    file: "noli-catalog-supplemental-2026-07-27.csv",
    layer: "raw-catalog-capture",
    description:
      "Northline and Biologix supplemental public catalog capture.",
  },
  {
    file: "noli-catalog-main-company-gap-2026-07-28.csv",
    layer: "raw-catalog-capture",
    description:
      "Live public WooCommerce and Shopify offers plus clearly labeled partial page captures for 16 main-company additions and the priority Northline/Bluum refreshes.",
  },
  {
    file: "noli-catalog-summary-wave-a-2026-07-27.csv",
    layer: "raw-catalog-summary",
    description: "Wave A collection coverage and extraction summary.",
  },
  {
    file: "noli-catalog-summary-wave-b-2026-07-27.csv",
    layer: "raw-catalog-summary",
    description: "Wave B collection coverage and extraction summary.",
  },
  {
    file: "noli-catalog-summary-wave-c-2026-07-27.csv",
    layer: "raw-catalog-summary",
    description: "Wave C complete, gated, and transport-failure summary.",
  },
  {
    file: "noli-catalog-summary-supplemental-2026-07-27.csv",
    layer: "raw-catalog-summary",
    description: "Northline and Biologix supplemental collection summary.",
  },
  {
    file: "noli-catalog-summary-main-company-gap-2026-07-28.csv",
    layer: "raw-catalog-summary",
    description:
      "Coverage, offer counts, methods, timestamps, confidence, and caveats for 16 main-company additions plus Northline and Bluum.",
  },
  {
    file: "noli-ui-score-wave-a-2026-07-27.json",
    layer: "raw-ui-audit-metadata",
    description:
      "Wave A desktop/mobile scores, access states, findings, evidence URLs, and screenshot references without image binaries.",
  },
  {
    file: "noli-ui-score-wave-b-2026-07-27.json",
    layer: "raw-ui-audit-metadata",
    description:
      "Wave B desktop/mobile scores, page metrics, access states, findings, and evidence URLs.",
  },
  {
    file: "noli-ui-score-wave-c-2026-07-27.json",
    layer: "raw-ui-audit-metadata",
    description:
      "Wave C desktop/mobile scores, page metrics, access states, findings, and evidence URLs.",
  },
  {
    file: "noli-vendor-ui-capture-manifest-2026-07-27.json",
    layer: "raw-ui-capture-metadata",
    description:
      "112-domain screenshot-capture status, duration, final URL, and error metadata without image binaries.",
  },
];

const rebuildInputFiles = new Set([
  "noli-traffic-revenue-all-2026-07-27.json",
  "noli-traffic-revenue-main-company-gap-2026-07-28.json",
  "noli-catalog-wave-a-2026-07-27.csv",
  "noli-catalog-wave-b-2026-07-27.csv",
  "noli-catalog-wave-c-2026-07-27.csv",
  "noli-catalog-supplemental-2026-07-27.csv",
  "noli-catalog-main-company-gap-2026-07-28.csv",
  "noli-catalog-summary-wave-a-2026-07-27.csv",
  "noli-catalog-summary-wave-b-2026-07-27.csv",
  "noli-catalog-summary-wave-c-2026-07-27.csv",
  "noli-catalog-summary-supplemental-2026-07-27.csv",
  "noli-catalog-summary-main-company-gap-2026-07-28.csv",
  "noli-ui-score-wave-a-2026-07-27.json",
  "noli-ui-score-wave-b-2026-07-27.json",
  "noli-ui-score-wave-c-2026-07-27.json",
]);

const supportingEvidenceDefinitions = [
  {
    file: "operator-source-matrix.csv",
    layer: "operator-and-founder-source-ledger",
    description:
      "42-row operator, founder, affiliate, compliance, growth, payment, and supply evidence matrix, including sources not duplicated elsewhere.",
  },
  {
    file: "noli-research-20260727-competitor-checkout-matrix.md",
    layer: "historical-checkout-research",
    description:
      "Historical 20-store checkout evidence matrix retained for provenance. Its low-confidence Sparta revenue scenario is superseded by the later normalized model.",
  },
];

const publishedOutputDefinitions = [
  {
    file: "noli-competitor-intelligence-2026-07-27.csv",
    description:
      "Normalized 130-company commercial sheet with model assumptions, sources, caveats, catalog rollups, and UI findings.",
  },
  {
    file: "noli-competitor-catalog-2026-07-27.csv",
    description:
      "Normalized and deduplicated offer-level public catalog and pricing export.",
  },
  {
    file: "noli-competitor-catalog-2026-07-27.json",
    description:
      "Machine-readable normalized catalog grouped by company domain.",
  },
  {
    file: "noli-competitor-intelligence-data.js",
    description: "Compact page payload for the searchable commercial viewer.",
  },
  {
    file: "noli-marketing-watch-2026-07-28.csv",
    description:
      "Eighteen-company public marketing, lifecycle, tracking, content, social, promotion, and official ad-source export.",
  },
  {
    file: "noli-marketing-watch-2026-07-28.json",
    description:
      "Machine-readable marketing monitor with source scope, freshness, exact evidence URLs, and verified exact-domain public ad observations.",
  },
  {
    file: "noli-marketing-watch-data.js",
    description:
      "Compact page payload for the per-company marketing and official ad-source viewer.",
  },
  {
    file: "noli-checkout-scan-2026-07-27.json",
    description: "Machine-readable 48-store checkout and growth audit.",
  },
  {
    file: "noli-processor-code-census-2026-07-27.json",
    description: "Raw payment-provider code evidence census.",
  },
  {
    file: "noli-forum-founder-sweep-sources-2026-07-27.csv",
    description: "Forum and founder source ledger.",
  },
  {
    file: "noli-biologix-public-footprint-2026-07-28.md",
    description:
      "Public-source Braden and Biologix identity, business-contact, forum, reputation, and acquisition scan with explicit attribution boundaries.",
  },
  {
    file: "noli-full-crawl-synthesis-2026-07-27.json",
    description: "570-domain public-crawl rollups.",
  },
  {
    file: "retatrutide-vendor-audit-data.js",
    description: "Complete public crawl evidence ledger.",
  },
];

const archiveDocumentDefinitions = [
  {
    file: "README.md",
    layer: "archive-guide",
    description:
      "Human-readable archive index, model boundaries, highest current signals, and rebuild instructions.",
  },
  {
    file: "../../../scripts/build-noli-competitor-intelligence.mjs",
    layer: "normalization-code",
    description:
      "Deterministic normalizer that builds the published intelligence and catalog outputs from the archived inputs.",
  },
  {
    file: "../../../scripts/collect-noli-main-company-gap.mjs",
    layer: "collection-code",
    description:
      "Bounded anonymous-public collector for the 16 main-company additions, including live catalog and traffic refreshes.",
  },
  {
    file: "../../../scripts/refresh-noli-competitor-intelligence.mjs",
    layer: "refresh-code",
    description:
      "Guarded refresh orchestrator that validates every expected live feed, writes one immutable versioned snapshot, and atomically switches the page payload only after the snapshot is complete.",
  },
  {
    file: "../../../scripts/collect-noli-marketing-watch.mjs",
    layer: "marketing-collection-code",
    description:
      "Bounded public collector for onsite marketing signals plus documented anonymous Microsoft/Bing and Snap ad-transparency APIs.",
  },
  {
    file: "../../../scripts/refresh-noli-marketing-watch.mjs",
    layer: "marketing-refresh-code",
    description:
      "Guarded marketing refresh that preserves per-source last-good observations and atomically publishes a versioned snapshot.",
  },
  {
    file: "../../../scripts/refresh-noli-intelligence-suite.mjs",
    layer: "refresh-supervisor-code",
    description:
      "Fault-isolated supervisor that runs catalog/pricing and marketing refreshes independently on one schedule.",
  },
  {
    file: "../../../scripts/install-noli-competitor-refresh.mjs",
    layer: "refresh-install-code",
    description:
      "Fail-closed macOS LaunchAgent installer that pins the live refresh to one committed source SHA and refuses to replace an existing job.",
  },
  {
    file: "../../../scripts/build-noli-research-archive-manifest.mjs",
    layer: "archive-code",
    description:
      "Manifest and checksum generator for this reconstruction archive.",
  },
  {
    file: "../../../scripts/lib/safe-csv.mjs",
    layer: "export-safety-code",
    description:
      "CSV serializer that neutralizes spreadsheet-formula prefixes in normalized exports.",
  },
  {
    file: "../../../scripts/lib/noli-priority-companies.mjs",
    layer: "monitor-registry-code",
    description:
      "Shared 18-company identity, alias, catalog, and public marketing-route registry used by both automatic layers.",
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function csvRecordCount(source) {
  let records = 0;
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "\n" && !quoted) {
      records += 1;
    }
  }
  if (source && !source.endsWith("\n")) records += 1;
  return Math.max(0, records - 1);
}

function jsonRecordCount(file, source) {
  const value = JSON.parse(source);
  if (
    file === "noli-traffic-revenue-all-2026-07-27.json" ||
    file === "noli-traffic-revenue-main-company-gap-2026-07-28.json"
  ) {
    return value.rows?.length || 0;
  }
  if (file === "noli-traffic-revenue-wave-a-2026-07-27.raw.json") {
    return Array.isArray(value) ? value.length : 0;
  }
  if (file.startsWith("noli-ui-score-wave-a")) {
    return Object.values(value).filter(
      (entry) => entry && typeof entry === "object",
    ).length;
  }
  if (file.startsWith("noli-ui-score-wave-")) {
    return Object.keys(value.byDomain || {}).length;
  }
  if (file === "noli-vendor-ui-capture-manifest-2026-07-27.json") {
    return Object.keys(value.results || {}).length;
  }
  if (file === "noli-marketing-watch-2026-07-28.json") {
    return Object.keys(value.byDomain || {}).length;
  }
  return null;
}

async function describeFile(baseDirectory, definition, relativePrefix = "") {
  const absolutePath = path.join(baseDirectory, definition.file);
  const [buffer, metadata] = await Promise.all([
    readFile(absolutePath),
    stat(absolutePath),
  ]);
  const source = buffer.toString("utf8");
  return {
    path: `${relativePrefix}${definition.file}`,
    layer: definition.layer,
    description: definition.description,
    bytes: metadata.size,
    sha256: sha256(buffer),
    records: definition.file.endsWith(".csv")
      ? csvRecordCount(source)
      : definition.file.endsWith(".json")
        ? jsonRecordCount(definition.file, source)
        : null,
  };
}

const rawInputs = (await Promise.all(
  rawInputDefinitions.map((definition) =>
    describeFile(archiveDirectory, definition),
  ),
)).map((entry) => ({
  ...entry,
  requiredForNormalizedBuild: rebuildInputFiles.has(entry.path),
}));
const supportingEvidence = await Promise.all(
  supportingEvidenceDefinitions.map((definition) =>
    describeFile(archiveDirectory, definition),
  ),
);
const publishedOutputs = await Promise.all(
  publishedOutputDefinitions.map((definition) =>
    describeFile(researchDirectory, definition, "../"),
  ),
);
const archiveDocuments = await Promise.all(
  archiveDocumentDefinitions.map((definition) =>
    describeFile(archiveDirectory, definition),
  ),
);

const intelligenceSource = await readFile(
  path.join(researchDirectory, "noli-competitor-intelligence-data.js"),
  "utf8",
);
const intelligence = JSON.parse(
  intelligenceSource.slice(
    intelligenceSource.indexOf("{"),
    intelligenceSource.lastIndexOf(";"),
  ),
);
const marketingSource = await readFile(
  path.join(researchDirectory, "noli-marketing-watch-data.js"),
  "utf8",
);
const marketing = JSON.parse(
  marketingSource.slice(
    marketingSource.indexOf("{"),
    marketingSource.lastIndexOf(";"),
  ),
);

const manifest = {
  manifestVersion: 1,
  snapshotDate: "2026-07-28",
  capturedThrough:
    Date.parse(marketing.capturedAt) > Date.parse(intelligence.capturedAt)
      ? marketing.capturedAt
      : intelligence.capturedAt,
  marketingCapturedAt: marketing.capturedAt,
  company: "Noli",
  purpose:
    "Reconstruction-grade archive for future review of the July 2026 competitor, catalog, traffic, gross-checkout, payment, forum, UI, marketing, and public ad-source research.",
  rollups: {
    ...intelligence.stats,
    marketing: marketing.stats,
  },
  modelBoundaries: {
    traffic:
      "Rank.to daily rank converted with 9e10 × rank^-1.05. Public panels are retained where available. Unknown traffic is not zero traffic.",
    grossCheckout:
      "Modeled visits × assumed conversion × modeled AOV. These are scenarios before refunds, disputes, taxes, reserves, settlement loss, or costs—not measured revenue or profit.",
    catalog:
      "Anonymous public GET only. Full, partial, gated, and unresolved coverage remain distinct.",
    stock:
      "Binary stock and public quantity fields are point-in-time storefront observations, not sales or warehouse inventory.",
    ui:
      "Screenshot-reviewed design scores do not establish product quality, legality, traffic, or revenue.",
    marketing:
      "Public scripts, routes, forms, copy, social/content links, and lifecycle tools show observable capability—not spend, CAC, ROAS, attributed visits, traffic-source share, or performance.",
    ads:
      "Automatic ad observations require an exact destination-domain match in official Microsoft/Bing or Snap sources. Coverage is region- and period-limited; no result never means no advertising.",
  },
  rebuild: {
    builder: "scripts/build-noli-competitor-intelligence.mjs",
    marketingCollector: "scripts/collect-noli-marketing-watch.mjs",
    refreshSupervisor: "scripts/refresh-noli-intelligence-suite.mjs",
    safeCsvHelper: "scripts/lib/safe-csv.mjs",
    inputs: rawInputs
      .filter((entry) => entry.requiredForNormalizedBuild)
      .map((entry) => entry.path),
  },
  rawInputs,
  supportingEvidence,
  publishedOutputs,
  archiveDocuments,
  exclusions: [
    "Screenshot and contact-sheet image binaries",
    "Complete HTML or JavaScript response-body dumps",
    "Cookies, credentials, authorization headers, accounts, carts, orders, and payment attempts",
    "Redundant captures that add no distinct evidence",
  ],
};

await writeFile(
  path.join(archiveDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const checksums = [
  ...rawInputs,
  ...supportingEvidence,
  ...publishedOutputs,
  ...archiveDocuments,
]
  .map((entry) => `${entry.sha256}  ${entry.path}`)
  .sort()
  .join("\n");
await writeFile(
  path.join(archiveDirectory, "SHA256SUMS.txt"),
  `${checksums}\n`,
);

console.log(
  JSON.stringify(
    {
      archiveDirectory,
      rawInputs: rawInputs.length,
      supportingEvidence: supportingEvidence.length,
      publishedOutputs: publishedOutputs.length,
      rollups: manifest.rollups,
    },
    null,
    2,
  ),
);
