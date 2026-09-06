#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${PYTHON:-}" ]]; then
  PYTHON_BIN="$PYTHON"
elif command -v python3.12 >/dev/null 2>&1; then
  PYTHON_BIN="python3.12"
else
  PYTHON_BIN="python3"
fi

TARGET_VERSION="$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [[ -x .venv/bin/python ]]; then
  CURRENT_VERSION="$(.venv/bin/python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  if [[ "$CURRENT_VERSION" != "$TARGET_VERSION" ]]; then
    rm -rf .venv
  fi
fi

"$PYTHON_BIN" -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

./scripts/sync_xtb_data.sh "$@"
.venv/bin/python scripts/build_portal_data.py --force
