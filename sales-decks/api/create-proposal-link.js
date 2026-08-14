"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");

const LINK_LIFETIME_SECONDS = 90 * 24 * 60 * 60;
const MIN_CUSTOM_LINK_LIFETIME_SECONDS = 60;
const MAX_CUSTOM_LINK_LIFETIME_SECONDS = 60 * 60;
const RESERVED_INSTAGRAM_ROUTES = new Set(["accounts", "about", "developer", "directory", "explore", "p", "reel", "reels", "stories", "tv"]);

function asString(value, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseHandle(input) {
  let candidate = asString(input, 200).toLowerCase();
  if (!candidate) return "";
  try {
    if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(candidate)) {
      const normalized = candidate.startsWith("http") ? candidate : `https://${candidate}`;
      candidate = new URL(normalized).pathname.split("/").filter(Boolean)[0] || "";
    }
  } catch (_) {
    return "";
  }
  candidate = candidate.replace(/^@+/, "").split(/[/?#]/)[0];
  return /^[a-z0-9._]{1,30}$/.test(candidate) && !RESERVED_INSTAGRAM_ROUTES.has(candidate) ? candidate : "";
}

function sameSecret(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (!providedBuffer.length || providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function linkLifetimeSeconds(value) {
  if (value === undefined || value === null || value === "") {
    return LINK_LIFETIME_SECONDS;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_CUSTOM_LINK_LIFETIME_SECONDS ||
    parsed > MAX_CUSTOM_LINK_LIFETIME_SECONDS
  ) {
    return null;
  }
  return parsed;
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.end(JSON.stringify(body));
}

module.exports = async function createProposalLink(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  let body = request.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return sendJson(response, 400, { error: "Invalid request." });
    }
  }

  const accessCode = process.env.PROPOSAL_ACCESS_CODE;
  const academyBridgeCode = process.env.ACADEMY_BRIDGE_ACCESS_CODE;
  const signingSecret = process.env.PROPOSAL_SIGNING_SECRET;
  if (!accessCode || !signingSecret) {
    return sendJson(response, 503, { error: "Proposal generation is not configured." });
  }
  if (
    !sameSecret(body.access_code, accessCode) &&
    !sameSecret(body.access_code, academyBridgeCode)
  ) {
    return sendJson(response, 401, { error: "Incorrect presentation access code." });
  }

  const handle = parseHandle(body.handle);
  if (!handle) return sendJson(response, 400, { error: "Enter a valid Instagram handle." });

  const lifetimeSeconds = linkLifetimeSeconds(body.link_lifetime_seconds);
  if (lifetimeSeconds === null) {
    return sendJson(response, 400, { error: "Invalid link lifetime." });
  }

  const expiry = Math.floor(Date.now() / 1_000) + lifetimeSeconds;
  const campaignOne = asString(body.campaign_one, 60);
  const campaignTwo = asString(body.campaign_two, 60);
  const why = asString(body.why, 220);
  const proposalToken = Buffer.from(JSON.stringify({ campaign_one: campaignOne, campaign_two: campaignTwo, why })).toString("base64url");
  const signedPayload = JSON.stringify([handle, expiry, proposalToken]);
  const signature = createHmac("sha256", signingSecret).update(signedPayload).digest("hex");
  const query = new URLSearchParams({ ig: handle, exp: String(expiry), sig: signature, p: proposalToken });

  return sendJson(response, 200, {
    path: `/creator.html?${query.toString()}#1`,
    handle,
    expires_at: new Date(expiry * 1_000).toISOString(),
  });
};
