#!/usr/bin/env bash
set -euo pipefail

# Local workspaces already use the developer's installed tools. Cloud
# workspaces need a reproducible bootstrap because they do not inherit $HOME.
if [ "${CONDUCTOR_IS_LOCAL:-1}" != "0" ]; then
  exit 0
fi

export PATH="$HOME/.bun/bin:$PATH"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to install Gstack" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to install Bun for Gstack" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

GSTACK_REPO="${GSTACK_REPO:-https://github.com/garrytan/gstack.git}"
GSTACK_REF="${GSTACK_REF:-main}"
GSTACK_DIR="${GSTACK_DIR:-$HOME/.claude/skills/gstack}"

mkdir -p "$(dirname "$GSTACK_DIR")"

if [ -d "$GSTACK_DIR/.git" ]; then
  git -C "$GSTACK_DIR" fetch --depth 1 origin "$GSTACK_REF"
  git -C "$GSTACK_DIR" checkout --detach FETCH_HEAD
else
  rm -rf "$GSTACK_DIR"
  git clone --depth 1 "$GSTACK_REPO" "$GSTACK_DIR"
  git -C "$GSTACK_DIR" fetch --depth 1 origin "$GSTACK_REF"
  git -C "$GSTACK_DIR" checkout --detach FETCH_HEAD
fi

(
  cd "$GSTACK_DIR"
  ./setup --host claude --no-team -q
  ./setup --host codex --no-team -q
)
