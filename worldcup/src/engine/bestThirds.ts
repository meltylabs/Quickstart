/**
 * bestThirds — rank the 12 third-placed teams, top 8 advance (2026 format).
 *
 * Chain: pts → gd → gf → FIFA ranking (THIRDS_CHAIN — head-to-head doesn't
 * exist across groups). Only defined once ALL 12 groups are complete; until
 * then the round of 32 renders TBD slots (design doc, Milestone 1).
 */
import type { GroupId, GroupTable, TableRow } from './types'
import { THIRDS_CHAIN, rankTeams } from './rankTeams'

export interface BestThirds {
  /** All 12 third-placed rows, ranked best → worst. */
  ranked: Array<TableRow & { group: GroupId }>
  /** The 8 advancing groups' letters, sorted A→L — the r32 lookup key. */
  qualifiedGroups: GroupId[]
}

export function bestThirds(
  tables: Map<GroupId, GroupTable>,
  fifaRank: (team: string) => number,
): BestThirds | null {
  const thirds: Array<TableRow & { group: GroupId }> = []
  for (const table of tables.values()) {
    if (!table.complete) return null // undetermined until every group finishes
    thirds.push({ ...table.rows[2], group: table.group })
  }
  if (thirds.length !== 12) return null

  const byTeam = new Map(thirds.map((t) => [t.team, t]))
  const ranked = rankTeams(thirds, THIRDS_CHAIN, { fifaRank }).map((row) => ({
    ...row,
    group: byTeam.get(row.team)!.group,
  }))
  const qualifiedGroups = ranked
    .slice(0, 8)
    .map((r) => r.group)
    .sort()
  return { ranked, qualifiedGroups }
}
