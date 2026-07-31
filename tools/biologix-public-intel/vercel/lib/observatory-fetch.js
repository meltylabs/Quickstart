import { lookup } from "node:dns/promises";
import { Agent } from "undici";

import {
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  isPublicIp,
  validateTargetUrl,
} from "./observatory-core.js";

const USER_AGENT =
  "NoliCompetitorObservatory/1.0 (+anonymous public GET; no forms, account, cart, checkout, or transaction)";

async function assertPublicDns(hostname, lookupImpl) {
  const records = await lookupImpl(hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`DNS returned no addresses for ${hostname}`);
  }
  const blocked = records.find((record) => !isPublicIp(record.address));
  if (blocked) throw new Error(`DNS resolved to a blocked address for ${hostname}`);
  return records.map(({ address, family }) => ({ address, family }));
}

function pinnedDispatcher(records) {
  let addressIndex = 0;
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (typeof options === "object" && options?.all) {
          callback(null, records);
          return;
        }
        const selected = records[addressIndex++ % records.length];
        callback(null, selected.address, selected.family);
      },
    },
  });
}

async function readBounded(response, maxBytes) {
  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Response advertised ${contentLength} bytes, limit is ${maxBytes}`);
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error("Response exceeded byte limit");
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response byte limit exceeded");
        throw new Error("Response exceeded byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

export async function fetchBoundedPublic(value, options) {
  const {
    allowedHosts,
    accept = "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.5",
    fetchImpl = fetch,
    lookupImpl = lookup,
    maxBytes = MAX_RESPONSE_BYTES,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;
  let current = validateTargetUrl(value, allowedHosts);
  const started = Date.now();

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const records = await assertPublicDns(current.hostname, lookupImpl);
    const dispatcher = pinnedDispatcher(records);
    try {
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: accept,
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect ${response.status} omitted Location`);
        if (redirectCount === MAX_REDIRECTS) throw new Error("Redirect limit exceeded");
        current = validateTargetUrl(new URL(location, current), allowedHosts);
        continue;
      }

      const bytes = await readBounded(response, maxBytes);
      return {
        url: current.toString(),
        status: response.status,
        ok: response.ok,
        content_type: response.headers.get("content-type"),
        last_modified: response.headers.get("last-modified"),
        etag: response.headers.get("etag"),
        duration_ms: Date.now() - started,
        bytes: bytes.byteLength,
        text: new TextDecoder().decode(bytes),
      };
    } finally {
      await dispatcher.close();
    }
  }
  throw new Error("Redirect limit exceeded");
}
