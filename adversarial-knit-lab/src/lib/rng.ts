/**
 * Deterministic pseudo-random numbers.
 *
 * Every generator, candidate-search pool and transformation sample in this app
 * draws from here so that a stored seed fully reproduces a result. Nothing in
 * the domain layer is allowed to call Math.random().
 */

/** Mix a 32-bit integer seed (variant of SplitMix32 / Mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Derive a stable 32-bit seed from a string (FNV-1a). */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Combine a base seed with a stream label so sub-systems never share a stream. */
export function deriveSeed(seed: number, stream: string): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ seedFromString(stream)) >>> 0
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform in [min, max). */
  range(min: number, max: number): number
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T
  /** In-place Fisher-Yates shuffle; returns the same array. */
  shuffle<T>(items: T[]): T[]
  /** True with the given probability. */
  chance(p: number): boolean
  /** Approximately standard-normal (Box-Muller). */
  normal(): number
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed)
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() called on an empty array')
      return items[Math.floor(next() * items.length)] as T
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const a = items[i] as T
        const b = items[j] as T
        items[i] = b
        items[j] = a
      }
      return items
    },
    chance: (p) => next() < p,
    normal(): number {
      // Guard against log(0).
      const u = 1 - next()
      const v = next()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
  }
  return rng
}
