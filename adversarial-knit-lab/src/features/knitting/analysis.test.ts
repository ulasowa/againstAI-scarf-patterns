import { describe, expect, it } from 'vitest'
import { analyzeChart, computeFloats, computeLongestColorRun, computeRowColorUsage } from './analysis'
import { createGrid, indexOf } from '../chart/grid'
import { DEFAULT_ANALYSIS_OPTIONS } from '../../types/project'
import type { StitchGrid } from '../../types/project'

function gridFromRows(rows: number[][]): StitchGrid {
  const width = rows[0]!.length
  const grid = createGrid(width, rows.length)
  rows.forEach((values, r) =>
    values.forEach((v, c) => {
      grid.cells[indexOf(grid, r, c)] = v
    }),
  )
  return grid
}

describe('per-row colour usage', () => {
  it('reports colours per row, not only the chart total', () => {
    // Four colours overall, but every single row uses only two.
    const grid = gridFromRows([
      [0, 1, 0, 1],
      [2, 3, 2, 3],
    ])
    const usage = computeRowColorUsage(grid)
    expect(usage[0]!.paletteIndices).toEqual([0, 1])
    expect(usage[1]!.paletteIndices).toEqual([2, 3])

    const analysis = analyzeChart({
      grid,
      workingMethod: 'flat-stranded',
      repeat: { stitches: 4, rows: 2 },
      options: DEFAULT_ANALYSIS_OPTIONS,
      contentHash: 'h',
    })
    expect(analysis.totalColors).toBe(4)
    expect(analysis.maxColorsInAnyRow).toBe(2)
    // A four-colour chart still satisfies the two-per-row stranded constraint.
    expect(analysis.rowsExceedingColorLimit).toEqual([])
  })

  it('flags a row that uses three colours', () => {
    const analysis = analyzeChart({
      grid: gridFromRows([[0, 1, 2, 0]]),
      workingMethod: 'flat-stranded',
      repeat: { stitches: 4, rows: 1 },
      options: DEFAULT_ANALYSIS_OPTIONS,
      contentHash: 'h',
    })
    expect(analysis.rowsExceedingColorLimit).toEqual([0])
  })
})

describe('floats', () => {
  it('measures the stitches a yarn is carried over', () => {
    // Colour 1 at columns 0 and 6: five stitches carried between them.
    const floats = computeFloats(gridFromRows([[1, 0, 0, 0, 0, 0, 1]]), false)
    const carried = floats.filter((f) => f.paletteIndex === 1)
    expect(carried).toHaveLength(1)
    expect(carried[0]).toMatchObject({ length: 5, startColumn: 1, endColumn: 5 })
  })

  it('does not count stitches before a colour first appears or after it last appears', () => {
    // Colour 1 appears only at column 3, so it is introduced and dropped there.
    const floats = computeFloats(gridFromRows([[0, 0, 0, 1, 0, 0, 0]]), false)
    expect(floats.filter((f) => f.paletteIndex === 1)).toHaveLength(0)
    // Colour 0 is carried across the single contrast stitch.
    expect(floats.filter((f) => f.paletteIndex === 0)).toHaveLength(1)
  })

  it('reports no floats when a row is a single colour', () => {
    expect(computeFloats(gridFromRows([[2, 2, 2, 2]]), false)).toEqual([])
  })

  it('adds a wraparound float for circular knitting', () => {
    const grid = gridFromRows([[1, 0, 0, 0, 1, 0, 0]])
    const flat = computeFloats(grid, false).filter((f) => f.wrapsRoundBoundary)
    expect(flat).toHaveLength(0)
    const circular = computeFloats(grid, true).filter((f) => f.wrapsRoundBoundary)
    // Colour 1 sits at columns 0 and 4; wrapping from 4 back to 0 carries over 2 stitches.
    const one = circular.find((f) => f.paletteIndex === 1)
    expect(one?.length).toBe(2)
  })

  it('is not computed for non-stranded methods', () => {
    const analysis = analyzeChart({
      grid: gridFromRows([[1, 0, 0, 0, 0, 0, 1]]),
      workingMethod: 'duplicate-stitch',
      repeat: { stitches: 7, rows: 1 },
      options: DEFAULT_ANALYSIS_OPTIONS,
      contentHash: 'h',
    })
    expect(analysis.floats).toEqual([])
    expect(analysis.warnings.some((w) => w.id === 'duplicate-stitch-guidance')).toBe(true)
  })
})

describe('colour runs', () => {
  it('measures the longest run in a row', () => {
    expect(computeLongestColorRun(gridFromRows([[0, 0, 0, 1, 1]]), false)).toBe(3)
  })

  it('joins the run across the round boundary when circular', () => {
    // Two leading and two trailing stitches of colour 0 join into a run of four.
    expect(computeLongestColorRun(gridFromRows([[0, 0, 1, 1, 0, 0]]), true)).toBe(4)
    expect(computeLongestColorRun(gridFromRows([[0, 0, 1, 1, 0, 0]]), false)).toBe(2)
  })

  it('is distinct from float length', () => {
    const grid = gridFromRows([[1, 0, 0, 0, 0, 0, 1]])
    // A run of five background stitches; the carried float is also five, but a
    // run only becomes a float when the other colour is in use on both sides.
    expect(computeLongestColorRun(grid, false)).toBe(5)
    const isolated = gridFromRows([[0, 0, 0, 0, 0, 0, 0]])
    expect(computeLongestColorRun(isolated, false)).toBe(7)
    expect(computeFloats(isolated, false)).toEqual([])
  })
})

describe('repeat analysis', () => {
  it('reports leftover stitches and rows', () => {
    const analysis = analyzeChart({
      grid: createGrid(10, 6),
      workingMethod: 'flat-stranded',
      repeat: { stitches: 4, rows: 4 },
      options: DEFAULT_ANALYSIS_OPTIONS,
      contentHash: 'h',
    })
    expect(analysis.repeat.fitsHorizontally).toBe(false)
    expect(analysis.repeat.horizontalRemainder).toBe(2)
    expect(analysis.repeat.verticalRemainder).toBe(2)
  })
})
