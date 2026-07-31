import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
} from "node:zlib";

const DEFAULT_MAX_BYTES = 5_000_000;
const DEFAULT_MAX_WIRE_BYTES = 15_000_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const dnsCache = new Map();

function normalizedHost(value) {
  return String(value || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/^www\./, "");
}

function hostWithinDomain(host, domain) {
  const value = normalizedHost(host);
  const expected = normalizedHost(domain);
  return value === expected || value.endsWith(`.${expected}`);
}

export function isPublicIpAddress(address) {
  const normalized = String(address || "").toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) {
    const [a, b, c] = normalized.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family === 6) {
    const mapped = normalized.match(
      /^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/,
    )?.[1];
    if (mapped) return isPublicIpAddress(mapped);
    const mappedHex = normalized.match(
      /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
    );
    if (mappedHex) {
      const high = Number.parseInt(mappedHex[1], 16);
      const low = Number.parseInt(mappedHex[2], 16);
      return isPublicIpAddress(
        `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
      );
    }
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

async function resolvePublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!dnsCache.has(host)) {
    dnsCache.set(
      host,
      (async () => {
        const family = isIP(host);
        const addresses = family
          ? [{ address: host, family }]
          : await lookup(host, { all: true, verbatim: true });
        if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
          throw new Error(`refused non-public network target ${host}`);
        }
        return addresses;
      })(),
    );
  }
  return dnsCache.get(host);
}

function decodeBody(buffer, encoding, maxBytes) {
  const options = { maxOutputLength: maxBytes };
  const normalized = String(encoding || "").toLowerCase();
  if (normalized.includes("gzip")) return gunzipSync(buffer, options);
  if (normalized.includes("br")) return brotliDecompressSync(buffer, options);
  if (normalized.includes("deflate")) return inflateSync(buffer, options);
  return buffer.subarray(0, maxBytes);
}

function pinnedRequest(url, { method, headers, timeoutMs, maxWireBytes }, addresses) {
  const parsed = new URL(url);
  const transport = parsed.protocol === "https:" ? https : http;
  let addressIndex = 0;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      parsed,
      {
        method,
        headers,
        servername: parsed.hostname,
        lookup: (_hostname, options, callback) => {
          const all = typeof options === "object" && options?.all;
          if (all) return callback(null, addresses);
          const selected = addresses[addressIndex++ % addresses.length];
          return callback(null, selected.address, selected.family);
        },
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maxWireBytes) {
            request.destroy(new Error(`response exceeded ${maxWireBytes} wire bytes`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
    request.on("error", reject);
    request.end();
  });
}

/**
 * Anonymous public HTTP helper. Only GET and HEAD are accepted. DNS is resolved
 * and pinned to public addresses before every request; redirects must remain on
 * the fixed first-party domain.
 */
export async function publicHttp(
  value,
  {
    method = "GET",
    expectedDomain,
    headers = {},
    timeoutMs = 25_000,
    maxBytes = DEFAULT_MAX_BYTES,
    maxWireBytes = DEFAULT_MAX_WIRE_BYTES,
    maxRedirects = 5,
  } = {},
) {
  const normalizedMethod = String(method).toUpperCase();
  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    throw new Error(`publicHttp only permits GET or HEAD; got ${normalizedMethod}`);
  }
  if (!expectedDomain) throw new Error("publicHttp requires a fixed expectedDomain");

  let current = new URL(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (current.protocol !== "https:") {
      throw new Error(`publicHttp requires HTTPS; got ${current.protocol}`);
    }
    if (!hostWithinDomain(current.hostname, expectedDomain)) {
      throw new Error(`refused unrelated host ${current.hostname}; expected ${expectedDomain}`);
    }
    const addresses = await resolvePublic(current.hostname);
    const response = await pinnedRequest(
      current,
      {
        method: normalizedMethod,
        headers: {
          accept: "text/html,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.1",
          "accept-encoding": "gzip, deflate, br",
          "user-agent":
            "NoliCompetitorObservatory/1.0 (+anonymous public GET/HEAD; no forms, account, cart, checkout, or transaction)",
          ...headers,
        },
        timeoutMs,
        maxWireBytes,
      },
      addresses,
    );
    const location = response.headers.location;
    if (REDIRECTS.has(response.status) && location) {
      if (redirect === maxRedirects) throw new Error("redirect limit exceeded");
      current = new URL(location, current);
      continue;
    }
    const decoded =
      normalizedMethod === "HEAD"
        ? Buffer.alloc(0)
        : decodeBody(response.body, response.headers["content-encoding"], maxBytes);
    return {
      status: response.status,
      headers: response.headers,
      body: decoded.toString("utf8"),
      url: current.toString(),
    };
  }
  throw new Error("redirect limit exceeded");
}
