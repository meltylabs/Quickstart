/**
 * useAppState — all app state + actions in one hook.
 *
 *   boot ─▶ persist.load() ─▶ loadDataset() merges feed officials
 *   every action ─▶ new {entries, picks} ─▶ validatePicks ─▶ persist.save()
 *
 * The deterministic cascade derives from this state on every render
 * (microseconds — deliberately no memoization, see eng review). The Monte
 * Carlo sim is NOT derived state: it runs only behind explicit triggers
 * (decision 7A) via the actions below.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Dataset, Entries, Score } from '../engine/types'
import { resolveResults } from '../engine/resolve'
import { groupTables } from '../engine/groupTables'
import { validatePicks, type Picks } from '../engine/knockout'
import { load, save, type AppState } from '../storage/persist'
import { loadDataset, seed, type FeedSource } from '../data/loadDataset'
import { simulateOne } from '../sim/monteCarlo'
import { createMatchModel, ratingFromRank } from '../sim/matchModel'
import { mulberry32, randomSeed } from '../sim/prng'

export interface FeedStatus {
  source: FeedSource
  fetchedAt?: string
}

export interface AppStore {
  dataset: Dataset
  entries: Entries
  picks: Picks
  feed: FeedStatus | null
  storageDegraded: boolean
  recoveredFromCorrupt: boolean
  setPrediction(fixtureId: number, score: Score | null): void
  setPick(fixtureId: number, team: string): void
  fillGroup(group: string): void
  playOutTournament(): void
  importState(state: AppState): void
  exportState(): AppState
}

export function useAppState(): AppStore {
  const dataset = seed
  const [boot] = useState(() => load())
  const [entries, setEntries] = useState<Entries>(boot.state.entries)
  const [picks, setPicks] = useState<Picks>(boot.state.picks as Picks)
  const [feed, setFeed] = useState<FeedStatus | null>(null)

  // One-time feed fetch: official results land in the official layer.
  useEffect(() => {
    let cancelled = false
    loadDataset().then(({ officials, source, fetchedAt }) => {
      if (cancelled) return
      setFeed({ source, fetchedAt })
      if (Object.keys(officials).length > 0) {
        commit((current) => {
          const next: Entries = { ...current }
          for (const [id, value] of Object.entries(officials)) {
            next[Number(id)] = { ...next[Number(id)], official: value.official }
          }
          return next
        })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Apply an entries update, re-validate picks, persist — the ONE write path. */
  function commit(update: (entries: Entries) => Entries, pickUpdate?: (picks: Picks) => Picks) {
    setEntries((currentEntries) => {
      const nextEntries = update(currentEntries)
      setPicks((currentPicks) => {
        const wanted = pickUpdate ? pickUpdate(currentPicks) : currentPicks
        const resolved = resolveResults(dataset.fixtures, nextEntries, 'VIEW')
        const tables = groupTables(dataset, resolved)
        const nextPicks = validatePicks(dataset, resolved, tables, wanted)
        save({ v: 1, entries: nextEntries, picks: nextPicks })
        return nextPicks
      })
      return nextEntries
    })
  }

  const model = useMemo(() => {
    const rankOf = new Map(dataset.teams.map((t) => [t.id, t.fifaRank]))
    return createMatchModel((team) => ratingFromRank(rankOf.get(team) ?? 100))
  }, [dataset])

  return {
    dataset,
    entries,
    picks,
    feed,
    storageDegraded: boot.storageDegraded,
    recoveredFromCorrupt: boot.recoveredFromCorrupt,

    setPrediction(fixtureId, score) {
      commit((current) => {
        const entry = { ...current[fixtureId] }
        if (score) entry.predicted = score
        else delete entry.predicted
        return { ...current, [fixtureId]: entry }
      })
    },

    setPick(fixtureId, team) {
      commit(
        (current) => current,
        (currentPicks) => ({ ...currentPicks, [fixtureId]: team }),
      )
    },

    /** ✨ "Fill in this group for me" — explicit trigger, samples empties only. */
    fillGroup(group) {
      const rng = mulberry32(randomSeed())
      commit((current) => {
        const next = { ...current }
        for (const f of dataset.fixtures) {
          if (f.stage !== 'GROUP' || f.group !== group) continue
          if (f.home.type !== 'team' || f.away.type !== 'team') continue
          const entry = next[f.id]
          if (entry?.official || entry?.predicted) continue
          next[f.id] = { ...entry, predicted: model.sampleScore(f.home.team, f.away.team, rng) }
        }
        return next
      })
    },

    /** ✨ "Play out the whole tournament for me" — one full simulated story. */
    playOutTournament() {
      const story = simulateOne(dataset, entries, randomSeed())
      commit(
        (current) => {
          const next = { ...current }
          for (const [id, score] of story.resolved) {
            if (score.provenance !== 'sampled') continue
            const fixture = dataset.fixtures.find((f) => f.id === id)
            if (fixture?.stage !== 'GROUP') continue
            const entry = next[id]
            if (entry?.official || entry?.predicted) continue
            next[id] = { ...entry, predicted: { home: score.home, away: score.away } }
          }
          return next
        },
        (currentPicks) => {
          const nextPicks = { ...currentPicks }
          for (const node of story.bracket.nodes.values()) {
            if (!node.winner || nextPicks[node.fixture.id]) continue
            if (node.decidedBy === 'sampled' || node.decidedBy === 'score') {
              // sampled winners become picks; official ('score' from the feed)
              // results don't need picks — the cascade reads them directly
              if (node.decidedBy === 'sampled') nextPicks[node.fixture.id] = node.winner
            }
          }
          return nextPicks
        },
      )
    },

    importState(state) {
      commit(
        () => state.entries,
        () => state.picks as Picks,
      )
    },

    exportState() {
      return { v: 1, entries, picks }
    },
  }
}
