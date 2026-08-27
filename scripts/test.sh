#!/usr/bin/env bash
set -euo pipefail

if [[ ! -x .venv/bin/python ]]; then
  echo "Missing .venv. Run ./scripts/setup.sh first." >&2
  exit 1
fi

.venv/bin/python scripts/verify_data.py
.venv/bin/python -m pytest tests/backend -q
npm run build
npm run test:e2e
