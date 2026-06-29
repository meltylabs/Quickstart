---
name: cross-model-review
description: Use Conductor workspaces to cross-reference builder, adversarial reviewer, specialist, and synthesis agents for plans, code changes, and high-risk reviews.
license: Proprietary
compatibility: Conductor workspaces with separate git worktrees and branches.
---

# Cross-Model Review

Use this skill when the user asks to compare models, run a second-model review, red-team a plan, review another agent's work, or use Conductor for parallel builder and reviewer workflows.

## Core Pattern

1. Builder workspace: implement or draft the plan on a dedicated branch.
2. Adversarial reviewer workspace: review the branch, PR, or diff against `origin/main`.
3. Specialist pass: add only for high-risk lenses such as security, auth, data, deploys, frontend quality, performance, money, or brand.
4. Synthesis: compare the findings, remove noise, and return the exact next move.

## Evidence Rules

- Do not assume one workspace can see another workspace's uncommitted files.
- Review committed branches, pushed branches, pull requests, explicit diff summaries, or `.context` handoffs.
- Ask reviewers to lead with findings, cite files and lines, and separate blockers from nice-to-haves.
- Treat missing runtime, browser, or deploy proof as an explicit gap rather than a completed claim.

## Default Prompts

Builder:

```text
Implement the requested change in this Conductor workspace.

Work from the actual repository state. Keep the change scoped. Before stopping, leave a reviewable artifact: commit, pushed branch, pull request, or a concise .context handoff that names changed files, tests run, and unresolved risks.

Do not ask TJ to perform a technical step until you have attempted the available local path and documented the exact blocker.
```

Adversarial reviewer:

```text
Review this branch against origin/main.

Prioritize correctness bugs, missing tests, risky assumptions, regressions, security or data issues, and user-facing behavior. Do not summarize until after findings. Give file and line references. Separate blocking issues from nice-to-haves.

Assume the builder may have missed something important. Verify claims from code, tests, runtime output, or the pull request diff. If you cannot verify a claim, say that plainly.
```

Specialist:

```text
Review this work through one specialist lens only: [security | auth | data | deploy | frontend quality | performance | money | brand].

Stay inside that lens. Identify concrete blockers, likely failure modes, missing proof, and the smallest remediation. Give file and line references when available. Do not relitigate unrelated product choices unless they directly affect the assigned lens.
```

Synthesis:

```text
Compare the builder output and all reviewer notes.

Decide what actually matters. Group findings into: must fix before merge, should fix soon, and noise or preference. For each must-fix item, name the exact next implementation move and the proof needed afterward.

Do not average opinions. Resolve conflicts by evidence quality, blast radius, and user impact.
```

## Closeout

Report which roles ran, which artifact was reviewed, what proof exists, and what remains unverified.
