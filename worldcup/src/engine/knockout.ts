/**
 * knockout — fills the bracket from group outcomes + knockout results/picks.
 *
 * Cascade (knockout fixtures processed in FIFA-number order; every feeder
 * has a lower number, so one pass suffices):
 *
 *   group tables ──complete──▶ 1X / 2X slots
 *   bestThirds + r32Lookup ──all 12 complete──▶ 3rd-place slots
 *   node winners/losers ──▶ W{n} / L{n} slots
 *
 * Winner of a node, in order of authority:
 *   1. resolved score — decisive scoreline, or level + team-keyed winner
 *      field (extra-time/penalties proxy; level with NO winner field stays
 *      undetermined — the UI's "winner toggle required")
 *   2. the user's tap-a-winner pick — only when BOTH participants are known
 *      and the picked team is one of them (a stale pick is ignored, which is
 *      what cascades downstream picks back to TBD when upstream changes)
 *   3. otherwise undetermined → every dependent slot renders TBD
 */
import type { Dataset, Fixture, GroupId, GroupTable, Resolved, Score, Slot, TeamId } from './types'
import { bestThirds, type BestThirds } from './bestThirds'
import { r32Lookup, type R32Assignment } from './r32Lookup'

/** Knockout winner picks: fixture-keyed, team-keyed values (see invalidation). */
export type Picks = Record<number, TeamId>

/**
 * Fills gaps the SIM overlay leaves open (sim only — the live view passes
 * none and shows TBD instead). The sim closes over its seeded Rng.
 */
export interface KnockoutSampler {
  sampleScore(home: TeamId, away: TeamId): Score
  pickLevelWinner(home: TeamId, away: TeamId): TeamId
}

export interface KnockoutNode {
  fixture: Fixture
  home?: TeamId
  away?: TeamId
  winner?: TeamId
  loser?: TeamId
  decidedBy?: 'score' | 'pick' | 'sampled'
}

export interface Bracket {
  /** Keyed by fixture id (73-104), in cascade order. */
  nodes: Map<number, KnockoutNode>
  thirds: BestThirds | null
  r32: R32Assignment | null
  champion?: TeamId
}

interface KnockoutIndex {
  fifaRank: Map<TeamId, number>
  /** Knockout fixtures in FIFA-number order (feeders before dependents). */
  knockouts: Fixture[]
}

/** Static per-dataset structure, computed once — the sim calls this 10k times. */
const indexCache = new WeakMap<Dataset, KnockoutIndex>()

function indexOf(dataset: Dataset): KnockoutIndex {
  let index = indexCache.get(dataset)
  if (index) return index
  index = {
    fifaRank: new Map(dataset.teams.map((t) => [t.id, t.fifaRank])),
    knockouts: dataset.fixtures.filter((f) => f.stage !== 'GROUP').sort((a, b) => a.id - b.id),
  }
  indexCache.set(dataset, index)
  return index
}

export function knockoutCascade(
  dataset: Dataset,
  resolved: Resolved,
  tables: Map<GroupId, GroupTable>,
  picks: Picks,
  sampler?: KnockoutSampler,
): Bracket {
  const { fifaRank, knockouts } = indexOf(dataset)
  const thirds = bestThirds(tables, (team) => fifaRank.get(team) ?? Number.MAX_SAFE_INTEGER)
  const r32 = thirds ? r32Lookup(thirds.qualifiedGroups) : null

  const nodes = new Map<number, KnockoutNode>()

  const resolveSlot = (slot: Slot, fixtureId: number): TeamId | undefined => {
    switch (slot.type) {
      case 'team':
        return slot.team
      case 'groupWinner': {
        const table = tables.get(slot.group)
        return table?.complete ? table.rows[0].team : undefined
      }
      case 'groupRunnerUp': {
        const table = tables.get(slot.group)
        return table?.complete ? table.rows[1].team : undefined
      }
      case 'thirdPlace': {
        if (!r32) return undefined
        const group = r32[String(fixtureId)]
        return group ? tables.get(group)?.rows[2].team : undefined
      }
      case 'matchWinner':
        return nodes.get(slot.match)?.winner
      case 'matchLoser':
        return nodes.get(slot.match)?.loser
    }
  }

  for (const fixture of knockouts) {
    const home = resolveSlot(fixture.home, fixture.id)
    const away = resolveSlot(fixture.away, fixture.id)
    const node: KnockoutNode = { fixture, home, away }

    if (home && away) {
      let score: Score | undefined = resolved.get(fixture.id)
      let sampled = false
      if (!score && sampler) {
        score = sampler.sampleScore(home, away)
        sampled = true
      }
      if (score) {
        let byScore =
          score.home > score.away ? home : score.away > score.home ? away : score.winner
        // A team-keyed winner field is only trusted if it names a participant.
        if (byScore !== home && byScore !== away) byScore = undefined
        // Level with no winner field: the sim's shootout proxy decides;
        // the live view leaves it undetermined (winner toggle required).
        if (!byScore && score.home === score.away && sampler) {
          byScore = sampler.pickLevelWinner(home, away)
          sampled = true
        }
        if (byScore) {
          node.winner = byScore
          node.decidedBy = sampled ? 'sampled' : 'score'
        }
      }
      if (!node.winner) {
        const pick = picks[fixture.id]
        if (pick === home || pick === away) {
          node.winner = pick
          node.decidedBy = 'pick'
        }
      }
      if (node.winner) node.loser = node.winner === home ? away : home
    }
    nodes.set(fixture.id, node)
  }

  return { nodes, thirds, r32, champion: nodes.get(104)?.winner }
}

/**
 * Pick invalidation (the most likely runtime bug class in a live what-if
 * app — design doc, Milestone 1.5): returns picks with every stale entry
 * removed, so the store persists the cleanup the cascade already ignored.
 * A pick is stale when its fixture's participants are not both known, or the
 * picked team is no longer one of them; clearing one winner cascades — the
 * next pass resolves downstream participants to undefined, invalidating
 * their picks in turn — so we iterate to a fixed point.
 */
export function validatePicks(
  dataset: Dataset,
  resolved: Resolved,
  tables: Map<GroupId, GroupTable>,
  picks: Picks,
): Picks {
  let current = picks
  for (;;) {
    const bracket = knockoutCascade(dataset, resolved, tables, current)
    const pruned: Picks = {}
    for (const [key, team] of Object.entries(current)) {
      const node = bracket.nodes.get(Number(key))
      if (node && node.home && node.away && (team === node.home || team === node.away)) {
        pruned[Number(key)] = team
      }
    }
    if (Object.keys(pruned).length === Object.keys(current).length) return pruned
    current = pruned
  }
}
