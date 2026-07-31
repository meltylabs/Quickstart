#!/bin/zsh

set -euo pipefail
export GIT_TERMINAL_PROMPT=0

script_dir="${0:A:h}"
identity_script="$script_dir/conductor-repo-identity.zsh"
full=false
bind_slug=""
requested_remote=""

usage() {
  print "Usage: conductor-status [--full] [--bind OWNER/REPOSITORY --remote NAME]"
  print "Default status is local and fast. --full verifies GitHub, the remote SHA, protection, PR, and checks."
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --full)
      full=true
      shift
      ;;
    --bind)
      [[ "$#" -ge 2 ]] || {
        usage >&2
        exit 2
      }
      bind_slug="$2"
      shift 2
      ;;
    --remote)
      [[ "$#" -ge 2 ]] || {
        usage >&2
        exit 2
      }
      requested_remote="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -n "$bind_slug" && -z "$requested_remote" ]]; then
  print -u2 "conductor-status: --bind requires an explicit --remote NAME"
  exit 2
fi
if [[ -z "$bind_slug" && -n "$requested_remote" ]]; then
  print -u2 "conductor-status: --remote is only valid with --bind"
  exit 2
fi

identity_json=""
typeset -a identity_args
if [[ -n "$bind_slug" ]]; then
  identity_args=(--bind "$bind_slug" --remote "$requested_remote")
  full=true
elif [[ "$full" == "true" ]]; then
  identity_args=()
else
  identity_args=(--local)
fi

print_identity_failure() {
  local identity_message
  local observed_slug
  local observed_repo_id
  local observed_default
  local expected_slug

  identity_message="$(jq -r '.message // "Repository identity verification failed."' <<<"$identity_json" 2>/dev/null || print "Repository identity verification failed.")"
  observed_slug="$(jq -r '.slug // empty' <<<"$identity_json" 2>/dev/null || true)"
  observed_repo_id="$(jq -r '.repo_id // empty | tostring' <<<"$identity_json" 2>/dev/null || true)"
  observed_default="$(jq -r '.default_branch // empty' <<<"$identity_json" 2>/dev/null || true)"
  expected_slug="$(jq -r '.expected_slug // empty' <<<"$identity_json" 2>/dev/null || true)"

  if [[ -n "$observed_slug" ]]; then
    print "TARGET $observed_slug (${observed_repo_id:-unknown}) — UNVERIFIED"
    print "  observed:    https://github.com/$observed_slug.git -> ${observed_default:-unknown}"
    [[ -z "$expected_slug" ]] || print "  expected:    $expected_slug"
  else
    print "TARGET UNVERIFIED"
  fi
  print "  reason:      $identity_message"
}

if ! identity_json="$("$identity_script" "${identity_args[@]}")"; then
  print_identity_failure
  exit 3
fi

if ! jq -e '
  .ok == true and
  (.root | type == "string" and length > 0) and
  (.git_dir | type == "string" and length > 0) and
  (.common_dir | type == "string" and length > 0) and
  (.remote | type == "string" and length > 0) and
  (.fetch_url | type == "string" and length > 0) and
  (.push_url | type == "string" and length > 0) and
  (.canonical_url | type == "string" and length > 0) and
  (.slug | type == "string" and length > 0) and
  ((.repo_id | tostring) | length > 0) and
  (.default_branch | type == "string" and length > 0) and
  (.bound_git_dir | type == "string" and length > 0) and
  (.binding == "verified" or .binding == "unbound")
' >/dev/null <<<"$identity_json"
then
  print "TARGET UNVERIFIED"
  print "  reason:      Repository identity returned an invalid response."
  exit 3
fi

repo_root="$(jq -r '.root' <<<"$identity_json")"
git_dir="$(jq -r '.git_dir' <<<"$identity_json")"
common_dir="$(jq -r '.common_dir' <<<"$identity_json")"
remote="$(jq -r '.remote' <<<"$identity_json")"
fetch_url="$(jq -r '.fetch_url' <<<"$identity_json")"
push_url="$(jq -r '.push_url' <<<"$identity_json")"
slug="$(jq -r '.slug' <<<"$identity_json")"
repo_id="$(jq -r '.repo_id | tostring' <<<"$identity_json")"
canonical_url="$(jq -r '.canonical_url' <<<"$identity_json")"
default_branch="$(jq -r '.default_branch' <<<"$identity_json")"
binding="$(jq -r '.binding' <<<"$identity_json")"
verification="$(jq -r '.verification // "unknown"' <<<"$identity_json")"
bound_git_dir="$(jq -r '.bound_git_dir' <<<"$identity_json")"
github_owner="${slug%%/*}"
github_repository="${slug#*/}"

cd "$repo_root"
actual_git_dir="$(git rev-parse --path-format=absolute --git-dir)"
actual_common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
if [[ "$actual_git_dir" != "$git_dir" || "$bound_git_dir" != "$git_dir" ||
  "$actual_common_dir" != "$common_dir" ]]
then
  print "TARGET $slug ($repo_id) — UNVERIFIED"
  print "  reason:      Identity does not match this exact worktree."
  exit 3
fi

branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
local_sha="$(git rev-parse --verify 'HEAD^{commit}')"
dirty_count="$(git status --porcelain | wc -l | tr -d ' ')"
display_branch="${branch:-DETACHED}"
landing_branch="conductor/land/$local_sha"

hooks_path="$(git config --path core.hooksPath 2>/dev/null || true)"
if [[ -z "$hooks_path" ]]; then
  hooks_path="$(git rev-parse --git-path hooks)"
elif [[ "$hooks_path" != /* ]]; then
  hooks_path="$repo_root/$hooks_path"
fi
hook_file="$hooks_path/post-commit"
expected_hook="$script_dir/git-post-commit-autopush.sh"
hook_ok=false
hook_summary="MISSING $hook_file"
if [[ -x "$hook_file" ]]; then
  if [[ -x "$expected_hook" ]] && cmp -s "$hook_file" "$expected_hook"; then
    hook_ok=true
    hook_summary="VERIFIED $hook_file"
  else
    hook_summary="UNVERIFIED unexpected executable at $hook_file"
  fi
fi

backup_disabled_reason=""
if [[ "${GIT_AUTOPUSH:-1}" == "0" ]]; then
  backup_disabled_reason="GIT_AUTOPUSH=0"
elif [[ -n "$branch" &&
  ("$branch" == "$default_branch" || "$branch" == "main" || "$branch" == "master") ]]
then
  backup_disabled_reason="default branch"
elif [[ "$branch" == conductor/land/* ]]; then
  backup_disabled_reason="reserved conductor/land branch"
fi

state_dir="${HOME:-}/.local/state/conductor-publish"
events_file="$state_dir/events.jsonl"
audit_safe=true
receipt_summary="UNKNOWN no receipt for current HEAD"
receipt_ok=false
receipt_status="none"
pending_max_age_seconds=900
status_now_epoch="$(date -u '+%s' 2>/dev/null || true)"
if [[ -z "${HOME:-}" || "$HOME" != /* || -L "$state_dir" || -L "$events_file" ]]; then
  audit_safe=false
  receipt_summary="UNSAFE audit path"
elif [[ -f "$events_file" ]]; then
  valid_events=""
  while IFS= read -r event_line; do
    normalized_event="$(jq -c 'select(type == "object")' <<<"$event_line" 2>/dev/null || true)"
    [[ -z "$normalized_event" ]] || valid_events+="$normalized_event"$'\n'
  done < <(tail -n 2000 "$events_file")

  current_event="$(
    jq -sc \
      --arg repo_id "$repo_id" \
      --arg git_dir "$git_dir" \
      --arg common_dir "$common_dir" \
      --arg branch "$branch" \
      --arg local_sha "$local_sha" \
      '[
        .[] |
        select(
          (.repo_id | tostring) == $repo_id and
          .git_dir == $git_dir and
          .common_dir == $common_dir and
          .branch == $branch and
          .local_sha == $local_sha
        )
      ] | last // null' \
      <<<"$valid_events"
  )"
  if [[ "$current_event" != "null" ]]; then
    receipt_status="$(jq -r '.status // "unknown"' <<<"$current_event")"
    receipt_timestamp="$(jq -r '.timestamp // "-"' <<<"$current_event")"
    receipt_remote_sha="$(jq -r '.remote_sha // empty' <<<"$current_event")"
    receipt_reason="$(jq -r '.reason // "-"' <<<"$current_event")"
    case "$receipt_status" in
      pending)
        if [[ ! "$status_now_epoch" =~ ^[0-9]+$ ]] ||
          ! jq -e '
            (.timestamp_epoch | type) == "number" and
            .timestamp_epoch == (.timestamp_epoch | floor) and
            .timestamp_epoch >= 0 and
            .timestamp_epoch <= 9999999999
          ' >/dev/null 2>&1 <<<"$current_event"
        then
          receipt_summary="INVALID PENDING current HEAD | missing or invalid timestamp_epoch"
        else
          pending_epoch="$(jq -r '.timestamp_epoch | floor' <<<"$current_event")"
          if (( pending_epoch > status_now_epoch )); then
            receipt_summary="INVALID PENDING current HEAD | future timestamp_epoch"
          else
            pending_age=$(( status_now_epoch - pending_epoch ))
            if (( pending_age > pending_max_age_seconds )); then
              receipt_summary="STALE PENDING current HEAD | age=${pending_age}s exceeds ${pending_max_age_seconds}s"
            else
              receipt_summary="PENDING current HEAD | age=${pending_age}s | $receipt_timestamp | $receipt_reason"
              receipt_ok=true
            fi
          fi
        fi
        ;;
      success)
        if [[ "$receipt_remote_sha" == "$local_sha" ]]; then
          receipt_summary="VERIFIED current HEAD | $receipt_timestamp | exact remote SHA"
          receipt_ok=true
        else
          receipt_summary="INVALID success receipt remote=${receipt_remote_sha:-missing}"
        fi
        ;;
      superseded)
        receipt_summary="SUPERSEDED current HEAD | $receipt_timestamp | remote=$receipt_remote_sha"
        receipt_ok=true
        ;;
      failed)
        receipt_summary="FAILED current HEAD | $receipt_timestamp | $receipt_reason"
        ;;
      skipped)
        receipt_summary="SKIPPED current HEAD | $receipt_timestamp | $receipt_reason"
        ;;
      *)
        receipt_summary="UNKNOWN current HEAD receipt status=$receipt_status"
        ;;
    esac
  fi
fi

if [[ -n "$backup_disabled_reason" ]]; then
  receipt_summary="DISABLED $backup_disabled_reason"
  receipt_ok=true
  receipt_status="disabled"
fi

remote_sha=""
relation="NOT_CHECKED"
remote_lookup_ok=true
protection="NOT_CHECKED"
protection_ok=true
pr_summary="NOT_CHECKED"
pr_integrity_ok=true

if [[ "$full" == "true" ]]; then
  remote_lines=""
  if [[ -z "$branch" ]]; then
    relation="DETACHED"
    remote_lookup_ok=false
  elif ! remote_lines="$(git ls-remote --heads "$push_url" "refs/heads/$branch" 2>/dev/null)"; then
    relation="REMOTE_LOOKUP_FAILED"
    remote_lookup_ok=false
  else
    remote_sha="$(awk 'NR == 1 {print $1}' <<<"$remote_lines")"
    relation="REMOTE_MISSING"
    if [[ -n "$remote_sha" ]]; then
      if [[ "$remote_sha" == "$local_sha" ]]; then
        relation="EXACT"
      elif git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
        if git merge-base --is-ancestor "$remote_sha" "$local_sha"; then
          ahead_count="$(git rev-list --count "$remote_sha..$local_sha")"
          relation="LOCAL_AHEAD_$ahead_count"
        elif git merge-base --is-ancestor "$local_sha" "$remote_sha"; then
          relation="REMOTE_CONTAINS_LOCAL"
        else
          relation="DIVERGED"
          remote_lookup_ok=false
        fi
      else
        relation="UNKNOWN_REMOTE_SHA_NOT_LOCAL"
        remote_lookup_ok=false
      fi
    fi
  fi

  encoded_default_branch="$(jq -rn --arg value "$default_branch" '$value | @uri')"
  protection_json=""
  protection="UNVERIFIED"
  protection_ok=false
  if protection_json="$(
    GH_HOST=github.com gh api \
      "repos/$slug/branches/$encoded_default_branch/protection" 2>/dev/null
  )"; then
    strict="$(jq -r '.required_status_checks.strict // false' <<<"$protection_json")"
    check_count="$(
      jq -r '
        [
          .required_status_checks.checks[]?.context,
          .required_status_checks.contexts[]?
        ] | unique | length
      ' <<<"$protection_json"
    )"
    required_pr="$(jq -r '.required_pull_request_reviews != null' <<<"$protection_json")"
    enforce_admins="$(jq -r '.enforce_admins.enabled // false' <<<"$protection_json")"
    force_pushes="$(jq -r 'if .allow_force_pushes == null then true else .allow_force_pushes.enabled end' <<<"$protection_json")"
    deletions="$(jq -r 'if .allow_deletions == null then true else .allow_deletions.enabled end' <<<"$protection_json")"
    if [[ "$strict" == "true" && "$check_count" -gt 0 &&
      "$required_pr" == "true" && "$enforce_admins" == "true" &&
      "$force_pushes" == "false" && "$deletions" == "false" ]]
    then
      protection_ok=true
      protection="VERIFIED strict_checks=$check_count force_push=off deletion=off admins=on"
    else
      protection="FAILED strict=$strict checks=$check_count pr=$required_pr admins=$enforce_admins force_push=$force_pushes deletion=$deletions"
    fi
  fi

  pr_summary="NONE"
  pr_integrity_ok=true
  if [[ -n "$branch" ]]; then
    pr_json=""
    if pr_json="$(
      GH_HOST=github.com gh pr list \
        --repo "github.com/$slug" \
        --state all \
        --base "$default_branch" \
        --head "$landing_branch" \
        --limit 1 \
        --json number,url,state,headRefOid,baseRefName,headRefName,headRepository,headRepositoryOwner,isCrossRepository,labels,statusCheckRollup,mergeCommit \
        --jq '.[0] // null' 2>/dev/null
    )"; then
      if [[ -n "$pr_json" && "$pr_json" != "null" ]]; then
        pr_number="$(jq -r '.number' <<<"$pr_json")"
        pr_state="$(jq -r '.state' <<<"$pr_json")"
        pr_url="$(jq -r '.url' <<<"$pr_json")"
        pr_labels="$(jq -r '[.labels[]?.name] | join(",")' <<<"$pr_json")"
        pr_head_sha="$(jq -r '.headRefOid // empty' <<<"$pr_json")"
        expected_pr_sha="$local_sha"
        check_summary="$(
          jq -r '
            (.statusCheckRollup // []) as $checks |
            if ($checks | length) == 0 then
              "none"
            else
              [
                $checks[] |
                (.conclusion // .state // .status // "UNKNOWN")
              ] |
              group_by(.) |
              map("\(.[0])=\(length)") |
              join(",")
            end
          ' <<<"$pr_json"
        )"
        if jq -e \
          --arg owner "$github_owner" \
          --arg repository "$github_repository" \
          --arg base "$default_branch" \
          --arg head "$landing_branch" \
          '
            .isCrossRepository == false and
            .baseRefName == $base and
            .headRefName == $head and
            .headRepositoryOwner.login == $owner and
            .headRepository.name == $repository
          ' >/dev/null <<<"$pr_json"
        then
          landing_relation="MISMATCH"
          landing_oid_valid=false
          if jq -ne --arg sha "$pr_head_sha" \
            '$sha | test("^([0-9a-f]{40}|[0-9a-f]{64})$")' >/dev/null
          then
            landing_oid_valid=true
            if [[ "$pr_head_sha" == "$local_sha" ]]; then
              landing_relation="EXACT"
            else
              compare_status="$(
                GH_HOST=github.com gh api \
                  "repos/$slug/compare/$local_sha...$pr_head_sha" \
                  --jq '.status' 2>/dev/null || true
              )"
              if [[ "$compare_status" == "ahead" ]]; then
                landing_relation="RECONCILED_CONTAINS_SOURCE"
              fi
            fi
          fi
          if [[ "$landing_relation" == "MISMATCH" ]]; then
            pr_integrity_ok=false
            if [[ "$landing_oid_valid" == "true" ]]; then
              pr_summary="MISMATCH #$pr_number $pr_state landing=$pr_head_sha does-not-contain=$local_sha $pr_url"
            else
              pr_summary="MISMATCH #$pr_number $pr_state invalid landing commit OID $pr_url"
            fi
          else
            pr_summary="VERIFIED #$pr_number $pr_state landing=$landing_relation head=$pr_head_sha checks=$check_summary labels=${pr_labels:-none} $pr_url"
          fi
        else
          pr_integrity_ok=false
          pr_summary="MISMATCH #$pr_number $pr_state head=${pr_head_sha:-missing} expected=$expected_pr_sha $pr_url"
        fi
      fi
    else
      pr_integrity_ok=false
      pr_summary="UNVERIFIED GitHub pull-request lookup failed"
    fi
  fi
fi

if [[ "$full" == "true" ]]; then
  case "$relation" in
    EXACT)
      ;;
    REMOTE_MISSING|LOCAL_AHEAD_*)
      # A synchronous pending receipt is an explicit durable handoff to the
      # background worker; conductor-land will still perform its own exact
      # non-force verification. Old success/superseded receipts cannot bless a
      # branch that was later deleted or rewound.
      if [[ "$receipt_status" != "pending" ]]; then
        remote_lookup_ok=false
      fi
      ;;
    REMOTE_CONTAINS_LOCAL)
      # The worktree is stale even though no code would be lost by a push.
      # Reconcile before editing or landing.
      remote_lookup_ok=false
      ;;
  esac
fi

if [[ "$full" == "true" && "$relation" == "EXACT" &&
  "$receipt_summary" == "UNKNOWN no receipt for current HEAD" ]]
then
  receipt_summary="UNKNOWN no local receipt; full remote verification is exact"
  receipt_ok=true
fi

workspace_name="${CONDUCTOR_WORKSPACE_NAME:-none}"
workspace_path="${CONDUCTOR_WORKSPACE_PATH:-$repo_root}"
remote_sha_display="not checked"
if [[ "$full" == "true" ]]; then
  remote_sha_display="${remote_sha:-missing}"
fi

print "TARGET $slug ($repo_id)"
print "  binding:     ${(U)binding} ($verification)"
print "  remote:      $remote"
print "  fetch:       $fetch_url"
print "  push:        $push_url"
print "  workspace:   $workspace_name | $workspace_path"
print "  worktree:    $repo_root"
print "  git dir:     $git_dir"
print "  common dir:  $common_dir"
print "  branch:      $display_branch -> $default_branch"
print "  source ref:  $remote/${display_branch}"
print "  landing ref: $landing_branch"
print "  local:       $local_sha"
print "  remote SHA:  $remote_sha_display"
print "  sync:        $relation"
print "  dirty:       $dirty_count path(s)"
print "  protection:  $protection"
print "  pull req:    $pr_summary"
print "  auto backup: $hook_summary"
print "  receipt:     $receipt_summary"
if [[ "$full" != "true" ]]; then
  print "  network:     NOT CHECKED (run conductor-status --full)"
fi

local_ok=true
if [[ "$binding" != "verified" || "$hook_ok" != "true" ||
  "$audit_safe" != "true" || -z "$branch" ]]
then
  local_ok=false
fi
if [[ "$full" == "true" &&
  ("$receipt_ok" != "true" || "$remote_lookup_ok" != "true" ||
    "$protection_ok" != "true" ||
    "$pr_integrity_ok" != "true") ]]
then
  local_ok=false
fi
[[ "$local_ok" == "true" ]] || exit 3
