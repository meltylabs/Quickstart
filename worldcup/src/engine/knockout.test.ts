import { describe, expect, it } from 'vitest'
import { resolveResults } from './resolve'
import { groupTables } from './groupTables'
import { knockoutCascade, validatePicks, type Picks } from './knockout'
import { betterRanked, dataset, fullGroupEntries, type Override } from '../test/helpers'
import type { Entries } from './types'

const stateFor = (entries: Entries) => {
  const resolved = resolveResults(dataset.fixtures, entries, 'VIEW')
  return { resolved, tables: groupTables(dataset, resolved) }
}

/** Pick the better-FIFA-ranked participant of every decidable knockout node. */
const pickFavorites = (entries: Entries): Picks => {
  const picks: Picks = {}
  // iterate until no new picks appear (each pass unlocks the next round)
  for (;;) {
    const { resolved, tables } = stateFor(entries)
    const bracket = knockoutCascade(dataset, resolved, tables, picks)
    let added = false
    for (const node of bracket.nodes.values()) {
      if (node.home && node.away && !picks[node.fixture.id]) {
        picks[node.fixture.id] = betterRanked(node.home, node.away)
        added = true
      }
    }
    if (!added) return picks
  }
}

describe('knockoutCascade', () => {
  it('full cascade: complete groups + favorite picks crown France champion', () => {
    const entries = fullGroupEntries()
    const picks = pickFavorites(entries)
    const { resolved, tables } = stateFor(entries)
    const bracket = knockoutCascade(dataset, resolved, tables, picks)

    expect(bracket.thirds).not.toBeNull()
    expect(bracket.r32).not.toBeNull()
    // every node resolved, all 32 knockout fixtures present
    expect(bracket.nodes.size).toBe(32)
    expect([...bracket.nodes.values()].every((n) => n.winner)).toBe(true)
    // better rank always wins → FIFA #1 France lifts the trophy
    expect(bracket.champion).toBe('FRA')
    expect(bracket.nodes.get(104)!.decidedBy).toBe('pick')
  })

  it('partial groups: undetermined feeders propagate TBD all the way down', () => {
    // Only Group A complete — everything else empty.
    const entries: Entries = {}
    for (const f of dataset.fixtures.filter((f) => f.stage === 'GROUP' && f.group === 'A')) {
      const full = fullGroupEntries()
      entries[f.id] = full[f.id]
    }
    const { resolved, tables } = stateFor(entries)
    const bracket = knockoutCascade(dataset, resolved, tables, {})

    const m73 = bracket.nodes.get(73)! // 2A vs 2B
    expect(m73.home).toBeDefined() // 2A known
    expect(m73.away).toBeUndefined() // group B untouched → TBD
    expect(m73.winner).toBeUndefined()
    const m74 = bracket.nodes.get(74)! // 1E vs 3rd pool — thirds need ALL groups
    expect(m74.home).toBeUndefined()
    expect(m74.away).toBeUndefined()
    expect(bracket.champion).toBeUndefined()
  })

  it('official knockout scores beat picks; level score needs the winner field', () => {
    const entries = fullGroupEntries()
    const { resolved: r0, tables } = stateFor(entries)
    const bracket0 = knockoutCascade(dataset, r0, tables, {})
    const m73 = bracket0.nodes.get(73)!
    const [home, away] = [m73.home!, m73.away!]

    // decisive official score: away wins despite a contrary pick
    entries[73] = { official: { home: 0, away: 2 } }
    let { resolved } = stateFor(entries)
    let bracket = knockoutCascade(dataset, resolved, tables, { 73: home })
    expect(bracket.nodes.get(73)!.winner).toBe(away)
    expect(bracket.nodes.get(73)!.decidedBy).toBe('score')

    // level score with NO winner field: undetermined (winner toggle required)
    entries[73] = { official: { home: 1, away: 1 } }
    ;({ resolved } = stateFor(entries))
    bracket = knockoutCascade(dataset, resolved, tables, {})
    expect(bracket.nodes.get(73)!.winner).toBeUndefined()

    // level score WITH winner field: that team advances
    entries[73] = { official: { home: 1, away: 1, winner: away } }
    ;({ resolved } = stateFor(entries))
    bracket = knockoutCascade(dataset, resolved, tables, {})
    expect(bracket.nodes.get(73)!.winner).toBe(away)
  })
})

describe('pick invalidation (CRITICAL path)', () => {
  it('upstream group change cascades downstream picks back to TBD', () => {
    // Baseline: Germany tops group E; user picks GER through matches 74 and 89.
    const entries = fullGroupEntries()
    const { resolved: r0, tables: t0 } = stateFor(entries)
    const baseline = knockoutCascade(dataset, r0, t0, {})
    expect(baseline.nodes.get(74)!.home).toBe('GER') // 1E

    const m73 = baseline.nodes.get(73)!
    const survivorPick = betterRanked(m73.home!, m73.away!)
    // Match 89 = W74 vs W77 — both feeders need picks for 89 to be pickable.
    expect(baseline.nodes.get(77)!.home).toBe('FRA') // 1I
    const picks: Picks = { 73: survivorPick, 74: 'GER', 77: 'FRA', 89: 'GER' }

    // sanity: with baseline groups, all three picks are live
    expect(validatePicks(dataset, r0, t0, picks)).toEqual(picks)

    // Now Ecuador upsets Germany 9-0 → ECU tops group E, GER drops to 2E.
    const upset: Override = (_f, home, away) =>
      home === 'GER' && away === 'ECU'
        ? { home: 0, away: 9 }
        : home === 'ECU' && away === 'GER'
          ? { home: 9, away: 0 }
          : undefined
    const changed = fullGroupEntries(undefined, upset)
    const { resolved: r1, tables: t1 } = stateFor(changed)

    const bracket = knockoutCascade(dataset, r1, t1, picks)
    expect(bracket.nodes.get(74)!.home).toBe('ECU') // participant changed
    expect(bracket.nodes.get(74)!.winner).toBeUndefined() // stale GER pick ignored
    expect(bracket.nodes.get(89)!.home).toBeUndefined() // TBD propagates

    // validatePicks prunes the stale pick AND its downstream dependent,
    // while unrelated picks (match 73, match 77) survive.
    expect(validatePicks(dataset, r1, t1, picks)).toEqual({ 73: survivorPick, 77: 'FRA' })
  })
})
