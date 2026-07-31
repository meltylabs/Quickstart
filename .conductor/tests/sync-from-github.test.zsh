#!/bin/zsh

set -euo pipefail
export GIT_AUTOPUSH=0

script_dir="${0:A:h}"
repo_root="${script_dir:h:h}"
tracked_sync_script="$repo_root/.conductor/scripts/sync-from-github.zsh"
real_git="$(command -v git)"
real_path="$PATH"
task_tmp="$(mktemp -d)"
trap 'rm -rf "$task_tmp"' EXIT

sync_script="$task_tmp/sync-from-github.zsh"
fake_identity="$task_tmp/conductor-repo-identity.zsh"
fake_bin="$task_tmp/bin"
git_log="$task_tmp/git.log"
hooks_dir="$task_tmp/empty-hooks"
canonical_url="https://github.com/example/repo.git"
canonical_slug="example/repo"
canonical_repo_id="R_test_example_repo"
bare_repo="$task_tmp/canonical.git"
seed_repo="$task_tmp/seed"

mkdir -p "$fake_bin" "$hooks_dir"
cp "$tracked_sync_script" "$sync_script"
chmod 700 "$sync_script"
: >"$git_log"

fail() {
  print -u2 "FAIL: $1"
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] ||
    fail "expected output to contain: $needle"
}

{
  print '#!/bin/zsh'
  print 'set -euo pipefail'
  print '[[ -z "${SYNC_GIT_LOG:-}" ]] || print -r -- "$*" >>"$SYNC_GIT_LOG"'
  print 'exec "${SYNC_REAL_GIT:?}" "$@"'
} >"$fake_bin/git"
chmod 700 "$fake_bin/git"

{
  print '#!/bin/zsh'
  print 'set -euo pipefail'
  print 'root="$(git rev-parse --show-toplevel)"'
  print 'common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"'
  print 'identity_call=1'
  print 'if [[ -n "${FAKE_SYNC_IDENTITY_CALL_FILE:-}" ]]; then'
  print '  previous_call="$(cat "$FAKE_SYNC_IDENTITY_CALL_FILE" 2>/dev/null || print 0)"'
  print '  identity_call=$((previous_call + 1))'
  print '  print -r -- "$identity_call" >"$FAKE_SYNC_IDENTITY_CALL_FILE"'
  print 'fi'
  print 'if [[ -n "${FAKE_SYNC_IDENTITY_FAIL_ON_CALL:-}" &&'
  print '  "$identity_call" == "$FAKE_SYNC_IDENTITY_FAIL_ON_CALL"'
  print ']]; then'
  print '  jq -nc '"'"'{ok:false,error:"binding_mismatch",message:"The live immutable identity changed during fetch."}'"'"''
  print '  exit 3'
  print 'fi'
  print 'case "${FAKE_SYNC_IDENTITY_MODE:-verified}" in'
  print '  unbound)'
  print '    jq -nc '"'"'{ok:false,error:"unbound_repository",message:"This worktree has no explicit publish target."}'"'"''
  print '    exit 3'
  print '    ;;'
  print '  stale)'
  print '    jq -nc '"'"'{ok:false,error:"stale_worktree_binding",message:"This worktree inherited another worktree binding."}'"'"''
  print '    exit 3'
  print '    ;;'
  print '  failure)'
  print '    jq -nc '"'"'{ok:false,error:"binding_mismatch",message:"The immutable worktree binding changed."}'"'"''
  print '    exit 3'
  print '    ;;'
  print 'esac'
  print 'jq -cn \'
  print '  --arg root "$root" \'
  print '  --arg git_dir "$(git rev-parse --path-format=absolute --git-dir)" \'
  print '  --arg common_dir "$common_dir" '"'"'{
    ok: true,
    verification: "full",
    binding: "verified",
    root: $root,
    git_dir: $git_dir,
    common_dir: $common_dir,
    fetch_url: "https://github.com/example/repo.git",
    push_url: "https://github.com/example/repo.git",
    canonical_url: "https://github.com/example/repo.git",
    slug: "example/repo",
    repo_id: "R_test_example_repo",
    remote: "origin",
    bound_remote: "origin",
    default_branch: "main",
    bound_default_branch: "main",
    bound_git_dir: $git_dir,
    bound_slug: "example/repo",
    bound_repo_id: "R_test_example_repo"
  }'"'"
} >"$fake_identity"
chmod 700 "$fake_identity"

configure_repo() {
  local directory="$1"

  "$real_git" -C "$directory" config user.name "Conductor Sync Test"
  "$real_git" -C "$directory" config user.email "conductor-sync@example.com"
  "$real_git" -C "$directory" config core.hooksPath "$hooks_dir"
  "$real_git" -C "$directory" config \
    "url.file://$bare_repo.insteadOf" \
    "$canonical_url"
}

clone_at_base() {
  local name="$1"
  local directory="$task_tmp/$name"

  "$real_git" clone -q "$bare_repo" "$directory"
  configure_repo "$directory"
  print -r -- "${directory:A}"
}

run_sync() {
  local workspace="$1"
  local mode="${2:-verified}"
  local root_path="${3:-}"
  local fail_on_call="${4:-}"
  local call_file="${5:-}"

  (
    cd "$workspace"
    PATH="$fake_bin:$real_path" \
      SYNC_REAL_GIT="$real_git" \
      SYNC_GIT_LOG="$git_log" \
      FAKE_SYNC_IDENTITY_MODE="$mode" \
      FAKE_SYNC_IDENTITY_FAIL_ON_CALL="$fail_on_call" \
      FAKE_SYNC_IDENTITY_CALL_FILE="$call_file" \
      CONDUCTOR_ROOT_PATH="$root_path" \
      "$sync_script"
  )
}

"$real_git" init --bare -q "$bare_repo"
"$real_git" init -q "$seed_repo"
configure_repo "$seed_repo"
print "base" >"$seed_repo/file.txt"
"$real_git" -C "$seed_repo" add file.txt
"$real_git" -C "$seed_repo" commit -q -m "base"
"$real_git" -C "$seed_repo" branch -M main
"$real_git" -C "$seed_repo" remote add origin "$bare_repo"
"$real_git" -C "$seed_repo" push -q -u origin main
"$real_git" -C "$bare_repo" symbolic-ref HEAD refs/heads/main

unbound_workspace="$(clone_at_base unbound-workspace)"
"$real_git" -C "$unbound_workspace" switch -q -c feature-unbound
: >"$git_log"
unbound_output="$(run_sync "$unbound_workspace" unbound 2>&1)"
assert_contains "$unbound_output" "this new/unbound workspace was left unchanged"
assert_contains "$unbound_output" \
  "conductor-status --bind OWNER/REPOSITORY --remote REMOTE"
if grep -Eq '(^| )fetch( |$)|(^| )merge( |$)' "$git_log"; then
  fail "unbound workspace reached fetch or merge"
fi

: >"$git_log"
stale_output="$(run_sync "$unbound_workspace" stale 2>&1)"
assert_contains "$stale_output" "this new/unbound workspace was left unchanged"
assert_contains "$stale_output" \
  "conductor-status --bind OWNER/REPOSITORY --remote REMOTE"
if grep -Eq '(^| )fetch( |$)|(^| )merge( |$)' "$git_log"; then
  fail "inherited stale binding reached fetch or merge"
fi

: >"$git_log"
failure_output=""
if failure_output="$(run_sync "$unbound_workspace" failure 2>&1)"; then
  fail "identity mismatch unexpectedly synchronized"
fi
assert_contains "$failure_output" "immutable worktree binding changed"
if grep -Eq '(^| )fetch( |$)|(^| )merge( |$)' "$git_log"; then
  fail "identity failure reached fetch or merge"
fi

dirty_workspace="$(clone_at_base dirty-workspace)"
"$real_git" -C "$dirty_workspace" switch -q -c feature-dirty
print "dirty" >>"$dirty_workspace/file.txt"
: >"$git_log"
dirty_output=""
if dirty_output="$(run_sync "$dirty_workspace" verified 2>&1)"; then
  fail "dirty workspace unexpectedly synchronized"
fi
assert_contains "$dirty_output" "workspace has uncommitted work"
if grep -Eq '(^| )fetch( |$)|(^| )merge( |$)' "$git_log"; then
  fail "dirty workspace reached fetch or merge"
fi

divergent_workspace="$(clone_at_base divergent-workspace)"
"$real_git" -C "$divergent_workspace" switch -q -c feature-divergent
print "local" >>"$divergent_workspace/file.txt"
"$real_git" -C "$divergent_workspace" add file.txt
"$real_git" -C "$divergent_workspace" commit -q -m "local divergence"
divergent_before="$("$real_git" -C "$divergent_workspace" rev-parse HEAD)"

sync_workspace="$(clone_at_base sync-workspace)"
"$real_git" -C "$sync_workspace" switch -q -c feature-sync
identity_race_workspace="$(clone_at_base identity-race-workspace)"
"$real_git" -C "$identity_race_workspace" switch -q -c feature-identity-race
identity_race_before="$(
  "$real_git" -C "$identity_race_workspace" rev-parse HEAD
)"
canonical_root="$(clone_at_base canonical-root)"
canonical_root_before="$("$real_git" -C "$canonical_root" rev-parse HEAD)"

print "remote" >>"$seed_repo/file.txt"
"$real_git" -C "$seed_repo" add file.txt
"$real_git" -C "$seed_repo" commit -q -m "remote advance"
"$real_git" -C "$seed_repo" push -q origin main
canonical_head="$("$real_git" -C "$seed_repo" rev-parse HEAD)"

: >"$git_log"
identity_race_calls="$task_tmp/sync-identity-race-calls"
print 0 >"$identity_race_calls"
identity_race_output=""
if identity_race_output="$(
  run_sync \
    "$identity_race_workspace" verified "" 2 "$identity_race_calls" 2>&1
)"; then
  fail "post-fetch immutable identity mismatch unexpectedly moved the workspace"
fi
assert_contains "$identity_race_output" \
  "live immutable repository identity changed during fetch"
assert_contains "$identity_race_output" \
  "workspace was left at $identity_race_before"
[[ "$("$real_git" -C "$identity_race_workspace" rev-parse HEAD)" ==
  "$identity_race_before" ]] ||
  fail "post-fetch immutable identity mismatch moved the workspace"
grep -Fq -- "fetch --no-tags --prune $canonical_url" "$git_log" ||
  fail "post-fetch identity test did not reach the direct verified fetch"
if grep -Eq '(^| )merge( |$)' "$git_log"; then
  fail "post-fetch immutable identity mismatch reached worktree movement"
fi

: >"$git_log"
divergent_output=""
if divergent_output="$(run_sync "$divergent_workspace" verified 2>&1)"; then
  fail "divergent workspace unexpectedly synchronized"
fi
assert_contains "$divergent_output" "diverges from verified example/repo:main"
[[ "$("$real_git" -C "$divergent_workspace" rev-parse HEAD)" == "$divergent_before" ]] ||
  fail "divergent workspace moved"

# A legacy/shared verification ref may belong to another target in the same
# common Git directory. Sync must ignore it and use the immutable repo-ID
# namespace captured to one commit.
sync_tree="$("$real_git" -C "$sync_workspace" rev-parse 'HEAD^{tree}')"
legacy_wrong_sha="$(
  print "unrelated target" |
    "$real_git" -C "$sync_workspace" commit-tree "$sync_tree"
)"
"$real_git" -C "$sync_workspace" update-ref \
  refs/remotes/conductor-canonical/main \
  "$legacy_wrong_sha"

: >"$git_log"
sync_output="$(run_sync "$sync_workspace" verified "$canonical_root" 2>&1)"
assert_contains "$sync_output" "CONDUCTOR GITHUB SYNC TARGET — VERIFIED"
assert_contains "$sync_output" "Repository:              $canonical_slug"
assert_contains "$sync_output" "Immutable repository ID: $canonical_repo_id"
assert_contains "$sync_output" "Bound remote:            origin"
assert_contains "$sync_output" "Verified fetch URL:      $canonical_url"
assert_contains "$sync_output" "Canonical root:          $canonical_root (not moved by workspace setup)"
[[ "$("$real_git" -C "$sync_workspace" rev-parse HEAD)" == "$canonical_head" ]] ||
  fail "workspace did not fast-forward to verified main"
[[ "$("$real_git" -C "$canonical_root" rev-parse HEAD)" == "$canonical_root_before" ]] ||
  fail "workspace setup moved the canonical root"
[[ "$("$real_git" -C "$sync_workspace" rev-parse refs/remotes/conductor-canonical/main)" ==
  "$legacy_wrong_sha" ]] ||
  fail "sync touched the unsafe shared verification ref"
expected_fetch="fetch --no-tags --prune $canonical_url +refs/heads/main:refs/remotes/conductor-canonical/$canonical_repo_id/main"
[[ "$(grep -Fc "$expected_fetch" "$git_log")" == "1" ]] ||
  fail "sync did not perform exactly one direct verified fetch"
if grep -Eq 'fetch .*origin|merge .*origin/' "$git_log"; then
  fail "sync used mutable origin after identity verification"
fi

print "PASS: Conductor GitHub sync is bound, single-worktree, and fail-closed"
