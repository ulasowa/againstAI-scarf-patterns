/**
 * Procedural pattern generation.
 *
 * Output is fully determined by (family, variant, seed, params, dimensions,
 * colour count, gauge row aspect, generator version). Nothing here reads the
 * clock or Math.random, so a stored GeneratorSettings always reproduces the
 * same chart.
 *
 * The field is evaluated per stitch, then hard-quantised into palette indices.
 * Hard quantisation is the point: the chart is the deliverable, so every visual
 * decision has to survive it.
 */
import type { GeneratorParams, GeneratorSettings, StitchGrid } from '../../types/project'
import { GENERATOR_VERSION } from '../../types/project'
import { createField, clamp, warpField, wrap, type ScalarField } from '../../lib/noise'
import { createRng, deriveSeed } from '../../lib/rng'
import { createGrid, indexOf, sampleTiled } from '../chart/grid'
import { removeSmallRegions } from '../chart/regions'

export interface GenerateRequest {
  settings: GeneratorSettings
  stitches: number
  rows: number
  /** Number of palette entries the pattern may use. */
  colorCount: number
  /** Repeat dimensions; used as the tiling period when params.tileRepeat is on. */
  repeat: { stitches: number; rows: number }
  /** rowsPer10cm / stitchesPer10cm — keeps features visually round in fabric. */
  rowAspect: number
}

export function generatePattern(request: GenerateRequest): StitchGrid {
  const { settings, stitches, rows, repeat, rowAspect } = request
  const colorCount = Math.max(1, Math.min(255, Math.floor(request.colorCount)))
  const params = settings.params
  const grid = createGrid(stitches, rows)
  if (colorCount === 1) return grid

  const tile = params.tileRepeat
    ? {
        width: Math.max(2, Math.min(repeat.stitches, stitches)),
        height: Math.max(2, Math.min(repeat.rows, rows)),
      }
    : undefined

  // In tiling mode the tile itself is generated and cleaned, then repeated.
  // Cleaning the full chart instead would merge regions across tile copies and
  // silently destroy the periodicity the field was built to guarantee.
  const fieldWidth = tile ? tile.width : stitches
  const fieldHeight = tile ? tile.height : rows

  const value = buildField(settings, { stitches: fieldWidth, rows: fieldHeight, tile, rowAspect })
  const thresholds = buildThresholds(settings.seed, params, colorCount)
  const symmetry = buildSymmetry(settings.seed, params, fieldHeight, fieldWidth)

  let source = tile ? createGrid(fieldWidth, fieldHeight) : grid
  for (let r = 0; r < fieldHeight; r++) {
    const mirror = symmetry(r)
    for (let c = 0; c < fieldWidth; c++) {
      const sx = mirror ? fieldWidth - 1 - c : c
      const raw = value(sx, r)
      const shaped = applyContrast(raw, params.contrast)
      source.cells[indexOf(source, r, c)] = quantise(shaped, thresholds)
    }
  }

  if (params.minRegion > 0) {
    source = removeSmallRegions(source, Math.floor(params.minRegion), {
      wrapColumns: Boolean(tile),
      wrapRows: Boolean(tile),
    })
  }

  if (!tile) return source

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < stitches; c++) {
      grid.cells[indexOf(grid, r, c)] = sampleTiled(source, r, c)
    }
  }
  return grid
}

/* ------------------------------------------------------------------ *
 * Field construction
 * ------------------------------------------------------------------ */

interface FieldContext {
  stitches: number
  rows: number
  tile: { width: number; height: number } | undefined
  rowAspect: number
}

/** Returns a field in roughly [0, 1]. */
function buildField(settings: GeneratorSettings, ctx: FieldContext): ScalarField {
  const { params, seed, family } = settings
  const base = `${family}/${params.variant}`
  const featureSize = Math.max(1.5, params.featureSize)

  const coarse = createField({
    seed,
    stream: `${base}/coarse`,
    featureSize,
    octaves: 3,
    persistence: 0.55,
    tile: ctx.tile,
    rowAspect: ctx.rowAspect,
  })
  const fine = createField({
    seed,
    stream: `${base}/fine`,
    featureSize: Math.max(1.2, featureSize * 0.32),
    octaves: 2,
    persistence: 0.5,
    tile: ctx.tile,
    rowAspect: ctx.rowAspect,
  })

  let mixed: ScalarField = (x, y) =>
    coarse(x, y) * (1 - params.detailBalance) + fine(x, y) * params.detailBalance

  if (params.warp > 0) {
    const wx = createField({
      seed,
      stream: `${base}/warpX`,
      featureSize: featureSize * 1.8,
      octaves: 2,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    })
    const wy = createField({
      seed,
      stream: `${base}/warpY`,
      featureSize: featureSize * 1.8,
      octaves: 2,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    })
    mixed = warpField(mixed, wx, wy, params.warp * featureSize)
  }

  const structured = applyFamily(settings, mixed, ctx, featureSize)
  return (x, y) => clamp(structured(x, y) * 0.5 + 0.5, 0, 1)
}

/**
 * Family-specific structure, applied to the shared noise mix in [-1, 1].
 *
 * Each branch targets a structural property reported in the adversarial-texture
 * literature. None of them reproduces a published attack; see families.ts.
 */
function applyFamily(
  settings: GeneratorSettings,
  field: ScalarField,
  ctx: FieldContext,
  featureSize: number,
): ScalarField {
  const { family, params, seed } = settings

  switch (family) {
    case 'high-frequency':
      return highFrequencyField(settings, field, ctx, featureSize)
    case 'multiscale-interference':
      return multiscaleField(settings, field, ctx, featureSize)
    case 'contour-network':
      return contourField(settings, field, ctx, featureSize)
    case 'chromatic-shock':
      return chromaticField(params, field, ctx, featureSize, createRng(deriveSeed(seed, 'phase')).next())
    default:
      return field
  }
}

/* ---------------------- high-frequency disruption ------------------- */

/**
 * Structure at one to three stitches, which is the smallest a knitted fabric
 * can hold. Optimised patches are consistently high-frequency; at this
 * resolution the stitch is the pixel.
 */
function highFrequencyField(
  settings: GeneratorSettings,
  field: ScalarField,
  ctx: FieldContext,
  featureSize: number,
): ScalarField {
  const { params, seed } = settings
  // Deliberately ignores large featureSize values: this family is about the
  // small scale, and letting it drift upwards would just be noise again.
  const fine = Math.min(3.2, Math.max(1.1, featureSize * 0.4))

  if (params.variant === 'ordered-dither') {
    // A Bayer lattice gives regular high-frequency energy; a slow field decides
    // where it flips, so the result is structured rather than random.
    const slow = createField({
      seed,
      stream: 'dither-slow',
      featureSize: Math.max(6, featureSize * 2.5),
      octaves: 2,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    })
    return (x, y) => {
      const threshold = bayer4(Math.round(x), Math.round(y))
      return slow(x, y) > threshold * 0.9 - 0.45 ? 1 : -1
    }
  }

  if (params.variant === 'micro-checks') {
    const period = Math.max(1, Math.round(fine))
    const flip = createField({
      seed,
      stream: 'check-flip',
      featureSize: Math.max(4, featureSize * 2),
      octaves: 1,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    })
    return (x, y) => {
      const cx = Math.floor(x / period)
      const cy = Math.floor(y / period)
      const base = (cx + cy) % 2 === 0 ? 1 : -1
      // The phase inverts wherever the slow field crosses zero.
      return flip(x, y) > 0 ? base : -base
    }
  }

  // speckle
  const dense = createField({
    seed,
    stream: 'speckle',
    featureSize: fine,
    octaves: 2,
    persistence: 0.85,
    tile: ctx.tile,
    rowAspect: ctx.rowAspect,
  })
  return (x, y) => clamp(dense(x, y) * 1.4 + field(x, y) * (1 - params.detailBalance) * 0.4, -1, 1)
}

/** 4x4 ordered dither matrix, normalised to [0, 1). */
function bayer4(x: number, y: number): number {
  const MATRIX = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ]
  const row = MATRIX[((y % 4) + 4) % 4] as number[]
  return (row[((x % 4) + 4) % 4] as number) / 16
}

/* ---------------------- multiscale interference --------------------- */

/**
 * Several scales at equal strength.
 *
 * fBm decays with each octave, so one shape size dominates. Here the octaves
 * are summed at equal amplitude, so coarse, medium and fine structure compete
 * across the range of receptive-field sizes a detector pools over.
 */
function multiscaleField(
  settings: GeneratorSettings,
  field: ScalarField,
  ctx: FieldContext,
  featureSize: number,
): ScalarField {
  const { params, seed } = settings

  if (params.variant === 'nested-blocks') {
    const levels = [1, 0.4, 0.16].map((scale, index) =>
      createField({
        seed,
        stream: `block${index}`,
        featureSize: Math.max(1.2, featureSize * scale),
        octaves: 1,
        tile: ctx.tile,
        rowAspect: ctx.rowAspect,
      }),
    )
    const sizes = [1, 0.4, 0.16].map((scale) => Math.max(1, Math.round(featureSize * scale)))
    return (x, y) => {
      let value = 0
      levels.forEach((level, index) => {
        const step = sizes[index] as number
        // Quantise the sample position: blocks, not blobs.
        const bx = Math.floor(x / step) * step
        const by = Math.floor(y / step) * step
        value += level(bx, by) * (index === 0 ? 1 : 0.75)
      })
      return clamp(value / 2.2, -1, 1)
    }
  }

  if (params.variant === 'ridged-shards') {
    const octaves = [1, 0.5, 0.25, 0.125].map((scale, index) =>
      createField({
        seed,
        stream: `ridge${index}`,
        featureSize: Math.max(1.2, featureSize * scale),
        octaves: 1,
        tile: ctx.tile,
        rowAspect: ctx.rowAspect,
      }),
    )
    return (x, y) => {
      let value = 0
      for (const octave of octaves) value += 1 - 2 * Math.abs(octave(x, y))
      return clamp(value / octaves.length, -1, 1)
    }
  }

  // octave-stack
  const octaves = [1, 0.45, 0.2, 0.09].map((scale, index) =>
    createField({
      seed,
      stream: `equal${index}`,
      featureSize: Math.max(1.2, featureSize * scale),
      octaves: 1,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    }),
  )
  return (x, y) => {
    let value = 0
    for (const octave of octaves) value += octave(x, y)
    return clamp((value / octaves.length) * 1.6 + field(x, y) * 0.15, -1, 1)
  }
}

/* -------------------------- contour network ------------------------- */

/**
 * Many edges, no object.
 *
 * A detector assembles contours into object proposals. Dense contours that
 * cross and terminate give it edges everywhere and nothing that closes.
 */
function contourField(
  settings: GeneratorSettings,
  field: ScalarField,
  ctx: FieldContext,
  featureSize: number,
): ScalarField {
  const { params, seed } = settings
  const lineWidth = 0.08 + (1 - params.contrast) * 0.18
  // More rings for smaller features; this is what makes the network dense.
  const rings = Math.max(2, Math.round(28 / Math.max(2, featureSize)))

  if (params.variant === 'maze') {
    const a = createField({
      seed,
      stream: 'maze-a',
      featureSize: Math.max(2, featureSize * 0.7),
      octaves: 1,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    })
    const b = createField({
      seed,
      stream: 'maze-b',
      featureSize: Math.max(2, featureSize * 0.7),
      octaves: 1,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    })
    return (x, y) => {
      // Two orthogonal ridge sets: horizontal and vertical corridors that meet.
      const h = Math.abs(a(x, y)) < lineWidth ? 1 : -1
      const v = Math.abs(b(y, x)) < lineWidth ? 1 : -1
      return Math.max(h, v)
    }
  }

  if (params.variant === 'broken-contours') {
    const cut = createField({
      seed,
      stream: 'contour-cut',
      featureSize: Math.max(2, featureSize * 0.8),
      octaves: 2,
      tile: ctx.tile,
      rowAspect: ctx.rowAspect,
    })
    return (x, y) => {
      const level = Math.abs(wrap((field(x, y) + 1) * rings, 1) - 0.5) * 2
      const onLine = level < lineWidth
      // Every line is interrupted where the cutting field runs high, so no
      // contour ever closes.
      return onLine && cut(x, y) < 0.25 ? 1 : -1
    }
  }

  // dense-rings
  return (x, y) => {
    const level = Math.abs(wrap((field(x, y) + 1) * rings, 1) - 0.5) * 2
    return level < lineWidth ? 1 : -1 + Math.abs(field(x, y)) * 0.2
  }
}

/* ------------------------- chromatic shock -------------------------- */

/**
 * Hard edges only.
 *
 * Natural images have smooth local colour statistics; optimised patches do
 * not. Hard palette quantisation already removes gradients from a knitting
 * chart, and this family leans into that instead of fighting it.
 */
function chromaticField(
  params: GeneratorParams,
  field: ScalarField,
  ctx: FieldContext,
  featureSize: number,
  phase: number,
): ScalarField {
  const period = Math.max(2, featureSize)
  const jitter = 0.4 + params.detailBalance * 0.8
  const width = ctx.tile?.width ?? ctx.stitches
  const height = ctx.tile?.height ?? ctx.rows
  // Snap periods to whole divisions of the tile so geometry stays periodic.
  const xPeriod = ctx.tile ? width / Math.max(1, Math.round(width / period)) : period
  const yPeriod = ctx.tile ? height / Math.max(1, Math.round(height / period)) : period

  switch (params.variant) {
    case 'shards': {
      // Cell edges from the gap between the two nearest lattice sites: the
      // classic cellular construction, kept periodic by wrapping the lattice.
      const cell = Math.max(2, featureSize)
      const cols = Math.max(1, Math.round(width / cell))
      const rows = Math.max(1, Math.round(height / cell))
      return (x, y) => {
        const gx = (x / width) * cols
        const gy = (y / height) * rows
        let nearest = Infinity
        let second = Infinity
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const cx = Math.floor(gx) + dx
            const cy = Math.floor(gy) + dy
            const wx = ((cx % cols) + cols) % cols
            const wy = ((rows + (cy % rows)) % rows)
            const jx = cx + hash01(wx, wy, 11) 
            const jy = cy + hash01(wx, wy, 29)
            const distance = Math.hypot(gx - jx, gy - jy)
            if (distance < nearest) {
              second = nearest
              nearest = distance
            } else if (distance < second) {
              second = distance
            }
          }
        }
        // Near a boundary the two nearest sites are equidistant.
        const edge = second - nearest
        return edge < 0.16 ? 1 : clamp(-1 + nearest * 1.4, -1, 1)
      }
    }
    case 'offset-check': {
      return (x, y) => {
        const rowBlock = Math.floor(y / yPeriod)
        const shift = (rowBlock % 2) * xPeriod * 0.5
        const cx = Math.floor((x + shift) / xPeriod)
        const check = (cx + rowBlock) % 2 === 0 ? 1 : -1
        return clamp(check + field(x, y) * jitter, -1, 1)
      }
    }
    case 'zigzag': {
      return (x, y) => {
        const chevron = Math.abs(wrap(x / xPeriod + phase, 1) - 0.5) * 2
        const travel = wrap(y / yPeriod + chevron * 0.9, 1)
        const band = Math.abs(travel - 0.5) * 2
        return clamp(band * 2 - 1 + field(x, y) * jitter, -1, 1)
      }
    }
    case 'hard-bands':
    default: {
      return (x, y) => {
        const band = Math.abs(wrap(y / yPeriod + phase, 1) - 0.5) * 2
        const breakUp = field(x, y)
        const cut = breakUp > 0.3 ? -1 : 1
        return clamp((band * 2 - 1) * cut + breakUp * jitter * 0.5, -1, 1)
      }
    }
  }
}

/** Deterministic value in [0, 1) for a lattice site. */
function hash01(x: number, y: number, salt: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453
  return n - Math.floor(n)
}

/* ------------------------------------------------------------------ *
 * Quantisation
 * ------------------------------------------------------------------ */

/**
 * Push values away from the middle so that bands become flatter and region
 * boundaries cleaner. The mapping is monotonic, so ordering is preserved.
 */
export function applyContrast(value: number, contrast: number): number {
  if (contrast <= 0) return value
  const k = 1 + contrast * 4
  const centred = (value - 0.5) * k
  return clamp(0.5 + centred, 0, 1)
}

/**
 * Band edges over [0, 1]. Index 0 (background) gets `1 - density` of the range;
 * the remaining colours share the rest with seed-dependent, uneven widths so
 * the result does not look mechanical.
 */
export function buildThresholds(
  seed: number,
  params: GeneratorParams,
  colorCount: number,
): number[] {
  const density = clamp(params.density, 0.02, 0.98)
  const backgroundEdge = 1 - density
  const remaining = colorCount - 1
  if (remaining <= 0) return []
  if (remaining === 1) return [backgroundEdge]

  const rng = createRng(deriveSeed(seed, 'thresholds'))
  const weights: number[] = []
  let total = 0
  for (let i = 0; i < remaining; i++) {
    const w = 0.6 + rng.next() * 0.8
    weights.push(w)
    total += w
  }
  const edges: number[] = [backgroundEdge]
  let at = backgroundEdge
  for (let i = 0; i < remaining - 1; i++) {
    at += ((weights[i] as number) / total) * density
    edges.push(at)
  }
  return edges
}

export function quantise(value: number, thresholds: readonly number[]): number {
  let index = 0
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= (thresholds[i] as number)) index = i + 1
    else break
  }
  return index
}

/* ------------------------------------------------------------------ *
 * Symmetry
 * ------------------------------------------------------------------ */

/**
 * Mirror whole horizontal bands about the chart centre. Because the chart width
 * equals the tile period in tiling mode, mirroring the full width preserves
 * periodicity.
 */
function buildSymmetry(
  seed: number,
  params: GeneratorParams,
  rows: number,
  stitches: number,
): (row: number) => boolean {
  if (params.symmetry <= 0) return () => false
  const bandHeight = Math.max(2, Math.round(Math.max(3, params.featureSize) * 1.6))
  const bands = Math.ceil(rows / bandHeight)
  const rng = createRng(deriveSeed(seed, `symmetry/${stitches}`))
  const mirrored: boolean[] = []
  for (let i = 0; i < bands; i++) mirrored.push(rng.next() < params.symmetry)
  return (row) => mirrored[Math.floor(row / bandHeight)] ?? false
}

/* ------------------------------------------------------------------ *
 * Settings helpers
 * ------------------------------------------------------------------ */

export function makeSettings(
  family: GeneratorSettings['family'],
  seed: number,
  params: GeneratorParams,
): GeneratorSettings {
  return { family, version: GENERATOR_VERSION, seed, params }
}

export function randomSeed(): number {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }
  if (g.crypto?.getRandomValues) {
    return g.crypto.getRandomValues(new Uint32Array(1))[0] as number
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
