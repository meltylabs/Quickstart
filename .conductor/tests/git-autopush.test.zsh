#!/bin/zsh

set -euo pipefail
export GIT_AUTOPUSH=0

script_dir="${0:A:h}"
repo_root="${script_dir:h:h}"
tracked_hook="$repo_root/.conductor/scripts/git-post-commit-autopush.sh"
task_tmp="$(mktemp -d)"
task_tmp="${task_tmp:A}"
trap 'exit_code=$?; if [[ "${KEEP_TEST_TMP:-0}" == "1" ]]; then print -u2 "kept fixture: $task_tmp"; else rm -rf "$task_tmp"; fi; exit $exit_code' EXIT
tool_dir="$task_tmp/tooling"
test_home="$task_tmp/home"
state_dir="$test_home/.local/state/conductor-publish"
event_file="$state_dir/events.jsonl"
decoy_state="$task_tmp/environment-override"
mkdir -p "$tool_dir" "$test_home"
hook="$tool_dir/git-post-commit-autopush.sh"
fake_identity="$tool_dir/conductor-repo-identity.zsh"
real_git="$(command -v git)"
real_path="$PATH"

cp "$tracked_hook" "$hook"
chmod 700 "$hook"

fail() {
  print -u2 "FAIL: $1"
  exit 1
}

file_mode() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

configure_git_identity() {
  git -C "$1" config user.name "Conductor Test"
  git -C "$1" config user.email "conductor-test@example.com"
}

event_count() {
  [[ -f "$event_file" ]] || {
    print 0
    return
  }
  wc -l <"$event_file" | tr -d ' '
}

wait_for_event() {
  local jq_filter="$1"
  local elapsed=0

  while (( elapsed < 300 )); do
    if [[ -f "$event_file" ]] &&
      jq -e "$jq_filter" "$event_file" >/dev/null 2>&1
    then
      return 0
    fi
    sleep 0.05
    (( elapsed += 1 ))
  done
  [[ ! -f "$event_file" ]] || tail -n 12 "$event_file" >&2
  fail "timed out waiting for event: $jq_filter"
}

assert_remote_sha() {
  local repository="$1"
  local branch_name="$2"
  local expected="$3"
  local actual

  actual="$(git -C "$repository" ls-remote origin "refs/heads/$branch_name" | awk 'NR == 1 {print $1}')"
  [[ "$actual" == "$expected" ]] ||
    fail "remote $branch_name was ${actual:-missing}, expected $expected"
}

assert_remote_missing() {
  local repository="$1"
  local branch_name="$2"

  [[ -z "$(git -C "$repository" ls-remote origin "refs/heads/$branch_name")" ]] ||
    fail "remote branch unexpectedly exists: $branch_name"
}

run_hook() {
  local repository="$1"
  local autopush="$2"
  shift 2
  (
    cd "$repository"
    HOME="$test_home" \
      GIT_AUTOPUSH="$autopush" \
      CONDUCTOR_PUBLISH_STATE_DIR="$decoy_state" \
      PATH="$tool_dir:$real_path" \
      REAL_GIT="$real_git" \
      "$@" \
      "$hook"
  )
}

# Delay only the network push when a gate is supplied. This lets the test
# observe the durable pending receipt after the hook has already returned.
{
  print '#!/bin/bash'
  print 'set -u'
  print 'is_push=false'
  print 'for argument in "$@"; do'
  print '  [[ "$argument" == "push" ]] && is_push=true'
  print '  case "$argument" in'
  print '    *:refs/heads/*) push_branch="${argument#*:refs/heads/}" ;;'
  print '  esac'
  print 'done'
  print 'if [[ "$is_push" == "true" && -n "${FAKE_PUSH_ENTER_DIR:-}" ]]; then'
  print '  mkdir -p "$FAKE_PUSH_ENTER_DIR"'
  print '  marker="$(printf "%s" "${push_branch:-unknown}" | tr "/:" "__")"'
  print '  touch "$FAKE_PUSH_ENTER_DIR/${marker}-$$"'
  print 'fi'
  print 'if [[ "$is_push" == "true" && -n "${FAKE_PUSH_WAIT_FILE:-}" ]]; then'
  print '  while [[ ! -e "$FAKE_PUSH_WAIT_FILE" ]]; do sleep 0.02; done'
  print 'fi'
  print 'exec "${REAL_GIT:?}" "$@"'
} >"$tool_dir/git"
chmod 700 "$tool_dir/git"

# The foreground hook consumes only the local worktree binding. Its detached
# worker then performs full immutable-ID verification before the first push.
{
  print '#!/bin/bash'
  print 'set -u'
  print 'verification="full"'
  print 'if [[ "$*" == "--local" ]]; then'
  print '  verification="local"'
  print 'elif [[ -n "$*" ]]; then'
  print '  jq -cn '"'"'{ok:false,error:"invalid_mode"}'"'"''
  print '  exit 3'
  print 'fi'
  print 'root="$(git rev-parse --show-toplevel)"'
  print 'git_dir="$(git rev-parse --path-format=absolute --git-dir)"'
  print 'common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"'
  print 'fetch_url="$(git remote get-url origin 2>/dev/null || true)"'
  print 'push_url="$(git remote get-url --push origin 2>/dev/null || true)"'
  print 'if [[ "${FAKE_IDENTITY_MODE:-verified}" == "unbound" && "$verification" == "local" ]]; then'
  print '  jq -cn '"'"'{ok:false,error:"unbound_repository",message:"unbound",verification:"local"}'"'"
  print '  exit 3'
  print 'fi'
  print 'if [[ "${FAKE_IDENTITY_MODE:-verified}" == "stale" && "$verification" == "local" ]]; then'
  print '  jq -cn '"'"'{ok:false,error:"stale_worktree_binding",message:"stale inherited binding",verification:"local"}'"'"
  print '  exit 3'
  print 'fi'
  print 'if [[ "${FAKE_IDENTITY_MODE:-verified}" == "live-mismatch" && "$verification" == "full" ]]; then'
  print '  jq -cn --arg root "$root" --arg git_dir "$git_dir" --arg common "$common_dir" --arg fetch "$fetch_url" --arg push "$push_url" --arg verification "$verification" '"'"'{ok:true,verification:$verification,binding:"verified",remote:"origin",bound_remote:"origin",fetch_url:$fetch,push_url:$push,slug:"example/repo",bound_slug:"example/repo",repo_id:"R_RECREATED",bound_repo_id:"R_RECREATED",default_branch:"main",bound_default_branch:"main",root:$root,git_dir:$git_dir,bound_git_dir:$git_dir,common_dir:$common,canonical_url:"https://github.com/example/repo.git"}'"'"
  print '  exit 0'
  print 'fi'
  print 'if [[ ("${FAKE_IDENTITY_MODE:-verified}" != "verified" && "${FAKE_IDENTITY_MODE:-verified}" != "live-mismatch") || "$fetch_url" != "$push_url" ]]; then'
  print '  jq -cn --arg root "$root" --arg git_dir "$git_dir" --arg common "$common_dir" '"'"'{ok:false,binding:"error",root:$root,git_dir:$git_dir,common_dir:$common,error:"local_identity_failed"}'"'"
  print '  exit 3'
  print 'fi'
  print 'jq -cn --arg root "$root" --arg git_dir "$git_dir" --arg common "$common_dir" --arg fetch "$fetch_url" --arg push "$push_url" --arg verification "$verification" '"'"'{ok:true,verification:$verification,binding:"verified",remote:"origin",bound_remote:"origin",fetch_url:$fetch,push_url:$push,slug:"example/repo",bound_slug:"example/repo",repo_id:"R_TEST_IMMUTABLE",bound_repo_id:"R_TEST_IMMUTABLE",default_branch:"main",bound_default_branch:"main",root:$root,git_dir:$git_dir,bound_git_dir:$git_dir,common_dir:$common,canonical_url:"https://github.com/example/repo.git"}'"'"
} >"$fake_identity"
chmod 700 "$fake_identity"

bare_repo="$task_tmp/origin.git"
seed_repo="$task_tmp/seed"
work_repo="$task_tmp/work"
other_repo="$task_tmp/other.git"

git init --bare -q "$bare_repo"
git init -q "$seed_repo"
configure_git_identity "$seed_repo"
print "base" >"$seed_repo/file.txt"
git -C "$seed_repo" add file.txt
git -C "$seed_repo" commit -q -m "base"
git -C "$seed_repo" branch -M main
git -C "$seed_repo" remote add origin "$bare_repo"
git -C "$seed_repo" push -q -u origin main
git -C "$bare_repo" symbolic-ref HEAD refs/heads/main
git clone -q "$bare_repo" "$work_repo"
configure_git_identity "$work_repo"
mkdir -p "$task_tmp/disabled-hooks"
git -C "$work_repo" config core.hooksPath "$task_tmp/disabled-hooks"

# Feature backup: pending is durable before the delayed network push, the state
# override is ignored, and the final receipt contains the full worktree target.
git -C "$work_repo" switch -q -c feature
print "feature" >>"$work_repo/file.txt"
git -C "$work_repo" add file.txt
git -C "$work_repo" commit -q -m "feature"
feature_sha="$(git -C "$work_repo" rev-parse HEAD)"
feature_git_dir="$(git -C "$work_repo" rev-parse --path-format=absolute --git-dir)"
feature_common_dir="$(git -C "$work_repo" rev-parse --path-format=absolute --git-common-dir)"
unsafe_chain_marker="$task_tmp/unreviewed-local-hook-ran"
{
  print '#!/bin/sh'
  print "touch '$unsafe_chain_marker'"
} >"$feature_common_dir/hooks/post-commit"
chmod +x "$feature_common_dir/hooks/post-commit"
feature_gate="$task_tmp/release-feature"
run_hook "$work_repo" 1 env \
  FAKE_PUSH_WAIT_FILE="$feature_gate" \
  CONDUCTOR_CHAIN_LOCAL_POST_COMMIT=1
[[ -f "$event_file" ]] || fail "pending audit receipt was not created synchronously"
jq -e \
  --arg sha "$feature_sha" \
  --arg git_dir "$feature_git_dir" \
  --arg common_dir "$feature_common_dir" \
  'select(
    .event == "backup_push" and
    .status == "pending" and
    .repo == "example/repo" and
    .repo_id == "R_TEST_IMMUTABLE" and
    (.timestamp_epoch | type) == "number" and
    .timestamp_epoch > 0 and
    .git_dir == $git_dir and
    .common_dir == $common_dir and
    .remote == "origin" and
    .branch == "feature" and
    .local_sha == $sha and
    .remote_sha == "" and
    .reason == "queued"
  )' "$event_file" >/dev/null ||
  fail "pending receipt was incomplete or not for current HEAD"
assert_remote_missing "$work_repo" feature
[[ ! -e "$decoy_state" ]] ||
  fail "CONDUCTOR_PUBLISH_STATE_DIR redirected the fixed audit trail"
touch "$feature_gate"
wait_for_event 'select(.status == "success" and .branch == "feature")'
assert_remote_sha "$work_repo" feature "$feature_sha"
[[ ! -e "$unsafe_chain_marker" ]] ||
  fail "unreviewed repository-local hook ran despite chaining being disabled"
jq -e \
  --arg sha "$feature_sha" \
  'select(
    .status == "success" and
    .branch == "feature" and
    .local_sha == $sha and
    .remote_sha == $sha and
    .reason == "verified_exact"
  )' "$event_file" >/dev/null ||
  fail "feature success receipt was not truthful"
[[ "$(file_mode "$state_dir")" == "700" ]] ||
  fail "audit directory is not mode 0700"
[[ "$(file_mode "$event_file")" == "600" ]] ||
  fail "events.jsonl is not mode 0600"

# A symlinked audit directory fails closed before any network push.
audit_failure_home="$task_tmp/audit-failure-home"
audit_redirect="$task_tmp/audit-redirect"
mkdir -p "$audit_failure_home/.local/state" "$audit_redirect"
ln -s "$audit_redirect" "$audit_failure_home/.local/state/conductor-publish"
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c audit-failure
print "audit failure" >"$work_repo/audit.txt"
git -C "$work_repo" add audit.txt
git -C "$work_repo" commit -q -m "audit failure"
(
  cd "$work_repo"
  HOME="$audit_failure_home" \
    GIT_AUTOPUSH=1 \
    CONDUCTOR_PUBLISH_STATE_DIR="$task_tmp/audit-decoy" \
    PATH="$tool_dir:$real_path" \
    REAL_GIT="$real_git" \
    "$hook"
)
sleep 0.2
assert_remote_missing "$work_repo" audit-failure
[[ -z "$(find "$audit_redirect" -mindepth 1 -print -quit)" ]] ||
  fail "symlinked audit target was written"

# A symlinked receipt file is rejected just as strictly.
audit_file_home="$task_tmp/audit-file-home"
audit_file_state="$audit_file_home/.local/state/conductor-publish"
audit_file_redirect="$task_tmp/audit-file-redirect"
mkdir -p "$audit_file_state"
touch "$audit_file_redirect"
ln -s "$audit_file_redirect" "$audit_file_state/events.jsonl"
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c audit-file-failure
print "audit file failure" >"$work_repo/audit-file.txt"
git -C "$work_repo" add audit-file.txt
git -C "$work_repo" commit -q -m "audit file failure"
(
  cd "$work_repo"
  HOME="$audit_file_home" \
    GIT_AUTOPUSH=1 \
    PATH="$tool_dir:$real_path" \
    REAL_GIT="$real_git" \
    "$hook"
)
sleep 0.2
assert_remote_missing "$work_repo" audit-file-failure
[[ ! -s "$audit_file_redirect" ]] ||
  fail "symlinked events file target was written"

# Default, reserved landing, and environment-disabled branches never push and
# leave an explicit skip receipt in the fixed audit.
git -C "$work_repo" switch -q main
print "local main" >>"$work_repo/file.txt"
git -C "$work_repo" add file.txt
git -C "$work_repo" commit -q -m "local main"
local_main_sha="$(git -C "$work_repo" rev-parse HEAD)"
remote_main_before="$(git -C "$work_repo" ls-remote origin refs/heads/main | awk '{print $1}')"
run_hook "$work_repo" 1 env
wait_for_event 'select(.status == "skipped" and .branch == "main" and .reason == "default_branch")'
assert_remote_sha "$work_repo" main "$remote_main_before"
[[ "$local_main_sha" != "$remote_main_before" ]] ||
  fail "default-branch fixture did not contain an unpushed commit"

git -C "$work_repo" switch -q -c conductor/land/queue-test
print "reserved" >"$work_repo/reserved.txt"
git -C "$work_repo" add reserved.txt
git -C "$work_repo" commit -q -m "reserved"
run_hook "$work_repo" 1 env
wait_for_event 'select(.status == "skipped" and .branch == "conductor/land/queue-test" and .reason == "reserved_landing_branch")'
assert_remote_missing "$work_repo" conductor/land/queue-test

git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c disabled
print "disabled" >"$work_repo/disabled.txt"
git -C "$work_repo" add disabled.txt
git -C "$work_repo" commit -q -m "disabled"
run_hook "$work_repo" 0 env
wait_for_event 'select(.status == "skipped" and .branch == "disabled" and .reason == "disabled_environment")'
assert_remote_missing "$work_repo" disabled

# An unbound worktree is a quiet, local skip and never reaches the network.
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c unbound
print "unbound" >"$work_repo/unbound.txt"
git -C "$work_repo" add unbound.txt
git -C "$work_repo" commit -q -m "unbound"
run_hook "$work_repo" 1 env FAKE_IDENTITY_MODE=unbound
wait_for_event 'select(.status == "skipped" and .branch == "unbound" and .reason == "unbound")'
assert_remote_missing "$work_repo" unbound

# Git-copied worktree binding is also a quiet pre-bind skip.
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c stale-binding
print "stale binding" >"$work_repo/stale-binding.txt"
git -C "$work_repo" add stale-binding.txt
git -C "$work_repo" commit -q -m "stale binding"
run_hook "$work_repo" 1 env FAKE_IDENTITY_MODE=stale
wait_for_event 'select(.status == "skipped" and .branch == "stale-binding" and .reason == "unbound")'
assert_remote_missing "$work_repo" stale-binding

# A slug deleted/recreated under a different immutable GitHub repository ID is
# caught by the detached live check before any automatic network write.
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c recreated-slug
print "recreated slug" >"$work_repo/recreated-slug.txt"
git -C "$work_repo" add recreated-slug.txt
git -C "$work_repo" commit -q -m "recreated slug"
run_hook "$work_repo" 1 env FAKE_IDENTITY_MODE=live-mismatch
wait_for_event 'select(.status == "failed" and .branch == "recreated-slug" and .reason == "live_identity_mismatch")'
assert_remote_missing "$work_repo" recreated-slug

# Identity failure and a mismatched push destination never write either remote.
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c identity-failure
print "identity failure" >"$work_repo/identity.txt"
git -C "$work_repo" add identity.txt
git -C "$work_repo" commit -q -m "identity failure"
git init --bare -q "$other_repo"
git -C "$work_repo" config remote.origin.pushurl "$other_repo"
run_hook "$work_repo" 1 env
wait_for_event 'select(.status == "failed" and .branch == "identity-failure" and (.reason | startswith("identity_error:")))'
assert_remote_missing "$work_repo" identity-failure
[[ -z "$(git -C "$work_repo" ls-remote "$other_repo" refs/heads/identity-failure)" ]] ||
  fail "identity failure wrote to the mismatched push repository"
git -C "$work_repo" config --unset-all remote.origin.pushurl

# Distinct repository routes do not share a long-lived network lock. Both
# background workers enter push concurrently while their common gate is closed.
route_gate="$task_tmp/release-distinct-routes"
route_enter="$task_tmp/distinct-route-enter"
mkdir -p "$route_enter"
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c route-a
print "route a" >"$work_repo/route-a.txt"
git -C "$work_repo" add route-a.txt
git -C "$work_repo" commit -q -m "route a"
route_a_sha="$(git -C "$work_repo" rev-parse HEAD)"
run_hook "$work_repo" 1 env \
  FAKE_PUSH_WAIT_FILE="$route_gate" \
  FAKE_PUSH_ENTER_DIR="$route_enter"

git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c route-b
print "route b" >"$work_repo/route-b.txt"
git -C "$work_repo" add route-b.txt
git -C "$work_repo" commit -q -m "route b"
route_b_sha="$(git -C "$work_repo" rev-parse HEAD)"
run_hook "$work_repo" 1 env \
  FAKE_PUSH_WAIT_FILE="$route_gate" \
  FAKE_PUSH_ENTER_DIR="$route_enter"

elapsed=0
while (( elapsed < 100 )); do
  route_enter_count="$(find "$route_enter" -type f 2>/dev/null | wc -l | tr -d ' ')"
  (( route_enter_count >= 2 )) && break
  sleep 0.05
  (( elapsed += 1 ))
done
(( route_enter_count >= 2 )) ||
  fail "unrelated backup routes were serialized behind one global push lock"
touch "$route_gate"
wait_for_event 'select((.status == "success" or .status == "superseded") and .branch == "route-a")'
wait_for_event 'select((.status == "success" or .status == "superseded") and .branch == "route-b")'
assert_remote_sha "$work_repo" route-a "$route_a_sha"
assert_remote_sha "$work_repo" route-b "$route_b_sha"

# Separate worktrees targeting the same immutable repository ID and destination
# ref share one route lock even though their git_dir values differ.
same_route_a="$task_tmp/same-route-a"
same_route_b="$task_tmp/same-route-b"
git clone -q "$bare_repo" "$same_route_a"
git clone -q "$bare_repo" "$same_route_b"
for same_route_repo in "$same_route_a" "$same_route_b"; do
  configure_git_identity "$same_route_repo"
  git -C "$same_route_repo" config core.hooksPath "$task_tmp/disabled-hooks"
  git -C "$same_route_repo" switch -q -c shared-route
done
print "same route a" >"$same_route_a/same.txt"
git -C "$same_route_a" add same.txt
git -C "$same_route_a" commit -q -m "same route a"
print "same route b" >"$same_route_b/same.txt"
git -C "$same_route_b" add same.txt
git -C "$same_route_b" commit -q -m "same route b"

same_route_gate="$task_tmp/release-same-route"
same_route_enter="$task_tmp/same-route-enter"
mkdir -p "$same_route_enter"
run_hook "$same_route_a" 1 env \
  FAKE_PUSH_WAIT_FILE="$same_route_gate" \
  FAKE_PUSH_ENTER_DIR="$same_route_enter"
run_hook "$same_route_b" 1 env \
  FAKE_PUSH_WAIT_FILE="$same_route_gate" \
  FAKE_PUSH_ENTER_DIR="$same_route_enter"

elapsed=0
while (( elapsed < 100 )); do
  same_route_enter_count="$(find "$same_route_enter" -type f | wc -l | tr -d ' ')"
  (( same_route_enter_count >= 1 )) && break
  sleep 0.05
  (( elapsed += 1 ))
done
(( same_route_enter_count == 1 )) ||
  fail "same repository/ref route did not enter its first push"
sleep 0.25
same_route_enter_count="$(find "$same_route_enter" -type f | wc -l | tr -d ' ')"
(( same_route_enter_count == 1 )) ||
  fail "separate worktrees bypassed the shared destination-ref lock"
touch "$same_route_gate"

elapsed=0
while (( elapsed < 300 )); do
  if jq -s -e '
    [
      .[] |
      select(
        .branch == "shared-route" and
        (.status == "success" or .status == "superseded" or .status == "failed")
      )
    ] | length == 2
  ' "$event_file" >/dev/null 2>&1
  then
    break
  fi
  sleep 0.05
  (( elapsed += 1 ))
done
(( elapsed < 300 )) || fail "same-route background workers did not finish"

# Rapid commits may finish out of order, but the exact non-force refspec always
# leaves the newest commit on the remote. Locking keeps every JSONL line valid.
git -C "$work_repo" switch -q main
git -C "$work_repo" switch -q -c rapid
print "rapid one" >"$work_repo/rapid.txt"
git -C "$work_repo" add rapid.txt
git -C "$work_repo" commit -q -m "rapid one"
rapid_one="$(git -C "$work_repo" rev-parse HEAD)"
rapid_gate="$task_tmp/release-rapid"
run_hook "$work_repo" 1 env FAKE_PUSH_WAIT_FILE="$rapid_gate"
print "rapid two" >>"$work_repo/rapid.txt"
git -C "$work_repo" add rapid.txt
git -C "$work_repo" commit -q -m "rapid two"
rapid_two="$(git -C "$work_repo" rev-parse HEAD)"
run_hook "$work_repo" 1 env FAKE_PUSH_WAIT_FILE="$rapid_gate"
jq -s -e --arg one "$rapid_one" --arg two "$rapid_two" '
  [
    .[] |
    select(
      .status == "pending" and
      .branch == "rapid" and
      (.local_sha == $one or .local_sha == $two)
    ) |
    .local_sha
  ] | unique | length == 2
' "$event_file" >/dev/null ||
  fail "rapid pending receipts are invalid"
touch "$rapid_gate"
wait_for_event 'select((.status == "success" or .status == "superseded") and .branch == "rapid")'
elapsed=0
while (( elapsed < 300 )); do
  if [[ "$(git -C "$work_repo" ls-remote origin refs/heads/rapid | awk '{print $1}')" == "$rapid_two" ]] &&
    jq -s -e \
      --arg one "$rapid_one" \
      --arg two "$rapid_two" \
      '[
        .[] |
        select(
          .branch == "rapid" and
          (.local_sha == $one or .local_sha == $two) and
          (.status == "success" or .status == "superseded")
        )
      ] | length == 2' \
      "$event_file" >/dev/null 2>&1
  then
    break
  fi
  sleep 0.05
  (( elapsed += 1 ))
done
(( elapsed < 300 )) || fail "rapid backups did not converge on the newest commit"
assert_remote_sha "$work_repo" rapid "$rapid_two"

# Multiple simultaneous receipts cannot interleave into malformed JSON.
parallel_start="$(event_count)"
typeset -a parallel_pids
for index in 1 2 3 4 5 6; do
  run_hook "$work_repo" 1 env &
  parallel_pids+=("$!")
done
for parallel_pid in "${parallel_pids[@]}"; do
  wait "$parallel_pid"
done
expected_minimum=$((parallel_start + 12))
elapsed=0
while (( elapsed < 300 )); do
  (( $(event_count) >= expected_minimum )) && break
  sleep 0.05
  (( elapsed += 1 ))
done
(( $(event_count) >= expected_minimum )) ||
  fail "parallel final receipts did not complete"
jq -e . "$event_file" >/dev/null ||
  fail "parallel append produced malformed JSONL"
jq -e '
  (.timestamp_epoch | type) == "number" and
  .timestamp_epoch == (.timestamp_epoch | floor) and
  .timestamp_epoch > 0
' "$event_file" >/dev/null ||
  fail "an audit event is missing its numeric timestamp_epoch"
line_count="$(event_count)"
json_count="$(jq -s 'length' "$event_file")"
[[ "$line_count" == "$json_count" ]] ||
  fail "parallel JSONL contains partial or interleaved records"

print "PASS: post-commit backup is audited, exact, asynchronous, and truthful"
