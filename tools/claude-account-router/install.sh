#!/bin/bash
# Install the account router and preserve existing profile/session data.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_SOURCE="$SCRIPT_DIR/bin"
TARGET_BIN="${CLAUDE_ACCOUNT_BIN_DIR:-$HOME/.claude/bin}"
DISCOVERY_BIN="${CLAUDE_SWITCHER_DISCOVERY_BIN:-$HOME/.local/bin}"
STORE="${CLAUDE_ACCOUNT_STORE:-$HOME/.claude-accounts}"
PROFILE_ROOT="${CLAUDE_PROFILE_ROOT:-$HOME/.claude-profiles}"
GLOBAL_CONFIG="${CLAUDE_GLOBAL_CONFIG:-$HOME/.claude}"
BACKUP_ROOT="${CLAUDE_ACCOUNT_BACKUP_ROOT:-$HOME/.claude-account-router-backups}"
CONDUCTOR_BIN_DIR="${CONDUCTOR_BIN_DIR:-$HOME/Library/Application Support/com.conductor.app/bin}"
CONDUCTOR_AGENT_ROOT="${CONDUCTOR_CLAUDE_AGENT_ROOT:-$(dirname "$CONDUCTOR_BIN_DIR")/agent-binaries/claude}"
CONDUCTOR_CLAUDE_LINK="$CONDUCTOR_BIN_DIR/claude"
CONDUCTOR_ROUTER_TARGET="$CONDUCTOR_BIN_DIR/claude-router-target"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.alexweinstein.claude-switcher.plist"
LEGACY_LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.alexweinstein.claude-account-router.plist"
stamp="$(date +%Y%m%d-%H%M%S)"
backup="$BACKUP_ROOT/$stamp"

mkdir -p "$TARGET_BIN" "$DISCOVERY_BIN" "$STORE" "$PROFILE_ROOT" "$GLOBAL_CONFIG/projects" "$backup" "$CONDUCTOR_BIN_DIR"
chmod 700 "$TARGET_BIN" "$DISCOVERY_BIN" "$STORE" "$PROFILE_ROOT" "$BACKUP_ROOT" "$backup"

# Resolve a direct Claude binary before changing Conductor's stable link. This
# repairs partial installs where the stable link points at our wrapper but the
# saved router target has disappeared, without ever selecting the wrapper as
# its own downstream executable.
resolved_claude="$(python3 - "$CONDUCTOR_CLAUDE_LINK" "$CONDUCTOR_AGENT_ROOT" "$CONDUCTOR_ROUTER_TARGET" "${CONDUCTOR_CLAUDE_BIN:-}" <<'PY'
import os
import sys
from pathlib import Path

stable, agent_root, saved_target, explicit = sys.argv[1:]
candidates = []
if explicit:
    candidates = [Path(explicit)]
else:
    versioned = []
    for path in Path(agent_root).glob("*/claude"):
        try:
            versioned.append((path.stat().st_mtime, path))
        except OSError:
            pass
    candidates.extend(
        path for _, path in sorted(versioned, key=lambda item: item[0], reverse=True)
    )
    candidates.extend(
        (Path(stable), Path(saved_target), Path("/opt/homebrew/bin/claude"))
    )
for candidate in candidates:
    try:
        resolved = Path(os.path.realpath(candidate))
        if (
            candidate.is_file()
            and os.access(candidate, os.X_OK)
            and resolved.name != "conductor-claude"
        ):
            print(resolved)
            raise SystemExit(0)
    except OSError:
        pass
raise SystemExit(1)
PY
)" || {
  echo "install: no direct Conductor Claude executable found; leaving Conductor unchanged" >&2
  exit 1
}

for name in claude-acct claude-acct-run claude-acct-usage.py conductor-claude claude-rate-limit-watch.py claude-switcher; do
  if [ -e "$TARGET_BIN/$name" ]; then
    cp -p "$TARGET_BIN/$name" "$backup/$name"
  fi
  install -m 700 "$BIN_SOURCE/$name" "$TARGET_BIN/$name"
done
ln -sfn "$TARGET_BIN/claude-switcher" "$DISCOVERY_BIN/claude-switcher"

# Conductor caches its executable-path setting in the running sidecar. Route
# the live bundled symlink through the launcher so future Claude processes use
# the router immediately, without restarting Conductor or unrelated chats.
readlink "$CONDUCTOR_CLAUDE_LINK" > "$backup/conductor-claude-previous-link.txt" 2>/dev/null || true
readlink "$CONDUCTOR_ROUTER_TARGET" > "$backup/conductor-router-previous-link.txt" 2>/dev/null || true
printf '%s\n' "$resolved_claude" > "$backup/conductor-claude-original-target.txt"
ln -sfn "$resolved_claude" "$CONDUCTOR_ROUTER_TARGET"
ln -sfn "$TARGET_BIN/conductor-claude" "$CONDUCTOR_CLAUDE_LINK"

for snapshot in "$STORE"/*.json; do
  [ -e "$snapshot" ] || continue
  account="$(basename "$snapshot" .json)"
  profile="$PROFILE_ROOT/$account"
  mkdir -p "$profile"
  chmod 700 "$profile"
  if [ ! -f "$profile/.credentials.json" ]; then
    install -m 600 "$snapshot" "$profile/.credentials.json"
  fi

  # Claude stores resumable transcripts under projects. Merge any pre-existing
  # isolated history into the global transcript store, retain a backup, then
  # share the global directory so an affected Conductor chat can resume after
  # selecting another account.
  if [ -d "$profile/projects" ] && [ ! -L "$profile/projects" ]; then
    mkdir -p "$backup/profile-projects/$account"
    rsync -a --ignore-existing "$profile/projects/" "$GLOBAL_CONFIG/projects/"
    mv "$profile/projects" "$backup/profile-projects/$account/projects"
  fi
  if [ ! -e "$profile/projects" ]; then
    ln -s "$GLOBAL_CONFIG/projects" "$profile/projects"
  fi
done

if [ "${CLAUDE_ACCOUNT_INSTALL_WATCHER:-1}" = "1" ] && command -v launchctl >/dev/null 2>&1; then
  mkdir -p "$(dirname "$LAUNCH_AGENT")" "$HOME/Library/Logs"
  "$TARGET_BIN/claude-rate-limit-watch.py" --initialize
  if [ -f "$LEGACY_LAUNCH_AGENT" ]; then
    launchctl bootout "gui/$(id -u)" "$LEGACY_LAUNCH_AGENT" >/dev/null 2>&1 || true
    mv "$LEGACY_LAUNCH_AGENT" "$backup/"
  fi
  cat > "$LAUNCH_AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.alexweinstein.claude-switcher</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$TARGET_BIN/claude-rate-limit-watch.py</string>
    <string>--interval</string>
    <string>1</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/claude-account-router.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/claude-account-router.err.log</string>
</dict>
</plist>
PLIST
  chmod 600 "$LAUNCH_AGENT"
  launchctl bootout "gui/$(id -u)" "$LAUNCH_AGENT" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENT"
fi

selected="$STORE/.conductor-active"
if [ ! -f "$selected" ]; then
  if [ -f "$STORE/.active" ]; then
    sed -n '1p' "$STORE/.active" > "$selected"
  else
    first=""
    for snapshot in "$STORE"/*.json; do
      [ -e "$snapshot" ] || continue
      first="$(basename "$snapshot" .json)"
      break
    done
    [ -n "$first" ] && printf '%s\n' "$first" > "$selected"
  fi
  [ ! -f "$selected" ] || chmod 600 "$selected"
fi

echo "installed Claude account router"
echo "backup: $backup"
echo "Conductor executable: $TARGET_BIN/conductor-claude"
echo "automatic rate-limit watcher: $LAUNCH_AGENT"
