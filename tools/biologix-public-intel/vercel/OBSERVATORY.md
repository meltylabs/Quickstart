# Noli competitor observatory

This is an additive extension to the existing `biologix-public-intel` Vercel
project. Existing `/api/biologix-intel/*` and `/api/cron` behavior stays
unchanged.

## Runtime

One hourly dispatcher fans work into five fixed shards of five companies:

- Hours 00:05 through 04:05 UTC: daily commerce shards 0 through 4.
- Sundays 05:05 through 09:05 UTC: weekly marketing shards 0 through 4.
- First day of each month 10:05 through 14:05 UTC: monthly trust, DNS and
  policy shards 0 through 4.

The state layer enforces cadence gating again, so duplicate Vercel deliveries
do not deep-scan targets. Each completed run writes a new private, immutable
Blob snapshot. Mutable shard state uses Blob ETags for concurrency control.
Failures keep the previous last-good company record and mark it stale.

The collector performs bounded, unauthenticated HTTPS GET requests against a
fixed hostname allowlist. It resolves DNS before every request, rejects
private/reserved IPs, rejects credentials, non-standard ports and literal IPs,
validates every redirect, and caps response size and redirect count.

Daily commerce runs paginate the complete public WooCommerce Store API parent
and variation feeds or Shopify `products.json` feed for supported targets.
Collection is capped at 20 pages and 3,000 normalized offers per company.
Reaching a bound or losing a later page produces an explicit partial snapshot;
it never converts the missing tail into removals. The four unsupported
storefronts use an intentional `limited_public_product_page` mode; a successful
limited capture is healthy but never represented as a complete catalog.
Non-2xx responses and challenge, login, age, or attestation gates are failed
observations and their contents are never parsed as catalog data.

It never creates accounts, crosses gates, submits forms or checkout, mutates a
cart, attempts payment, handles customer data, or evades access controls.

## API

- `GET /api/public/observatory` is public, sanitized and CORS-enabled for GET
  and OPTIONS without credentials. It always returns the 25 configured
  companies, aggregate summaries and sanitized changes. Raw URLs, snippets,
  DNS values, provider tokens and evidence records remain private.
- `GET /api/observatory/health` requires `INTEL_API_TOKEN`.
- `GET /api/observatory/latest?cadence=daily&shard=0` requires the token.
- `GET /api/observatory/raw?path=...` requires the token and accepts only the
  immutable observatory snapshot prefix.
- `POST /api/observatory/run?cadence=daily&shard=0&force=1` performs a manual
  backfill. Repeat for shards 0 through 4 and all three cadences after deploy.
- `GET /api/observatory-cron` is protected by Vercel `CRON_SECRET`.

## Production prerequisites

Deploy to the existing `biologix-public-intel` Vercel project:

- Project ID: `prj_u0c8JZKiEyXksvfilAN3MyXbVdGU`
- Team: `team_vii03cAuOlEJZwgBMXIDEN8J`
- `INTEL_API_TOKEN`: existing private API bearer token
- `CRON_SECRET`: existing Vercel Cron bearer token
- `BLOB_READ_WRITE_TOKEN`: existing private Vercel Blob connection

No new third-party account or credential is required.
