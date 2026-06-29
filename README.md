# Conductor Cross-Model Review Desk

This project is a tiny Conductor demo for running cross-model reviews across isolated git worktree workspaces.

The app is intentionally tiny: one dependency-free `index.html` file plus static assets in `public/` and `src/assets/`. There is no install step, build step, package manager, framework, or dev server.

## Cross-Model Workflow

Use this when work is complicated enough that one model should build and another should challenge it.

1. **Builder workspace:** one agent implements the change and leaves a reviewable artifact: commit, pushed branch, PR, explicit diff, or `.context` handoff.
2. **Adversarial reviewer workspace:** another agent reviews the branch against `origin/main` and leads with bugs, missing tests, regressions, and risky assumptions.
3. **Specialist pass:** add only for high-risk lenses such as security, auth, data, deploys, frontend quality, performance, money, or brand.
4. **Synthesis:** one agent compares the findings, removes noise, and names the exact next move.

The key constraint: a Conductor workspace cannot inspect another workspace's uncommitted files by default. Share committed branches, PRs, explicit diffs, or `.context` notes.

## How Conductor Uses This Project

Conductor creates each workspace as its own git worktree and branch. The checked-in `.conductor/settings.toml` tells Conductor how to prepare and run this starter app:

```toml
"$schema" = "https://conductor.build/schemas/settings.repo.schema.json"

[scripts]
setup = "true"
run = "open index.html"

[prompts]
code_review = "Review this branch against origin/main. Prioritize correctness bugs, missing tests, risky assumptions, regressions, security or data issues, and user-facing behavior. Do not summarize until after findings. Give file and line references. Separate blocking issues from nice-to-haves."
```

When you create a workspace, setup succeeds immediately. When you click Run on macOS, Conductor opens the HTML file in your default browser.

## Local Development

Open the app directly:

```sh
open index.html
```

Edit `index.html`, then refresh the browser.

## Project Structure

- `index.html` contains the UI, styling, and interaction logic.
- `.agents/skills/cross-model-review/SKILL.md` contains the reusable agent workflow.
- `public/` contains static assets used by the page.
- `.conductor/settings.toml` contains the shared Conductor workspace scripts.
- `.context/` is available in Conductor workspaces for gitignored notes and handoff files between agents.

## Learn More

- [Conductor docs](https://conductor.build/docs)
