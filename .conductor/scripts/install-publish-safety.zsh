#!/bin/zsh

set -euo pipefail
export GIT_AUTOPUSH=0
export GIT_TERMINAL_PROMPT=0
unset CONDUCTOR_REPO_IDENTITY CONDUCTOR_PUBLISH_STATE_DIR
umask 077

usage() {
  cat <<'HELP'
Usage:
  install-publish-safety.zsh \
    --bind OWNER/REPOSITORY \
    --remote REMOTE \
    [--replace-hooks]

Install an immutable, commit-versioned copy of the Conductor publishing
commands and bind only the current worktree to an explicit Git remote plus
GitHub's immutable repository ID.

Existing post-commit hooks are never replaced unless --replace-hooks is
provided. Any replaced command or hook is retained as a timestamped backup.
The installer never creates or changes global core.hooksPath.
HELP
}

fail_install() {
  print -u2 "install-publish-safety: $1"
  exit "${2:-3}"
}

valid_slug() {
  [[ "$1" =~ '^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9._-]*$' ]]
}

valid_remote() {
  [[ "$1" =~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' ]]
}

path_within() {
  local candidate="$1"
  local parent="$2"
  [[ "$candidate" == /* && "$parent" == /* ]] || return 1
  candidate="${candidate:a}"
  parent="${parent:a}"
  [[ "$candidate" == "$parent" || "$candidate" == "$parent/"* ]]
}

require_no_symlink_path() {
  local candidate="$1"
  local allowed_parent="$2"
  local relative cursor component
  local -a components

  [[ "$candidate" == /* && "$allowed_parent" == /* ]] ||
    fail_install "symlink audit requires absolute paths"
  candidate="${candidate:a}"
  allowed_parent="${allowed_parent:a}"
  path_within "$candidate" "$allowed_parent" ||
    fail_install "unsafe path outside $allowed_parent: $candidate"
  [[ ! -L "$allowed_parent" ]] ||
    fail_install "refusing symlinked directory: $allowed_parent"

  relative="${candidate#$allowed_parent}"
  relative="${relative#/}"
  cursor="$allowed_parent"
  components=("${(@s:/:)relative}")
  for component in "${components[@]}"; do
    [[ -n "$component" ]] || continue
    cursor="$cursor/$component"
    [[ ! -L "$cursor" ]] ||
      fail_install "refusing symlinked path component: $cursor"
  done
}

expected_slug=""
remote_name=""
replace_hooks=0
while (( $# > 0 )); do
  case "$1" in
    --bind)
      (( $# >= 2 )) || {
        usage >&2
        exit 2
      }
      expected_slug="$2"
      shift 2
      ;;
    --remote)
      (( $# >= 2 )) || {
        usage >&2
        exit 2
      }
      remote_name="$2"
      shift 2
      ;;
    --replace-hooks)
      replace_hooks=1
      shift
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

valid_slug "$expected_slug" ||
  fail_install "expected a safe OWNER/REPOSITORY after --bind" 2
valid_remote "$remote_name" ||
  fail_install "expected an explicit safe remote name after --remote" 2

for required_command in git gh jq mktemp; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail_install "required command is unavailable: $required_command" 2
done

[[ "${HOME:-}" == /* && "${HOME:-}" != "/" && ! -L "${HOME:-}" ]] ||
  fail_install "HOME must be a specific, non-symlinked absolute directory" 2
home_dir="${HOME:A}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail_install "run inside the worktree being bound" 2
git remote get-url "$remote_name" >/dev/null 2>&1 ||
  fail_install "remote does not exist in this worktree: $remote_name" 2

worktree_root="$(git rev-parse --show-toplevel)"
git_dir="$(git rev-parse --path-format=absolute --git-dir)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
canonical_root="${common_dir:h}"
[[ -d "$canonical_root/.git" ]] ||
  fail_install "could not resolve the canonical repository checkout"

tracked_scripts="$canonical_root/.conductor/scripts"
local_bin="$home_dir/.local/bin"
publish_root="$home_dir/.local/share/conductor-publish"
versions_root="$publish_root/versions"
state_root="$home_dir/.local/state/conductor-publish"

for safe_path in "$local_bin" "$publish_root" "$versions_root" "$state_root"; do
  require_no_symlink_path "$safe_path" "$home_dir"
done

typeset -a script_names
script_names=(
  conductor-land.zsh
  conductor-repo-identity.zsh
  conductor-status.zsh
  git-post-commit-autopush.sh
)

source_commit="$(git -C "$canonical_root" rev-parse --verify HEAD)"
[[ "$source_commit" =~ '^[0-9a-f]{40,64}$' ]] ||
  fail_install "canonical source commit is invalid"

for script_name in "${script_names[@]}"; do
  source_path="$tracked_scripts/$script_name"
  relative_path=".conductor/scripts/$script_name"
  [[ -f "$source_path" && ! -L "$source_path" && -x "$source_path" ]] ||
    fail_install "tracked executable is missing or unsafe: $source_path"
  git -C "$canonical_root" cat-file -e "$source_commit:$relative_path" 2>/dev/null ||
    fail_install "script is not tracked at canonical HEAD: $relative_path"
  [[ "$(git -C "$canonical_root" hash-object "$source_path")" ==
    "$(git -C "$canonical_root" rev-parse "$source_commit:$relative_path")" ]] ||
    fail_install "script differs from canonical HEAD: $relative_path"
  git -C "$canonical_root" diff --quiet -- "$relative_path" ||
    fail_install "script has uncommitted changes: $relative_path"
  git -C "$canonical_root" diff --cached --quiet -- "$relative_path" ||
    fail_install "script has staged changes: $relative_path"
done

mkdir -p "$state_root"
chmod 700 "$state_root"
require_no_symlink_path "$state_root" "$home_dir"
install_lock="$state_root/install.lock"

typeset -a installed_paths installed_targets installed_backups
typeset -a binding_keys binding_values binding_present
installed_paths=()
installed_targets=()
installed_backups=()
binding_keys=(
  conductor.boundGitHubRemote
  conductor.boundGitHubRepoSlug
  conductor.boundGitHubRepoId
  conductor.boundGitHubDefaultBranch
  conductor.boundGitDir
)
binding_values=()
binding_present=()
binding_captured=0
binding_touched=0
extension_captured=0
extension_touched=0
extension_present=0
extension_value=""
stage_dir=""
version_dir=""
version_created=0
install_lock_owned=0
install_complete=0

rollback_install() {
  local original_status="$?"
  local index installed_path installed_version_path source_path target backup key

  set +e
  if (( install_complete == 0 )); then
    for (( index = ${#installed_paths[@]}; index >= 1; index-- )); do
      installed_path="${installed_paths[$index]}"
      target="${installed_targets[$index]}"
      backup="${installed_backups[$index]}"
      if [[ -L "$installed_path" &&
        "$(readlink "$installed_path" 2>/dev/null)" == "$target" ]]
      then
        unlink "$installed_path"
      elif [[ -e "$installed_path" || -L "$installed_path" ]]; then
        print -u2 \
          "install-publish-safety: rollback left concurrently changed path untouched: $installed_path"
      fi
      if [[ "$backup" != "-" &&
        ! -e "$installed_path" && ! -L "$installed_path" &&
        ( -e "$backup" || -L "$backup" ) ]]
      then
        mv "$backup" "$installed_path"
      fi
    done

    if (( binding_captured == 1 && binding_touched == 1 )); then
      for (( index = 1; index <= ${#binding_keys[@]}; index++ )); do
        key="${binding_keys[$index]}"
        git config --worktree --unset-all "$key" 2>/dev/null || true
        if [[ "${binding_present[$index]}" == "1" ]]; then
          git config --worktree "$key" "${binding_values[$index]}"
        fi
      done
    fi

    if (( extension_captured == 1 && extension_touched == 1 )); then
      git config --local --unset-all extensions.worktreeConfig 2>/dev/null || true
      if (( extension_present == 1 )); then
        git config --local extensions.worktreeConfig "$extension_value"
      fi
    fi
  fi

  if [[ -n "$stage_dir" && -d "$stage_dir" ]]; then
    for script_name in "${script_names[@]}"; do
      [[ ! -e "$stage_dir/$script_name" && ! -L "$stage_dir/$script_name" ]] ||
        unlink "$stage_dir/$script_name"
    done
    rmdir "$stage_dir" 2>/dev/null || true
  fi
  if (( install_complete == 0 && version_created == 1 )) &&
    [[ -n "$version_dir" && -d "$version_dir" && ! -L "$version_dir" ]]
  then
    chmod 755 "$version_dir" 2>/dev/null || true
    for script_name in "${script_names[@]}"; do
      installed_version_path="$version_dir/$script_name"
      source_path="$tracked_scripts/$script_name"
      if [[ -f "$installed_version_path" && ! -L "$installed_version_path" &&
        -f "$source_path" &&
        "$(git hash-object "$installed_version_path" 2>/dev/null)" ==
          "$(git hash-object "$source_path" 2>/dev/null)" ]]
      then
        unlink "$installed_version_path" 2>/dev/null || true
      fi
    done
    rmdir "$version_dir" 2>/dev/null || true
  fi
  if (( install_lock_owned == 1 )) && [[ -d "$install_lock" ]]; then
    [[ ! -e "$install_lock/pid" ]] || unlink "$install_lock/pid"
    rmdir "$install_lock" 2>/dev/null || true
  fi
  return "$original_status"
}
trap rollback_install EXIT
trap 'exit 130' HUP INT TERM

if ! mkdir "$install_lock" 2>/dev/null; then
  stale_pid=""
  if [[ -d "$install_lock" && ! -L "$install_lock" &&
    -O "$install_lock" && -f "$install_lock/pid" &&
    ! -L "$install_lock/pid" && -O "$install_lock/pid" ]]
  then
    stale_pid="$(<"$install_lock/pid")"
  fi
  if [[ "$stale_pid" =~ '^[1-9][0-9]*$' ]] &&
    ! kill -0 "$stale_pid" 2>/dev/null
  then
    stale_lock="$install_lock.stale-$(date -u +%Y%m%dT%H%M%SZ)-$$"
    if ! mv "$install_lock" "$stale_lock" 2>/dev/null ||
      ! mkdir "$install_lock" 2>/dev/null
    then
      fail_install "could not recover a stale publisher installation lock"
    fi
    print \
      "install-publish-safety: preserved stale install lock at $stale_lock"
  else
    fail_install "another publisher installation is active: $install_lock"
  fi
fi
install_lock_owned=1
chmod 700 "$install_lock"
print -r -- "$$" >"$install_lock/pid"

# Resolve the named remote all the way to github.com and its immutable node ID
# before creating commands, hooks, or a binding.
preflight_json=""
if ! preflight_json="$(
  "$tracked_scripts/conductor-repo-identity.zsh" \
    --allow-unbound \
    --remote "$remote_name"
)"; then
  preflight_message="$(
    jq -r '.message // "repository identity verification failed"' \
      <<<"$preflight_json" 2>/dev/null ||
      print "repository identity verification failed"
  )"
  fail_install "$preflight_message"
fi
if ! jq -e \
  --arg slug "$expected_slug" \
  --arg remote "$remote_name" \
  '
    .ok == true and
    .verification == "full" and
    .slug == $slug and
    .remote == $remote and
    (.repo_id | type == "string" and length > 0) and
    (.default_branch | type == "string" and length > 0) and
    (.fetch_url | type == "string" and length > 0) and
    (.push_url | type == "string" and length > 0) and
    (.binding == "unbound" or .binding == "verified")
  ' >/dev/null <<<"$preflight_json"
then
  fail_install "explicit binding does not match the verified live remote"
fi
github_repo_id="$(jq -r '.repo_id' <<<"$preflight_json")"
default_branch="$(jq -r '.default_branch' <<<"$preflight_json")"
fetch_url="$(jq -r '.fetch_url' <<<"$preflight_json")"
push_url="$(jq -r '.push_url' <<<"$preflight_json")"

remote_default_rows=""
if ! remote_default_rows="$(
  git ls-remote --heads "$fetch_url" "refs/heads/$default_branch"
)"; then
  fail_install "could not verify the canonical source against the bound default branch"
fi
if [[ "$(grep -c . <<<"$remote_default_rows" || true)" -ne 1 ]]; then
  fail_install "bound default branch lookup did not return exactly one ref"
fi
remote_default_sha="$(awk 'NF {print $1}' <<<"$remote_default_rows")"
if [[ ! "$remote_default_sha" =~ '^[0-9a-f]{40,64}$' ||
  "$source_commit" != "$remote_default_sha" ]]
then
  fail_install \
    "canonical script source is not the exact verified remote default-branch commit"
fi

protection_json=""
if ! protection_json="$(
  GH_HOST=github.com gh api \
    "repos/$expected_slug/branches/$default_branch/protection"
)"; then
  fail_install "could not verify protection for $expected_slug:$default_branch"
fi
if ! jq -e '
  .required_status_checks.strict == true and
  .enforce_admins.enabled == true and
  .allow_force_pushes.enabled != true and
  .allow_deletions.enabled != true
' >/dev/null <<<"$protection_json"
then
  fail_install \
    "default branch lacks strict checks, admin enforcement, or force/delete protection"
fi

# Worktree-scoped config is the core routing boundary. Capture and restore the
# repository extension transactionally only after the read-only remote and
# branch-protection preflight has succeeded.
if extension_value="$(git config --local --get extensions.worktreeConfig 2>/dev/null)"; then
  extension_present=1
else
  extension_value=""
  extension_present=0
fi
extension_captured=1
if [[ "$extension_value" != "true" ]]; then
  git config --local extensions.worktreeConfig true
  extension_touched=1
fi
[[ "$(git config --local --get extensions.worktreeConfig)" == "true" ]] ||
  fail_install "could not enable per-worktree Git configuration"

for key in "${binding_keys[@]}"; do
  if value="$(git config --worktree --get "$key" 2>/dev/null)"; then
    binding_present+=("1")
    binding_values+=("$value")
  else
    binding_present+=("0")
    binding_values+=("")
  fi
done
binding_captured=1

version_dir="$versions_root/$source_commit"
mkdir -p "$versions_root"
chmod 755 "$publish_root" "$versions_root"
require_no_symlink_path "$version_dir" "$home_dir"
if [[ -e "$version_dir" ]]; then
  [[ -d "$version_dir" && ! -L "$version_dir" ]] ||
    fail_install "immutable version path is not a real directory: $version_dir"
  for script_name in "${script_names[@]}"; do
    source_path="$tracked_scripts/$script_name"
    installed_path="$version_dir/$script_name"
    [[ -f "$installed_path" && ! -L "$installed_path" && -x "$installed_path" ]] ||
      fail_install "immutable version is incomplete: $installed_path"
    [[ "$(git hash-object "$installed_path")" ==
      "$(git hash-object "$source_path")" ]] ||
      fail_install "immutable version content changed: $installed_path"
  done
else
  stage_dir="$versions_root/.stage-$source_commit-$$"
  [[ ! -e "$stage_dir" && ! -L "$stage_dir" ]] ||
    fail_install "version staging path already exists: $stage_dir"
  mkdir "$stage_dir"
  chmod 700 "$stage_dir"
  for script_name in "${script_names[@]}"; do
    cp "$tracked_scripts/$script_name" "$stage_dir/$script_name"
    chmod 555 "$stage_dir/$script_name"
    [[ "$(git hash-object "$stage_dir/$script_name")" ==
      "$(git hash-object "$tracked_scripts/$script_name")" ]] ||
      fail_install "copied script failed content verification: $script_name"
  done
  mv "$stage_dir" "$version_dir"
  version_created=1
  stage_dir=""
  chmod 555 "$version_dir"
fi

desired_hook="$version_dir/git-post-commit-autopush.sh"
typeset -a hook_paths
typeset -A seen_hook_paths
hook_paths=()
seen_hook_paths=()

initial_global_hooks_value="$(
  git config --global --get core.hooksPath 2>/dev/null || true
)"
configured_global_hooks="$(
  git config --global --path --get core.hooksPath 2>/dev/null || true
)"
if [[ -n "$configured_global_hooks" ]]; then
  [[ "$configured_global_hooks" == /* ]] ||
    fail_install "global core.hooksPath must be absolute; it was not changed"
  configured_global_hooks="${configured_global_hooks:a}"
  path_within "$configured_global_hooks" "$home_dir" ||
    fail_install "global hooks path must stay inside HOME"
  require_no_symlink_path "$configured_global_hooks" "$home_dir"
  hook_paths+=("$configured_global_hooks/post-commit")
  seen_hook_paths["$configured_global_hooks/post-commit"]=1
fi

configured_effective_hooks="$(
  git config --path --get core.hooksPath 2>/dev/null || true
)"
if [[ -n "$configured_effective_hooks" ]]; then
  [[ "$configured_effective_hooks" == /* ]] ||
    fail_install \
      "effective core.hooksPath must be absolute for lexical safety verification"
  configured_effective_hooks="${configured_effective_hooks:a}"
  if path_within "$configured_effective_hooks" "$home_dir"; then
    require_no_symlink_path "$configured_effective_hooks" "$home_dir"
  elif path_within "$configured_effective_hooks" "$common_dir"; then
    require_no_symlink_path "$configured_effective_hooks" "$common_dir"
  else
    fail_install "configured effective hooks path is outside HOME and this repository"
  fi
fi

effective_hooks="$(
  git rev-parse --path-format=absolute --git-path hooks 2>/dev/null
)"
[[ "$effective_hooks" == /* ]] ||
  fail_install "could not resolve the effective repository hooks directory"
effective_hooks="${effective_hooks:a}"
if ! path_within "$effective_hooks" "$home_dir" &&
  ! path_within "$effective_hooks" "$common_dir"
then
  fail_install "effective hooks directory is outside HOME and this repository"
fi
if path_within "$effective_hooks" "$home_dir"; then
  require_no_symlink_path "$effective_hooks" "$home_dir"
else
  require_no_symlink_path "$effective_hooks" "$common_dir"
fi
if [[ -z "${seen_hook_paths[$effective_hooks/post-commit]:-}" ]]; then
  hook_paths+=("$effective_hooks/post-commit")
  seen_hook_paths["$effective_hooks/post-commit"]=1
fi

unexpected_hooks=0
for hook_path in "${hook_paths[@]}"; do
  if [[ -e "$hook_path" || -L "$hook_path" ]]; then
    if [[ -L "$hook_path" &&
      "$(readlink "$hook_path" 2>/dev/null)" == "$desired_hook" ]]
    then
      continue
    fi
    (( unexpected_hooks += 1 ))
    if [[ -L "$hook_path" ]]; then
      print -u2 \
        "install-publish-safety: existing hook $hook_path -> $(readlink "$hook_path")"
    elif [[ -f "$hook_path" ]]; then
      print -u2 \
        "install-publish-safety: existing hook $hook_path blob=$(git hash-object "$hook_path")"
    else
      print -u2 "install-publish-safety: existing non-file hook path: $hook_path"
    fi
  fi
done
if (( unexpected_hooks > 0 && replace_hooks == 0 )); then
  fail_install \
    "refusing to replace existing post-commit hook(s); inspect them and rerun with --replace-hooks"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
next_backup_path() {
  local original="$1"
  local candidate="$original.backup-$timestamp"
  local suffix=0

  while [[ -e "$candidate" || -L "$candidate" ]]; do
    (( suffix += 1 ))
    candidate="$original.backup-$timestamp-$suffix"
  done
  print -r -- "$candidate"
}

install_link() {
  local target="$1"
  local link_path="$2"
  local parent="${link_path:h}"
  local temporary="$link_path.conductor-install-$$"
  local backup="-"

  [[ -f "$target" && ! -L "$target" && -x "$target" ]] ||
    fail_install "link target is not an immutable executable: $target"
  if [[ -L "$link_path" &&
    "$(readlink "$link_path" 2>/dev/null)" == "$target" ]]
  then
    return 0
  fi

  if path_within "$parent" "$home_dir"; then
    require_no_symlink_path "$parent" "$home_dir"
  else
    require_no_symlink_path "$parent" "$common_dir"
  fi
  mkdir -p "$parent"
  [[ ! -e "$temporary" && ! -L "$temporary" ]] ||
    fail_install "temporary install path already exists: $temporary"
  ln -s "$target" "$temporary"

  if [[ -e "$link_path" || -L "$link_path" ]]; then
    backup="$(next_backup_path "$link_path")"
    if ! mv "$link_path" "$backup"; then
      unlink "$temporary" 2>/dev/null || true
      fail_install "could not preserve existing path: $link_path"
    fi
  fi
  if ! mv "$temporary" "$link_path"; then
    [[ "$backup" == "-" ]] || mv "$backup" "$link_path" 2>/dev/null || true
    unlink "$temporary" 2>/dev/null || true
    fail_install "could not atomically install link: $link_path"
  fi

  installed_paths+=("$link_path")
  installed_targets+=("$target")
  installed_backups+=("$backup")
  [[ "$backup" == "-" ]] ||
    print "install-publish-safety: preserved $link_path at $backup"
}

# The bind operation is creation-only. Mark it before invocation so even an
# interrupted partial write is restored from the captured worktree values.
binding_touched=1
bind_json=""
if ! bind_json="$(
  "$version_dir/conductor-repo-identity.zsh" \
    --bind "$expected_slug" \
    --remote "$remote_name"
)"; then
  bind_message="$(
    jq -r '.message // "worktree binding failed"' <<<"$bind_json" \
      2>/dev/null || print "worktree binding failed"
  )"
  fail_install "$bind_message"
fi
if ! jq -e \
  --arg slug "$expected_slug" \
  --arg remote "$remote_name" \
  --arg id "$github_repo_id" \
  '
    .ok == true and
    .verification == "full" and
    .binding == "verified" and
    .slug == $slug and
    .bound_slug == $slug and
    .remote == $remote and
    .bound_remote == $remote and
    .repo_id == $id and
    .bound_repo_id == $id and
    .bound_git_dir == .git_dir
  ' >/dev/null <<<"$bind_json"
then
  fail_install "creation-only worktree binding failed exact verification"
fi

install_link \
  "$version_dir/conductor-land.zsh" \
  "$local_bin/conductor-land"
install_link \
  "$version_dir/conductor-repo-identity.zsh" \
  "$local_bin/conductor-repo-identity"
install_link \
  "$version_dir/conductor-status.zsh" \
  "$local_bin/conductor-status"
for hook_path in "${hook_paths[@]}"; do
  install_link "$desired_hook" "$hook_path"
done

for command_name in conductor-land conductor-repo-identity conductor-status; do
  resolved_command="$(
    PATH="$local_bin:$PATH" whence -p "$command_name" 2>/dev/null || true
  )"
  [[ "$resolved_command" == "$local_bin/$command_name" ]] ||
    fail_install \
      "PATH command did not resolve to the installed version: $command_name"
done

final_identity=""
if ! final_identity="$("$local_bin/conductor-repo-identity")"; then
  fail_install "installed identity command could not verify the saved binding"
fi
if ! jq -e \
  --arg slug "$expected_slug" \
  --arg remote "$remote_name" \
  --arg id "$github_repo_id" \
  --arg branch "$default_branch" \
  '
    .ok == true and
    .verification == "full" and
    .binding == "verified" and
    .slug == $slug and
    .bound_slug == $slug and
    .remote == $remote and
    .bound_remote == $remote and
    .repo_id == $id and
    .bound_repo_id == $id and
    .default_branch == $branch and
    .bound_default_branch == $branch and
    .bound_git_dir == .git_dir
  ' >/dev/null <<<"$final_identity"
then
  fail_install "saved immutable worktree binding failed final verification"
fi

status_output=""
if ! status_output="$("$local_bin/conductor-status" --full)"; then
  [[ -n "$status_output" ]] && print -r -- "$status_output"
  fail_install "installed status did not fully verify the publishing target"
fi
print -r -- "$status_output"

for hook_path in "${hook_paths[@]}"; do
  [[ -L "$hook_path" && "$(readlink "$hook_path")" == "$desired_hook" &&
    -x "$hook_path" ]] ||
    fail_install "post-commit hook failed exact-target verification: $hook_path"
done
[[ "$(git config --global --get core.hooksPath 2>/dev/null || true)" ==
  "$initial_global_hooks_value" ]] ||
  fail_install "global core.hooksPath changed unexpectedly"

install_complete=1
print \
  "install-publish-safety: VERIFIED repo=$expected_slug repo_id=$github_repo_id remote=$remote_name fetch=$fetch_url push=$push_url default=$default_branch version=$source_commit"
