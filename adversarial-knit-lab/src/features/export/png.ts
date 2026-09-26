/**
 * Raster exports.
 *
 * Four distinct images, because they answer different questions:
 *   tile          — one clean repeat, no decorations. This is the pattern.
 *   repeated      — the pattern tiled across an area, gauge-correct.
 *   gaugePreview  — gauge-correct single chart, showing real proportions.
 *   decoratedChart— the knitting chart with gridlines, numbers and symbols.
 *
 * Only the decorated one contains chart furniture, and it is never what the
 * evaluation pipeline sees.
 */
import type { Gauge, PaletteEntry, RepeatSize, StitchGrid } from '../../types/project'
import { renderChart, renderPatternTexture, DEFAULT_CHART_OPTIONS, chartMetrics } from '../preview/render'
import { cellAspect } from '../knitting/gauge'

export interface PngOptions {
  gauge: Gauge
  repeat: RepeatSize
  /** Pixels per stitch. */
  scale: number
  fabricShading?: boolean
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create a 2D canvas context for export')
  return { canvas, ctx }
}

export async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser could not encode this canvas as PNG')
  return blob
}

/** One clean repeat of the pattern, square pixels, no decorations. */
export function renderTilePng(
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: PngOptions,
): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(grid.stitches * options.scale, grid.rows * options.scale)
  ctx.imageSmoothingEnabled = false
  renderPatternTexture(ctx, grid, palette, {
    cellPixels: options.scale,
    gauge: { stitchesPer10cm: 10, rowsPer10cm: 10 },
    width: canvas.width,
    height: canvas.height,
  })
  return canvas
}

/** The pattern repeated across an area at gauge-correct proportions. */
export function renderRepeatedPng(
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: PngOptions & { repeatsX: number; repeatsY: number },
): HTMLCanvasElement {
  const cellHeight = options.scale / cellAspect(options.gauge)
  const width = grid.stitches * options.repeatsX * options.scale
  const height = grid.rows * options.repeatsY * cellHeight
  const { canvas, ctx } = makeCanvas(width, height)
  renderPatternTexture(ctx, grid, palette, {
    cellPixels: options.scale,
    gauge: options.gauge,
    width: canvas.width,
    height: canvas.height,
    fabricShading: options.fabricShading ?? false,
  })
  return canvas
}

/** A single chart at gauge-correct proportions, no decorations. */
export function renderGaugePreviewPng(
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: PngOptions,
): HTMLCanvasElement {
  return renderRepeatedPng(grid, palette, { ...options, repeatsX: 1, repeatsY: 1 })
}

/** The knitting chart, with gridlines, numbering and symbols. */
export function renderDecoratedChartPng(
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: PngOptions & { showSymbols: boolean },
): HTMLCanvasElement {
  const chartOptions = {
    ...DEFAULT_CHART_OPTIONS,
    cellSize: options.scale,
    showSymbols: options.showSymbols,
    showRepeat: true,
    repeat: options.repeat,
    gauge: options.gauge,
    gaugeCorrect: false,
  }
  const metrics = chartMetrics(grid, chartOptions)
  const { canvas, ctx } = makeCanvas(metrics.boardWidth, metrics.boardHeight)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  renderChart(ctx, grid, palette, chartOptions)
  return canvas
}
