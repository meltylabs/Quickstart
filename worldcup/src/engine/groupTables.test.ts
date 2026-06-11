import { describe, expect, it } from 'vitest'
import { resolveResults } from './resolve'
import { groupTables } from './groupTables'
import seed from '../data/seed.json'
import type { Dataset, Entries } from './types'

const dataset = seed as Dataset

const groupAFixtures = dataset.fixtures.filter((f) => f.stage === 'GROUP' && f.group === 'A')

describe('groupTables', () => {
  it('partially-entered group renders a partial table and is not complete', () => {
    // Only the opening match entered: Mexico 2-0 South Africa.
    const opener = groupAFixtures[0]
    const entries: Entries = { [opener.id]: { official: { home: 2, away: 0 } } }
    const tables = groupTables(dataset, resolveResults(dataset.fixtures, entries, 'VIEW'))
    const a = tables.get('A')!

    expect(a.complete).toBe(false)
    expect(a.rows).toHaveLength(4)
    expect(a.rows[0].team).toBe('MEX')
    expect(a.rows[0]).toMatchObject({ played: 1, won: 1, pts: 3, gf: 2, ga: 0 })
    // Unentered matches are excluded from table math entirely.
    const unplayed = a.rows.filter((r) => r.played === 0)
    expect(unplayed).toHaveLength(2)
  })

  it('a fully-entered group is complete with a fully ordered table', () => {
    const entries: Entries = {}
    // Home team wins every Group A match 1-0.
    for (const f of groupAFixtures) entries[f.id] = { official: { home: 1, away: 0 } }
    const tables = groupTables(dataset, resolveResults(dataset.fixtures, entries, 'VIEW'))
    const a = tables.get('A')!

    expect(a.complete).toBe(true)
    const totalPts = a.rows.reduce((sum, r) => sum + r.pts, 0)
    expect(totalPts).toBe(18) // 6 decisive matches × 3 pts
    expect(a.rows.every((r) => r.played === 3)).toBe(true)
  })

  it('groups with zero entries produce all-zero rows for all 12 groups', () => {
    const tables = groupTables(dataset, resolveResults(dataset.fixtures, {}, 'VIEW'))
    expect(tables.size).toBe(12)
    for (const table of tables.values()) {
      expect(table.complete).toBe(false)
      expect(table.rows.every((r) => r.played === 0 && r.pts === 0)).toBe(true)
    }
  })
})
