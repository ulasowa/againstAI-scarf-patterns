import { describe, expect, it } from 'vitest'
import {
  chartContentHash,
  createGrid,
  decodeCells,
  encodeCells,
  floodFill,
  getCell,
  indexOf,
  paletteIndicesValid,
  removePaletteColor,
  resizeGrid,
  sampleTiled,
  toDisplayRow,
  toInternalRow,
  MAX_STITCHES,
} from './grid'
import { DEFAULT_GAUGE, DEFAULT_PALETTE } from './project'

describe('coordinate convention', () => {
  it('maps internal row 0 to the bottom display row', () => {
    const grid = createGrid(3, 4)
    expect(toDisplayRow(grid, 0)).toBe(3)
    expect(toDisplayRow(grid, 3)).toBe(0)
    expect(toInternalRow(grid, 0)).toBe(3)
    expect(toInternalRow(grid, 3)).toBe(0)
    // The conversion is its own inverse.
    for (let r = 0; r < grid.rows; r++) {
      expect(toInternalRow(grid, toDisplayRow(grid, r))).toBe(r)
    }
  })

  it('keeps the bottom-left stitch when the chart grows', () => {
    const grid = createGrid(2, 2)
    grid.cells[indexOf(grid, 0, 0)] = 3
    const bigger = resizeGrid(grid, 4, 5)
    expect(getCell(bigger, 0, 0)).toBe(3)
    expect(getCell(bigger, 4, 3)).toBe(0)
  })

  it('samples as a repeating tile with negative coordinates', () => {
    const grid = createGrid(3, 2)
    grid.cells[indexOf(grid, 1, 2)] = 2
    expect(sampleTiled(grid, 1, 2)).toBe(2)
    expect(sampleTiled(grid, 3, 5)).toBe(2)
    expect(sampleTiled(grid, -1, -1)).toBe(2)
  })
})

describe('run-length encoding', () => {
  it('round-trips an arbitrary chart', () => {
    const grid = createGrid(17, 11)
    for (let i = 0; i < grid.cells.length; i++) grid.cells[i] = (i * 5 + 1) % 4
    const decoded = decodeCells(encodeCells(grid), grid.stitches, grid.rows)
    expect(Array.from(decoded)).toEqual(Array.from(grid.cells))
  })

  it('round-trips a single-colour chart compactly', () => {
    const grid = createGrid(40, 40, 2)
    const encoded = encodeCells(grid)
    expect(encoded).toBe('2x1600')
    expect(Array.from(decodeCells(encoded, 40, 40))).toEqual(Array.from(grid.cells))
  })

  it('rejects stitch data that does not fill the declared chart', () => {
    expect(() => decodeCells('0x5', 4, 4)).toThrow(/shorter/)
    expect(() => decodeCells('0x40', 4, 4)).toThrow(/longer/)
    expect(() => decodeCells('nope', 2, 1)).toThrow(/Invalid palette index/)
    expect(() => decodeCells('0x0', 2, 1)).toThrow(/Invalid run length/)
  })

  it('refuses charts beyond the dimension limits', () => {
    expect(() => createGrid(MAX_STITCHES + 1, 10)).toThrow()
    expect(() => createGrid(10, 0)).toThrow()
    expect(() => createGrid(10.5, 10)).toThrow()
  })
})

describe('palette integrity', () => {
  it('detects a cell referring to a colour that does not exist', () => {
    const grid = createGrid(2, 2)
    grid.cells[0] = 7
    expect(paletteIndicesValid(grid, 4)).toBe(false)
    expect(paletteIndicesValid(createGrid(2, 2), 4)).toBe(true)
  })

  it('re-indexes remaining colours when one is removed', () => {
    const grid = createGrid(4, 1)
    grid.cells.set([0, 1, 2, 3])
    const result = removePaletteColor(grid, DEFAULT_PALETTE.map((p) => ({ ...p })), 1, 0)
    // Colour 1 falls back to 0; former 2 and 3 shift down to 1 and 2.
    expect(Array.from(result.grid.cells)).toEqual([0, 0, 1, 2])
    expect(result.palette).toHaveLength(3)
    expect(paletteIndicesValid(result.grid, result.palette.length)).toBe(true)
  })

  it('refuses to remove the last colours', () => {
    const grid = createGrid(2, 1)
    expect(() => removePaletteColor(grid, [DEFAULT_PALETTE[0]!], 0, 0)).toThrow()
  })
})

describe('flood fill', () => {
  it('fills only the connected region', () => {
    const grid = createGrid(3, 1)
    grid.cells.set([0, 1, 0])
    const filled = floodFill(grid, 0, 0, 2)
    expect(Array.from(filled.cells)).toEqual([2, 1, 0])
  })

  it('joins the chart edges when the fabric is circular', () => {
    const grid = createGrid(3, 1)
    grid.cells.set([0, 1, 0])
    const filled = floodFill(grid, 0, 0, 2, true)
    expect(Array.from(filled.cells)).toEqual([2, 1, 2])
  })
})

describe('content hash', () => {
  const base = {
    grid: createGrid(4, 4),
    palette: DEFAULT_PALETTE,
    gauge: DEFAULT_GAUGE,
    workingMethod: 'flat-stranded' as const,
    repeat: { stitches: 2, rows: 2 },
  }

  it('is stable for identical input', () => {
    expect(chartContentHash(base)).toBe(chartContentHash({ ...base, grid: createGrid(4, 4) }))
  })

  it('changes when a stitch changes', () => {
    const edited = createGrid(4, 4)
    edited.cells[5] = 1
    expect(chartContentHash({ ...base, grid: edited })).not.toBe(chartContentHash(base))
  })

  it('changes when the palette, gauge, method or repeat changes', () => {
    const original = chartContentHash(base)
    expect(
      chartContentHash({
        ...base,
        palette: [{ ...DEFAULT_PALETTE[0]!, hex: '#000001' }, ...DEFAULT_PALETTE.slice(1)],
      }),
    ).not.toBe(original)
    expect(
      chartContentHash({ ...base, gauge: { stitchesPer10cm: 22, rowsPer10cm: 28 } }),
    ).not.toBe(original)
    expect(chartContentHash({ ...base, workingMethod: 'circular-stranded' })).not.toBe(original)
    expect(chartContentHash({ ...base, repeat: { stitches: 4, rows: 2 } })).not.toBe(original)
  })
})
