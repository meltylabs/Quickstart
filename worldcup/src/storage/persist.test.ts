import { beforeEach, describe, expect, it } from 'vitest'
import {
  QUARANTINE_KEY,
  STORAGE_KEY,
  exportJson,
  freshState,
  importJson,
  load,
  save,
  type AppState,
} from './persist'

const sampleState = (): AppState => ({
  v: 1,
  entries: { 1: { official: { home: 2, away: 0 } }, 5: { predicted: { home: 1, away: 1 } } },
  picks: { 74: 'GER' },
})

beforeEach(() => {
  window.localStorage.clear()
})

describe('persist — save/load round-trip', () => {
  it('round-trips the v1 blob through localStorage', () => {
    const state = sampleState()
    expect(save(state)).toEqual({ saved: true })
    const result = load()
    expect(result.state).toEqual(state)
    expect(result.storageDegraded).toBe(false)
    expect(result.recoveredFromCorrupt).toBe(false)
  })

  it('returns fresh state on first load with nothing stored', () => {
    const result = load()
    expect(result.state).toEqual(freshState())
    expect(result.recoveredFromCorrupt).toBe(false)
  })
})

describe('persist — corrupt blob recovery', () => {
  it('recovers from corrupt JSON without wiping it (quarantines the blob)', () => {
    window.localStorage.setItem(STORAGE_KEY, '{definitely not json')
    const result = load()
    expect(result.state).toEqual(freshState())
    expect(result.recoveredFromCorrupt).toBe(true)
    expect(window.localStorage.getItem(QUARANTINE_KEY)).toBe('{definitely not json')
  })

  it('treats an unsupported version as corrupt rather than guessing', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 99, entries: {} }))
    const result = load()
    expect(result.state).toEqual(freshState())
    expect(result.recoveredFromCorrupt).toBe(true)
  })
})

describe('persist — storage unavailable', () => {
  it('falls back to in-memory with the degraded flag when storage is missing', () => {
    const result = load(null)
    expect(result.state).toEqual(freshState())
    expect(result.storageDegraded).toBe(true)
  })

  it('reports save failure when the quota is exceeded', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    }
    expect(save(sampleState(), throwing)).toEqual({ saved: false })
  })
})

describe('persist — export/import', () => {
  it('round-trips through export/import JSON', () => {
    const state = sampleState()
    expect(importJson(exportJson(state))).toEqual(state)
  })

  it('rejects invalid import payloads with null, never throwing', () => {
    expect(importJson('not json at all')).toBeNull()
    expect(importJson('{"v":2,"entries":{}}')).toBeNull()
    expect(importJson('{"entries":{}}')).toBeNull()
  })
})
