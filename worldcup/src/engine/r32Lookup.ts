/**
 * r32Lookup — FIFA's official third-place allocation (Annex C).
 *
 * All C(12,8) = 495 qualifying combinations are published as an explicit
 * table; this is data transcription, not an algorithm (eng review decision
 * 2A). Key: the 8 advancing groups sorted A→L (e.g. "ABCDEFGH"). Value: for
 * each of the 8 "winner vs third" R32 matches, the GROUP whose third-placed
 * team plays there.
 */
import type { GroupId } from './types'
import r32table from '../data/r32table.json'

/** match number (74,77,79,80,81,82,85,87) -> third-placed team's group */
export type R32Assignment = Record<string, GroupId>

const TABLE = r32table as Record<string, R32Assignment>

export function r32Lookup(qualifiedGroups: GroupId[]): R32Assignment {
  const key = [...qualifiedGroups].sort().join('')
  const assignment = TABLE[key]
  if (!assignment) {
    // Impossible with a valid 8-group input — loud failure beats a wrong bracket.
    throw new Error(`no R32 allocation for qualified groups "${key}"`)
  }
  return assignment
}
