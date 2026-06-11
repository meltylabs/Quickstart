/**
 * matchModel — Poisson goals from a strength differential.
 *
 *   fifaRank ──▶ rating (Elo-like scale, frozen for the tournament)
 *        │
 *        ▼
 *   win expectancy We = 1 / (1 + 10^(-Δ/400))      (classic Elo curve)
 *        │
 *        ▼
 *   λ_home = 0.4 + 2.2·We,  λ_away = 0.4 + 2.2·(1−We)
 *        │
 *        ▼
 *   goals ~ Poisson(λ)  ·  level knockout → strength-weighted coin flip
 *                          (penalty-shootout proxy, design doc M2)
 *
 * Ratings are an approximation derived from the FIFA ranking snapshot;
 * swapping in real published Elo is a Milestone 3 open question. Vibes-
 * accurate is the stated bar for this toy.
 */
import type { Score, TeamId } from '../engine/types'
import type { Rng } from './prng'

/** FIFA rank -> Elo-like rating. Rank 1 ≈ 2094, rank 85 ≈ 1548. */
export function ratingFromRank(fifaRank: number): number {
  return 2100 - 6.5 * fifaRank
}

export function winExpectancy(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

/** Knuth Poisson sampler — λ is always small here (≤ 2.6). */
export function poisson(lambda: number, rng: Rng): number {
  return poissonByLimit(Math.exp(-lambda), rng)
}

/** Hot-path variant: e^-λ precomputed (ratings are frozen, so λ never changes per pairing). */
function poissonByLimit(limit: number, rng: Rng): number {
  let count = 0
  let product = rng()
  while (product > limit) {
    count += 1
    product *= rng()
  }
  return count
}

export interface MatchModel {
  /** Sample a full-time scoreline for home vs away. */
  sampleScore(home: TeamId, away: TeamId, rng: Rng): Score
  /** Decide a level knockout match — strength-weighted coin flip. */
  pickLevelWinner(home: TeamId, away: TeamId, rng: Rng): TeamId
}

interface PairParams {
  we: number
  homeLimit: number // e^-λ_home
  awayLimit: number // e^-λ_away
}

export function createMatchModel(ratingOf: (team: TeamId) => number): MatchModel {
  // Ratings are frozen for the tournament (design doc, M2), so every pairing's
  // model parameters are constants — computed once, reused across 10k sims.
  const cache = new Map<string, PairParams>()
  const paramsFor = (home: TeamId, away: TeamId): PairParams => {
    const key = `${home}|${away}`
    let params = cache.get(key)
    if (!params) {
      const we = winExpectancy(ratingOf(home), ratingOf(away))
      params = {
        we,
        homeLimit: Math.exp(-(0.4 + 2.2 * we)),
        awayLimit: Math.exp(-(0.4 + 2.2 * (1 - we))),
      }
      cache.set(key, params)
    }
    return params
  }

  return {
    sampleScore(home, away, rng) {
      const { homeLimit, awayLimit } = paramsFor(home, away)
      return { home: poissonByLimit(homeLimit, rng), away: poissonByLimit(awayLimit, rng) }
    },
    pickLevelWinner(home, away, rng) {
      return rng() < paramsFor(home, away).we ? home : away
    },
  }
}
