/**
 * Procedural scalar fields.
 *
 * Seamless tiles use a genuinely periodic construction: the tile's x axis is
 * mapped onto a circle in the (a,b) plane of 4D simplex noise and the y axis
 * onto a circle in the (c,d) plane. Sampling the field at x and x + tileWidth
 * therefore returns the same 4D point, so the tile is periodic by construction
 * rather than by being copied.
 *
 * Reference for the 4D noise implementation: simplex-noise (MIT, jwagner),
 * https://github.com/jwagner/simplex-noise.js
 */
import { createNoise2D, createNoise4D } from 'simplex-noise'
import { createRng, deriveSeed } from './rng'

export interface FieldOptions {
  seed: number
  /** Stream label so two fields from the same seed are independent. */
  stream: string
  /** Approximate feature diameter, measured in stitches/rows. */
  featureSize: number
  /** fBm octave count. 1 disables fBm. */
  octaves?: number
  /** Amplitude ratio between successive octaves. */
  persistence?: number
  /** Frequency ratio between successive octaves. */
  lacunarity?: number
  /**
   * Tile dimensions in stitches/rows. When set, the field is exactly periodic
   * with these periods. When omitted, the field is non-periodic.
   */
  tile?: { width: number; height: number } | undefined
  /**
   * Physical cell aspect (row gauge / stitch gauge). Values above 1 mean rows
   * are shorter than stitches are wide, so the y axis is compressed to keep
   * features visually round in the finished fabric.
   */
  rowAspect?: number
}

export type ScalarField = (x: number, y: number) => number

/** Build a scalar field returning roughly [-1, 1]. */
export function createField(options: FieldOptions): ScalarField {
  const {
    seed,
    stream,
    featureSize,
    octaves = 1,
    persistence = 0.5,
    lacunarity = 2,
    tile,
    rowAspect = 1,
  } = options

  const size = Math.max(1e-3, featureSize)
  const layers: ScalarField[] = []
  let amplitude = 1
  let totalAmplitude = 0
  let frequency = 1

  for (let o = 0; o < Math.max(1, Math.floor(octaves)); o++) {
    const rng = createRng(deriveSeed(seed, `${stream}/octave${o}`))
    const layerSize = size / frequency
    const amp = amplitude
    if (tile) {
      const noise4 = createNoise4D(rng.next)
      // Circle radii chosen so one stitch of travel equals 1/layerSize noise
      // units of arc length: r = period / (2 * PI * layerSize).
      const rx = tile.width / (2 * Math.PI * layerSize)
      const ry = tile.height / (2 * Math.PI * layerSize * rowAspect)
      const kx = (2 * Math.PI) / tile.width
      const ky = (2 * Math.PI) / tile.height
      layers.push((x, y) => {
        const ax = Math.cos(x * kx) * rx
        const bx = Math.sin(x * kx) * rx
        const cy = Math.cos(y * ky) * ry
        const dy = Math.sin(y * ky) * ry
        return amp * noise4(ax, bx, cy, dy)
      })
    } else {
      const noise2 = createNoise2D(rng.next)
      layers.push((x, y) => amp * noise2(x / layerSize, y / (layerSize * rowAspect)))
    }
    totalAmplitude += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }

  const inv = 1 / (totalAmplitude || 1)
  if (layers.length === 1) {
    const only = layers[0] as ScalarField
    return (x, y) => only(x, y) * inv
  }
  return (x, y) => {
    let sum = 0
    for (const layer of layers) sum += layer(x, y)
    return sum * inv
  }
}

/**
 * Domain warping: displace the sample position of `base` using two offset
 * fields. Both offset fields share the base field's tiling, so a warped tile
 * stays periodic.
 */
export function warpField(
  base: ScalarField,
  offsetX: ScalarField,
  offsetY: ScalarField,
  strength: number,
): ScalarField {
  if (strength === 0) return base
  return (x, y) => base(x + offsetX(x, y) * strength, y + offsetY(x, y) * strength)
}

/** Smoothstep. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Wrap a value into [0, period). Correct for negative inputs. */
export function wrap(value: number, period: number): number {
  const m = value % period
  return m < 0 ? m + period : m
}
