/**
 * Test helpers — deterministic full-tournament group results.
 *
 * "Better FIFA rank wins by the group's margin" gives every group a strict
 * 9/6/3/0 points order (winner = best-ranked team), and per-group margins
 * give each third-placed team a distinct goal difference, so tests can dial
 * best-thirds separation or collision precisely.
 */
import seedJson from '../data/seed.json'
import type { Dataset, Entries, Fixture, Score, TeamId } from '../engine/types'

export const dataset = seedJson as Dataset

const rankOf = new Map(dataset.teams.map((t) => [t.id, t.fifaRank]))
const groupLetters = [...new Set(dataset.teams.map((t) => t.group))].sort()

export type Override = (fixture: Fixture, home: TeamId, away: TeamId) => Score | undefined

/**
 * Officials for all 72 group matches. `marginFor(groupIndex)` sets the
 * winning margin per group (A=0 … L=11); `override` can replace any single
 * result (return undefined to keep the default).
 */
export function fullGroupEntries(
  marginFor: (groupIndex: number) => number = (i) => i + 1,
  override?: Override,
): Entries {
  const entries: Entries = {}
  for (const fixture of dataset.fixtures) {
    if (fixture.stage !== 'GROUP' || fixture.home.type !== 'team' || fixture.away.type !== 'team')
      continue
    const home = fixture.home.team
    const away = fixture.away.team
    const overridden = override?.(fixture, home, away)
    if (overridden) {
      entries[fixture.id] = { official: overridden }
      continue
    }
    const margin = marginFor(groupLetters.indexOf(fixture.group!))
    const homeIsBetter = rankOf.get(home)! < rankOf.get(away)!
    entries[fixture.id] = {
      official: homeIsBetter ? { home: margin, away: 0 } : { home: 0, away: margin },
    }
  }
  return entries
}

/** The better-FIFA-ranked of two teams (test pick strategy). */
export function betterRanked(a: TeamId, b: TeamId): TeamId {
  return rankOf.get(a)! < rankOf.get(b)! ? a : b
}
