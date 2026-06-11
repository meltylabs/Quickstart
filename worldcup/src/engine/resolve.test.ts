import { describe, expect, it } from 'vitest'
import { resolveResults } from './resolve'
import type { Entries, Fixture } from './types'

const fixture = (id: number): Fixture => ({
  id,
  stage: 'GROUP',
  group: 'A',
  date: '2026-06-11',
  venue: 'Test',
  home: { type: 'team', team: 'MEX' },
  away: { type: 'team', team: 'RSA' },
})

const fixtures = [fixture(1), fixture(2), fixture(3)]

describe('resolveResults — VIEW overlay (official ▸ predicted ▸ empty)', () => {
  it('official beats predicted; predicted fills the rest; absent stays unresolved', () => {
    const entries: Entries = {
      1: { official: { home: 2, away: 0 }, predicted: { home: 0, away: 5 } },
      2: { predicted: { home: 1, away: 1 } },
      // fixture 3: nothing entered
    }
    const resolved = resolveResults(fixtures, entries, 'VIEW')
    expect(resolved.get(1)).toEqual({ home: 2, away: 0, provenance: 'official' })
    expect(resolved.get(2)).toEqual({ home: 1, away: 1, provenance: 'predicted' })
    expect(resolved.get(3)).toBeUndefined()
  })

  it('never consults pins or a sampler', () => {
    const entries: Entries = { 1: { pinned: { home: 9, away: 9 } } }
    const resolved = resolveResults(fixtures, entries, 'VIEW', () => ({ home: 7, away: 7 }))
    expect(resolved.get(1)).toBeUndefined()
  })
})

describe('resolveResults — SIM overlay (official ▸ pinned ▸ model-sample)', () => {
  it('official beats pin beats sample; predictions are ignored entirely', () => {
    const entries: Entries = {
      1: { official: { home: 3, away: 1 }, pinned: { home: 0, away: 4 } },
      2: { pinned: { home: 0, away: 2 }, predicted: { home: 5, away: 5 } },
      3: { predicted: { home: 5, away: 5 } },
    }
    const resolved = resolveResults(fixtures, entries, 'SIM', () => ({ home: 1, away: 0 }))
    expect(resolved.get(1)).toEqual({ home: 3, away: 1, provenance: 'official' })
    expect(resolved.get(2)).toEqual({ home: 0, away: 2, provenance: 'pinned' })
    // fixture 3's prediction does NOT constrain the sim — the sampler decides
    expect(resolved.get(3)).toEqual({ home: 1, away: 0, provenance: 'sampled' })
  })

  it('without a sampler, unpinned fixtures stay unresolved', () => {
    const resolved = resolveResults(fixtures, {}, 'SIM')
    expect(resolved.size).toBe(0)
  })
})
