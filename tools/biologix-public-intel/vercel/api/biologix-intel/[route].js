import {
  getHealth,
  getLatest,
  getReport,
  runSnapshot,
} from "../../lib/blob-store.js";
import { hasBearerToken, json, unauthorized } from "../../lib/http.js";

export const maxDuration = 300;

async function handle(request) {
  const url = new URL(request.url);
  const route = url.pathname.split("/").at(-1);

  try {
    if (request.method === "GET" && route === "health") {
      return json(await getHealth());
    }

    if (!hasBearerToken(request, process.env.INTEL_API_TOKEN)) {
      return unauthorized();
    }

    if (request.method === "GET" && route === "latest") {
      return json(await getLatest());
    }
    if (request.method === "GET" && route === "report") {
      return json(await getReport(url.searchParams.get("hours")));
    }
    if (request.method === "POST" && route === "snapshot") {
      return json(await runSnapshot("manual"), 201);
    }
    return json({ error: "not_found" }, 404);
  } catch (error) {
    return json(
      {
        error: "intel_request_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
}

export function GET(request) {
  return handle(request);
}

export function POST(request) {
  return handle(request);
}
