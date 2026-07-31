#!/bin/zsh

set -euo pipefail
export GH_HOST=github.com
export GIT_TERMINAL_PROMPT=0

wait_for_merge=false
case "${1:-}" in
  "")
    ;;
  --wait)
    wait_for_merge=true
    ;;
  -h|--help)
    cat <<'HELP'
Usage: conductor-land [--wait]

Verify the repository's immutable GitHub identity and default-branch safety
policy, print the exact publish target, back up the clean source branch at its
exact SHA, and enqueue only a reserved conductor/land/<SHA> pull request for
serialized background landing.
The default command returns as soon as GitHub owns the durable queue item.

Use --wait only when the caller explicitly needs to remain attached until the
pull request is merged and verified on GitHub's default branch.

Publish receipts are appended as JSONL to
~/.local/state/conductor-publish/events.jsonl by default.
HELP
    exit 0
    ;;
  *)
    print -u2 "conductor-land: accepted arguments: --wait, --help"
    exit 2
    ;;
esac

if [[ "$#" -gt 1 ]]; then
  print -u2 "conductor-land: accepted arguments: --wait, --help"
  exit 2
fi

for required_command in git gh jq; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    print -u2 "conductor-land: missing required command: $required_command"
    exit 2
  fi
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print -u2 "conductor-land: run this inside a Git worktree"
  exit 2
fi

script_dir="${0:A:h}"
identity_command="$script_dir/conductor-repo-identity.zsh"
if [[ ! -x "$identity_command" ]]; then
  print -u2 "conductor-land: repository identity command is missing or not executable: $identity_command"
  exit 3
fi

identity_json=""
if ! identity_json="$("$identity_command")"; then
  print -u2 "conductor-land: repository identity verification failed"
  if [[ -n "$identity_json" ]]; then
    print -r -u2 -- "$identity_json"
  fi
  exit 3
fi
if ! jq -e '
  type == "object" and
  .ok == true and
  (.root | type == "string" and length > 0) and
  (.git_dir | type == "string" and length > 0) and
  (.common_dir | type == "string" and length > 0) and
  (.remote | type == "string" and length > 0) and
  (.fetch_url | type == "string" and length > 0) and
  (.push_url | type == "string" and length > 0) and
  (.canonical_url | type == "string" and length > 0) and
  (.slug | type == "string" and length > 0) and
  (.repo_id | type == "string" and length > 0) and
  (.default_branch | type == "string" and length > 0) and
  .binding == "verified" and
  (.bound_slug | type == "string" and length > 0) and
  (.bound_repo_id | type == "string" and length > 0) and
  (.bound_remote | type == "string" and length > 0) and
  (.bound_default_branch | type == "string" and length > 0) and
  (.bound_git_dir | type == "string" and length > 0) and
  .bound_slug == .slug and
  .bound_repo_id == .repo_id and
  .bound_remote == .remote and
  .bound_default_branch == .default_branch and
  .bound_git_dir == .git_dir and
  .canonical_url == ("https://github.com/" + .slug + ".git")
' >/dev/null <<<"$identity_json"
then
  print -u2 "conductor-land: repository identity response is incomplete or not verified"
  exit 3
fi

repo_root="$(jq -r '.root' <<<"$identity_json")"
git_dir="$(jq -r '.git_dir' <<<"$identity_json")"
git_common_dir="$(jq -r '.common_dir' <<<"$identity_json")"
bound_remote="$(jq -r '.remote' <<<"$identity_json")"
fetch_url="$(jq -r '.fetch_url' <<<"$identity_json")"
push_url="$(jq -r '.push_url' <<<"$identity_json")"
canonical_url="$(jq -r '.canonical_url' <<<"$identity_json")"
github_slug="$(jq -r '.slug' <<<"$identity_json")"
github_repo_id="$(jq -r '.repo_id' <<<"$identity_json")"
default_branch="$(jq -r '.default_branch' <<<"$identity_json")"
github_owner="${github_slug%%/*}"
github_repository="${github_slug#*/}"

# GitHub slugs and Git URLs are names, not immutable identities. Re-run the
# complete binding check immediately before every external mutation so a
# rename, delete/recreate, URL rewrite, or remote edit cannot silently inherit
# this worktree's publish authority.
assert_live_identity() {
  local live_identity_json

  if ! live_identity_json="$("$identity_command" 2>/dev/null)"; then
    return 1
  fi
  jq -e \
    --arg root "$repo_root" \
    --arg git_dir "$git_dir" \
    --arg common_dir "$git_common_dir" \
    --arg remote "$bound_remote" \
    --arg fetch_url "$fetch_url" \
    --arg push_url "$push_url" \
    --arg canonical_url "$canonical_url" \
    --arg slug "$github_slug" \
    --arg repo_id "$github_repo_id" \
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
      .repo_id == $repo_id and
      .bound_repo_id == $repo_id and
      .default_branch == $default_branch and
      .bound_default_branch == $default_branch and
      .bound_git_dir == $git_dir
    ' >/dev/null 2>&1 <<<"$live_identity_json"
}

cd "$repo_root"
actual_repo_root="$(git rev-parse --show-toplevel)"
actual_git_dir="$(git rev-parse --path-format=absolute --git-dir)"
actual_common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
if [[ "$actual_repo_root" != "$repo_root" ||
  "$actual_git_dir" != "$git_dir" ||
  "$actual_common_dir" != "$git_common_dir" ]]
then
  print -u2 "conductor-land: verified repository identity does not match the current Git context"
  exit 3
fi

if [[ -n "$(git status --porcelain)" ]]; then
  print -u2 "conductor-land: uncommitted work remains"
  git status --short >&2
  exit 2
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  print -u2 "conductor-land: detached HEAD is not publishable"
  exit 2
fi
if ! git check-ref-format "refs/heads/$branch" >/dev/null; then
  print -u2 "conductor-land: current branch is not a valid publishable branch"
  exit 2
fi
if [[ "$branch" == conductor/land/* ]]; then
  print -u2 "conductor-land: reserved conductor/land/* branches cannot be used as source branches"
  exit 2
fi

if [[ "$branch" == "$default_branch" || "$branch" == "main" || "$branch" == "master" ]]; then
  print -u2 "conductor-land: use a unique feature branch, not $branch"
  exit 2
fi

permission="$(gh repo view "$github_slug" --json viewerPermission --jq .viewerPermission)"
if [[ "$permission" != "ADMIN" && "$permission" != "MAINTAIN" && "$permission" != "WRITE" ]]; then
  print -u2 "conductor-land: GitHub permission for $github_slug is $permission, not writable"
  exit 2
fi

workflow_state="$(
  gh api \
    "repos/$github_slug/actions/workflows/conductor-autoland.yml" \
    --jq '.state' 2>/dev/null || true
)"
if [[ "$workflow_state" != "active" ]]; then
  print -u2 "conductor-land: $github_slug does not have an active Conductor autoland worker"
  print -u2 "Install .github/workflows/conductor-autoland.yml and its repo-scoped deploy key first."
  exit 3
fi

encoded_default_branch="$(jq -rn --arg value "$default_branch" '$value | @uri')"
protection_json=""
if ! protection_json="$(
  gh api "repos/$github_slug/branches/$encoded_default_branch/protection"
)"; then
  print -u2 "conductor-land: cannot verify branch protection for $github_slug:$default_branch"
  exit 3
fi
if ! jq -e '
  (.required_status_checks.strict == true) and
  (
    ((.required_status_checks.checks // []) | length) +
    ((.required_status_checks.contexts // []) | length) >= 1
  ) and
  (.required_pull_request_reviews != null) and
  (.enforce_admins.enabled == true) and
  (.allow_force_pushes.enabled == false) and
  (.allow_deletions.enabled == false)
' >/dev/null <<<"$protection_json"
then
  print -u2 "conductor-land: unsafe or incomplete protection on $github_slug:$default_branch"
  print -u2 "Required: strict checks (at least one), pull-request reviews, admin enforcement,"
  print -u2 "and both force pushes and branch deletion disabled."
  exit 3
fi
required_check_count="$(
  jq '
    ((.required_status_checks.checks // []) | length) +
    ((.required_status_checks.contexts // []) | length)
  ' <<<"$protection_json"
)"

for required_label in conductor-autoland conductor-blocked; do
  if ! gh api "repos/$github_slug/labels/$required_label" >/dev/null 2>&1; then
    print -u2 \
      "conductor-land: required repository label is missing: $required_label"
    print -u2 "Bootstrap the trusted repository worker before publishing."
    exit 3
  fi
done

source_branch="$branch"
source_sha="$(git rev-parse HEAD)"
verified_ref_namespace="refs/conductor/verified/$github_repo_id"
if ! git check-ref-format "$verified_ref_namespace/probe" >/dev/null; then
  print -u2 "conductor-land: immutable repository ID cannot form a safe verification namespace"
  exit 3
fi
verified_default_ref="$verified_ref_namespace/default/$source_sha"
git fetch --quiet --no-tags "$fetch_url" \
  "+refs/heads/$default_branch:$verified_default_ref"
canonical_ref="$verified_default_ref"
if ! git show-ref --verify --quiet "$canonical_ref"; then
  print -u2 "conductor-land: verified default branch $default_branch does not exist"
  exit 2
fi
verified_default_sha="$(git rev-parse "$canonical_ref^{commit}")"
if [[ "${#verified_default_sha}" -ne "${#source_sha}" ||
  "$verified_default_sha" == *[^0-9a-f]* ]]
then
  print -u2 "conductor-land: verified default branch returned an invalid commit ID"
  exit 3
fi
if ! git merge-base "$verified_default_sha" "$source_sha" >/dev/null 2>&1; then
  print -u2 "conductor-land: this branch has no common history with $default_branch"
  exit 3
fi

unique_commits="$(git rev-list --count "$verified_default_sha..$source_sha")"
if [[ "$unique_commits" == "0" ]]; then
  print "conductor-land: no commits remain outside $default_branch"
  exit 0
fi

if ! git merge-base --is-ancestor "$verified_default_sha" "$source_sha"; then
  print "conductor-land: $default_branch advanced; GitHub will reconcile it in the background."
fi

protected_change=""
while IFS= read -r -d '' changed_file; do
  case "$changed_file" in
    .github/CODEOWNERS|.github/actions/*|.github/workflows/*)
      protected_change="$changed_file"
      break
      ;;
  esac
done < <(git diff --no-renames --name-only -z "$verified_default_sha...$source_sha")
if [[ -n "$protected_change" ]]; then
  print -u2 "conductor-land: trusted GitHub automation changes require manual review"
  print -u2 "Protected path: $protected_change"
  print -u2 "No source or landing ref was written."
  exit 3
fi

landing_branch="conductor/land/$source_sha"
landing_sha=""

if [[ -z "${HOME:-}" || "$HOME" != /* || "$HOME" == "/" ]]; then
  print -u2 "conductor-land: HOME must be an absolute, non-root directory"
  exit 3
fi
publish_state_dir="$HOME/.local/state/conductor-publish"
events_file="$publish_state_dir/events.jsonl"
events_lock="$publish_state_dir/events.lock"
publish_local_dir="$HOME/.local"
publish_state_parent="$publish_local_dir/state"

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
  for component in \
    "$publish_local_dir" \
    "$publish_state_parent" \
    "$publish_state_dir" \
    "$events_file" \
    "$events_lock"
  do
    [[ ! -L "$component" ]] || return 1
  done

  mkdir -p -- "$publish_state_parent" 2>/dev/null || return 1
  [[ -d "$publish_state_parent" && -w "$publish_state_parent" ]] || return 1

  if [[ ! -e "$publish_state_dir" ]]; then
    mkdir -m 700 "$publish_state_dir" 2>/dev/null || return 1
  fi
  [[ -d "$publish_state_dir" && ! -L "$publish_state_dir" &&
    -O "$publish_state_dir" && -w "$publish_state_dir" ]] || return 1
  chmod 700 "$publish_state_dir" 2>/dev/null || return 1
  mode="$(path_mode "$publish_state_dir")" || return 1
  [[ "$mode" == "700" ]] || return 1

  if [[ ! -e "$events_file" ]]; then
    (set -o noclobber; : >"$events_file") 2>/dev/null || return 1
  fi
  [[ -f "$events_file" && ! -L "$events_file" &&
    -O "$events_file" && -w "$events_file" ]] || return 1
  chmod 600 "$events_file" 2>/dev/null || return 1
  mode="$(path_mode "$events_file")" || return 1
  [[ "$mode" == "600" ]] || return 1
}

if ! initialize_audit; then
  print -u2 "conductor-land: cannot initialize publish audit log: $events_file"
  exit 3
fi

publish_operation_id="land-$$-$(date -u +'%Y%m%dT%H%M%S')-$source_sha"

append_publish_event() {
  local event="$1"
  local event_pr_url="${2:-}"
  local event_reason="${3:-}"
  local event_remote_sha="${4:-}"
  local event_status="${5:-success}"
  local event_json
  local attempt=0
  local append_status=0
  local mode

  case "$event_status" in
    pending|success|failed)
      ;;
    *)
      return 1
      ;;
  esac

  event_json="$(
    jq -cn \
      --arg timestamp "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      --argjson timestamp_epoch "$(date +%s)" \
      --arg operation_id "$publish_operation_id" \
      --arg event "$event" \
      --arg status "$event_status" \
      --arg repo "$github_slug" \
      --arg repo_id "$github_repo_id" \
      --arg canonical_url "$canonical_url" \
      --arg git_dir "$git_dir" \
      --arg common_dir "$git_common_dir" \
      --arg root "$repo_root" \
      --arg remote "$bound_remote" \
      --arg fetch_url "$fetch_url" \
      --arg push_url "$push_url" \
      --arg default_branch "$default_branch" \
      --arg branch "$source_branch" \
      --arg local_sha "$source_sha" \
      --arg remote_sha "$event_remote_sha" \
      --arg source_branch "$source_branch" \
      --arg source_sha "$source_sha" \
      --arg landing_branch "$landing_branch" \
      --arg landing_sha "$landing_sha" \
      --arg pr "$event_pr_url" \
      --arg reason "$event_reason" \
      '{
        timestamp: $timestamp,
        timestamp_epoch: $timestamp_epoch,
        operation_id: $operation_id,
        event: $event,
        status: $status,
        repo: $repo,
        repo_id: $repo_id,
        canonical_url: $canonical_url,
        git_dir: $git_dir,
        common_dir: $common_dir,
        root: $root,
        remote: $remote,
        fetch_url: $fetch_url,
        push_url: $push_url,
        default_branch: $default_branch,
        branch: $branch,
        local_sha: $local_sha,
        remote_sha: $remote_sha,
        source_branch: $source_branch,
        source_sha: $source_sha,
        landing_branch: $landing_branch,
        landing_sha: $landing_sha
      }
      + if $pr == "" then {} else {pr: $pr} end
      + if $reason == "" then {} else {reason: $reason} end'
  )" || return 1
  jq -e 'type == "object"' >/dev/null 2>&1 <<<"$event_json" || return 1

  while ! mkdir "$events_lock" 2>/dev/null; do
    [[ -d "$publish_state_dir" && ! -L "$publish_state_dir" &&
      -O "$publish_state_dir" &&
      -f "$events_file" && ! -L "$events_file" && -O "$events_file" ]] ||
      return 1
    if [[ -e "$events_lock" &&
      ( ! -d "$events_lock" || -L "$events_lock" || ! -O "$events_lock" ) ]]
    then
      return 1
    fi
    (( attempt += 1 ))
    (( attempt < 500 )) || return 1
    sleep 0.01
  done

  mode="$(path_mode "$publish_state_dir" 2>/dev/null || true)"
  [[ "$mode" == "700" ]] || append_status=1
  mode="$(path_mode "$events_file" 2>/dev/null || true)"
  [[ "$mode" == "600" ]] || append_status=1
  if [[ "$append_status" == "0" ]] &&
    ! print -r -- "$event_json" >>"$events_file"
  then
    append_status=1
  fi
  if [[ "$append_status" == "0" ]] &&
    ! tail -n 1 "$events_file" |
      jq -e \
        --arg operation_id "$publish_operation_id" \
        --arg event "$event" \
        --arg status "$event_status" \
        '.operation_id == $operation_id and
          .event == $event and
          .status == $status' \
        >/dev/null 2>&1
  then
    append_status=1
  fi
  rmdir "$events_lock" 2>/dev/null || append_status=1
  if [[ "$append_status" != "0" ]]; then
    print -u2 "conductor-land: cannot append verified publish audit event: $events_file"
    return 1
  fi
}

print
print "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
print "CONDUCTOR PUBLISH TARGET — VERIFIED"
print "Repository:              $github_slug"
print "Immutable repository ID: $github_repo_id"
print "Bound remote:            $bound_remote"
print "Verified fetch URL:      $fetch_url"
print "Verified push URL:       $push_url"
print "Canonical URL:           $canonical_url"
print "Git directory:           $git_dir"
print "Git common directory:    $git_common_dir"
print "Absolute root/workspace: $repo_root"
print "Source route:            $source_branch@$source_sha"
print "Landing route:           $landing_branch@$source_sha -> $default_branch"
print "Protection:              strict=true checks=$required_check_count PR=true admins=true force-push=false deletion=false"
print "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
print

source_remote_rows="$(git ls-remote "$fetch_url" "refs/heads/$source_branch")"
if [[ "$(grep -c . <<<"$source_remote_rows" || true)" -gt 1 ]]; then
  print -u2 "conductor-land: source branch lookup returned more than one ref"
  exit 3
fi
source_remote_sha="$(awk 'NF {print $1}' <<<"$source_remote_rows")"
if [[ -n "$source_remote_sha" &&
  ( "${#source_remote_sha}" -ne "${#source_sha}" ||
    "$source_remote_sha" == *[^0-9a-f]* ) ]]
then
  print -u2 "conductor-land: source branch lookup returned an invalid SHA"
  exit 3
fi

if [[ -n "$source_remote_sha" && "$source_remote_sha" != "$source_sha" ]]; then
  verified_source_ref="$verified_ref_namespace/source/$source_sha"
  git fetch --quiet --no-tags "$fetch_url" \
    "+refs/heads/$source_branch:$verified_source_ref"
  if git merge-base --is-ancestor "$source_remote_sha" "$source_sha"; then
    :
  elif git merge-base --is-ancestor "$source_sha" "$source_remote_sha"; then
    print -u2 "conductor-land: remote $source_branch advanced beyond the exact local source SHA"
    print -u2 "Reconcile the remote work locally; Conductor will not rewind it."
    exit 3
  else
    print -u2 "conductor-land: local and remote $source_branch have diverged"
    print -u2 "Fetch the bound remote, reconcile both histories semantically, rerun tests, then retry."
    exit 3
  fi
fi

# No external write is allowed until this durable pending receipt is locked,
# appended, and reread successfully.
if ! append_publish_event \
  "land" "" "before_source_backup" "$source_remote_sha" "pending"
then
  print -u2 "conductor-land: pending publish receipt could not be written"
  print -u2 "No source or landing ref was written."
  exit 3
fi

if [[ "$source_remote_sha" != "$source_sha" ]]; then
  if ! assert_live_identity; then
    append_publish_event \
      "land" "" "live_identity_mismatch_before_source_push" \
      "$source_remote_sha" "failed" || true
    print -u2 \
      "conductor-land: live immutable repository identity changed before source push"
    exit 3
  fi
  if ! git push --quiet "$push_url" \
    "${source_sha}:refs/heads/$source_branch"
  then
    append_publish_event \
      "land" "" "source_backup_push_rejected" "$source_remote_sha" "failed" ||
      true
    print -u2 "conductor-land: non-force source backup push was rejected"
    exit 3
  fi
fi
source_remote_sha="$(
  git ls-remote "$fetch_url" "refs/heads/$source_branch" |
    awk 'NF {print $1}'
)"
if [[ "$source_remote_sha" != "$source_sha" ]]; then
  append_publish_event \
    "land" "" "source_backup_verification_failed" "$source_remote_sha" "failed" ||
    true
  print -u2 "conductor-land: source backup does not match the exact local SHA"
  print -u2 "Expected: $source_sha"
  print -u2 "Remote: ${source_remote_sha:-missing}"
  exit 3
fi

append_publish_event "push_verified" "" "" "$source_remote_sha"
print "conductor-land: PUSH_VERIFIED repo=$github_slug source_branch=$source_branch source_sha=$source_sha"

landing_remote_rows="$(git ls-remote "$fetch_url" "refs/heads/$landing_branch")"
if [[ "$(grep -c . <<<"$landing_remote_rows" || true)" -gt 1 ]]; then
  print -u2 "conductor-land: landing branch lookup returned more than one ref"
  exit 3
fi
landing_sha="$(awk 'NF {print $1}' <<<"$landing_remote_rows")"
if [[ -n "$landing_sha" && "$landing_sha" != "$source_sha" ]]; then
  print -u2 "conductor-land: reserved landing ref already exists at a different SHA"
  print -u2 "Landing branch: $landing_branch"
  print -u2 "Expected:       $source_sha"
  print -u2 "Remote:         $landing_sha"
  exit 3
fi
if [[ -z "$landing_sha" ]]; then
  landing_create_succeeded=true
  if ! assert_live_identity; then
    print -u2 \
      "conductor-land: live immutable repository identity changed before landing-ref creation"
    exit 3
  elif ! gh api \
    --method POST \
    "repos/$github_slug/git/refs" \
    -f "ref=refs/heads/$landing_branch" \
    -f "sha=$source_sha" \
    >/dev/null 2>&1
  then
    landing_create_succeeded=false
  fi
fi
landing_sha="$(
  git ls-remote "$fetch_url" "refs/heads/$landing_branch" |
    awk 'NF {print $1}'
)"
if [[ "$landing_sha" != "$source_sha" ]]; then
  print -u2 "conductor-land: atomic landing ref creation/reuse did not resolve to the exact source SHA"
  print -u2 "Expected: $source_sha"
  print -u2 "Remote: ${landing_sha:-missing}"
  exit 3
fi
if [[ "${landing_create_succeeded:-true}" != "true" ]]; then
  print "conductor-land: concurrent landing ref creation was already exact; reusing it."
fi

pr_url="$(
  gh pr list \
    --repo "$github_slug" \
    --state open \
    --base "$default_branch" \
    --head "$landing_branch" \
    --limit 1 \
    --json url \
    --jq '.[0].url // empty'
)"
if [[ -z "$pr_url" ]]; then
  if ! assert_live_identity; then
    print -u2 \
      "conductor-land: live immutable repository identity changed before pull-request creation"
    exit 3
  fi
  pr_title="$(git log -1 --format=%s "$source_sha")"
  [[ -n "$pr_title" ]] || pr_title="Conductor landing $source_sha"
  pr_body="$(
    print -r -- \
      "Immutable Conductor landing for \`$source_branch@$source_sha\`."
    print
    print -r -- \
      "The mutable source backup is separate from this SHA-addressed pull-request head."
  )"
  if ! pr_url="$(
    gh pr create \
      --repo "$github_slug" \
      --base "$default_branch" \
      --head "$github_owner:$landing_branch" \
      --title "$pr_title" \
      --body "$pr_body"
  )"; then
    print -u2 \
      "conductor-land: GitHub did not create the immutable landing pull request"
    exit 3
  fi
fi

read_pr_snapshot() {
  gh pr view "$pr_url" \
    --repo "$github_slug" \
    --json number,url,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,labels
}

pr_snapshot_is_exact() {
  jq -e \
    --arg owner "$github_owner" \
    --arg repository "$github_repository" \
    --arg base "$default_branch" \
    --arg head "$landing_branch" \
    --arg sha "$landing_sha" \
    '
      (.number | type == "number") and
      (.url | type == "string" and length > 0) and
      .state == "OPEN" and
      .isDraft == false and
      .baseRefName == $base and
      .headRefName == $head and
      .headRefOid == $sha and
      .headRepositoryOwner.login == $owner and
      .headRepository.name == $repository and
      .isCrossRepository == false
    ' >/dev/null <<<"$1"
}

pr_snapshot_is_unblocked() {
  jq -e \
    '[.labels[]?.name] | index("conductor-blocked") == null' \
    >/dev/null <<<"$1"
}

pr_json=""
if ! pr_json="$(read_pr_snapshot)" || ! pr_snapshot_is_exact "$pr_json"; then
  print -u2 "conductor-land: pull request does not match the exact same-repository landing ref"
  exit 3
fi
pr_number="$(jq -r '.number' <<<"$pr_json")"
verified_url="$(jq -r '.url' <<<"$pr_json")"

dequeue_pr_safely() {
  local cleanup_json

  assert_live_identity || return 1
  gh api \
    --method DELETE \
    "repos/$github_slug/issues/$pr_number/labels/conductor-autoland" \
    >/dev/null 2>&1 || true
  assert_live_identity || return 1
  gh pr merge "$pr_number" \
    --repo "$github_slug" \
    --disable-auto \
    >/dev/null 2>&1 || true

  if ! cleanup_json="$(
    gh pr view "$pr_number" \
      --repo "$github_slug" \
      --json labels,autoMergeRequest
  )"; then
    return 1
  fi
  jq -e '
    ([.labels[]?.name] | index("conductor-autoland") == null) and
    (.autoMergeRequest == null)
  ' >/dev/null <<<"$cleanup_json"
}

initially_blocked="$(
  jq -r '[.labels[]?.name] | index("conductor-blocked") != null' \
    <<<"$pr_json"
)"
if [[ "$initially_blocked" == "true" ]]; then
  if ! assert_live_identity; then
    print -u2 \
      "conductor-land: live immutable repository identity changed before blocked-label removal"
    exit 3
  elif ! gh api \
    --method DELETE \
    "repos/$github_slug/issues/$pr_number/labels/conductor-blocked" \
    >/dev/null 2>&1
  then
    if ! dequeue_pr_safely; then
      print -u2 "conductor-land: CRITICAL: could not verify that autoland was disabled"
    fi
    print -u2 "conductor-land: could not remove conductor-blocked; queueing was refused"
    exit 3
  fi
fi

# This is the authoritative read immediately before queue mutation.
pre_label_pr_json=""
if ! pre_label_pr_json="$(read_pr_snapshot)" ||
  ! pr_snapshot_is_exact "$pre_label_pr_json" ||
  ! pr_snapshot_is_unblocked "$pre_label_pr_json"
then
  if ! dequeue_pr_safely; then
    print -u2 "conductor-land: CRITICAL: could not verify that autoland was disabled"
  fi
  print -u2 "conductor-land: pull request changed or is blocked immediately before queueing"
  exit 3
fi

if ! assert_live_identity; then
  print -u2 \
    "conductor-land: live immutable repository identity changed before queue labeling"
  exit 3
fi
if ! gh api \
  --method POST \
  "repos/$github_slug/issues/$pr_number/labels" \
  -f "labels[]=conductor-autoland" \
  >/dev/null
then
  if ! dequeue_pr_safely; then
    print -u2 "conductor-land: CRITICAL: could not verify that autoland was disabled"
  fi
  print -u2 "conductor-land: GitHub rejected the autoland queue label"
  exit 3
fi

# This is the authoritative read immediately after queue mutation.
post_label_pr_json=""
if ! post_label_pr_json="$(read_pr_snapshot)" ||
  ! pr_snapshot_is_exact "$post_label_pr_json" ||
  ! pr_snapshot_is_unblocked "$post_label_pr_json" ||
  ! jq -e '[.labels[]?.name] | index("conductor-autoland") != null' \
    >/dev/null <<<"$post_label_pr_json"
then
  if ! dequeue_pr_safely; then
    print -u2 "conductor-land: CRITICAL: could not verify that autoland was disabled"
  fi
  print -u2 "conductor-land: pull request changed or became blocked while queueing; autoland was disabled"
  exit 3
fi

if ! append_publish_event "queued" "$verified_url" "" "$landing_sha"; then
  if ! dequeue_pr_safely; then
    print -u2 "conductor-land: CRITICAL: could not verify that autoland was disabled"
  fi
  print -u2 "conductor-land: queue receipt was not written; autoland was disabled"
  exit 3
fi
print "conductor-land: QUEUED repo=$github_slug repo_id=$github_repo_id remote=$bound_remote base=$default_branch source_branch=$source_branch source_sha=$source_sha landing_branch=$landing_branch landing_sha=$landing_sha pr=$verified_url"
print "conductor-land: GitHub will reconcile, test, and squash-merge in the background."

if [[ "$wait_for_merge" != "true" ]]; then
  exit 0
fi

wait_timeout="${CONDUCTOR_LAND_TIMEOUT_SECONDS:-1800}"
wait_interval="${CONDUCTOR_LAND_POLL_SECONDS:-5}"
if [[ ! "$wait_timeout" =~ ^[0-9]+$ || ! "$wait_interval" =~ ^[1-9][0-9]*$ ]]; then
  print -u2 "conductor-land: wait timeout and poll interval must be positive integers"
  exit 2
fi

elapsed=0
while (( elapsed <= wait_timeout )); do
  wait_json="$(
    gh pr view "$verified_url" \
      --repo "$github_slug" \
      --json state,mergeCommit,labels
  )"
  wait_state="$(jq -r '.state' <<<"$wait_json")"
  if [[ "$wait_state" == "MERGED" ]]; then
    merge_oid="$(jq -r '.mergeCommit.oid // empty' <<<"$wait_json")"
    if [[ -z "$merge_oid" ]]; then
      print -u2 "conductor-land: merged pull request has no merge commit"
      exit 3
    fi
    wait_default_ref="$verified_ref_namespace/landed/$merge_oid"
    git fetch --quiet --no-tags "$fetch_url" \
      "+refs/heads/$default_branch:$wait_default_ref"
    if ! git merge-base --is-ancestor "$merge_oid" "$wait_default_ref"; then
      print -u2 "conductor-land: merge commit is not present in verified $default_branch"
      exit 3
    fi
    print "conductor-land: LANDED $verified_url"
    print "conductor-land: verified $default_branch contains $merge_oid"
    exit 0
  fi
  if [[ "$wait_state" != "OPEN" ]]; then
    print -u2 "conductor-land: pull request closed without merging: $verified_url"
    exit 3
  fi
  if jq -e '[.labels[].name] | index("conductor-blocked") != null' \
    >/dev/null <<<"$wait_json"
  then
    print -u2 "conductor-land: background landing is blocked: $verified_url"
    exit 3
  fi

  sleep "$wait_interval"
  (( elapsed += wait_interval ))
done

print -u2 "conductor-land: timed out waiting for background landing: $verified_url"
exit 3
