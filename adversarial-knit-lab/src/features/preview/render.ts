/**
 * Canvas renderers.
 *
 * Three distinct views, kept separate on purpose:
 *   renderChart          — the editable flat chart, with gridlines, numbering,
 *                          symbols and repeat outlines. Square cells.
 *   renderPatternTexture — gauge-correct repeated colour texture with NO chart
 *                          decorations. This is the only renderer evaluation is
 *                          allowed to use: gridlines and row numbers are not
 *                          part of a knitted motif and must never be fed to a
 *                          detector.
 *   renderFabric         — an illustration of knitted stockinette. It is a
 *                          drawing, not a physical simulation.
 */
import type { Gauge, PaletteEntry, RepeatSize, StitchGrid } from '../../types/project'
import { getCell, sampleTiled, toDisplayRow } from '../chart/grid'
import { cellAspect } from '../knitting/gauge'
import { hexToRgb, readableTextColor, rgbToHex } from '../../lib/color'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface ChartRenderOptions {
  cellSize: number
  showGrid: boolean
  showNumbers: boolean
  showSymbols: boolean
  showRepeat: boolean
  repeat: RepeatSize
  /** Internal row index to highlight while knitting, or null. */
  highlightRow: number | null
  /** Internal coordinates of the cell under the pointer, or null. */
  cursor: { row: number; column: number } | null
  /** Gauge-correct cells instead of square cells. */
  gaugeCorrect: boolean
  gauge: Gauge
  /** Device pixel ratio already applied to the context by the caller. */
  labelGutter: number
}

export const DEFAULT_CHART_OPTIONS: ChartRenderOptions = {
  cellSize: 14,
  showGrid: true,
  showNumbers: true,
  showSymbols: false,
  showRepeat: true,
  repeat: { stitches: 16, rows: 16 },
  highlightRow: null,
  cursor: null,
  gaugeCorrect: false,
  gauge: { stitchesPer10cm: 20, rowsPer10cm: 28 },
  labelGutter: 26,
}

export interface CellMetrics {
  cellWidth: number
  cellHeight: number
  gutter: number
  boardWidth: number
  boardHeight: number
}

export function chartMetrics(grid: StitchGrid, options: ChartRenderOptions): CellMetrics {
  const cellWidth = options.cellSize
  const cellHeight = options.gaugeCorrect ? options.cellSize / cellAspect(options.gauge) : options.cellSize
  const gutter = options.showNumbers ? options.labelGutter : 0
  return {
    cellWidth,
    cellHeight,
    gutter,
    boardWidth: grid.stitches * cellWidth + gutter,
    boardHeight: grid.rows * cellHeight + gutter,
  }
}

/** Map a pointer position in board coordinates to an internal cell. */
export function cellAtBoardPoint(
  grid: StitchGrid,
  options: ChartRenderOptions,
  x: number,
  y: number,
): { row: number; column: number } | null {
  const m = chartMetrics(grid, options)
  const gx = x - m.gutter
  const gy = y
  if (gx < 0 || gy < 0) return null
  const column = Math.floor(gx / m.cellWidth)
  const displayRow = Math.floor(gy / m.cellHeight)
  if (column < 0 || column >= grid.stitches) return null
  if (displayRow < 0 || displayRow >= grid.rows) return null
  return { row: grid.rows - 1 - displayRow, column }
}

export function renderChart(
  ctx: Ctx2D,
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: ChartRenderOptions,
): void {
  const m = chartMetrics(grid, options)
  ctx.save()
  ctx.clearRect(0, 0, m.boardWidth, m.boardHeight)

  // Cells. Internal row 0 is the bottom row, so it is drawn last from the top.
  for (let r = 0; r < grid.rows; r++) {
    const y = toDisplayRow(grid, r) * m.cellHeight
    for (let c = 0; c < grid.stitches; c++) {
      const index = getCell(grid, r, c)
      const entry = palette[index]
      ctx.fillStyle = entry ? entry.hex : '#ff00ff'
      ctx.fillRect(m.gutter + c * m.cellWidth, y, m.cellWidth, m.cellHeight)
    }
  }

  if (options.showSymbols && m.cellWidth >= 9) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.max(7, Math.floor(m.cellHeight * 0.68))}px ui-monospace, monospace`
    for (let r = 0; r < grid.rows; r++) {
      const y = toDisplayRow(grid, r) * m.cellHeight + m.cellHeight / 2
      for (let c = 0; c < grid.stitches; c++) {
        const entry = palette[getCell(grid, r, c)]
        if (!entry || entry.symbol === '') continue
        ctx.fillStyle = readableTextColor(entry.hex)
        ctx.fillText(entry.symbol, m.gutter + c * m.cellWidth + m.cellWidth / 2, y)
      }
    }
  }

  if (options.showGrid && m.cellWidth >= 4) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = 0; c <= grid.stitches; c++) {
      const x = Math.round(m.gutter + c * m.cellWidth) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, grid.rows * m.cellHeight)
    }
    for (let r = 0; r <= grid.rows; r++) {
      const y = Math.round(r * m.cellHeight) + 0.5
      ctx.moveTo(m.gutter, y)
      ctx.lineTo(m.boardWidth, y)
    }
    ctx.stroke()
  }

  if (options.showRepeat) drawRepeatOutline(ctx, grid, options, m)
  if (options.highlightRow !== null) drawRowHighlight(ctx, grid, options, m)
  if (options.showNumbers) drawNumbers(ctx, grid, m)
  if (options.cursor) drawCursor(ctx, grid, options, m)

  ctx.restore()
}

function drawRepeatOutline(
  ctx: Ctx2D,
  grid: StitchGrid,
  options: ChartRenderOptions,
  m: CellMetrics,
): void {
  const rs = Math.max(1, options.repeat.stitches)
  const rr = Math.max(1, options.repeat.rows)
  ctx.save()
  ctx.strokeStyle = 'rgba(180, 40, 20, 0.9)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 3])
  ctx.beginPath()
  for (let c = rs; c < grid.stitches; c += rs) {
    const x = Math.round(m.gutter + c * m.cellWidth) + 0.5
    ctx.moveTo(x, 0)
    ctx.lineTo(x, grid.rows * m.cellHeight)
  }
  for (let r = rr; r < grid.rows; r += rr) {
    const y = Math.round((grid.rows - r) * m.cellHeight) + 0.5
    ctx.moveTo(m.gutter, y)
    ctx.lineTo(m.boardWidth, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawRowHighlight(
  ctx: Ctx2D,
  grid: StitchGrid,
  options: ChartRenderOptions,
  m: CellMetrics,
): void {
  const row = options.highlightRow
  if (row === null || row < 0 || row >= grid.rows) return
  const y = toDisplayRow(grid, row) * m.cellHeight
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(m.gutter, 0, grid.stitches * m.cellWidth, y)
  ctx.fillRect(m.gutter, y + m.cellHeight, grid.stitches * m.cellWidth, grid.rows * m.cellHeight - y - m.cellHeight)
  ctx.strokeStyle = '#ffd166'
  ctx.lineWidth = 2
  ctx.strokeRect(m.gutter + 1, y + 1, grid.stitches * m.cellWidth - 2, m.cellHeight - 2)
  ctx.restore()
}

function drawCursor(
  ctx: Ctx2D,
  grid: StitchGrid,
  options: ChartRenderOptions,
  m: CellMetrics,
): void {
  const cursor = options.cursor
  if (!cursor) return
  const y = toDisplayRow(grid, cursor.row) * m.cellHeight
  ctx.save()
  ctx.strokeStyle = '#0b5fff'
  ctx.lineWidth = 2
  ctx.strokeRect(m.gutter + cursor.column * m.cellWidth + 1, y + 1, m.cellWidth - 2, m.cellHeight - 2)
  ctx.restore()
}

function drawNumbers(ctx: Ctx2D, grid: StitchGrid, m: CellMetrics): void {
  const step = m.cellWidth < 10 ? 10 : m.cellWidth < 16 ? 5 : 1
  ctx.save()
  ctx.fillStyle = '#4a4a44'
  ctx.font = `${Math.min(11, Math.max(8, Math.floor(m.cellHeight * 0.7)))}px ui-monospace, monospace`
  ctx.textBaseline = 'middle'

  // Row numbers: 1 at the bottom, counting up, placed on the working edge.
  ctx.textAlign = 'right'
  for (let r = 0; r < grid.rows; r++) {
    const number = r + 1
    if (number !== 1 && number !== grid.rows && number % step !== 0) continue
    const y = toDisplayRow(grid, r) * m.cellHeight + m.cellHeight / 2
    ctx.fillText(String(number), m.gutter - 4, y)
  }

  // Stitch numbers: 1 at the right-hand edge, counting leftwards, matching the
  // right-to-left reading direction of a right-side row.
  ctx.textAlign = 'center'
  const baseY = grid.rows * m.cellHeight + m.gutter / 2
  for (let c = 0; c < grid.stitches; c++) {
    const number = grid.stitches - c
    if (number !== 1 && number !== grid.stitches && number % step !== 0) continue
    ctx.fillText(String(number), m.gutter + c * m.cellWidth + m.cellWidth / 2, baseY)
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ *
 * Evaluation / texture rendering — no decorations, ever.
 * ------------------------------------------------------------------ */

export interface TextureOptions {
  /** Pixels across one stitch. Row height follows from the gauge. */
  cellPixels: number
  gauge: Gauge
  /** Target size in pixels. The pattern is repeated to fill it. */
  width: number
  height: number
  /** Offset in stitches/rows, so a tile can be positioned. */
  offsetStitches?: number
  offsetRows?: number
  /** Draw the stockinette V illustration on top of the flat colours. */
  fabricShading?: boolean
}

/**
 * Repeat the chart across a target area at gauge-correct proportions.
 * Deliberately takes no chart-decoration options.
 */
export function renderPatternTexture(
  ctx: Ctx2D,
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: TextureOptions,
): void {
  const cellWidth = Math.max(1, options.cellPixels)
  const cellHeight = Math.max(1, options.cellPixels / cellAspect(options.gauge))
  const cols = Math.ceil(options.width / cellWidth) + 1
  const rows = Math.ceil(options.height / cellHeight) + 1
  const offsetStitches = options.offsetStitches ?? 0
  const offsetRows = options.offsetRows ?? 0

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, options.width, options.height)
  ctx.clip()

  for (let dy = 0; dy < rows; dy++) {
    // Screen top to bottom, so the internal row counts downwards.
    const internalRow = offsetRows + (rows - 1 - dy)
    const y = dy * cellHeight
    for (let dx = 0; dx < cols; dx++) {
      const index = sampleTiled(grid, internalRow, offsetStitches + dx)
      const entry = palette[index]
      ctx.fillStyle = entry ? entry.hex : '#ff00ff'
      ctx.fillRect(dx * cellWidth, y, cellWidth + 1, cellHeight + 1)
    }
  }

  if (options.fabricShading && cellWidth >= 3) {
    drawStitchShading(ctx, grid, palette, {
      cellWidth,
      cellHeight,
      cols,
      rows,
      offsetStitches,
      offsetRows,
    })
  }
  ctx.restore()
}

interface ShadingLayout {
  cellWidth: number
  cellHeight: number
  cols: number
  rows: number
  offsetStitches: number
  offsetRows: number
}

/**
 * Stockinette illustration: each stitch gets a V-shaped stroke plus a soft
 * vertical shade. This is a drawing of knitted fabric, not a simulation of it.
 */
function drawStitchShading(
  ctx: Ctx2D,
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  layout: ShadingLayout,
): void {
  const { cellWidth, cellHeight, cols, rows, offsetStitches, offsetRows } = layout
  ctx.save()
  ctx.lineWidth = Math.max(0.6, cellWidth * 0.14)
  ctx.lineCap = 'round'

  for (let dy = 0; dy < rows; dy++) {
    const internalRow = offsetRows + (rows - 1 - dy)
    const y = dy * cellHeight
    for (let dx = 0; dx < cols; dx++) {
      const entry = palette[sampleTiled(grid, internalRow, offsetStitches + dx)]
      if (!entry) continue
      const x = dx * cellWidth
      ctx.strokeStyle = shade(entry.hex, -0.22)
      ctx.beginPath()
      ctx.moveTo(x + cellWidth * 0.12, y + cellHeight * 0.1)
      ctx.lineTo(x + cellWidth * 0.5, y + cellHeight * 0.82)
      ctx.lineTo(x + cellWidth * 0.88, y + cellHeight * 0.1)
      ctx.stroke()
      ctx.strokeStyle = shade(entry.hex, 0.18)
      ctx.beginPath()
      ctx.moveTo(x + cellWidth * 0.5, y + cellHeight * 0.86)
      ctx.lineTo(x + cellWidth * 0.5, y + cellHeight * 1.0)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour. */
export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const mix = amount > 0 ? 255 : 0
  const t = Math.abs(amount)
  return rgbToHex({
    r: r + (mix - r) * t,
    g: g + (mix - g) * t,
    b: b + (mix - b) * t,
  })
}
