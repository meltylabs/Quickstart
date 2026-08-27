#!/usr/bin/env bash
set -euo pipefail

FRONTEND_PORT="${CONDUCTOR_PORT:-8912}"
BACKEND_PORT="$((FRONTEND_PORT + 1))"
export VITE_API_PROXY_TARGET="http://127.0.0.1:${BACKEND_PORT}"
export XTB_DATA_DIR="${XTB_DATA_DIR:-.context/xtb-data}"
export XTB_GENERATED_DIR="${XTB_GENERATED_DIR:-public/data/generated}"

if [[ ! -x .venv/bin/python ]]; then
  echo "Missing .venv. Run ./scripts/setup.sh first." >&2
  exit 1
fi

npx concurrently \
  --names api,web \
  --prefix-colors blue,green \
  ".venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port ${BACKEND_PORT}" \
  "npm run dev -- --port ${FRONTEND_PORT}"
