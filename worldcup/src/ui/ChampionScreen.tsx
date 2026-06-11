import { useState } from 'react'
import type { Dataset, Entries } from '../engine/types'
import type { Bracket } from '../engine/knockout'
import { championOdds, type OddsResult } from '../sim/monteCarlo'
import { randomSeed } from '../sim/prng'
import { plainOdds, teamLabel } from './format'
import { downloadShareCard } from './shareCard'

interface Props {
  dataset: Dataset
  entries: Entries
  bracket: Bracket
  playOutTournament(): void
  openMap(): void
}

export function ChampionScreen({ dataset, entries, bracket, playOutTournament, openMap }: Props) {
  const [odds, setOdds] = useState<OddsResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const teamOf = new Map(dataset.teams.map((t) => [t.id, t]))
  const champion = bracket.champion ? teamOf.get(bracket.champion) : undefined

  /** Explicit trigger ONLY (decision 7A) — never runs on input change. */
  const runOdds = () => {
    setBusy(true)
    setOdds(null)
    // let the spinner paint before the ~1s synchronous crunch
    setTimeout(() => {
      setOdds(championOdds(dataset, entries, randomSeed()))
      setBusy(false)
    }, 30)
  }

  const share = async () => {
    setShareError(null)
    if (!champion) return
    try {
      await downloadShareCard(dataset, bracket, champion)
    } catch {
      setShareError("Couldn't make your card — try again")
    }
  }

  return (
    <section className="screen">
      {champion ? (
        <div className="champion-banner">
          <span className="trophy">🏆</span>
          <h2>Your World Cup champion</h2>
          <p className="champion-name">{teamLabel(champion)}</p>
          <button className="secondary" onClick={share}>📸 Make a share card</button>
          {shareError && <p className="error" role="alert">{shareError}</p>}
        </div>
      ) : (
        <div className="champion-banner">
          <span className="trophy">🏆</span>
          <h2>Crown your champion</h2>
          <p className="hint">Finish your picks — or let the magic button do it.</p>
        </div>
      )}

      <button className="magic" onClick={playOutTournament}>
        ✨ Play out the whole tournament for me
      </button>

      <div className="odds-panel">
        <button className="secondary" onClick={runOdds} disabled={busy}>
          {busy ? 'Playing 10,000 tournaments…' : '▶ Who actually wins this thing?'}
        </button>
        {busy && <div className="spinner" aria-label="working" />}
        {odds && (
          <ol className="odds-list">
            {[...odds.champion.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([teamId, p]) => (
                <li key={teamId}>
                  <span>{teamLabel(teamOf.get(teamId)!)}</span>
                  <span className="odds">{plainOdds(p)}</span>
                </li>
              ))}
          </ol>
        )}
        {odds && <p className="hint">From 10,000 imaginary tournaments. Real results stay real.</p>}
      </div>

      <button className="secondary" onClick={openMap}>🗺 See the whole tournament</button>
    </section>
  )
}
