/**
 * resolveResults — the ONLY place result precedence lives.
 *
 *                     ┌─ overlay: VIEW  = official ▸ predicted ▸ (empty)
 * inputs ─────────────┤
 * fixtures + entries  └─ overlay: SIM   = official ▸ pinned    ▸ model-sample
 *         │
 *         ▼
 *   resolveResults(entries, overlay)
 *         │
 *         ▼
 *   groupTables → bestThirds → r32Lookup(495) → knockoutCascade → champion
 *
 * The live view and the Monte Carlo sim run the SAME downstream cascade with
 * a different overlay; there is no second code path to drift out of sync.
 * Predictions are display-layer only and never constrain the sim.
 */
import type { Entries, Fixture, Resolved, ResolvedScore, Score } from './types'

export type Overlay = 'VIEW' | 'SIM'

/** Supplies a model-sampled score for an otherwise-unresolved fixture (SIM only). */
export type Sampler = (fixture: Fixture) => Score

export function resolveResults(
  fixtures: Fixture[],
  entries: Entries,
  overlay: Overlay,
  sample?: Sampler,
): Resolved {
  const resolved: Resolved = new Map()
  for (const fixture of fixtures) {
    const e = entries[fixture.id]
    let score: ResolvedScore | undefined
    if (e?.official) {
      score = { ...e.official, provenance: 'official' }
    } else if (overlay === 'VIEW' && e?.predicted) {
      score = { ...e.predicted, provenance: 'predicted' }
    } else if (overlay === 'SIM' && e?.pinned) {
      score = { ...e.pinned, provenance: 'pinned' }
    } else if (overlay === 'SIM' && sample) {
      score = { ...sample(fixture), provenance: 'sampled' }
    }
    if (score) resolved.set(fixture.id, score)
  }
  return resolved
}
