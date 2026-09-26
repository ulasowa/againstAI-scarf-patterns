import { describe, expect, it } from 'vitest'
import { SIZE_PRESETS, repeatsInSize, sizeToStitches } from './garments'
import { chartHeightCm, chartWidthCm } from './gauge'
import { MAX_ROWS, MAX_STITCHES } from '../chart/grid'

const gauge = { stitchesPer10cm: 20, rowsPer10cm: 28 }

describe('sizeToStitches', () => {
  it('converts a finished size through the gauge', () => {
    // 25 cm at 20 sts/10 cm = 50 stitches; 180 cm at 28 rows/10 cm = 504 rows.
    const result = sizeToStitches(25, 180, gauge)
    expect(result.stitches).toBe(50)
    expect(result.rows).toBe(504)
  })

  it('reports the size actually achieved after rounding to whole stitches', () => {
    const result = sizeToStitches(23, 41, gauge)
    expect(result.actualWidthCm).toBeCloseTo(chartWidthCm(result.stitches, gauge), 10)
    expect(result.actualLengthCm).toBeCloseTo(chartHeightCm(result.rows, gauge), 10)
    // Rounding can only move the result by less than one stitch.
    expect(Math.abs(result.actualWidthCm - 23)).toBeLessThan(10 / gauge.stitchesPer10cm)
  })

  it('follows the gauge rather than a fixed ratio', () => {
    const loose = sizeToStitches(25, 25, { stitchesPer10cm: 14, rowsPer10cm: 18 })
    const tight = sizeToStitches(25, 25, { stitchesPer10cm: 30, rowsPer10cm: 40 })
    expect(tight.stitches).toBeGreaterThan(loose.stitches)
    expect(tight.rows).toBeGreaterThan(loose.rows)
  })

  it('clamps an over-large piece and explains what to do instead', () => {
    const result = sizeToStitches(500, 500, gauge)
    expect(result.clamped).toBe(true)
    expect(result.stitches).toBeLessThanOrEqual(MAX_STITCHES)
    expect(result.rows).toBeLessThanOrEqual(MAX_ROWS)
    expect(result.warning).toMatch(/repeat/)
  })

  it('never returns a zero or negative chart', () => {
    const result = sizeToStitches(0, -5, gauge)
    expect(result.stitches).toBeGreaterThan(0)
    expect(result.rows).toBeGreaterThan(0)
  })
})

describe('size presets', () => {
  it('all fit the chart limits at a typical worsted gauge', () => {
    for (const preset of SIZE_PRESETS) {
      const result = sizeToStitches(preset.widthCm, preset.lengthCm, gauge)
      expect(result.stitches, preset.id).toBeLessThanOrEqual(MAX_STITCHES)
      // A 200 cm scarf legitimately exceeds the row limit; it is charted as a
      // repeat, which is what the warning says.
      if (result.clamped) expect(result.warning).toBeTruthy()
    }
  })

  it('have plausible, distinct proportions', () => {
    const ids = SIZE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of SIZE_PRESETS) {
      expect(preset.widthCm).toBeGreaterThan(0)
      expect(preset.lengthCm).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(20)
    }
  })

  it('marks the cowl as circular, because the width is a circumference', () => {
    const cowl = SIZE_PRESETS.find((p) => p.id === 'cowl')
    expect(cowl?.method).toBe('circular-stranded')
  })
})

describe('repeatsInSize', () => {
  it('counts how many repeats cover a finished size', () => {
    // 50 stitches over a 25-stitch repeat = 2 across.
    const result = repeatsInSize(25, 50, { stitches: 25, rows: 35 }, gauge)
    expect(result.across).toBe(2)
    expect(result.along).toBe(4)
  })

  it('never returns zero repeats for a tiny piece', () => {
    const result = repeatsInSize(1, 1, { stitches: 40, rows: 40 }, gauge)
    expect(result.across).toBe(1)
    expect(result.along).toBe(1)
  })
})
