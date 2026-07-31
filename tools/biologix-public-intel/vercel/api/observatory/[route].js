import { hasBearerToken, json, unauthorized } from "../../lib/http.js";
import {
  getObservatoryHealth,
  getObservatoryLatest,
  getRawEvidence,
  runObservatoryShard,
} from "../../lib/observatory-store.js";

export const maxDuration = 300;

async function handle(request) {
  if (!hasBearerToken(request, process.env.INTEL_API_TOKEN)) {
    return unauthorized();
  }
  const url = new URL(request.url);
  const route = url.pathname.split("/").at(-1);

  try {
    if (request.method === "GET" && route === "health") {
      return json(await getObservatoryHealth());
    }
    if (request.method === "GET" && route === "latest") {
      return json(
        await getObservatoryLatest(
          url.searchParams.get("cadence"),
          url.searchParams.get("shard"),
        ),
      );
    }
    if (request.method === "GET" && route === "raw") {
      return json(await getRawEvidence(url.searchParams.get("path") ?? ""));
    }
    if (request.method === "POST" && route === "run") {
      const force = url.searchParams.get("force") === "1";
      return json(
        await runObservatoryShard(
          url.searchParams.get("cadence"),
          url.searchParams.get("shard"),
          { trigger: force ? "manual_backfill" : "manual", force },
        ),
        201,
      );
    }
    return json({ error: "not_found" }, 404);
  } catch (error) {
    return json(
      {
        error: "observatory_request_failed",
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
