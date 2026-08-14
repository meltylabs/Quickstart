import { runSnapshot } from "../lib/blob-store.js";
import { hasBearerToken, json, unauthorized } from "../lib/http.js";

export const maxDuration = 300;

export async function GET(request) {
  if (
    request.method !== "GET" ||
    !hasBearerToken(request, process.env.CRON_SECRET)
  ) {
    return unauthorized();
  }

  try {
    const result = await runSnapshot("cron");
    console.log(JSON.stringify({ event: "biologix_public_intel_snapshot", ...result }));
    return json(result);
  } catch (error) {
    console.error(error);
    return json(
      {
        error: "snapshot_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
}
