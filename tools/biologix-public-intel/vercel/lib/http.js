import { timingSafeEqual } from "node:crypto";

export function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...headers,
    },
  });
}

export function hasBearerToken(request, expected) {
  if (!expected) return false;
  const actual =
    (typeof request.headers?.get === "function"
      ? request.headers.get("Authorization")
      : request.headers?.authorization) ?? "";
  const wanted = `Bearer ${expected}`;
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(wanted));
}

export function unauthorized() {
  return json(
    {
      error: "unauthorized",
      message: "Use the private Biologix intelligence bearer token.",
    },
    401,
    { "WWW-Authenticate": 'Bearer realm="biologix-intel"' },
  );
}
