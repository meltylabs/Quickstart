#!/bin/zsh

set -euo pipefail
export GIT_AUTOPUSH=0

script_dir="${0:A:h}"
repo_root="${script_dir:h:h}"
installer="$repo_root/.conductor/scripts/install-publish-safety.zsh"
source_scripts="$repo_root/.conductor/scripts"
real_git="$(command -v git)"
real_path="$PATH"
task_tmp="$(mktemp -d)"
task_tmp="${task_tmp:A}"
fake_bin="$task_tmp/fake-bin"
gh_count_file="$task_tmp/gh-api-count"
mkdir -p "$fake_bin"
trap 'chmod -R u+w "$task_tmp" 2>/dev/null || true; rm -rf "$task_tmp"' EXIT

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

assert_file_text() {
  local file_path="$1"
  local expected="$2"
  [[ -f "$file_path" && "$(<"$file_path")" == "$expected" ]] ||
    fail "unexpected preserved content at $file_path"
}

assert_exact_link() {
  local link_path="$1"
  local target="$2"
  [[ -L "$link_path" ]] || fail "expected symlink: $link_path"
  [[ "$(readlink "$link_path")" == "$target" ]] ||
    fail "$link_path did not point exactly to $target"
  [[ -x "$link_path" ]] ||
    fail "installed link is not executable: $link_path"
}

backup_count() {
  local original="$1"
  local -a matches
  matches=("$original".backup-*(N))
  print -r -- "${#matches[@]}"
}

assert_one_backup_text() {
  local original="$1"
  local expected="$2"
  local -a matches
  matches=("$original".backup-*(N))
  [[ "${#matches[@]}" -eq 1 ]] ||
    fail "expected one backup for $original, found ${#matches[@]}"
  [[ "${matches[1]}" =~ '\.backup-[0-9]{8}T[0-9]{6}Z(-[0-9]+)?$' ]] ||
    fail "backup name is not collision-safe UTC: ${matches[1]}"
  assert_file_text "${matches[1]}" "$expected"
}

capture_installer() {
  local repository="$1"
  local fixture_home="$2"
  local global_config="$3"
  shift 3
  local stdout_file="$task_tmp/installer.stdout"
  local stderr_file="$task_tmp/installer.stderr"

  : >"$stdout_file"
  : >"$stderr_file"
  : >"$gh_count_file"
  set +e
  (
    cd "$repository"
    HOME="$fixture_home" \
      GIT_CONFIG_GLOBAL="$global_config" \
      GIT_CONFIG_NOSYSTEM=1 \
      PATH="$fake_bin:$real_path" \
      REAL_GIT="$real_git" \
      FAKE_GH_COUNT_FILE="$gh_count_file" \
      "$installer" "$@"
  ) >"$stdout_file" 2>"$stderr_file"
  CAPTURE_STATUS="$?"
  set -e
  CAPTURE_STDOUT="$(<"$stdout_file")"
  CAPTURE_STDERR="$(<"$stderr_file")"
}

create_fixture() {
  local name="$1"
  local fixture_home="$task_tmp/$name/home"
  local repository="$fixture_home/repository"
  local hooks="$fixture_home/repository-hooks"
  local tracked="$repository/.conductor/scripts"

  mkdir -p "$tracked" "$hooks"
  for script_name in \
    conductor-land.zsh \
    conductor-repo-identity.zsh \
    conductor-status.zsh \
    git-post-commit-autopush.sh
  do
    cp "$source_scripts/$script_name" "$tracked/$script_name"
    chmod 755 "$tracked/$script_name"
  done

  "$real_git" -C "$repository" init -q -b main
  "$real_git" -C "$repository" config user.name "Conductor Installer Test"
  "$real_git" -C "$repository" config user.email "installer@example.com"
  "$real_git" -C "$repository" config core.hooksPath "$hooks"
  "$real_git" -C "$repository" remote add origin \
    "https://github.com/example/repository.git"
  print "installer fixture" >"$repository/file.txt"
  "$real_git" -C "$repository" add file.txt .conductor/scripts
  "$real_git" -C "$repository" commit -q -m "fixture scripts"

  print -r -- "$fixture_home|$repository|$hooks"
}

# Delegate every Git operation except the remote-head observation. No network
# write is needed to prove installation behavior.
{
  print '#!/bin/zsh'
  print 'set -euo pipefail'
  print 'if [[ "${1:-}" == "ls-remote" ]]; then'
  print '  ref="${@: -1}"'
  print '  sha="${FAKE_REMOTE_DEFAULT_SHA:-$("${REAL_GIT:?}" rev-parse HEAD)}"'
  print '  print -r -- "$sha"$'"'"'\t'"'"'"$ref"'
  print '  exit 0'
  print 'fi'
  print 'exec "${REAL_GIT:?}" "$@"'
} >"$fake_bin/git"
chmod 755 "$fake_bin/git"

# Identity, protection, and PR reads are deterministic and pinned to GitHub.
# FAKE_PROTECTION_FAIL_AFTER allows a final-status failure after all install
# mutations, proving transactional rollback.
{
  print '#!/bin/zsh'
  print 'set -euo pipefail'
  print '[[ "${GH_HOST:-}" == "github.com" ]] || exit 90'
  print 'case "${1:-} ${2:-}" in'
  print '  "repo view")'
  print '    [[ "${3:-}" == "github.com/example/repository" ]] || exit 91'
  print '    jq -nc '"'"'{id:"R_TEST_INSTALLER",nameWithOwner:"example/repository",defaultBranchRef:{name:"main"}}'"'"
  print '    ;;'
  print '  "api repos/"*)'
  print '    [[ "${2:-}" == "repos/example/repository/branches/main/protection" ]] || exit 92'
  print '    count=0'
  print '    [[ ! -f "${FAKE_GH_COUNT_FILE:?}" ]] || count="$(<"$FAKE_GH_COUNT_FILE")"'
  print '    count=$((count + 1))'
  print '    print -r -- "$count" >"$FAKE_GH_COUNT_FILE"'
  print '    if [[ -n "${FAKE_PROTECTION_FAIL_AFTER:-}" && "$count" -gt "$FAKE_PROTECTION_FAIL_AFTER" ]]; then'
  print '      exit 93'
  print '    fi'
  print '    print -r -- '"'"'{"required_status_checks":{"strict":true,"checks":[{"context":"Verify combined branch"}]},"required_pull_request_reviews":{"required_approving_review_count":0},"enforce_admins":{"enabled":true},"allow_force_pushes":{"enabled":false},"allow_deletions":{"enabled":false}}'"'"
  print '    ;;'
  print '  "pr list")'
  print '    [[ "$*" == *"--repo github.com/example/repository"* ]] || exit 94'
  print '    print -r -- "null"'
  print '    ;;'
  print '  *)'
  print '    exit 95'
  print '    ;;'
  print 'esac'
} >"$fake_bin/gh"
chmod 755 "$fake_bin/gh"

fixture="$(create_fixture success)"
fixture_home="${fixture%%|*}"
fixture_rest="${fixture#*|}"
fixture_repo="${fixture_rest%%|*}"
repo_hooks="${fixture_rest#*|}"
global_config="$fixture_home/global.gitconfig"
global_hooks="$fixture_home/global-hooks"
local_bin="$fixture_home/.local/bin"
mkdir -p "$global_hooks" "$local_bin"
"$real_git" config --file "$global_config" core.hooksPath "$global_hooks"

# Unsafe arguments and wrong targets fail without a binding or install.
capture_installer \
  "$fixture_repo" "$fixture_home" "$global_config" \
  --bind example/repository --remote "../origin"
[[ "$CAPTURE_STATUS" -eq 2 ]] ||
  fail "unsafe remote returned $CAPTURE_STATUS instead of 2"
[[ ! -e "$local_bin/conductor-status" ]] ||
  fail "unsafe arguments installed a command"

capture_installer \
  "$fixture_repo" "$fixture_home" "$global_config" \
  --bind wrong/repository --remote origin
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "wrong target returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" \
  "explicit binding does not match the verified live remote"
[[ -z "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoId 2>/dev/null || true)" ]] ||
  fail "wrong target persisted a worktree binding"
[[ ! -e "$fixture_home/.local/state/conductor-publish/install.lock" ]] ||
  fail "failed preflight left the install lock behind"

# A clean local checkout is not trusted control-plane source unless its exact
# commit is already GitHub's verified default branch.
export FAKE_REMOTE_DEFAULT_SHA="1111111111111111111111111111111111111111"
capture_installer \
  "$fixture_repo" "$fixture_home" "$global_config" \
  --bind example/repository --remote origin --replace-hooks
unset FAKE_REMOTE_DEFAULT_SHA
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "unpublished canonical source returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" \
  "canonical script source is not the exact verified remote default-branch commit"
[[ -z "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoId 2>/dev/null || true)" ]] ||
  fail "unpublished control-plane source persisted a binding"

# The install lock blocks concurrent mutation.
mkdir -p "$fixture_home/.local/state/conductor-publish/install.lock"
capture_installer \
  "$fixture_repo" "$fixture_home" "$global_config" \
  --bind example/repository --remote origin --replace-hooks
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "held install lock returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" "another publisher installation is active"
rmdir "$fixture_home/.local/state/conductor-publish/install.lock"

# Existing commands and hooks require explicit hook consent and are never
# silently overwritten.
for command_name in conductor-land conductor-repo-identity conductor-status; do
  print "old $command_name command" >"$local_bin/$command_name"
done
print "old global hook" >"$global_hooks/post-commit"
print "old repository hook" >"$repo_hooks/post-commit"

capture_installer \
  "$fixture_repo" "$fixture_home" "$global_config" \
  --bind example/repository --remote origin
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "hook-consent refusal returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" "existing hook $global_hooks/post-commit"
assert_contains "$CAPTURE_STDERR" "existing hook $repo_hooks/post-commit"
assert_contains "$CAPTURE_STDERR" "rerun with --replace-hooks"
assert_file_text "$global_hooks/post-commit" "old global hook"
assert_file_text "$repo_hooks/post-commit" "old repository hook"
assert_file_text "$local_bin/conductor-status" "old conductor-status command"
[[ -z "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoId 2>/dev/null || true)" ]] ||
  fail "hook-consent refusal persisted a binding"
[[ -z "$("$real_git" -C "$fixture_repo" config --local --get extensions.worktreeConfig 2>/dev/null || true)" ]] ||
  fail "hook-consent refusal failed to roll back worktreeConfig"

capture_installer \
  "$fixture_repo" "$fixture_home" "$global_config" \
  --bind example/repository --remote origin --replace-hooks
[[ "$CAPTURE_STATUS" -eq 0 ]] || {
  print -u2 -- "$CAPTURE_STDOUT"
  print -u2 -- "$CAPTURE_STDERR"
  fail "valid installation returned $CAPTURE_STATUS"
}

source_commit="$("$real_git" -C "$fixture_repo" rev-parse HEAD)"
version_dir="$fixture_home/.local/share/conductor-publish/versions/$source_commit"
assert_contains "$CAPTURE_STDOUT" "TARGET example/repository (R_TEST_INSTALLER)"
assert_contains "$CAPTURE_STDOUT" \
  "install-publish-safety: VERIFIED repo=example/repository repo_id=R_TEST_INSTALLER remote=origin"

for command_name in conductor-land conductor-repo-identity conductor-status; do
  assert_exact_link \
    "$local_bin/$command_name" \
    "$version_dir/$command_name.zsh"
  assert_one_backup_text \
    "$local_bin/$command_name" \
    "old $command_name command"
done
assert_exact_link \
  "$global_hooks/post-commit" \
  "$version_dir/git-post-commit-autopush.sh"
assert_exact_link \
  "$repo_hooks/post-commit" \
  "$version_dir/git-post-commit-autopush.sh"
assert_one_backup_text "$global_hooks/post-commit" "old global hook"
assert_one_backup_text "$repo_hooks/post-commit" "old repository hook"

for script_name in \
  conductor-land.zsh \
  conductor-repo-identity.zsh \
  conductor-status.zsh \
  git-post-commit-autopush.sh
do
  [[ -f "$version_dir/$script_name" && ! -L "$version_dir/$script_name" &&
    -x "$version_dir/$script_name" ]] ||
    fail "missing immutable installed script: $script_name"
  [[ "$("$real_git" hash-object "$version_dir/$script_name")" ==
    "$("$real_git" hash-object "$fixture_repo/.conductor/scripts/$script_name")" ]] ||
    fail "immutable script differs from canonical commit: $script_name"
done

[[ "$("$real_git" config --file "$global_config" --get core.hooksPath)" ==
  "$global_hooks" ]] ||
  fail "installer changed configured global core.hooksPath"
[[ "$("$real_git" -C "$fixture_repo" config --local --get extensions.worktreeConfig)" ==
  "true" ]] ||
  fail "installer did not enable worktree-scoped config"
[[ "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRemote)" ==
  "origin" ]] ||
  fail "worktree remote binding is missing"
[[ "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoSlug)" ==
  "example/repository" ]] ||
  fail "worktree slug binding is missing"
[[ "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubRepoId)" ==
  "R_TEST_INSTALLER" ]] ||
  fail "worktree immutable ID binding is missing"
[[ "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitHubDefaultBranch)" ==
  "main" ]] ||
  fail "worktree default-branch binding is missing"
[[ "$("$real_git" -C "$fixture_repo" config --worktree --get conductor.boundGitDir)" ==
  "$("$real_git" -C "$fixture_repo" rev-parse --path-format=absolute --git-dir)" ]] ||
  fail "worktree Git-directory attestation is missing"
[[ -z "$("$real_git" --git-dir="$fixture_repo/.git" config --local --get conductor.boundGitHubRepoId 2>/dev/null || true)" ]] ||
  fail "binding leaked into shared repository config"

# An idempotent reinstall creates no additional backups.
land_backup_count="$(backup_count "$local_bin/conductor-land")"
global_backup_count="$(backup_count "$global_hooks/post-commit")"
repo_backup_count="$(backup_count "$repo_hooks/post-commit")"
capture_installer \
  "$fixture_repo" "$fixture_home" "$global_config" \
  --bind example/repository --remote origin --replace-hooks
[[ "$CAPTURE_STATUS" -eq 0 ]] ||
  fail "idempotent reinstall returned $CAPTURE_STATUS"
[[ "$(backup_count "$local_bin/conductor-land")" == "$land_backup_count" ]] ||
  fail "idempotent reinstall created a command backup"
[[ "$(backup_count "$global_hooks/post-commit")" == "$global_backup_count" ]] ||
  fail "idempotent reinstall created a global-hook backup"
[[ "$(backup_count "$repo_hooks/post-commit")" == "$repo_backup_count" ]] ||
  fail "idempotent reinstall created a repository-hook backup"

# The installed version does not follow subsequent checkout edits.
installed_status_hash="$("$real_git" hash-object "$version_dir/conductor-status.zsh")"
print "# mutable checkout edit" >>"$fixture_repo/.conductor/scripts/conductor-status.zsh"
[[ "$("$real_git" hash-object "$version_dir/conductor-status.zsh")" ==
  "$installed_status_hash" ]] ||
  fail "installed command followed a mutable checkout"

# A fresh repository with no global hooksPath receives only its effective hook.
# A late status failure must restore its prior command, hook, binding, and
# worktreeConfig value.
rollback_fixture="$(create_fixture rollback)"
rollback_home="${rollback_fixture%%|*}"
rollback_rest="${rollback_fixture#*|}"
rollback_repo="${rollback_rest%%|*}"
rollback_hooks="${rollback_rest#*|}"
rollback_global="$rollback_home/global.gitconfig"
rollback_bin="$rollback_home/.local/bin"
mkdir -p "$rollback_bin"
print "rollback status" >"$rollback_bin/conductor-status"
print "rollback hook" >"$rollback_hooks/post-commit"

export FAKE_PROTECTION_FAIL_AFTER=1
capture_installer \
  "$rollback_repo" "$rollback_home" "$rollback_global" \
  --bind example/repository --remote origin --replace-hooks
unset FAKE_PROTECTION_FAIL_AFTER
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "late status failure returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" "installed status did not fully verify"
assert_file_text "$rollback_bin/conductor-status" "rollback status"
assert_file_text "$rollback_hooks/post-commit" "rollback hook"
[[ ! -e "$rollback_bin/conductor-land" && ! -L "$rollback_bin/conductor-land" ]] ||
  fail "rollback left a newly installed command"
[[ ! -e "$rollback_bin/conductor-repo-identity" &&
  ! -L "$rollback_bin/conductor-repo-identity" ]] ||
  fail "rollback left a newly installed identity command"
[[ -z "$("$real_git" -C "$rollback_repo" config --worktree --get conductor.boundGitHubRepoId 2>/dev/null || true)" ]] ||
  fail "late failure left a worktree binding"
[[ -z "$("$real_git" -C "$rollback_repo" config --local --get extensions.worktreeConfig 2>/dev/null || true)" ]] ||
  fail "late failure left worktreeConfig enabled"
[[ -z "$("$real_git" config --file "$rollback_global" --get core.hooksPath 2>/dev/null || true)" ]] ||
  fail "installer created global core.hooksPath"
rollback_commit="$("$real_git" -C "$rollback_repo" rev-parse HEAD)"
rollback_version_dir="$rollback_home/.local/share/conductor-publish/versions/$rollback_commit"
[[ ! -e "$rollback_version_dir" && ! -L "$rollback_version_dir" ]] ||
  fail "late failure left a newly created immutable version directory"

# Symlink checks are lexical: a symlink that resolves back inside HOME is still
# rejected instead of disappearing during canonicalization.
symlink_fixture="$(create_fixture symlink)"
symlink_home="${symlink_fixture%%|*}"
symlink_rest="${symlink_fixture#*|}"
symlink_repo="${symlink_rest%%|*}"
symlink_global="$symlink_home/global.gitconfig"
mkdir -p "$symlink_home/.local" "$symlink_home/redirected-share"
ln -s "$symlink_home/redirected-share" "$symlink_home/.local/share"
capture_installer \
  "$symlink_repo" "$symlink_home" "$symlink_global" \
  --bind example/repository --remote origin --replace-hooks
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "symlinked install component returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" "refusing symlinked path component"
[[ -z "$("$real_git" -C "$symlink_repo" config --worktree --get conductor.boundGitHubRepoId 2>/dev/null || true)" ]] ||
  fail "symlinked install path persisted a binding"

# Global and repository hook destinations receive the same lexical symlink
# audit; resolving either path before that audit would silently bypass it.
global_hook_fixture="$(create_fixture global-hook-symlink)"
global_hook_home="${global_hook_fixture%%|*}"
global_hook_rest="${global_hook_fixture#*|}"
global_hook_repo="${global_hook_rest%%|*}"
global_hook_config="$global_hook_home/global.gitconfig"
mkdir -p "$global_hook_home/real-global-hooks"
ln -s "$global_hook_home/real-global-hooks" \
  "$global_hook_home/symlinked-global-hooks"
"$real_git" config --file "$global_hook_config" core.hooksPath \
  "$global_hook_home/symlinked-global-hooks"
capture_installer \
  "$global_hook_repo" "$global_hook_home" "$global_hook_config" \
  --bind example/repository --remote origin --replace-hooks
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "symlinked global hook path returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" "refusing symlinked path component"
[[ ! -e "$global_hook_home/real-global-hooks/post-commit" ]] ||
  fail "installer wrote through a symlinked global hook path"

effective_hook_fixture="$(create_fixture effective-hook-symlink)"
effective_hook_home="${effective_hook_fixture%%|*}"
effective_hook_rest="${effective_hook_fixture#*|}"
effective_hook_repo="${effective_hook_rest%%|*}"
effective_hook_config="$effective_hook_home/global.gitconfig"
mkdir -p "$effective_hook_home/real-repository-hooks"
ln -s "$effective_hook_home/real-repository-hooks" \
  "$effective_hook_home/symlinked-repository-hooks"
"$real_git" -C "$effective_hook_repo" config core.hooksPath \
  "$effective_hook_home/symlinked-repository-hooks"
capture_installer \
  "$effective_hook_repo" "$effective_hook_home" "$effective_hook_config" \
  --bind example/repository --remote origin --replace-hooks
[[ "$CAPTURE_STATUS" -eq 3 ]] ||
  fail "symlinked effective hook path returned $CAPTURE_STATUS instead of 3"
assert_contains "$CAPTURE_STDERR" "refusing symlinked path component"
[[ ! -e "$effective_hook_home/real-repository-hooks/post-commit" ]] ||
  fail "installer wrote through a symlinked effective hook path"

# A killed installer cannot permanently wedge future installations. A
# privately owned dead-PID lock is preserved for forensics, then replaced
# atomically; a live or unverifiable lock remains fail-closed.
stale_lock_fixture="$(create_fixture stale-lock)"
stale_lock_home="${stale_lock_fixture%%|*}"
stale_lock_rest="${stale_lock_fixture#*|}"
stale_lock_repo="${stale_lock_rest%%|*}"
stale_lock_config="$stale_lock_home/global.gitconfig"
stale_lock_dir="$stale_lock_home/.local/state/conductor-publish/install.lock"
mkdir -p "$stale_lock_dir"
print 2147483647 >"$stale_lock_dir/pid"
capture_installer \
  "$stale_lock_repo" "$stale_lock_home" "$stale_lock_config" \
  --bind example/repository --remote origin --replace-hooks
[[ "$CAPTURE_STATUS" -eq 0 ]] ||
  fail "dead-PID stale lock recovery returned $CAPTURE_STATUS"
assert_contains "$CAPTURE_STDOUT" "preserved stale install lock at"
stale_lock_matches=("$stale_lock_dir".stale-*(N))
[[ "${#stale_lock_matches[@]}" -eq 1 ]] ||
  fail "stale installer lock was not preserved exactly once"
[[ ! -e "$stale_lock_dir" ]] ||
  fail "successful stale-lock recovery left the active install lock behind"

print "PASS: publisher installation is immutable, explicit, and transactional"
