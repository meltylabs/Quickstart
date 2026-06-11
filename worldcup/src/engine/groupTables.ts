/**
 * groupTables — group fixtures + resolved scores in, ranked tables out.
 *
 * Incomplete-data behavior (design doc, Milestone 1): unresolved matches are
 * simply excluded from table math. A partially-entered group renders a
 * partial table; `complete` only flips once all 6 matches resolve, and the
 * downstream cascade treats positions in incomplete groups as undetermined.
 */
import type { Dataset, Fixture, GroupId, GroupTable, Resolved, TableRow, TeamId } from './types'
import { GROUPS_CHAIN, accumulate, rankTeams, type H2HMatch, type RankContext } from './rankTeams'

interface GroupIndex {
  fifaRankOf: Map<TeamId, number>
  groups: Array<{ group: GroupId; teams: TeamId[]; fixtures: Fixture[] }>
}

/** Static per-dataset structure, computed once — the sim calls this 10k times. */
const indexCache = new WeakMap<Dataset, GroupIndex>()

function indexOf(dataset: Dataset): GroupIndex {
  let index = indexCache.get(dataset)
  if (index) return index
  const letters = [...new Set(dataset.teams.map((t) => t.group))].sort()
  index = {
    fifaRankOf: new Map(dataset.teams.map((t) => [t.id, t.fifaRank])),
    groups: letters.map((group) => ({
      group,
      teams: dataset.teams.filter((t) => t.group === group).map((t) => t.id),
      fixtures: dataset.fixtures.filter((f) => f.stage === 'GROUP' && f.group === group),
    })),
  }
  indexCache.set(dataset, index)
  return index
}

export function groupTables(dataset: Dataset, resolved: Resolved): Map<GroupId, GroupTable> {
  const { fifaRankOf, groups } = indexOf(dataset)
  const tables = new Map<GroupId, GroupTable>()

  for (const { group, teams, fixtures } of groups) {
    const rows = new Map<TeamId, TableRow>(
      teams.map((team) => [
        team,
        { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, tiedByLots: false },
      ]),
    )

    const played: Array<{ fixture: Fixture; home: TeamId; away: TeamId }> = []
    for (const fixture of fixtures) {
      const score = resolved.get(fixture.id)
      if (!score || fixture.home.type !== 'team' || fixture.away.type !== 'team') continue
      const home = fixture.home.team
      const away = fixture.away.team
      accumulate(rows.get(home)!, score.home, score.away)
      accumulate(rows.get(away)!, score.away, score.home)
      played.push({ fixture, home, away })
    }

    const ctx: RankContext = {
      fifaRank: (team) => fifaRankOf.get(team) ?? Number.MAX_SAFE_INTEGER,
      matchesAmong: (subset) => {
        const wanted = new Set(subset)
        const among: H2HMatch[] = []
        for (const { fixture, home, away } of played) {
          if (wanted.has(home) && wanted.has(away)) {
            among.push({ home, away, score: resolved.get(fixture.id)! })
          }
        }
        return among
      },
    }

    tables.set(group, {
      group,
      rows: rankTeams([...rows.values()], GROUPS_CHAIN, ctx),
      complete: played.length === fixtures.length && fixtures.length > 0,
    })
  }
  return tables
}
