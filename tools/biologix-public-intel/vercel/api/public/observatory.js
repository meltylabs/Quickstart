import { getPublicObservatory } from "../../lib/observatory-store.js";

export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function response(payload, status, cacheControl) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": cacheControl,
    },
  });
}

export function OPTIONS() {
  return response(null, 204, "public, max-age=86400");
}

export async function GET() {
  try {
    return response(
      await getPublicObservatory(),
      200,
      "public, max-age=60, s-maxage=900, stale-while-revalidate=3600",
    );
  } catch (error) {
    return response(
      {
        error: "public_observatory_unavailable",
        message: "The sanitized observatory aggregate is temporarily unavailable.",
      },
      503,
      "no-store",
    );
  }
}
