"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");

const LINK_LIFETIME_SECONDS = 90 * 24 * 60 * 60;
const MIN_CUSTOM_LINK_LIFETIME_SECONDS = 60;
const MAX_CUSTOM_LINK_LIFETIME_SECONDS = 60 * 60;
const MAX_TOKEN_LENGTH = 2_000;
const ACCENT_PALETTE = ["#facc15", "#ff7657", "#58d6ff", "#b9ff66", "#ff7bd5", "#c6a7ff"];
const KNOWN_BRANDS = [
  { aliases: ["fitia", "fitia.app"], name: "Fitia", logo: "assets/brands/fitia.png", accent: "#facc15", campaign: "Performance creator campaign" },
  { aliases: ["nike", "nike.com"], name: "Nike", logo: "assets/brands/nike.png", accent: "#f4f1ea", campaign: "Athlete creator campaign" },
  { aliases: ["celsius", "celsius.com", "celsiusenergy.com"], name: "Celsius", logo: "assets/brands/celsius.png", accent: "#ff7657", campaign: "Performance energy campaign" },
  { aliases: ["gatorade", "gatorade.com"], name: "Gatorade", logo: "assets/brands/gatorade.png", accent: "#ff8a3d", campaign: "Sports performance campaign" },
  { aliases: ["gymshark", "gymshark.com"], name: "Gymshark", logo: "assets/brands/gymshark.png", accent: "#58d6ff", campaign: "Training creator campaign" },
  { aliases: ["teveo", "teveo.com"], name: "TEVEO", logo: "assets/brands/teveo.png", accent: "#f4f1ea", campaign: "Performance apparel campaign" },
  { aliases: ["aybl", "beaybl.com"], name: "AYBL", logo: "assets/brands/aybl.png", accent: "#ff7bd5", campaign: "Activewear creator campaign" },
  { aliases: ["prosupps", "prosupps.com"], name: "ProSupps", logo: "assets/brands/prosupps.png", accent: "#b9ff66", campaign: "Sports nutrition campaign" },
  { aliases: ["vital form", "vitalform.com"], name: "Vital Form", logo: "assets/brands/vital-form.png", accent: "#b9ff66", campaign: "Wellness creator campaign" },
  { aliases: ["madore", "madoreathletics.com"], name: "Madore Athletics", logo: "assets/brands/madore.png", accent: "#c6a7ff", campaign: "Activewear creator campaign" },
  { aliases: ["mealo", "mealo.com"], name: "Mealo", logo: "assets/brands/mealo.png", accent: "#facc15", campaign: "Nutrition creator campaign" },
  { aliases: ["hea ai", "hea.ai"], name: "Hea AI", logo: "assets/brands/hea-ai.png", accent: "#58d6ff", campaign: "Health technology creator campaign" },
];

function asString(value, max = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanBrandName(value) {
  const name = asString(value, 48).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(name) ? name : "";
}

function cleanCampaign(value) {
  return asString(value, 72).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

function cleanDomain(value) {
  let candidate = asString(value, 180).toLowerCase();
  if (!candidate) return "";
  try {
    if (!/^https?:\/\//.test(candidate)) candidate = `https://${candidate}`;
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return "";
    const hostname = url.hostname.replace(/^www\./, "");
    if (!hostname || hostname.length > 120 || !hostname.includes(".")) return "";
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return "";
    return hostname;
  } catch (_) {
    return "";
  }
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

function safeSignatureEqual(provided, expected) {
  if (!/^[a-f0-9]{64}$/i.test(String(provided || ""))) return false;
  return timingSafeEqual(Buffer.from(String(provided)), Buffer.from(expected));
}

function monogram(name) {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2)).toUpperCase();
}

function colorFor(name) {
  const hash = [...name].reduce((total, character) => (total * 31 + character.codePointAt(0)) >>> 0, 0);
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

function knownBrand(name, domain) {
  const normalizedName = name.toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  return KNOWN_BRANDS.find((brand) => brand.aliases.some((alias) => (
    normalizedName === alias ||
    normalizedName.startsWith(`${alias} `) ||
    normalizedDomain === alias ||
    normalizedDomain.endsWith(`.${alias}`)
  )));
}

function brandIdentity(name, domain, requestedCampaign) {
  const known = knownBrand(name, domain);
  const canonicalName = known?.name || name;
  const samples = {
    Fitia: {
      creator: "Maria",
      deliverable: "Macro-tracking launch reel",
      feedback: "Hold the app scan for one more beat. Keep the download CTA on the final frame.",
    },
    Nike: {
      creator: "Athlete creator",
      deliverable: "Training launch reel",
      feedback: "Open on the athlete, then hold the product detail before the final lockup.",
    },
    Celsius: {
      creator: "Performance creator",
      deliverable: "Energy routine reel",
      feedback: "Keep the product visible through the transition and land the final CTA cleanly.",
    },
    Gatorade: {
      creator: "Athlete creator",
      deliverable: "Training-day reel",
      feedback: "Extend the hydration moment and keep the product lockup on the final frame.",
    },
    Gymshark: {
      creator: "Training creator",
      deliverable: "New collection reel",
      feedback: "Hold the fit detail one more beat and move the CTA to the final frame.",
    },
    TEVEO: {
      creator: "Fitness creator",
      deliverable: "Activewear launch reel",
      feedback: "Keep the full-look reveal longer and land the collection name at the end.",
    },
    AYBL: {
      creator: "Fitness creator",
      deliverable: "Collection launch reel",
      feedback: "Give the fabric detail another beat and keep the final CTA on screen longer.",
    },
  };
  const sample = samples[canonicalName] || {
    creator: "Creator 01",
    deliverable: `${canonicalName} campaign reel`,
    feedback: `Hold the ${canonicalName} product frame one more beat. Keep the CTA on the final frame.`,
  };
  return {
    name: canonicalName,
    domain,
    campaign: requestedCampaign || known?.campaign || `${canonicalName} creator campaign`,
    logo: known?.logo || "",
    monogram: monogram(canonicalName),
    accent: known?.accent || colorFor(canonicalName),
    creator: sample.creator,
    deliverable: sample.deliverable,
    due: "Due in 2 days",
    feedback: sample.feedback,
    response: "Updated in v2. Timing adjusted and the final CTA is locked. Ready for review.",
    health: "4 of 6 approved",
  };
}

function signedPayload(expiry, token) {
  return JSON.stringify(["brand", expiry, token]);
}

function signatureFor(secret, expiry, token) {
  return createHmac("sha256", secret).update(signedPayload(expiry, token)).digest("hex");
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.end(JSON.stringify(body));
}

function requestQuery(request) {
  if (request.query) return request.query;
  try {
    return Object.fromEntries(new URL(request.url, "https://decks.ovotalent.com").searchParams.entries());
  } catch (_) {
    return {};
  }
}

module.exports = async function brandPresentation(request, response) {
  const accessCode = process.env.PROPOSAL_ACCESS_CODE;
  const academyBridgeCode = process.env.ACADEMY_BRIDGE_ACCESS_CODE;
  const signingSecret = process.env.PROPOSAL_SIGNING_SECRET;
  if (!accessCode || !signingSecret) {
    return sendJson(response, 503, { error: "Brand presentation generation is not configured." });
  }

  if (request.method === "POST") {
    let body = request.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {
        return sendJson(response, 400, { error: "Invalid request." });
      }
    }
    if (
      !sameSecret(body.access_code, accessCode) &&
      !sameSecret(body.access_code, academyBridgeCode)
    ) {
      return sendJson(response, 401, { error: "Incorrect presentation access code." });
    }

    const brandName = cleanBrandName(body.brand_name);
    const domain = cleanDomain(body.brand_domain);
    const campaign = cleanCampaign(body.campaign_name);
    if (!brandName) return sendJson(response, 400, { error: "Enter a valid brand name." });
    if (body.brand_domain && !domain) return sendJson(response, 400, { error: "Enter a valid public brand website or domain." });

    const lifetimeSeconds = linkLifetimeSeconds(body.link_lifetime_seconds);
    if (lifetimeSeconds === null) {
      return sendJson(response, 400, { error: "Invalid link lifetime." });
    }

    const expiry = Math.floor(Date.now() / 1_000) + lifetimeSeconds;
    const token = Buffer.from(JSON.stringify({ name: brandName, domain, campaign })).toString("base64url");
    const signature = signatureFor(signingSecret, expiry, token);
    const query = new URLSearchParams({ b: token, exp: String(expiry), sig: signature });

    return sendJson(response, 200, {
      path: `/brands.html?${query.toString()}#1`,
      brand_name: brandIdentity(brandName, domain, campaign).name,
      expires_at: new Date(expiry * 1_000).toISOString(),
    });
  }

  if (request.method === "GET") {
    const query = requestQuery(request);
    const token = asString(query.b, MAX_TOKEN_LENGTH);
    const expiry = Number.parseInt(asString(query.exp, 20), 10);
    const providedSignature = asString(query.sig, 80);
    if (!token || !Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1_000)) {
      return sendJson(response, 401, { error: "This brand presentation link is invalid or expired." });
    }

    const expectedSignature = signatureFor(signingSecret, expiry, token);
    if (!safeSignatureEqual(providedSignature, expectedSignature)) {
      return sendJson(response, 401, { error: "This brand presentation link is invalid or expired." });
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    } catch (_) {
      return sendJson(response, 400, { error: "Invalid brand presentation." });
    }

    const brandName = cleanBrandName(payload.name);
    const domain = cleanDomain(payload.domain);
    const campaign = cleanCampaign(payload.campaign);
    if (!brandName || (payload.domain && !domain)) {
      return sendJson(response, 400, { error: "Invalid brand presentation." });
    }

    return sendJson(response, 200, { brand: brandIdentity(brandName, domain, campaign) });
  }

  response.setHeader("Allow", "GET, POST");
  return sendJson(response, 405, { error: "Method not allowed." });
};
