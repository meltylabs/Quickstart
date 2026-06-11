import { beforeEach, describe, expect, it } from 'vitest'
import { FEED_CACHE_KEY, loadDataset, seed } from './loadDataset'

/** A minimal valid feed: Group A opener played, R32 match 74 decided on pens. */
const validFeed = () => ({
  name: 'World Cup 2026',
  matches: [
    {
      round: 'Matchday 1',
      date: '2026-06-11',
      team1: 'Mexico',
      team2: 'South Africa',
      group: 'Group A',
      score1: 2,
      score2: 1,
    },
    {
      round: 'Matchday 1',
      date: '2026-06-11',
      team1: 'South Korea',
      team2: 'Czech Republic',
      group: 'Group A',
      // not played yet — no scores, must be skipped
    },
    {
      round: 'Round of 32',
      num: 74,
      date: '2026-06-29',
      team1: 'Germany',
      team2: 'Ecuador',
      score1: 1,
      score2: 1,
      score1et: 2,
      score2et: 2,
      score1p: 4,
      score2p: 3,
    },
  ],
})

const okFetch = (payload: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch

const failingFetch: typeof fetch = async () => {
  throw new TypeError('network down')
}

const openerFixtureId = seed.fixtures.find(
  (f) =>
    f.stage === 'GROUP' &&
    f.home.type === 'team' &&
    f.home.team === 'MEX' &&
    f.away.type === 'team' &&
    f.away.team === 'RSA',
)!.id

beforeEach(() => {
  window.localStorage.clear()
})

describe('loadDataset — fallback chain', () => {
  it('fetch OK: validates, extracts officials, and caches the payload', async () => {
    const result = await loadDataset({ fetchFn: okFetch(validFeed()), now: () => 'T1' })
    expect(result.source).toBe('remote')
    expect(result.fetchedAt).toBe('T1')
    // group opener mapped by date + team codes
    expect(result.officials[openerFixtureId]).toEqual({ official: { home: 2, away: 1 } })
    // knockout mapped by FIFA match number; ET aggregate + pens winner
    expect(result.officials[74]).toEqual({ official: { home: 2, away: 2, winner: 'GER' } })
    // unplayed match skipped
    expect(Object.keys(result.officials)).toHaveLength(2)
    expect(window.localStorage.getItem(FEED_CACHE_KEY)).toContain('"fetchedAt":"T1"')
  })

  it('fetch fails: falls back to the last good cached copy', async () => {
    await loadDataset({ fetchFn: okFetch(validFeed()), now: () => 'T1' }) // warm cache
    const result = await loadDataset({ fetchFn: failingFetch })
    expect(result.source).toBe('cache')
    expect(result.fetchedAt).toBe('T1')
    expect(result.officials[openerFixtureId]).toEqual({ official: { home: 2, away: 1 } })
  })

  it('fetch fails with no cache: vendored seed only, app still boots', async () => {
    const result = await loadDataset({ fetchFn: failingFetch })
    expect(result.source).toBe('seed')
    expect(result.officials).toEqual({})
    expect(result.dataset.teams).toHaveLength(48)
    expect(result.dataset.fixtures).toHaveLength(104)
  })

  it('schema drift: rejects the payload and keeps the last good cache', async () => {
    await loadDataset({ fetchFn: okFetch(validFeed()), now: () => 'T1' }) // warm cache
    const drifted = { matches: [{ totally: 'different', shape: 42 }] }
    const result = await loadDataset({ fetchFn: okFetch(drifted), now: () => 'T2' })
    expect(result.source).toBe('cache')
    expect(result.fetchedAt).toBe('T1') // cache NOT overwritten by garbage
    expect(result.officials[openerFixtureId]).toEqual({ official: { home: 2, away: 1 } })
  })
})
