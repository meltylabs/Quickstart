import { describe, expect, it } from 'vitest'
import { resolveResults } from './resolve'
import { groupTables } from './groupTables'
import { bestThirds } from './bestThirds'
import { dataset, fullGroupEntries } from '../test/helpers'

const fifaRank = (team: string) => dataset.teams.find((t) => t.id === team)!.fifaRank

const tablesFor = (entries = fullGroupEntries()) =>
  groupTables(dataset, resolveResults(dataset.fixtures, entries, 'VIEW'))

describe('bestThirds', () => {
  it('returns null while any group is incomplete', () => {
    const entries = fullGroupEntries()
    const someGroupLFixture = dataset.fixtures.find((f) => f.stage === 'GROUP' && f.group === 'L')!
    delete entries[someGroupLFixture.id]
    expect(bestThirds(tablesFor(entries), fifaRank)).toBeNull()
  })

  it('8 clear thirds: distinct GDs separate cleanly, no badges, sorted key', () => {
    // margins 1..12 → third of group A has gd -1 (best) … group L gd -12.
    const result = bestThirds(tablesFor(), fifaRank)!
    expect(result.ranked).toHaveLength(12)
    expect(result.qualifiedGroups).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    expect(result.ranked.every((r) => !r.tiedByLots)).toBe(true)
  })

  it('tie exactly at the 8th-place boundary falls to FIFA ranking with badge', () => {
    // Groups H and I share margin 8 → their thirds tie on pts/gd/gf.
    // 3I = Norway (rank 31) beats 3H = Saudi Arabia (rank 61) for the last spot.
    const margins = [1, 2, 3, 4, 5, 6, 7, 8, 8, 10, 11, 12]
    const result = bestThirds(tablesFor(fullGroupEntries((i) => margins[i])), fifaRank)!
    expect(result.qualifiedGroups).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I'])
    const eighth = result.ranked[7]
    const ninth = result.ranked[8]
    expect(eighth.team).toBe('NOR')
    expect(ninth.team).toBe('KSA')
    expect(eighth.tiedByLots).toBe(true)
    expect(ninth.tiedByLots).toBe(true)
    // Teams separated on stats keep clean rows.
    expect(result.ranked[0].tiedByLots).toBe(false)
  })
})
