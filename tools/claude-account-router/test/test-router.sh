#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

export HOME="$TEST_ROOT/home"
export CLAUDE_ACCOUNT_STORE="$HOME/.claude-accounts"
export CLAUDE_PROFILE_ROOT="$HOME/.claude-profiles"
export CLAUDE_GLOBAL_CONFIG="$HOME/.claude"
export CLAUDE_ACCOUNT_BIN_DIR="$HOME/.claude/bin"
export CLAUDE_SWITCHER_DISCOVERY_BIN="$HOME/.local/bin"
export CLAUDE_ACCOUNT_BACKUP_ROOT="$HOME/backups"
export CLAUDE_ACCOUNT_INSTALL_WATCHER=0
export CONDUCTOR_BIN_DIR="$HOME/conductor-bin"
export CONDUCTOR_CLAUDE_AGENT_ROOT="$HOME/conductor-agent-binaries"
export CLAUDE_ACCOUNT_SELECTED_FILE="$CLAUDE_ACCOUNT_STORE/.conductor-active"
export CONDUCTOR_CLAUDE_BIN="$TEST_ROOT/fake-claude"
FAKE_CLAUDE_BIN="$CONDUCTOR_CLAUDE_BIN"
export CAPTURE_FILE="$TEST_ROOT/capture"
export CLAUDE_USAGE_HELPER="$TEST_ROOT/fake-usage"

mkdir -p "$CLAUDE_ACCOUNT_STORE" "$CLAUDE_PROFILE_ROOT/alpha/projects" "$CLAUDE_PROFILE_ROOT/beta/projects" "$CLAUDE_GLOBAL_CONFIG/projects" "$CONDUCTOR_BIN_DIR" "$CONDUCTOR_CLAUDE_AGENT_ROOT/2.1.201"
ln -s "$CONDUCTOR_CLAUDE_BIN" "$CONDUCTOR_BIN_DIR/claude"

python3 - "$CLAUDE_ACCOUNT_STORE" "$CLAUDE_PROFILE_ROOT" <<'PY'
import json
import sys
from datetime import datetime, timezone
import time
from pathlib import Path

store = Path(sys.argv[1])
profiles = Path(sys.argv[2])
for name in ("alpha", "beta"):
    blob = {
        "claudeAiOauth": {
            "accessToken": f"access-{name}",
            "refreshToken": f"sk-ant-ort-{name}",
            "expiresAt": int((time.time() + 3600) * 1000),
        }
    }
    (store / f"{name}.json").write_text(json.dumps(blob))
    (profiles / name / ".credentials.json").write_text(json.dumps(blob))
PY

printf 'alpha\n' > "$CLAUDE_ACCOUNT_STORE/.active"
printf '# shared instructions\n' > "$CLAUDE_GLOBAL_CONFIG/CLAUDE.md"
printf '{"session":"alpha"}\n' > "$CLAUDE_PROFILE_ROOT/alpha/projects/session.jsonl"

cat > "$CONDUCTOR_CLAUDE_BIN" <<'FAKE'
#!/bin/bash
if [ "${1:-}" = "auth" ] && [ "${2:-}" = "status" ]; then
  if [ -f "$CLAUDE_CONFIG_DIR/.credentials.json" ]; then
    printf '{"loggedIn":true}\n'
    exit 0
  fi
  printf '{"loggedIn":false}\n'
  exit 1
fi
if [ "${1:-}" = "auth" ] && [ "${2:-}" = "login" ]; then
  printf '%s\n' '{"claudeAiOauth":{"accessToken":"new-access","refreshToken":"sk-ant-ort-new","expiresAt":9999999999999,"scopes":["user:profile"]}}' > "$CLAUDE_CONFIG_DIR/.credentials.json"
fi
printf '%s\n' "$CLAUDE_CONFIG_DIR" > "$CAPTURE_FILE"
printf '%s\n' "$*" >> "$CAPTURE_FILE"
FAKE
chmod 700 "$CONDUCTOR_CLAUDE_BIN"
ln -s "$CONDUCTOR_CLAUDE_BIN" "$CONDUCTOR_CLAUDE_AGENT_ROOT/2.1.201/claude"

cat > "$CLAUDE_USAGE_HELPER" <<'FAKE'
#!/bin/bash
case "${1:-}" in
  --best) printf 'beta\n' ;;
  --state) printf 'ready\n' ;;
  --ensure) exit 0 ;;
esac
FAKE
chmod 700 "$CLAUDE_USAGE_HELPER"

if CONDUCTOR_CLAUDE_BIN="$TEST_ROOT/missing-claude" "$ROOT/install.sh" >/dev/null 2>&1; then
  echo "installer accepted an invalid explicit Claude binary" >&2
  exit 1
fi
[ "$(readlink "$CONDUCTOR_BIN_DIR/claude")" = "$FAKE_CLAUDE_BIN" ]

"$ROOT/install.sh" >/dev/null

[ -L "$CLAUDE_PROFILE_ROOT/alpha/projects" ]
[ -f "$CLAUDE_GLOBAL_CONFIG/projects/session.jsonl" ]
[ "$(readlink "$CONDUCTOR_BIN_DIR/claude")" = "$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" ]
[ "$(readlink "$CONDUCTOR_BIN_DIR/claude-router-target")" = "$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$FAKE_CLAUDE_BIN")" ]
[ "$(readlink "$CLAUDE_SWITCHER_DISCOVERY_BIN/claude-switcher")" = "$CLAUDE_ACCOUNT_BIN_DIR/claude-switcher" ]

"$CLAUDE_ACCOUNT_BIN_DIR/claude-acct" use beta >/dev/null
[ "$("$CLAUDE_ACCOUNT_BIN_DIR/claude-acct" current)" = "beta" ]

"$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" --version
[ "$(sed -n '1p' "$CAPTURE_FILE")" = "$CLAUDE_PROFILE_ROOT/beta" ]
[ "$(sed -n '2p' "$CAPTURE_FILE")" = "--version" ]
[ "$(sed -n '1p' "$CLAUDE_PROFILE_ROOT/beta/CLAUDE.md")" = "# shared instructions" ]

# Reinstall repairs a missing saved target even when the stable Conductor link
# already points back at the wrapper. The launcher must never recurse into
# itself in that partial-install state.
unset CONDUCTOR_CLAUDE_BIN
rm "$CONDUCTOR_BIN_DIR/claude-router-target"
"$ROOT/install.sh" >/dev/null
[ "$(readlink "$CONDUCTOR_BIN_DIR/claude-router-target")" = "$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$FAKE_CLAUDE_BIN")" ]
"$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" --version

"$CLAUDE_ACCOUNT_BIN_DIR/claude-acct" next >/dev/null
[ "$("$CLAUDE_ACCOUNT_BIN_DIR/claude-acct" current)" = "alpha" ]

# A manual selection applies to exactly one launch even when automatic ranking
# prefers another profile. The following launch resumes automatic selection.
"$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" --version
[ "$("$CLAUDE_ACCOUNT_BIN_DIR/claude-acct" current)" = "alpha" ]
"$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" --version
[ "$("$CLAUDE_ACCOUNT_BIN_DIR/claude-acct" current)" = "beta" ]

# An executable helper failure must not silently relaunch the stale selected
# account, and an invalid helper result must not corrupt the selection pointer.
printf 'alpha\n' > "$CLAUDE_ACCOUNT_SELECTED_FILE"
cat > "$CLAUDE_USAGE_HELPER" <<'FAKE'
#!/bin/bash
exit 1
FAKE
chmod 700 "$CLAUDE_USAGE_HELPER"
if "$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" --version >/dev/null 2>&1; then
  echo "launcher accepted a failed account decision" >&2
  exit 1
fi
[ "$(sed -n '1p' "$CLAUDE_ACCOUNT_SELECTED_FILE")" = "alpha" ]

mv "$CLAUDE_USAGE_HELPER" "$CLAUDE_USAGE_HELPER.off"
if "$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" --version >/dev/null 2>&1; then
  echo "launcher accepted a missing account helper" >&2
  exit 1
fi
[ "$(sed -n '1p' "$CLAUDE_ACCOUNT_SELECTED_FILE")" = "alpha" ]
mv "$CLAUDE_USAGE_HELPER.off" "$CLAUDE_USAGE_HELPER"

cat > "$CLAUDE_USAGE_HELPER" <<'FAKE'
#!/bin/bash
case "${1:-}" in
  --best) printf 'missing-profile\n' ;;
  --state) printf 'login-required\n'; exit 1 ;;
esac
FAKE
chmod 700 "$CLAUDE_USAGE_HELPER"
if "$CLAUDE_ACCOUNT_BIN_DIR/conductor-claude" --version >/dev/null 2>&1; then
  echo "launcher accepted a nonexistent account" >&2
  exit 1
fi
[ "$(sed -n '1p' "$CLAUDE_ACCOUNT_SELECTED_FILE")" = "alpha" ]

cat > "$CLAUDE_USAGE_HELPER" <<'FAKE'
#!/bin/bash
case "${1:-}" in
  --best) printf 'beta\n' ;;
  --state) printf 'ready\n' ;;
  --ensure) exit 0 ;;
esac
FAKE
chmod 700 "$CLAUDE_USAGE_HELPER"

# The documented recovery path can bootstrap a genuinely new isolated profile.
"$CLAUDE_ACCOUNT_BIN_DIR/claude-acct" login new-account >/dev/null
[ -f "$CLAUDE_PROFILE_ROOT/new-account/.credentials.json" ]
"$CLAUDE_ACCOUNT_BIN_DIR/claude-switcher" help >/dev/null
"$CLAUDE_SWITCHER_DISCOVERY_BIN/claude-switcher" help >/dev/null

python3 - "$ROOT/bin/claude-rate-limit-watch.py" "$TEST_ROOT/quarantine.json" <<'PY'
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

spec = importlib.util.spec_from_file_location("switcher_watch", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

command = (
    "/path/agent-binaries/claude/2.1.201/claude "
    "--resume 12345678-1234-1234-1234-123456789abc"
)
assert module.SESSION_PATTERN.search(command).group(1) == "12345678-1234-1234-1234-123456789abc"
processes = SimpleNamespace(
    returncode=0,
    stdout=(
        "101 1 Fri Jul 31 12:34:56 2026 "
        "/Users/test/Library/Application Support/com.conductor.app/bin/claude "
        "--resume abcdef12-1234-1234-1234-123456789abc\n"
        "202 1 Fri Jul 31 12:35:56 2026 /Users/test/.local/bin/claude "
        "--resume fedcba98-1234-1234-1234-123456789abc\n"
    ),
)
environment = SimpleNamespace(
    returncode=0,
    stdout=(
        "/Users/test/Library/Application Support/com.conductor.app/bin/claude "
        "--resume abcdef12-1234-1234-1234-123456789abc "
        f"CLAUDE_CONFIG_DIR={module.PROFILE_ROOT / 'hello@ovo'}"
    ),
)
with mock.patch.object(
    module.subprocess, "run", side_effect=[processes, environment]
):
    sessions = module.active_claude_sessions()
assert sessions["abcdef12-1234-1234-1234-123456789abc"][2] == "hello@ovo"
assert "fedcba98-1234-1234-1234-123456789abc" not in sessions

module.QUARANTINE_FILE = Path(sys.argv[2])
module.QUARANTINE_SECONDS = 60
module.quarantine_account("hello@ovo", "hard session limit")
quarantine = json.loads(module.QUARANTINE_FILE.read_text())
assert quarantine["hello@ovo"]["reason"] == "hard session limit"
assert quarantine["hello@ovo"]["until"] > quarantine["hello@ovo"]["observed_at"]

malformed_transcript = Path(sys.argv[2]).with_name("malformed.jsonl")
malformed_transcript.write_text('["rate_limit"]\n')
assert module.latest_rate_limit(malformed_transcript) is None

module.USAGE_HELPER = module.QUARANTINE_FILE
usage_payload = SimpleNamespace(
    returncode=0,
    stdout=json.dumps(
        {
            "accounts": [
                ["not-an-object"],
                {"name": "bad", "authenticated": True, "usage": []},
                {
                    "name": "healthy",
                    "authenticated": True,
                    "usage": {"five_hour": 42, "seven_day": 7},
                },
            ]
        }
    ),
)
with mock.patch.object(module.subprocess, "run", return_value=usage_payload):
    assert module.account_usage() == {"healthy": (42.0, 7.0)}

session_id = "abcdef12-1234-1234-1234-123456789abc"
now = datetime.now(timezone.utc)
module.load_state = lambda: {}
module.save_state = lambda state: None
module.transcript_path = lambda _: Path("unused")
module.latest_rate_limit = lambda _: now.isoformat()
module.session_status = lambda _: "idle"

module.active_claude_sessions = lambda: {session_id: (101, now, None)}
with (
    mock.patch.object(module, "quarantine_account") as quarantine_account,
    mock.patch.object(module.os, "kill") as kill,
):
    assert module.scan() == []
quarantine_account.assert_not_called()
kill.assert_not_called()

module.active_claude_sessions = lambda: {session_id: (101, now, "hello@ovo")}
with (
    mock.patch.object(module, "quarantine_account", return_value=False),
    mock.patch.object(module.os, "kill") as kill,
):
    assert module.scan() == []
kill.assert_not_called()
module.account_usage = lambda: {
    "healthy": (42.0, 20.0),
    "five-hour-drain": (90.0, 20.0),
    "weekly-drain": (5.0, 95.0),
}
assert module.draining_accounts() == {"five-hour-drain", "weekly-drain"}
PY

python3 "$ROOT/test/test_usage.py"

echo "router tests passed"
