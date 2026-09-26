import { describe, expect, it } from 'vitest'
import {
  PALETTE_PRESETS,
  applyPalettePreset,
  minimumContrast,
  presetToPalette,
} from './palettes'
import { createGrid, paletteIndicesValid, usedPaletteIndices } from './grid'
import { DEFAULT_PALETTE } from './project'

function gridUsing(indices: number[]) {
  const grid = createGrid(indices.length, 1)
  grid.cells.set(indices)
  return grid
}

describe('palette presets', () => {
  it('are distinct and describe themselves', () => {
    const ids = PALETTE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PALETTE_PRESETS) {
      expect(preset.colors.length).toBeGreaterThanOrEqual(2)
      expect(preset.description.length).toBeGreaterThan(20)
      for (const color of preset.colors) {
        expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i)
        expect(color.symbol.length).toBeGreaterThan(0)
      }
    }
  })

  it('every preset has colours a knitter can tell apart', () => {
    for (const preset of PALETTE_PRESETS) {
      const contrast = minimumContrast(presetToPalette(preset))
      // Below roughly 1.6 the closest pair reads as one colour at a distance.
      expect(contrast, `${preset.id} closest pair`).toBeGreaterThan(1.6)
    }
  })

  it('gives every entry a distinct symbol for black-and-white printing', () => {
    for (const preset of PALETTE_PRESETS) {
      const symbols = preset.colors.map((c) => c.symbol)
      expect(new Set(symbols).size, preset.id).toBe(symbols.length)
    }
  })
})

describe('applyPalettePreset', () => {
  const growing = PALETTE_PRESETS.find((p) => p.colors.length === 4)!
  const shrinking = PALETTE_PRESETS.find((p) => p.colors.length === 2)!

  it('keeps every cell index valid when the palette grows', () => {
    const grid = gridUsing([0, 1, 2, 3])
    const result = applyPalettePreset(grid, DEFAULT_PALETTE, growing)
    expect(paletteIndicesValid(result.grid, result.palette.length)).toBe(true)
    expect(Array.from(result.grid.cells)).toEqual([0, 1, 2, 3])
  })

  it('remaps to the nearest colour when the palette shrinks', () => {
    const grid = gridUsing([0, 1, 2, 3])
    const result = applyPalettePreset(grid, DEFAULT_PALETTE, shrinking)
    expect(result.palette).toHaveLength(2)
    expect(paletteIndicesValid(result.grid, result.palette.length)).toBe(true)
    // The chart keeps both of its tones rather than collapsing to one.
    expect(new Set(result.grid.cells).size).toBe(2)
  })

  it('never leaves a cell pointing past the palette', () => {
    for (const preset of PALETTE_PRESETS) {
      const grid = gridUsing([0, 1, 2, 3])
      const result = applyPalettePreset(grid, DEFAULT_PALETTE, preset)
      expect(paletteIndicesValid(result.grid, result.palette.length), preset.id).toBe(true)
      for (const index of usedPaletteIndices(result.grid)) {
        expect(index).toBeLessThan(result.palette.length)
      }
    }
  })

  it('keeps locked colours', () => {
    const locked = [{ ...DEFAULT_PALETTE[0]!, locked: true }, ...DEFAULT_PALETTE.slice(1)]
    const result = applyPalettePreset(gridUsing([0, 1]), locked, shrinking)
    expect(result.palette[0]?.locked).toBe(true)
    expect(result.palette[0]?.hex).toBe(DEFAULT_PALETTE[0]!.hex)
    expect(result.palette).toHaveLength(3)
  })

  it('does not mutate the grid it was given', () => {
    const grid = gridUsing([0, 1, 2, 3])
    const before = Array.from(grid.cells)
    applyPalettePreset(grid, DEFAULT_PALETTE, shrinking)
    expect(Array.from(grid.cells)).toEqual(before)
  })
})

describe('minimumContrast', () => {
  it('finds the closest pair, not the average', () => {
    const palette = [
      { id: 'a', hex: '#000000', symbol: '.', name: 'Black' },
      { id: 'b', hex: '#ffffff', symbol: 'o', name: 'White' },
      { id: 'c', hex: '#fefefe', symbol: '/', name: 'Almost white' },
    ]
    expect(minimumContrast(palette)).toBeLessThan(1.1)
  })

  it('returns 1 for a single colour', () => {
    expect(minimumContrast([{ id: 'a', hex: '#123456', symbol: '.', name: 'One' }])).toBe(1)
  })
})
