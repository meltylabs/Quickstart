# Biologix public-intelligence service on Vercel

This internal service runs every 15 minutes on Vercel Cron and stores its
rolling 120-day history in a private Vercel Blob store.

It performs public, unauthenticated GET requests only. It records inventory,
price, availability, popularity order, product modification timestamps,
sitemap counts, WordPress/WooCommerce surface metadata, tracker/technology
presence, DNS records, cache headers, and response latency. Correlated
inventory decreases are labeled as probable baskets, never confirmed sales.

It does not collect customers, orders, carts, reviews, cookies, PII, raw HTML,
or authenticated WordPress/WooCommerce data. Visitors, sessions, pageviews,
traffic sources, conversion rate, and paid revenue are not publicly exposed by
the target and therefore remain explicitly unavailable.

## API

- `GET /api/biologix-intel/health` is public and contains no sensitive data.
- `GET /api/biologix-intel/latest` requires `Authorization: Bearer ...`.
- `GET /api/biologix-intel/report?hours=24` requires the same bearer token.
- `POST /api/biologix-intel/snapshot` requires the same bearer token.
- `GET /api/cron` is reserved for Vercel Cron and protected by `CRON_SECRET`.

Production requires `INTEL_API_TOKEN`, `CRON_SECRET`, and the private Blob
store's automatically connected `BLOB_READ_WRITE_TOKEN`.

## Verification

```bash
npm ci
npm test
npm run check
vercel build
```
