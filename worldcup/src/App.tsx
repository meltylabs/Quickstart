/**
 * App — one guided flow, no tabs, no jargon (design doc UI principle):
 *
 *   predict groups A→L ─▶ pick winners round by round ─▶ champion screen
 *        ▲                                                    │
 *        └──────────── 🗺 tournament map (read-only) ◀────────┘
 *
 * The deterministic cascade recomputes on every render (microseconds —
 * deliberately no memoization). The 10k sim only ever runs behind the
 * explicit ✨/▶ buttons (eng review decision 7A).
 */
import { useRef, useState } from 'react'
import './App.css'
import type { Stage } from './engine/types'
import { resolveResults } from './engine/resolve'
import { groupTables } from './engine/groupTables'
import { knockoutCascade } from './engine/knockout'
import { useAppState } from './ui/useAppState'
import { GroupScreen } from './ui/GroupScreen'
import { KnockoutScreen } from './ui/KnockoutScreen'
import { ChampionScreen } from './ui/ChampionScreen'
import { TreeScreen } from './ui/TreeScreen'
import { exportJson, importJson } from './storage/persist'

const ROUNDS: Stage[] = ['R32', 'R16', 'QF', 'SF', 'FINAL']

type Page =
  | { type: 'group'; index: number }
  | { type: 'round'; index: number }
  | { type: 'champion' }
  | { type: 'map' }

export default function App() {
  const store = useAppState()
  const [page, setPage] = useState<Page>({ type: 'group', index: 0 })
  const importInput = useRef<HTMLInputElement>(null)

  const { dataset } = store
  const groups = [...new Set(dataset.teams.map((t) => t.group))].sort()

  // The whole pipeline, recomputed per render — resolveResults is the only
  // place precedence lives; the sim never goes through this path.
  const resolved = resolveResults(dataset.fixtures, store.entries, 'VIEW')
  const tables = groupTables(dataset, resolved)
  const bracket = knockoutCascade(dataset, resolved, tables, store.picks)

  const go = (next: Page) => setPage(next)
  const flowPosition =
    page.type === 'group' ? page.index : page.type === 'round' ? groups.length + page.index : null

  const onImport = async (file: File | undefined) => {
    if (!file) return
    const state = importJson(await file.text())
    if (state) store.importState(state)
    else window.alert("That file doesn't look like a What-If Machine backup.")
  }

  return (
    <main className="app">
      <header className="app-head">
        <h1 onClick={() => go({ type: 'group', index: 0 })}>My World Cup</h1>
        <button className="map-btn" aria-label="Tournament map" onClick={() => go({ type: 'map' })}>
          🗺
        </button>
      </header>

      {store.storageDegraded && (
        <p className="banner warn">⚠️ Can't save on this device — picks live only in this tab</p>
      )}
      {store.recoveredFromCorrupt && (
        <p className="banner warn">⚠️ Saved data couldn't be read — started fresh (old data kept aside)</p>
      )}
      {store.feed && store.feed.source !== 'remote' && (
        <p className="banner">
          {store.feed.source === 'cache'
            ? `○ offline — real results as of ${store.feed.fetchedAt?.slice(0, 10) ?? 'earlier'}`
            : '○ offline — real results will appear when you reconnect'}
        </p>
      )}

      {page.type === 'group' && (
        <GroupScreen
          dataset={dataset}
          group={groups[page.index]}
          groupIndex={page.index}
          groupCount={groups.length}
          resolved={resolved}
          table={tables.get(groups[page.index])!}
          bracket={bracket}
          setPrediction={store.setPrediction}
          fillGroup={store.fillGroup}
        />
      )}
      {page.type === 'round' && (
        <KnockoutScreen
          dataset={dataset}
          stage={ROUNDS[page.index]}
          bracket={bracket}
          setPick={store.setPick}
        />
      )}
      {page.type === 'champion' && (
        <ChampionScreen
          dataset={dataset}
          entries={store.entries}
          bracket={bracket}
          playOutTournament={store.playOutTournament}
          openMap={() => go({ type: 'map' })}
        />
      )}
      {page.type === 'map' && (
        <TreeScreen
          dataset={dataset}
          bracket={bracket}
          openStage={(stage) => go({ type: 'round', index: ROUNDS.indexOf(stage) })}
        />
      )}

      {flowPosition !== null && (
        <nav className="flow-nav">
          <button
            disabled={flowPosition === 0}
            onClick={() =>
              go(
                flowPosition <= groups.length
                  ? flowPosition === groups.length
                    ? { type: 'group', index: groups.length - 1 }
                    : { type: 'group', index: flowPosition - 1 }
                  : { type: 'round', index: flowPosition - groups.length - 1 },
              )
            }
          >
            ‹ Back
          </button>
          <button
            className="primary"
            onClick={() => {
              if (page.type === 'group') {
                go(
                  page.index + 1 < groups.length
                    ? { type: 'group', index: page.index + 1 }
                    : { type: 'round', index: 0 },
                )
              } else if (page.type === 'round') {
                go(
                  page.index + 1 < ROUNDS.length
                    ? { type: 'round', index: page.index + 1 }
                    : { type: 'champion' },
                )
              }
            }}
          >
            Next ›
          </button>
        </nav>
      )}
      {page.type === 'map' && (
        <nav className="flow-nav">
          <button onClick={() => go({ type: 'champion' })}>‹ Back to champion</button>
        </nav>
      )}

      <footer className="app-foot">
        <button
          onClick={() => {
            const blob = new Blob([exportJson(store.exportState())], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = 'my-world-cup-backup.json'
            link.click()
            URL.revokeObjectURL(url)
          }}
        >
          Save backup
        </button>
        <button onClick={() => importInput.current?.click()}>Load backup</button>
        <input
          ref={importInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => onImport(e.target.files?.[0])}
        />
        {store.feed?.source === 'remote' && <span className="live">● live results connected</span>}
      </footer>
    </main>
  )
}
