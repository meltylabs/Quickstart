/**
 * mulberry32 — tiny seeded PRNG. ALL engine randomness flows through an
 * injected Rng (never Math.random): tests are deterministic, and the seed
 * doubles as a shareable "story ID" so a simulated tournament can be
 * replayed exactly (eng review decision 6A).
 */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh random seed for "surprise me" runs (UI layer only). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}
