# Claude Switcher for Conductor

This router keeps Claude subscription credentials in persistent account
profiles and makes Conductor automatically resolve the authenticated profile
with the most five-hour headroom whenever a Claude process starts. It avoids
rewriting the shared macOS Keychain while other Claude chats are running.

The user-facing command is `claude-switcher`.
The installer links it into `~/.local/bin` so it is discoverable on the normal
shell PATH.

## Why this fixes the restart problem

The legacy swapper replaced the global Keychain item and
`~/.claude/.credentials.json`. Already-running Claude processes retained the
old OAuth token and could later rotate or overwrite the global credential.
Quitting Conductor happened to stop all of those processes, but also disrupted
unrelated Codex chats.

The router sets `CLAUDE_CONFIG_DIR` per Claude process. On macOS, Claude Code
derives a separate Keychain service from that profile path (for example,
`Claude Code-credentials-<profile hash>`). A running chat therefore stays on
the profile it started with. Selecting another account affects only Claude
processes started or restarted afterward.

OAuth credentials cannot be injected into an already-running process. After a
selection, restart the one affected Claude chat. Do not quit Conductor and do
not stop other Claude or Codex chats.

## Install

```bash
./tools/claude-account-router/install.sh
```

Then set this user-wide Conductor setting:

```toml
claude_code_executable_path = "/Users/YOU/.claude/bin/conductor-claude"
```

The setting belongs in `~/.conductor/settings.toml`. Restart an affected chat
after changing the executable path.

The installer:

- backs up the previous scripts under `~/.claude-account-router-backups`;
- preserves one credential file per account under `~/.claude-profiles`;
- merges and shares Claude's `projects` transcript directory so a Conductor
  session can resume after selecting another account;
- leaves the macOS Keychain untouched.
- routes Conductor's live bundled `bin/claude` symlink through the selector, so
  the change takes effect without restarting Conductor;
- installs a small launchd watcher that stops only a Claude child whose own
  transcript just recorded a new subscription-limit error.

## Use

```bash
claude-switcher status
claude-switcher help
claude-switcher accounts
claude-switcher switch

# Legacy low-level commands:
claude-acct list
claude-acct usage
claude-acct use hello@ovo
claude-acct best
claude-acct next
```

Manual selection remains available for diagnostics and applies to exactly the
next Conductor Claude launch. After that one launch, Conductor queries
subscription usage and again chooses the best non-draining account
automatically. This changes only the isolated Claude login profile; it does not
change Conductor's selected agent, model, workspace, or existing chats.

An expired access token no longer makes an otherwise authenticated profile
disappear. At the launch boundary, the router delegates refresh to Conductor's
official Claude binary, verifies that the rotated credential was persisted,
then ranks the account using refreshed usage. It never calls the OAuth token
endpoint directly, never kills a refresh transaction on a timer, and refuses
to refresh a profile currently owned by a direct Claude process.

By default, Claude Switcher marks an account as draining at 90% of its
five-hour allocation or 95% of its seven-day allocation. It waits for each
chat to finish its active turn, stops only the idle Claude child using that
account, and lets the next message resume on the healthiest account.

When a running chat hits a limit, the watcher stops only that capped Claude
process and quarantines that login for six hours, preventing stale cached usage
from immediately selecting it again. Conductor's next retry or message starts
the same session through the best available account. Other Claude and Codex
chats remain running. If every login is draining, quarantined, or unable to
refresh safely, the launcher fails closed with a clear error instead of
silently relaunching the last capped account.

If a profile says `login required`:

```bash
claude-acct login ACCOUNT
```

Keychain logout tombstones and Keychain access errors are authoritative: the
router never revives a stale on-disk token behind them. A genuinely new profile
can be created with the same `claude-acct login ACCOUNT` recovery command.

`claude-acct global-use` exists only for legacy terminal workflows. It refuses
to rewrite the shared Keychain while any Claude process is running.

## Test

```bash
./tools/claude-account-router/test/test-router.sh
```
