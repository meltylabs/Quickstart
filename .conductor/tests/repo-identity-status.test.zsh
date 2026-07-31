#!/bin/zsh

set -euo pipefail
export GIT_AUTOPUSH=0

script_dir="${0:A:h}"
repo_root="${script_dir:h:h}"
identity_script="$repo_root/.conductor/scripts/conductor-repo-identity.zsh"
status_script="$repo_root/.conductor/scripts/conductor-status.zsh"
expected_hook="$repo_root/.conductor/scripts/git-post-commit-autopush.sh"
real_git="$(command -v git)"
real_path="$PATH"
task_tmp="$(mktemp -d)"
fake_bin="$task_tmp/bin"
mkdir -p "$fake_bin"
trap 'rm -rf "$task_tmp"' EXIT

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

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" != *"$needle"* ]] ||
    fail "output unexpectedly contained: $needle"
}

assert_one_json_object() {
  local payload="$1"
  jq -e -s 'length == 1 and (.[0] | type == "object")' \
    >/dev/null <<<"$payload" ||
    fail "identity output was not exactly one JSON object: $payload"
}

capture_identity() {
  local fixture_repo="$1"
  shift
  local stderr_file="$task_tmp/identity.stderr"

  : >"$stderr_file"
  set +e
  CAPTURE_STDOUT="$(
    cd "$fixture_repo"
    PATH="$fake_bin:$real_path" "$identity_script" "$@" 2>"$stderr_file"
  )"
  CAPTURE_STATUS="$?"
  set -e
  CAPTURE_STDERR="$(<"$stderr_file")"
}

capture_status() {
  local fixture_repo="$1"
  shift
  local stderr_file="$task_tmp/status.stderr"

  : >"$stderr_file"
  set +e
  CAPTURE_STDOUT="$(
    cd "$fixture_repo"
    PATH="$fake_bin:$real_path" \
      HOME="$task_tmp/home" \
      GIT_AUTOPUSH="${STATUS_GIT_AUTOPUSH:-1}" \
      CONDUCTOR_PUBLISH_STATE_DIR="$task_tmp/ignored-state-override" \
      "$status_script" "$@" 2>"$stderr_file"
  )"
  CAPTURE_STATUS="$?"
  set -e
  CAPTURE_STDERR="$(<"$stderr_file")"
}

# The fake git delegates every operation except the read-only remote SHA lookup.
{
  print '#!/bin/zsh'
  print 'set -euo pipefail'
  print 'if [[ "${1:-}" == "ls-remote" ]]; then'
  print '  [[ -z "${FAKE_GIT_LOG:-}" ]] || print -r -- "$*" >>"$FAKE_GIT_LOG"'
  print '  [[ "${FAKE_GIT_LS_REMOTE_FAIL:-false}" != "true" ]] || exit 1'
  print '  ref="${@: -1}"'
  print '  [[ -n "${FAKE_REMOTE_SHA:-}" ]] && print -r -- "${FAKE_REMOTE_SHA}"$'"'"'\t'"'"'"$ref"'
  print '  exit 0'
  print 'fi'
  print 'exec "${REAL_GIT:?}" "$@"'
} >"$fake_bin/git"
chmod +x "$fake_bin/git"

# The fake gh fails unless each call explicitly pins github.com.
{
  print '#!/bin/zsh'
  print 'set -euo pipefail'
  print '[[ "${GH_HOST:-}" == "github.com" ]] || { print -u2 "unpinned GH_HOST"; exit 90; }'
  print '[[ -z "${FAKE_GH_LOG:-}" ]] || print -r -- "${GH_HOST}|$*" >>"$FAKE_GH_LOG"'
  print 'slug="${FAKE_SLUG:-example/repo}"'
  print 'repo_id="${FAKE_REPO_ID:-R_TEST_IMMUTABLE}"'
  print 'default_branch="${FAKE_DEFAULT_BRANCH:-main}"'
  print 'case "${1:-} ${2:-}" in'
  print '  "repo view")'
  print '    [[ "${3:-}" == "github.com/$slug" ]] || { print -u2 "wrong repo target"; exit 91; }'
  print '    [[ "${FAKE_GH_REPO_FAIL:-false}" != "true" ]] || exit 1'
  print '    jq -nc --arg id "$repo_id" --arg slug "${FAKE_LIVE_SLUG:-$slug}" --arg default "$default_branch" '"'"'{id:$id,nameWithOwner:$slug,defaultBranchRef:{name:$default}}'"'"
  print '    ;;'
  print '  "api repos/"*)'
  print '    if [[ "${2:-}" == repos/"$slug"/compare/* ]]; then'
  print '      if [[ "${FAKE_PR_MODE:-valid}" == "stale" ]]; then print "diverged"; else print "${FAKE_COMPARE_STATUS:-ahead}"; fi'
  print '    else'
  print '      expected_default="$(jq -rn --arg value "$default_branch" '"'"'$value | @uri'"'"')"'
  print '      [[ "${2:-}" == "repos/$slug/branches/$expected_default/protection" ]] || { print -u2 "wrong protection target: ${2:-}"; exit 92; }'
  print '      print -r -- '"'"'{"required_status_checks":{"strict":true,"checks":[{"context":"Verify"}]},"required_pull_request_reviews":{"required_approving_review_count":1},"enforce_admins":{"enabled":true},"allow_force_pushes":{"enabled":false},"allow_deletions":{"enabled":false}}'"'"
  print '    fi'
  print '    ;;'
  print '  "pr list")'
  print '    [[ "$*" == *"--repo github.com/$slug"* ]] || { print -u2 "wrong pr repo"; exit 93; }'
  print '    [[ "$*" == *"--base $default_branch"* ]] || { print -u2 "wrong pr base"; exit 94; }'
  print '    [[ "${FAKE_PR_MODE:-valid}" != "none" ]] || { print "null"; exit 0; }'
  print '    owner="${slug%%/*}"'
  print '    repository="${slug#*/}"'
  print '    cross=false'
  print '    head_owner="$owner"'
  print '    head_repo="$repository"'
  print '    head_sha="${FAKE_PR_HEAD_SHA:-${FAKE_LOCAL_SHA:-${FAKE_REMOTE_SHA:-}}}"'
  print '    head_branch="conductor/land/${FAKE_LOCAL_SHA:-${FAKE_REMOTE_SHA:-}}"'
  print '    if [[ "${FAKE_PR_MODE:-valid}" == "fork" ]]; then'
  print '      cross=true'
  print '      head_owner="attacker"'
  print '      head_repo="fork"'
  print '    elif [[ "${FAKE_PR_MODE:-valid}" == "stale" ]]; then'
  print '      head_sha="1111111111111111111111111111111111111111"'
  print '    elif [[ "${FAKE_PR_MODE:-valid}" == "invalid-sha" ]]; then'
  print '      head_sha="../../not-a-commit"'
  print '    fi'
  print '    [[ "$*" == *"--head $head_branch"* ]] || { print -u2 "wrong landing head"; exit 96; }'
  print '    jq -nc --arg slug "$slug" --arg owner "$head_owner" --arg repository "$head_repo" --arg base "$default_branch" --arg head "$head_branch" --arg sha "$head_sha" --argjson cross "$cross" '"'"'{number:7,url:("https://github.com/"+$slug+"/pull/7"),state:"OPEN",headRefOid:$sha,baseRefName:$base,headRefName:$head,headRepository:{name:$repository},headRepositoryOwner:{login:$owner},isCrossRepository:$cross,labels:[{name:"conductor-autoland"}],statusCheckRollup:[{conclusion:"SUCCESS"},{status:"IN_PROGRESS"}],mergeCommit:null}'"'"''
  print '    ;;'
  print '  *)'
  print '    print -u2 "unexpected gh invocation: $*"'
  print '    exit 95'
  print '    ;;'
  print 'esac'
} >"$fake_bin/gh"
chmod +x "$fake_bin/gh"

create_fixture() {
  local fixture_repo="$task_tmp/repository"
  local hooks_dir="$task_tmp/hooks"

  mkdir -p "$fixture_repo" "$hooks_dir"
  "$real_git" -C "$fixture_repo" init -q -b feature
  "$real_git" -C "$fixture_repo" config user.name "Conductor Test"
  "$real_git" -C "$fixture_repo" config user.email "conductor-test@example.com"
  "$real_git" -C "$fixture_repo" config core.hooksPath "$hooks_dir"
  print "identity fixture" >"$fixture_repo/file.txt"
  "$real_git" -C "$fixture_repo" add file.txt
  "$real_git" -C "$fixture_repo" commit -q -m "fixture"
  "$real_git" -C "$fixture_repo" remote add origin \
    "https://github.com/${FAKE_SLUG}.git"
  cp "$expected_hook" "$hooks_dir/post-commit"
  chmod +x "$hooks_dir/post-commit"
  print -r -- "$fixture_repo"
}

export REAL_GIT="$real_git"
export FAKE_SLUG="example/repo"
export FAKE_REPO_ID="R_TEST_IMMUTABLE"
export FAKE_DEFAULT_BRANCH="release/v1"
export FAKE_BRANCH="feature"
export FAKE_GH_LOG="$task_tmp/gh.log"
export FAKE_GIT_LOG="$task_tmp/git.log"
: >"$FAKE_GH_LOG"
: >"$FAKE_GIT_LOG"

fixture_repo="$(create_fixture)"
export FAKE_REMOTE_SHA="$("$real_git" -C "$fixture_repo" rev-parse HEAD)"
export FAKE_LOCAL_SHA="$FAKE_REMOTE_SHA"

# Invalid invocation is still exactly one machine-readable object.
capture_identity "$fixture_repo" --invalid
[[ "$CAPTURE_STATUS" -eq 2 ]] || fail "invalid invocation returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.ok == false and .error == "invalid_arguments"' \
  >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "invalid invocation returned the wrong error object"

# A safe unbound repository is visible without mutation, but default verification fails.
capture_identity "$fixture_repo" --allow-unbound --remote origin
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "allow-unbound returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '
  .ok == true and
  .binding == "unbound" and
  .slug == "example/repo" and
  .repo_id == "R_TEST_IMMUTABLE" and
  .default_branch == "release/v1"
' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "allow-unbound returned an invalid identity"
[[ -z "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoId 2>/dev/null || true)" ]] ||
  fail "allow-unbound wrote a repository binding"

capture_identity "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "unbound default verification returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.ok == false and .error == "unbound_repository"' \
  >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "unbound default verification returned the wrong error"

# Explicit binding is exact, durable, and subsequently verifies by immutable ID.
capture_identity "$fixture_repo" --bind "wrong/repo" --remote origin
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "wrong explicit binding returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.error == "binding_target_mismatch"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "wrong explicit binding returned the wrong error"

capture_identity "$fixture_repo" --bind "$FAKE_SLUG" --remote origin
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "explicit binding returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.ok == true and .binding == "verified"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "explicit binding did not verify"
[[ "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoId)" == "$FAKE_REPO_ID" ]] ||
  fail "immutable repository ID was not persisted"
[[ "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoSlug)" == "$FAKE_SLUG" ]] ||
  fail "canonical repository slug was not persisted"

capture_identity "$fixture_repo" --local
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "bound identity returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.binding == "verified"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "bound identity was not verified"

# Fetch and effective push must resolve to one identical GitHub repository.
"$real_git" -C "$fixture_repo" remote set-url --push origin \
  "https://github.com/example/other.git"
capture_identity "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "mismatched push URL returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.error == "remote_mismatch"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "mismatched push URL returned the wrong error"
"$real_git" -C "$fixture_repo" config --unset-all remote.origin.pushurl

# A Git URL rewrite could redirect even an explicit canonical URL, so matching
# fetch or push rewrites are rejected before any publisher can use them.
"$real_git" -C "$fixture_repo" remote set-url origin \
  "git@github.com:$FAKE_SLUG.git"
"$real_git" -C "$fixture_repo" config --local \
  'url.https://attacker.invalid/.pushInsteadOf' \
  "https://github.com/$FAKE_SLUG.git"
capture_identity "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "GitHub URL rewrite returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.error == "github_url_rewrite"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "GitHub URL rewrite returned the wrong error"
"$real_git" -C "$fixture_repo" config --local --remove-section \
  'url.https://attacker.invalid/'
"$real_git" -C "$fixture_repo" remote set-url origin \
  "https://github.com/$FAKE_SLUG.git"

# Credential-like query text is rejected generically and never copied to output.
secret="TOPSECRET_DO_NOT_LOG"
"$real_git" -C "$fixture_repo" remote set-url origin \
  "https://github.com/example/repo?token=$secret"
capture_identity "$fixture_repo" --allow-unbound --remote origin
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "credential-like URL returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.error == "unsafe_remote"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "credential-like URL returned the wrong error"
assert_not_contains "$CAPTURE_STDOUT$CAPTURE_STDERR" "$secret"
"$real_git" -C "$fixture_repo" remote set-url origin \
  "https://github.com/${FAKE_SLUG}.git"

# A changed immutable GitHub ID fails closed even when the slug is unchanged.
export FAKE_REPO_ID="R_REPLACEMENT"
capture_identity "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "immutable ID mismatch returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.error == "binding_mismatch"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "immutable ID mismatch returned the wrong error"
export FAKE_REPO_ID="R_TEST_IMMUTABLE"

# An ambient GH_HOST cannot redirect identity or status away from github.com.
GH_HOST="attacker.invalid" capture_identity "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "pinned GH_HOST identity returned $CAPTURE_STATUS"
assert_one_json_object "$CAPTURE_STDOUT"
if grep -Fq 'attacker.invalid' "$FAKE_GH_LOG"; then
  fail "a GitHub call inherited an untrusted GH_HOST"
fi
if grep -v '^github.com|' "$FAKE_GH_LOG" | grep -q .; then
  fail "a GitHub call was not pinned to github.com"
fi

# Bindings live in config.worktree, not the common repository config. Two
# linked worktrees can therefore select different remotes and immutable GitHub
# IDs without either one changing the other's target.
linked_repo="$task_tmp/linked-repository"
partial_repo="$task_tmp/partial-repository"
fixture_common_config="$(
  "$real_git" -C "$fixture_repo" rev-parse \
    --path-format=absolute --git-common-dir
)/config"
"$real_git" -C "$fixture_repo" remote add secondary \
  "https://github.com/example/second.git"
"$real_git" -C "$fixture_repo" remote add partial \
  "https://github.com/example/partial.git"
"$real_git" -C "$fixture_repo" worktree add -q -b linked-identity \
  "$linked_repo" HEAD
"$real_git" -C "$fixture_repo" worktree add -q -b partial-identity \
  "$partial_repo" HEAD

# Git itself copies config.worktree into a newly added linked worktree. Keep
# that copy in linked_repo to exercise stale-copy detection, while clearing the
# second linked worktree so the shared-local fallback can be tested separately.
for copied_key in \
  conductor.boundGitHubRemote \
  conductor.boundGitHubRepoSlug \
  conductor.boundGitHubRepoId \
  conductor.boundGitHubDefaultBranch \
  conductor.boundGitDir
do
  "$real_git" -C "$partial_repo" config --worktree \
    --unset-all "$copied_key"
done

# Legacy repository-local keys are deliberately ignored; they must never
# become a fallback identity shared by every linked worktree.
"$real_git" config --file "$fixture_common_config" \
  conductor.boundGitHubRemote legacy
"$real_git" config --file "$fixture_common_config" \
  conductor.boundGitHubRepoSlug legacy/shared
"$real_git" config --file "$fixture_common_config" \
  conductor.boundGitHubRepoId R_LEGACY_SHARED
"$real_git" config --file "$fixture_common_config" \
  conductor.boundGitHubDefaultBranch legacy-main

capture_identity "$partial_repo" --local
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "a linked worktree inherited a shared local binding"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.error == "unbound_repository"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "shared local fallback returned the wrong error"

capture_identity "$linked_repo" --local
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "a linked worktree accepted a copied config.worktree binding"
assert_one_json_object "$CAPTURE_STDOUT"
jq -e '.error == "stale_worktree_binding"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "copied config.worktree binding returned the wrong error"

export FAKE_SLUG="example/second"
export FAKE_REPO_ID="R_SECOND_IMMUTABLE"
export FAKE_DEFAULT_BRANCH="trunk"
capture_identity "$linked_repo" --allow-unbound --remote secondary
[[ "$CAPTURE_STATUS" -eq 0 ]] ||
  fail "linked worktree unbound inspection returned $CAPTURE_STATUS"
jq -e '
  .ok == true and
  .binding == "unbound" and
  .verification == "full" and
  .remote == "secondary" and
  .slug == "example/second" and
  .repo_id == "R_SECOND_IMMUTABLE" and
  .default_branch == "trunk"
' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "linked worktree inspection returned the wrong repository identity"

capture_identity "$linked_repo" \
  --bind "$FAKE_SLUG" --remote secondary
[[ "$CAPTURE_STATUS" -eq 0 ]] ||
  fail "linked worktree binding returned $CAPTURE_STATUS"
jq -e '
  .binding == "verified" and
  .bound_remote == "secondary" and
  .bound_slug == "example/second" and
  .bound_repo_id == "R_SECOND_IMMUTABLE" and
  .bound_default_branch == "trunk"
' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "linked worktree binding returned the wrong bound fields"
[[ "$("$real_git" -C "$linked_repo" config --worktree \
  --get conductor.boundGitHubRemote)" == "secondary" ]] ||
  fail "linked worktree remote was not persisted in config.worktree"

# Creation-only means an exact repeat is idempotent, but even the same slug may
# not be rebound after GitHub's immutable ID changes.
capture_identity "$linked_repo" \
  --bind "$FAKE_SLUG" --remote secondary
[[ "$CAPTURE_STATUS" -eq 0 ]] ||
  fail "exact linked worktree rebind was not idempotent"
export FAKE_REPO_ID="R_SECOND_REPLACEMENT"
capture_identity "$linked_repo" \
  --bind "$FAKE_SLUG" --remote secondary
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "same-slug immutable ID replacement was accepted"
jq -e '.error == "binding_mismatch"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "same-slug immutable ID replacement returned the wrong error"
[[ "$("$real_git" -C "$linked_repo" config --worktree \
  --get conductor.boundGitHubRepoId)" == "R_SECOND_IMMUTABLE" ]] ||
  fail "failed rebind changed the linked worktree's immutable repository ID"
[[ "$("$real_git" -C "$linked_repo" config --worktree \
  --get conductor.boundGitHubDefaultBranch)" == "trunk" ]] ||
  fail "failed rebind changed the linked worktree's default branch"
export FAKE_REPO_ID="R_SECOND_IMMUTABLE"

capture_identity "$linked_repo" \
  --bind "$FAKE_SLUG" --remote origin
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "linked worktree accepted a different remote name"
jq -e '.error == "binding_remote_mismatch"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "different bound remote returned the wrong error"
[[ "$("$real_git" -C "$linked_repo" config --worktree \
  --get conductor.boundGitHubRemote)" == "secondary" ]] ||
  fail "failed remote rebind changed the linked worktree binding"

# A partial worktree binding fails closed and is preserved for explicit repair;
# a bind operation must never silently fill or replace it.
"$real_git" -C "$partial_repo" config --worktree \
  conductor.boundGitHubRemote partial
export FAKE_SLUG="example/partial"
export FAKE_REPO_ID="R_PARTIAL"
export FAKE_DEFAULT_BRANCH="main"
capture_identity "$partial_repo" --allow-unbound --remote partial
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "partial worktree binding was accepted"
jq -e '.error == "incomplete_binding"' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "partial worktree binding returned the wrong error"
[[ "$("$real_git" -C "$partial_repo" config --worktree \
  --get conductor.boundGitHubRemote)" == "partial" ]] ||
  fail "partial worktree binding was not preserved"

# The original worktree remains independently bound to its first remote and ID.
export FAKE_SLUG="example/repo"
export FAKE_REPO_ID="R_TEST_IMMUTABLE"
export FAKE_DEFAULT_BRANCH="release/v1"
capture_identity "$fixture_repo" --local
[[ "$CAPTURE_STATUS" -eq 0 ]] ||
  fail "original worktree binding was changed by a linked worktree"
jq -e '
  .verification == "local" and
  .remote == "origin" and
  .slug == "example/repo" and
  .repo_id == "R_TEST_IMMUTABLE" and
  .default_branch == "release/v1"
' >/dev/null <<<"$CAPTURE_STDOUT" ||
  fail "original worktree no longer has its independent identity"

for legacy_key in \
  conductor.boundGitHubRemote \
  conductor.boundGitHubRepoSlug \
  conductor.boundGitHubRepoId \
  conductor.boundGitHubDefaultBranch
do
  "$real_git" config --file "$fixture_common_config" \
    --unset-all "$legacy_key"
done

# Fast status is local-only. It filters the fixed audit by immutable repo ID,
# exact worktree Git directories, branch, and current HEAD while tolerating a
# malformed line and unrelated receipts.
status_state="$task_tmp/home/.local/state/conductor-publish"
status_events="$status_state/events.jsonl"
: >"$FAKE_GH_LOG"
: >"$FAKE_GIT_LOG"
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "fast UNKNOWN status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "receipt:     UNKNOWN no receipt for current HEAD"
assert_contains "$CAPTURE_STDOUT" "network:     NOT CHECKED"
[[ ! -s "$FAKE_GH_LOG" && ! -s "$FAKE_GIT_LOG" ]] ||
  fail "fast UNKNOWN status touched the network"

mkdir -p "$status_state"
fixture_git_dir="$("$real_git" -C "$fixture_repo" rev-parse --path-format=absolute --git-dir)"
fixture_common_dir="$("$real_git" -C "$fixture_repo" rev-parse --path-format=absolute --git-common-dir)"
print -r -- '{"timestamp":"broken"' >"$status_events"
jq -nc \
  --arg sha "$FAKE_REMOTE_SHA" \
  '{
    timestamp:"2026-07-25T20:59:00Z",
    event:"backup_push",
    status:"success",
    repo:"example/repo",
    repo_id:"R_TEST_IMMUTABLE",
    git_dir:"/wrong/worktree/.git",
    common_dir:"/wrong/common.git",
    default_branch:"release/v1",
    branch:"feature",
    local_sha:$sha,
    remote_sha:$sha,
    reason:"decoy"
  }' >>"$status_events"

export FAKE_PR_MODE="valid"
unset FAKE_PR_HEAD_SHA
status_now_epoch="$(date -u '+%s')"

# Missing, stale, and future PENDING epochs remain visible in fast mode but are
# never accepted as a healthy durable handoff by full status.
jq -nc \
  --arg sha "$FAKE_REMOTE_SHA" \
  --arg git_dir "$fixture_git_dir" \
  --arg common_dir "$fixture_common_dir" \
  '{
    timestamp:"2026-07-25T20:59:30Z",
    event:"backup_push",
    status:"pending",
    repo:"example/repo",
    repo_id:"R_TEST_IMMUTABLE",
    git_dir:$git_dir,
    common_dir:$common_dir,
    remote:"origin",
    default_branch:"release/v1",
    branch:"feature",
    local_sha:$sha,
    remote_sha:"",
    reason:"queued"
  }' >>"$status_events"
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "fast missing-epoch PENDING returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "INVALID PENDING current HEAD | missing or invalid timestamp_epoch"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "full missing-epoch PENDING returned $CAPTURE_STATUS"

stale_epoch=$(( status_now_epoch - 901 ))
jq -nc \
  --arg sha "$FAKE_REMOTE_SHA" \
  --arg git_dir "$fixture_git_dir" \
  --arg common_dir "$fixture_common_dir" \
  --argjson epoch "$stale_epoch" \
  '{
    timestamp:"2026-07-25T20:59:31Z",
    timestamp_epoch:$epoch,
    event:"backup_push",
    status:"pending",
    repo:"example/repo",
    repo_id:"R_TEST_IMMUTABLE",
    git_dir:$git_dir,
    common_dir:$common_dir,
    remote:"origin",
    default_branch:"release/v1",
    branch:"feature",
    local_sha:$sha,
    remote_sha:"",
    reason:"queued"
  }' >>"$status_events"
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "fast stale PENDING returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "STALE PENDING current HEAD"
assert_contains "$CAPTURE_STDOUT" "exceeds 900s"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "full stale PENDING returned $CAPTURE_STATUS"

future_epoch=$(( status_now_epoch + 60 ))
jq -nc \
  --arg sha "$FAKE_REMOTE_SHA" \
  --arg git_dir "$fixture_git_dir" \
  --arg common_dir "$fixture_common_dir" \
  --argjson epoch "$future_epoch" \
  '{
    timestamp:"2026-07-25T20:59:32Z",
    timestamp_epoch:$epoch,
    event:"backup_push",
    status:"pending",
    repo:"example/repo",
    repo_id:"R_TEST_IMMUTABLE",
    git_dir:$git_dir,
    common_dir:$common_dir,
    remote:"origin",
    default_branch:"release/v1",
    branch:"feature",
    local_sha:$sha,
    remote_sha:"",
    reason:"queued"
  }' >>"$status_events"
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "fast future PENDING returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "INVALID PENDING current HEAD | future timestamp_epoch"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "full future PENDING returned $CAPTURE_STATUS"

jq -nc \
  --arg sha "$FAKE_REMOTE_SHA" \
  --arg git_dir "$fixture_git_dir" \
  --arg common_dir "$fixture_common_dir" \
  --argjson epoch "$status_now_epoch" \
  '{
    timestamp:"2026-07-25T21:00:00Z",
    timestamp_epoch:$epoch,
    event:"backup_push",
    status:"pending",
    repo:"example/repo",
    repo_id:"R_TEST_IMMUTABLE",
    git_dir:$git_dir,
    common_dir:$common_dir,
    remote:"origin",
    default_branch:"release/v1",
    branch:"feature",
    local_sha:$sha,
    remote_sha:"",
    reason:"queued"
  }' >>"$status_events"

: >"$FAKE_GH_LOG"
: >"$FAKE_GIT_LOG"
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || {
  print -u2 -- "$CAPTURE_STDOUT"
  fail "fast pending status returned $CAPTURE_STATUS"
}
assert_contains "$CAPTURE_STDOUT" "TARGET example/repo (R_TEST_IMMUTABLE)"
assert_contains "$CAPTURE_STDOUT" "binding:     VERIFIED (local)"
assert_contains "$CAPTURE_STDOUT" "remote:      origin"
assert_contains "$CAPTURE_STDOUT" "branch:      feature -> release/v1"
assert_contains "$CAPTURE_STDOUT" "sync:        NOT_CHECKED"
assert_contains "$CAPTURE_STDOUT" "protection:  NOT_CHECKED"
assert_contains "$CAPTURE_STDOUT" "pull req:    NOT_CHECKED"
assert_contains "$CAPTURE_STDOUT" "auto backup: VERIFIED"
assert_contains "$CAPTURE_STDOUT" "receipt:     PENDING current HEAD"
assert_contains "$CAPTURE_STDOUT" "network:     NOT CHECKED"
[[ ! -s "$FAKE_GH_LOG" ]] ||
  fail "default conductor-status made a GitHub API call"
[[ ! -s "$FAKE_GIT_LOG" ]] ||
  fail "default conductor-status queried the network remote"
[[ ! -e "$task_tmp/ignored-state-override" ]] ||
  fail "status honored the untrusted state-directory override"

# A durable PENDING receipt may proceed while the detached worker has not yet
# created the remote branch; conductor-land will still enforce the exact push.
export FAKE_PR_MODE="none"
export FAKE_REMOTE_SHA=""
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 0 ]] ||
  fail "pending full status with missing remote returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "sync:        REMOTE_MISSING"
assert_contains "$CAPTURE_STDOUT" "receipt:     PENDING current HEAD"
export FAKE_REMOTE_SHA="$FAKE_LOCAL_SHA"
export FAKE_PR_MODE="valid"

# A final exact receipt replaces PENDING for current HEAD in fast mode.
jq -nc \
  --arg sha "$FAKE_REMOTE_SHA" \
  --arg git_dir "$fixture_git_dir" \
  --arg common_dir "$fixture_common_dir" \
  '{
    timestamp:"2026-07-25T21:00:01Z",
    event:"backup_push",
    status:"success",
    repo:"example/repo",
    repo_id:"R_TEST_IMMUTABLE",
    git_dir:$git_dir,
    common_dir:$common_dir,
    remote:"origin",
    default_branch:"release/v1",
    branch:"feature",
    local_sha:$sha,
    remote_sha:$sha,
    reason:"verified_exact"
  }' >>"$status_events"
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "fast exact status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "receipt:     VERIFIED current HEAD"

# A historical success receipt cannot bless a branch deleted or rewound after
# that receipt. Full status fails until it is exactly reverified or a new
# pending handoff exists.
export FAKE_PR_MODE="none"
export FAKE_REMOTE_SHA=""
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "old success receipt accepted a now-missing remote branch"
assert_contains "$CAPTURE_STDOUT" "sync:        REMOTE_MISSING"
export FAKE_REMOTE_SHA="$FAKE_LOCAL_SHA"
export FAKE_PR_MODE="valid"

# --full performs network verification and validates the exact same-repository
# PR head, required checks, labels, protection, and encoded default branch.
: >"$FAKE_GH_LOG"
: >"$FAKE_GIT_LOG"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 0 ]] || {
  print -u2 -- "$CAPTURE_STDOUT"
  fail "full verified status returned $CAPTURE_STATUS"
}
assert_contains "$CAPTURE_STDOUT" "binding:     VERIFIED (full)"
assert_contains "$CAPTURE_STDOUT" "sync:        EXACT"
assert_contains "$CAPTURE_STDOUT" "source ref:  origin/feature"
assert_contains "$CAPTURE_STDOUT" "landing ref: conductor/land/$FAKE_LOCAL_SHA"
assert_contains "$CAPTURE_STDOUT" "protection:  VERIFIED"
assert_contains "$CAPTURE_STDOUT" "pull req:    VERIFIED #7 OPEN"
assert_contains "$CAPTURE_STDOUT" "landing=EXACT"
assert_contains "$CAPTURE_STDOUT" "checks=IN_PROGRESS=1,SUCCESS=1"
assert_contains "$CAPTURE_STDOUT" "labels=conductor-autoland"
grep -Fq 'branches/release%2Fv1/protection' "$FAKE_GH_LOG" ||
  fail "default branch was not URL encoded for the protection lookup"
[[ -s "$FAKE_GIT_LOG" ]] ||
  fail "full status did not query the live remote SHA"

# A trusted worker reconciliation may advance the immutable landing ref, but
# full status accepts it only after GitHub proves it contains the source SHA.
fixture_tree="$("$real_git" -C "$fixture_repo" rev-parse 'HEAD^{tree}')"
reconciled_sha="$(
  print "reconciled fixture" |
    "$real_git" -C "$fixture_repo" commit-tree "$fixture_tree" -p "$FAKE_LOCAL_SHA"
)"
export FAKE_PR_HEAD_SHA="$reconciled_sha"
export FAKE_COMPARE_STATUS="ahead"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "reconciled landing status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "landing=RECONCILED_CONTAINS_SOURCE"
unset FAKE_PR_HEAD_SHA FAKE_COMPARE_STATUS

# An invalid PR head OID is rejected before it can enter a compare API path.
export FAKE_PR_MODE="invalid-sha"
: >"$FAKE_GH_LOG"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "invalid PR head status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "pull req:    MISMATCH"
if grep -Fq '/compare/' "$FAKE_GH_LOG"; then
  fail "invalid PR head OID reached the compare API"
fi

# A fork or stale PR with the same branch name is reported as a mismatch.
export FAKE_PR_MODE="fork"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "fork PR status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "pull req:    MISMATCH"

export FAKE_PR_MODE="stale"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "stale PR status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "pull req:    MISMATCH"

# Full status hard-fails an unknown remote commit and a proven divergence.
export FAKE_PR_MODE="none"
export FAKE_REMOTE_SHA="2222222222222222222222222222222222222222"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "unknown remote SHA status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "sync:        UNKNOWN_REMOTE_SHA_NOT_LOCAL"

diverged_sha="$(
  print "diverged fixture" |
    "$real_git" -C "$fixture_repo" commit-tree "$fixture_tree"
)"
export FAKE_REMOTE_SHA="$diverged_sha"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "diverged status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "sync:        DIVERGED"

# A remote descendant means this worktree is stale and must reconcile even
# though a non-force push would not erase the remote commit.
remote_descendant="$(
  print "remote descendant" |
    "$real_git" -C "$fixture_repo" commit-tree "$fixture_tree" -p "$FAKE_LOCAL_SHA"
)"
export FAKE_REMOTE_SHA="$remote_descendant"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "remote-descendant status did not require reconciliation"
assert_contains "$CAPTURE_STDOUT" "sync:        REMOTE_CONTAINS_LOCAL"

# Immediately after installation there may be no local receipt yet. A full
# exact remote verification is truthful and healthy without inventing one.
export FAKE_REMOTE_SHA="$FAKE_LOCAL_SHA"
"$real_git" -C "$fixture_repo" switch -q -c fresh-status
export FAKE_PR_MODE="valid"
capture_status "$fixture_repo" --full
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "exact full status without receipt returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "receipt:     UNKNOWN no local receipt; full remote verification is exact"

# Intentional disablement is explicit on the default branch and via the
# environment, without requiring a misleading success receipt.
export FAKE_REMOTE_SHA="$("$real_git" -C "$fixture_repo" rev-parse feature)"
"$real_git" -C "$fixture_repo" branch "release/v1" feature
"$real_git" -C "$fixture_repo" switch -q "release/v1"
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "default-branch disabled status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "receipt:     DISABLED default branch"

"$real_git" -C "$fixture_repo" switch -q feature
export STATUS_GIT_AUTOPUSH=0
capture_status "$fixture_repo"
unset STATUS_GIT_AUTOPUSH
[[ "$CAPTURE_STATUS" -eq 0 ]] || fail "environment-disabled status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "receipt:     DISABLED GIT_AUTOPUSH=0"

# Detached HEAD is loud and can never return a healthy status.
"$real_git" -C "$fixture_repo" switch -q --detach
capture_status "$fixture_repo"
[[ "$CAPTURE_STATUS" -eq 3 ]] || fail "detached status returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "branch:      DETACHED -> release/v1"

print "PASS: Conductor repository identity and status"
