#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  access,
  chmod,
  link,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.lastIndexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const requiredText = (flag) => {
  const value = valueFor(flag);
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${flag} value`);
  }
  return value;
};
const requiredPath = (flag) => path.resolve(requiredText(flag));

const liveResearchDirectory = requiredPath("--live-research-dir");
const runtimeBase = requiredPath("--runtime-base");
const stateDirectory = requiredPath("--state-dir");
const launchAgentPath = requiredPath("--launch-agent-path");
const logDirectory = requiredPath("--log-dir");
const nodePath = requiredPath("--node-path");
const repository = requiredText("--repository");
const repositoryId = requiredText("--repository-id");
const label = valueFor("--label") || "com.noli.competitor-refresh";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const uid = process.getuid?.();

if (process.platform !== "darwin" || !Number.isInteger(uid)) {
  throw new Error("This installer requires a logged-in macOS user session.");
}
if (!/^[a-zA-Z0-9.-]+$/.test(label)) {
  throw new Error("LaunchAgent label contains unsupported characters.");
}
if (path.basename(launchAgentPath) !== `${label}.plist`) {
  throw new Error(`LaunchAgent filename must be ${label}.plist`);
}
if (!/^[^/]+\/[^/]+$/.test(repository) || !/^R_[A-Za-z0-9]+$/.test(repositoryId)) {
  throw new Error("Repository name or immutable GitHub repository ID is invalid.");
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} ${commandArgs.join(" ")} failed: ${
        (result.stderr || result.stdout || `exit ${result.status}`).trim()
      }`,
    );
  }
  return (result.stdout || "").trim();
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parsePayload(source) {
  return JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf(";")));
}

const binding = run("conductor-status", []);
if (
  !binding.includes(`TARGET ${repository} (${repositoryId})`) ||
  !binding.includes("binding:     VERIFIED") ||
  !binding.includes(`worktree:    ${repositoryRoot}`)
) {
  throw new Error(
    "Refusing installation because conductor-status does not attest the requested repository ID and exact worktree.",
  );
}
const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
if (status) {
  throw new Error(
    "Refusing to install from a dirty worktree. Commit and verify the exact source SHA first.",
  );
}
const sourceSha = run("git", ["rev-parse", "--verify", "HEAD"]);
if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  throw new Error("Could not resolve an immutable source commit.");
}

const runtimeRoot = path.join(runtimeBase, sourceSha);
const runtimeRefreshScript = path.join(
  runtimeRoot,
  "scripts/refresh-noli-intelligence-suite.mjs",
);
const runtimeArchiveDirectory = path.join(
  runtimeRoot,
  "biologix-strategy-board/research/noli-research-archive-2026-07-27",
);
const lockPath = path.join(stateDirectory, "refresh.lock");
const committedRuntimePaths = [
  "scripts/refresh-noli-intelligence-suite.mjs",
  "scripts/refresh-noli-competitor-intelligence.mjs",
  "scripts/refresh-noli-marketing-watch.mjs",
  "scripts/collect-noli-main-company-gap.mjs",
  "scripts/collect-noli-marketing-watch.mjs",
  "scripts/build-noli-competitor-intelligence.mjs",
  "scripts/lib/noli-priority-companies.mjs",
  "scripts/lib/safe-csv.mjs",
  "biologix-strategy-board/research/noli-research-archive-2026-07-27",
];

await Promise.all([
  access(nodePath),
  access(liveResearchDirectory),
  access("/usr/bin/lockf"),
  access("/usr/bin/tar"),
  access("/usr/bin/plutil"),
]);

try {
  await access(launchAgentPath);
  throw new Error(
    `Refusing to replace existing LaunchAgent ${launchAgentPath}. Remove it explicitly first.`,
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const serviceTarget = `gui/${uid}/${label}`;
const serviceProbe = spawnSync("/bin/launchctl", ["print", serviceTarget], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (serviceProbe.status === 0) {
  throw new Error(`Refusing to replace already loaded service ${serviceTarget}.`);
}

let runtimeCreated = false;
let plistCreated = false;
let bootstrapped = false;
const temporaryPlist = path.join(
  path.dirname(launchAgentPath),
  `.${path.basename(launchAgentPath)}.${process.pid}.tmp`,
);
try {
  await mkdir(runtimeBase, { recursive: true });
  await mkdir(runtimeRoot);
  runtimeCreated = true;

  const archiveResult = spawnSync(
    "git",
    ["archive", "--format=tar", sourceSha, ...committedRuntimePaths],
    {
      cwd: repositoryRoot,
      encoding: null,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  if (archiveResult.error || archiveResult.status !== 0) {
    throw archiveResult.error || new Error(
      `git archive failed: ${String(archiveResult.stderr || "").trim()}`,
    );
  }
  const extractResult = spawnSync("/usr/bin/tar", ["-xf", "-", "-C", runtimeRoot], {
    input: archiveResult.stdout,
    encoding: null,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
  });
  if (extractResult.error || extractResult.status !== 0) {
    throw extractResult.error || new Error(
      `tar extraction failed: ${String(extractResult.stderr || "").trim()}`,
    );
  }

  await Promise.all([
    access(runtimeRefreshScript),
    access(path.join(runtimeArchiveDirectory, "noli-traffic-revenue-all-2026-07-27.json")),
    access(path.join(runtimeArchiveDirectory, "noli-catalog-wave-a-2026-07-27.csv")),
    access(path.join(runtimeArchiveDirectory, "noli-ui-score-wave-a-2026-07-27.json")),
    mkdir(path.dirname(launchAgentPath), { recursive: true }),
    mkdir(logDirectory, { recursive: true }),
    mkdir(stateDirectory, { recursive: true }),
  ]);

  run(nodePath, [
    runtimeRefreshScript,
    "--research-dir",
    liveResearchDirectory,
    "--archive-dir",
    runtimeArchiveDirectory,
    "--dry-run",
  ], { timeout: 12 * 60 * 1_000 });
  const initialLivePayload = parsePayload(
    await readFile(
      path.join(liveResearchDirectory, "noli-competitor-intelligence-data.js"),
      "utf8",
    ),
  );
  const initialMarketingPayload = parsePayload(
    await readFile(
      path.join(liveResearchDirectory, "noli-marketing-watch-data.js"),
      "utf8",
    ),
  );

  await writeFile(
    path.join(runtimeRoot, "INSTALLATION.json"),
    `${JSON.stringify({
      repository,
      repositoryId,
      sourceSha,
      installedAt: new Date().toISOString(),
      liveResearchDirectory,
      scheduleLocalHours: ["00:17", "06:17", "12:17", "18:17"],
      layers: ["catalog-pricing", "marketing"],
    }, null, 2)}\n`,
    { flag: "wx", mode: 0o444 },
  );
  run("/bin/chmod", ["-R", "a-w", runtimeRoot]);

  const standardOutPath = path.join(logDirectory, `${label}.out.log`);
  const standardErrorPath = path.join(logDirectory, `${label}.err.log`);
  const calendarEntries = [0, 6, 12, 18].map((hour) => `    <dict>
      <key>Hour</key>
      <integer>${hour}</integer>
      <key>Minute</key>
      <integer>17</integer>
    </dict>`).join("\n");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/lockf</string>
    <string>-t</string>
    <string>0</string>
    <string>-k</string>
    <string>${xml(lockPath)}</string>
    <string>${xml(nodePath)}</string>
    <string>${xml(runtimeRefreshScript)}</string>
    <string>--research-dir</string>
    <string>${xml(liveResearchDirectory)}</string>
    <string>--archive-dir</string>
    <string>${xml(runtimeArchiveDirectory)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(runtimeRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartCalendarInterval</key>
  <array>
${calendarEntries}
  </array>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>${xml(standardOutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(standardErrorPath)}</string>
</dict>
</plist>
`;
  await writeFile(temporaryPlist, plist, { flag: "wx", mode: 0o600 });
  run("/usr/bin/plutil", ["-lint", temporaryPlist]);
  await link(temporaryPlist, launchAgentPath);
  plistCreated = true;
  await rm(temporaryPlist);
  await chmod(launchAgentPath, 0o600);

  run("/bin/launchctl", ["bootstrap", `gui/${uid}`, launchAgentPath]);
  bootstrapped = true;

  const installedPlist = await readFile(launchAgentPath, "utf8");
  if (
    !installedPlist.includes(sourceSha) ||
    !installedPlist.includes(label) ||
    !installedPlist.includes(runtimeArchiveDirectory)
  ) {
    throw new Error("Installed LaunchAgent did not retain the expected immutable source identity.");
  }

  let verifiedCatalogCapturedAt = null;
  let verifiedMarketingCapturedAt = null;
  let kickstartSent = false;
  const verificationDeadline = Date.now() + 300_000;
  while (Date.now() < verificationDeadline) {
    const launchState = spawnSync(
      "/bin/launchctl",
      ["print", serviceTarget],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stateText = launchState.stdout || "";
    const currentLivePayload = await readFile(
      path.join(liveResearchDirectory, "noli-competitor-intelligence-data.js"),
      "utf8",
    ).then(parsePayload).catch(() => null);
    const currentMarketingPayload = await readFile(
      path.join(liveResearchDirectory, "noli-marketing-watch-data.js"),
      "utf8",
    ).then(parsePayload).catch(() => null);
    const catalogAdvanced =
      currentLivePayload?.capturedAt &&
      Date.parse(currentLivePayload.capturedAt) >
        Date.parse(initialLivePayload.capturedAt);
    const marketingAdvanced =
      currentMarketingPayload?.capturedAt &&
      Date.parse(currentMarketingPayload.capturedAt) >
        Date.parse(initialMarketingPayload.capturedAt);
    const exitedSuccessfully = /last exit code = 0\b/.test(stateText);
    const stillRunning = /\bstate = running\b/.test(stateText);
    if (
      catalogAdvanced &&
      marketingAdvanced &&
      exitedSuccessfully &&
      !stillRunning
    ) {
      verifiedCatalogCapturedAt = currentLivePayload.capturedAt;
      verifiedMarketingCapturedAt = currentMarketingPayload.capturedAt;
      break;
    }
    if (!kickstartSent && !stillRunning && !exitedSuccessfully) {
      spawnSync("/bin/launchctl", ["kickstart", serviceTarget], {
        stdio: "ignore",
      });
      kickstartSent = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!verifiedCatalogCapturedAt || !verifiedMarketingCapturedAt) {
    throw new Error(
      "LaunchAgent did not finish newer successful catalog and marketing publications within 300 seconds.",
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "installed",
        label,
        serviceTarget,
        repository,
        repositoryId,
        sourceSha,
        verifiedCatalogCapturedAt,
        verifiedMarketingCapturedAt,
        runtimeRoot,
        liveResearchDirectory,
        schedule: ["00:17", "06:17", "12:17", "18:17"],
        standardOutPath,
        standardErrorPath,
        safety:
          "A lock prevents overlap. Catalog and marketing validate independently, retain last-good evidence on source failure, and atomically promote only complete snapshots.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await rm(temporaryPlist, { force: true });
  if (bootstrapped) {
    spawnSync("/bin/launchctl", ["bootout", `gui/${uid}`, launchAgentPath], {
      stdio: "ignore",
    });
  }
  if (plistCreated) {
    await rm(launchAgentPath, { force: true });
  }
  if (runtimeCreated) {
    run("/bin/chmod", ["-R", "u+w", runtimeRoot]);
    await rm(runtimeRoot, { recursive: true, force: true });
  }
  throw error;
}
