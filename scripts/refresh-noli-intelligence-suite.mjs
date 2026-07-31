#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const researchDirectory = path.resolve(
  valueFor("--research-dir") ||
    path.join(repositoryRoot, "biologix-strategy-board/research"),
);
const archiveDirectory = path.resolve(
  valueFor("--archive-dir") ||
    path.join(researchDirectory, "noli-research-archive-2026-07-27"),
);
const dryRun = args.includes("--dry-run");

function execute(label, script, scriptArgs) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15 * 60 * 1_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    label,
    succeeded: !result.error && result.status === 0,
    exitCode: result.status,
    error: result.error?.message || null,
  };
}

const priceArgs = [
  "--research-dir",
  researchDirectory,
  "--archive-dir",
  archiveDirectory,
  ...(dryRun ? ["--dry-run"] : []),
];
const marketingArgs = [
  "--research-dir",
  researchDirectory,
  ...(dryRun ? ["--dry-run"] : []),
];

// These are intentionally independent. A degraded catalog pull cannot replace
// pricing, and it cannot prevent a valid marketing snapshot from being tested
// or published. The suite still exits non-zero when either layer needs repair.
const price = execute(
  "catalog-pricing",
  path.join(import.meta.dirname, "refresh-noli-competitor-intelligence.mjs"),
  priceArgs,
);
const marketing = execute(
  "marketing",
  path.join(import.meta.dirname, "refresh-noli-marketing-watch.mjs"),
  marketingArgs,
);
const result = {
  status:
    price.succeeded && marketing.succeeded
      ? dryRun
        ? "validated"
        : "published"
      : "partial-failure",
  researchDirectory,
  layers: { price, marketing },
  boundary:
    "Each layer validates and atomically publishes its own last-good snapshot. A source failure is never converted into a false absence.",
};
console.log(JSON.stringify(result, null, 2));
if (!price.succeeded || !marketing.succeeded) {
  process.exitCode = 1;
}
