# World Cup What-If Machine

A solo live predictor + simulation engine for the 2026 FIFA World Cup
(June 11 – July 19, 2026). No accounts, no backend — a static SPA with
localStorage persistence, built to be used on a phone, on the couch,
while the matches are on.

**The idea:** every pool bracket app locks predictions before kickoff
because pools require fairness. A solo app has no fairness constraint —
so this one inverts into a live what-if engine: re-predict mid-tournament,
watch real results land from the feed, pin hypotheticals, and play the rest
of the tournament out 10,000 times.

## Run it

```bash
npm install
npm run dev       # local dev server
npm test          # 53 tests incl. the sim perf contract
npm run build     # static production build in dist/
```

Deploy `dist/` to GitHub Pages / Vercel — it's fully static
(`base: './'` is already set).

## Architecture

```
                    ┌─ overlay: VIEW  = official ▸ predicted ▸ (empty)
inputs ─────────────┤
fixtures + entries  └─ overlay: SIM   = official ▸ pinned    ▸ model-sample
        │
        ▼
  resolveResults(entries, overlay)      ← the ONLY place precedence lives
        │
        ▼
  groupTables → bestThirds → r32Lookup(495) → knockoutCascade → champion
```

- `src/engine/` — pure, framework-free TS. The 2026 format engine:
  group tiebreakers (pts → GD → goals → recursive head-to-head → FIFA
  ranking with a visible "tied — lots" badge), best-thirds ranking,
  FIFA's official 495-scenario round-of-32 allocation (Annex C, encoded
  as data in `src/data/r32table.json`), knockout cascade with
  team-keyed pick invalidation.
- `src/sim/` — injected mulberry32 PRNG (the seed is a replayable story
  ID), Poisson match model from a frozen FIFA-ranking-derived strength
  table, Monte Carlo with a **tested** perf contract: 10k full
  tournaments < 2s. Runs only behind explicit ✨/▶ buttons — never
  reactively on input change.
- `src/data/` — vendored seed (48 teams, 104 fixtures, rankings) plus
  `loadDataset`: runtime fetch of official results from the public
  openfootball feed → schema-validate → localStorage cache → seed
  fallback. Offline always works.
- `src/storage/` — versioned `{v:1,...}` blob; corrupt data is
  quarantined, never wiped; JSON export/import backup.
- `src/ui/` — one guided flow, no jargon: predict group by group → tap
  knockout winners round by round → champion screen, plus a read-only
  🗺 tournament map and a canvas share card.

Regenerate the dataset (e.g. after a squad change): `python3 scripts/build_seed.py`

## Provenance

- Fixtures/teams: [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) (public domain)
- R32 third-place allocation: FIFA Competition Regulations Annex C
  (all 495 combinations, validated by `src/engine/r32Lookup.test.ts`)
- FIFA ranking snapshot: pre-tournament, baked into the seed
- Design doc: `~/.gstack/projects/meltylabs-Quickstart/yonastesfahun-1-start-here-21ad7153-design-20260610-165103.md`
