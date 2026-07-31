#!/bin/zsh

set -euo pipefail
export GIT_AUTOPUSH=0
export GIT_TERMINAL_PROMPT=0

for required_command in git jq; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    print -u2 "GitHub sync: missing required command: $required_command"
    exit 2
  fi
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print -u2 "GitHub sync: run this inside a Git worktree."
  exit 2
fi

script_dir="${0:A:h}"
identity_command="$script_dir/conductor-repo-identity.zsh"
if [[ ! -x "$identity_command" ]]; then
  print -u2 "GitHub sync: repository identity command is missing: $identity_command"
  exit 3
fi

identity_json=""
if ! identity_json="$("$identity_command")"; then
  identity_error="$(jq -r '.error // "identity_error"' <<<"$identity_json" 2>/dev/null || print "identity_error")"
  identity_message="$(jq -r '.message // "Repository identity verification failed."' <<<"$identity_json" 2>/dev/null || print "Repository identity verification failed.")"
  print -u2 "GitHub sync: $identity_message"
  if [[ "$identity_error" == "unbound_repository" ||
    "$identity_error" == "stale_worktree_binding" ||
    "$identity_error" == "unbound_worktree" ||
    "$identity_error" == "worktree_config_disabled" ]]
  then
    print -u2 "GitHub sync: this new/unbound workspace was left unchanged."
    print -u2 "Choose its target with: conductor-status --bind OWNER/REPOSITORY --remote REMOTE"
    exit 0
  fi
  exit 3
fi

if ! jq -e '
  .ok == true and
  .verification == "full" and
  .binding == "verified" and
  .bound_slug == .slug and
  .bound_repo_id == .repo_id and
  .bound_remote == .remote and
  .bound_default_branch == .default_branch and
  .bound_git_dir == .git_dir and
  (.root | type == "string" and length > 0) and
  (.git_dir | type == "string" and length > 0) and
  (.common_dir | type == "string" and length > 0) and
  (.fetch_url | type == "string" and length > 0) and
  (.slug | type == "string" and length > 0) and
  (.repo_id | type == "string" and length > 0) and
  (.remote | type == "string" and length > 0) and
  (.default_branch | type == "string" and length > 0)
' >/dev/null <<<"$identity_json"
then
  print -u2 "GitHub sync: repository identity is incomplete or not fully verified."
  exit 3
fi

workspace_root="$(jq -r '.root' <<<"$identity_json")"
workspace_git_dir="$(jq -r '.git_dir' <<<"$identity_json")"
workspace_common_dir="$(jq -r '.common_dir' <<<"$identity_json")"
fetch_url="$(jq -r '.fetch_url' <<<"$identity_json")"
github_slug="$(jq -r '.slug' <<<"$identity_json")"
github_repo_id="$(jq -r '.repo_id' <<<"$identity_json")"
remote_name="$(jq -r '.remote' <<<"$identity_json")"
default_branch="$(jq -r '.default_branch' <<<"$identity_json")"
canonical_ref="refs/remotes/conductor-canonical/$github_repo_id/$default_branch"
if ! git check-ref-format "$canonical_ref" >/dev/null 2>&1; then
  print -u2 "GitHub sync: repository identity cannot form a safe verification ref."
  exit 3
fi

assert_live_identity() {
  local live_identity_json

  if ! live_identity_json="$("$identity_command" 2>/dev/null)"; then
    return 1
  fi
  jq -e \
    --arg root "$workspace_root" \
    --arg git_dir "$workspace_git_dir" \
    --arg common_dir "$workspace_common_dir" \
    --arg fetch_url "$fetch_url" \
    --arg slug "$github_slug" \
    --arg repo_id "$github_repo_id" \
    --arg remote "$remote_name" \
    --arg default_branch "$default_branch" \
    '
      .ok == true and
      .verification == "full" and
      .binding == "verified" and
      .root == $root and
      .git_dir == $git_dir and
      .common_dir == $common_dir and
      .fetch_url == $fetch_url and
      .remote == $remote and
      .bound_remote == $remote and
      .slug == $slug and
      .bound_slug == $slug and
      .repo_id == $repo_id and
      .bound_repo_id == $repo_id and
      .default_branch == $default_branch and
      .bound_default_branch == $default_branch and
      .bound_git_dir == $git_dir
    ' >/dev/null 2>&1 <<<"$live_identity_json"
}

cd "$workspace_root"
actual_root="$(git rev-parse --show-toplevel)"
actual_git_dir="$(git rev-parse --path-format=absolute --git-dir)"
actual_common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
if [[ "$actual_root" != "$workspace_root" ||
  "$actual_git_dir" != "$workspace_git_dir" ||
  "$actual_common_dir" != "$workspace_common_dir" ]]
then
  print -u2 "GitHub sync: verified identity does not match this worktree."
  exit 3
fi

workspace_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [[ -z "$workspace_branch" ]]; then
  print -u2 "GitHub sync: detached workspace HEAD cannot be synchronized safely."
  exit 3
fi
if [[ -n "$(git status --porcelain)" ]]; then
  print -u2 "GitHub sync: workspace has uncommitted work and was not fetched or moved."
  git status --short >&2
  exit 3
fi
expected_head="$(git rev-parse HEAD)"

print
print "======================================================================="
print "CONDUCTOR GITHUB SYNC TARGET — VERIFIED"
print "Repository:              $github_slug"
print "Immutable repository ID: $github_repo_id"
print "Bound remote:            $remote_name"
print "Verified fetch URL:      $fetch_url"
print "Git common directory:    $workspace_common_dir"
print "Workspace root:          $workspace_root"
print "Workspace branch:        $workspace_branch -> $default_branch"
if [[ -n "${CONDUCTOR_ROOT_PATH:-}" ]]; then
  print "Canonical root:          ${CONDUCTOR_ROOT_PATH} (not moved by workspace setup)"
fi
print "======================================================================="
print

git fetch \
  --no-tags \
  --prune \
  "$fetch_url" \
  "+refs/heads/$default_branch:$canonical_ref"

if ! git show-ref --verify --quiet "$canonical_ref"; then
  print -u2 "GitHub sync: verified default branch was not fetched: $default_branch"
  exit 3
fi
canonical_sha="$(git rev-parse "$canonical_ref")"
if [[ ! "$canonical_sha" =~ '^[0-9a-f]{40,64}$' ]] ||
  ! git cat-file -e "$canonical_sha^{commit}" 2>/dev/null
then
  print -u2 "GitHub sync: fetched default branch has an invalid commit."
  exit 3
fi
# Fetching may update only the repository-ID-scoped verification ref. The
# worktree cannot move until the live GitHub node ID, URL, remote, default
# branch, and exact Git directory are all re-attested after that fetch.
if ! assert_live_identity; then
  print -u2 \
    "GitHub sync: live immutable repository identity changed during fetch."
  print -u2 "GitHub sync: the workspace was left at $expected_head."
  exit 3
fi
if [[ "$(git rev-parse HEAD)" != "$expected_head" ||
  -n "$(git status --porcelain)" ]]
then
  print -u2 "GitHub sync: workspace changed during fetch and was not moved."
  exit 3
fi

if git merge-base --is-ancestor "$expected_head" "$canonical_sha"; then
  if [[ "$expected_head" != "$canonical_sha" ]]; then
    git merge --ff-only "$canonical_sha"
    [[ "$(git rev-parse HEAD)" == "$canonical_sha" ]] ||
      {
        print -u2 "GitHub sync: fast-forward verification failed."
        exit 3
      }
  fi
elif git merge-base --is-ancestor "$canonical_sha" "$expected_head"; then
  print "GitHub sync: workspace already contains verified $default_branch."
else
  print -u2 "GitHub sync: $workspace_branch diverges from verified $github_slug:$default_branch."
  print -u2 "Reconcile both histories explicitly before editing."
  exit 3
fi
