#!/bin/zsh

set -euo pipefail
export GH_HOST=github.com
export GIT_TERMINAL_PROMPT=0

for required_command in git gh jq; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    print -u2 "Archive guard: missing required command: $required_command"
    exit 1
  fi
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

script_dir="${0:A:h}"
identity_command="$script_dir/conductor-repo-identity.zsh"
if [[ ! -x "$identity_command" ]]; then
  print -u2 "Archive guard: repository identity command is missing or not executable."
  exit 1
fi

identity_json=""
if ! identity_json="$("$identity_command")"; then
  print -u2 "Archive guard: immutable repository identity verification failed."
  exit 1
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
  .bound_git_dir == .git_dir
' >/dev/null <<<"$identity_json"
then
  print -u2 "Archive guard: repository identity response is incomplete or unverified."
  exit 1
fi

repo_root="$(jq -r '.root' <<<"$identity_json")"
git_dir="$(jq -r '.git_dir' <<<"$identity_json")"
git_common_dir="$(jq -r '.common_dir' <<<"$identity_json")"
fetch_url="$(jq -r '.fetch_url' <<<"$identity_json")"
github_slug="$(jq -r '.slug' <<<"$identity_json")"
github_repo_id="$(jq -r '.repo_id' <<<"$identity_json")"
default_branch="$(jq -r '.default_branch' <<<"$identity_json")"
github_owner="${github_slug%%/*}"
github_repository="${github_slug#*/}"

cd "$repo_root"
actual_repo_root="$(git rev-parse --show-toplevel)"
actual_git_dir="$(git rev-parse --path-format=absolute --git-dir)"
actual_common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
if [[ "$actual_repo_root" != "$repo_root" ||
  "$actual_git_dir" != "$git_dir" ||
  "$actual_common_dir" != "$git_common_dir" ]]
then
  print -u2 "Archive guard: verified repository identity does not match the current Git context."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  print -u2 "Archive guard: uncommitted work remains. Commit and land it, or explicitly preserve it before archiving."
  git status --short >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  print -u2 "Archive guard: detached HEAD cannot be proven landed."
  exit 1
fi

local_head_sha="$(git rev-parse HEAD)"
object_id_length="${#local_head_sha}"
verified_default_ref="refs/conductor/archive/$github_repo_id/default/$local_head_sha"
if ! git check-ref-format "$verified_default_ref" >/dev/null; then
  print -u2 "Archive guard: immutable repository ID cannot form a safe verification ref."
  exit 1
fi
git fetch --quiet --no-tags "$fetch_url" \
  "+refs/heads/$default_branch:$verified_default_ref"

if ! git show-ref --verify --quiet "$verified_default_ref"; then
  print -u2 "Archive guard: verified default branch $default_branch does not exist."
  exit 1
fi
verified_default_sha="$(git rev-parse "$verified_default_ref^{commit}")"
if [[ "${#verified_default_sha}" -ne "$object_id_length" ||
  "$verified_default_sha" == *[^0-9a-f]* ]]
then
  print -u2 "Archive guard: verified default branch returned an invalid commit ID."
  exit 1
fi

if git merge-base --is-ancestor "$local_head_sha" "$verified_default_sha"; then
  print "Archive guard: HEAD is contained in verified $github_slug:$default_branch."
  exit 0
fi

merged_pr_json="$(
  gh pr list \
    --repo "$github_slug" \
    --state merged \
    --base "$default_branch" \
    --limit 100 \
    --json number,url,state,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,labels,mergeCommit
)"
if ! jq -e 'type == "array"' >/dev/null <<<"$merged_pr_json"; then
  print -u2 "Archive guard: GitHub returned an invalid merged pull request list."
  exit 1
fi

merged_pr_rows="$(
  jq -r \
    --arg owner "$github_owner" \
    --arg repository "$github_repository" \
    --arg base "$default_branch" \
    '
      .[]
      | select(.state == "MERGED")
      | select(.isCrossRepository == false)
      | select(.headRepositoryOwner.login == $owner)
      | select(.headRepository.name == $repository)
      | select(.baseRefName == $base)
      | select((.headRefName // "") | startswith("conductor/land/"))
      | [
          .number,
          .url,
          .headRefName,
          .headRefOid,
          (.mergeCommit.oid // ""),
          ([.labels[]?.name] | index("conductor-autoland") != null)
        ]
      | @tsv
    ' <<<"$merged_pr_json"
)"

while IFS=$'\t' read -r pr_number pr_url pr_head_ref pr_head_sha pr_merge_sha currently_labeled; do
  if [[ -z "$pr_number" && -z "$pr_url" && -z "$pr_head_ref" &&
    -z "$pr_head_sha" && -z "$pr_merge_sha" && -z "$currently_labeled" ]]
  then
    continue
  fi
  if [[ ! "$pr_number" =~ '^[0-9]+$' ||
    "${#pr_head_sha}" -ne "$object_id_length" ||
    "$pr_head_sha" == *[^0-9a-f]* ||
    "${#pr_merge_sha}" -ne "$object_id_length" ||
    "$pr_merge_sha" == *[^0-9a-f]* ||
    "$pr_head_ref" != conductor/land/* ]]
  then
    continue
  fi

  if [[ "$currently_labeled" != "true" ]]; then
    historical_label=""
    if ! historical_label="$(
      gh api \
        --paginate \
        --slurp \
        "repos/$github_slug/issues/$pr_number/events?per_page=100" \
        --jq '
          flatten
          | any(.[];
              .event == "labeled" and
              .label.name == "conductor-autoland"
            )
        '
    )"; then
      print -u2 "Archive guard: cannot verify durable queue-label history for PR #$pr_number."
      exit 1
    fi
    if [[ "$historical_label" != "true" ]]; then
      continue
    fi
  fi

  if ! git cat-file -e "$pr_merge_sha^{commit}" 2>/dev/null ||
    ! git merge-base --is-ancestor "$pr_merge_sha" "$verified_default_sha"
  then
    continue
  fi

  landing_source_sha="${pr_head_ref#conductor/land/}"
  if [[ "${#landing_source_sha}" -ne "$object_id_length" ||
    "$landing_source_sha" == *[^0-9a-f]* ]]
  then
    continue
  fi

  verified_pr_ref="refs/conductor/archive/$github_repo_id/pull/$pr_number/$pr_head_sha"
  if ! git check-ref-format "$verified_pr_ref" >/dev/null; then
    continue
  fi
  if ! git fetch --quiet --no-tags "$fetch_url" \
    "+refs/pull/$pr_number/head:$verified_pr_ref" >/dev/null 2>&1
  then
    continue
  fi
  fetched_pr_head="$(git rev-parse "$verified_pr_ref" 2>/dev/null || true)"
  if [[ "$fetched_pr_head" != "$pr_head_sha" ]]; then
    continue
  fi
  if ! git cat-file -e "$landing_source_sha^{commit}" 2>/dev/null ||
    ! git merge-base --is-ancestor "$landing_source_sha" "$fetched_pr_head"
  then
    continue
  fi
  if git merge-base --is-ancestor "$local_head_sha" "$fetched_pr_head"; then
    print "Archive guard: local HEAD is contained in verified merged landing pull request: $pr_url"
    exit 0
  fi
done <<<"$merged_pr_rows"

unique_commits="$(git rev-list --count "$verified_default_sha..$local_head_sha")"
if [[ "$unique_commits" == "0" ]]; then
  print "Archive guard: this branch has no commits outside verified $default_branch."
  exit 0
fi

print -u2 "Archive guard: $branch still has $unique_commits commit(s) not proven landed in verified $github_slug:$default_branch."
print -u2 "Run conductor-land after testing, or explicitly abandon the branch before archiving."
exit 1
