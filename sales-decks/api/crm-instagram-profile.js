"use strict";

const { timingSafeEqual } = require("node:crypto");

const SCRAPECREATORS_URL =
  "https://api.scrapecreators.com/v1/instagram/profile";
const ACADEMY_PROFILE_URL =
  "https://ovo.academy/api/internal/instagram-profile";
const INSTAGRAM_WEB_PROFILE_URL =
  "https://i.instagram.com/api/v1/users/web_profile_info/";
const INSTAGRAM_WEB_APP_ID = "936619743392459";
const REQUEST_TIMEOUT_MS = 9_000;
const ACADEMY_TIMEOUT_MS = 9_000;
const MAX_ACADEMY_RESPONSE_BYTES = 2 * 1024 * 1024;
const RESERVED = new Set([
  "about",
  "accounts",
  "developer",
  "directory",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.end(JSON.stringify(body));
}

function sameSecret(provided, expected) {
  const left = Buffer.from(String(provided || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function parseHandle(value) {
  const handle = String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) && !RESERVED.has(handle)
    ? handle
    : "";
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = 0) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 2_048) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch (_) {
    return "";
  }
}

function normalize(raw, handle) {
  const root = object(raw);
  const data = object(root.data);
  const user = Object.keys(object(data.user)).length
    ? object(data.user)
    : Object.keys(object(root.user)).length
      ? object(root.user)
      : Object.keys(data).length
        ? data
        : root;
  const bio = String(user.biography || user.bio || "").trim().slice(0, 2_200);
  const followers = number(
    user.follower_count,
    number(object(user.edge_followed_by).count, number(user.followers_count, number(user.followers))),
  );
  return {
    handle,
    bio,
    followers,
    profile_pic_url: safeHttpsUrl(
      user.profile_pic_url_hd || user.profile_pic_url || user.profile_picture,
    ),
  };
}

async function fetchInstagramWebProfile(handle) {
  const urls = [
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
    `${INSTAGRAM_WEB_PROFILE_URL}?username=${encodeURIComponent(handle)}`,
  ];
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.instagram.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          "x-ig-app-id": INSTAGRAM_WEB_APP_ID,
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn(
          `[crm-instagram-profile] Instagram fallback ${response.status} for @${handle}`,
        );
        continue;
      }
      const profile = normalize(await response.json(), handle);
      if (profile.bio || profile.followers || profile.profile_pic_url) {
        return profile;
      }
    } catch (_) {
      // Try the second public host before declaring the provider unavailable.
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchAcademyProfile(handle) {
  const bridgeCode = String(
    process.env.ACADEMY_PROFILE_BRIDGE_SECRET || "",
  ).trim();
  if (!bridgeCode) {
    console.warn(
      `[crm-instagram-profile] Academy fallback is not configured for @${handle}`,
    );
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACADEMY_TIMEOUT_MS);
  try {
    const response = await fetch(ACADEMY_PROFILE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bridgeCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handle }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(
        `[crm-instagram-profile] Academy fallback HTTP ${response.status} for @${handle}`,
      );
      return null;
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_ACADEMY_RESPONSE_BYTES
    ) {
      console.warn(
        `[crm-instagram-profile] Academy fallback response too large for @${handle}`,
      );
      return null;
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_ACADEMY_RESPONSE_BYTES) {
      console.warn(
        `[crm-instagram-profile] Academy fallback response too large for @${handle}`,
      );
      return null;
    }
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (_) {
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const profile = normalize(raw, handle);
    if (!profile.bio && !profile.followers && !profile.profile_pic_url) {
      return null;
    }
    console.log(`[crm-instagram-profile] Academy fallback OK @${handle}`);
    return profile;
  } catch (error) {
    console.warn(
      `[crm-instagram-profile] Academy fallback ${
        error && error.name === "AbortError" ? "timeout" : "failed"
      } for @${handle}`,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFallbackProfile(handle) {
  const publicProfile = await fetchInstagramWebProfile(handle);
  if (publicProfile) {
    console.log(`[crm-instagram-profile] public fallback OK @${handle}`);
    return publicProfile;
  }
  return fetchAcademyProfile(handle);
}

module.exports = async function crmInstagramProfile(request, response) {
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
  const academyCode = process.env.ACADEMY_BRIDGE_ACCESS_CODE;
  const fallbackCode = process.env.PROPOSAL_ACCESS_CODE;
  if (
    !sameSecret(body.access_code, academyCode) &&
    !sameSecret(body.access_code, fallbackCode)
  ) {
    return sendJson(response, 401, { error: "Unauthorized." });
  }
  const handle = parseHandle(body.handle);
  if (!handle) return sendJson(response, 400, { error: "Invalid handle." });
  if (process.env.SC_HARD_DISABLED === "true") {
    return sendJson(response, 503, { error: "Profile verification is paused." });
  }
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) {
    const fallbackProfile = await fetchFallbackProfile(handle);
    if (fallbackProfile) return sendJson(response, 200, fallbackProfile);
    return sendJson(response, 503, {
      error: "Profile verification is unavailable.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(
      `${SCRAPECREATORS_URL}?handle=${encodeURIComponent(handle)}`,
      {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!upstream.ok) {
      console.error(
        `[crm-instagram-profile] ScrapeCreators ${upstream.status} for @${handle}`,
      );
      const fallbackProfile = await fetchFallbackProfile(handle);
      if (fallbackProfile) {
        return sendJson(response, 200, fallbackProfile);
      }
      return sendJson(response, upstream.status === 404 ? 404 : 502, {
        error:
          upstream.status === 404
            ? "Profile not found."
            : "Profile verification failed.",
      });
    }
    const profile = normalize(await upstream.json(), handle);
    if (!profile.bio && !profile.followers && !profile.profile_pic_url) {
      return sendJson(response, 404, { error: "Profile not found." });
    }
    console.log(`[crm-instagram-profile] OK @${handle}`);
    return sendJson(response, 200, profile);
  } catch (error) {
    const fallbackProfile = await fetchFallbackProfile(handle);
    if (fallbackProfile) {
      return sendJson(response, 200, fallbackProfile);
    }
    return sendJson(response, error && error.name === "AbortError" ? 504 : 502, {
      error: "Profile verification failed.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
