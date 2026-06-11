/**
 * rankTeams — the ONE comparator for every ranking in the app.
 *
 * Two chain configs, no duplicated tiebreaker logic:
 *
 *   GROUPS_CHAIN  = pts → gd → gf → headToHead (recursive) → fifaRank
 *   THIRDS_CHAIN  = pts → gd → gf → fifaRank   (no H2H across groups)
 *
 * Tie-break decision tree for one tied cluster:
 *
 *   cluster tied on pts/gd/gf
 *        │
 *        ├─ chain has headToHead AND we haven't already H2H'd this exact
 *        │  subset?  ──▶ build mini-table from matches AMONG the subset,
 *        │               re-rank it with the FULL chain (recursion); any
 *        │               sub-cluster still tied recurses again on the
 *        │               smaller subset (FIFA's recursive re-application)
 *        │
 *        └─ otherwise ──▶ FIFA World Ranking, and every team in the
 *                          cluster gets the "tied — lots" badge
 *
 * Fair-play points are intentionally not in any chain (they need card data
 * nobody will enter) — see the design doc, Premise 3.
 */
import type { Score, TableRow, TeamId } from './types'

export type ChainStep = 'pts' | 'gd' | 'gf' | 'headToHead' | 'fifaRank'

export const GROUPS_CHAIN: ChainStep[] = ['pts', 'gd', 'gf', 'headToHead', 'fifaRank']
export const THIRDS_CHAIN: ChainStep[] = ['pts', 'gd', 'gf', 'fifaRank']

export interface H2HMatch {
  home: TeamId
  away: TeamId
  score: Score
}

export interface RankContext {
  fifaRank: (team: TeamId) => number
  /** Resolved matches played among the given teams (groups chain only). */
  matchesAmong?: (teams: TeamId[]) => H2HMatch[]
}

type StatStep = 'pts' | 'gd' | 'gf'

export function rankTeams(rows: TableRow[], chain: ChainStep[], ctx: RankContext): TableRow[] {
  return rank(
    rows.map((r) => ({ ...r, tiedByLots: false })),
    chain,
    ctx,
    new Set(),
  )
}

function rank(
  rows: TableRow[],
  chain: ChainStep[],
  ctx: RankContext,
  h2hSeen: Set<string>,
): TableRow[] {
  const stats = chain.filter((s): s is StatStep => s === 'pts' || s === 'gd' || s === 'gf')
  const sorted = [...rows].sort((a, b) => compareStats(a, b, stats))
  const out: TableRow[] = []
  for (const cluster of tiedClusters(sorted, stats)) {
    if (cluster.length === 1) out.push(cluster[0])
    else out.push(...breakTie(cluster, chain, ctx, h2hSeen))
  }
  return out
}

/** Higher pts/gd/gf ranks first. 0 = tied on every stat step. */
function compareStats(a: TableRow, b: TableRow, stats: StatStep[]): number {
  for (const stat of stats) {
    if (a[stat] !== b[stat]) return b[stat] - a[stat]
  }
  return 0
}

function* tiedClusters(sorted: TableRow[], stats: StatStep[]): Generator<TableRow[]> {
  let cluster: TableRow[] = []
  for (const row of sorted) {
    if (cluster.length > 0 && compareStats(cluster[0], row, stats) !== 0) {
      yield cluster
      cluster = []
    }
    cluster.push(row)
  }
  if (cluster.length > 0) yield cluster
}

function breakTie(
  cluster: TableRow[],
  chain: ChainStep[],
  ctx: RankContext,
  h2hSeen: Set<string>,
): TableRow[] {
  const teams = cluster.map((r) => r.team)
  const key = [...teams].sort().join('|')

  // Head-to-head among the tied subset — but never twice for the same subset
  // (a fully level mini-table would otherwise recurse forever; FIFA's rule and
  // ours: when H2H can't separate them, fall through to the ranking).
  if (chain.includes('headToHead') && ctx.matchesAmong && !h2hSeen.has(key)) {
    const among = ctx.matchesAmong(teams)
    if (among.length > 0) {
      const mini = miniTable(teams, among)
      const ranked = rank(mini, chain, ctx, new Set([...h2hSeen, key]))
      const position = new Map(ranked.map((r, i) => [r.team, i]))
      const lots = new Map(ranked.map((r) => [r.team, r.tiedByLots]))
      return cluster
        .map((r) => ({ ...r, tiedByLots: lots.get(r.team) ?? false }))
        .sort((a, b) => position.get(a.team)! - position.get(b.team)!)
    }
  }

  // FIFA World Ranking — last resort, visibly badged.
  return cluster
    .map((r) => ({ ...r, tiedByLots: true }))
    .sort((a, b) => ctx.fifaRank(a.team) - ctx.fifaRank(b.team))
}

/** Stats recomputed from only the matches among the tied subset. */
function miniTable(teams: TeamId[], matches: H2HMatch[]): TableRow[] {
  const rows = new Map<TeamId, TableRow>(
    teams.map((team) => [
      team,
      { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, tiedByLots: false },
    ]),
  )
  for (const m of matches) {
    const home = rows.get(m.home)
    const away = rows.get(m.away)
    if (!home || !away) continue
    accumulate(home, m.score.home, m.score.away)
    accumulate(away, m.score.away, m.score.home)
  }
  return [...rows.values()]
}

export function accumulate(row: TableRow, scored: number, conceded: number): void {
  row.played += 1
  row.gf += scored
  row.ga += conceded
  row.gd = row.gf - row.ga
  if (scored > conceded) {
    row.won += 1
    row.pts += 3
  } else if (scored === conceded) {
    row.drawn += 1
    row.pts += 1
  } else {
    row.lost += 1
  }
}
