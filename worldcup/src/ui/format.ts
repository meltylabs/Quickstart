/** Plain-language formatting — the UI never says "simulate", "Monte Carlo",
 *  or shows percentages-first (design doc UI principle). */
import type { Slot, Team, TeamId } from '../engine/types'

/** 0.21 → "about 1 in 5" ; 0.034 → "about 1 in 29" ; tiny → "a long shot" */
export function plainOdds(probability: number): string {
  if (probability <= 0) return 'no path left'
  if (probability < 0.005) return 'a long shot'
  if (probability > 0.85) return 'almost certain'
  const n = Math.round(1 / probability)
  return n <= 1 ? 'almost certain' : `about 1 in ${n}`
}

export const STAGE_LABEL: Record<string, string> = {
  R32: 'Last 32',
  R16: 'Last 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  THIRD: 'Third place',
  FINAL: 'The Final',
}

/** What a TBD slot is waiting for, in plain words. */
export function slotHint(slot: Slot, teamName: (id: TeamId) => string): string {
  switch (slot.type) {
    case 'team':
      return teamName(slot.team)
    case 'groupWinner':
      return `Group ${slot.group} winner`
    case 'groupRunnerUp':
      return `Group ${slot.group} runner-up`
    case 'thirdPlace':
      return 'a best 3rd-place team'
    case 'matchWinner':
      return `winner of match ${slot.match}`
    case 'matchLoser':
      return `loser of match ${slot.match}`
  }
}

export function teamLabel(team: Team): string {
  return `${team.flag} ${team.name}`
}
