"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");

const SCRAPECREATORS_URL = "https://api.scrapecreators.com/v1/instagram/profile";
const ACADEMY_PROFILE_URL = "https://ovo.academy/api/internal/instagram-profile";
const INSTAGRAM_WEB_PROFILE_URL = "https://i.instagram.com/api/v1/users/web_profile_info/";
const INSTAGRAM_WEB_APP_ID = "936619743392459";
const REQUEST_TIMEOUT_MS = 9_000;
const ACADEMY_TIMEOUT_MS = 9_000;
const MAX_ACADEMY_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH = 2_000;
const MAX_PROPOSAL_TOKEN_LENGTH = 2_000;
const IMAGE_TOKEN_LIFETIME_SECONDS = 6 * 60 * 60;
const RESERVED_INSTAGRAM_ROUTES = new Set(["accounts", "about", "developer", "directory", "explore", "p", "reel", "reels", "stories", "tv"]);

const NICHE_KEYWORDS = {
  fitness: ["fitness", "gym", "workout", "training", "bodybuilding", "crossfit", "pilates", "lifting", "athlete", "coach"],
  wellness: ["wellness", "mindful", "meditation", "mental health", "self care", "selfcare", "holistic", "health"],
  fashion: ["fashion", "style", "ootd", "outfit", "streetwear", "model", "stylist"],
  beauty: ["beauty", "makeup", "skincare", "cosmetics", "mua", "haircare"],
  food: ["food", "recipe", "chef", "cooking", "baking", "foodie", "nutrition", "meal"],
  travel: ["travel", "wanderlust", "adventure", "destination", "explore", "vacation"],
  lifestyle: ["lifestyle", "daily", "vlog", "routine", "day in the life"],
  business: ["entrepreneur", "business", "founder", "marketing", "startup", "sales"],
  tech: ["tech", "technology", "gadget", "software", " ai ", "review"],
  parenting: ["mom", "mother", "dad", "father", "parenting", "family", "kids"],
  comedy: ["comedy", "comedian", "funny", "humor", "skit"],
  music: ["music", "musician", "singer", "producer", " dj ", "song"],
};

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asNumber(value, fallback = 0) {
  const number = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(number) ? number : fallback;
}

function asString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, MAX_TEXT_LENGTH);
  return normalized || fallback;
}

function optionalNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = typeof value === "string" ? Number(value) : value;
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function asBoolean(value) {
  return value === true || value === "true" || value === 1;
}

function safeUrl(value) {
  const input = asString(value);
  if (!input || input.length > 2_048) return "";
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch (_) {
    return "";
  }
}

function parseHandle(input) {
  let candidate = asString(input, "").toLowerCase();
  if (!candidate) return "";

  try {
    if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(candidate)) {
      const normalized = candidate.startsWith("http") ? candidate : `https://${candidate}`;
      const parsed = new URL(normalized);
      candidate = parsed.pathname.split("/").filter(Boolean)[0] || "";
    }
  } catch (_) {
    return "";
  }

  candidate = candidate.replace(/^@+/, "").split(/[/?#]/)[0];
  return /^[a-z0-9._]{1,30}$/.test(candidate) && !RESERVED_INSTAGRAM_ROUTES.has(candidate) ? candidate : "";
}

function proposalFromToken(value) {
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > MAX_PROPOSAL_TOKEN_LENGTH ||
    !/^[a-zA-Z0-9_-]+$/.test(value)
  ) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const proposal = {
      campaign_one: asString(decoded?.campaign_one).slice(0, 60),
      campaign_two: asString(decoded?.campaign_two).slice(0, 60),
      why: asString(decoded?.why).slice(0, 220),
    };
    const canonical = Buffer.from(JSON.stringify(proposal)).toString("base64url");
    return canonical === value ? proposal : null;
  } catch (_) {
    return null;
  }
}

function isAuthorizedQuery(query, handle) {
  const allowedKeys = new Set(["handle", "exp", "sig", "p"]);
  if (Object.keys(query || {}).some((key) => !allowedKeys.has(key))) return null;

  const rawHandle = query?.handle;
  const rawExpiry = query?.exp;
  const rawSignature = query?.sig;
  if (typeof rawHandle !== "string" || rawHandle !== handle) return null;
  if (typeof rawExpiry !== "string" || !/^[0-9]{10}$/.test(rawExpiry)) return null;
  if (typeof rawSignature !== "string" || !/^[a-f0-9]{64}$/.test(rawSignature)) return null;
  const proposal = proposalFromToken(query?.p);
  if (!proposal) return null;

  const expiry = Number(rawExpiry);
  const signature = rawSignature;
  const secret = process.env.PROPOSAL_SIGNING_SECRET;
  if (!secret || !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1_000)) return null;
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;

  const signedPayload = JSON.stringify([handle, expiry, query.p]);
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")) ? proposal : null;
}

function hasCanonicalQuery(request, handle) {
  const query = request.query || {};
  const canonical = new URLSearchParams({
    handle,
    exp: query.exp,
    sig: query.sig,
    p: query.p,
  });
  const rawQuery = String(request.url || "").split("?")[1] || "";
  return rawQuery === canonical.toString();
}

function average(posts, key) {
  if (!posts.length) return null;
  const relevant = posts.filter((post) => Number.isFinite(post[key]) && (key !== "views" || post[key] > 0));
  if (!relevant.length) return null;
  return Math.round(relevant.reduce((sum, post) => sum + post[key], 0) / relevant.length);
}

function extractNiches(text) {
  const haystack = ` ${String(text || "").toLowerCase()} `;
  return Object.entries(NICHE_KEYWORDS)
    .map(([niche, keywords]) => ({
      niche,
      score: keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.niche.localeCompare(b.niche))
    .slice(0, 3)
    .map((entry) => entry.niche);
}

function normalizePost(edgeValue) {
  const edge = asObject(edgeValue);
  const node = Object.keys(asObject(edge.node)).length ? asObject(edge.node) : edge;
  const captionEdges = asObject(node.edge_media_to_caption).edges;
  const firstCaption = Array.isArray(captionEdges) ? asObject(asObject(captionEdges[0]).node).text : "";
  const shortcode = asString(node.shortcode);
  const timestamp = asNumber(node.taken_at_timestamp, asNumber(node.taken_at));

  return {
    id: asString(node.id, asString(node.pk, shortcode)),
    caption: asString(firstCaption) || asString(node.caption) || asString(node.text),
    likes: optionalNumber(asObject(node.edge_liked_by).count, node.like_count, node.likes),
    comments: optionalNumber(asObject(node.edge_media_to_comment).count, node.comment_count, node.comments),
    views: optionalNumber(node.video_view_count, node.play_count, node.views),
    thumbnail: safeUrl(node.display_url || node.thumbnail_src || node.thumbnail_url || node.thumbnail || node.image_url),
    url: shortcode ? `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/` : safeUrl(node.url || node.permalink),
    posted_at: timestamp ? new Date(timestamp * 1_000).toISOString() : asString(node.posted_at),
  };
}

function normalizeProfile(raw, handle) {
  const root = asObject(raw);
  const data = asObject(root.data);
  const user = Object.keys(asObject(data.user)).length
    ? asObject(data.user)
    : Object.keys(asObject(root.user)).length
      ? asObject(root.user)
      : Object.keys(data).length
        ? data
        : root;

  const followers = asNumber(
    user.follower_count,
    asNumber(asObject(user.edge_followed_by).count, asNumber(user.followers_count, asNumber(user.followers))),
  );
  const following = asNumber(
    user.following_count,
    asNumber(asObject(user.edge_follow).count, asNumber(user.following)),
  );
  const postsCount = asNumber(
    user.media_count,
    asNumber(asObject(user.edge_owner_to_timeline_media).count, asNumber(user.posts_count)),
  );
  const timelineEdges = asObject(user.edge_owner_to_timeline_media).edges;
  const reelEdges = asObject(user.edge_felix_video_timeline).edges;
  const edgePosts = Array.isArray(timelineEdges) && timelineEdges.length ? timelineEdges : reelEdges;
  const rawPosts = Array.isArray(edgePosts)
    ? edgePosts
    : Array.isArray(user.posts)
      ? user.posts
      : Array.isArray(user.recent_posts)
        ? user.recent_posts
        : [];

  const recentPosts = rawPosts
    .slice(0, 12)
    .map(normalizePost)
    .filter((post) => post.thumbnail);
  const rankedPosts = [...recentPosts].sort((a, b) => {
    const aScore = (a.likes || 0) + (a.comments || 0) * 4 + (a.views || 0) * 0.02;
    const bScore = (b.likes || 0) + (b.comments || 0) * 4 + (b.views || 0) * 0.02;
    return bScore - aScore;
  });
  const avgLikes = average(recentPosts, "likes");
  const avgComments = average(recentPosts, "comments");
  const avgViews = average(recentPosts, "views");
  const engagementRate = followers > 0 && avgLikes !== null && avgComments !== null
    ? Number((((avgLikes + avgComments) / followers) * 100).toFixed(2))
    : null;
  const bio = asString(user.biography) || asString(user.bio);
  const category = asString(user.category_name) || asString(user.category);
  const captionText = recentPosts.map((post) => post.caption).join(" ");
  const niches = extractNiches(`${category} ${bio} ${captionText}`);
  const bioLinks = Array.isArray(user.bio_links) ? user.bio_links : [];
  const firstBioLink = safeUrl(asObject(bioLinks[0]).url);

  return {
    handle,
    full_name: asString(user.full_name) || asString(user.name) || handle,
    bio,
    category,
    followers,
    following,
    posts_count: postsCount,
    verified: asBoolean(user.is_verified ?? user.verified),
    profile_pic_url: safeUrl(user.profile_pic_url_hd || user.profile_pic_url || user.profile_picture),
    external_url: safeUrl(user.external_url || user.website) || firstBioLink,
    recent_posts: recentPosts,
    top_posts: rankedPosts.slice(0, 3),
    avg_likes: avgLikes,
    avg_comments: avgComments,
    avg_views: avgViews,
    engagement_rate: engagementRate,
    niche_hints: niches,
    sample_size: recentPosts.length,
    fetched_at: new Date().toISOString(),
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
          `[instagram-profile] Instagram fallback ${response.status} for @${handle}`,
        );
        continue;
      }
      const profile = normalizeProfile(await response.json(), handle);
      if (profile.profile_pic_url || profile.followers || profile.bio) {
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
      `[instagram-profile] Academy fallback is not configured for @${handle}`,
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
        `[instagram-profile] Academy fallback HTTP ${response.status} for @${handle}`,
      );
      return null;
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_ACADEMY_RESPONSE_BYTES
    ) {
      console.warn(
        `[instagram-profile] Academy fallback response too large for @${handle}`,
      );
      return null;
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_ACADEMY_RESPONSE_BYTES) {
      console.warn(
        `[instagram-profile] Academy fallback response too large for @${handle}`,
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
    const profile = normalizeProfile(raw, handle);
    if (
      !profile.profile_pic_url &&
      !profile.followers &&
      !profile.bio &&
      !profile.recent_posts.length
    ) {
      return null;
    }
    console.log(
      `[instagram-profile] Academy fallback OK @${handle} posts=${profile.sample_size}`,
    );
    return profile;
  } catch (error) {
    console.warn(
      `[instagram-profile] Academy fallback ${
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
    console.log(`[instagram-profile] public fallback OK @${handle}`);
    return publicProfile;
  }
  return fetchAcademyProfile(handle);
}

function proxyImageUrl(source, secret, expiry) {
  if (!source) return "";
  const urlToken = Buffer.from(source, "utf8").toString("base64url");
  const signedPayload = JSON.stringify([urlToken, expiry]);
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `/api/instagram-image?${new URLSearchParams({ u: urlToken, exp: String(expiry), sig: signature }).toString()}`;
}

function proxyProfileImages(profile, secret) {
  const expiry = Math.floor(Date.now() / 1_000) + IMAGE_TOKEN_LIFETIME_SECONDS;
  const cache = new Map();
  const proxy = (source) => {
    if (!source) return "";
    if (!cache.has(source)) cache.set(source, proxyImageUrl(source, secret, expiry));
    return cache.get(source);
  };

  return {
    ...profile,
    profile_pic_url: proxy(profile.profile_pic_url),
    recent_posts: profile.recent_posts.map((post) => ({ ...post, thumbnail: proxy(post.thumbnail) })),
    top_posts: profile.top_posts.map((post) => ({ ...post, thumbnail: proxy(post.thumbnail) })),
  };
}

function sendJson(response, status, body, cacheable = false) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader(
    "Cache-Control",
    cacheable
      ? "public, max-age=60, s-maxage=3600, stale-while-revalidate=3600"
      : "private, no-store, max-age=0",
  );
  if (cacheable) response.setHeader("Vercel-CDN-Cache-Control", "max-age=3600, stale-while-revalidate=3600");
  response.end(JSON.stringify(body));
}

module.exports = async function instagramProfile(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const handle = parseHandle(request.query?.handle);
  if (!handle) return sendJson(response, 400, { error: "Enter a valid Instagram handle." });
  const proposal = isAuthorizedQuery(request.query, handle);
  if (!proposal || !hasCanonicalQuery(request, handle)) {
    return sendJson(response, 401, { error: "This proposal link is invalid or has expired." });
  }
  if (process.env.SC_HARD_DISABLED === "true") {
    return sendJson(response, 503, { error: "Profile enrichment is temporarily paused." });
  }

  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) {
    const fallbackProfile = await fetchFallbackProfile(handle);
    if (fallbackProfile) {
      const browserProfile = proxyProfileImages(
        fallbackProfile,
        process.env.PROPOSAL_SIGNING_SECRET,
      );
      return sendJson(response, 200, { profile: browserProfile, proposal }, true);
    }
    return sendJson(response, 503, {
      error: "Profile enrichment is not configured.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${SCRAPECREATORS_URL}?handle=${encodeURIComponent(handle)}`, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!upstream.ok) {
      console.error(`[instagram-profile] ScrapeCreators ${upstream.status} for @${handle}`);
      const fallbackProfile = await fetchFallbackProfile(handle);
      if (fallbackProfile) {
        const browserProfile = proxyProfileImages(
          fallbackProfile,
          process.env.PROPOSAL_SIGNING_SECRET,
        );
        return sendJson(response, 200, { profile: browserProfile, proposal }, true);
      }
      if (upstream.status === 404) {
        return sendJson(response, 404, {
          error: `No public profile found for @${handle}.`,
        });
      }
      return sendJson(response, 502, { error: "Instagram profile data is temporarily unavailable." });
    }

    const profile = normalizeProfile(await upstream.json(), handle);
    if (!profile.profile_pic_url && !profile.followers && !profile.recent_posts.length) {
      return sendJson(response, 404, { error: `No usable public profile found for @${handle}.` });
    }

    const browserProfile = proxyProfileImages(profile, process.env.PROPOSAL_SIGNING_SECRET);
    console.log(`[instagram-profile] OK @${handle} posts=${profile.sample_size}`);
    return sendJson(response, 200, { profile: browserProfile, proposal }, true);
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    console.error(`[instagram-profile] ${timedOut ? "timeout" : "failure"} for @${handle}`);
    const fallbackProfile = await fetchFallbackProfile(handle);
    if (fallbackProfile) {
      const browserProfile = proxyProfileImages(
        fallbackProfile,
        process.env.PROPOSAL_SIGNING_SECRET,
      );
      return sendJson(response, 200, { profile: browserProfile, proposal }, true);
    }
    return sendJson(response, 502, { error: timedOut ? "Instagram profile lookup timed out." : "Instagram profile data is temporarily unavailable." });
  } finally {
    clearTimeout(timeout);
  }
};
