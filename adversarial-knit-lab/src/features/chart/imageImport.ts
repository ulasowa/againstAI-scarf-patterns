/**
 * Image to colourwork chart.
 *
 * Quantisation is delegated to image-q (MIT) rather than reimplemented. The
 * 'cie94-textiles' distance formula is image-q's own textile-weighted variant,
 * which is a better fit for yarn than plain Euclidean RGB.
 *
 * On-screen RGB is never a promise about real yarn: screen colour, dye lot,
 * fibre and light all move the result.
 */
import type { Gauge, PaletteEntry, StitchGrid } from '../../types/project'
import { createGrid, indexOf } from './grid'
import { cellAspect } from '../knitting/gauge'
import { hexToRgb, nearestPaletteIndex, rgbToHex, type Rgb } from '../../lib/color'
import { hashBytes } from '../../lib/hash'
import { newId } from '../../lib/id'

/** Hard ceiling on decoded pixels, to bound memory on mobile. */
export const MAX_IMPORT_PIXELS = 24_000_000

export type DitherMode =
  | 'none'
  | 'floyd-steinberg'
  | 'atkinson'
  | 'stucki'
  | 'jarvis'
  | 'sierra-lite'

export interface ImportOptions {
  stitches: number
  rows: number
  gauge: Gauge
  /** Extract a palette from the image, or map onto a palette you already own. */
  paletteMode: 'extract' | 'fixed'
  /** Number of colours to extract. Ignored in 'fixed' mode. */
  colorCount: number
  /** Existing palette. Locked entries are always kept in 'extract' mode too. */
  palette: readonly PaletteEntry[]
  /** Background used to composite transparent pixels. */
  backgroundHex: string
  /**
   * Dithering is off by default: isolated alternating stitches are awkward in
   * stranded colourwork and read as noise in the finished fabric.
   */
  dither: DitherMode
}

export interface ImportResult {
  grid: StitchGrid
  palette: PaletteEntry[]
  /** Hash of the resampled RGBA pixels the chart was built from. */
  contentHash: string
}

/** Rows that keep an image's proportions at a given gauge. */
export function rowsForAspect(
  stitches: number,
  imageWidth: number,
  imageHeight: number,
  gauge: Gauge,
): number {
  if (imageWidth <= 0 || imageHeight <= 0) return stitches
  // A stitch is cellAspect times as wide as it is tall, so the same physical
  // shape needs proportionally more rows than columns.
  const physicalRatio = imageHeight / imageWidth
  return Math.max(1, Math.round(stitches * physicalRatio * cellAspect(gauge)))
}

/** Draw a source image into a stitches x rows RGBA buffer. */
export function resampleToGrid(
  source: CanvasImageSource,
  stitches: number,
  rows: number,
  backgroundHex: string,
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = stitches
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create a 2D canvas context for image import')
  // Composite onto the chosen background first, so transparency becomes a real
  // yarn colour rather than black.
  ctx.fillStyle = backgroundHex
  ctx.fillRect(0, 0, stitches, rows)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, stitches, rows)
  return ctx.getImageData(0, 0, stitches, rows)
}

export async function imageToChart(
  source: CanvasImageSource,
  options: ImportOptions,
): Promise<ImportResult> {
  const { stitches, rows } = options
  const data = resampleToGrid(source, stitches, rows, options.backgroundHex)
  const contentHash = hashBytes(data.data)

  const lockedColors = options.palette.filter((p) => p.locked)
  let targetPalette: PaletteEntry[]

  if (options.paletteMode === 'fixed') {
    targetPalette = options.palette.map((p) => ({ ...p }))
  } else {
    const extracted = await extractPalette(data, options.colorCount - lockedColors.length)
    targetPalette = [
      ...lockedColors.map((p) => ({ ...p })),
      ...extracted.map((hex, i) => ({
        id: newId('c'),
        hex,
        symbol: SYMBOLS[(lockedColors.length + i) % SYMBOLS.length] as string,
        name: `Colour ${lockedColors.length + i + 1}`,
      })),
    ]
  }
  if (targetPalette.length === 0) {
    targetPalette = [{ id: newId('c'), hex: options.backgroundHex, symbol: '.', name: 'Colour 1' }]
  }

  const quantised =
    options.dither === 'none'
      ? data
      : await ditherToPalette(data, targetPalette.map((p) => p.hex), options.dither)

  const rgbPalette: Rgb[] = targetPalette.map((p) => hexToRgb(p.hex))
  const grid = createGrid(stitches, rows)
  for (let y = 0; y < rows; y++) {
    // Image row 0 is the top; internal row 0 is the bottom.
    const internalRow = rows - 1 - y
    for (let x = 0; x < stitches; x++) {
      const i = (y * stitches + x) * 4
      const rgb: Rgb = {
        r: quantised.data[i] as number,
        g: quantised.data[i + 1] as number,
        b: quantised.data[i + 2] as number,
      }
      grid.cells[indexOf(grid, internalRow, x)] = nearestPaletteIndex(rgb, rgbPalette)
    }
  }

  return { grid, palette: targetPalette, contentHash }
}

const SYMBOLS = ['.', 'o', '/', 'x', '+', '=', '~', '*', '#', '-', 'v', 'c']

async function extractPalette(data: ImageData, colorCount: number): Promise<string[]> {
  const count = Math.max(1, Math.min(64, colorCount))
  const iq = await import('image-q')
  const container = iq.utils.PointContainer.fromUint8Array(
    new Uint8Array(data.data.buffer.slice(0)),
    data.width,
    data.height,
  )
  const palette = iq.buildPaletteSync([container], {
    colorDistanceFormula: 'cie94-textiles',
    paletteQuantization: 'wuquant',
    colors: count,
  })
  return palette
    .getPointContainer()
    .getPointArray()
    .map((point) => rgbToHex({ r: point.r, g: point.g, b: point.b }))
}

/** Apply an explicit palette with an error-diffusion kernel. */
async function ditherToPalette(
  data: ImageData,
  hexes: string[],
  dither: Exclude<DitherMode, 'none'>,
): Promise<ImageData> {
  const iq = await import('image-q')
  const container = iq.utils.PointContainer.fromUint8Array(
    new Uint8Array(data.data.buffer.slice(0)),
    data.width,
    data.height,
  )
  const palette = new iq.utils.Palette()
  for (const hex of hexes) {
    const { r, g, b } = hexToRgb(hex)
    palette.add(iq.utils.Point.createByRGBA(r, g, b, 255))
  }
  const out = iq.applyPaletteSync(container, palette, {
    colorDistanceFormula: 'cie94-textiles',
    imageQuantization: dither,
  })
  const bytes = out.toUint8Array()
  const result = new ImageData(data.width, data.height)
  result.data.set(bytes)
  return result
}

/**
 * Decode a user-selected file. Everything stays in the browser; nothing is
 * uploaded anywhere.
 */
export async function decodeImageFile(file: File): Promise<ImageBitmap> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error(`Unsupported image type "${file.type || 'unknown'}". Use PNG, JPEG or WebP.`)
  }
  const bitmap = await createImageBitmap(file)
  if (bitmap.width * bitmap.height > MAX_IMPORT_PIXELS) {
    bitmap.close()
    throw new Error(
      `Image is too large (${bitmap.width}x${bitmap.height}). The limit is ${MAX_IMPORT_PIXELS.toLocaleString()} pixels.`,
    )
  }
  return bitmap
}

/** Merge two palette entries: every cell using `from` moves to `into`. */
export function mergePaletteEntries(
  grid: StitchGrid,
  palette: PaletteEntry[],
  from: number,
  into: number,
): { grid: StitchGrid; palette: PaletteEntry[] } {
  if (from === into) return { grid, palette }
  const next = createGrid(grid.stitches, grid.rows)
  for (let i = 0; i < grid.cells.length; i++) {
    const value = grid.cells[i] as number
    const mapped = value === from ? into : value
    next.cells[i] = mapped > from ? mapped - 1 : mapped
  }
  return { grid: next, palette: palette.filter((_, i) => i !== from) }
}
