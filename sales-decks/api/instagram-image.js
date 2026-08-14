"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

function sendError(response, status, message) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.end(JSON.stringify({ error: message }));
}

function isAllowedInstagramHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "cdninstagram.com" || host.endsWith(".cdninstagram.com") || host === "fbcdn.net" || host.endsWith(".fbcdn.net");
}

function authorizedSource(request) {
  const query = request.query || {};
  if (Object.keys(query).some((key) => !["u", "exp", "sig"].includes(key))) return null;
  if (typeof query.u !== "string" || !/^[a-zA-Z0-9_-]{40,6000}$/.test(query.u)) return null;
  if (typeof query.exp !== "string" || !/^[0-9]{10}$/.test(query.exp)) return null;
  if (typeof query.sig !== "string" || !/^[a-f0-9]{64}$/.test(query.sig)) return null;

  const canonical = new URLSearchParams({ u: query.u, exp: query.exp, sig: query.sig }).toString();
  const rawQuery = String(request.url || "").split("?")[1] || "";
  if (rawQuery !== canonical) return null;

  const expiry = Number(query.exp);
  const secret = process.env.PROPOSAL_SIGNING_SECRET;
  if (!secret || expiry <= Math.floor(Date.now() / 1_000)) return null;
  const expected = createHmac("sha256", secret)
    .update(JSON.stringify([query.u, expiry]))
    .digest("hex");
  if (!timingSafeEqual(Buffer.from(query.sig, "hex"), Buffer.from(expected, "hex"))) return null;

  try {
    const decoded = Buffer.from(query.u, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== query.u) return null;
    const source = new URL(decoded);
    if (source.protocol !== "https:" || !isAllowedInstagramHost(source.hostname)) return null;
    return source.href;
  } catch (_) {
    return null;
  }
}

module.exports = async function instagramImage(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendError(response, 405, "Method not allowed.");
  }

  const source = authorizedSource(request);
  if (!source) return sendError(response, 401, "Invalid or expired image request.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(source, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; OVOTalentProposal/1.0)",
      },
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!upstream.ok || upstream.status >= 300) return sendError(response, 502, "Creator image is temporarily unavailable.");

    const contentType = String(upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (!ALLOWED_IMAGE_TYPES.has(contentType) || (contentLength && contentLength > MAX_IMAGE_BYTES)) {
      return sendError(response, 415, "Unsupported creator image.");
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return sendError(response, 415, "Unsupported creator image.");

    response.statusCode = 200;
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", String(bytes.length));
    response.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600");
    response.setHeader("Vercel-CDN-Cache-Control", "max-age=3600, stale-while-revalidate=3600");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response.end(bytes);
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    console.error(`[instagram-image] ${timedOut ? "timeout" : "failure"}`);
    return sendError(response, 502, "Creator image is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
};
