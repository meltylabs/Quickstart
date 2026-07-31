# Biologix public-intelligence service on Vercel

This internal service preserves the existing 15-minute Biologix monitor and
adds the sharded Noli 25-company competitor observatory.

The original monitor stores its rolling 120-day history in private Vercel Blob
and performs public, unauthenticated GET requests only. Existing endpoints
remain unchanged:

- `GET /api/biologix-intel/health` is public.
- `GET /api/biologix-intel/latest` requires `INTEL_API_TOKEN`.
- `GET /api/biologix-intel/report?hours=24` requires the token.
- `POST /api/biologix-intel/snapshot` requires the token.
- `GET /api/cron` is protected by `CRON_SECRET`.

The competitor observatory is documented in [OBSERVATORY.md](./OBSERVATORY.md).
Its public surface is `GET /api/public/observatory`; raw evidence and all
operational state remain in private Blob and behind `INTEL_API_TOKEN`.

Production requires `INTEL_API_TOKEN`, `CRON_SECRET`, and the private Blob
store's connected `BLOB_READ_WRITE_TOKEN`.

## Verification

```bash
npm ci
npm test
npm run check
vercel build
```
