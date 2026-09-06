#!/usr/bin/env bash
set -euo pipefail

FRONTEND_PORT="${CONDUCTOR_PORT:-8912}"
BACKEND_PORT="$((FRONTEND_PORT + 1))"
export VITE_API_PROXY_TARGET="http://127.0.0.1:${BACKEND_PORT}"
export XTB_DATA_DIR="${XTB_DATA_DIR:-.context/xtb-data}"
export XTB_GENERATED_DIR="${XTB_GENERATED_DIR:-public/data/generated}"

npx concurrently \
  --names api,preview \
  --prefix-colors blue,green \
  ".venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port ${BACKEND_PORT}" \
  "npx vite preview --host 127.0.0.1 --port ${FRONTEND_PORT}"
