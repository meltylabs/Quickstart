#!/bin/zsh

set -euo pipefail
export GIT_AUTOPUSH=0

script_dir="${0:A:h}"
repo_root="${script_dir:h:h}"
tracked_land_script="$repo_root/.conductor/scripts/conductor-land.zsh"
tracked_archive_script="$repo_root/.conductor/scripts/archive-guard.zsh"
workflow_file="$repo_root/.github/workflows/conductor-autoland.yml"
fake_bin="$script_dir/fixtures"
real_path="$PATH"
task_tmp="$(mktemp -d)"
trap 'rm -rf "$task_tmp"' EXIT

land_script="$task_tmp/conductor-land.zsh"
archive_script="$task_tmp/archive-guard.zsh"
fake_identity="$task_tmp/conductor-repo-identity.zsh"
cp "$tracked_land_script" "$land_script"
cp "$tracked_archive_script" "$archive_script"
chmod 700 "$land_script" "$archive_script"

{
  print '#!/bin/zsh'
  print 'set -euo pipefail'
  print 'root="$(git rev-parse --show-toplevel)"'
  print 'git_dir="$(git rev-parse --path-format=absolute --git-dir)"'
  print 'common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"'
  print 'identity_call=1'
  print 'if [[ -n "${FAKE_IDENTITY_CALL_FILE:-}" ]]; then'
  print '  previous_call="$(cat "$FAKE_IDENTITY_CALL_FILE" 2>/dev/null || print 0)"'
  print '  identity_call=$((previous_call + 1))'
  print '  print -r -- "$identity_call" >"$FAKE_IDENTITY_CALL_FILE"'
  print 'fi'
  print 'if [[ "${FAKE_IDENTITY_MODE:-verified}" == "mismatch" ||'
  print '  ( -n "${FAKE_IDENTITY_FAIL_ON_CALL:-}" && "$identity_call" == "$FAKE_IDENTITY_FAIL_ON_CALL" )'
  print ']]; then'
  print '  jq -cn --arg root "$root" --arg common_dir "$common_dir" '"'"'{
    ok: false,
    root: $root,
    common_dir: $common_dir,
    error: "binding_mismatch",
    message: "test mismatch"
  }'"'"
  print '  exit 3'
  print 'fi'
  print 'jq -cn --arg root "$root" --arg git_dir "$git_dir" --arg common_dir "$common_dir" '"'"'{
    ok: true,
    verification: "full",
    root: $root,
    git_dir: $git_dir,
    common_dir: $common_dir,
    remote: "keystone",
    fetch_url: "https://github.com/example/repo.git",
    push_url: "https://github.com/example/repo.git",
    canonical_url: "https://github.com/example/repo.git",
    slug: "example/repo",
    repo_id: "R_test_example_repo",
    default_branch: "main",
    binding: "verified",
    bound_slug: "example/repo",
    bound_repo_id: "R_test_example_repo",
    bound_remote: "keystone",
    bound_default_branch: "main",
    bound_git_dir: $git_dir
  }'"'"
} >"$fake_identity"
chmod 700 "$fake_identity"

fail() {
  print -u2 "FAIL: $1"
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" != *"$needle"* ]] || fail "expected output not to contain: $needle"
}

file_mode() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

file_uid() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f '%u' "$1"
  else
    stat -c '%u' "$1"
  fi
}

configure_identity() {
  git -C "$1" config user.name "Conductor Test"
  git -C "$1" config user.email "conductor-test@example.com"
}

remote_ref_sha() {
  git --git-dir="$1" rev-parse --verify -q "refs/heads/$2" 2>/dev/null || true
}

create_land_fixture() {
  local fixture_name="$1"
  local bare_repo="$task_tmp/$fixture_name-origin.git"
  local seed_repo="$task_tmp/$fixture_name-seed"
  local work_repo="$task_tmp/$fixture_name-work"

  git init --bare -q "$bare_repo"
  git init -q "$seed_repo"
  configure_identity "$seed_repo"
  print "base" >"$seed_repo/file.txt"
  git -C "$seed_repo" add file.txt
  git -C "$seed_repo" commit -q -m "base"
  git -C "$seed_repo" branch -M main
  git -C "$seed_repo" remote add origin "$bare_repo"
  git -C "$seed_repo" push -q -u origin main
  git -C "$bare_repo" symbolic-ref HEAD refs/heads/main

  git clone -q "$bare_repo" "$work_repo"
  configure_identity "$work_repo"
  git -C "$work_repo" remote rename origin keystone
  git -C "$work_repo" remote set-url keystone https://github.com/example/repo.git
  git -C "$work_repo" config \
    "url.file://$bare_repo.insteadOf" \
    https://github.com/example/repo.git
  git -C "$work_repo" switch -q -c feature
  print "feature" >>"$work_repo/file.txt"
  git -C "$work_repo" add file.txt
  git -C "$work_repo" commit -q -m "feature"

  print -r -- "$work_repo|$bare_repo|$seed_repo"
}

create_archive_fixture() {
  local bare_repo="$task_tmp/archive-origin.git"
  local source_repo="$task_tmp/archive-source"
  local work_repo="$task_tmp/archive-work"
  local local_sha
  local pr_head_sha
  local merge_sha

  git init --bare -q "$bare_repo"
  git init -q "$source_repo"
  configure_identity "$source_repo"
  print "base" >"$source_repo/base.txt"
  git -C "$source_repo" add base.txt
  git -C "$source_repo" commit -q -m "base"
  git -C "$source_repo" branch -M main
  git -C "$source_repo" switch -q -c feature
  print "feature" >"$source_repo/feature.txt"
  git -C "$source_repo" add feature.txt
  git -C "$source_repo" commit -q -m "feature"
  local_sha="$(git -C "$source_repo" rev-parse HEAD)"
  git -C "$source_repo" switch -q main
  print "new main" >>"$source_repo/base.txt"
  git -C "$source_repo" add base.txt
  git -C "$source_repo" commit -q -m "advance main"
  git -C "$source_repo" switch -q feature
  git -C "$source_repo" merge -q --no-edit main >/dev/null
  pr_head_sha="$(git -C "$source_repo" rev-parse HEAD)"
  git -C "$source_repo" switch -q main
  git -C "$source_repo" merge -q --squash feature >/dev/null
  git -C "$source_repo" commit -q -m "squash feature"
  merge_sha="$(git -C "$source_repo" rev-parse HEAD)"
  git -C "$source_repo" remote add origin "$bare_repo"
  git -C "$source_repo" push -q origin main
  git -C "$source_repo" push -q origin \
    "${pr_head_sha}:refs/pull/42/head"
  git -C "$bare_repo" symbolic-ref HEAD refs/heads/main

  git clone -q "$bare_repo" "$work_repo"
  configure_identity "$work_repo"
  git -C "$work_repo" fetch -q origin refs/pull/42/head
  git -C "$work_repo" branch feature "$local_sha"
  git -C "$work_repo" switch -q feature
  git -C "$work_repo" remote rename origin keystone
  git -C "$work_repo" remote set-url keystone https://github.com/example/repo.git
  git -C "$work_repo" config \
    "url.file://$bare_repo.insteadOf" \
    https://github.com/example/repo.git

  print -r -- "$work_repo|$local_sha|$pr_head_sha|$merge_sha"
}

help_output="$("$land_script" --help)"
assert_contains "$help_output" "serialized background landing"
if "$land_script" --invalid >/dev/null 2>&1; then
  fail "invalid conductor-land argument unexpectedly succeeded"
fi

land_fixture="$(create_land_fixture land)"
land_repo="${land_fixture%%|*}"
land_rest="${land_fixture#*|}"
land_bare="${land_rest%%|*}"
land_seed="${land_rest#*|}"
export FAKE_BARE_REPO="$land_bare"
land_repo="$(cd "$land_repo" && pwd -P)"
land_head="$(git -C "$land_repo" rev-parse HEAD)"
landing_branch="conductor/land/$land_head"
land_log="$task_tmp/land-gh.log"
label_state="$task_tmp/land-label-state"
test_home="$task_tmp/home"
mkdir -p "$test_home"
: >"$land_log"

identity_failure_output=""
if identity_failure_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_IDENTITY_MODE=mismatch \
    FAKE_GH_LOG="$land_log" \
    "$land_script" 2>&1
)"
then
  fail "identity mismatch unexpectedly published"
fi
assert_contains "$identity_failure_output" "repository identity verification failed"
[[ -z "$(remote_ref_sha "$land_bare" feature)" ]] ||
  fail "identity mismatch reached the source branch"

protection_failure_output=""
if protection_failure_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_PROTECTION_MODE=unsafe \
    FAKE_GH_LOG="$land_log" \
    "$land_script" 2>&1
)"
then
  fail "unsafe protection unexpectedly published"
fi
assert_contains "$protection_failure_output" "unsafe or incomplete protection"
[[ -z "$(remote_ref_sha "$land_bare" feature)" ]] ||
  fail "unsafe protection reached the source branch"

live_identity_home="$task_tmp/live-identity-home"
live_identity_calls="$task_tmp/live-identity-calls"
mkdir -p "$live_identity_home"
print 0 >"$live_identity_calls"
live_identity_failure_output=""
if live_identity_failure_output="$(
  cd "$land_repo"
  HOME="$live_identity_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$land_log" \
    FAKE_IDENTITY_CALL_FILE="$live_identity_calls" \
    FAKE_IDENTITY_FAIL_ON_CALL=2 \
    FAKE_HEAD_SHA="$land_head" \
    FAKE_LANDING_BRANCH="$landing_branch" \
    "$land_script" 2>&1
)"
then
  fail "live immutable identity mismatch unexpectedly published"
fi
assert_contains "$live_identity_failure_output" \
  "live immutable repository identity changed before source push"
[[ -z "$(remote_ref_sha "$land_bare" feature)" ]] ||
  fail "live immutable identity mismatch reached the source branch"
jq -e -s '
  length == 2 and
  .[0].status == "pending" and
  .[0].event == "land" and
  .[1].status == "failed" and
  .[1].reason == "live_identity_mismatch_before_source_push"
' "$live_identity_home/.local/state/conductor-publish/events.jsonl" >/dev/null ||
  fail "live identity failure was not durably audited before refusing the push"

rm -f "$label_state"
land_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$land_log" \
    FAKE_GH_LABEL_STATE_FILE="$label_state" \
    FAKE_HEAD_SHA="$land_head" \
    FAKE_LANDING_BRANCH="$landing_branch" \
    "$land_script"
)"
assert_contains "$land_output" "CONDUCTOR PUBLISH TARGET — VERIFIED"
assert_contains "$land_output" "Repository:              example/repo"
assert_contains "$land_output" "Immutable repository ID: R_test_example_repo"
assert_contains "$land_output" "Bound remote:            keystone"
assert_contains "$land_output" "Source route:            feature@$land_head"
assert_contains "$land_output" "Landing route:           $landing_branch@$land_head -> main"
assert_contains "$land_output" "PUSH_VERIFIED repo=example/repo source_branch=feature source_sha=$land_head"
assert_contains "$land_output" "QUEUED repo=example/repo repo_id=R_test_example_repo remote=keystone base=main source_branch=feature source_sha=$land_head landing_branch=$landing_branch landing_sha=$land_head pr=https://github.com/example/repo/pull/1"
assert_contains "$land_output" "GitHub will reconcile, test, and squash-merge in the background."
[[ "$(remote_ref_sha "$land_bare" feature)" == "$land_head" ]] ||
  fail "source backup does not match the exact source SHA"
[[ "$(remote_ref_sha "$land_bare" "$landing_branch")" == "$land_head" ]] ||
  fail "landing ref does not match the exact source SHA"
git -C "$land_repo" show-ref --verify --quiet \
  "refs/conductor/verified/R_test_example_repo/default/$land_head" ||
  fail "verified default ref is not namespaced by immutable repository ID"
if git -C "$land_repo" show-ref --verify --quiet \
  "refs/conductor/verified/default/$land_head"
then
  fail "legacy unnamespaced verified default ref was created"
fi
grep -Fq -- 'verified_default_sha="$(git rev-parse "$canonical_ref^{commit}")"' \
  "$tracked_land_script" ||
  fail "conductor-land does not capture an immutable verified default OID"
grep -Fq -- "--head $landing_branch" "$land_log" ||
  fail "pull request lookup did not use the landing ref"
grep -Fq -- "--head example:$landing_branch" "$land_log" ||
  fail "pull request creation did not use the landing ref"
grep -Fq -- "api --method POST repos/example/repo/git/refs" "$land_log" ||
  fail "landing ref was not created through GitHub's atomic create-ref API"

events_file="$test_home/.local/state/conductor-publish/events.jsonl"
events_state_dir="${events_file:h}"
[[ "$(file_mode "$events_state_dir")" == "700" ]] ||
  fail "publish state directory is not mode 0700"
[[ "$(file_mode "$events_file")" == "600" ]] ||
  fail "publish event log is not mode 0600"
[[ "$(file_uid "$events_state_dir")" == "$(id -u)" &&
  "$(file_uid "$events_file")" == "$(id -u)" ]] ||
  fail "publish audit paths are not owned by the current user"
[[ ! -e "$events_state_dir/events.lock" ]] ||
  fail "publish event lock was not released"
grep -Fq -- 'events_lock="$publish_state_dir/events.lock"' "$tracked_land_script" ||
  fail "conductor-land does not share the hook event lock"
[[ "$(jq -s 'length' "$events_file")" == "3" ]] ||
  fail "initial publish did not write exactly three audit events"
jq -e -s \
  --arg source_branch "feature" \
  --arg source_sha "$land_head" \
  --arg landing_branch "$landing_branch" \
  '
    all(.[];
      .repo == "example/repo" and
      .repo_id == "R_test_example_repo" and
      (.timestamp_epoch | type == "number") and
      (.git_dir | type == "string" and length > 0) and
      .remote == "keystone" and
      .fetch_url == "https://github.com/example/repo.git" and
      .push_url == "https://github.com/example/repo.git" and
      .source_branch == $source_branch and
      .source_sha == $source_sha and
      .landing_branch == $landing_branch
    ) and
    .[0].event == "land" and
    .[0].status == "pending" and
    .[0].reason == "before_source_backup" and
    .[0].landing_sha == "" and
    .[1].event == "push_verified" and
    .[1].status == "success" and
    .[1].landing_sha == "" and
    .[2].event == "queued" and
    .[2].status == "success" and
    .[2].landing_sha == $source_sha
  ' "$events_file" >/dev/null ||
  fail "publish audit event omitted the exact source and landing identity"

main_sha="$(remote_ref_sha "$land_bare" main)"
wait_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_EXISTING_PR=true \
    FAKE_GH_LOG="$land_log" \
    FAKE_GH_LABEL_STATE_FILE="$label_state" \
    FAKE_HEAD_SHA="$land_head" \
    FAKE_LANDING_BRANCH="$landing_branch" \
    FAKE_MERGE_SHA="$main_sha" \
    CONDUCTOR_LAND_TIMEOUT_SECONDS=1 \
    "$land_script" --wait
)"
assert_contains "$wait_output" "LANDED https://github.com/example/repo/pull/1"

# Moving the mutable source branch after queueing cannot change the queued
# pull request or its SHA-addressed landing ref.
print "later source work" >>"$land_repo/file.txt"
git -C "$land_repo" add file.txt
git -C "$land_repo" commit -q -m "later source work"
later_source_sha="$(git -C "$land_repo" rev-parse HEAD)"
git -C "$land_repo" push -q \
  https://github.com/example/repo.git \
  "${later_source_sha}:refs/heads/feature"
[[ "$(remote_ref_sha "$land_bare" feature)" == "$later_source_sha" ]] ||
  fail "later source branch push did not reach the source ref"
[[ "$(remote_ref_sha "$land_bare" "$landing_branch")" == "$land_head" ]] ||
  fail "later source branch push changed the queued landing ref"
original_pr_json="$(
  PATH="$fake_bin:$real_path" \
    FAKE_GH_LABEL_STATE_FILE="$label_state" \
    FAKE_HEAD_SHA="$land_head" \
    FAKE_LANDING_BRANCH="$landing_branch" \
    gh pr view https://github.com/example/repo/pull/1 \
      --json number,url,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,labels
)"
[[ "$(jq -r '.headRefName' <<<"$original_pr_json")" == "$landing_branch" ]] ||
  fail "queued pull request stopped using its landing ref"
[[ "$(jq -r '.headRefOid' <<<"$original_pr_json")" == "$land_head" ]] ||
  fail "later source branch push changed the queued pull request SHA"

# A pre-existing reserved ref at any other SHA is immutable and fails closed.
conflicting_landing_branch="conductor/land/$later_source_sha"
git -C "$land_repo" push -q \
  https://github.com/example/repo.git \
  "${land_head}:refs/heads/$conflicting_landing_branch"
immutable_output=""
if immutable_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$land_log" \
    FAKE_GH_LABEL_STATE_FILE="$label_state" \
    FAKE_HEAD_SHA="$later_source_sha" \
    FAKE_LANDING_BRANCH="$conflicting_landing_branch" \
    "$land_script" 2>&1
)"
then
  fail "conductor-land moved a conflicting reserved landing ref"
fi
assert_contains "$immutable_output" "reserved landing ref already exists at a different SHA"
assert_not_contains "$immutable_output" "QUEUED"
[[ "$(remote_ref_sha "$land_bare" "$conflicting_landing_branch")" == "$land_head" ]] ||
  fail "conflicting reserved landing ref was overwritten"

# Remove only the deliberately poisoned temporary ref, then prove a race
# between the pre-label and post-label reads is de-queued without a receipt.
git -C "$land_repo" push -q \
  https://github.com/example/repo.git \
  ":refs/heads/$conflicting_landing_branch"
rm -f "$label_state"
: >"$land_log"
race_output=""
if race_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$land_log" \
    FAKE_GH_LABEL_STATE_FILE="$label_state" \
    FAKE_HEAD_SHA="$later_source_sha" \
    FAKE_LANDING_BRANCH="$conflicting_landing_branch" \
    FAKE_LABEL_RACE=true \
    FAKE_RACE_SHA="$main_sha" \
    "$land_script" 2>&1
)"
then
  fail "label-time pull request head race unexpectedly queued"
fi
assert_contains "$race_output" "pull request changed or became blocked while queueing; autoland was disabled"
assert_not_contains "$race_output" "QUEUED"
grep -Fq -- "/labels/conductor-autoland" "$land_log" ||
  fail "label race did not remove the queue label"
grep -Fq -- "pr merge 1 --repo example/repo --disable-auto" "$land_log" ||
  fail "label race did not disable auto-merge"
[[ "$(remote_ref_sha "$land_bare" "$conflicting_landing_branch")" == "$later_source_sha" ]] ||
  fail "label race changed the immutable landing ref"

# A ref created at a different commit between the read and create request is
# never fast-forwarded. The create-only GitHub API loses the race, Conductor
# rereads, and fails without moving the reserved ref.
print "atomic creation race" >>"$land_repo/file.txt"
git -C "$land_repo" add file.txt
git -C "$land_repo" commit -q -m "atomic creation race"
atomic_source_sha="$(git -C "$land_repo" rev-parse HEAD)"
atomic_landing_branch="conductor/land/$atomic_source_sha"
: >"$land_log"
atomic_race_output=""
if atomic_race_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$land_log" \
    FAKE_HEAD_SHA="$atomic_source_sha" \
    FAKE_LANDING_BRANCH="$atomic_landing_branch" \
    FAKE_REF_CREATE_RACE=true \
    FAKE_REF_RACE_SHA="$later_source_sha" \
    "$land_script" 2>&1
)"
then
  fail "atomic landing creation race unexpectedly succeeded"
fi
assert_contains "$atomic_race_output" "atomic landing ref creation/reuse did not resolve to the exact source SHA"
assert_not_contains "$atomic_race_output" "QUEUED"
[[ "$(remote_ref_sha "$land_bare" feature)" == "$atomic_source_sha" ]] ||
  fail "atomic ref race lost the exact source backup"
[[ "$(remote_ref_sha "$land_bare" "$atomic_landing_branch")" == "$later_source_sha" ]] ||
  fail "atomic ref race moved the pre-existing reserved ref"
grep -Fq -- "api --method POST repos/example/repo/git/refs" "$land_log" ||
  fail "atomic race did not use GitHub's create-only ref API"

# Losing the same create race to an actor that created the exact requested SHA
# is safe to reuse. Hold the shared JSONL lock briefly at the same time to
# exercise coordination with background-hook writers.
print "exact concurrent creation" >>"$land_repo/file.txt"
git -C "$land_repo" add file.txt
git -C "$land_repo" commit -q -m "exact concurrent creation"
exact_race_sha="$(git -C "$land_repo" rev-parse HEAD)"
exact_landing_branch="conductor/land/$exact_race_sha"
rm -f "$label_state"
mkdir "$events_state_dir/events.lock"
(
  sleep 0.1
  rmdir "$events_state_dir/events.lock"
) &
lock_releaser_pid="$!"
exact_race_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$land_log" \
    FAKE_GH_LABEL_STATE_FILE="$label_state" \
    FAKE_HEAD_SHA="$exact_race_sha" \
    FAKE_LANDING_BRANCH="$exact_landing_branch" \
    FAKE_REF_CREATE_RACE=true \
    FAKE_REF_RACE_SHA="$exact_race_sha" \
    "$land_script"
)"
wait "$lock_releaser_pid"
assert_contains "$exact_race_output" "concurrent landing ref creation was already exact; reusing it"
assert_contains "$exact_race_output" "QUEUED repo=example/repo"
[[ "$(remote_ref_sha "$land_bare" "$exact_landing_branch")" == "$exact_race_sha" ]] ||
  fail "exact concurrent landing ref was not reused"
[[ ! -e "$events_state_dir/events.lock" ]] ||
  fail "shared publish event lock remained after concurrent append"

git -C "$land_repo" switch -q -c conductor/land/manual
reserved_output=""
if reserved_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    "$land_script" 2>&1
)"
then
  fail "reserved conductor/land source branch unexpectedly published"
fi
assert_contains "$reserved_output" "reserved conductor/land/* branches"
git -C "$land_repo" switch -q feature

# Divergent source histories are never force-pushed or overwritten.
print "local divergence" >>"$land_repo/file.txt"
git -C "$land_repo" add file.txt
git -C "$land_repo" commit -q -m "local divergence"
local_divergent_sha="$(git -C "$land_repo" rev-parse HEAD)"
worker_repo="$task_tmp/divergence-worker"
git clone -q "$land_bare" "$worker_repo"
configure_identity "$worker_repo"
git -C "$worker_repo" switch -q feature
print "remote divergence" >"$worker_repo/remote.txt"
git -C "$worker_repo" add remote.txt
git -C "$worker_repo" commit -q -m "remote divergence"
remote_divergent_sha="$(git -C "$worker_repo" rev-parse HEAD)"
git -C "$worker_repo" push -q origin feature
divergence_output=""
if divergence_output="$(
  cd "$land_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$land_log" \
    FAKE_HEAD_SHA="$local_divergent_sha" \
    FAKE_LANDING_BRANCH="conductor/land/$local_divergent_sha" \
    "$land_script" 2>&1
)"
then
  fail "conductor-land accepted divergent source histories"
fi
assert_contains "$divergence_output" "local and remote feature have diverged"
[[ "$(remote_ref_sha "$land_bare" feature)" == "$remote_divergent_sha" ]] ||
  fail "divergence handling overwrote the remote source branch"
[[ -z "$(remote_ref_sha "$land_bare" "conductor/land/$local_divergent_sha")" ]] ||
  fail "divergence handling created a landing ref"
git -C "$land_repo" show-ref --verify --quiet \
  "refs/conductor/verified/R_test_example_repo/source/$local_divergent_sha" ||
  fail "verified source ref is not namespaced by immutable repository ID"

# The audit sink is fixed beneath HOME and must be safe before any network
# write can happen.
unsafe_fixture="$(create_land_fixture unsafe)"
unsafe_repo="${unsafe_fixture%%|*}"
unsafe_rest="${unsafe_fixture#*|}"
unsafe_bare="${unsafe_rest%%|*}"
unsafe_head="$(git -C "$unsafe_repo" rev-parse HEAD)"
unsafe_home="$task_tmp/unsafe-home"
outside_state="$task_tmp/outside-state"
mkdir -p "$unsafe_home/.local/state" "$outside_state"
ln -s "$outside_state" "$unsafe_home/.local/state/conductor-publish"
unsafe_audit_output=""
if unsafe_audit_output="$(
  cd "$unsafe_repo"
  HOME="$unsafe_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_HEAD_SHA="$unsafe_head" \
    FAKE_LANDING_BRANCH="conductor/land/$unsafe_head" \
    "$land_script" 2>&1
)"
then
  fail "symlinked publish audit directory unexpectedly accepted"
fi
assert_contains "$unsafe_audit_output" "cannot initialize publish audit log"
[[ -z "$(remote_ref_sha "$unsafe_bare" feature)" ]] ||
  fail "unsafe audit sink allowed a source branch network write"
[[ -z "$(remote_ref_sha "$unsafe_bare" "conductor/land/$unsafe_head")" ]] ||
  fail "unsafe audit sink allowed a landing branch network write"

protected_fixture="$(create_land_fixture protected)"
protected_repo="${protected_fixture%%|*}"
protected_rest="${protected_fixture#*|}"
protected_bare="${protected_rest%%|*}"
mkdir -p "$protected_repo/.github/workflows"
print "name: untrusted" >"$protected_repo/.github/workflows/untrusted.yml"
git -C "$protected_repo" add .github/workflows/untrusted.yml
git -C "$protected_repo" commit -q -m "change trusted automation"
protected_head="$(git -C "$protected_repo" rev-parse HEAD)"
protected_output=""
if protected_output="$(
  cd "$protected_repo"
  HOME="$test_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_HEAD_SHA="$protected_head" \
    FAKE_LANDING_BRANCH="conductor/land/$protected_head" \
    "$land_script" 2>&1
)"
then
  fail "trusted GitHub automation change unexpectedly published"
fi
assert_contains "$protected_output" "trusted GitHub automation changes require manual review"
assert_contains "$protected_output" "Protected path: .github/workflows/untrusted.yml"
[[ -z "$(remote_ref_sha "$protected_bare" feature)" ]] ||
  fail "protected workflow change wrote the source branch"
[[ -z "$(remote_ref_sha "$protected_bare" "conductor/land/$protected_head")" ]] ||
  fail "protected workflow change wrote a landing branch"

blocked_fixture="$(create_land_fixture blocked)"
blocked_repo="${blocked_fixture%%|*}"
blocked_rest="${blocked_fixture#*|}"
blocked_bare="${blocked_rest%%|*}"
blocked_head="$(git -C "$blocked_repo" rev-parse HEAD)"
blocked_landing_branch="conductor/land/$blocked_head"
blocked_home="$task_tmp/blocked-home"
blocked_state="$task_tmp/blocked-label-state"
blocked_queue_state="$task_tmp/blocked-queue-state"
mkdir -p "$blocked_home"
: >"$blocked_state"
blocked_pre_output=""
if blocked_pre_output="$(
  cd "$blocked_repo"
  HOME="$blocked_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_BARE_REPO="$blocked_bare" \
    FAKE_GH_BLOCKED_STATE_FILE="$blocked_state" \
    FAKE_GH_LABEL_STATE_FILE="$blocked_queue_state" \
    FAKE_BLOCKED_REMOVAL_FAIL=true \
    FAKE_HEAD_SHA="$blocked_head" \
    FAKE_LANDING_BRANCH="$blocked_landing_branch" \
    "$land_script" 2>&1
)"
then
  fail "failed conductor-blocked removal still queued the pull request"
fi
assert_contains "$blocked_pre_output" "could not remove conductor-blocked; queueing was refused"
assert_not_contains "$blocked_pre_output" "QUEUED"
[[ -f "$blocked_state" ]] ||
  fail "blocked-removal failure did not preserve the blocked state fixture"

rm -f "$blocked_state" "$blocked_queue_state"
blocked_post_output=""
if blocked_post_output="$(
  cd "$blocked_repo"
  HOME="$blocked_home" \
    PATH="$fake_bin:$real_path" \
    FAKE_BARE_REPO="$blocked_bare" \
    FAKE_GH_BLOCKED_STATE_FILE="$blocked_state" \
    FAKE_GH_LABEL_STATE_FILE="$blocked_queue_state" \
    FAKE_BLOCKED_AFTER_LABEL=true \
    FAKE_HEAD_SHA="$blocked_head" \
    FAKE_LANDING_BRANCH="$blocked_landing_branch" \
    "$land_script" 2>&1
)"
then
  fail "pull request blocked during label mutation still queued"
fi
assert_contains "$blocked_post_output" "pull request changed or became blocked while queueing"
assert_not_contains "$blocked_post_output" "QUEUED"
[[ -f "$blocked_state" && ! -f "$blocked_queue_state" ]] ||
  fail "post-label blocked race was not safely de-queued"

archive_fixture="$(create_archive_fixture)"
archive_repo="${archive_fixture%%|*}"
archive_rest="${archive_fixture#*|}"
archive_local_sha="${archive_rest%%|*}"
archive_rest="${archive_rest#*|}"
archive_pr_head_sha="${archive_rest%%|*}"
archive_merge_sha="${archive_rest#*|}"
export FAKE_ARCHIVE_MERGE_SHA="$archive_merge_sha"
archive_landing_branch="conductor/land/$archive_local_sha"

archive_output="$(
  cd "$archive_repo"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA="$archive_pr_head_sha" \
    "$archive_script"
)"
assert_contains "$archive_output" "local HEAD is contained in verified merged landing pull request"
[[ "$(git -C "$archive_repo" rev-parse HEAD)" == "$archive_local_sha" ]] ||
  fail "archive fixture moved local HEAD"

if (
  cd "$archive_repo"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA="$archive_pr_head_sha" \
    FAKE_ARCHIVE_LABELLED=false \
    FAKE_ARCHIVE_HISTORY_LABELLED=false \
    "$archive_script" >/dev/null 2>&1
); then
  fail "archive guard accepted a merged pull request with no queue-label proof"
fi

historical_archive_output="$(
  cd "$archive_repo"
  : >"$task_tmp/archive-history-gh.log"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_LOG="$task_tmp/archive-history-gh.log" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA="$archive_pr_head_sha" \
    FAKE_ARCHIVE_LABELLED=false \
    FAKE_ARCHIVE_HISTORY_LABELLED=true \
    "$archive_script"
)"
assert_contains "$historical_archive_output" "local HEAD is contained in verified merged landing pull request"
grep -Fq -- "repos/example/repo/issues/42/events?per_page=100" \
  "$task_tmp/archive-history-gh.log" ||
  fail "archive label-history proof was not pinned to the verified repository and PR"

if (
  cd "$archive_repo"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA="$archive_pr_head_sha" \
    FAKE_ARCHIVE_LABELLED=false \
    FAKE_ARCHIVE_HISTORY_ERROR=true \
    "$archive_script" >/dev/null 2>&1
); then
  fail "archive guard failed open when queue-label history was unavailable"
fi

if (
  cd "$archive_repo"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA="$archive_pr_head_sha" \
    FAKE_ARCHIVE_CROSS=true \
    "$archive_script" >/dev/null 2>&1
); then
  fail "archive guard accepted a cross-repository pull request"
fi

if (
  cd "$archive_repo"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA=1111111111111111111111111111111111111111 \
    "$archive_script" >/dev/null 2>&1
); then
  fail "archive guard accepted a mismatched immutable pull ref"
fi

if (
  cd "$archive_repo"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA="$archive_pr_head_sha" \
    FAKE_ARCHIVE_MERGE_SHA="$archive_pr_head_sha" \
    "$archive_script" >/dev/null 2>&1
); then
  fail "archive guard accepted a merged PR whose merge commit is absent from verified default"
fi

print "post-enqueue" >>"$archive_repo/feature.txt"
git -C "$archive_repo" add feature.txt
git -C "$archive_repo" commit -q -m "post-enqueue work"
if (
  cd "$archive_repo"
  PATH="$fake_bin:$real_path" \
    FAKE_GH_MODE=archive \
    FAKE_ARCHIVE_HEAD_REF="$archive_landing_branch" \
    FAKE_PR_HEAD_SHA="$archive_pr_head_sha" \
    "$archive_script" >/dev/null 2>&1
); then
  fail "archive guard accepted a local post-enqueue commit"
fi

grep -Fq -- '--state merged' "$workflow_file" ||
  fail "background cleanup does not scan merged queue items"
grep -Fq -- '--label "conductor-autoland"' "$workflow_file" ||
  fail "background cleanup is not limited to Conductor queue items"
grep -Fq -- '.isCrossRepository == false' "$workflow_file" ||
  fail "background cleanup does not reject fork pull requests"
grep -Fq -- '.baseRefName == $default_branch' "$workflow_file" ||
  fail "background cleanup is not limited to the default branch"
grep -Fq -- '--force-with-lease="refs/heads/$head_ref:$expected_head_sha"' "$workflow_file" ||
  fail "background cleanup does not compare-and-swap the exact merged head"
grep -Fq -- 'object_id_length="${#local_head_sha}"' "$tracked_archive_script" ||
  fail "archive guard does not derive the repository object ID length"
if grep -Fq -- '{40}' "$tracked_archive_script"; then
  fail "archive guard hardcodes SHA-1-only landing refs"
fi

print "PASS: Conductor publishing scripts"
