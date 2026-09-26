import { describe, expect, it } from 'vitest'
import { generatePattern, makeSettings, buildThresholds, quantise } from './generate'
import { FAMILIES, paramsForFamily } from './families'
import { chartContentHash } from '../chart/grid'
import { findRegions } from '../chart/regions'
import { DEFAULT_GAUGE, DEFAULT_PALETTE } from '../chart/project'
import { cellAspect } from '../knitting/gauge'

function request(overrides: Partial<Parameters<typeof generatePattern>[0]> = {}) {
  return {
    settings: makeSettings('multiscale-interference', 12345, paramsForFamily('multiscale-interference')),
    stitches: 48,
    rows: 60,
    colorCount: 4,
    repeat: { stitches: 24, rows: 30 },
    rowAspect: cellAspect(DEFAULT_GAUGE),
    ...overrides,
  }
}

describe('generatePattern', () => {
  it('is reproducible for the same seed and parameters', () => {
    const a = generatePattern(request())
    const b = generatePattern(request())
    expect(Array.from(b.cells)).toEqual(Array.from(a.cells))
  })

  it('produces different output for a different seed', () => {
    const a = generatePattern(request())
    const b = generatePattern(
      request({
        settings: makeSettings(
          'multiscale-interference',
          999,
          paramsForFamily('multiscale-interference'),
        ),
      }),
    )
    expect(Array.from(b.cells)).not.toEqual(Array.from(a.cells))
  })

  it('only ever writes valid palette indices, for every family and variant', () => {
    // Each family is exercised with its own variants: crossing every variant
    // name against every family tested combinations that cannot occur, and
    // built three times as many noise fields to do it.
    for (const family of FAMILIES) {
      if (family.id === 'imported-image') continue
      const params = paramsForFamily(family.id)
      for (const variant of family.variants) {
        const grid = generatePattern(
          request({
            settings: makeSettings(family.id, 7, { ...params, variant: variant.id }),
            colorCount: 3,
          }),
        )
        for (const value of grid.cells) {
          expect(value, `${family.id}/${variant.id}`).toBeGreaterThanOrEqual(0)
          expect(value, `${family.id}/${variant.id}`).toBeLessThan(3)
        }
      }
    }
    // Building a noise field per octave is the expensive part, so this stays
    // well above the default timeout even though one chart takes ~20 ms.
  }, 20_000)

  it('never exceeds the requested colour count', () => {
    const grid = generatePattern(request({ colorCount: 2 }))
    expect(new Set(grid.cells).size).toBeLessThanOrEqual(2)
  })

  it('returns a single-colour grid when only one colour is allowed', () => {
    const grid = generatePattern(request({ colorCount: 1 }))
    expect(new Set(grid.cells)).toEqual(new Set([0]))
  })

  it('produces a genuinely periodic tile when tiling is enabled', () => {
    const repeat = { stitches: 16, rows: 20 }
    // minRegion > 0 on purpose: the cleanup pass must not break periodicity.
    const params = { ...paramsForFamily('contour-network'), tileRepeat: true, minRegion: 2, symmetry: 0.6 }
    const grid = generatePattern(
      request({
        settings: makeSettings('contour-network', 4242, params),
        stitches: 48,
        rows: 60,
        repeat,
      }),
    )
    // The field is periodic by construction, so the chart must repeat exactly.
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.stitches; c++) {
        const tiled = grid.cells[(r % repeat.rows) * grid.stitches + (c % repeat.stitches)]
        expect(grid.cells[r * grid.stitches + c]).toBe(tiled)
      }
    }
  })

  it('respects the minimum region preference on a flat chart', () => {
    const params = {
      ...paramsForFamily('multiscale-interference'),
      minRegion: 3,
      featureSize: 4,
      tileRepeat: false,
    }
    const grid = generatePattern(
      request({ settings: makeSettings('multiscale-interference', 77, params) }),
    )
    expect(findRegions(grid).filter((region) => region.size <= 3)).toHaveLength(0)
  })

  it('respects it on a tiled chart, measured in the tile topology', () => {
    // A tiled chart is cleaned as a tile, with its edges joined. Measuring the
    // finished grid without that wrapping cuts wrapped regions at the outer
    // boundary and counts the offcuts, which is an artefact of the measurement
    // rather than of the chart.
    const params = {
      ...paramsForFamily('multiscale-interference'),
      minRegion: 3,
      featureSize: 4,
      tileRepeat: true,
    }
    const grid = generatePattern(
      request({ settings: makeSettings('multiscale-interference', 77, params) }),
    )
    const wrapped = findRegions(grid, { wrapColumns: true, wrapRows: true })
    expect(wrapped.filter((region) => region.size <= 3)).toHaveLength(0)
  })

  it('records a stable content hash for identical output', () => {
    const grid = generatePattern(request())
    const input = {
      grid,
      palette: DEFAULT_PALETTE,
      gauge: DEFAULT_GAUGE,
      workingMethod: 'flat-stranded' as const,
      repeat: { stitches: 24, rows: 30 },
    }
    expect(chartContentHash(input)).toBe(chartContentHash(input))
  })
})

describe('quantise', () => {
  it('maps values below the first threshold to the background', () => {
    const thresholds = [0.4, 0.7]
    expect(quantise(0.1, thresholds)).toBe(0)
    expect(quantise(0.4, thresholds)).toBe(1)
    expect(quantise(0.69, thresholds)).toBe(1)
    expect(quantise(0.7, thresholds)).toBe(2)
    expect(quantise(1, thresholds)).toBe(2)
  })

  it('builds ascending thresholds that leave the requested background share', () => {
    const params = { ...paramsForFamily('multiscale-interference'), density: 0.6 }
    const thresholds = buildThresholds(5, params, 4)
    expect(thresholds).toHaveLength(3)
    expect(thresholds[0]).toBeCloseTo(0.4, 6)
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]!).toBeGreaterThan(thresholds[i - 1]!)
      expect(thresholds[i]!).toBeLessThan(1)
    }
  })
})
