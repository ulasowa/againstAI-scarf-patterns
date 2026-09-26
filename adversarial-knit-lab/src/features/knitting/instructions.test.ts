import { describe, expect, it } from 'vitest'
import { buildInstructions, instructionsToGrid, readsRightToLeft } from './instructions'
import { createGrid, indexOf } from '../chart/grid'
import { DEFAULT_PALETTE } from '../chart/project'
import type { StitchGrid } from '../../types/project'

/** Row 0 (bottom) = [0,0,1,1]; row 1 = [1,0,1,0]. */
function sample(): StitchGrid {
  const grid = createGrid(4, 2)
  const rows = [
    [0, 0, 1, 1],
    [1, 0, 1, 0],
  ]
  rows.forEach((values, r) =>
    values.forEach((v, c) => {
      grid.cells[indexOf(grid, r, c)] = v
    }),
  )
  return grid
}

describe('reading direction', () => {
  it('alternates for flat work, starting right to left on row 1', () => {
    expect(readsRightToLeft('flat-stranded', 1)).toBe(true)
    expect(readsRightToLeft('flat-stranded', 2)).toBe(false)
    expect(readsRightToLeft('flat-stranded', 3)).toBe(true)
  })

  it('reads every round right to left in circular work', () => {
    expect(readsRightToLeft('circular-stranded', 1)).toBe(true)
    expect(readsRightToLeft('circular-stranded', 2)).toBe(true)
  })

  it('treats duplicate stitch as placement read left to right', () => {
    expect(readsRightToLeft('duplicate-stitch', 1)).toBe(false)
    expect(readsRightToLeft('duplicate-stitch', 2)).toBe(false)
  })
})

describe('buildInstructions', () => {
  it('emits runs in working order for a flat right-side row', () => {
    const set = buildInstructions(sample(), DEFAULT_PALETTE, 'flat-stranded')
    const row1 = set.rows[0]!
    // Row 1 is RS and read right to left, so storage [0,0,1,1] is worked as 1,1,0,0.
    expect(row1.side).toBe('RS')
    expect(row1.runs).toEqual([
      { paletteIndex: 1, count: 2 },
      { paletteIndex: 0, count: 2 },
    ])
  })

  it('emits the wrong-side row in storage order', () => {
    const set = buildInstructions(sample(), DEFAULT_PALETTE, 'flat-stranded')
    const row2 = set.rows[1]!
    expect(row2.side).toBe('WS')
    expect(row2.runs).toEqual([
      { paletteIndex: 1, count: 1 },
      { paletteIndex: 0, count: 1 },
      { paletteIndex: 1, count: 1 },
      { paletteIndex: 0, count: 1 },
    ])
  })

  it('labels circular work as rounds with no side', () => {
    const set = buildInstructions(sample(), DEFAULT_PALETTE, 'circular-stranded')
    expect(set.unit).toBe('Round')
    expect(set.rows.every((r) => r.side === '')).toBe(true)
    expect(set.rows.every((r) => r.readsRightToLeft)).toBe(true)
  })

  it('names colours in the written text', () => {
    const set = buildInstructions(sample(), DEFAULT_PALETTE, 'flat-stranded')
    expect(set.rows[0]!.text).toBe('2 Undyed, 2 Charcoal')
  })
})

describe('instruction round trip', () => {
  it('rebuilds the exact grid for every working method', () => {
    for (const method of ['flat-stranded', 'circular-stranded', 'intarsia', 'duplicate-stitch'] as const) {
      const grid = sample()
      const set = buildInstructions(grid, DEFAULT_PALETTE, method)
      const rebuilt = instructionsToGrid(set, grid.stitches)
      expect(Array.from(rebuilt.cells), method).toEqual(Array.from(grid.cells))
    }
  })

  it('rebuilds a larger asymmetric chart', () => {
    const grid = createGrid(9, 7)
    for (let i = 0; i < grid.cells.length; i++) grid.cells[i] = (i * 7 + 3) % 4
    const set = buildInstructions(grid, DEFAULT_PALETTE, 'flat-stranded')
    expect(Array.from(instructionsToGrid(set, 9).cells)).toEqual(Array.from(grid.cells))
  })
})
