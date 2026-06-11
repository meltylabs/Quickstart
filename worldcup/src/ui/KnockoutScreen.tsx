import type { Dataset, Stage, TeamId } from '../engine/types'
import type { Bracket, KnockoutNode } from '../engine/knockout'
import { STAGE_LABEL, slotHint, teamLabel } from './format'

interface Props {
  dataset: Dataset
  stage: Stage
  bracket: Bracket
  setPick(fixtureId: number, team: TeamId): void
}

export function KnockoutScreen({ dataset, stage, bracket, setPick }: Props) {
  const nodes = [...bracket.nodes.values()].filter((n) => n.fixture.stage === stage)
  const decidedCount = nodes.filter((n) => n.winner).length

  return (
    <section className="screen">
      <header className="screen-head">
        <h2>
          {STAGE_LABEL[stage]} <small>· pick your winners ({decidedCount}/{nodes.length})</small>
        </h2>
      </header>
      <div className="cards">
        {nodes.map((node) => (
          <MatchCard key={node.fixture.id} dataset={dataset} node={node} setPick={setPick} />
        ))}
      </div>
    </section>
  )
}

function MatchCard({
  dataset,
  node,
  setPick,
}: {
  dataset: Dataset
  node: KnockoutNode
  setPick(fixtureId: number, team: TeamId): void
}) {
  const teamOf = new Map(dataset.teams.map((t) => [t.id, t]))
  const { fixture } = node
  const teamName = (id: TeamId) => teamOf.get(id)?.name ?? id

  if (!node.home || !node.away) {
    return (
      <div className="card locked" data-testid={`match-${fixture.id}`}>
        <span className="match-no">Match {fixture.id}</span>
        <p className="hint">
          Waiting for {node.home ? slotHint(fixture.away, teamName) : slotHint(fixture.home, teamName)}
          {!node.home && !node.away ? ` and ${slotHint(fixture.away, teamName)}` : ''}
        </p>
      </div>
    )
  }

  const official = node.decidedBy === 'score'
  return (
    <div className={official ? 'card decided' : 'card'} data-testid={`match-${fixture.id}`}>
      <span className="match-no">Match {fixture.id}</span>
      {(['home', 'away'] as const).map((side) => {
        const team = teamOf.get(node[side]!)!
        const isWinner = node.winner === team.id
        return (
          <button
            key={team.id}
            className={isWinner ? 'pick winner' : 'pick'}
            disabled={official}
            onClick={() => setPick(fixture.id, team.id)}
          >
            {teamLabel(team)}
            {isWinner && <span className="check">✓</span>}
          </button>
        )
      })}
      {official && <p className="hint">Real result — locked</p>}
      {!official && !node.winner && <p className="hint">Tap the team you think goes through</p>}
    </div>
  )
}
