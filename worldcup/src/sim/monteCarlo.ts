/**
 * monteCarlo — play out everything the SIM overlay leaves open, N times.
 *
 * Precedence per fixture (resolveResults, the only place it lives):
 *   official ▸ pinned ▸ model-sample
 * Manual PREDICTIONS and tap-winner PICKS are display-layer only — they
 * never constrain the sim (design doc, Milestone 2).
 *
 * Trigger policy (eng review decision 7A): these functions run ONLY behind
 * an explicit ✨/▶ press — never reactively on input change.
 *
 * One iteration:
 *   resolveResults(SIM)              official + pins, gaps stay open
 *        │
 *        ├─ group gaps  ─▶ sampleScore per fixture
 *        ▼
 *   groupTables → knockoutCascade(sampler)   knockout gaps sampled in-cascade
 *        ▼
 *   tally champion / finalists
 */
import type { Dataset, Entries, Resolved, ResolvedScore, TeamId } from '../engine/types'
import { resolveResults } from '../engine/resolve'
import { groupTables } from '../engine/groupTables'
import { knockoutCascade, type Bracket, type KnockoutSampler } from '../engine/knockout'
import { createMatchModel, ratingFromRank } from './matchModel'
import { mulberry32, type Rng } from './prng'

export interface SimRun {
  resolved: Resolved
  bracket: Bracket
}

export interface OddsResult {
  iterations: number
  seed: number
  /** P(team lifts the trophy), per team id. Sums to ~1. */
  champion: Map<TeamId, number>
  /** P(team reaches the final). */
  finalist: Map<TeamId, number>
}

interface SimIndex {
  model: ReturnType<typeof createMatchModel>
  groupFixtures: Array<{ id: number; home: TeamId; away: TeamId }>
}

/** Static per-dataset structure, computed once — hot across 10k iterations. */
const indexCache = new WeakMap<Dataset, SimIndex>()

function indexOf(dataset: Dataset): SimIndex {
  let index = indexCache.get(dataset)
  if (index) return index
  const rankOf = new Map(dataset.teams.map((t) => [t.id, t.fifaRank]))
  index = {
    model: createMatchModel((team) => ratingFromRank(rankOf.get(team) ?? 100)),
    groupFixtures: dataset.fixtures.flatMap((f) =>
      f.stage === 'GROUP' && f.home.type === 'team' && f.away.type === 'team'
        ? [{ id: f.id, home: f.home.team, away: f.away.team }]
        : [],
    ),
  }
  indexCache.set(dataset, index)
  return index
}

function buildSampler(dataset: Dataset, rng: Rng): KnockoutSampler {
  const { model } = indexOf(dataset)
  return {
    sampleScore: (home, away) => model.sampleScore(home, away, rng),
    pickLevelWinner: (home, away) => model.pickLevelWinner(home, away, rng),
  }
}

/** Play the whole remaining tournament out once ("story mode" — seed = story ID). */
export function simulateOne(dataset: Dataset, entries: Entries, seed: number): SimRun {
  const rng = mulberry32(seed)
  const sampler = buildSampler(dataset, rng)

  // official ▸ pinned first; then sample every still-open group match.
  const resolved = resolveResults(dataset.fixtures, entries, 'SIM')
  for (const { id, home, away } of indexOf(dataset).groupFixtures) {
    if (resolved.has(id)) continue
    // sampleScore returns a fresh object — tag it in place (hot loop, 720k calls)
    const score = sampler.sampleScore(home, away) as ResolvedScore
    score.provenance = 'sampled'
    resolved.set(id, score)
  }

  const tables = groupTables(dataset, resolved)
  // picks intentionally NOT passed — they never constrain the sim.
  const bracket = knockoutCascade(dataset, resolved, tables, {}, sampler)
  return { resolved, bracket }
}

/** Champion/finalist odds over `iterations` full-tournament runs. */
export function championOdds(
  dataset: Dataset,
  entries: Entries,
  seed: number,
  iterations = 10_000,
): OddsResult {
  const championCounts = new Map<TeamId, number>()
  const finalistCounts = new Map<TeamId, number>()

  for (let i = 0; i < iterations; i++) {
    // one independent stream per iteration, derived from the master seed
    const { bracket } = simulateOne(dataset, entries, (seed + i * 0x9e3779b9) >>> 0)
    const final = bracket.nodes.get(104)
    if (final?.home) finalistCounts.set(final.home, (finalistCounts.get(final.home) ?? 0) + 1)
    if (final?.away) finalistCounts.set(final.away, (finalistCounts.get(final.away) ?? 0) + 1)
    if (bracket.champion)
      championCounts.set(bracket.champion, (championCounts.get(bracket.champion) ?? 0) + 1)
  }

  const toShare = (counts: Map<TeamId, number>) =>
    new Map([...counts.entries()].map(([team, n]) => [team, n / iterations]))
  return {
    iterations,
    seed,
    champion: toShare(championCounts),
    finalist: toShare(finalistCounts),
  }
}
