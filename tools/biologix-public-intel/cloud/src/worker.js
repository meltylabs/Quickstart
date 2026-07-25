import {
  BiologixIntelStore,
  handleBiologixIntelRequest,
  runScheduledBiologixSnapshot,
} from "./biologix-intel.js";

export { BiologixIntelStore };

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (
      pathname === "/api/biologix-intel" ||
      pathname.startsWith("/api/biologix-intel/")
    ) {
      return handleBiologixIntelRequest(request, env);
    }
    return new Response("Not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledBiologixSnapshot(env));
  },
};
