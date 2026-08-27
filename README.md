# XTB CODEX Bone-Marrow Portal

This workspace is a local FastAPI + Vite/React portal for the CODEX normal bone-marrow benchmark. It uses only synced analysis artifacts from `ohsu-ec2:/data/xtb_pilot_2026-08-25`; generated Zarr stores and source data stay out of git.

## Data

Defaults:

```sh
XTB_REMOTE=ohsu-ec2:/data/xtb_pilot_2026-08-25
XTB_DATA_DIR=.context/xtb-data
XTB_GENERATED_DIR=public/data/generated
```

`scripts/sync_xtb_data.sh` copies the required CSV, NPZ subsamples, provenance, benchmark outputs, map export, and code receipts. RDS files are not copied by default; their expected MD5 receipts are verified from `NBM.md5`. Use `--with-rds` only when local RDS copies are needed.

`scripts/build_portal_data.py` verifies the expected CSV SHA-256, checks benchmark counts, rebuilds sample row identities from the CSV, writes real AnnData Zarr stores for the 12,000-cell donor subsamples, and emits `public/data/generated/manifest.json`.

## Run

```sh
./scripts/setup.sh
./scripts/dev.sh
```

Conductor runs the same commands through `.conductor/settings.toml`. Vite serves the portal at `http://127.0.0.1:${CONDUCTOR_PORT:-8912}` and proxies API calls to FastAPI on `CONDUCTOR_PORT + 1`.

## API

- `GET /api/health`
- `GET /api/provenance`
- `GET /api/cohort`
- `GET /api/biology`
- `GET /api/sweep`
- `GET /api/transfer?frac=&seed=`
- `GET /api/maps`
- `GET /vitessce/config?sample=&seed=`
- Static generated assets under `/data/generated/*`

Missing data is reported as a hard portal state. The app does not synthesize donors, cells, marker values, transfer results, or provenance.

## Tests

```sh
./scripts/test.sh
```

The test script verifies source artifacts, backend contracts, a production frontend build, and Playwright smoke checks against the local portal.
