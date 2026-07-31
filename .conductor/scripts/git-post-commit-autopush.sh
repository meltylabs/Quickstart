#!/bin/bash

# Queue an exact, non-force backup of the commit that triggered this hook.
# Identity and the pending audit receipt are resolved synchronously; only the
# network work runs in the background.

set -u
export GIT_TERMINAL_PROMPT=0

command -v git >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
git_dir="$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)" || exit 0
common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || exit 0
local_sha="$(git rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || exit 0

hook_program="$0"
if [[ -L "$hook_program" ]]; then
  hook_target="$(readlink "$hook_program" 2>/dev/null || true)"
  if [[ -n "$hook_target" ]]; then
    if [[ "$hook_target" != /* ]]; then
      hook_target="$(cd "$(dirname "$hook_program")" 2>/dev/null && pwd -P)/$hook_target"
    fi
    hook_program="$hook_target"
  fi
fi
hook_dir="$(cd "$(dirname "$hook_program")" 2>/dev/null && pwd -P)" || exit 0
identity_command="$hook_dir/conductor-repo-identity.zsh"

notify_failure() {
  local repo_name="$1"
  local failure_reason="$2"

  [[ "$(uname -s 2>/dev/null)" == "Darwin" ]] || return 0
  [[ -x /usr/bin/osascript ]] || return 0
  /usr/bin/osascript - "$repo_name" "$branch" "$failure_reason" >/dev/null 2>&1 <<'APPLESCRIPT'
on run argv
  set repoName to item 1 of argv
  set branchName to item 2 of argv
  set failureReason to item 3 of argv
  display notification (branchName & ": " & failureReason) with title ("Conductor backup failed — " & repoName)
end run
APPLESCRIPT
}

# The receipt location is intentionally not configurable. A repository or
# workspace environment must not be able to redirect the trusted audit trail.
if [[ -z "${HOME:-}" || "$HOME" != /* ]]; then
  notify_failure "repository" "HOME is unavailable; backup was not attempted"
  exit 0
fi
state_parent="$HOME/.local/state"
state_dir="$state_parent/conductor-publish"
event_file="$state_dir/events.jsonl"
event_lock="$state_dir/events.lock"
push_lock=""

path_mode() {
  if [[ "$(uname -s 2>/dev/null)" == "Darwin" ]]; then
    stat -f '%Lp' "$1" 2>/dev/null
  else
    stat -c '%a' "$1" 2>/dev/null
  fi
}

initialize_audit() {
  local component
  local mode

  umask 077
  for component in "$HOME/.local" "$state_parent" "$state_dir" "$event_file"; do
    [[ ! -L "$component" ]] || return 1
  done

  mkdir -p "$state_parent" 2>/dev/null || return 1
  [[ -d "$state_parent" && -w "$state_parent" ]] || return 1

  if [[ ! -e "$state_dir" ]]; then
    mkdir -m 700 "$state_dir" 2>/dev/null || return 1
  fi
  [[ -d "$state_dir" && ! -L "$state_dir" && -O "$state_dir" && -w "$state_dir" ]] ||
    return 1
  chmod 700 "$state_dir" 2>/dev/null || return 1
  mode="$(path_mode "$state_dir")" || return 1
  [[ "$mode" == "700" ]] || return 1

  if [[ ! -e "$event_file" ]]; then
    (set -o noclobber; : >"$event_file") 2>/dev/null || return 1
  fi
  [[ -f "$event_file" && ! -L "$event_file" && -O "$event_file" && -w "$event_file" ]] ||
    return 1
  chmod 600 "$event_file" 2>/dev/null || return 1
  mode="$(path_mode "$event_file")" || return 1
  [[ "$mode" == "600" ]] || return 1
  return 0
}

repo=""
repo_id=""
canonical_url=""
default_branch=""
remote=""
fetch_url=""
push_url=""
operation_id="$$-$(date -u '+%Y%m%dT%H%M%S')-${local_sha}"

event_json() {
  local status="$1"
  local remote_sha="$2"
  local reason="$3"
  local timestamp_epoch

  timestamp_epoch="$(date -u '+%s')" || return 1
  [[ "$timestamp_epoch" =~ ^[0-9]+$ ]] || return 1

  jq -cn \
    --arg timestamp "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --argjson timestamp_epoch "$timestamp_epoch" \
    --arg operation_id "$operation_id" \
    --arg status "$status" \
    --arg repo "$repo" \
    --arg repo_id "$repo_id" \
    --arg canonical_url "$canonical_url" \
    --arg root "$repo_root" \
    --arg git_dir "$git_dir" \
    --arg common_dir "$common_dir" \
    --arg remote "$remote" \
    --arg fetch_url "$fetch_url" \
    --arg push_url "$push_url" \
    --arg default_branch "$default_branch" \
    --arg branch "$branch" \
    --arg local_sha "$local_sha" \
    --arg remote_sha "$remote_sha" \
    --arg reason "$reason" \
    '{
      timestamp: $timestamp,
      timestamp_epoch: $timestamp_epoch,
      event: "backup_push",
      operation_id: $operation_id,
      status: $status,
      repo: $repo,
      repo_id: $repo_id,
      canonical_url: $canonical_url,
      root: $root,
      git_dir: $git_dir,
      common_dir: $common_dir,
      remote: $remote,
      fetch_url: $fetch_url,
      push_url: $push_url,
      default_branch: $default_branch,
      branch: $branch,
      local_sha: $local_sha,
      remote_sha: $remote_sha,
      reason: $reason
    }'
}

append_event() {
  local status="$1"
  local remote_sha="$2"
  local reason="$3"
  local payload
  local attempt=0
  local append_status

  payload="$(event_json "$status" "$remote_sha" "$reason")" || return 1
  jq -e 'type == "object"' >/dev/null 2>&1 <<<"$payload" || return 1

  while ! mkdir "$event_lock" 2>/dev/null; do
    [[ -d "$state_dir" && ! -L "$state_dir" && -f "$event_file" && ! -L "$event_file" ]] ||
      return 1
    attempt=$((attempt + 1))
    [[ "$attempt" -lt 500 ]] || return 1
    sleep 0.01
  done

  append_status=0
  if [[ ! -d "$state_dir" || -L "$state_dir" || ! -O "$state_dir" ||
    ! -f "$event_file" || -L "$event_file" || ! -O "$event_file" ]]
  then
    append_status=1
  elif ! printf '%s\n' "$payload" >>"$event_file"; then
    append_status=1
  elif ! tail -n 1 "$event_file" | jq -e \
    --arg operation_id "$operation_id" \
    --arg status "$status" \
    '.operation_id == $operation_id and .status == $status' >/dev/null 2>&1
  then
    append_status=1
  fi
  rmdir "$event_lock" 2>/dev/null || append_status=1
  return "$append_status"
}

if ! initialize_audit; then
  notify_failure "repository" "secure audit receipt could not be initialized; backup was not attempted"
  exit 0
fi

identity_json="$(
  cd "$repo_root" 2>/dev/null &&
    "$identity_command" --local 2>/dev/null
)"
identity_status=$?

if ! jq -e 'type == "object"' >/dev/null 2>&1 <<<"$identity_json"; then
  append_event "failed" "" "identity_invalid" ||
    notify_failure "repository" "identity and audit receipt both failed"
  notify_failure "repository" "repository identity response was invalid"
  exit 0
fi

binding="$(jq -r '.binding // "error"' <<<"$identity_json")"
repo="$(jq -r '.slug // ""' <<<"$identity_json")"
repo_id="$(jq -r '(.repo_id // "") | tostring' <<<"$identity_json")"
canonical_url="$(jq -r '.canonical_url // ""' <<<"$identity_json")"
default_branch="$(jq -r '.default_branch // ""' <<<"$identity_json")"
remote="$(jq -r '.remote // ""' <<<"$identity_json")"
fetch_url="$(jq -r '.fetch_url // ""' <<<"$identity_json")"
push_url="$(jq -r '.push_url // ""' <<<"$identity_json")"
identity_root="$(jq -r '.root // ""' <<<"$identity_json")"
identity_git_dir="$(jq -r '.git_dir // ""' <<<"$identity_json")"
identity_common_dir="$(jq -r '.common_dir // ""' <<<"$identity_json")"
bound_git_dir="$(jq -r '.bound_git_dir // ""' <<<"$identity_json")"
identity_error="$(jq -r '.error // "repository identity could not be verified"' <<<"$identity_json")"
identity_ok="$(jq -r '.ok // false' <<<"$identity_json")"

if [[ "$binding" == "unbound" || "$identity_error" == "unbound_repository" ||
  "$identity_error" == "stale_worktree_binding" ]]
then
  append_event "skipped" "" "unbound" ||
    notify_failure "${repo:-repository}" "unbound skip receipt could not be written"
  exit 0
fi

if [[ "$identity_status" -ne 0 || "$identity_ok" != "true" || "$binding" != "verified" ]]; then
  append_event "failed" "" "identity_error:$identity_error" ||
    notify_failure "${repo:-repository}" "identity failure receipt could not be written"
  notify_failure "${repo:-repository}" "$identity_error"
  exit 0
fi

if [[ -z "$repo" || -z "$repo_id" || -z "$canonical_url" ||
  -z "$default_branch" || -z "$remote" || -z "$fetch_url" || -z "$push_url" ||
  "$canonical_url" != "https://github.com/${repo}.git" ||
  "$identity_root" != "$repo_root" ||
  "$identity_git_dir" != "$git_dir" ||
  "$bound_git_dir" != "$git_dir" ||
  "$identity_common_dir" != "$common_dir" ]]
then
  append_event "failed" "" "identity_context_mismatch" ||
    notify_failure "${repo:-repository}" "identity mismatch receipt could not be written"
  notify_failure "${repo:-repository}" "repository identity changed before backup"
  exit 0
fi

push_route_hash="$(
  printf '%s\0%s' "$repo_id" "refs/heads/$branch" |
    git hash-object --stdin 2>/dev/null
)"
if [[ ! "$push_route_hash" =~ ^[0-9a-f]{40,64}$ ]]; then
  append_event "failed" "" "push_route_hash_failed" ||
    notify_failure "$repo" "push-route failure receipt could not be written"
  notify_failure "$repo" "backup route could not be locked safely"
  exit 0
fi
push_lock="$state_dir/push-${push_route_hash}.lock"

disabled_reason=""
if [[ "${GIT_AUTOPUSH:-1}" == "0" ]]; then
  disabled_reason="disabled_environment"
elif [[ "$branch" == "$default_branch" || "$branch" == "main" || "$branch" == "master" ]]; then
  disabled_reason="default_branch"
elif [[ "$branch" == conductor/land/* ]]; then
  disabled_reason="reserved_landing_branch"
fi
if [[ -n "$disabled_reason" ]]; then
  append_event "skipped" "" "$disabled_reason" ||
    notify_failure "$repo" "disabled backup receipt could not be written"
  exit 0
fi

for state_path in \
  rebase-merge \
  rebase-apply \
  sequencer \
  MERGE_HEAD \
  CHERRY_PICK_HEAD \
  REVERT_HEAD \
  BISECT_LOG
do
  if [[ -e "$git_dir/$state_path" || -e "$common_dir/$state_path" ]]; then
    append_event "skipped" "" "sequenced_operation" ||
      notify_failure "$repo" "sequenced-operation receipt could not be written"
    exit 0
  fi
done

if ! git --git-dir="$git_dir" cat-file -e "${local_sha}^{commit}" 2>/dev/null; then
  append_event "failed" "" "captured_commit_missing" ||
    notify_failure "$repo" "missing-commit receipt could not be written"
  notify_failure "$repo" "captured commit is no longer available"
  exit 0
fi

# The durable pending receipt is the handoff point. If it cannot be written,
# the network push is deliberately not started.
if ! append_event "pending" "" "queued"; then
  notify_failure "$repo" "pending audit receipt failed; backup was not attempted"
  exit 0
fi

(
  set +e

  push_lock_attempt=0
  while ! mkdir "$push_lock" 2>/dev/null; do
    if [[ ! -d "$state_dir" || -L "$state_dir" ]]; then
      append_event "failed" "" "push_lock_unsafe" ||
        notify_failure "$repo" "push-lock failure receipt could not be written"
      notify_failure "$repo" "secure push lock is unavailable"
      exit 0
    fi
    push_lock_attempt=$((push_lock_attempt + 1))
    if [[ "$push_lock_attempt" -ge 12000 ]]; then
      append_event "failed" "" "push_lock_timeout" ||
        notify_failure "$repo" "push-lock timeout receipt could not be written"
      notify_failure "$repo" "timed out waiting for the background backup queue"
      exit 0
    fi
    sleep 0.05
  done

  # Keep commits fast by doing only local identity work synchronously, then
  # revalidate GitHub's immutable repository ID here immediately before the
  # first network write. A deleted/recreated or redirected slug cannot inherit
  # the cached worktree's publish authority.
  live_identity_json="$(
    cd "$repo_root" 2>/dev/null &&
      "$identity_command" 2>/dev/null
  )"
  live_identity_status=$?
  if [[ "$live_identity_status" -ne 0 ]] ||
    ! jq -e \
      --arg root "$repo_root" \
      --arg git_dir "$git_dir" \
      --arg common_dir "$common_dir" \
      --arg remote "$remote" \
      --arg fetch_url "$fetch_url" \
      --arg push_url "$push_url" \
      --arg canonical_url "$canonical_url" \
      --arg slug "$repo" \
      --arg repo_id "$repo_id" \
      --arg default_branch "$default_branch" \
      '
        .ok == true and
        .verification == "full" and
        .binding == "verified" and
        .root == $root and
        .git_dir == $git_dir and
        .common_dir == $common_dir and
        .remote == $remote and
        .bound_remote == $remote and
        .fetch_url == $fetch_url and
        .push_url == $push_url and
        .canonical_url == $canonical_url and
        .slug == $slug and
        .bound_slug == $slug and
        ((.repo_id | tostring) == $repo_id) and
        ((.bound_repo_id | tostring) == $repo_id) and
        .default_branch == $default_branch and
        .bound_default_branch == $default_branch and
        .bound_git_dir == $git_dir
      ' >/dev/null 2>&1 <<<"$live_identity_json"
  then
    rmdir "$push_lock" 2>/dev/null || true
    append_event "failed" "" "live_identity_mismatch" ||
      notify_failure "$repo" "live-identity failure receipt could not be written"
    notify_failure "$repo" \
      "live immutable repository identity did not match; backup was not attempted"
    exit 0
  fi

  # One push, one immutable source object, one captured destination. There is
  # intentionally no force option, fallback refspec, moving HEAD, or retry.
  git --git-dir="$git_dir" push --quiet "$push_url" \
    "${local_sha}:refs/heads/${branch}" >/dev/null 2>&1
  push_status=$?

  remote_sha="$(
    git --git-dir="$git_dir" ls-remote "$push_url" "refs/heads/${branch}" 2>/dev/null |
      awk 'NR == 1 { print $1 }'
  )"

  final_status="failed"
  final_reason="remote_verification_failed"
  if [[ -n "$remote_sha" && "$remote_sha" == "$local_sha" ]]; then
    final_status="success"
    final_reason="verified_exact"
  elif [[ -n "$remote_sha" ]]; then
    git --git-dir="$git_dir" fetch --quiet --no-tags --no-write-fetch-head \
      "$fetch_url" "refs/heads/${branch}" >/dev/null 2>&1
    if git --git-dir="$git_dir" cat-file -e "${remote_sha}^{commit}" 2>/dev/null &&
      git --git-dir="$git_dir" merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null
    then
      final_status="superseded"
      final_reason="verified_remote_descendant"
    elif [[ "$push_status" -ne 0 ]]; then
      final_reason="push_rejected"
    fi
  elif [[ "$push_status" -ne 0 ]]; then
    final_reason="push_rejected"
  fi

  if ! rmdir "$push_lock" 2>/dev/null; then
    final_status="failed"
    final_reason="push_lock_release_failed"
    notify_failure "$repo" "background backup lock could not be released"
  fi

  if ! append_event "$final_status" "$remote_sha" "$final_reason"; then
    notify_failure "$repo" "backup finished but its final audit receipt could not be written"
    exit 0
  fi
  if [[ "$final_status" == "failed" ]]; then
    notify_failure "$repo" "$final_reason"
  fi
) </dev/null >/dev/null 2>&1 &

exit 0
