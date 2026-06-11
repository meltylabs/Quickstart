/**
 * loadDataset — the app's one deliberate network dependency (design 1B).
 *
 * The vendored seed is ALWAYS the dataset (teams, fixtures, bracket slots) —
 * fixture ids stay stable no matter what the network says. The runtime fetch
 * only harvests OFFICIAL RESULTS from the public openfootball feed, which
 * fills in scores as the real tournament unfolds.
 *
 * Fallback chain (every step degrades, nothing ever breaks offline):
 *
 *   fetch feed ──ok──▶ validate ──ok──▶ officials from remote ─▶ cache it
 *       │                  │
 *       │fail              │drift/garbage (reject — keep last good cache)
 *       ▼                  ▼
 *   cached copy? ──yes──▶ officials from cache
 *       │no
 *       ▼
 *   seed only (no officials yet — manual entry still works)
 */
import type { Dataset, Entries, Score, TeamId } from '../engine/types'
import seedJson from './seed.json'

export const FEED_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'
export const FEED_CACHE_KEY = 'worldcup-feed-cache-v1'

export const seed = seedJson as Dataset

export type FeedSource = 'remote' | 'cache' | 'seed'

export interface FeedResult {
  dataset: Dataset
  /** Official results only — merge into entries at the official layer. */
  officials: Entries
  source: FeedSource
  /** ISO timestamp of when the remote payload was fetched (remote/cache). */
  fetchedAt?: string
}

interface FeedMatch {
  round: string
  date: string
  team1: string
  team2: string
  num?: number
  group?: string
  score1?: number
  score2?: number
  score1et?: number
  score2et?: number
  score1p?: number
  score2p?: number
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LoadOptions {
  fetchFn?: typeof fetch
  storage?: StorageLike | null
  now?: () => string
}

export async function loadDataset(options: LoadOptions = {}): Promise<FeedResult> {
  const fetchFn = options.fetchFn ?? fetch
  const storage = options.storage === undefined ? safeStorage() : options.storage
  const now = options.now ?? (() => new Date().toISOString())

  // 1. Try the network.
  try {
    const response = await fetchFn(FEED_URL)
    if (response.ok) {
      const payload: unknown = await response.json()
      const matches = validateFeed(payload)
      if (matches) {
        const fetchedAt = now()
        try {
          storage?.setItem(FEED_CACHE_KEY, JSON.stringify({ fetchedAt, matches }))
        } catch {
          /* cache write is best-effort */
        }
        return { dataset: seed, officials: extractOfficials(matches), source: 'remote', fetchedAt }
      }
      // Schema drift: fall through to cache — never trust a shape we don't know.
    }
  } catch {
    /* network failure: fall through */
  }

  // 2. Last good cached copy.
  const cached = readCache(storage)
  if (cached) {
    return {
      dataset: seed,
      officials: extractOfficials(cached.matches),
      source: 'cache',
      fetchedAt: cached.fetchedAt,
    }
  }

  // 3. Vendored seed only.
  return { dataset: seed, officials: {}, source: 'seed' }
}

function safeStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readCache(storage: StorageLike | null): { fetchedAt: string; matches: FeedMatch[] } | null {
  try {
    const raw = storage?.getItem(FEED_CACHE_KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const { fetchedAt, matches } = data as { fetchedAt?: unknown; matches?: unknown }
    if (typeof fetchedAt !== 'string') return null
    const valid = validateFeed({ matches })
    return valid ? { fetchedAt, matches: valid } : null
  } catch {
    return null
  }
}

/** Accept only the shape we know; anything else is schema drift. */
function validateFeed(payload: unknown): FeedMatch[] | null {
  if (typeof payload !== 'object' || payload === null) return null
  const matches = (payload as { matches?: unknown }).matches
  if (!Array.isArray(matches) || matches.length === 0) return null
  for (const m of matches) {
    if (typeof m !== 'object' || m === null) return null
    const match = m as Record<string, unknown>
    if (typeof match.team1 !== 'string' || typeof match.team2 !== 'string') return null
    if (typeof match.date !== 'string' || typeof match.round !== 'string') return null
    for (const key of ['score1', 'score2', 'score1et', 'score2et', 'score1p', 'score2p', 'num']) {
      if (key in match && typeof match[key] !== 'number') return null
    }
  }
  return matches as unknown as FeedMatch[]
}

/**
 * Convert played feed matches into official entries keyed by our fixture ids.
 * Group matches are identified by date + both team codes; knockouts by FIFA
 * match number. Matches without scores are simply skipped.
 */
function extractOfficials(matches: FeedMatch[]): Entries {
  const codeByName = new Map(seed.teams.map((t) => [t.name, t.id]))
  const groupFixtureByKey = new Map<string, number>()
  for (const f of seed.fixtures) {
    if (f.stage === 'GROUP' && f.home.type === 'team' && f.away.type === 'team') {
      groupFixtureByKey.set(`${f.date}|${f.home.team}|${f.away.team}`, f.id)
    }
  }

  const officials: Entries = {}
  for (const m of matches) {
    if (typeof m.score1 !== 'number' || typeof m.score2 !== 'number') continue
    const score = toScore(m, codeByName)
    if (!score) continue

    let fixtureId: number | undefined
    if (m.group) {
      const home = codeByName.get(m.team1)
      const away = codeByName.get(m.team2)
      if (home && away) fixtureId = groupFixtureByKey.get(`${m.date}|${home}|${away}`)
    } else {
      fixtureId =
        m.num ?? (m.round === 'Match for third place' ? 103 : m.round === 'Final' ? 104 : undefined)
    }
    if (fixtureId !== undefined) officials[fixtureId] = { official: score }
  }
  return officials
}

function toScore(m: FeedMatch, codeByName: Map<string, TeamId>): Score | null {
  // Aggregate after extra time when it went there; otherwise full time.
  const home = m.score1et ?? m.score1
  const away = m.score2et ?? m.score2
  if (typeof home !== 'number' || typeof away !== 'number') return null
  const score: Score = { home, away }
  if (home !== away) return score
  // Level knockout: winner from penalties (team names resolve only if real).
  if (typeof m.score1p === 'number' && typeof m.score2p === 'number' && m.score1p !== m.score2p) {
    const winnerName = m.score1p > m.score2p ? m.team1 : m.team2
    const winner = codeByName.get(winnerName)
    if (winner) score.winner = winner
  }
  return score
}
