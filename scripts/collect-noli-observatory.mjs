#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { collectObservatory } from "./lib/noli-observatory-collector.mjs";
import { createCandidateSnapshot } from "./lib/noli-observatory-core.mjs";
import {
  assertObservatoryRegistry,
  NOLI_OBSERVATORY_REGISTRY,
} from "./lib/noli-observatory-targets.mjs";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const capturedAt = valueFor("--at") || new Date().toISOString();
const outputPath = valueFor("--output");
const concurrency = Number(valueFor("--concurrency") || 4);

assertObservatoryRegistry(NOLI_OBSERVATORY_REGISTRY);
const observations = await collectObservatory(NOLI_OBSERVATORY_REGISTRY.targets, {
  observedAt: capturedAt,
  concurrency: Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 4,
});
const snapshot = createCandidateSnapshot({
  capturedAt,
  registry: NOLI_OBSERVATORY_REGISTRY,
  observations,
});
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

if (outputPath) {
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, serialized, { flag: "wx" });
  console.log(
    JSON.stringify({
      status: "captured",
      output: resolved,
      snapshotId: snapshot.snapshotId,
      summary: snapshot.summary,
    }),
  );
} else {
  process.stdout.write(serialized);
}
