/**
 * Texture rendering for evaluation.
 *
 * Deliberately separate from the chart renderer. Chart gridlines, row numbers
 * and palette symbols are reading aids for a knitter; they are not part of the
 * knitted motif, and feeding them to a detector would measure the wrong thing.
 */
import type { Gauge, PaletteEntry, StitchGrid } from '../../types/project'
import { renderPatternTexture } from '../preview/render'
import { cellAspect } from '../knitting/gauge'
import { getCell } from '../chart/grid'

export interface TextureRenderOptions {
  cellPixels: number
  gauge: Gauge
  fabricShading: boolean
}

/** One repeat of the chart, at gauge-correct proportions, no decorations. */
export function renderChartTexture(
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: TextureRenderOptions,
): ImageData {
  const cellWidth = Math.max(1, options.cellPixels)
  const cellHeight = Math.max(1, options.cellPixels / cellAspect(options.gauge))
  const width = Math.max(1, Math.round(grid.stitches * cellWidth))
  const height = Math.max(1, Math.round(grid.rows * cellHeight))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create a 2D context for texture rendering')

  renderPatternTexture(ctx, grid, palette, {
    cellPixels: cellWidth,
    gauge: options.gauge,
    width,
    height,
    fabricShading: options.fabricShading,
  })
  return ctx.getImageData(0, 0, width, height)
}

/** A flat colour patch, for the solid-overlay control condition. */
export function renderSolidTexture(hex: string): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create a 2D context for the solid overlay')
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, 2, 2)
  return ctx.getImageData(0, 0, 2, 2)
}

/** Palette index covering the most stitches. */
export function dominantPaletteIndex(grid: StitchGrid): number {
  const counts = new Map<number, number>()
  for (let i = 0; i < grid.cells.length; i++) {
    const v = grid.cells[i] as number
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let best = 0
  let bestCount = -1
  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      best = value
    }
  }
  return best
}

/** Share of stitches that are not the background colour (index 0). */
export function patternCoverage(grid: StitchGrid): number {
  let nonBackground = 0
  for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i] !== 0) nonBackground++
  return grid.cells.length === 0 ? 0 : nonBackground / grid.cells.length
}

/** Colour histogram as fractions, used to match the control pattern's palette use. */
export function paletteHistogram(grid: StitchGrid, paletteLength: number): number[] {
  const counts = new Array<number>(paletteLength).fill(0)
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.stitches; c++) {
      const v = getCell(grid, r, c)
      if (v < paletteLength) counts[v] = (counts[v] as number) + 1
    }
  }
  const total = grid.cells.length || 1
  return counts.map((n) => n / total)
}
