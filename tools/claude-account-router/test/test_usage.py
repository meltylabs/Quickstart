#!/usr/bin/env python3

import importlib.util
import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    "claude_acct_usage", Path(__file__).parents[1] / "bin/claude-acct-usage.py"
)
usage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(usage)


class UsageRouterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        usage.STORE = root / "accounts"
        usage.PROFILE_ROOT = root / "profiles"
        usage.SELECTED = usage.STORE / ".conductor-active"
        usage.CACHE = usage.STORE / ".usage-cache.json"
        usage.REFRESH_FAILURES = usage.STORE / ".refresh-failures.json"
        usage.QUARANTINE = usage.STORE / ".quarantined-accounts.json"
        usage.ROUTER_LOCK = usage.STORE / ".router.lock"
        usage.STORE.mkdir(mode=0o700)
        usage.PROFILE_ROOT.mkdir(mode=0o700)

    @staticmethod
    def expired(name="beta"):
        return {
            "name": name,
            "access_token": "expired-access",
            "access_usable": False,
            "refresh_token": f"sk-ant-ort-{name}",
            "refreshable": True,
            "scopes": ["user:profile", "user:inference"],
        }

    @staticmethod
    def fresh(name="beta"):
        state = UsageRouterTests.expired(name)
        state.update(access_token="fresh-access", access_usable=True)
        return state

    def test_expired_access_with_refresh_credentials_is_selectable(self):
        blob = {
            "claudeAiOauth": {
                "accessToken": "expired",
                "refreshToken": "sk-ant-ort-beta",
                "expiresAt": 1,
                "scopes": ["user:profile"],
            }
        }
        with mock.patch.object(usage, "credentials", return_value=blob):
            state = usage.token_state("beta")
        self.assertFalse(state["access_usable"])
        self.assertTrue(state["refreshable"])

        with mock.patch.object(
            usage,
            "credentials",
            return_value={
                "claudeAiOauth": {
                    "accessToken": ["not-a-token"],
                    "refreshToken": "sk-ant-ort-broken",
                    "expiresAt": "Infinity",
                    "scopes": ["user:profile"],
                }
            },
        ):
            state = usage.token_state("broken-token")
        self.assertFalse(state["access_usable"])

    def test_official_cli_refresh_is_noninteractive_and_verified(self):
        with (
            mock.patch.object(usage, "token_state", side_effect=[self.expired(), self.fresh()]),
            mock.patch.object(usage, "refresh_is_backed_off", return_value=False),
            mock.patch.object(usage, "profile_has_live_process", return_value=False),
            mock.patch.object(usage, "refresh_binary", return_value=Path("/fake/claude")),
            mock.patch.object(usage, "clear_refresh_failure") as clear_failure,
            mock.patch.object(usage.subprocess, "run", return_value=SimpleNamespace(
                returncode=0, stdout="logged in", stderr=""
            )) as run,
        ):
            state = usage.ensure_fresh_credentials("beta")
        self.assertTrue(state["access_usable"])
        command = run.call_args.args[0]
        self.assertEqual(command, ["/fake/claude", "auth", "login", "--claudeai"])
        self.assertIs(run.call_args.kwargs["stdin"], usage.subprocess.DEVNULL)
        env = run.call_args.kwargs["env"]
        self.assertEqual(env["CLAUDE_CONFIG_DIR"], str(usage.PROFILE_ROOT / "beta"))
        self.assertEqual(env["CLAUDE_CODE_OAUTH_REFRESH_TOKEN"], "sk-ant-ort-beta")
        self.assertEqual(env["CLAUDE_CODE_OAUTH_SCOPES"], "user:profile user:inference")
        self.assertNotIn("timeout", run.call_args.kwargs)
        clear_failure.assert_called_once_with("beta")

    def test_live_profile_owner_blocks_external_refresh(self):
        with (
            mock.patch.object(usage, "token_state", return_value=self.expired()),
            mock.patch.object(usage, "refresh_is_backed_off", return_value=False),
            mock.patch.object(usage, "profile_has_live_process", return_value=True),
            mock.patch.object(usage, "refresh_binary") as refresh_binary,
        ):
            self.assertIsNone(usage.ensure_fresh_credentials("beta"))
        refresh_binary.assert_not_called()

    def test_success_exit_without_persisted_token_is_rejected(self):
        with (
            mock.patch.object(usage, "token_state", return_value=self.expired()),
            mock.patch.object(usage, "refresh_is_backed_off", return_value=False),
            mock.patch.object(usage, "profile_has_live_process", return_value=False),
            mock.patch.object(usage, "refresh_binary", return_value=Path("/fake/claude")),
            mock.patch.object(usage, "record_refresh_failure") as failure,
            mock.patch.object(usage.subprocess, "run", return_value=SimpleNamespace(
                returncode=0, stdout="logged in", stderr=""
            )),
        ):
            self.assertIsNone(usage.ensure_fresh_credentials("beta"))
        failure.assert_called_once_with(mock.ANY, permanent=False)

    def test_expired_low_usage_account_wins_over_capped_current_account(self):
        rows = [
            {
                "name": "alpha",
                "authenticated": True,
                "access_usable": True,
                "usage": {"five_hour": 100.0, "seven_day": 96.0},
            },
            {
                "name": "beta",
                "authenticated": True,
                "access_usable": False,
                "usage": {"five_hour": 3.0, "seven_day": 1.0},
            },
        ]
        with (
            mock.patch.object(usage, "ensure_fresh_credentials", return_value=self.fresh()),
            mock.patch.object(usage, "read_usage", return_value={
                "five_hour": {"utilization": 4.0},
                "seven_day": {"utilization": 1.0},
            }),
        ):
            self.assertEqual(usage.best_account(rows, {}), "beta")

    def test_refreshed_usage_is_ranked_against_every_live_candidate(self):
        rows = [
            {
                "name": "beta",
                "authenticated": True,
                "access_usable": False,
                "usage": {"five_hour": 3.0, "seven_day": 1.0},
            },
            {
                "name": "gamma",
                "authenticated": True,
                "access_usable": True,
                "usage": {"five_hour": 4.0, "seven_day": 1.0},
            },
        ]

        def fresh_state(name):
            return self.fresh(name)

        with (
            mock.patch.object(usage, "ensure_fresh_credentials", side_effect=fresh_state),
            mock.patch.object(
                usage,
                "read_usage",
                return_value={
                    "five_hour": {"utilization": 80.0},
                    "seven_day": {"utilization": 1.0},
                },
            ),
        ):
            self.assertEqual(usage.best_account(rows, {}), "gamma")

    def test_capped_or_quarantined_accounts_never_fall_back(self):
        rows = [
            {
                "name": "capped",
                "authenticated": True,
                "access_usable": True,
                "usage": {"five_hour": 100.0, "seven_day": 96.0},
            },
            {
                "name": "quarantined",
                "authenticated": True,
                "access_usable": True,
                "quarantined": True,
                "usage": {"five_hour": 1.0, "seven_day": 1.0},
            },
        ]
        with mock.patch.object(usage, "ensure_fresh_credentials") as ensure:
            self.assertIsNone(usage.best_account(rows, {}))
        ensure.assert_not_called()

    def test_refresh_failure_does_not_return_capped_current_account(self):
        rows = [
            {
                "name": "capped",
                "authenticated": True,
                "access_usable": True,
                "usage": {"five_hour": 100.0, "seven_day": 96.0},
            },
            {
                "name": "alternate",
                "authenticated": True,
                "access_usable": False,
                "usage": {"five_hour": 4.0, "seven_day": 1.0},
            },
        ]
        with mock.patch.object(usage, "ensure_fresh_credentials", return_value=None):
            self.assertIsNone(usage.best_account(rows, {}))

    def test_only_direct_claude_process_owns_profile_refresh(self):
        inherited_child = SimpleNamespace(
            returncode=0,
            stdout=" 202 /usr/bin/node\n 303 /usr/bin/python3\n",
        )
        with mock.patch.object(usage.subprocess, "run", return_value=inherited_child):
            self.assertFalse(usage.profile_has_live_process("beta"))

        process_list = SimpleNamespace(
            returncode=0,
            stdout=(
                " 101 /Users/test/.local/bin/claude\n"
                " 202 /usr/bin/node\n"
            ),
        )
        process_env = SimpleNamespace(
            returncode=0,
            stdout=(
                "/tmp/agent-binaries/claude/2.1.201/claude --resume id "
                f"CLAUDE_CONFIG_DIR={usage.PROFILE_ROOT / 'beta'}"
            ),
        )
        with mock.patch.object(
            usage.subprocess, "run", side_effect=[process_list, process_env]
        ):
            self.assertTrue(usage.profile_has_live_process("beta"))

        unreadable_env = SimpleNamespace(returncode=1, stdout="")
        with mock.patch.object(
            usage.subprocess, "run", side_effect=[process_list, unreadable_env]
        ):
            self.assertTrue(usage.profile_has_live_process("beta"))

    def test_malformed_profile_and_cache_are_isolated(self):
        with mock.patch.object(usage, "credentials", return_value="invalid"):
            state = usage.token_state("broken-top-level")
        self.assertFalse(state["access_usable"])
        self.assertFalse(state["refreshable"])

        with mock.patch.object(
            usage, "credentials", return_value={"claudeAiOauth": ["invalid"]}
        ):
            state = usage.token_state("broken-oauth")
        self.assertFalse(state["access_usable"])
        self.assertFalse(state["refreshable"])

        with mock.patch.object(
            usage,
            "credentials",
            return_value={
                "claudeAiOauth": {
                    "accessToken": "token",
                    "refreshToken": "sk-ant-ort-broken",
                    "expiresAt": "not-a-number",
                    "scopes": ["user:profile"],
                }
            },
        ):
            state = usage.token_state("broken-expiry")
        self.assertFalse(state["access_usable"])
        self.assertTrue(state["refreshable"])

        usage.CACHE.write_text("[]")
        with mock.patch.object(usage, "account_names", return_value=[]):
            rows, cache = usage.collect_rows()
        self.assertEqual(rows, [])
        self.assertEqual(cache, {})

        rows = [
            {
                "name": "bad-usage",
                "authenticated": True,
                "access_usable": True,
                "usage": {"five_hour": "not-a-number", "seven_day": float("nan")},
            }
        ]
        with mock.patch.object(
            usage, "ensure_fresh_credentials", return_value=self.fresh("bad-usage")
        ):
            self.assertEqual(usage.best_account(rows, {}), "bad-usage")

        usage.STORE.joinpath("bad name.json").write_text("{}")
        usage.STORE.joinpath("--help.json").write_text("{}")
        usage.STORE.joinpath("valid-name.json").write_text("{}")
        usage.PROFILE_ROOT.joinpath(".locks").mkdir()
        self.assertNotIn("bad name", usage.account_names())
        self.assertNotIn("--help", usage.account_names())
        self.assertNotIn(".locks", usage.account_names())
        self.assertIn("valid-name", usage.account_names())

    def test_malformed_quarantine_fails_closed_at_final_selection(self):
        usage.QUARANTINE.write_text("not-json")
        rows = [
            {
                "name": "healthy",
                "authenticated": True,
                "access_usable": True,
                "usage": {"five_hour": 1.0, "seven_day": 1.0},
            }
        ]
        with mock.patch.object(
            usage, "ensure_fresh_credentials", return_value=self.fresh("healthy")
        ):
            self.assertIsNone(usage.best_account(rows, {}))
        usage.QUARANTINE.write_text(json.dumps({"healthy": {}}))
        with mock.patch.object(
            usage, "ensure_fresh_credentials", return_value=self.fresh("healthy")
        ):
            self.assertIsNone(usage.best_account(rows, {}))

    def test_invalid_explicit_refresh_binary_fails_closed(self):
        with mock.patch.dict(
            os.environ,
            {"CLAUDE_ACCOUNT_REFRESH_BIN": "/definitely/missing/claude"},
            clear=False,
        ):
            self.assertIsNone(usage.refresh_binary())

    def test_refresh_discovery_prefers_current_versioned_conductor_binary(self):
        root = Path(self.temp.name)
        conductor_bin = root / "conductor-bin"
        agent_root = root / "agents"
        current = agent_root / "2.1.999" / "claude"
        saved = conductor_bin / "claude-router-target"
        current.parent.mkdir(parents=True)
        conductor_bin.mkdir()
        current.write_text("#!/bin/bash\n")
        saved.write_text("#!/bin/bash\n")
        current.chmod(0o700)
        saved.chmod(0o700)
        with mock.patch.dict(
            os.environ,
            {
                "CONDUCTOR_BIN_DIR": str(conductor_bin),
                "CONDUCTOR_CLAUDE_AGENT_ROOT": str(agent_root),
            },
            clear=False,
        ):
            os.environ.pop("CLAUDE_ACCOUNT_REFRESH_BIN", None)
            self.assertEqual(usage.refresh_binary(), current)

    def test_keychain_errors_other_than_not_found_fail_closed(self):
        denied = subprocess.CalledProcessError(36, ["security"])
        with (
            mock.patch.object(usage.subprocess, "run", side_effect=denied),
            mock.patch.object(usage, "read_json") as read_json,
        ):
            self.assertIsNone(usage.credentials("beta"))
        read_json.assert_not_called()

    def test_fake_official_cli_persists_rotated_credentials(self):
        root = Path(self.temp.name)
        profile = usage.PROFILE_ROOT / "beta"
        profile.mkdir()
        profile.joinpath(".credentials.json").write_text(
            json.dumps(
                {
                    "claudeAiOauth": {
                        "accessToken": "expired",
                        "refreshToken": "sk-ant-ort-beta",
                        "expiresAt": 1,
                        "scopes": ["user:profile", "user:inference"],
                    }
                }
            )
        )
        fake_security = root / "security"
        fake_security.write_text("#!/bin/bash\nexit 44\n")
        fake_security.chmod(0o700)
        capture = root / "refresh-capture.json"
        fake_claude = root / "claude"
        fake_claude.write_text(
            """#!/usr/bin/env python3
import json
import os
import sys
import time
from pathlib import Path

Path(os.environ["CAPTURE_FILE"]).write_text(json.dumps({
    "argv": sys.argv[1:],
    "api_key_present": "ANTHROPIC_API_KEY" in os.environ,
    "refresh": os.environ.get("CLAUDE_CODE_OAUTH_REFRESH_TOKEN"),
    "scopes": os.environ.get("CLAUDE_CODE_OAUTH_SCOPES"),
}))
Path(os.environ["CLAUDE_CONFIG_DIR"], ".credentials.json").write_text(json.dumps({
    "claudeAiOauth": {
        "accessToken": "fresh-access",
        "refreshToken": "sk-ant-ort-rotated",
        "expiresAt": int((time.time() + 3600) * 1000),
        "scopes": ["user:profile", "user:inference"],
    }
}))
"""
        )
        fake_claude.chmod(0o700)
        env = {
            "PATH": f"{root}:{os.environ['PATH']}",
            "CAPTURE_FILE": str(capture),
            "ANTHROPIC_API_KEY": "must-be-scrubbed",
        }
        with (
            mock.patch.dict(os.environ, env, clear=False),
            mock.patch.object(usage, "profile_has_live_process", return_value=False),
            mock.patch.object(usage, "refresh_binary", return_value=fake_claude),
        ):
            state = usage.ensure_fresh_credentials("beta")
        self.assertTrue(state["access_usable"])
        captured = json.loads(capture.read_text())
        self.assertEqual(captured["argv"], ["auth", "login", "--claudeai"])
        self.assertFalse(captured["api_key_present"])
        self.assertEqual(captured["refresh"], "sk-ant-ort-beta")
        self.assertEqual(captured["scopes"], "user:profile user:inference")

    def test_keychain_logout_tombstone_does_not_revive_stale_file(self):
        result = SimpleNamespace(returncode=0, stdout="{}")
        with (
            mock.patch.object(usage.subprocess, "run", return_value=result),
            mock.patch.object(usage, "read_json") as read_json,
        ):
            self.assertEqual(usage.credentials("beta"), {})
        read_json.assert_not_called()

        profile = usage.PROFILE_ROOT / "beta"
        profile.mkdir()
        profile.joinpath(".credentials.json").write_text("{}")
        usage.STORE.joinpath("beta.json").write_text(
            json.dumps({"claudeAiOauth": {"refreshToken": "sk-ant-ort-stale"}})
        )
        missing = subprocess.CalledProcessError(44, ["security"])
        with mock.patch.object(usage.subprocess, "run", side_effect=missing):
            self.assertEqual(usage.credentials("beta"), {})


if __name__ == "__main__":
    unittest.main()
