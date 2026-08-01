# Welcome to Conductor

This is the starter project for Conductor, a macOS app for running multiple coding agents in parallel in isolated git worktree workspaces.

The app is intentionally tiny: one dependency-free `index.html` file plus a few static assets in `public/`. There is no install step, build step, package manager, framework, or dev server.

## How Conductor Uses This Project

Conductor creates each workspace as its own git worktree and branch. The checked-in `.conductor/settings.toml` tells Conductor how to prepare and run this starter app:

```toml
"$schema" = "https://conductor.build/schemas/settings.repo.schema.json"

[scripts]
setup = "true"
run = "open index.html"
```

When you create a workspace, setup succeeds immediately. When you click Run on macOS, Conductor opens the HTML file in your default browser.

## Local Development

Open the app directly:

```sh
open index.html
```

Edit `index.html`, then refresh the browser.

### Train Sounds

Train dispatch sounds are configured in the `TRAIN_SOUNDS` array in `index.html`.
Add new sound files to `public/`, then add another object with an `id`, `label`,
`src`, and `volume`. The selected sound is saved in the browser with
`localStorage`, so it persists after refreshes.

## Project Structure

- `index.html` contains the UI, styling, and interaction logic.
- `public/` contains static assets used by the page.
- `.conductor/settings.toml` contains the shared Conductor workspace scripts.
- `.context/` is available in Conductor workspaces for gitignored notes and handoff files between agents.

## Learn More

- [Conductor docs](https://conductor.build/docs)
