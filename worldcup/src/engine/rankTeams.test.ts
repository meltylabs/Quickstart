import { describe, expect, it } from 'vitest'
import { GROUPS_CHAIN, THIRDS_CHAIN, rankTeams, type H2HMatch, type RankContext } from './rankTeams'
import type { TableRow } from './types'

const row = (team: string, pts: number, gd: number, gf: number): TableRow => ({
  team,
  played: 3,
  won: 0,
  drawn: 0,
  lost: 0,
  gf,
  ga: gf - gd,
  gd,
  pts,
  tiedByLots: false,
})

const ranks: Record<string, number> = { AAA: 1, BBB: 10, CCC: 20, DDD: 30 }
const baseCtx = (matches: H2HMatch[] = []): RankContext => ({
  fifaRank: (t) => ranks[t],
  matchesAmong: (teams) => {
    const wanted = new Set(teams)
    return matches.filter((m) => wanted.has(m.home) && wanted.has(m.away))
  },
})

describe('rankTeams — groups chain', () => {
  it('orders cleanly by pts, then gd, then gf, no badges', () => {
    const rows = [row('CCC', 4, 0, 2), row('AAA', 9, 5, 7), row('DDD', 4, 0, 1), row('BBB', 4, 2, 3)]
    const ranked = rankTeams(rows, GROUPS_CHAIN, baseCtx())
    expect(ranked.map((r) => r.team)).toEqual(['AAA', 'BBB', 'CCC', 'DDD'])
    expect(ranked.every((r) => !r.tiedByLots)).toBe(true)
  })

  it('breaks a 2-way stat tie by head-to-head result', () => {
    // CCC and DDD level on everything; CCC beat DDD, so CCC ranks above —
    // even though DDD has the better FIFA rank... wait, DDD is worse. Use
    // teams where H2H must override the ranking order: DDD beat BBB.
    const rows = [row('BBB', 4, 1, 3), row('DDD', 4, 1, 3)]
    const h2h: H2HMatch[] = [{ home: 'DDD', away: 'BBB', score: { home: 1, away: 0 } }]
    const ranked = rankTeams(rows, GROUPS_CHAIN, baseCtx(h2h))
    expect(ranked.map((r) => r.team)).toEqual(['DDD', 'BBB'])
    expect(ranked.every((r) => !r.tiedByLots)).toBe(true)
  })

  it('re-applies the cascade recursively when a 3-way H2H only partially separates', () => {
    // AAA, BBB, CCC tied on overall stats. Among themselves:
    //   AAA 1-0 BBB, BBB 1-0 CCC, CCC 1-0 AAA  → all 3 pts, gd 0, gf 1 — level.
    // The mini-table cannot separate the same trio twice, so it falls through
    // to FIFA ranking WITH the lots badge for all three.
    const rows = [row('AAA', 4, 0, 2), row('BBB', 4, 0, 2), row('CCC', 4, 0, 2)]
    const h2h: H2HMatch[] = [
      { home: 'AAA', away: 'BBB', score: { home: 1, away: 0 } },
      { home: 'BBB', away: 'CCC', score: { home: 1, away: 0 } },
      { home: 'CCC', away: 'AAA', score: { home: 1, away: 0 } },
    ]
    const ranked = rankTeams(rows, GROUPS_CHAIN, baseCtx(h2h))
    expect(ranked.map((r) => r.team)).toEqual(['AAA', 'BBB', 'CCC']) // fifa rank order
    expect(ranked.every((r) => r.tiedByLots)).toBe(true)
  })

  it('separates a sub-cluster recursively when H2H splits one team off', () => {
    // Trio tied overall. H2H: AAA beat both others (6 pts in mini-table);
    // BBB and CCC drew their match (1 pt each) — still tied with each other.
    // The pair recurses: their own H2H is a draw, same-subset guard kicks in,
    // FIFA ranking orders BBB > CCC, badge ONLY on the pair.
    const rows = [row('AAA', 6, 0, 3), row('BBB', 6, 0, 3), row('CCC', 6, 0, 3)]
    const h2h: H2HMatch[] = [
      { home: 'AAA', away: 'BBB', score: { home: 2, away: 1 } },
      { home: 'AAA', away: 'CCC', score: { home: 2, away: 1 } },
      { home: 'BBB', away: 'CCC', score: { home: 1, away: 1 } },
    ]
    const ranked = rankTeams(rows, GROUPS_CHAIN, baseCtx(h2h))
    expect(ranked.map((r) => r.team)).toEqual(['AAA', 'BBB', 'CCC'])
    expect(ranked.map((r) => r.tiedByLots)).toEqual([false, true, true])
  })

  it('falls to FIFA ranking with badge when teams are inseparable', () => {
    // Identical stats, no matches among them resolved yet.
    const rows = [row('DDD', 1, 0, 1), row('AAA', 1, 0, 1)]
    const ranked = rankTeams(rows, GROUPS_CHAIN, baseCtx([]))
    expect(ranked.map((r) => r.team)).toEqual(['AAA', 'DDD'])
    expect(ranked.every((r) => r.tiedByLots)).toBe(true)
  })
})

describe('rankTeams — thirds chain', () => {
  it('never consults head-to-head: stat tie goes straight to FIFA ranking + badge', () => {
    // Same input as the 2-way H2H test above — but on the thirds chain the
    // H2H result must NOT matter (these teams come from different groups).
    const rows = [row('BBB', 4, 1, 3), row('DDD', 4, 1, 3)]
    const h2h: H2HMatch[] = [{ home: 'DDD', away: 'BBB', score: { home: 1, away: 0 } }]
    const ranked = rankTeams(rows, THIRDS_CHAIN, baseCtx(h2h))
    expect(ranked.map((r) => r.team)).toEqual(['BBB', 'DDD']) // fifa rank, not H2H
    expect(ranked.every((r) => r.tiedByLots)).toBe(true)
  })

  it('ranks cleanly by stats without badges when separable', () => {
    const rows = [row('CCC', 6, 2, 5), row('AAA', 6, 4, 5), row('BBB', 3, 0, 2)]
    const ranked = rankTeams(rows, THIRDS_CHAIN, baseCtx())
    expect(ranked.map((r) => r.team)).toEqual(['AAA', 'CCC', 'BBB'])
    expect(ranked.every((r) => !r.tiedByLots)).toBe(true)
  })
})
