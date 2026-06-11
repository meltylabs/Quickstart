import { describe, expect, it } from 'vitest'
import r32table from '../data/r32table.json'
import { r32Lookup } from './r32Lookup'
import { dataset } from '../test/helpers'

const TABLE = r32table as Record<string, Record<string, string>>
const GROUPS = 'ABCDEFGHIJKL'.split('')

/** The 8 "winner vs third" matches and the winner group they host. */
const WINNER_GROUP: Record<string, string> = {
  74: 'E', 77: 'I', 79: 'A', 80: 'L', 81: 'D', 82: 'G', 85: 'B', 87: 'K',
}

/** Allowed pools straight from the vendored fixtures (FIFA bracket). */
const poolFor = (matchId: number): string[] => {
  const fixture = dataset.fixtures.find((f) => f.id === matchId)!
  const slot = fixture.away.type === 'thirdPlace' ? fixture.away : fixture.home
  if (slot.type !== 'thirdPlace') throw new Error(`match ${matchId} hosts no third`)
  return slot.pool
}

const allCombinations = (): string[] => {
  const out: string[] = []
  const pick = (start: number, chosen: string[]) => {
    if (chosen.length === 8) {
      out.push(chosen.join(''))
      return
    }
    for (let i = start; i < GROUPS.length; i++) pick(i + 1, [...chosen, GROUPS[i]])
  }
  pick(0, [])
  return out
}

describe('r32 allocation table (FIFA Annex C)', () => {
  it('contains exactly the 495 possible qualifying combinations', () => {
    const expected = allCombinations()
    expect(expected).toHaveLength(495)
    expect(Object.keys(TABLE).sort()).toEqual(expected.sort())
  })

  it('every row produces a legal bracket: bijection, in-pool, no same-group rematch', () => {
    for (const [key, assignment] of Object.entries(TABLE)) {
      // the 8 assigned groups are exactly the 8 qualified groups
      expect(Object.values(assignment).sort().join('')).toBe(key)
      for (const [match, group] of Object.entries(assignment)) {
        expect(poolFor(Number(match))).toContain(group)
        expect(group).not.toBe(WINNER_GROUP[match])
      }
    }
  })

  it('matches documented rows of the published source', () => {
    // FIFA Annex C via the Wikipedia third-place-table template:
    expect(r32Lookup([...'EFGHIJKL'])['74']).toBe('F')
    expect(r32Lookup([...'ABCDGJKL'])['82']).toBe('A')
    expect(r32Lookup([...'ABCDEFGH'])).toEqual({
      '74': 'C', '77': 'F', '79': 'H', '80': 'E',
      '81': 'B', '82': 'A', '85': 'G', '87': 'D',
    })
  })

  it('accepts the key in any order and rejects invalid inputs loudly', () => {
    expect(r32Lookup([...'LKJIHGFE'])['74']).toBe('F')
    expect(() => r32Lookup([...'ABCDEFG'])).toThrow(/no R32 allocation/)
  })
})
