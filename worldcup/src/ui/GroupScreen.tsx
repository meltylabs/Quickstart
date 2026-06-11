import type { Dataset, Fixture, GroupTable, Resolved, Score, Team } from '../engine/types'
import type { Bracket } from '../engine/knockout'
import { teamLabel } from './format'

interface Props {
  dataset: Dataset
  group: string
  groupIndex: number
  groupCount: number
  resolved: Resolved
  table: GroupTable
  bracket: Bracket
  setPrediction(fixtureId: number, score: Score | null): void
  fillGroup(group: string): void
}

export function GroupScreen({
  dataset,
  group,
  groupIndex,
  groupCount,
  resolved,
  table,
  bracket,
  setPrediction,
  fillGroup,
}: Props) {
  const teamOf = new Map(dataset.teams.map((t) => [t.id, t]))
  const fixtures = dataset.fixtures.filter((f) => f.stage === 'GROUP' && f.group === group)
  const hasEmpty = fixtures.some((f) => !resolved.has(f.id))

  return (
    <section className="screen">
      <header className="screen-head">
        <div className="progress-dots" aria-label={`Group ${group} — ${groupIndex + 1} of ${groupCount}`}>
          {Array.from({ length: groupCount }, (_, i) => (
            <span key={i} className={i === groupIndex ? 'dot active' : i < groupIndex ? 'dot done' : 'dot'} />
          ))}
        </div>
        <h2>
          Group {group} <small>· {groupIndex + 1} of {groupCount}</small>
        </h2>
      </header>

      <div className="fixtures">
        {fixtures.map((f) => (
          <FixtureRow
            key={f.id}
            fixture={f}
            teamOf={teamOf}
            score={resolved.get(f.id)}
            setPrediction={setPrediction}
          />
        ))}
      </div>

      {hasEmpty && (
        <button className="magic" onClick={() => fillGroup(group)}>
          ✨ Fill in this group for me
        </button>
      )}

      <table className="standings">
        <tbody>
          {table.rows.map((row, position) => {
            const team = teamOf.get(row.team)!
            // the lots badge only matters once results exist — an untouched
            // group is trivially "tied" and the badge would be pure noise
            const anyPlayed = table.rows.some((r) => r.played > 0)
            return (
              <tr key={row.team}>
                <td className="pos">{position + 1}</td>
                <td className="name">
                  {teamLabel(team)}
                  {row.tiedByLots && anyPlayed && (
                    <span className="badge" title="Tied — settled by world ranking">tied — lots</span>
                  )}
                </td>
                <td className="pts">{row.pts} pts</td>
                <td className="status">{statusFor(table, position, bracket)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function statusFor(table: GroupTable, position: number, bracket: Bracket): string {
  if (!table.complete) return ''
  if (position <= 1) return '✓ going through'
  if (position === 2) {
    if (!bracket.thirds) return 'maybe'
    return bracket.thirds.qualifiedGroups.includes(table.group) ? '✓ going through' : 'out'
  }
  return 'out'
}

function FixtureRow({
  fixture,
  teamOf,
  score,
  setPrediction,
}: {
  fixture: Fixture
  teamOf: Map<string, Team>
  score?: Score & { provenance?: string }
  setPrediction(fixtureId: number, score: Score | null): void
}) {
  if (fixture.home.type !== 'team' || fixture.away.type !== 'team') return null
  const home = teamOf.get(fixture.home.team)!
  const away = teamOf.get(fixture.away.team)!
  const official = score?.provenance === 'official'

  const nudge = (side: 'home' | 'away', delta: number) => {
    const current = score ?? { home: 0, away: 0 }
    const next = {
      home: side === 'home' ? clamp(current.home + delta) : current.home,
      away: side === 'away' ? clamp(current.away + delta) : current.away,
    }
    setPrediction(fixture.id, next)
  }

  return (
    <div className={official ? 'fixture official' : 'fixture'}>
      <span className="team home">{teamLabel(home)}</span>
      {official ? (
        <span className="score locked" title="Real result">
          {score!.home}–{score!.away} <small>final</small>
        </span>
      ) : (
        <span className="score">
          <Stepper value={score?.home} onNudge={(d) => nudge('home', d)} label={`${home.name} goals`} />
          <span className="sep">–</span>
          <Stepper value={score?.away} onNudge={(d) => nudge('away', d)} label={`${away.name} goals`} />
        </span>
      )}
      <span className="team away">{teamLabel(away)}</span>
    </div>
  )
}

function Stepper({
  value,
  onNudge,
  label,
}: {
  value: number | undefined
  onNudge(delta: number): void
  label: string
}) {
  return (
    <span className="stepper">
      <button aria-label={`${label} down`} onClick={() => onNudge(-1)}>−</button>
      <b>{value ?? '·'}</b>
      <button aria-label={`${label} up`} onClick={() => onNudge(value === undefined ? 0 : 1)}>+</button>
    </span>
  )
}

const clamp = (n: number) => Math.max(0, Math.min(9, n))
