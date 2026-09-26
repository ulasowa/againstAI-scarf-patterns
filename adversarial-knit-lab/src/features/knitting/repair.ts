/**
 * Suggested chart repairs.
 *
 * Every repair is proposed as a preview first: the caller gets the changed
 * grid and a count of affected stitches, and applies it only on request.
 * Applying one changes visible stitches, which makes existing evaluation
 * records stale — that follows automatically from the content hash.
 */
import type { AnalysisOptions, PaletteEntry, StitchGrid, WorkingMethod } from '../../types/project'
import { cloneGrid, getCell, indexOf } from '../chart/grid'
import { removeSmallRegions } from '../chart/regions'
import { colorDistanceSq, hexToRgb } from '../../lib/color'
import { methodOf } from './methods'

export interface RepairSuggestion {
  id: string
  label: string
  description: string
  /** Number of stitches this repair would change. */
  affectedStitches: number
  apply: () => StitchGrid
}

export function suggestRepairs(
  grid: StitchGrid,
  method: WorkingMethod,
  options: AnalysisOptions,
  palette: readonly PaletteEntry[],
): RepairSuggestion[] {
  const descriptor = methodOf(method)
  const suggestions: RepairSuggestion[] = []

  if (descriptor.stranded) {
    const limited = limitColorsPerRow(grid, options.maxColorsPerRow, palette)
    const limitedCount = countDifferences(grid, limited)
    if (limitedCount > 0) {
      suggestions.push({
        id: 'limit-colors-per-row',
        label: `Reduce to ${options.maxColorsPerRow} colours per row`,
        description: `Keep the ${options.maxColorsPerRow} most-used colours in each row and remap the rest to the nearest of them. The chart may still use more colours overall. Changes ${limitedCount} stitch(es).`,
        affectedStitches: limitedCount,
        apply: () => limited,
      })
    }
  }

  const despeckled = removeSmallRegions(grid, options.isolatedRegionThreshold, {
    wrapColumns: descriptor.circular,
  })
  const despeckleCount = countDifferences(grid, despeckled)
  if (despeckleCount > 0) {
    suggestions.push({
      id: 'remove-isolated',
      label: 'Merge isolated regions',
      description: `Absorb regions of ${options.isolatedRegionThreshold} stitch(es) or fewer into the surrounding colour. Changes ${despeckleCount} stitch(es).`,
      affectedStitches: despeckleCount,
      apply: () => despeckled,
    })
  }

  if (descriptor.stranded) {
    const caught = breakLongFloats(grid, options.longFloatThreshold, descriptor.circular)
    const caughtCount = countDifferences(grid, caught)
    if (caughtCount > 0) {
      suggestions.push({
        id: 'break-long-floats',
        label: 'Break long floats',
        description: `Place a single stitch of the carried colour near the middle of each float of ${options.longFloatThreshold} stitches or more. This changes the motif; catching the float while knitting does not. Changes ${caughtCount} stitch(es).`,
        affectedStitches: caughtCount,
        apply: () => caught,
      })
    }
  }

  return suggestions
}

export function countDifferences(a: StitchGrid, b: StitchGrid): number {
  if (a.stitches !== b.stitches || a.rows !== b.rows) return -1
  let count = 0
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] !== b.cells[i]) count++
  return count
}

/**
 * Insert one stitch of the carried colour in the middle of over-long gaps.
 * Only touches rows that use exactly two colours, where "the carried colour" is
 * unambiguous.
 */
export function breakLongFloats(
  grid: StitchGrid,
  threshold: number,
  circular: boolean,
): StitchGrid {
  if (threshold < 2) return grid
  const next = cloneGrid(grid)

  for (let r = 0; r < grid.rows; r++) {
    const used = new Set<number>()
    for (let c = 0; c < grid.stitches; c++) used.add(getCell(grid, r, c))
    if (used.size !== 2) continue
    const [a, b] = [...used] as [number, number]

    for (const [carried, worked] of [
      [a, b],
      [b, a],
    ] as const) {
      const positions: number[] = []
      for (let c = 0; c < grid.stitches; c++) {
        if (next.cells[indexOf(grid, r, c)] === carried) positions.push(c)
      }
      if (positions.length === 0) continue
      for (let i = 1; i < positions.length; i++) {
        const from = positions[i - 1] as number
        const to = positions[i] as number
        const length = to - from - 1
        if (length < threshold) continue
        const middle = from + Math.floor(length / 2) + 1
        if (next.cells[indexOf(grid, r, middle)] === worked) {
          next.cells[indexOf(grid, r, middle)] = carried
        }
      }
      if (circular && positions.length > 0) {
        const last = positions[positions.length - 1] as number
        const first = positions[0] as number
        const length = grid.stitches - 1 - last + first
        if (length >= threshold) {
          const middle = (last + Math.floor(length / 2) + 1) % grid.stitches
          if (next.cells[indexOf(grid, r, middle)] === worked) {
            next.cells[indexOf(grid, r, middle)] = carried
          }
        }
      }
    }
  }
  return next
}

/**
 * Reduce every row to at most `maxColors` colours.
 *
 * Per row, the most-used colours are kept and every other stitch is remapped to
 * the nearest kept colour, measured in the same perceptual weighting the
 * palette conversion uses. A four-colour chart can satisfy a two-per-row
 * stranded constraint this way without losing its overall palette.
 */
export function limitColorsPerRow(
  grid: StitchGrid,
  maxColors: number,
  palette: readonly PaletteEntry[],
): StitchGrid {
  if (maxColors < 1 || palette.length <= maxColors) return grid
  const rgb = palette.map((entry) => hexToRgb(entry.hex))
  const next = cloneGrid(grid)

  for (let r = 0; r < grid.rows; r++) {
    const counts = new Map<number, number>()
    for (let c = 0; c < grid.stitches; c++) {
      const value = getCell(grid, r, c)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    if (counts.size <= maxColors) continue

    const kept = [...counts.entries()]
      // Most-used first; ties broken by palette order so the result is stable.
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, maxColors)
      .map(([index]) => index)

    const remap = new Map<number, number>()
    for (const [value] of counts) {
      if (kept.includes(value)) continue
      const from = rgb[value]
      let best = kept[0] as number
      let bestDistance = Infinity
      for (const candidate of kept) {
        const to = rgb[candidate]
        if (!from || !to) continue
        const distance = colorDistanceSq(from, to)
        if (distance < bestDistance) {
          bestDistance = distance
          best = candidate
        }
      }
      remap.set(value, best)
    }

    for (let c = 0; c < grid.stitches; c++) {
      const value = getCell(grid, r, c)
      const replacement = remap.get(value)
      if (replacement !== undefined) next.cells[indexOf(grid, r, c)] = replacement
    }
  }
  return next
}
