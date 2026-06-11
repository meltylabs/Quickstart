/**
 * persist — versioned localStorage blob. Five weeks of schema churn must
 * never wipe entered results (design doc, Milestone 1).
 *
 * Save/load decision tree:
 *
 *   load() ─▶ localStorage available?
 *               │no                       │yes
 *               ▼                          ▼
 *          in-memory fallback         JSON.parse ok AND v supported?
 *          (storageDegraded=true)          │no            │yes
 *                                          ▼              ▼
 *                                    keep raw blob     return state
 *                                    aside, return
 *                                    fresh state
 *                                    (never wipe)
 */
import type { Entries } from '../engine/types'

export const STORAGE_KEY = 'worldcup-whatif-v1'
/** Corrupt payloads are parked here instead of being destroyed. */
export const QUARANTINE_KEY = 'worldcup-whatif-quarantine'

export interface AppState {
  v: 1
  entries: Entries
  /** Knockout winner picks keyed by fixture id (team-keyed values). */
  picks: Record<number, string>
}

export interface LoadResult {
  state: AppState
  /** True when localStorage is unusable — UI shows the in-memory banner. */
  storageDegraded: boolean
  /** True when an unreadable blob was found and quarantined (not wiped). */
  recoveredFromCorrupt: boolean
}

export const freshState = (): AppState => ({ v: 1, entries: {}, picks: {} })

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** `null` = storage unusable (private mode / disabled / SecurityError). */
function defaultStorage(): StorageLike | null {
  try {
    const probe = '__worldcup_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function load(storage: StorageLike | null = defaultStorage()): LoadResult {
  if (!storage) {
    return { state: freshState(), storageDegraded: true, recoveredFromCorrupt: false }
  }
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { state: freshState(), storageDegraded: true, recoveredFromCorrupt: false }
  }
  if (raw === null) {
    return { state: freshState(), storageDegraded: false, recoveredFromCorrupt: false }
  }
  const state = parseState(raw)
  if (!state) {
    // Never destroy what we can't read — park it for manual recovery/export.
    try {
      storage.setItem(QUARANTINE_KEY, raw)
    } catch {
      /* quarantine is best-effort */
    }
    return { state: freshState(), storageDegraded: false, recoveredFromCorrupt: true }
  }
  return { state, storageDegraded: false, recoveredFromCorrupt: false }
}

export function save(
  state: AppState,
  storage: StorageLike | null = defaultStorage(),
): { saved: boolean } {
  if (!storage) return { saved: false }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return { saved: true }
  } catch {
    return { saved: false } // quota exceeded — caller keeps in-memory state
  }
}

/** Export for the backup button — also the import format. */
export function exportJson(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

export function importJson(raw: string): AppState | null {
  return parseState(raw)
}

function parseState(raw: string): AppState | null {
  try {
    const data: unknown = JSON.parse(raw)
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { v?: unknown }).v === 1 &&
      typeof (data as { entries?: unknown }).entries === 'object' &&
      (data as { entries?: unknown }).entries !== null
    ) {
      const blob = data as { v: 1; entries: Entries; picks?: Record<number, string> }
      return { v: 1, entries: blob.entries, picks: blob.picks ?? {} }
    }
    return null
  } catch {
    return null
  }
}
