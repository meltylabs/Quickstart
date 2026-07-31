#!/bin/zsh

set -euo pipefail
export GIT_TERMINAL_PROMPT=0

# Repository identity is deliberately scoped to a worktree. A common repository
# can therefore host several Conductor worktrees, each bound to a different
# remote, without one worktree silently changing another one's publish target.
allow_unbound=false
local_only=false
bind_slug=""
requested_remote=""
selected_remote=""
verification="full"
observed_slug=""
observed_repo_id=""
observed_default_branch=""

usage_text='conductor-repo-identity [--local | --allow-unbound] [--bind OWNER/REPOSITORY] [--remote NAME]'

emit_error() {
  local error_code="$1"
  local message="$2"

  if command -v jq >/dev/null 2>&1; then
    jq -nc \
      --arg error "$error_code" \
      --arg message "$message" \
      --arg verification "$verification" \
      --arg remote "$selected_remote" \
      --arg slug "$observed_slug" \
      --arg repo_id "$observed_repo_id" \
      --arg default_branch "$observed_default_branch" \
      '{
        ok: false,
        error: $error,
        message: $message,
        verification: $verification,
        remote: $remote
      }
      + if $slug == "" then {} else {slug: $slug} end
      + if $repo_id == "" then {} else {repo_id: $repo_id} end
      + if $default_branch == "" then {} else {default_branch: $default_branch} end'
  else
    # All fallback strings are fixed literals from this script; no URL, Git
    # configuration, credential, or other environment value is interpolated.
    print -r -- \
      '{"ok":false,"error":"missing_command","message":"Required command is unavailable: jq","verification":"","remote":""}'
  fi
}

fail_identity() {
  local exit_code="$1"
  local error_code="$2"
  local message="$3"

  emit_error "$error_code" "$message"
  exit "$exit_code"
}

valid_slug() {
  [[ "$1" =~ '^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9._-]+$' ]]
}

valid_remote() {
  [[ "$1" =~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' ]]
}

valid_repo_id() {
  [[ "$1" =~ '^[A-Za-z0-9_+=:/.-]+$' ]]
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --allow-unbound)
      allow_unbound=true
      shift
      ;;
    --local)
      local_only=true
      verification="local"
      shift
      ;;
    --bind)
      [[ "$#" -ge 2 ]] ||
        fail_identity 2 "invalid_arguments" "Usage: $usage_text"
      bind_slug="$2"
      shift 2
      ;;
    --remote)
      [[ "$#" -ge 2 ]] ||
        fail_identity 2 "invalid_arguments" "Usage: $usage_text"
      requested_remote="$2"
      shift 2
      ;;
    -h|--help)
      if command -v jq >/dev/null 2>&1; then
        jq -nc --arg usage "$usage_text" \
          '{ok: true, usage: $usage, verification: "", remote: ""}'
      else
        print -r -- \
          '{"ok":true,"usage":"conductor-repo-identity [--local | --allow-unbound] [--bind OWNER/REPOSITORY] [--remote NAME]","verification":"","remote":""}'
      fi
      exit 0
      ;;
    *)
      fail_identity 2 "invalid_arguments" "Usage: $usage_text"
      ;;
  esac
done

if [[ "$local_only" == "true" && "$allow_unbound" == "true" ]] ||
  [[ "$local_only" == "true" && -n "$bind_slug" ]] ||
  [[ "$allow_unbound" == "true" && -n "$bind_slug" ]]
then
  fail_identity 2 "invalid_arguments" "Local verification, unbound inspection, and binding are mutually exclusive modes."
fi
if [[ -n "$bind_slug" ]]; then
  valid_slug "$bind_slug" ||
    fail_identity 2 "invalid_binding" "The explicit binding must be a safe OWNER/REPOSITORY name."
  [[ -n "$requested_remote" ]] ||
    fail_identity 2 "remote_required" "Creating a repository binding requires an explicit --remote NAME."
fi
if [[ -n "$requested_remote" ]]; then
  valid_remote "$requested_remote" ||
    fail_identity 2 "invalid_remote" "The remote name contains unsafe characters."
fi

for required_command in git jq; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    fail_identity 2 "missing_command" "Required command is unavailable: $required_command"
  fi
done
if [[ "$local_only" != "true" ]] && ! command -v gh >/dev/null 2>&1; then
  fail_identity 2 "missing_command" "Required command is unavailable: gh"
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail_identity 2 "not_a_worktree" "Run this command inside a Git worktree."
fi

repo_root="$(git rev-parse --show-toplevel)"
git_dir="$(git rev-parse --path-format=absolute --git-dir)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
common_config="$common_dir/config"

worktree_config_enabled=false
if [[ "$(git config --file "$common_config" --type=bool \
  --get extensions.worktreeConfig 2>/dev/null || true)" == "true" ]]
then
  worktree_config_enabled=true
fi

bound_remote=""
bound_slug=""
bound_repo_id=""
bound_default_branch=""
bound_git_dir=""
inherited_binding=false

read_worktree_binding_key() {
  local key="$1"
  local value_count

  REPLY=""
  if ! git config --worktree --get-all "$key" >/dev/null 2>&1; then
    return 0
  fi
  value_count="$(
    git config --worktree --get-all "$key" 2>/dev/null |
      awk 'END { print NR + 0 }'
  )"
  [[ "$value_count" == "1" ]] ||
    fail_identity 3 "invalid_binding" "A worktree binding key has multiple values."
  REPLY="$(git config --worktree --get "$key" 2>/dev/null || true)"
  [[ -n "$REPLY" ]] ||
    fail_identity 3 "incomplete_binding" "A worktree binding key is empty."
}

if [[ "$worktree_config_enabled" == "true" ]]; then
  read_worktree_binding_key conductor.boundGitHubRemote
  bound_remote="$REPLY"
  read_worktree_binding_key conductor.boundGitHubRepoSlug
  bound_slug="$REPLY"
  read_worktree_binding_key conductor.boundGitHubRepoId
  bound_repo_id="$REPLY"
  read_worktree_binding_key conductor.boundGitHubDefaultBranch
  bound_default_branch="$REPLY"
  read_worktree_binding_key conductor.boundGitDir
  bound_git_dir="$REPLY"
fi

binding_count=0
[[ -n "$bound_remote" ]] && (( binding_count += 1 ))
[[ -n "$bound_slug" ]] && (( binding_count += 1 ))
[[ -n "$bound_repo_id" ]] && (( binding_count += 1 ))
[[ -n "$bound_default_branch" ]] && (( binding_count += 1 ))
[[ -n "$bound_git_dir" ]] && (( binding_count += 1 ))

binding="unbound"
if (( binding_count > 0 && binding_count < 5 )); then
  fail_identity 3 "incomplete_binding" "The worktree repository binding is incomplete and must be repaired explicitly."
elif (( binding_count == 5 )); then
  binding="verified"
  valid_remote "$bound_remote" ||
    fail_identity 3 "invalid_binding" "The bound remote name contains unsafe characters."
  valid_slug "$bound_slug" ||
    fail_identity 3 "invalid_binding" "The bound repository slug is invalid."
  valid_repo_id "$bound_repo_id" ||
    fail_identity 3 "invalid_binding" "The bound immutable repository ID is invalid."
  git check-ref-format "refs/heads/$bound_default_branch" >/dev/null 2>&1 ||
    fail_identity 3 "invalid_binding" "The bound default branch is invalid."
  if [[ "$bound_git_dir" != "$git_dir" ]]; then
    # `git worktree add` copies config.worktree from its source worktree. The
    # copied values are evidence of the source binding, not a binding of the
    # newly created worktree.
    binding="unbound"
    inherited_binding=true
  fi
fi

if [[ -n "$requested_remote" ]]; then
  selected_remote="$requested_remote"
  if [[ "$binding" == "verified" && "$selected_remote" != "$bound_remote" ]]; then
    fail_identity 3 "binding_remote_mismatch" "The requested remote does not match this worktree's immutable binding."
  fi
elif [[ "$binding" == "verified" ]]; then
  selected_remote="$bound_remote"
elif [[ "$allow_unbound" == "true" ]]; then
  fail_identity 3 "remote_required" "Inspecting an unbound worktree requires an explicit --remote NAME."
elif [[ "$local_only" == "true" ]]; then
  if [[ "$inherited_binding" == "true" ]]; then
    fail_identity 3 "stale_worktree_binding" "This worktree inherited another worktree's binding and must be bound explicitly."
  fi
  fail_identity 3 "unbound_repository" "Local verification requires an existing worktree repository binding."
else
  if [[ "$inherited_binding" == "true" ]]; then
    fail_identity 3 "stale_worktree_binding" "This worktree inherited another worktree's binding and must be bound explicitly."
  fi
  fail_identity 3 "unbound_repository" "This worktree has no immutable repository binding."
fi

if ! git remote get-url "$selected_remote" >/dev/null 2>&1; then
  fail_identity 3 "missing_remote" "The selected bound remote does not exist in this repository."
fi

normalize_github_url() {
  local raw_url="$1"
  local normalized_slug

  case "$raw_url" in
    https://github.com/*)
      normalized_slug="${raw_url#https://github.com/}"
      ;;
    git@github.com:*)
      normalized_slug="${raw_url#git@github.com:}"
      ;;
    *)
      return 1
      ;;
  esac
  normalized_slug="${normalized_slug%/}"
  normalized_slug="${normalized_slug%.git}"
  valid_slug "$normalized_slug" || return 1
  print -r -- "$normalized_slug"
}

# Validate both raw configuration and Git's effective destinations. The raw
# values make applicable insteadOf/pushInsteadOf rules detectable, while the
# effective values prove what Git would actually contact.
raw_fetch_lines="$(
  git config --get-all "remote.$selected_remote.url" 2>/dev/null || true
)"
raw_push_lines="$(
  git config --get-all "remote.$selected_remote.pushurl" 2>/dev/null || true
)"
[[ -n "$raw_fetch_lines" ]] ||
  fail_identity 3 "missing_remote_url" "The selected remote must have one fetch URL."
raw_fetch_urls=("${(@f)raw_fetch_lines}")
(( ${#raw_fetch_urls[@]} == 1 )) ||
  fail_identity 3 "ambiguous_remote" "The selected remote must have exactly one fetch destination."
if [[ -n "$raw_push_lines" ]]; then
  raw_push_urls=("${(@f)raw_push_lines}")
  (( ${#raw_push_urls[@]} == 1 )) ||
    fail_identity 3 "ambiguous_remote" "The selected remote must have at most one explicit push destination."
  raw_push_url="$raw_push_urls[1]"
else
  raw_push_url="$raw_fetch_urls[1]"
fi
raw_fetch_url="$raw_fetch_urls[1]"

effective_fetch_lines="$(
  git remote get-url --all "$selected_remote" 2>/dev/null || true
)"
effective_push_lines="$(
  git remote get-url --push --all "$selected_remote" 2>/dev/null || true
)"
[[ -n "$effective_fetch_lines" && -n "$effective_push_lines" ]] ||
  fail_identity 3 "missing_remote_url" "The selected remote must have one fetch URL and one push URL."
effective_fetch_urls=("${(@f)effective_fetch_lines}")
effective_push_urls=("${(@f)effective_push_lines}")
if (( ${#effective_fetch_urls[@]} != 1 || ${#effective_push_urls[@]} != 1 )); then
  fail_identity 3 "ambiguous_remote" "The selected remote must resolve to exactly one fetch destination and one push destination."
fi
fetch_url="$effective_fetch_urls[1]"
push_url="$effective_push_urls[1]"

raw_fetch_slug="$(normalize_github_url "$raw_fetch_url" 2>/dev/null || true)"
raw_push_slug="$(normalize_github_url "$raw_push_url" 2>/dev/null || true)"
if [[ -z "$raw_fetch_slug" || -z "$raw_push_slug" ]]; then
  fail_identity 3 "unsafe_remote" "Fetch and push destinations must be credential-free github.com URLs."
fi
if [[ "$raw_fetch_slug" != "$raw_push_slug" ]]; then
  fail_identity 3 "remote_mismatch" "Fetch and push destinations do not name one identical GitHub repository."
fi

observed_slug="$raw_fetch_slug"
canonical_url="https://github.com/$observed_slug.git"
canonical_ssh_url="git@github.com:$observed_slug.git"

# Rewrites are checked before accepting Git's effective URLs so an applicable
# redirect is reported as such, even when its destination is itself unsafe.
rewrite_lines="$(
  git config --get-regexp '^url\..*\.(insteadof|pushinsteadof)$' \
    2>/dev/null || true
)"
if [[ -n "$rewrite_lines" ]]; then
  while IFS= read -r rewrite_line; do
    rewrite_prefix="${rewrite_line#* }"
    [[ -n "$rewrite_prefix" ]] || continue
    for checked_url in \
      "$raw_fetch_url" "$raw_push_url" "$fetch_url" "$push_url" \
      "$canonical_url" "$canonical_ssh_url"
    do
      if [[ "$checked_url" == "$rewrite_prefix"* ]]; then
        fail_identity 3 "github_url_rewrite" \
          "A Git URL rewrite can redirect the selected GitHub destination."
      fi
    done
  done <<<"$rewrite_lines"
fi

fetch_slug="$(normalize_github_url "$fetch_url" 2>/dev/null || true)"
push_slug="$(normalize_github_url "$push_url" 2>/dev/null || true)"
if [[ -z "$fetch_slug" || -z "$push_slug" ]]; then
  fail_identity 3 "unsafe_remote" "Fetch and push destinations must be credential-free github.com URLs."
fi
if [[ "$fetch_slug" != "$push_slug" || "$observed_slug" != "$fetch_slug" ]]; then
  fail_identity 3 "remote_mismatch" "Fetch and push destinations do not name one identical GitHub repository."
fi

if [[ "$binding" == "verified" && "$observed_slug" != "$bound_slug" ]]; then
  fail_identity 3 "binding_slug_mismatch" "The bound remote URL does not match this worktree's immutable repository slug."
fi
if [[ -n "$bind_slug" && "$observed_slug" != "$bind_slug" ]]; then
  fail_identity 3 "binding_target_mismatch" "The explicit binding does not match the selected remote."
fi

if [[ "$local_only" == "true" ]]; then
  observed_repo_id="$bound_repo_id"
  observed_default_branch="$bound_default_branch"
else
  repo_json=""
  if ! repo_json="$(
    GH_HOST=github.com gh repo view "github.com/$observed_slug" \
      --json id,nameWithOwner,defaultBranchRef 2>/dev/null
  )"; then
    fail_identity 3 "github_lookup_failed" "GitHub could not verify the selected remote's repository identity."
  fi
  if ! jq -e '
    type == "object" and
    (.id | type == "string" and test("^[A-Za-z0-9_+=:/.-]+$")) and
    (.nameWithOwner | type == "string") and
    (.defaultBranchRef.name | type == "string" and length > 0)
  ' >/dev/null 2>&1 <<<"$repo_json"
  then
    fail_identity 3 "incomplete_github_identity" "GitHub returned an incomplete or unsafe repository identity."
  fi
  observed_repo_id="$(jq -r '.id' <<<"$repo_json")"
  live_slug="$(jq -r '.nameWithOwner' <<<"$repo_json")"
  observed_default_branch="$(jq -r '.defaultBranchRef.name' <<<"$repo_json")"
  valid_slug "$live_slug" ||
    fail_identity 3 "unsafe_github_identity" "GitHub returned an invalid owner/repository name."
  [[ "$live_slug" == "$observed_slug" ]] ||
    fail_identity 3 "redirected_remote" "The remote does not exactly match GitHub's canonical owner/repository name."
  git check-ref-format "refs/heads/$observed_default_branch" >/dev/null 2>&1 ||
    fail_identity 3 "invalid_default_branch" "GitHub returned an invalid default branch."
fi

if [[ "$binding" == "verified" ]]; then
  if [[ "$observed_repo_id" != "$bound_repo_id" ||
    "$observed_default_branch" != "$bound_default_branch" ]]
  then
    fail_identity 3 "binding_mismatch" "The live repository identity or default branch does not match this worktree's immutable binding."
  fi
fi

if [[ -n "$bind_slug" ]]; then
  if [[ "$binding" == "verified" ]]; then
    # Binding is creation-only. An exact repeat is intentionally idempotent;
    # every mismatch above fails without modifying the existing values.
    :
  else
    extension_was_enabled="$worktree_config_enabled"
    extension_previous="$(
      git config --file "$common_config" --get extensions.worktreeConfig \
        2>/dev/null || true
    )"
    if ! git config --file "$common_config" extensions.worktreeConfig true; then
      fail_identity 3 "binding_write_failed" "Worktree-scoped Git configuration could not be enabled."
    fi
    worktree_config_enabled=true

    restore_extension_setting() {
      if [[ "$extension_was_enabled" != "true" ]]; then
        if [[ -n "$extension_previous" ]]; then
          git config --file "$common_config" extensions.worktreeConfig \
            "$extension_previous" >/dev/null 2>&1 || true
        else
          git config --file "$common_config" \
            --unset-all extensions.worktreeConfig >/dev/null 2>&1 || true
        fi
      fi
    }

    restore_previous_binding() {
      [[ -n "$bound_remote" ]] &&
        git config --worktree conductor.boundGitHubRemote "$bound_remote" \
          >/dev/null 2>&1 || true
      [[ -n "$bound_slug" ]] &&
        git config --worktree conductor.boundGitHubRepoSlug "$bound_slug" \
          >/dev/null 2>&1 || true
      [[ -n "$bound_repo_id" ]] &&
        git config --worktree conductor.boundGitHubRepoId "$bound_repo_id" \
          >/dev/null 2>&1 || true
      [[ -n "$bound_default_branch" ]] &&
        git config --worktree conductor.boundGitHubDefaultBranch \
          "$bound_default_branch" >/dev/null 2>&1 || true
      [[ -n "$bound_git_dir" ]] &&
        git config --worktree conductor.boundGitDir "$bound_git_dir" \
          >/dev/null 2>&1 || true
    }

    rollback_binding() {
      git config --worktree --unset-all conductor.boundGitHubRemote \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitHubRepoSlug \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitHubRepoId \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitHubDefaultBranch \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitDir \
        >/dev/null 2>&1 || true
      restore_previous_binding
      restore_extension_setting
    }

    # Do not overwrite a dormant/partial config.worktree file that only became
    # visible when the extension was enabled.
    for binding_key in \
      conductor.boundGitHubRemote \
      conductor.boundGitHubRepoSlug \
      conductor.boundGitHubRepoId \
      conductor.boundGitHubDefaultBranch \
      conductor.boundGitDir
    do
      if git config --worktree --get-all "$binding_key" >/dev/null 2>&1; then
        if [[ "$inherited_binding" == "true" ]]; then
          continue
        fi
        # Nothing has been written yet, so preserve the dormant values exactly
        # as found and only restore the extension switch we changed.
        restore_extension_setting
        fail_identity 3 "binding_already_exists" "A worktree binding already exists and will not be overwritten."
      fi
    done

    if [[ "$inherited_binding" == "true" ]]; then
      git config --worktree --unset-all conductor.boundGitHubRemote \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitHubRepoSlug \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitHubRepoId \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitHubDefaultBranch \
        >/dev/null 2>&1 || true
      git config --worktree --unset-all conductor.boundGitDir \
        >/dev/null 2>&1 || true
    fi

    if ! git config --worktree conductor.boundGitHubRemote "$selected_remote" ||
      ! git config --worktree conductor.boundGitHubRepoSlug "$observed_slug" ||
      ! git config --worktree conductor.boundGitHubRepoId "$observed_repo_id" ||
      ! git config --worktree conductor.boundGitHubDefaultBranch "$observed_default_branch" ||
      ! git config --worktree conductor.boundGitDir "$git_dir"
    then
      rollback_binding
      fail_identity 3 "binding_write_failed" "The complete worktree repository binding could not be saved."
    fi

    bound_remote="$selected_remote"
    bound_slug="$observed_slug"
    bound_repo_id="$observed_repo_id"
    bound_default_branch="$observed_default_branch"
    bound_git_dir="$git_dir"
    binding="verified"
  fi
fi

output_bound_remote="$bound_remote"
output_bound_slug="$bound_slug"
output_bound_repo_id="$bound_repo_id"
output_bound_default_branch="$bound_default_branch"
output_bound_git_dir="$bound_git_dir"
if [[ "$binding" != "verified" ]]; then
  output_bound_remote=""
  output_bound_slug=""
  output_bound_repo_id=""
  output_bound_default_branch=""
  output_bound_git_dir=""
fi

jq -nc \
  --arg verification "$verification" \
  --arg root "$repo_root" \
  --arg git_dir "$git_dir" \
  --arg common_dir "$common_dir" \
  --arg remote "$selected_remote" \
  --arg fetch_url "$fetch_url" \
  --arg push_url "$push_url" \
  --arg canonical_url "$canonical_url" \
  --arg slug "$observed_slug" \
  --arg repo_id "$observed_repo_id" \
  --arg default_branch "$observed_default_branch" \
  --arg binding "$binding" \
  --arg bound_remote "$output_bound_remote" \
  --arg bound_slug "$output_bound_slug" \
  --arg bound_repo_id "$output_bound_repo_id" \
  --arg bound_default_branch "$output_bound_default_branch" \
  --arg bound_git_dir "$output_bound_git_dir" \
  '{
    ok: true,
    verification: $verification,
    root: $root,
    git_dir: $git_dir,
    common_dir: $common_dir,
    remote: $remote,
    fetch_url: $fetch_url,
    push_url: $push_url,
    canonical_url: $canonical_url,
    slug: $slug,
    repo_id: $repo_id,
    default_branch: $default_branch,
    binding: $binding,
    bound_remote: $bound_remote,
    bound_slug: $bound_slug,
    bound_repo_id: $bound_repo_id,
    bound_default_branch: $bound_default_branch,
    bound_git_dir: $bound_git_dir
  }'
