#!/usr/bin/env node

import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { collectObservatory } from "./lib/noli-observatory-collector.mjs";
import { loadObservatoryBootstrap } from "./lib/noli-observatory-bootstrap.mjs";
import {
  createCandidateSnapshot,
  diffSnapshots,
  OBSERVATORY_RETENTION_DAYS,
  reconcileWithLastGood,
  snapshotIsExpired,
} from "./lib/noli-observatory-core.mjs";
import {
  assertObservatoryRegistry,
  NOLI_OBSERVATORY_REGISTRY,
} from "./lib/noli-observatory-targets.mjs";

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
const dataDirectory = path.resolve(
  valueFor("--data-dir") || path.join(researchDirectory, "noli-observatory"),
);
const capturedAt = valueFor("--at") || new Date().toISOString();
const concurrency = Number(valueFor("--concurrency") || 4);
const dryRun = args.includes("--dry-run");
const noBootstrap = args.includes("--no-bootstrap");

assertObservatoryRegistry(NOLI_OBSERVATORY_REGISTRY);

function relativeDataPath(file) {
  const relative = path.relative(dataDirectory, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside observatory data directory: ${file}`);
  }
  return `./${relative.split(path.sep).join("/")}`;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function atomicJson(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, file);
}

async function immutableJson(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
}

function snapshotFile(snapshot) {
  const day = snapshot.capturedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[a-z0-9-]+$/i.test(snapshot.snapshotId)) {
    throw new Error(`Unsafe snapshot identity ${snapshot.snapshotId}`);
  }
  return path.join(dataDirectory, "snapshots", day, `${snapshot.snapshotId}.json`);
}

function eventFile(events) {
  const day = events.generatedAt.slice(0, 10);
  const name = `${events.fromSnapshotId || "baseline"}--${events.toSnapshotId}.json`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[a-z0-9-]+--[a-z0-9-]+\.json$/i.test(name)) {
    throw new Error(`Unsafe event identity ${name}`);
  }
  return path.join(dataDirectory, "event-batches", day, name);
}

async function walkJson(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkJson(resolved)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(resolved);
  }
  return files;
}

async function pruneExpired(root, now) {
  const removed = [];
  for (const file of await walkJson(root)) {
    const payload = await readJson(file).catch(() => null);
    const capturedAt = payload?.capturedAt || payload?.generatedAt;
    if (
      capturedAt &&
      snapshotIsExpired({ capturedAt }, now, OBSERVATORY_RETENTION_DAYS)
    ) {
      const relative = path.relative(dataDirectory, file);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Refusing to prune outside observatory data directory: ${file}`);
      }
      await rm(file);
      removed.push(relativeDataPath(file));
    }
  }
  return removed;
}

async function rebuildPublishedViews(latest, newEvents, now) {
  const snapshotFiles = await walkJson(path.join(dataDirectory, "snapshots"));
  const snapshots = (
    await Promise.all(
      snapshotFiles.map(async (file) => {
        const snapshot = await readJson(file);
        return {
          snapshotId: snapshot.snapshotId,
          capturedAt: snapshot.capturedAt,
          bootstrap: Boolean(snapshot.bootstrap),
          path: relativeDataPath(file),
          summary: snapshot.summary,
        };
      }),
    )
  ).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));

  const rollingPath = path.join(dataDirectory, "events.json");
  const priorRolling = await readJson(rollingPath).catch(() => ({ events: [] }));
  const cutoff = now.getTime() - OBSERVATORY_RETENTION_DAYS * 86_400_000;
  const byId = new Map(
    [...(priorRolling.events || []), ...(newEvents.events || [])]
      .filter(({ detectedAt }) => Date.parse(detectedAt) >= cutoff)
      .map((item) => [item.id, item]),
  );
  const events = [...byId.values()].sort((left, right) =>
    right.detectedAt.localeCompare(left.detectedAt),
  );

  await Promise.all([
    atomicJson(path.join(dataDirectory, "latest.json"), latest),
    atomicJson(rollingPath, {
      schemaVersion: 1,
      generatedAt: latest.capturedAt,
      retentionDays: OBSERVATORY_RETENTION_DAYS,
      events,
      boundary: newEvents.boundary,
    }),
    atomicJson(path.join(dataDirectory, "manifest.json"), {
      schemaVersion: 1,
      generatedAt: latest.capturedAt,
      registry: latest.registry,
      retentionDays: OBSERVATORY_RETENTION_DAYS,
      latestSnapshotId: latest.snapshotId,
      latestPath: relativeDataPath(snapshotFile(latest)),
      eventsPath: "./events.json",
      snapshots,
      boundary:
        "Only retained immutable public-observation snapshots are listed. Missing days mean no successful scheduled publication, not no market activity.",
    }),
  ]);
}

let previous = await readJson(path.join(dataDirectory, "latest.json")).catch(() => null);
let bootstrap = null;
if (!previous && !noBootstrap) {
  bootstrap = await loadObservatoryBootstrap({
    researchDirectory,
    registry: NOLI_OBSERVATORY_REGISTRY,
  }).catch(() => null);
  previous = bootstrap;
}
if (
  previous?.capturedAt &&
  Date.parse(capturedAt) <= Date.parse(previous.capturedAt)
) {
  throw new Error(
    `Candidate ${capturedAt} must be newer than last snapshot ${previous.capturedAt}`,
  );
}

const observations = await collectObservatory(NOLI_OBSERVATORY_REGISTRY.targets, {
  observedAt: capturedAt,
  concurrency: Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 4,
});
const candidate = createCandidateSnapshot({
  capturedAt,
  registry: NOLI_OBSERVATORY_REGISTRY,
  observations,
});
const latest = reconcileWithLastGood(candidate, previous);
const events = diffSnapshots(previous, latest);

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        status: "validated",
        snapshotId: latest.snapshotId,
        previousSnapshotId: previous?.snapshotId || null,
        summary: latest.summary,
        eventCount: events.events.length,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

await mkdir(dataDirectory, { recursive: true });
if (bootstrap) {
  const bootstrapPath = snapshotFile(bootstrap);
  await immutableJson(bootstrapPath, bootstrap).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
}
const latestPath = snapshotFile(latest);
const eventsPath = eventFile(events);
await immutableJson(latestPath, latest);
await immutableJson(eventsPath, events);
const now = new Date(capturedAt);
const removed = [
  ...(await pruneExpired(path.join(dataDirectory, "snapshots"), now)),
  ...(await pruneExpired(path.join(dataDirectory, "event-batches"), now)),
];
await rebuildPublishedViews(latest, events, now);

console.log(
  JSON.stringify(
    {
      status: "published",
      dataDirectory,
      snapshotId: latest.snapshotId,
      previousSnapshotId: previous?.snapshotId || null,
      latestPath: relativeDataPath(latestPath),
      eventBatchPath: relativeDataPath(eventsPath),
      summary: latest.summary,
      eventCount: events.events.length,
      pruned: removed,
    },
    null,
    2,
  ),
);
