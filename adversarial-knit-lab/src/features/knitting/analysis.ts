/**
 * Knitting analysis.
 *
 * Definitions used here, stated because they are easy to conflate:
 *
 *   Colour run  — consecutive stitches of the same colour in one row. This is a
 *                 property of the chart alone.
 *   Float       — the length of yarn carried behind the fabric between two
 *                 stitches worked in the same colour, measured in stitches
 *                 passed over. A colour run and a float are not the same thing:
 *                 a run of 9 background stitches only creates a 9-stitch float
 *                 for a contrast yarn that is actually in use on that row, on
 *                 both sides of the run.
 *
 * Simplifications, deliberately conservative:
 *   - Stitches before a colour's first appearance in a row and after its last
 *     appearance are not counted as floats. In practice the yarn is introduced
 *     and dropped at those points, or caught at the edge.
 *   - Yarn dominance, catching floats mid-span and steeking are out of scope.
 *   - Float limits are configurable warnings, not a verdict on knittability.
 */
import type {
  AnalysisOptions,
  AnalysisWarning,
  FloatSpan,
  IsolatedRegion,
  KnittingAnalysis,
  RepeatSize,
  RowColorUsage,
  StitchGrid,
  WorkingMethod,
} from '../../types/project'
import { getCell } from '../chart/grid'
import { findRegions, seamMismatch } from '../chart/regions'
import { methodOf } from './methods'
import { repeatFit } from './gauge'

export interface AnalyzeInput {
  grid: StitchGrid
  workingMethod: WorkingMethod
  repeat: RepeatSize
  options: AnalysisOptions
  /** Chart content hash, stored so stale analysis is detectable. */
  contentHash: string
}

export function analyzeChart(input: AnalyzeInput): KnittingAnalysis {
  const { grid, repeat, options, contentHash } = input
  const method = methodOf(input.workingMethod)

  const rowColorUsage = computeRowColorUsage(grid)
  const maxColorsInAnyRow = rowColorUsage.reduce(
    (max, row) => Math.max(max, row.paletteIndices.length),
    0,
  )
  const rowsExceedingColorLimit = method.stranded
    ? rowColorUsage
        .filter((row) => row.paletteIndices.length > options.maxColorsPerRow)
        .map((row) => row.row)
    : []

  const longestColorRun = computeLongestColorRun(grid, method.circular)
  const floats = method.stranded ? computeFloats(grid, method.circular) : []
  const longestFloat = floats.reduce((max, f) => Math.max(max, f.length), 0)
  const longFloats = floats.filter((f) => f.length >= options.longFloatThreshold)

  const wrap = method.circular
  const regions = findRegions(grid, { wrapColumns: wrap })
  const isolatedRegions: IsolatedRegion[] = regions
    .filter((r) => r.size <= options.isolatedRegionThreshold)
    .map((r) => ({ paletteIndex: r.paletteIndex, size: r.size, row: r.row, column: r.column }))
    .sort((a, b) => a.size - b.size)

  const fit = repeatFit(grid, repeat)
  const seam = seamMismatch(grid, repeat.stitches, repeat.rows)

  const totalColors = new Set<number>()
  for (let i = 0; i < grid.cells.length; i++) totalColors.add(grid.cells[i] as number)

  const analysis: KnittingAnalysis = {
    computedForHash: contentHash,
    totalColors: totalColors.size,
    rowColorUsage,
    maxColorsInAnyRow,
    rowsExceedingColorLimit,
    longestColorRun,
    floats,
    longestFloat,
    longFloats,
    isolatedRegions,
    repeat: {
      fitsHorizontally: fit.fitsHorizontally,
      fitsVertically: fit.fitsVertically,
      horizontalRemainder: fit.horizontalRemainder,
      verticalRemainder: fit.verticalRemainder,
      seamMismatchColumns: seam.seamMismatchColumns,
      seamMismatchRows: seam.seamMismatchRows,
    },
    warnings: [],
  }
  analysis.warnings = buildWarnings(analysis, input)
  return analysis
}

export function computeRowColorUsage(grid: StitchGrid): RowColorUsage[] {
  const usage: RowColorUsage[] = []
  for (let r = 0; r < grid.rows; r++) {
    const seen = new Set<number>()
    for (let c = 0; c < grid.stitches; c++) seen.add(getCell(grid, r, c))
    usage.push({ row: r, paletteIndices: [...seen].sort((a, b) => a - b) })
  }
  return usage
}

/** Longest run of one colour in any row. Wraps for circular work. */
export function computeLongestColorRun(grid: StitchGrid, circular: boolean): number {
  let longest = 0
  for (let r = 0; r < grid.rows; r++) {
    let run = 1
    let best = 1
    for (let c = 1; c < grid.stitches; c++) {
      run = getCell(grid, r, c) === getCell(grid, r, c - 1) ? run + 1 : 1
      if (run > best) best = run
    }
    if (circular && grid.stitches > 1) {
      const first = getCell(grid, r, 0)
      const last = getCell(grid, r, grid.stitches - 1)
      if (first === last) {
        let head = 0
        while (head < grid.stitches && getCell(grid, r, head) === first) head++
        let tail = 0
        while (tail < grid.stitches && getCell(grid, r, grid.stitches - 1 - tail) === first) tail++
        if (head < grid.stitches) best = Math.max(best, head + tail)
        else best = grid.stitches
      }
    }
    longest = Math.max(longest, best)
  }
  return longest
}

/**
 * Float spans per row. For each colour used in a row, the gaps between
 * successive stitches of that colour are the lengths carried behind.
 */
export function computeFloats(grid: StitchGrid, circular: boolean): FloatSpan[] {
  const floats: FloatSpan[] = []
  for (let r = 0; r < grid.rows; r++) {
    const positions = new Map<number, number[]>()
    for (let c = 0; c < grid.stitches; c++) {
      const value = getCell(grid, r, c)
      const list = positions.get(value)
      if (list) list.push(c)
      else positions.set(value, [c])
    }
    // A colour used on every stitch of the row is never carried.
    if (positions.size < 2) continue

    for (const [paletteIndex, cols] of positions) {
      for (let i = 1; i < cols.length; i++) {
        const from = cols[i - 1] as number
        const to = cols[i] as number
        const length = to - from - 1
        if (length <= 0) continue
        floats.push({
          row: r,
          startColumn: from + 1,
          endColumn: to - 1,
          length,
          paletteIndex,
          wrapsRoundBoundary: false,
        })
      }
      if (circular && cols.length > 0) {
        const last = cols[cols.length - 1] as number
        const first = cols[0] as number
        const length = grid.stitches - 1 - last + first
        if (length > 0) {
          floats.push({
            row: r,
            startColumn: last + 1,
            endColumn: first - 1 < 0 ? grid.stitches - 1 : first - 1,
            length,
            paletteIndex,
            wrapsRoundBoundary: true,
          })
        }
      }
    }
  }
  return floats
}

function buildWarnings(analysis: KnittingAnalysis, input: AnalyzeInput): AnalysisWarning[] {
  const method = methodOf(input.workingMethod)
  const warnings: AnalysisWarning[] = []

  if (method.stranded && analysis.rowsExceedingColorLimit.length > 0) {
    warnings.push({
      id: 'colors-per-row',
      severity: 'warning',
      message: `${analysis.rowsExceedingColorLimit.length} row(s) use more than ${input.options.maxColorsPerRow} colours. A chart may use more colours overall as long as each single row stays within the limit.`,
    })
  }
  if (method.stranded && analysis.longFloats.length > 0) {
    warnings.push({
      id: 'long-floats',
      severity: 'warning',
      message: `${analysis.longFloats.length} float(s) reach ${input.options.longFloatThreshold} stitches or more (longest ${analysis.longestFloat}). Catch them, or edit the chart. The threshold is a setting, not a rule.`,
    })
  }
  if (!method.stranded && input.workingMethod === 'duplicate-stitch') {
    warnings.push({
      id: 'duplicate-stitch-guidance',
      severity: 'info',
      message: methodOf('duplicate-stitch').guidance,
    })
  }
  if (!method.stranded && input.workingMethod === 'intarsia') {
    warnings.push({
      id: 'intarsia-guidance',
      severity: 'info',
      message: methodOf('intarsia').guidance,
    })
  }
  if (analysis.isolatedRegions.length > 0) {
    warnings.push({
      id: 'isolated-regions',
      severity: 'info',
      message: `${analysis.isolatedRegions.length} region(s) of ${input.options.isolatedRegionThreshold} stitch(es) or fewer. Single stitches read as speckle in the finished fabric and disappear at a distance.`,
    })
  }
  if (!analysis.repeat.fitsHorizontally) {
    warnings.push({
      id: 'repeat-width',
      severity: 'info',
      message: `The chart width is not a whole number of repeats: ${analysis.repeat.horizontalRemainder} stitch(es) left over.`,
    })
  }
  if (!analysis.repeat.fitsVertically) {
    warnings.push({
      id: 'repeat-height',
      severity: 'info',
      message: `The chart height is not a whole number of repeats: ${analysis.repeat.verticalRemainder} row(s) left over.`,
    })
  }
  if (analysis.repeat.seamMismatchColumns > 0 || analysis.repeat.seamMismatchRows > 0) {
    warnings.push({
      id: 'repeat-seam',
      severity: 'info',
      message: `Repeat seam: ${analysis.repeat.seamMismatchColumns} column mismatch(es) and ${analysis.repeat.seamMismatchRows} row mismatch(es) where the tile meets itself.`,
    })
  }
  return warnings
}
