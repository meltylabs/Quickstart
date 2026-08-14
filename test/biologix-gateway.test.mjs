import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";

import {
  biologixGatewayInternals,
  handleBiologixGatewayRequest,
  verifyCloudflareAccessIdentity,
  verifyGatewaySignature,
  verifyOperatorSession,
} from "../src/biologix-gateway.js";

const ROOT = "https://biologix-decision-board.alexmwein.workers.dev";
const SESSION_SECRET = "s".repeat(48);
const GATEWAY_SECRET = "g".repeat(48);
const AFFILIATE_SESSION = "c".repeat(48);

function responseSetCookies(response) {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("Set-Cookie")].filter(Boolean);
}

function baseEnv(overrides = {}) {
  return {
    ASSETS: {
      async fetch(request) {
        return new Response(`asset:${new URL(request.url).pathname}`, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      },
    },
    BIOLOGIX_GATEWAY_KEY_ID: "primary-2026-07",
    BIOLOGIX_GATEWAY_SECRET: GATEWAY_SECRET,
    BIOLOGIX_LOGIN_RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    BIOLOGIX_OPERATOR_SESSION_SECRET: SESSION_SECRET,
    BIOLOGIX_TRACKING_REDIRECT_HOSTS:
      "biologixlabsresearch.com,www.biologixlabsresearch.com",
    BIOLOGIX_UPSTREAM_ORIGIN: "https://ovo.academy",
    ...overrides,
  };
}

async function accessFixture(email = "alex@ovotalent.com") {
  const issuer = "https://ovo.cloudflareaccess.com";
  const audience = "audience_tag_1234567890";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "access-key";
  jwk.use = "sig";
  jwk.alg = "RS256";
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("operator-subject")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  return {
    token,
    jwks: createLocalJWKSet({ keys: [jwk] }),
    env: {
      CF_ACCESS_TEAM_DOMAIN: issuer,
      CF_ACCESS_AUD: audience,
    },
  };
}

test("Cloudflare Access identity requires a valid audience and OVO email", async () => {
  const fixture = await accessFixture();
  assert.deepEqual(
    await verifyCloudflareAccessIdentity(fixture.token, fixture.env, {
      jwks: fixture.jwks,
    }),
    {
      email: "alex@ovotalent.com",
      subject: "operator-subject",
      authType: "cloudflare_access",
    },
  );

  const outsider = await accessFixture("person@example.com");
  assert.equal(
    await verifyCloudflareAccessIdentity(outsider.token, outsider.env, {
      jwks: outsider.jwks,
    }),
    null,
  );
});

test("break-glass operator sessions are signed, scoped, expiring capabilities", async () => {
  const now = Date.now();
  const token = await biologixGatewayInternals.issueOperatorSession(
    SESSION_SECRET,
    "ops@ovotalent.com",
    now,
  );
  assert.deepEqual(
    await verifyOperatorSession(token, SESSION_SECRET, now + 1_000),
    {
      email: "ops@ovotalent.com",
      subject: "break-glass:ops@ovotalent.com",
      authType: "break_glass",
    },
  );
  assert.equal(
    await verifyOperatorSession(`${token}tampered`, SESSION_SECRET, now),
    false,
  );
  assert.equal(
    await verifyOperatorSession(
      token,
      SESSION_SECRET,
      now + 8 * 60 * 60 * 1_000 + 1,
    ),
    false,
  );
});

test("control tower assets fail closed without verified operator identity", async () => {
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/control-tower/`, {
      headers: { Accept: "text/html" },
    }),
    baseEnv(),
  );
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("Location"),
    `${ROOT}/control-tower/access`,
  );
});

test("break-glass access is disabled unless explicitly configured", async () => {
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: JSON.stringify({ accessCode: "x".repeat(32) }),
    }),
    baseEnv({
      BIOLOGIX_OPERATOR_ACCESS_CODE: "x".repeat(32),
      BIOLOGIX_BREAK_GLASS_OPERATOR_EMAIL: "ops@ovotalent.com",
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "operator_access_not_configured",
  });
});

test("break-glass access issues a secure host-only cookie when enabled", async () => {
  const code = "correct-horse-battery-staple-ovo";
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/session`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: JSON.stringify({ accessCode: code }),
    }),
    baseEnv({
      BIOLOGIX_ALLOW_BREAK_GLASS: "true",
      BIOLOGIX_OPERATOR_ACCESS_CODE: code,
      BIOLOGIX_BREAK_GLASS_OPERATOR_EMAIL: "ops@ovotalent.com",
    }),
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("Set-Cookie") ?? "",
    /^__Host-biologix_operator=.+; Max-Age=28800; Path=\/; HttpOnly; Secure; SameSite=Strict$/u,
  );
});

test("break-glass access fails closed without its rate limiter", async () => {
  const code = "correct-horse-battery-staple-ovo";
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/session`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: JSON.stringify({ accessCode: code }),
    }),
    baseEnv({
      BIOLOGIX_ALLOW_BREAK_GLASS: "true",
      BIOLOGIX_BREAK_GLASS_OPERATOR_EMAIL: "ops@ovotalent.com",
      BIOLOGIX_LOGIN_RATE_LIMITER: undefined,
      BIOLOGIX_OPERATOR_ACCESS_CODE: code,
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "operator_access_not_configured",
  });
});

test("break-glass access rate limits attempts before checking the code", async () => {
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/session`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: JSON.stringify({ accessCode: "wrong-access-code-that-is-long" }),
    }),
    baseEnv({
      BIOLOGIX_ALLOW_BREAK_GLASS: "true",
      BIOLOGIX_BREAK_GLASS_OPERATOR_EMAIL: "ops@ovotalent.com",
      BIOLOGIX_OPERATOR_ACCESS_CODE:
        "correct-horse-battery-staple-ovo",
      BIOLOGIX_LOGIN_RATE_LIMITER: {
        async limit() {
          return { success: false };
        },
      },
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "rate_limited",
  });
});

test("creator requests proxy only to the allowlisted private upstream route", async () => {
  let captured;
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/enrollment?view=current`, {
      headers: {
        Accept: "application/json",
        Cookie:
          `biologix_session=${AFFILIATE_SESSION}; __Host-biologix_operator=never-forward`,
        "CF-Connecting-IP": "203.0.113.9",
      },
    }),
    baseEnv(),
    {
      async fetchImpl(url, init) {
        captured = { url: url.toString(), init };
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    captured.url,
    "https://ovo.academy/api/private/biologix/creator/enrollment?view=current",
  );
  assert.equal(
    captured.init.headers.get("Cookie"),
    `biologix_session=${AFFILIATE_SESSION}`,
  );
  assert.equal(captured.init.headers.get("X-OVO-Operator-Assertion"), null);
  assert.equal(captured.init.headers.get("X-OVO-Client-IP"), "203.0.113.9");

  assert.equal(
    await verifyGatewaySignature({
      secret: GATEWAY_SECRET,
      keyId: captured.init.headers.get("X-OVO-Gateway-Key-ID"),
      method: "GET",
      pathname:
        "/api/private/biologix/creator/enrollment?view=current",
      timestamp: captured.init.headers.get("X-OVO-Gateway-Timestamp"),
      nonce: captured.init.headers.get("X-OVO-Gateway-Nonce"),
      requestId: captured.init.headers.get("X-OVO-Gateway-Request-ID"),
      bodyHash: captured.init.headers.get("X-OVO-Gateway-Body-SHA256"),
      publicOrigin: ROOT,
      clientIp: "203.0.113.9",
      operatorAssertionHash: captured.init.headers.get(
        "X-OVO-Gateway-Operator-SHA256",
      ),
      signature: captured.init.headers.get("X-OVO-Gateway-Signature"),
    }),
    true,
  );
});

test("creator API exposes only the exact route and method contract", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response();
  };
  for (const path of [
    "/api/biologix/internal",
    "/api/biologix/enrollment/",
    "/api/biologix/enrollment/private",
    "/api/biologix/__proto__",
    "/api/biologix/enrollment%2Fprivate",
  ]) {
    const response = await handleBiologixGatewayRequest(
      new Request(`${ROOT}${path}`),
      baseEnv(),
      { fetchImpl },
    );
    assert.equal(response.status, 404, path);
  }

  const enrollmentPost = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/enrollment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: "{}",
    }),
    baseEnv(),
    { fetchImpl },
  );
  assert.equal(enrollmentPost.status, 405);
  assert.equal(enrollmentPost.headers.get("Allow"), "GET, PATCH");

  const enrollmentHead = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/enrollment`, {
      method: "HEAD",
    }),
    baseEnv(),
    { fetchImpl },
  );
  assert.equal(enrollmentHead.status, 405);
  assert.equal(calls, 0);
});

test("creator sessions are forwarded only by the routes that consume them", async () => {
  let loginCookie = "not-called";
  const login = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/login`, {
      method: "POST",
      headers: {
        Cookie: `biologix_session=${AFFILIATE_SESSION}`,
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: JSON.stringify({ email: "creator@example.com" }),
    }),
    baseEnv(),
    {
      async fetchImpl(_url, init) {
        loginCookie = init.headers.get("Cookie");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );
  assert.equal(login.status, 200);
  assert.equal(loginCookie, null);

  let malformedCookie = "not-called";
  const enrollment = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/enrollment`, {
      headers: {
        Cookie: "biologix_session=contains.invalid.characters",
      },
    }),
    baseEnv(),
    {
      async fetchImpl(_url, init) {
        malformedCookie = init.headers.get("Cookie");
        return new Response(JSON.stringify({ ok: false }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );
  assert.equal(enrollment.status, 401);
  assert.equal(malformedCookie, null);

  for (const cookieHeader of [
    `biologix_session=${AFFILIATE_SESSION}; biologix_session=`,
    `biologix_session=; biologix_session=${AFFILIATE_SESSION}`,
  ]) {
    let forwardedCookie = "not-called";
    const duplicatePathCookies = await handleBiologixGatewayRequest(
      new Request(`${ROOT}/api/biologix/enrollment`, {
        headers: { Cookie: cookieHeader },
      }),
      baseEnv(),
      {
        async fetchImpl(_url, init) {
          forwardedCookie = init.headers.get("Cookie");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    );
    assert.equal(duplicatePathCookies.status, 200);
    assert.equal(
      forwardedCookie,
      `biologix_session=${AFFILIATE_SESSION}`,
    );
  }
});

test("request media types and streamed body sizes fail closed at the Worker", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response();
  };
  const wrongType = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/login`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Origin: ROOT,
      },
      body: "{}",
    }),
    baseEnv(),
    { fetchImpl },
  );
  assert.equal(wrongType.status, 415);
  assert.deepEqual(await wrongType.json(), {
    ok: false,
    error: "unsupported_media_type",
  });

  const chunkedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(3_000));
      controller.enqueue(new Uint8Array(3_000));
      controller.close();
    },
  });
  const oversized = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: chunkedBody,
      duplex: "half",
    }),
    baseEnv(),
    { fetchImpl },
  );
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), {
    ok: false,
    error: "request_too_large",
  });

  const encoded = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/help`, {
      method: "POST",
      headers: {
        "Content-Encoding": "gzip",
        "Content-Type": "application/json",
        Origin: ROOT,
      },
      body: "{}",
    }),
    baseEnv(),
    { fetchImpl },
  );
  assert.equal(encoded.status, 415);
  assert.deepEqual(await encoded.json(), {
    ok: false,
    error: "unsupported_content_encoding",
  });
  assert.equal(calls, 0);
});

test("upstream response headers are reduced to the explicit safe list", async () => {
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/enrollment`),
    baseEnv(),
    {
      async fetchImpl() {
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Origin": "*",
            "CDN-Cache-Control": "public, max-age=86400",
            "CF-Cache-Status": "HIT",
            "Content-Type": "application/json",
            Refresh: "0; url=https://evil.example",
            "Set-Cookie": "dangerous=value; Domain=.alexmwein.workers.dev",
            "Surrogate-Control": "max-age=86400",
          },
        });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/json");
  assert.equal(
    response.headers.get("Cache-Control"),
    "private, no-store, max-age=0",
  );
  for (const name of [
    "Access-Control-Allow-Credentials",
    "Access-Control-Allow-Origin",
    "CDN-Cache-Control",
    "CF-Cache-Status",
    "Refresh",
    "Set-Cookie",
    "Surrogate-Control",
  ]) {
    assert.equal(response.headers.get(name), null, name);
  }
});

test("redeem and logout rewrite only the creator session cookie with an API path", async () => {
  const upstreamHeaders = new Headers({
    Location: `${ROOT}/biologix?welcome=1`,
  });
  upstreamHeaders.append(
    "Set-Cookie",
    `biologix_session=${AFFILIATE_SESSION}; Domain=.alexmwein.workers.dev; Path=/; SameSite=None`,
  );
  upstreamHeaders.append(
    "Set-Cookie",
    "__Host-biologix_operator=attacker; Path=/; Secure",
  );
  const redeem = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ROOT,
      },
      body: "token=" + "t".repeat(48),
    }),
    baseEnv(),
    {
      async fetchImpl() {
        return new Response(null, {
          status: 303,
          headers: upstreamHeaders,
        });
      },
    },
  );
  assert.equal(redeem.status, 303);
  assert.equal(redeem.headers.get("Location"), `${ROOT}/passport/?welcome=1`);
  assert.deepEqual(responseSetCookies(redeem), [
    "biologix_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    `biologix_session=${AFFILIATE_SESSION}; Max-Age=1209600; Path=/api/biologix/; HttpOnly; Secure; SameSite=Strict`,
  ]);

  const logout = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/logout`, {
      method: "POST",
      headers: {
        Cookie: `biologix_session=${AFFILIATE_SESSION}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ROOT,
      },
      body: "",
    }),
    baseEnv(),
    {
      async fetchImpl() {
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie":
              "biologix_session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.alexmwein.workers.dev; Path=/",
          },
        });
      },
    },
  );
  assert.equal(logout.status, 200);
  assert.deepEqual(responseSetCookies(logout), [
    "biologix_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    "biologix_session=; Max-Age=0; Path=/api/biologix/; HttpOnly; Secure; SameSite=Strict",
  ]);
});

test("creator and control-tower proxies reject upstream redirects outside policy", async () => {
  const creator = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix/redeem?token=abc`),
    baseEnv(),
    {
      async fetchImpl() {
        return new Response(null, {
          status: 303,
          headers: {
            Location: "https://evil.example/passport",
          },
        });
      },
    },
  );
  assert.equal(creator.status, 502);
  assert.deepEqual(await creator.json(), {
    ok: false,
    error: "invalid_upstream_redirect",
  });

  const token = await biologixGatewayInternals.issueOperatorSession(
    SESSION_SECRET,
    "ops@ovotalent.com",
  );
  const operator = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/projection`, {
      headers: {
        Cookie: `__Host-biologix_operator=${token}`,
      },
    }),
    baseEnv({ BIOLOGIX_ALLOW_BREAK_GLASS: "true" }),
    {
      async fetchImpl() {
        return new Response(null, {
          status: 302,
          headers: { Location: `${ROOT}/control-tower/access` },
        });
      },
    },
  );
  assert.equal(operator.status, 502);
  assert.deepEqual(await operator.json(), {
    ok: false,
    error: "invalid_upstream_redirect",
  });
});

test("operator mutations require same-origin provenance before proxying", async () => {
  const token = await biologixGatewayInternals.issueOperatorSession(
    SESSION_SECRET,
    "ops@ovotalent.com",
  );
  let called = false;
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `__Host-biologix_operator=${token}`,
        Origin: "https://evil.example",
      },
      body: "{}",
    }),
    baseEnv({ BIOLOGIX_ALLOW_BREAK_GLASS: "true" }),
    {
      async fetchImpl() {
        called = true;
        return new Response();
      },
    },
  );
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("operator projection binds the verified identity into the signed request", async () => {
  const token = await biologixGatewayInternals.issueOperatorSession(
    SESSION_SECRET,
    "ops@ovotalent.com",
  );
  let capturedHeaders;
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/projection`, {
      headers: {
        Accept: "application/json",
        Cookie:
          `__Host-biologix_operator=${token}; biologix_session=${AFFILIATE_SESSION}`,
      },
    }),
    baseEnv({ BIOLOGIX_ALLOW_BREAK_GLASS: "true" }),
    {
      async fetchImpl(_url, init) {
        capturedHeaders = init.headers;
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  );
  assert.equal(response.status, 200);
  assert.ok(capturedHeaders.get("X-OVO-Operator-Assertion"));
  assert.equal(capturedHeaders.get("Cookie"), null);
  assert.match(
    capturedHeaders.get("X-OVO-Gateway-Operator-SHA256") ?? "",
    /^[a-f0-9]{64}$/u,
  );
});

test("control tower proxy exposes only the projection and action contract", async () => {
  const unknown = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/internal-debug`),
    baseEnv(),
  );
  assert.equal(unknown.status, 404);

  const projectionMutation = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/projection`, {
      method: "POST",
      headers: { Origin: ROOT },
      body: "{}",
    }),
    baseEnv(),
  );
  assert.equal(projectionMutation.status, 405);
  assert.equal(projectionMutation.headers.get("Allow"), "GET, HEAD");

  const actionRead = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/action`),
    baseEnv(),
  );
  assert.equal(actionRead.status, 405);
  assert.equal(actionRead.headers.get("Allow"), "POST");
});

test("operator logout is same-origin POST and clears the host-only cookie", async () => {
  const token = await biologixGatewayInternals.issueOperatorSession(
    SESSION_SECRET,
    "ops@ovotalent.com",
  );
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/logout`, {
      method: "POST",
      headers: {
        Cookie: `__Host-biologix_operator=${token}`,
        Origin: ROOT,
      },
    }),
    baseEnv({ BIOLOGIX_ALLOW_BREAK_GLASS: "true" }),
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("Set-Cookie") ?? "",
    /^__Host-biologix_operator=; Max-Age=0; Path=\/; HttpOnly; Secure; SameSite=Strict$/u,
  );
});

test("Passport document paths fall back to the packaged SPA shell", async () => {
  const seen = [];
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/passport/access?token=test`, {
      headers: { Accept: "text/html", "Sec-Fetch-Dest": "document" },
    }),
    baseEnv({
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          seen.push(pathname);
          if (pathname === "/passport/index.html") {
            return new Response("<main>passport</main>", {
              headers: { "Content-Type": "text/html" },
            });
          }
          return new Response("missing", { status: 404 });
        },
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(seen, ["/passport/access", "/passport/index.html"]);
  assert.equal(await response.text(), "<main>passport</main>");
});

test("tracking redirects preserve an external merchant destination", async () => {
  const merchant = "https://biologixlabsresearch.com/product/example?ref=abc";
  let capturedHeaders;
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/r/biologix/creator-code`, {
      headers: {
        Cookie:
          `biologix_session=${AFFILIATE_SESSION}; __Host-biologix_operator=operator-secret`,
        Referer: "https://instagram.com/",
        "X-Biologix-Probe": "probe_nonce_1234567890",
        "X-Biologix-Probe-Signature": "a".repeat(64),
      },
    }),
    baseEnv(),
    {
      async fetchImpl(_url, init) {
        capturedHeaders = init.headers;
        return new Response(null, {
          status: 302,
          headers: {
            "Access-Control-Allow-Origin": "*",
            Location: merchant,
            Refresh: "0; url=https://evil.example",
            "Set-Cookie": "danger=value; Path=/",
          },
        });
      },
    },
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), merchant);
  assert.equal(capturedHeaders.get("Cookie"), null);
  assert.equal(capturedHeaders.get("Referer"), "https://instagram.com/");
  assert.equal(
    capturedHeaders.get("X-Biologix-Probe"),
    "probe_nonce_1234567890",
  );
  assert.equal(
    capturedHeaders.get("X-Biologix-Probe-Signature"),
    "a".repeat(64),
  );
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(response.headers.get("Refresh"), null);
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("tracking accepts one code segment and redirects only to approved HTTPS merchants", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response();
  };
  for (const path of [
    "/r/biologix/ab",
    "/r/biologix/code/nested",
    "/r/biologix/code%2Fnested",
    "/r/biologix/code.",
    "/r/biologix/" + "a".repeat(33),
  ]) {
    const response = await handleBiologixGatewayRequest(
      new Request(`${ROOT}${path}`),
      baseEnv(),
      { fetchImpl },
    );
    assert.equal(response.status, 404, path);
  }
  assert.equal(calls, 0);

  for (const [location, overrides] of [
    ["https://evil.example/product", {}],
    ["http://biologixlabsresearch.com/product", {}],
    ["https://biologixlabsresearch.com.evil.example/product", {}],
    ["https://biologixlabsresearch.com:444/product", {}],
    [
      "https://biologixlabsresearch.com/product",
      { BIOLOGIX_TRACKING_REDIRECT_HOSTS: "" },
    ],
  ]) {
    const response = await handleBiologixGatewayRequest(
      new Request(`${ROOT}/r/biologix/VALID20`),
      baseEnv(overrides),
      {
        async fetchImpl() {
          return new Response(null, {
            status: 302,
            headers: { Location: location },
          });
        },
      },
    );
    assert.equal(response.status, 502, location);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "invalid_upstream_redirect",
    });
  }
});

test("reserved lifecycle routes fail closed instead of falling through", async () => {
  const apiRoot = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/biologix`),
    baseEnv(),
  );
  assert.equal(apiRoot.status, 404);
  assert.deepEqual(await apiRoot.json(), {
    ok: false,
    error: "not_found",
  });

  const trackingMutation = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/r/biologix/creator-code`, {
      method: "POST",
      headers: { Origin: ROOT },
    }),
    baseEnv(),
  );
  assert.equal(trackingMutation.status, 405);
  assert.equal(trackingMutation.headers.get("Allow"), "GET, HEAD");

  const sessionRead = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/api/control-tower/session`),
    baseEnv(),
  );
  assert.equal(sessionRead.status, 405);
  assert.equal(sessionRead.headers.get("Allow"), "POST");
});

test("Biologix HTML responses carry private-cache and browser security policy", async () => {
  const response = await handleBiologixGatewayRequest(
    new Request(`${ROOT}/passport/login`, {
      headers: {
        Accept: "text/html",
        "Sec-Fetch-Dest": "document",
      },
    }),
    baseEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.match(
    response.headers.get("Content-Security-Policy") ?? "",
    /frame-ancestors 'none'/u,
  );
  assert.equal(
    response.headers.get("Strict-Transport-Security"),
    "max-age=31536000",
  );
});

test("Wrangler sends reserved API roots through the fail-closed Worker", async () => {
  const config = JSON.parse(
    await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const workerFirst = new Set(config.assets.run_worker_first);
  for (const route of [
    "/api/biologix",
    "/api/biologix/*",
    "/api/control-tower",
    "/api/control-tower/*",
    "/r/biologix",
    "/r/biologix/*",
  ]) {
    assert.equal(workerFirst.has(route), true, route);
  }
});
