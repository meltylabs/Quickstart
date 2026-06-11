import type { Dataset, Stage } from '../engine/types'
import type { Bracket } from '../engine/knockout'
import { STAGE_LABEL } from './format'

interface Props {
  dataset: Dataset
  bracket: Bracket
  /** Tapping a match jumps back into the guided flow to edit. */
  openStage(stage: Stage): void
}

const COLUMNS: Stage[] = ['R32', 'R16', 'QF', 'SF', 'FINAL']

export function TreeScreen({ dataset, bracket, openStage }: Props) {
  const teamOf = new Map(dataset.teams.map((t) => [t.id, t]))
  const short = (id?: string) => (id ? `${teamOf.get(id)?.flag ?? ''} ${id}` : '· · ·')

  return (
    <section className="screen tree">
      <header className="screen-head">
        <h2>🗺 Tournament map <small>· tap any match to edit</small></h2>
      </header>
      <div className="tree-grid">
        {COLUMNS.map((stage) => (
          <div className="tree-col" key={stage}>
            <h3>{STAGE_LABEL[stage]}</h3>
            {[...bracket.nodes.values()]
              .filter((n) => n.fixture.stage === stage)
              .map((n) => (
                <button
                  key={n.fixture.id}
                  className="tree-node"
                  onClick={() => openStage(stage)}
                  title={`Match ${n.fixture.id}`}
                >
                  <span className={n.winner === n.home && n.home ? 'won' : ''}>{short(n.home)}</span>
                  <span className={n.winner === n.away && n.away ? 'won' : ''}>{short(n.away)}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
      {bracket.champion && (
        <p className="tree-champion">🏆 {teamOf.get(bracket.champion)?.name}</p>
      )}
    </section>
  )
}
