# Background autoland

Conductor chats publish work without waiting for CI, deployments, or merge
serialization. GitHub stores the queue and finishes the landing independently
of the originating chat or Mac.

```text
chat/worktree
    |
    | conductor-land
    | exact source backup
    | immutable conductor/land/<source-SHA> ref
    | exact-head pull request -> conductor-autoland label
    v
GitHub queue (oldest eligible pull request per repository)
    |
    | merge current main into the feature branch
    | required checks rerun on the combined commit
    | squash auto-merge
    v
canonical main -> remote branch deletion -> Conductor workspace archive
```

## Normal use

Run the fast `conductor-status` before editing and `conductor-status --full`
before publishing. The target is scoped to the current worktree, not shared by
every worktree in the repository. It shows the explicitly bound remote,
immutable GitHub repository ID, owner/name, fetch and push URLs, workspace,
feature and default branches, exact local and remote SHAs, working tree state,
pull request state, branch protection, hook installation, and the latest
matching automatic-backup receipt. Stop if its repository binding is not
`VERIFIED`.

An unbound worktree is deliberately unable to fetch, back up, or land. Bind it
only after checking the named remote:

```text
conductor-status --bind OWNER/REPOSITORY --remote REMOTE
```

The binding is creation-only. Changing the remote, owner/name, immutable
repository ID, or default branch requires explicit investigation instead of an
automatic rebind. The binding also attests the exact worktree Git directory:
when Git copies `config.worktree` while creating a new worktree, the copied
attestation is recognized as stale and grants no fetch or publish authority.

Run `conductor-land` after local tests pass. Before any push, it prints the same
repository target and exact planned ref update. A successful asynchronous handoff
looks like:

```text
conductor-land: QUEUED repo=OWNER/REPO repo_id=R_... remote=REMOTE base=main source_branch=FEATURE source_sha=COMMIT landing_branch=conductor/land/COMMIT landing_sha=COMMIT pr=https://github.com/OWNER/REPO/pull/123
```

The command has already verified that GitHub holds the exact source backup and
immutable landing ref. It rereads the pull request immediately before and after
adding the queue label; repository, base, head ref, and head SHA must still
match. It also re-attests the live immutable GitHub repository ID immediately
before each source-ref, landing-ref, pull-request, or label mutation. Return
control to the user at that point. Use `conductor-land --wait`
only when the user explicitly asks the chat to remain attached until the merge
is verified.

## Automatic backup is not landing

The post-commit hook is a separate, non-force backup path. It can copy only the
exact captured commit to the identically named feature branch on the worktree's
bound remote after locally verifying the immutable binding and fetch/push
destination, then rechecking GitHub's live immutable repository ID immediately
before its first network write. It refuses detached HEAD, the default branch, `main`, `master`,
reserved `conductor/land/**` refs, a divergent remote, and an unbound worktree;
it does not create a pull request or merge. A later backup cannot expand a
queued pull request because the pull request uses the immutable landing ref.
Every attempt writes a truthful structured receipt under
`~/.local/state/conductor-publish/events.jsonl`, and actionable failures produce
a macOS notification. Successful commits stay quiet so background operation
does not interrupt work; the `Repository status` Run item and
`conductor-status` command show the latest exact receipt on demand.
Unreviewed repository-local post-commit hooks are not chained automatically;
that would make the routing guarantee impossible to prove.

The event log is created with private permissions before any network write.
Each pending and final event includes the immutable repository ID, Git common
directory, worktree Git directory, bound remote, branch, captured local SHA,
observed remote SHA, and numeric creation time. `conductor-status` only displays
a receipt matching that exact identity tuple, and a pending handoff expires
after 15 minutes instead of masking a dead background process indefinitely.

`conductor-land` also requires a durable pending audit event before its first
network write. A stale audit lock therefore prevents publishing rather than
leaving an unrecorded branch update.

Background landing begins only when `conductor-land` verifies the same target,
source backup SHA, immutable landing SHA, pull request
owner/repository/base/head, queue label, and branch protection.

## Queue behavior

- Only open, non-draft, same-repository pull requests with the
  `conductor-autoland` label are eligible.
- The oldest eligible pull request is processed first.
- A distinct write-enabled deploy key updates each repository. No personal
  GitHub token is stored in Actions.
- The worker creates a two-parent merge commit on the immutable landing route,
  with its verified landing head as the first parent and the current default
  branch as its second parent. The mutable source-backup branch is not the pull
  request head.
- An exact SHA lease prevents the worker from overwriting a concurrently changed
  landing branch.
- Strict branch protection and required checks validate the combined state
  before GitHub squash-merges.
- Every independent worker wakeup scans recent merged queue items and deletes a
  landing branch only with an exact SHA lease. This still cleans up when
  GitHub suppresses a follow-up workflow event, while preserving any branch
  whose SHA changed after the merge. The source backup remains separate;
  Conductor's archive guard deletes or archives it only after proving its local
  HEAD was contained in the verified landing pull request.
- A main-branch push advances the next queue item. Pull-request, check, status,
  manual-dispatch, and scheduled events provide redundant wakeups.

## Fail-closed cases

The worker removes a failed item from the active queue, adds
`conductor-blocked`, and comments once when:

- the branch conflicts with the current default branch;
- a required check fails or is cancelled;
- the repo-scoped deploy key is missing or invalid; or
- the pull request changes `.github/workflows/**`, `.github/actions/**`, or
  `.github/CODEOWNERS`.

Trusted automation changes require manual review and manual merge. For other
blocked pull requests, resolve the problem and run `conductor-land` again.

## Adding another repository

Before chats can truthfully report `QUEUED` for a new repository:

1. Run `conductor-status --bind OWNER/REPOSITORY --remote REMOTE` from each
   worktree that should publish only after visually checking that named remote.
   This pins the remote, owner/name, default branch, and immutable GitHub
   repository ID in worktree-specific Git configuration.
2. Add `.github/workflows/conductor-autoland.yml` to its default branch through
   a manually reviewed bootstrap pull request.
3. Generate a unique Ed25519 deploy key for that repository.
4. Add the public key as a write-enabled deploy key named
   `Conductor Autoland`.
5. Store the private key as the Actions secret
   `CONDUCTOR_AUTOLAND_DEPLOY_KEY`.
6. Enable squash merging, auto-merge, automatic head-branch deletion, pull
   request protection, strict up-to-date required checks, and protection
   against force pushes to the default branch.
7. Create the `conductor-autoland` and `conductor-blocked` labels.

Never reuse one deploy key across repositories, and never replace it with a
broad personal access token.

On Alex's Mac, run this only after the tracked scripts reach the canonical
default branch:

```text
.conductor/scripts/install-publish-safety.zsh \
  --bind OWNER/REPOSITORY \
  --remote REMOTE
```

If a post-commit hook already exists, the installer prints its exact path and
identity and stops. Inspect it before explicitly rerunning with
`--replace-hooks`. Replaced commands and hooks receive collision-safe
timestamped backups. The installer copies the verified scripts into an
immutable commit-versioned directory, makes the PATH commands and selected hook
paths point to that version, never creates or changes global `core.hooksPath`,
requires that source commit to equal the live bound remote's default-branch SHA,
rolls back a failed installation, and performs the creation-only worktree binding.
Repositories without a configured global hook path receive only their effective
repository hook; a configured HOME-contained global hook also makes new chats
fail closed until their worktree is explicitly bound.
