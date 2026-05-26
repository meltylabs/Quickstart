# FitDrop Card — Post-Hackathon TODOs

Items explicitly deferred from the hackathon build. Review after the demo.

## V2 Features

- **Card aesthetic templates** — one excellent dark-mode card ships for the demo; add light/loud variants post-hackathon once the base card design is proven. Design decision needed first.
- **Drop Calendar** — pre-loaded upcoming drop images for one-click try-on. V2 feature once the manual upload flow is proven at scale.
- **Auto-garment segmentation** — Florence-2/Replicate for leaked/grainy item photos (Approach C from office-hours design session). Chained AI calls add latency and failure modes; only viable once the core loop is stable.
- **Creator profiles** — username, profile page, history of posted drops. Requires auth and a database schema; not needed for the demo's social proof.

## Infrastructure

- ~~**KV TTL** — add 7-day TTL on `vote:{shareId}` keys before any real traffic.~~ **Completed: v0.0.1.0 (2026-05-26)**
- **`votes-by-item:{itemId}` aggregation key** — aggregate vote data by item (not card) to survive TTL rotation and enable trend queries.
- **Structured item identifier** — replace free-text `itemName` with SKU or StockX/GOAT product link. Required to make vote data actionable for brands.
- **Neon Postgres** — replace Vercel KV once query complexity exceeds simple counters.
- **Vercel KV → Vercel Blob** — if base64 imageDataUrl in KV approaches the 1MB limit, migrate image storage to Vercel Blob with a same-origin proxy route.

## Testing

- **Playwright E2E tests** — end-to-end coverage for the generation flow (upload → try-on card renders) and vote flow (share URL → Cop/Drop buttons increment). Catches integration failures (Hono routing, KV writes, html2canvas) that unit tests miss.
- **Client-side polling resilience** — move the 30×2s Fashn.ai status poll loop from the Hono serverless function to the browser (`/api/status` called every 2s by the frontend). Eliminates Vercel Hobby 60s function timeout risk for slow generations (>55s).

## Product

- **Leaderboard** — top-voted fits this week, aggregated across all cards. The viral distribution mechanic that turns personal flexes into cultural signals.
- **Brand API access** — paid API endpoint for brands to query Cop/Drop ratios by item ID before production decisions. The 10x revenue model.
- **Second try-on provider** — evaluate IDM-VTON on Replicate as a hedge against Fashn.ai pricing/availability changes.
