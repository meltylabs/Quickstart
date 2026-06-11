/**
 * Core engine types — pure data, no framework imports anywhere in src/engine/.
 *
 * The whole engine is one pipeline (see resolve.ts for the overlay diagram):
 *
 *   resolveResults(entries, overlay)
 *         │
 *         ▼
 *   groupTables → bestThirds → r32Lookup(495) → knockoutCascade → champion
 */

export type Stage = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL'

/** Team identifier = FIFA three-letter code (e.g. 'MEX'). */
export type TeamId = string

/** Group letter 'A'..'L'. */
export type GroupId = string

export interface Team {
  id: TeamId
  name: string
  group: GroupId
  /** Pre-tournament FIFA World Ranking snapshot — last-resort tiebreaker. */
  fifaRank: number
  flag: string
}

/**
 * Where a fixture's participant comes from. Group fixtures always carry
 * concrete teams; knockout fixtures reference upstream outcomes and only
 * resolve to teams once those outcomes are determined.
 */
export type Slot =
  | { type: 'team'; team: TeamId }
  | { type: 'groupWinner'; group: GroupId }
  | { type: 'groupRunnerUp'; group: GroupId }
  | { type: 'thirdPlace'; pool: GroupId[] }
  | { type: 'matchWinner'; match: number }
  | { type: 'matchLoser'; match: number }

export interface Fixture {
  /** FIFA match number for knockouts (73-104); schedule order 1-72 for groups. */
  id: number
  stage: Stage
  group?: GroupId
  date: string
  time?: string
  venue: string
  home: Slot
  away: Slot
}

export interface Dataset {
  version: number
  tournament: string
  source: string
  teams: Team[]
  fixtures: Fixture[]
}

/**
 * A scoreline. `winner` names the team that advances when the score is level
 * in a knockout match (extra time / penalties proxy). It is team-keyed on
 * purpose: if the fixture's participants change, a stale winner is detectable.
 */
export interface Score {
  home: number
  away: number
  winner?: TeamId
}

/** Everything the user (or the live feed) has said about one fixture. */
export interface MatchEntries {
  /** Real result, from the feed or manual confirmation. Beats everything. */
  official?: Score
  /** The user's prediction. Display layer only — never constrains the sim. */
  predicted?: Score
  /** A what-if pin. Sim layer only. */
  pinned?: Score
}

/** All user entries, keyed by fixture id. */
export type Entries = Record<number, MatchEntries>

/** Which layer a resolved score came from — drives UI badges. */
export type Provenance = 'official' | 'predicted' | 'pinned' | 'sampled'

export interface ResolvedScore extends Score {
  provenance: Provenance
}

/** fixture id -> resolved score (absent = unresolved, renders as TBD). */
export type Resolved = Map<number, ResolvedScore>

/** One team's line in a group table. */
export interface TableRow {
  team: TeamId
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  pts: number
  /**
   * True when this row's final position was decided only by the FIFA-ranking
   * fallback (the "tied — lots" badge in the UI).
   */
  tiedByLots: boolean
}

export interface GroupTable {
  group: GroupId
  /** Ranked best -> worst. */
  rows: TableRow[]
  /** All 6 group matches resolved — positions are final for the cascade. */
  complete: boolean
}
