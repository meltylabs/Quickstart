import { createRemoteJWKSet, jwtVerify } from "jose";

const OPERATOR_COOKIE = "__Host-biologix_operator";
const AFFILIATE_COOKIE = "biologix_session";
const OPERATOR_SESSION_TTL_SECONDS = 8 * 60 * 60;
const AFFILIATE_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const GATEWAY_CLOCK_SKEW_SECONDS = 60;
const encoder = new TextEncoder();
const accessJwks = new Map();

const JSON_BODY = Object.freeze({
  contentTypes: ["application/json"],
  required: true,
});
const OPTIONAL_JSON_BODY = Object.freeze({
  contentTypes: ["application/json"],
  required: false,
});
const FORM_OR_JSON_BODY = Object.freeze({
  contentTypes: [
    "application/json",
    "application/x-www-form-urlencoded",
  ],
  required: true,
});
const OPTIONAL_FORM_OR_JSON_BODY = Object.freeze({
  contentTypes: [
    "application/json",
    "application/x-www-form-urlencoded",
  ],
  required: false,
});
const NO_BODY = Object.freeze({
  contentTypes: [],
  maxBytes: 0,
  required: false,
});

const CREATOR_ROUTES = Object.freeze({
  login: Object.freeze({
    POST: Object.freeze({
      body: { ...JSON_BODY, maxBytes: 4 * 1024 },
      forwardSession: false,
      responseSession: "none",
    }),
  }),
  redeem: Object.freeze({
    GET: Object.freeze({
      body: NO_BODY,
      forwardSession: false,
      responseSession: "none",
    }),
    POST: Object.freeze({
      body: { ...FORM_OR_JSON_BODY, maxBytes: 16 * 1024 },
      forwardSession: false,
      responseSession: "set",
    }),
  }),
  logout: Object.freeze({
    POST: Object.freeze({
      body: { ...OPTIONAL_FORM_OR_JSON_BODY, maxBytes: 2 * 1024 },
      forwardSession: true,
      responseSession: "clear",
    }),
  }),
  enrollment: Object.freeze({
    GET: Object.freeze({
      body: NO_BODY,
      forwardSession: true,
      responseSession: "none",
    }),
    PATCH: Object.freeze({
      body: { ...JSON_BODY, maxBytes: 64 * 1024 },
      forwardSession: true,
      responseSession: "none",
    }),
  }),
  identity: Object.freeze({
    GET: Object.freeze({
      body: NO_BODY,
      forwardSession: true,
      responseSession: "none",
    }),
    POST: Object.freeze({
      body: { ...OPTIONAL_JSON_BODY, maxBytes: 2 * 1024 },
      forwardSession: true,
      responseSession: "none",
    }),
  }),
  payout: Object.freeze({
    POST: Object.freeze({
      body: { ...OPTIONAL_JSON_BODY, maxBytes: 2 * 1024 },
      forwardSession: true,
      responseSession: "none",
    }),
  }),
  tax: Object.freeze({
    POST: Object.freeze({
      body: { ...OPTIONAL_JSON_BODY, maxBytes: 2 * 1024 },
      forwardSession: true,
      responseSession: "none",
    }),
  }),
  content: Object.freeze({
    PATCH: Object.freeze({
      body: { ...JSON_BODY, maxBytes: 256 * 1024 },
      forwardSession: true,
      responseSession: "none",
    }),
    POST: Object.freeze({
      body: { ...JSON_BODY, maxBytes: 256 * 1024 },
      forwardSession: true,
      responseSession: "none",
    }),
  }),
  help: Object.freeze({
    POST: Object.freeze({
      body: { ...JSON_BODY, maxBytes: 8 * 1024 },
      forwardSession: true,
      responseSession: "none",
    }),
  }),
});

const CONTROL_TOWER_BODY_POLICIES = Object.freeze({
  projection: Object.freeze({
    GET: NO_BODY,
    HEAD: NO_BODY,
  }),
  action: Object.freeze({
    POST: Object.freeze({ ...JSON_BODY, maxBytes: 256 * 1024 }),
  }),
});

const SAFE_UPSTREAM_RESPONSE_HEADERS = Object.freeze([
  "Allow",
  "Content-Encoding",
  "Content-Language",
  "Content-Type",
  "Retry-After",
]);

const TRACKING_REQUEST_HEADERS = Object.freeze([
  "Referer",
  "X-Biologix-Probe",
  "X-Biologix-Probe-Signature",
]);

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256Bytes(value) {
  return new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      typeof value === "string" ? encoder.encode(value) : value,
    ),
  );
}

async function sha256Hex(value) {
  const digest = await sha256Bytes(value);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function hmacBytes(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

async function secureTextEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    sha256Bytes(left),
    sha256Bytes(right),
  ]);
  if (leftHash.length !== rightHash.length) return false;
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

function configuredSecret(value, minimumBytes) {
  return (
    typeof value === "string" &&
    encoder.encode(value).byteLength >= minimumBytes
  );
}

function cookiesFromRequest(request) {
  const values = new Map();
  const raw = request.headers.get("Cookie") ?? "";
  for (const pair of raw.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name) values.set(name, value);
  }
  return values;
}

function sameOriginMutation(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function requestContentType(request) {
  return (request.headers.get("Content-Type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function requestBodyError(error, status) {
  return json({ ok: false, error }, { status });
}

async function readLimitedRequestBody(request, policy) {
  const maxBytes = policy.maxBytes;
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) {
      return {
        ok: false,
        response: requestBodyError("bad_content_length", 400),
      };
    }
    if (Number(declaredLength) > maxBytes) {
      return {
        ok: false,
        response: requestBodyError("request_too_large", 413),
      };
    }
  }

  const contentEncoding = (
    request.headers.get("Content-Encoding") ?? "identity"
  )
    .trim()
    .toLowerCase();
  if (contentEncoding !== "identity") {
    return {
      ok: false,
      response: requestBodyError("unsupported_content_encoding", 415),
    };
  }

  const hasBodyStream = request.body !== null;
  if (hasBodyStream) {
    const contentType = requestContentType(request);
    if (!policy.contentTypes.includes(contentType)) {
      return {
        ok: false,
        response: requestBodyError("unsupported_media_type", 415),
      };
    }
  }

  if (!hasBodyStream) {
    if (policy.required) {
      return {
        ok: false,
        response: requestBodyError("request_body_required", 400),
      };
    }
    return { ok: true, body: null };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          response: requestBodyError("bad_request", 400),
        };
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          response: requestBodyError("request_too_large", 413),
        };
      }
      if (value.byteLength > 0) chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: requestBodyError("bad_request", 400),
    };
  } finally {
    reader.releaseLock();
  }

  if (total === 0) {
    if (policy.required) {
      return {
        ok: false,
        response: requestBodyError("request_body_required", 400),
      };
    }
    return { ok: true, body: null };
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body };
}

async function issueOperatorSession(secret, email, now = Date.now()) {
  const payload = {
    version: 1,
    role: "operator",
    email,
    issuedAt: Math.floor(now / 1000),
    expiresAt: Math.floor(now / 1000) + OPERATOR_SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(
    encoder.encode(JSON.stringify(payload)),
  );
  const signature = base64UrlEncode(
    await hmacBytes(secret, `biologix-operator.v1.${encodedPayload}`),
  );
  return `v1.${encodedPayload}.${signature}`;
}

export async function verifyOperatorSession(
  rawToken,
  secret,
  now = Date.now(),
) {
  if (
    typeof rawToken !== "string" ||
    !configuredSecret(secret, 32) ||
    rawToken.length > 1024
  ) {
    return false;
  }
  const parts = rawToken.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const payloadBytes = base64UrlDecode(parts[1]);
  const signatureBytes = base64UrlDecode(parts[2]);
  if (!payloadBytes || !signatureBytes) return false;

  const expectedSignature = await hmacBytes(
    secret,
    `biologix-operator.v1.${parts[1]}`,
  );
  if (signatureBytes.length !== expectedSignature.length) return false;
  let signatureDifference = 0;
  for (let index = 0; index < signatureBytes.length; index += 1) {
    signatureDifference |= signatureBytes[index] ^ expectedSignature[index];
  }
  if (signatureDifference !== 0) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    const nowSeconds = Math.floor(now / 1000);
    if (
      payload?.version === 1 &&
      payload?.role === "operator" &&
      typeof payload.email === "string" &&
      payload.email.toLowerCase().endsWith("@ovotalent.com") &&
      Number.isInteger(payload.issuedAt) &&
      Number.isInteger(payload.expiresAt) &&
      payload.issuedAt <= nowSeconds + GATEWAY_CLOCK_SKEW_SECONDS &&
      payload.expiresAt > nowSeconds &&
      payload.expiresAt - payload.issuedAt === OPERATOR_SESSION_TTL_SECONDS
    ) {
      return {
        email: payload.email.toLowerCase(),
        subject: `break-glass:${payload.email.toLowerCase()}`,
        authType: "break_glass",
      };
    }
    return false;
  } catch {
    return false;
  }
}

function accessTeamDomain(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname.endsWith(".cloudflareaccess.com") ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function configuredAccessAudiences(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((audience) => audience.trim())
    .filter((audience) => /^[A-Za-z0-9_-]{16,256}$/u.test(audience));
}

function jwksForTeamDomain(teamDomain) {
  let jwks = accessJwks.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${teamDomain}/cdn-cgi/access/certs`),
    );
    accessJwks.set(teamDomain, jwks);
  }
  return jwks;
}

export async function verifyCloudflareAccessIdentity(
  rawToken,
  env,
  { jwks } = {},
) {
  const teamDomain = accessTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audiences = configuredAccessAudiences(env.CF_ACCESS_AUD);
  if (
    !teamDomain ||
    audiences.length === 0 ||
    typeof rawToken !== "string" ||
    rawToken.length > 16_384
  ) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(
      rawToken,
      jwks ?? jwksForTeamDomain(teamDomain),
      {
        algorithms: ["RS256"],
        issuer: teamDomain,
        audience: audiences,
      },
    );
    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";
    const allowedDomain = (
      env.BIOLOGIX_OPERATOR_EMAIL_DOMAIN ?? "ovotalent.com"
    )
      .trim()
      .toLowerCase()
      .replace(/^@/u, "");
    if (
      !allowedDomain ||
      !email.endsWith(`@${allowedDomain}`) ||
      typeof payload.sub !== "string" ||
      !payload.sub
    ) {
      return null;
    }
    return {
      email,
      subject: payload.sub,
      authType: "cloudflare_access",
    };
  } catch {
    return null;
  }
}

async function operatorIdentity(request, env) {
  const accessIdentity = await verifyCloudflareAccessIdentity(
    request.headers.get("Cf-Access-Jwt-Assertion"),
    env,
  );
  if (accessIdentity) return accessIdentity;
  if (env.BIOLOGIX_ALLOW_BREAK_GLASS !== "true") return null;
  return verifyOperatorSession(
    cookiesFromRequest(request).get(OPERATOR_COOKIE),
    env.BIOLOGIX_OPERATOR_SESSION_SECRET,
  );
}

function operatorCookie(token) {
  return `${OPERATOR_COOKIE}=${token}; Max-Age=${OPERATOR_SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearOperatorCookie() {
  return `${OPERATOR_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function controlTowerAccessPage(message = "") {
  const safeMessage = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Biologix Control Tower · Secure access</title>
  <style>
    :root{color-scheme:light;--ink:#171a16;--paper:#f1eee4;--line:#cbc5b8;--muted:#696c63;--acid:#d8ff52}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(92vw,460px);border:1px solid var(--line);background:#f8f6ef;padding:38px;box-shadow:0 24px 80px rgba(36,35,29,.08)}
    .eyebrow{display:flex;align-items:center;gap:10px;margin:0 0 28px;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.dot{width:9px;height:9px;border-radius:50%;background:var(--acid);box-shadow:0 0 0 4px rgba(216,255,82,.3)}
    h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(34px,8vw,48px);font-weight:500;line-height:.98;letter-spacing:-.04em}p{margin:18px 0 28px;color:var(--muted);font-size:14px;line-height:1.65}
    label{display:grid;gap:9px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}input{width:100%;min-height:52px;border:1px solid var(--line);border-radius:0;background:#fff;padding:0 14px;font:inherit;font-size:16px;letter-spacing:normal}input:focus{outline:3px solid rgba(216,255,82,.75);outline-offset:1px;border-color:var(--ink)}
    button{width:100%;min-height:52px;margin-top:14px;border:1px solid var(--ink);background:var(--ink);color:#fff;font:inherit;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}button:hover{background:#2b2f29}.alert{margin:0 0 20px;padding:12px;border-left:3px solid #b7392e;background:#f6e7e3;color:#7d2a23;font-size:13px;line-height:1.45}
    .foot{margin:22px 0 0;padding-top:18px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow"><span class="dot"></span>Biologix operations</div>
    <h1>Control Tower</h1>
    <p>This workspace contains private creator, activation, attribution, and payout records.</p>
    ${safeMessage ? `<div class="alert" role="alert">${safeMessage}</div>` : ""}
    <form method="post" action="/api/control-tower/session">
      <label>Operator access code
        <input type="password" name="accessCode" required autocomplete="current-password" autofocus>
      </label>
      <button type="submit">Enter control tower</button>
    </form>
    <div class="foot">Access is encrypted, time-limited, and recorded by the operating system.</div>
  </main>
</body>
</html>`;
}

function html(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { ...init, headers });
}

function methodNotAllowed(allowedMethods, { operator = false } = {}) {
  return withBiologixHeaders(
    json(
      { ok: false, error: "method_not_allowed" },
      {
        status: 405,
        headers: { Allow: allowedMethods.join(", ") },
      },
    ),
    { operator },
  );
}

function readAccessCode(body, contentType) {
  if (!body) return "";
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  if (contentType === "application/json") {
    const parsed = JSON.parse(text);
    return typeof parsed?.accessCode === "string" ? parsed.accessCode : "";
  }
  const value = new URLSearchParams(text).get("accessCode");
  return typeof value === "string" ? value : "";
}

function upstreamOrigin(env) {
  try {
    const url = new URL(env.BIOLOGIX_UPSTREAM_ORIGIN);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function affiliateCookieHeader(request) {
  const raw = request.headers.get("Cookie") ?? "";
  for (const pair of raw.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (
      name === AFFILIATE_COOKIE &&
      /^[A-Za-z0-9_-]{40,96}$/u.test(value)
    ) {
      return `${AFFILIATE_COOKIE}=${value}`;
    }
  }
  return "";
}

function safeUpstreamHeaders(
  request,
  publicOrigin,
  {
    operatorAssertion = "",
    requestId = "",
    clientIp = "",
    includeAffiliateSession = false,
    additionalAllowedHeaders = [],
  } = {},
) {
  const headers = new Headers();
  const allowed = [
    "Accept",
    "Accept-Language",
    "Content-Type",
    "User-Agent",
    ...additionalAllowedHeaders,
  ];
  for (const name of allowed) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const affiliateCookie = includeAffiliateSession
    ? affiliateCookieHeader(request)
    : "";
  if (affiliateCookie) headers.set("Cookie", affiliateCookie);
  headers.set("Origin", publicOrigin);
  headers.set("X-OVO-Public-Origin", publicOrigin);
  headers.set("X-OVO-Client-IP", clientIp || "unknown");
  if (requestId) headers.set("X-OVO-Gateway-Request-ID", requestId);
  if (operatorAssertion) {
    headers.set("X-OVO-Operator-Assertion", operatorAssertion);
  }
  return headers;
}

async function gatewaySignature({
  secret,
  keyId,
  method,
  pathname,
  timestamp,
  nonce,
  requestId,
  bodyHash,
  publicOrigin,
  clientIp,
  operatorAssertionHash,
}) {
  const canonical = [
    "biologix-gateway-v1",
    keyId,
    method.toUpperCase(),
    pathname,
    timestamp,
    nonce,
    requestId,
    publicOrigin,
    clientIp,
    bodyHash,
    operatorAssertionHash,
  ].join("\n");
  return base64UrlEncode(await hmacBytes(secret, canonical));
}

export async function verifyGatewaySignature({
  secret,
  keyId,
  method,
  pathname,
  timestamp,
  nonce,
  requestId,
  bodyHash,
  publicOrigin,
  clientIp,
  operatorAssertionHash,
  signature,
  now = Date.now(),
}) {
  if (
    !configuredSecret(secret, 32) ||
    !/^[A-Za-z0-9._-]{3,64}$/u.test(keyId ?? "") ||
    !/^\d{10,13}$/u.test(timestamp ?? "") ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce ?? "") ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(requestId ?? "") ||
    !/^[a-f0-9]{64}$/u.test(bodyHash ?? "") ||
    !/^[a-f0-9]{64}$/u.test(operatorAssertionHash ?? "") ||
    !/^[A-Za-z0-9_-]{40,128}$/u.test(signature ?? "")
  ) {
    return false;
  }
  const timestampNumber = Number(timestamp);
  const timestampMs =
    timestampNumber < 10_000_000_000 ? timestampNumber * 1000 : timestampNumber;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(now - timestampMs) > GATEWAY_CLOCK_SKEW_SECONDS * 1000
  ) {
    return false;
  }
  const expected = await gatewaySignature({
    secret,
    keyId,
    method,
    pathname,
    timestamp,
    nonce,
    requestId,
    bodyHash,
    publicOrigin,
    clientIp,
    operatorAssertionHash,
  });
  return secureTextEqual(signature, expected);
}

function randomNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function rewrittenLocation(location, request) {
  if (!location) return null;
  let parsed;
  try {
    parsed = new URL(location, request.url);
  } catch {
    return null;
  }
  const publicUrl = new URL(request.url);
  if (
    publicUrl.protocol !== "https:" ||
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.origin !== publicUrl.origin
  ) {
    return null;
  }
  if (parsed.pathname === "/biologix") {
    parsed.pathname = "/passport/";
  } else if (parsed.pathname.startsWith("/biologix/")) {
    parsed.pathname = `/passport/${parsed.pathname.slice("/biologix/".length)}`;
  }
  return parsed.toString();
}

function configuredTrackingRedirectHosts(value) {
  if (typeof value !== "string") return new Set();
  return new Set(
    value
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(
        (host) =>
          host.length <= 253 &&
          /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
            host,
          ),
      ),
  );
}

function trackingRedirectLocation(location, env) {
  if (!location) return null;
  let parsed;
  try {
    parsed = new URL(location);
  } catch {
    return null;
  }
  const allowedHosts = configuredTrackingRedirectHosts(
    env.BIOLOGIX_TRACKING_REDIRECT_HOSTS,
  );
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    !allowedHosts.has(parsed.hostname.toLowerCase())
  ) {
    return null;
  }
  return parsed.toString();
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(
    /,\s*(?=[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/u,
  );
}

function setCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  return splitSetCookieHeader(headers.get("Set-Cookie"));
}

function affiliateSetCookie(headers, mode) {
  if (mode === "none") return { ok: true, values: [] };
  const matching = [];
  for (const rawCookie of setCookieValues(headers)) {
    const pair = rawCookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    if (pair.slice(0, separator).trim() !== AFFILIATE_COOKIE) continue;
    matching.push(pair.slice(separator + 1).trim());
  }
  if (matching.length === 0) return { ok: true, values: [] };
  if (matching.length !== 1) return { ok: false, values: [] };

  const value = matching[0];
  const clearLegacyCookie =
    `${AFFILIATE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
  if (mode === "set") {
    if (!/^[A-Za-z0-9_-]{40,96}$/u.test(value)) {
      return { ok: false, values: [] };
    }
    return {
      ok: true,
      values: [
        clearLegacyCookie,
        `${AFFILIATE_COOKIE}=${value}; Max-Age=${AFFILIATE_SESSION_TTL_SECONDS}; Path=/api/biologix/; HttpOnly; Secure; SameSite=Strict`,
      ],
    };
  }
  if (mode === "clear" && value === "") {
    return {
      ok: true,
      values: [
        clearLegacyCookie,
        `${AFFILIATE_COOKIE}=; Max-Age=0; Path=/api/biologix/; HttpOnly; Secure; SameSite=Strict`,
      ],
    };
  }
  return { ok: false, values: [] };
}

function safeUpstreamResponse(
  upstream,
  request,
  env,
  { redirectPolicy, responseSession = "none" },
) {
  const headers = new Headers();
  for (const name of SAFE_UPSTREAM_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  if (isRedirectStatus(upstream.status)) {
    let location = null;
    if (redirectPolicy === "creator") {
      location = rewrittenLocation(
        upstream.headers.get("Location"),
        request,
      );
    } else if (redirectPolicy === "tracking") {
      location = trackingRedirectLocation(
        upstream.headers.get("Location"),
        env,
      );
    }
    if (!location) {
      upstream.body?.cancel().catch(() => {});
      return {
        ok: false,
        response: json(
          { ok: false, error: "invalid_upstream_redirect" },
          { status: 502 },
        ),
      };
    }
    headers.set("Location", location);
  }

  const sessionCookie = affiliateSetCookie(
    upstream.headers,
    responseSession,
  );
  if (!sessionCookie.ok) {
    upstream.body?.cancel().catch(() => {});
    return {
      ok: false,
      response: json(
        { ok: false, error: "invalid_upstream_cookie" },
        { status: 502 },
      ),
    };
  }
  for (const value of sessionCookie.values) {
    headers.append("Set-Cookie", value);
  }

  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  return {
    ok: true,
    response: new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    }),
  };
}

function withBiologixHeaders(response, { operator = false } = {}) {
  const headers = new Headers(response.headers);
  const contentType = headers.get("Content-Type") ?? "";
  if (operator || contentType.includes("text/html")) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
  }
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", operator ? "no-referrer" : "strict-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=()",
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyToAcademy(
  request,
  env,
  upstreamPath,
  fetchImpl,
  {
    identity = null,
    bodyPolicy = NO_BODY,
    includeAffiliateSession = false,
    additionalAllowedHeaders = [],
    redirectPolicy,
    responseSession = "none",
  },
) {
  const origin = upstreamOrigin(env);
  if (
    !origin ||
    !configuredSecret(env.BIOLOGIX_GATEWAY_SECRET, 32) ||
    !/^[A-Za-z0-9._-]{3,64}$/u.test(env.BIOLOGIX_GATEWAY_KEY_ID ?? "")
  ) {
    return json(
      { ok: false, error: "gateway_not_configured" },
      { status: 503 },
    );
  }

  const requestUrl = new URL(request.url);
  const publicOrigin = requestUrl.origin;
  const signedPath = `${upstreamPath}${requestUrl.search}`;
  const target = new URL(signedPath, origin);
  const requestBody = await readLimitedRequestBody(request, bodyPolicy);
  if (!requestBody.ok) return requestBody.response;
  const body = requestBody.body;
  const bodyHash = await sha256Hex(body ?? new Uint8Array());
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomNonce();
  const requestId = randomNonce();
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const operatorAssertion = identity
    ? base64UrlEncode(
        encoder.encode(
          JSON.stringify({
            version: 1,
            email: identity.email,
            subject: identity.subject,
            authType: identity.authType,
          }),
        ),
      )
    : "";
  const operatorAssertionHash = await sha256Hex(operatorAssertion);
  const headers = safeUpstreamHeaders(request, publicOrigin, {
    operatorAssertion,
    requestId,
    clientIp,
    includeAffiliateSession,
    additionalAllowedHeaders,
  });
  headers.set("X-OVO-Gateway-Timestamp", timestamp);
  headers.set("X-OVO-Gateway-Key-ID", env.BIOLOGIX_GATEWAY_KEY_ID);
  headers.set("X-OVO-Gateway-Nonce", nonce);
  headers.set("X-OVO-Gateway-Body-SHA256", bodyHash);
  headers.set(
    "X-OVO-Gateway-Operator-SHA256",
    operatorAssertionHash,
  );
  headers.set(
    "X-OVO-Gateway-Signature",
    await gatewaySignature({
      secret: env.BIOLOGIX_GATEWAY_SECRET,
      keyId: env.BIOLOGIX_GATEWAY_KEY_ID,
      method: request.method,
      pathname: signedPath,
      timestamp,
      nonce,
      requestId,
      bodyHash,
      publicOrigin,
      clientIp,
      operatorAssertionHash,
    }),
  );

  let upstream;
  try {
    upstream = await fetchImpl(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("[biologix-gateway] upstream request failed", error);
    return json(
      { ok: false, error: "upstream_unavailable" },
      { status: 503 },
    );
  }

  const response = safeUpstreamResponse(upstream, request, env, {
    redirectPolicy,
    responseSession,
  });
  return response.response;
}

async function operatorLogin(request, env) {
  if (!sameOriginMutation(request)) {
    return json({ ok: false, error: "bad_origin" }, { status: 403 });
  }
  const acceptsHtml = (request.headers.get("Accept") ?? "").includes(
    "text/html",
  );
  if (
    env.BIOLOGIX_ALLOW_BREAK_GLASS !== "true" ||
    !configuredSecret(env.BIOLOGIX_OPERATOR_ACCESS_CODE, 24) ||
    !configuredSecret(env.BIOLOGIX_OPERATOR_SESSION_SECRET, 32) ||
    typeof env.BIOLOGIX_LOGIN_RATE_LIMITER?.limit !== "function" ||
    !/^[^@\s]+@ovotalent\.com$/iu.test(
      env.BIOLOGIX_BREAK_GLASS_OPERATOR_EMAIL ?? "",
    )
  ) {
    return json(
      { ok: false, error: "operator_access_not_configured" },
      { status: 503 },
    );
  }
  let rateLimit;
  try {
    rateLimit = await env.BIOLOGIX_LOGIN_RATE_LIMITER.limit({
      key:
        request.headers.get("CF-Connecting-IP") ??
        "unknown-client",
    });
  } catch (error) {
    console.error(
      "[biologix-gateway] operator login limiter unavailable",
      error,
    );
    return json(
      { ok: false, error: "operator_access_not_configured" },
      { status: 503 },
    );
  }
  if (!rateLimit?.success) {
    console.warn("[biologix-gateway] operator login rate limited", {
      ray: request.headers.get("CF-Ray") ?? "unknown",
    });
    const headers = { "Retry-After": "60" };
    return acceptsHtml
      ? html(
          controlTowerAccessPage(
            "Too many access attempts. Wait one minute before trying again.",
          ),
          { status: 429, headers },
        )
      : json(
          { ok: false, error: "rate_limited" },
          { status: 429, headers },
        );
  }
  let suppliedCode = "";
  try {
    const requestBody = await readLimitedRequestBody(request, {
      ...FORM_OR_JSON_BODY,
      maxBytes: 4 * 1024,
    });
    if (!requestBody.ok) return requestBody.response;
    suppliedCode = readAccessCode(
      requestBody.body,
      requestContentType(request),
    );
  } catch {
    return json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (
    suppliedCode.length > 512 ||
    !(await secureTextEqual(suppliedCode, env.BIOLOGIX_OPERATOR_ACCESS_CODE))
  ) {
    console.warn("[biologix-gateway] operator login denied", {
      ray: request.headers.get("CF-Ray") ?? "unknown",
    });
    return acceptsHtml
      ? html(controlTowerAccessPage("That access code was not accepted."), {
          status: 401,
        })
      : json({ ok: false, error: "invalid_access_code" }, { status: 401 });
  }
  const session = await issueOperatorSession(
    env.BIOLOGIX_OPERATOR_SESSION_SECRET,
    env.BIOLOGIX_BREAK_GLASS_OPERATOR_EMAIL.trim().toLowerCase(),
  );
  const headers = new Headers({
    "Set-Cookie": operatorCookie(session),
    "Cache-Control": "private, no-store, max-age=0",
  });
  if ((request.headers.get("Accept") ?? "").includes("text/html")) {
    headers.set("Location", "/control-tower/");
    return new Response(null, { status: 303, headers });
  }
  return json({ ok: true }, { headers });
}

export async function handleBiologixGatewayRequest(
  request,
  env,
  { fetchImpl = fetch } = {},
) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === "/api/control-tower/session") {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"], { operator: true });
    }
    return withBiologixHeaders(await operatorLogin(request, env), {
      operator: true,
    });
  }

  if (pathname === "/api/control-tower/logout") {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"], { operator: true });
    }
    if (!sameOriginMutation(request)) {
      return withBiologixHeaders(
        json({ ok: false, error: "bad_origin" }, { status: 403 }),
        { operator: true },
      );
    }
    const requestBody = await readLimitedRequestBody(request, NO_BODY);
    if (!requestBody.ok) {
      return withBiologixHeaders(requestBody.response, {
        operator: true,
      });
    }
    return withBiologixHeaders(
      json(
        { ok: true },
        { headers: { "Set-Cookie": clearOperatorCookie() } },
      ),
      { operator: true },
    );
  }

  if (pathname === "/control-tower/access") {
    if (!["GET", "HEAD"].includes(request.method)) {
      return methodNotAllowed(["GET", "HEAD"], { operator: true });
    }
    if (await operatorIdentity(request, env)) {
      return Response.redirect(new URL("/control-tower/", request.url), 303);
    }
    if (env.BIOLOGIX_ALLOW_BREAK_GLASS !== "true") {
      return withBiologixHeaders(
        html(
          controlTowerAccessPage(
            "Control Tower access is managed by OVO single sign-on.",
          ),
          { status: 403 },
        ),
        { operator: true },
      );
    }
    return withBiologixHeaders(html(controlTowerAccessPage()), {
      operator: true,
    });
  }

  if (
    pathname === "/control-tower" ||
    pathname.startsWith("/control-tower/")
  ) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return methodNotAllowed(["GET", "HEAD"], { operator: true });
    }
    if (!(await operatorIdentity(request, env))) {
      return Response.redirect(
        new URL("/control-tower/access", request.url),
        303,
      );
    }
    if (pathname === "/control-tower") {
      return Response.redirect(new URL("/control-tower/", request.url), 308);
    }
    const assetResponse = await env.ASSETS.fetch(request);
    return withBiologixHeaders(assetResponse, { operator: true });
  }

  if (pathname === "/api/control-tower") {
    return withBiologixHeaders(
      json({ ok: false, error: "not_found" }, { status: 404 }),
      { operator: true },
    );
  }

  if (pathname.startsWith("/api/control-tower/")) {
    const isProjection = pathname === "/api/control-tower/projection";
    const isAction = pathname === "/api/control-tower/action";
    if (!isProjection && !isAction) {
      return withBiologixHeaders(
        json({ ok: false, error: "not_found" }, { status: 404 }),
        { operator: true },
      );
    }
    if (
      (isProjection && !["GET", "HEAD"].includes(request.method)) ||
      (isAction && request.method !== "POST")
    ) {
      return methodNotAllowed(
        isProjection ? ["GET", "HEAD"] : ["POST"],
        { operator: true },
      );
    }
    const identity = await operatorIdentity(request, env);
    if (!identity) {
      return withBiologixHeaders(
        json({ ok: false, error: "unauthorized" }, { status: 401 }),
        { operator: true },
      );
    }
    if (isAction && !sameOriginMutation(request)) {
      return withBiologixHeaders(
        json({ ok: false, error: "bad_origin" }, { status: 403 }),
        { operator: true },
      );
    }
    const suffix = pathname.slice("/api/control-tower".length);
    const response = await proxyToAcademy(
      request,
      env,
      `/api/private/biologix/control-tower${suffix}`,
      fetchImpl,
      {
        identity,
        bodyPolicy:
          CONTROL_TOWER_BODY_POLICIES[
            isProjection ? "projection" : "action"
          ][request.method],
        redirectPolicy: "none",
      },
    );
    return withBiologixHeaders(response, { operator: true });
  }

  if (pathname === "/api/biologix") {
    return withBiologixHeaders(
      json({ ok: false, error: "not_found" }, { status: 404 }),
    );
  }

  if (pathname.startsWith("/api/biologix/")) {
    const match = pathname.match(/^\/api\/biologix\/([^/]+)$/u);
    const routeName = match?.[1] ?? "";
    const route = Object.hasOwn(CREATOR_ROUTES, routeName)
      ? CREATOR_ROUTES[routeName]
      : null;
    if (!route) {
      return withBiologixHeaders(
        json({ ok: false, error: "not_found" }, { status: 404 }),
      );
    }
    const routePolicy = route[request.method];
    if (!routePolicy) {
      return methodNotAllowed(Object.keys(route));
    }
    if (
      !["GET", "HEAD"].includes(request.method) &&
      !sameOriginMutation(request)
    ) {
      return withBiologixHeaders(
        json({ ok: false, error: "bad_origin" }, { status: 403 }),
      );
    }
    return withBiologixHeaders(
      await proxyToAcademy(
        request,
        env,
        `/api/private/biologix/creator/${routeName}`,
        fetchImpl,
        {
          bodyPolicy: routePolicy.body,
          includeAffiliateSession: routePolicy.forwardSession,
          redirectPolicy: "creator",
          responseSession: routePolicy.responseSession,
        },
      ),
    );
  }

  if (pathname === "/r/biologix" || pathname.startsWith("/r/biologix/")) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return methodNotAllowed(["GET", "HEAD"]);
    }
    if (pathname === "/r/biologix") {
      return withBiologixHeaders(
        json({ ok: false, error: "not_found" }, { status: 404 }),
      );
    }
    const match = pathname.match(
      /^\/r\/biologix\/([A-Za-z0-9][A-Za-z0-9_-]{2,31})$/u,
    );
    if (!match) {
      return withBiologixHeaders(
        json({ ok: false, error: "not_found" }, { status: 404 }),
      );
    }
    return withBiologixHeaders(
      await proxyToAcademy(
        request,
        env,
        `/api/private/biologix/tracking/${match[1]}`,
        fetchImpl,
        {
          additionalAllowedHeaders: TRACKING_REQUEST_HEADERS,
          bodyPolicy: NO_BODY,
          redirectPolicy: "tracking",
        },
      ),
    );
  }

  if (pathname === "/biologix" || pathname.startsWith("/biologix/")) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return methodNotAllowed(["GET", "HEAD"]);
    }
    const destination = new URL(request.url);
    destination.pathname =
      pathname === "/biologix"
        ? "/passport/"
        : `/passport/${pathname.slice("/biologix/".length)}`;
    return Response.redirect(destination, 308);
  }

  if (pathname === "/passport") {
    if (!["GET", "HEAD"].includes(request.method)) {
      return methodNotAllowed(["GET", "HEAD"]);
    }
    return Response.redirect(new URL("/passport/", request.url), 308);
  }

  if (pathname.startsWith("/passport/")) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return methodNotAllowed(["GET", "HEAD"]);
    }
    let assetResponse = await env.ASSETS.fetch(request);
    const documentRequest =
      ["GET", "HEAD"].includes(request.method) &&
      ((request.headers.get("Sec-Fetch-Dest") ?? "") === "document" ||
        (request.headers.get("Accept") ?? "").includes("text/html"));
    if (assetResponse.status === 404 && documentRequest) {
      const indexUrl = new URL("/passport/index.html", request.url);
      assetResponse = await env.ASSETS.fetch(
        new Request(indexUrl, {
          method: request.method,
          headers: request.headers,
        }),
      );
    }
    return withBiologixHeaders(assetResponse);
  }

  return null;
}

export const biologixGatewayInternals = {
  AFFILIATE_COOKIE,
  OPERATOR_COOKIE,
  gatewaySignature,
  issueOperatorSession,
  rewrittenLocation,
};
