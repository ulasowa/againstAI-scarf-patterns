/**
 * Gauge arithmetic.
 *
 * Gauge is given per 10 cm, the convention used on most European ball bands.
 * Conventions for the width/height formulas follow standard chart practice and
 * match the approach taken in KnitPlot (MIT, https://github.com/syalr2/knitplot,
 * lib/chart.ts); see docs/reuse-audit.md.
 */
import type { Gauge, RepeatSize, StitchGrid } from '../../types/project'

export interface PhysicalSize {
  widthCm: number
  heightCm: number
}

export function assertGauge(gauge: Gauge): void {
  if (!(gauge.stitchesPer10cm > 0) || !(gauge.rowsPer10cm > 0)) {
    throw new Error('Gauge must be greater than zero in both directions')
  }
}

/** Width in cm = stitch count x 10 / stitch gauge. */
export function chartWidthCm(stitches: number, gauge: Gauge): number {
  assertGauge(gauge)
  return (stitches * 10) / gauge.stitchesPer10cm
}

/** Height in cm = row count x 10 / row gauge. */
export function chartHeightCm(rows: number, gauge: Gauge): number {
  assertGauge(gauge)
  return (rows * 10) / gauge.rowsPer10cm
}

export function physicalSize(grid: StitchGrid, gauge: Gauge): PhysicalSize {
  return {
    widthCm: chartWidthCm(grid.stitches, gauge),
    heightCm: chartHeightCm(grid.rows, gauge),
  }
}

/**
 * Ratio of physical cell width to physical cell height = row gauge / stitch
 * gauge. At 20 sts and 28 rows per 10 cm this is 1.4, so a stitch is 1.4x as
 * wide as it is tall and a square chart knits up wider than it is high.
 */
export function cellAspect(gauge: Gauge): number {
  assertGauge(gauge)
  return gauge.rowsPer10cm / gauge.stitchesPer10cm
}

export function cmToInches(cm: number): number {
  return cm / 2.54
}

/** Stitches needed to reach a target width, rounded to whole stitches. */
export function stitchesForWidth(widthCm: number, gauge: Gauge): number {
  assertGauge(gauge)
  return Math.max(1, Math.round((widthCm * gauge.stitchesPer10cm) / 10))
}

export function rowsForHeight(heightCm: number, gauge: Gauge): number {
  assertGauge(gauge)
  return Math.max(1, Math.round((heightCm * gauge.rowsPer10cm) / 10))
}

export interface RepeatFit {
  fitsHorizontally: boolean
  fitsVertically: boolean
  horizontalRemainder: number
  verticalRemainder: number
  horizontalRepeats: number
  verticalRepeats: number
}

export function repeatFit(grid: StitchGrid, repeat: RepeatSize): RepeatFit {
  const rs = Math.max(1, Math.floor(repeat.stitches))
  const rr = Math.max(1, Math.floor(repeat.rows))
  return {
    fitsHorizontally: grid.stitches % rs === 0,
    fitsVertically: grid.rows % rr === 0,
    horizontalRemainder: grid.stitches % rs,
    verticalRemainder: grid.rows % rr,
    horizontalRepeats: Math.floor(grid.stitches / rs),
    verticalRepeats: Math.floor(grid.rows / rr),
  }
}

export function formatCm(value: number): string {
  return `${value.toFixed(1)} cm`
}
