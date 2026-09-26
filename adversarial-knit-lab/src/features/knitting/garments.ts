/**
 * Finished sizes, in centimetres.
 *
 * A knitter thinks in "a scarf about 25 cm wide", not "64 stitches". Stitch
 * counts follow from the size and the gauge, which is exactly the calculation
 * that is tedious and easy to get wrong by hand.
 *
 * These are finished measurements before blocking. Nothing here is a garment
 * pattern: there is no shaping, no sizing and no construction, only a
 * rectangle of the stated size. See docs/knitting.md.
 */
import type { Gauge, WorkingMethod } from '../../types/project'
import { MAX_ROWS, MAX_STITCHES } from '../chart/grid'
import { chartHeightCm, chartWidthCm, rowsForHeight, stitchesForWidth } from './gauge'

export interface SizePreset {
  id: string
  label: string
  /** Finished width in cm. For a circular piece this is the circumference. */
  widthCm: number
  /** Finished length in cm. */
  lengthCm: number
  description: string
  method: WorkingMethod
}

export const SIZE_PRESETS: SizePreset[] = [
  {
    id: 'swatch',
    label: 'Gauge swatch',
    widthCm: 20,
    lengthCm: 20,
    description: 'Knit this first. Measure it, put the real numbers in, and the rest follows.',
    method: 'flat-stranded',
  },
  {
    id: 'skinny-scarf',
    label: 'Skinny scarf',
    widthCm: 15,
    lengthCm: 150,
    description: 'Narrow and long. The least yarn, and the fastest way to see a repeat in fabric.',
    method: 'flat-stranded',
  },
  {
    id: 'classic-scarf',
    label: 'Classic scarf',
    widthCm: 25,
    lengthCm: 180,
    description: 'The usual proportions. Long enough to wrap once with ends to spare.',
    method: 'flat-stranded',
  },
  {
    id: 'wide-scarf',
    label: 'Wide scarf',
    widthCm: 35,
    lengthCm: 200,
    description: 'Wide enough to read as a panel of fabric rather than a strip.',
    method: 'flat-stranded',
  },
  {
    id: 'cowl',
    label: 'Cowl',
    widthCm: 60,
    lengthCm: 35,
    description: 'Worked in the round; the width is the circumference. 60 cm goes over a head.',
    method: 'circular-stranded',
  },
  {
    id: 'headband',
    label: 'Headband',
    widthCm: 10,
    lengthCm: 54,
    description: 'Small and quick. A good place to try a pattern before committing to a scarf.',
    method: 'flat-stranded',
  },
  {
    id: 'blanket-panel',
    label: 'Blanket panel',
    widthCm: 50,
    lengthCm: 70,
    description: 'A large panel. Check the stitch count against the limits before generating.',
    method: 'flat-stranded',
  },
]

export interface SizeInStitches {
  stitches: number
  rows: number
  /** Actual finished size after rounding to whole stitches. */
  actualWidthCm: number
  actualLengthCm: number
  /** Set when the requested size exceeds the chart limits. */
  clamped: boolean
  warning?: string
}

/** Convert a finished size to a stitch count at a given gauge. */
export function sizeToStitches(
  widthCm: number,
  lengthCm: number,
  gauge: Gauge,
): SizeInStitches {
  const wanted = {
    stitches: stitchesForWidth(Math.max(1, widthCm), gauge),
    rows: rowsForHeight(Math.max(1, lengthCm), gauge),
  }
  const stitches = Math.min(MAX_STITCHES, wanted.stitches)
  const rows = Math.min(MAX_ROWS, wanted.rows)
  const clamped = stitches !== wanted.stitches || rows !== wanted.rows

  return {
    stitches,
    rows,
    actualWidthCm: chartWidthCm(stitches, gauge),
    actualLengthCm: chartHeightCm(rows, gauge),
    clamped,
    ...(clamped
      ? {
          warning: `That size needs ${wanted.stitches} x ${wanted.rows} stitches, above the ${MAX_STITCHES} x ${MAX_ROWS} limit. Charting the repeat rather than the whole piece is usually the better move: knit the repeat as many times as the length needs.`,
        }
      : {}),
  }
}

/** How many times a repeat fits into a finished size. */
export function repeatsInSize(
  widthCm: number,
  lengthCm: number,
  repeat: { stitches: number; rows: number },
  gauge: Gauge,
): { across: number; along: number } {
  const size = sizeToStitches(widthCm, lengthCm, gauge)
  return {
    across: Math.max(1, Math.round(size.stitches / Math.max(1, repeat.stitches))),
    along: Math.max(1, Math.round(size.rows / Math.max(1, repeat.rows))),
  }
}

export function formatSize(widthCm: number, lengthCm: number): string {
  return `${widthCm.toFixed(0)} x ${lengthCm.toFixed(0)} cm`
}
