#!/usr/bin/env python3
"""Inspect and prepare isolated Claude account profiles for Conductor.

Usage reads are always GET-only. When account selection encounters an expired
access token, this helper asks the official Claude Code binary to refresh that
isolated profile through its documented headless login path. The helper never
calls Anthropic's token endpoint itself and never performs model inference.
"""

from __future__ import annotations

import concurrent.futures
import fcntl
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

STORE = Path(os.environ.get("CLAUDE_ACCOUNT_STORE", Path.home() / ".claude-accounts"))
PROFILE_ROOT = Path(os.environ.get("CLAUDE_PROFILE_ROOT", Path.home() / ".claude-profiles"))
SELECTED = Path(
    os.environ.get("CLAUDE_ACCOUNT_SELECTED_FILE", STORE / ".conductor-active")
)
CACHE = STORE / ".usage-cache.json"
REFRESH_FAILURES = STORE / ".refresh-failures.json"
QUARANTINE = Path(
    os.environ.get("CLAUDE_ACCOUNT_QUARANTINE_FILE", STORE / ".quarantined-accounts.json")
)
ROUTER_LOCK = STORE / ".router.lock"
USAGE_URL = os.environ.get(
    "CLAUDE_USAGE_URL", "https://api.anthropic.com/api/oauth/usage"
)
USER_AGENT = "claude-cli/2.1.201 (external, cli)"
FIVE_HOUR_DRAIN = float(os.environ.get("CLAUDE_SWITCHER_FIVE_HOUR_DRAIN", "90"))
SEVEN_DAY_DRAIN = float(os.environ.get("CLAUDE_SWITCHER_SEVEN_DAY_DRAIN", "95"))
TOKEN_MARGIN_SECONDS = int(os.environ.get("CLAUDE_SWITCHER_TOKEN_MARGIN_SECONDS", "300"))
KEYCHAIN_TIMEOUT_SECONDS = int(os.environ.get("CLAUDE_SWITCHER_KEYCHAIN_TIMEOUT", "5"))
VALID_ACCOUNT = re.compile(r"[A-Za-z0-9@][A-Za-z0-9@._-]*")


def read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    tmp = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    tmp.write_text(json.dumps(payload))
    tmp.chmod(0o600)
    os.replace(tmp, path)


@contextmanager
def router_lock():
    STORE.mkdir(parents=True, exist_ok=True, mode=0o700)
    STORE.chmod(0o700)
    with ROUTER_LOCK.open("a+") as handle:
        ROUTER_LOCK.chmod(0o600)
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def account_names() -> list[str]:
    names = {
        path.stem
        for path in STORE.glob("*.json")
        if not path.name.startswith(".") and VALID_ACCOUNT.fullmatch(path.stem)
    }
    if PROFILE_ROOT.exists():
        names.update(
            path.name
            for path in PROFILE_ROOT.iterdir()
            if path.is_dir() and VALID_ACCOUNT.fullmatch(path.name)
        )
    return sorted(names)


def profile_service(name: str) -> str:
    profile_dir = PROFILE_ROOT / name
    digest = hashlib.sha256(str(profile_dir).encode()).hexdigest()[:8]
    return f"Claude Code-credentials-{digest}"


def credentials(name: str) -> dict | None:
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", profile_service(name), "-w"],
            capture_output=True,
            text=True,
            check=True,
            timeout=KEYCHAIN_TIMEOUT_SECONDS,
        )
        # An existing Keychain item is authoritative, including an empty or
        # malformed logout tombstone. Never revive a stale file behind it.
        keychain = json.loads(result.stdout)
        return keychain if isinstance(keychain, dict) else None
    except subprocess.CalledProcessError as error:
        # macOS `security` uses 44 only when the requested item does not exist.
        # Locked, denied, and other Keychain failures must not revive a stale
        # on-disk refresh token.
        if error.returncode != 44:
            return None
    except FileNotFoundError:
        pass
    except (json.JSONDecodeError, subprocess.TimeoutExpired):
        return None
    profile_path = PROFILE_ROOT / name / ".credentials.json"
    if profile_path.exists():
        profile = read_json(profile_path)
        return profile if isinstance(profile, dict) else None
    snapshot = read_json(STORE / f"{name}.json")
    return snapshot if isinstance(snapshot, dict) else None


def normalized_scopes(oauth: dict) -> list[str]:
    scopes = oauth.get("scopes") or []
    if isinstance(scopes, str):
        scopes = scopes.split()
    if not isinstance(scopes, list):
        return []
    return [scope for scope in scopes if isinstance(scope, str) and scope]


def token_state(name: str) -> dict:
    blob = credentials(name) or {}
    if not isinstance(blob, dict):
        blob = {}
    oauth = blob.get("claudeAiOauth") or {}
    if not isinstance(oauth, dict):
        oauth = {}
    token = oauth.get("accessToken")
    refresh_token = oauth.get("refreshToken")
    try:
        expires_at = float(oauth.get("expiresAt") or 0)
    except (TypeError, ValueError):
        expires_at = 0
    access_usable = bool(
        isinstance(token, str)
        and token
        and math.isfinite(expires_at)
        and expires_at > (time.time() + TOKEN_MARGIN_SECONDS) * 1000
    )
    refreshable = bool(
        isinstance(refresh_token, str)
        and refresh_token.startswith("sk-ant-ort")
        and normalized_scopes(oauth)
    )
    return {
        "name": name,
        "access_token": token,
        "access_usable": access_usable,
        "refresh_token": refresh_token,
        "refreshable": refreshable,
        "scopes": normalized_scopes(oauth),
    }


def read_usage(token: str) -> dict | None:
    request = urllib.request.Request(USAGE_URL)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("User-Agent", USER_AGENT)
    request.add_header("anthropic-beta", "oauth-2025-04-20")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read())
            return payload if isinstance(payload, dict) else None
    except (urllib.error.HTTPError, OSError, ValueError):
        return None


def normalized(reading: dict) -> dict:
    five_hour = reading.get("five_hour") or {}
    seven_day = reading.get("seven_day") or {}
    if not isinstance(five_hour, dict):
        five_hour = {}
    if not isinstance(seven_day, dict):
        seven_day = {}
    return {
        "five_hour": usage_number(five_hour.get("utilization")),
        "five_hour_resets_at": five_hour.get("resets_at"),
        "seven_day": usage_number(seven_day.get("utilization")),
        "seven_day_resets_at": seven_day.get("resets_at"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def usage_number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def projected(entry: dict | None) -> dict | None:
    if not isinstance(entry, dict) or not entry:
        return None
    now = datetime.now(timezone.utc)
    result = dict(entry)
    for usage_key, reset_key in (
        ("five_hour", "five_hour_resets_at"),
        ("seven_day", "seven_day_resets_at"),
    ):
        result[usage_key] = usage_number(entry.get(usage_key))
        reset = entry.get(reset_key)
        if not reset or result[usage_key] is None:
            continue
        try:
            if datetime.fromisoformat(reset) <= now:
                result[usage_key] = 0.0
                result[reset_key] = None
        except (TypeError, ValueError):
            pass
    return result


def refresh_fingerprint(refresh_token: str | None) -> str:
    return hashlib.sha256((refresh_token or "").encode()).hexdigest()[:16]


def refresh_is_backed_off(state: dict) -> bool:
    failures = read_json(REFRESH_FAILURES)
    if not isinstance(failures, dict):
        failures = {}
    row = failures.get(state["name"]) or {}
    if not isinstance(row, dict):
        return False
    try:
        retry_after = float(row.get("retry_after") or 0)
    except (TypeError, ValueError):
        retry_after = 0
    return bool(
        row.get("fingerprint") == refresh_fingerprint(state.get("refresh_token"))
        and retry_after > time.time()
    )


def record_refresh_failure(state: dict, *, permanent: bool) -> None:
    failures = read_json(REFRESH_FAILURES)
    if not isinstance(failures, dict):
        failures = {}
    failures[state["name"]] = {
        "fingerprint": refresh_fingerprint(state.get("refresh_token")),
        "retry_after": time.time() + (3600 if permanent else 60),
    }
    atomic_write(REFRESH_FAILURES, failures)


def clear_refresh_failure(name: str) -> None:
    failures = read_json(REFRESH_FAILURES)
    if not isinstance(failures, dict):
        failures = {}
    if name in failures:
        del failures[name]
        atomic_write(REFRESH_FAILURES, failures)


def claude_process_ids() -> list[int] | None:
    """Return only direct Claude owners, excluding inherited MCP descendants."""

    try:
        result = subprocess.run(
            ["/bin/ps", "-axo", "pid=,comm="],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None

    pids = []
    for row in result.stdout.splitlines():
        stripped = row.strip()
        if not stripped:
            continue
        pid, separator, executable = stripped.partition(" ")
        if (
            separator
            and pid.isdigit()
            and Path(executable.strip()).name in {"claude", "claude-router-target"}
        ):
            pids.append(int(pid))
    return pids


def profile_has_live_process(name: str) -> bool:
    pids = claude_process_ids()
    if pids is None:
        return True
    marker = re.compile(
        rf"(?:^|\s)CLAUDE_CONFIG_DIR={re.escape(str(PROFILE_ROOT / name))}(?=\s|$)"
    )
    for pid in pids:
        try:
            result = subprocess.run(
                ["/bin/ps", "eww", "-p", str(pid), "-o", "command="],
                capture_output=True,
                text=True,
                check=False,
                timeout=5,
            )
        except (OSError, subprocess.TimeoutExpired):
            return True
        if result.returncode != 0:
            return True
        if marker.search(result.stdout):
            return True
    return False


def refresh_binary() -> Path | None:
    configured = os.environ.get("CLAUDE_ACCOUNT_REFRESH_BIN")
    if configured:
        candidate = Path(configured)
        try:
            if (
                candidate.is_file()
                and os.access(candidate, os.X_OK)
                and candidate.resolve().name != "conductor-claude"
            ):
                return candidate
        except OSError:
            pass
        return None
    candidates = []
    app_support = Path(
        os.environ.get(
            "CONDUCTOR_APP_SUPPORT",
            Path.home() / "Library/Application Support/com.conductor.app",
        )
    )
    conductor_bin = Path(os.environ.get("CONDUCTOR_BIN_DIR", app_support / "bin"))
    agent_root = Path(
        os.environ.get(
            "CONDUCTOR_CLAUDE_AGENT_ROOT", app_support / "agent-binaries/claude"
        )
    )
    versioned = []
    for path in agent_root.glob("*/claude"):
        try:
            versioned.append((path.stat().st_mtime, path))
        except OSError:
            continue
    candidates.extend(
        path for _, path in sorted(versioned, key=lambda item: item[0], reverse=True)
    )
    candidates.append(conductor_bin / "claude-router-target")
    candidates.append(Path("/opt/homebrew/bin/claude"))
    for candidate in candidates:
        try:
            if candidate.is_file() and os.access(candidate, os.X_OK):
                if candidate.resolve().name != "conductor-claude":
                    return candidate
        except OSError:
            continue
    return None


def _ensure_fresh_credentials(name: str) -> dict | None:
    state = token_state(name)
    if state["access_usable"]:
        return state
    if not state["refreshable"] or refresh_is_backed_off(state):
        return None
    # Refresh tokens rotate on use. A live Claude process is the sole owner of
    # its profile and must be allowed to perform its own ordinary refresh.
    if profile_has_live_process(name):
        return None
    binary = refresh_binary()
    if binary is None:
        record_refresh_failure(state, permanent=False)
        return None

    env = os.environ.copy()
    for variable in (
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
    ):
        env.pop(variable, None)
    env.update(
        {
            "CLAUDE_CONFIG_DIR": str(PROFILE_ROOT / name),
            "CLAUDE_CODE_OAUTH_REFRESH_TOKEN": state["refresh_token"],
            "CLAUDE_CODE_OAUTH_SCOPES": " ".join(state["scopes"]),
        }
    )
    output = ""
    try:
        result = subprocess.run(
            [str(binary), "auth", "login", "--claudeai"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}".lower()
    except (OSError, subprocess.TimeoutExpired):
        record_refresh_failure(state, permanent=False)
        return None

    refreshed = token_state(name)
    if result.returncode == 0 and refreshed["access_usable"]:
        clear_refresh_failure(name)
        return refreshed

    permanent = bool(
        re.search(r"(?:status(?: code)?\s*(?:400|401)|invalid[_ -]grant|revoked)", output)
    )
    record_refresh_failure(state, permanent=permanent)
    return None


def ensure_fresh_credentials(name: str) -> dict | None:
    # Refresh tokens rotate. Serialize only the ownership check and official
    # refresh transaction; ordinary usage reads and status calls stay parallel.
    with router_lock():
        if active_quarantine(name) is not None:
            return None
        return _ensure_fresh_credentials(name)


def unreadable_quarantine(reason: str) -> dict:
    return {
        "until": time.time() + 3600,
        "reason": reason,
        "invalid": True,
    }


def quarantine_entries() -> dict | None:
    try:
        entries = json.loads(QUARANTINE.read_text())
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError):
        return None
    return entries if isinstance(entries, dict) else None


def active_quarantine(name: str) -> dict | None:
    entries = quarantine_entries()
    if entries is None:
        return unreadable_quarantine("quarantine state unreadable")
    if name not in entries:
        return None
    row = entries[name]
    if not isinstance(row, dict):
        return unreadable_quarantine("account quarantine state unreadable")
    try:
        until = float(row.get("until") or 0)
    except (TypeError, ValueError):
        return unreadable_quarantine("account quarantine state unreadable")
    if not math.isfinite(until) or until <= 0:
        return unreadable_quarantine("account quarantine state unreadable")
    return row if until > time.time() else None


def collect_rows() -> tuple[list[dict], dict]:
    cache = read_json(CACHE)
    if not isinstance(cache, dict):
        cache = {}
    states = [token_state(name) for name in account_names()]
    live: dict[str, dict] = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, len(states) or 1)) as pool:
        futures = {
            pool.submit(read_usage, state["access_token"]): state["name"]
            for state in states
            if state["access_usable"] and state["access_token"]
        }
        for future in concurrent.futures.as_completed(futures):
            reading = future.result()
            if reading:
                name = futures[future]
                live[name] = normalized(reading)
                cache[name] = live[name]

    atomic_write(CACHE, cache)
    try:
        selected = SELECTED.read_text().strip()
    except OSError:
        selected = ""

    rows = []
    for state in states:
        name = state["name"]
        entry = live.get(name) or projected(cache.get(name))
        selectable = state["access_usable"] or state["refreshable"]
        quarantine = active_quarantine(name)
        rows.append(
            {
                "name": name,
                "selected": name == selected,
                "authenticated": selectable,
                "access_usable": state["access_usable"],
                "refreshable": state["refreshable"],
                "quarantined": bool(quarantine),
                "quarantine": quarantine,
                "usage": entry,
                "cached": name not in live,
            }
        )
    return rows, cache


def best_account(rows: list[dict], cache: dict) -> str | None:
    healthy: list[tuple[float, float, str]] = []
    unknown: list[str] = []
    for row in rows:
        if not row["authenticated"] or row.get("quarantined"):
            continue

        cached_entry = projected(row.get("usage"))
        cached_five = (cached_entry or {}).get("five_hour")
        cached_seven = (cached_entry or {}).get("seven_day") or 0
        # A known-draining account cannot win, so do not rotate its refresh
        # token merely to confirm the same result.
        if cached_five is not None and (
            cached_five >= FIVE_HOUR_DRAIN or cached_seven >= SEVEN_DAY_DRAIN
        ):
            continue

        state = ensure_fresh_credentials(row["name"])
        if state is None:
            continue
        entry = cached_entry
        if not row["access_usable"]:
            reading = read_usage(state["access_token"])
            if reading:
                entry = normalized(reading)
                cache[row["name"]] = entry
        entry = projected(entry)
        five_hour = (entry or {}).get("five_hour")
        seven_day = (entry or {}).get("seven_day") or 0
        if five_hour is None:
            unknown.append(row["name"])
        elif five_hour < FIVE_HOUR_DRAIN and seven_day < SEVEN_DAY_DRAIN:
            healthy.append((five_hour, seven_day, row["name"]))
    atomic_write(CACHE, cache)
    ordered = [name for _, _, name in sorted(healthy)] + sorted(unknown)
    # Recheck under the same lock used by the watcher. A hard-limit event may
    # arrive while usage and refresh checks are in flight.
    with router_lock():
        for name in ordered:
            if active_quarantine(name) is None:
                return name
    return None


def format_reset(value: str | None) -> str:
    if not value:
        return "-"
    try:
        minutes = int(
            (datetime.fromisoformat(value) - datetime.now(timezone.utc)).total_seconds()
            // 60
        )
        if minutes <= 0:
            return "now"
        days, minutes = divmod(minutes, 1440)
        hours, minutes = divmod(minutes, 60)
        if days:
            return f"in {days}d {hours}h" if hours else f"in {days}d"
        if hours:
            return f"in {hours}h {minutes}m" if minutes else f"in {hours}h"
        return f"in {minutes}m"
    except (TypeError, ValueError):
        return "?"


def format_age(value: str | None) -> str:
    if not value:
        return ""
    try:
        minutes = int(
            (datetime.now(timezone.utc) - datetime.fromisoformat(value)).total_seconds()
            // 60
        )
        if minutes < 60:
            return f"{minutes}m"
        if minutes < 1440:
            return f"{minutes // 60}h"
        return f"{minutes // 1440}d"
    except (TypeError, ValueError):
        return ""


def run() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--state":
        if not VALID_ACCOUNT.fullmatch(sys.argv[2]):
            return 2
        if active_quarantine(sys.argv[2]) is not None:
            print("quarantined")
            return 1
        state = token_state(sys.argv[2])
        if state["access_usable"]:
            print("ready")
            return 0
        if state["refreshable"]:
            print("refreshable")
            return 0
        print("login-required")
        return 1

    if len(sys.argv) == 3 and sys.argv[1] == "--ensure":
        if not VALID_ACCOUNT.fullmatch(sys.argv[2]):
            return 2
        return 0 if ensure_fresh_credentials(sys.argv[2]) else 1

    rows, cache = collect_rows()
    if "--json" in sys.argv:
        print(json.dumps({"accounts": rows}))
        return 0
    if "--best" in sys.argv:
        account = best_account(rows, cache)
        if not account:
            return 1
        print(account)
        return 0

    print(f"{'':2}{'account':<24}{'5h used':>8}  {'resets':<11}{'7d used':>8}  {'resets':<11}")
    for row in rows:
        marker = "*" if row["selected"] else " "
        entry = row["usage"] or {}
        five_hour = entry.get("five_hour")
        seven_day = entry.get("seven_day")
        if row.get("quarantined"):
            until = datetime.fromtimestamp(
                float(row["quarantine"]["until"]), timezone.utc
            ).isoformat()
            print(
                f"{marker:2}{row['name']:<24}{'—':>8}  "
                f"cooldown {format_reset(until)}"
            )
            continue
        if not row["authenticated"]:
            print(f"{marker:2}{row['name']:<24}{'—':>8}  login required")
            continue
        if five_hour is None:
            state = "refreshes on next launch" if not row["access_usable"] else "no usage data"
            print(f"{marker:2}{row['name']:<24}{'—':>8}  {state}")
            continue
        age = format_age(entry.get("checked_at"))
        cached = f" ~{age} old" if row["cached"] and age else ""
        refresh = " · refreshes on next launch" if not row["access_usable"] else ""
        print(
            f"{marker:2}{row['name']:<24}{five_hour:>7.0f}%  "
            f"{format_reset(entry.get('five_hour_resets_at')):<11}"
            f"{(seven_day or 0):>7.0f}%  "
            f"{format_reset(entry.get('seven_day_resets_at')):<11}{cached}{refresh}"
        )
    return 0


def main() -> int:
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
