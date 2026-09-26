/**
 * Written colour instructions.
 *
 * Reading conventions, stated explicitly because charts are ambiguous without
 * them:
 *   Flat stockinette colourwork — right-side rows are read right to left,
 *     wrong-side rows left to right. Row 1 is the bottom chart row and is a
 *     right-side row.
 *   Circular colourwork — every round is a right-side round and is read right
 *     to left.
 *   Duplicate stitch — the chart is placement, not a knitting sequence. Rows are
 *     listed bottom to top and read left to right as you look at the fabric.
 *
 * Runs are emitted in actual working order, not in storage order.
 */
import type { PaletteEntry, StitchGrid, WorkingMethod } from '../../types/project'
import { createGrid, getCell, indexOf } from '../chart/grid'
import { methodOf } from './methods'

export interface ColorRun {
  paletteIndex: number
  count: number
}

export interface InstructionRow {
  /** 1-based working order: row 1 is worked first. */
  number: number
  /** Internal bottom-origin row index. */
  internalRow: number
  side: 'RS' | 'WS' | ''
  unit: 'Row' | 'Round'
  readsRightToLeft: boolean
  runs: ColorRun[]
  text: string
}

export interface InstructionSet {
  convention: string
  unit: 'Row' | 'Round'
  rows: InstructionRow[]
}

export function readsRightToLeft(method: WorkingMethod, rowNumber: number): boolean {
  const descriptor = methodOf(method)
  if (descriptor.id === 'duplicate-stitch') return false
  if (descriptor.circular) return true
  // Flat: odd rows (1, 3, 5, ...) are right-side rows.
  return rowNumber % 2 === 1
}

export function buildInstructions(
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  method: WorkingMethod,
): InstructionSet {
  const descriptor = methodOf(method)
  const unit: 'Row' | 'Round' = descriptor.circular ? 'Round' : 'Row'
  const rows: InstructionRow[] = []

  for (let internalRow = 0; internalRow < grid.rows; internalRow++) {
    const number = internalRow + 1
    const rightToLeft = readsRightToLeft(method, number)
    const columns: number[] = []
    if (rightToLeft) {
      for (let c = grid.stitches - 1; c >= 0; c--) columns.push(c)
    } else {
      for (let c = 0; c < grid.stitches; c++) columns.push(c)
    }

    const runs: ColorRun[] = []
    for (const column of columns) {
      const value = getCell(grid, internalRow, column)
      const last = runs[runs.length - 1]
      if (last && last.paletteIndex === value) last.count++
      else runs.push({ paletteIndex: value, count: 1 })
    }

    const side: 'RS' | 'WS' | '' =
      descriptor.id === 'duplicate-stitch' || descriptor.circular ? '' : rightToLeft ? 'RS' : 'WS'

    rows.push({
      number,
      internalRow,
      side,
      unit,
      readsRightToLeft: rightToLeft,
      runs,
      text: formatRuns(runs, palette),
    })
  }

  return { convention: conventionText(method), unit, rows }
}

export function formatRuns(runs: readonly ColorRun[], palette: readonly PaletteEntry[]): string {
  return runs
    .map((run) => {
      const entry = palette[run.paletteIndex]
      const name = entry ? entry.name : `Colour ${run.paletteIndex + 1}`
      return `${run.count} ${name}`
    })
    .join(', ')
}

export function conventionText(method: WorkingMethod): string {
  const descriptor = methodOf(method)
  if (descriptor.id === 'duplicate-stitch') {
    return 'Duplicate stitch placement. Rows are listed bottom to top and read left to right as you look at the fabric. This chart is placement, not a knitting sequence.'
  }
  if (descriptor.circular) {
    return 'Worked in the round. Round 1 is the bottom chart row. Every round is read right to left.'
  }
  return 'Worked flat in stockinette. Row 1 is the bottom chart row and is a right-side row. Right-side rows are read right to left, wrong-side rows left to right.'
}

/** Arrow glyph for the direction indicator next to a chart row. */
export function directionArrow(row: InstructionRow): string {
  return row.readsRightToLeft ? '←' : '→'
}

/**
 * Rebuild the grid from an instruction set. Used by the round-trip test: if the
 * working-order conversion is wrong in either direction, this will not match.
 */
export function instructionsToGrid(
  instructions: InstructionSet,
  stitches: number,
): StitchGrid {
  const rows = instructions.rows.length
  const grid = createGrid(stitches, rows)
  for (const row of instructions.rows) {
    const ordered: number[] = []
    for (const run of row.runs) {
      for (let i = 0; i < run.count; i++) ordered.push(run.paletteIndex)
    }
    if (ordered.length !== stitches) {
      throw new Error(
        `Row ${row.number} describes ${ordered.length} stitches but the chart is ${stitches} wide`,
      )
    }
    for (let i = 0; i < stitches; i++) {
      const column = row.readsRightToLeft ? stitches - 1 - i : i
      grid.cells[indexOf(grid, row.internalRow, column)] = ordered[i] as number
    }
  }
  return grid
}

/**
 * ASCII direction marker for the PDF. The standard PDF fonts are encoded in
 * WinAnsi, which has no arrow glyphs, so drawing U+2190 there throws.
 */
export function directionArrowAscii(row: InstructionRow): string {
  return row.readsRightToLeft ? '<-' : '->'
}
