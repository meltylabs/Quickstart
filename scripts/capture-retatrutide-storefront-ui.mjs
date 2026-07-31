import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(
  ROOT,
  "biologix-strategy-board/research/retatrutide-vendor-universe-data.js"
);
const OUTPUT_ROOT = path.join(ROOT, ".context/noli-vendor-ui");
const chromeCandidates = [
  process.env.NOLI_CHROME,
  path.join(
    os.homedir(),
    "Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell"
  ),
  path.join(
    os.homedir(),
    "Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell"
  ),
  path.join(
    os.homedir(),
    "Library/Caches/ms-playwright/chromium_headless_shell-1148/chrome-mac/headless_shell"
  ),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean);
const CHROME = chromeCandidates.find(existsSync);
if (!CHROME) {
  throw new Error(
    "No Chromium executable found. Set NOLI_CHROME to an installed Chrome or Chromium binary."
  );
}
const concurrency = Math.max(
  1,
  Math.min(8, Number(process.env.NOLI_UI_CONCURRENCY || 4))
);
const requestedLimit = Number(process.env.NOLI_UI_LIMIT || 0);

function normalizeDomain(value) {
  if (!value) return null;
  try {
    const source = String(value).includes("://") ? String(value) : `https://${value}`;
    return new URL(source).hostname.toLowerCase().replace(/^www\./, "").replace(/^shop\./, "");
  } catch {
    return null;
  }
}

function safeName(value) {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function loadUniverse() {
  const source = await readFile(DATA_PATH, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: DATA_PATH });
  return context.window.NOLI_RETATRUTIDE_VENDOR_UNIVERSE;
}

function storefrontTargets(data) {
  const byDomain = new Map();
  for (const vendor of data.vendors) {
    if (![
      "Confirmed US storefront",
      "Probable or gated US storefront"
    ].includes(vendor.retailStatus)) continue;

    const domain = normalizeDomain(vendor.domain || vendor.url || vendor.productUrl);
    if (!domain) continue;
    const url = vendor.productUrl || vendor.url || `https://${domain}/`;
    if (!/^https?:\/\//i.test(url)) continue;

    const current = byDomain.get(domain);
    if (!current || (!current.productUrl && vendor.productUrl)) {
      byDomain.set(domain, {
        domain,
        name: vendor.name,
        url,
        productUrl: vendor.productUrl || null,
        retailStatus: vendor.retailStatus
      });
    }
  }
  const targets = Array.from(byDomain.values()).sort((left, right) =>
    left.domain.localeCompare(right.domain)
  );
  return requestedLimit > 0 ? targets.slice(0, requestedLimit) : targets;
}

function runChrome(args, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const child = spawn(CHROME, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        signal,
        error: stderr.trim().slice(-1000) || null
      });
    });
  });
}

async function capture(target, viewport) {
  const folder = path.join(OUTPUT_ROOT, viewport.name);
  await mkdir(folder, { recursive: true });
  const screenshot = path.join(folder, `${safeName(target.domain)}.png`);
  const profile = await mkdtemp(
    path.join(os.tmpdir(), `noli-ui-${safeName(target.domain)}-${viewport.name}-`)
  );

  const startedAt = Date.now();
  const result = await runChrome([
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate,OptimizationHints",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "--virtual-time-budget=8000",
    `--screenshot=${screenshot}`,
    target.url
  ]);
  await rm(profile, { recursive: true, force: true });

  return {
    viewport: viewport.name,
    screenshot: result.ok ? path.relative(ROOT, screenshot) : null,
    durationMs: Date.now() - startedAt,
    ...result
  };
}

async function mapConcurrent(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return output;
}

const data = await loadUniverse();
const targets = storefrontTargets(data);
await mkdir(OUTPUT_ROOT, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  methodology:
    "Public storefront screenshots only. No account creation, cart submission, identity entry, payment, order, CAPTCHA bypass, or gate bypass.",
  targets: targets.length,
  viewports: {
    mobile: { width: 390, height: 844 },
    desktop: { width: 1440, height: 1000 }
  },
  results: {}
};

let completed = 0;
await mapConcurrent(targets, async (target) => {
  const captures = [];
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 1000 }
  ]) {
    captures.push(await capture(target, viewport));
  }
  manifest.results[target.domain] = { ...target, captures };
  completed += 1;
  if (completed % 5 === 0 || completed === targets.length) {
    console.log(`Captured ${completed}/${targets.length} storefronts`);
    await writeFile(
      path.join(OUTPUT_ROOT, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
  }
});

await writeFile(
  path.join(OUTPUT_ROOT, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

const successful = Object.values(manifest.results).filter((result) =>
  result.captures.some((captureResult) => captureResult.ok)
).length;
console.log(`Wrote UI evidence for ${successful}/${targets.length} storefronts`);
