import { hasBearerToken, json, unauthorized } from "../lib/http.js";
import { parseCronSlot } from "../lib/observatory-core.js";
import { runObservatoryShard } from "../lib/observatory-store.js";

export const maxDuration = 300;

export async function GET(request) {
  if (
    request.method !== "GET" ||
    !hasBearerToken(request, process.env.CRON_SECRET)
  ) {
    return unauthorized();
  }

  const slot = parseCronSlot(new Date());
  if (!slot) {
    return json({ skipped: true, reason: "no_observatory_slot_due" });
  }

  try {
    const result = await runObservatoryShard(slot.cadence, slot.shard, {
      trigger: "cron",
    });
    console.log(JSON.stringify({ event: "noli_observatory_shard", ...result }));
    return json(result);
  } catch (error) {
    console.error(error);
    return json(
      {
        error: "observatory_snapshot_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
}
