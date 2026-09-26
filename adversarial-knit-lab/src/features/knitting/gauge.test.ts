import { describe, expect, it } from 'vitest'
import {
  cellAspect,
  chartHeightCm,
  chartWidthCm,
  physicalSize,
  repeatFit,
  rowsForHeight,
  stitchesForWidth,
} from './gauge'
import { createGrid } from '../chart/grid'

const gauge = { stitchesPer10cm: 20, rowsPer10cm: 28 }

describe('gauge arithmetic', () => {
  it('matches the documented 100 x 140 regression case', () => {
    // 100 stitches at 20 sts/10 cm = 50 cm; 140 rows at 28 rows/10 cm = 50 cm.
    expect(chartWidthCm(100, gauge)).toBeCloseTo(50, 10)
    expect(chartHeightCm(140, gauge)).toBeCloseTo(50, 10)
    const size = physicalSize(createGrid(100, 140), gauge)
    expect(size.widthCm).toBeCloseTo(50, 10)
    expect(size.heightCm).toBeCloseTo(50, 10)
  })

  it('computes cell aspect as row gauge over stitch gauge', () => {
    expect(cellAspect(gauge)).toBeCloseTo(1.4, 10)
    expect(cellAspect({ stitchesPer10cm: 22, rowsPer10cm: 22 })).toBe(1)
  })

  it('round-trips stitch and row counts through physical sizes', () => {
    expect(stitchesForWidth(50, gauge)).toBe(100)
    expect(rowsForHeight(50, gauge)).toBe(140)
  })

  it('rejects a non-positive gauge', () => {
    expect(() => chartWidthCm(10, { stitchesPer10cm: 0, rowsPer10cm: 28 })).toThrow()
    expect(() => chartHeightCm(10, { stitchesPer10cm: 20, rowsPer10cm: -1 })).toThrow()
  })

  it('reports whether the chart holds a whole number of repeats', () => {
    const grid = createGrid(48, 60)
    expect(repeatFit(grid, { stitches: 16, rows: 20 })).toMatchObject({
      fitsHorizontally: true,
      fitsVertically: true,
      horizontalRepeats: 3,
      verticalRepeats: 3,
    })
    expect(repeatFit(grid, { stitches: 7, rows: 9 })).toMatchObject({
      fitsHorizontally: false,
      horizontalRemainder: 6,
      fitsVertically: false,
      verticalRemainder: 6,
    })
  })
})
