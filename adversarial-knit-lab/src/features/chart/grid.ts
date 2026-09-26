/**
 * Stitch-grid operations.
 *
 * Pure functions over the bottom-origin grid defined in types/project.ts.
 * Nothing here touches React, the DOM or canvas.
 */
import type { Gauge, PaletteEntry, RepeatSize, StitchGrid, WorkingMethod } from '../../types/project'
import { hashString } from '../../lib/hash'

export const MAX_STITCHES = 400
export const MAX_ROWS = 600
/** Guard against pathological charts in imports and generation. */
export const MAX_CELLS = 120_000

export function createGrid(stitches: number, rows: number, fill = 0): StitchGrid {
  assertDimensions(stitches, rows)
  const cells = new Uint8Array(stitches * rows)
  if (fill !== 0) cells.fill(fill)
  return { stitches, rows, cells }
}

export function assertDimensions(stitches: number, rows: number): void {
  if (!Number.isInteger(stitches) || !Number.isInteger(rows)) {
    throw new Error('Chart dimensions must be integers')
  }
  if (stitches < 1 || rows < 1) throw new Error('Chart dimensions must be at least 1')
  if (stitches > MAX_STITCHES) throw new Error(`Chart width exceeds ${MAX_STITCHES} stitches`)
  if (rows > MAX_ROWS) throw new Error(`Chart height exceeds ${MAX_ROWS} rows`)
  if (stitches * rows > MAX_CELLS) throw new Error(`Chart exceeds ${MAX_CELLS} cells`)
}

export function indexOf(grid: StitchGrid, row: number, column: number): number {
  return row * grid.stitches + column
}

export function inBounds(grid: StitchGrid, row: number, column: number): boolean {
  return row >= 0 && row < grid.rows && column >= 0 && column < grid.stitches
}

/** Palette index at an internal (bottom-origin) coordinate. */
export function getCell(grid: StitchGrid, row: number, column: number): number {
  if (!inBounds(grid, row, column)) return 0
  return grid.cells[indexOf(grid, row, column)] as number
}

export function cloneGrid(grid: StitchGrid): StitchGrid {
  return { stitches: grid.stitches, rows: grid.rows, cells: new Uint8Array(grid.cells) }
}

/** Returns a new grid; the input is never mutated. */
export function setCell(
  grid: StitchGrid,
  row: number,
  column: number,
  paletteIndex: number,
): StitchGrid {
  if (!inBounds(grid, row, column)) return grid
  if (getCell(grid, row, column) === paletteIndex) return grid
  const next = cloneGrid(grid)
  next.cells[indexOf(grid, row, column)] = paletteIndex
  return next
}

/** Set many cells at once. Mutating a single copy keeps stroke drawing cheap. */
export function setCells(
  grid: StitchGrid,
  points: Iterable<{ row: number; column: number }>,
  paletteIndex: number,
): StitchGrid {
  const next = cloneGrid(grid)
  let changed = false
  for (const { row, column } of points) {
    if (!inBounds(grid, row, column)) continue
    const i = indexOf(grid, row, column)
    if (next.cells[i] !== paletteIndex) {
      next.cells[i] = paletteIndex
      changed = true
    }
  }
  return changed ? next : grid
}

export function fillRect(
  grid: StitchGrid,
  rect: { row: number; column: number; rows: number; stitches: number },
  paletteIndex: number,
): StitchGrid {
  const next = cloneGrid(grid)
  let changed = false
  for (let r = rect.row; r < rect.row + rect.rows; r++) {
    for (let c = rect.column; c < rect.column + rect.stitches; c++) {
      if (!inBounds(grid, r, c)) continue
      const i = indexOf(grid, r, c)
      if (next.cells[i] !== paletteIndex) {
        next.cells[i] = paletteIndex
        changed = true
      }
    }
  }
  return changed ? next : grid
}

/**
 * 4-connected flood fill from a seed cell.
 * `wrapColumns` joins the left and right chart edges, which is what circular
 * knitting actually does.
 */
export function floodFill(
  grid: StitchGrid,
  row: number,
  column: number,
  paletteIndex: number,
  wrapColumns = false,
): StitchGrid {
  if (!inBounds(grid, row, column)) return grid
  const target = getCell(grid, row, column)
  if (target === paletteIndex) return grid

  const next = cloneGrid(grid)
  const stack: number[] = [indexOf(grid, row, column)]
  const seen = new Uint8Array(grid.cells.length)

  while (stack.length > 0) {
    const i = stack.pop() as number
    if (seen[i]) continue
    seen[i] = 1
    if (next.cells[i] !== target) continue
    next.cells[i] = paletteIndex

    const r = Math.floor(i / grid.stitches)
    const c = i % grid.stitches
    if (r > 0) stack.push(indexOf(grid, r - 1, c))
    if (r < grid.rows - 1) stack.push(indexOf(grid, r + 1, c))
    if (c > 0) stack.push(indexOf(grid, r, c - 1))
    else if (wrapColumns) stack.push(indexOf(grid, r, grid.stitches - 1))
    if (c < grid.stitches - 1) stack.push(indexOf(grid, r, c + 1))
    else if (wrapColumns) stack.push(indexOf(grid, r, 0))
  }
  return next
}

/** Replace every occurrence of one palette index with another. */
export function replaceColor(grid: StitchGrid, from: number, to: number): StitchGrid {
  if (from === to) return grid
  const next = cloneGrid(grid)
  let changed = false
  for (let i = 0; i < next.cells.length; i++) {
    if (next.cells[i] === from) {
      next.cells[i] = to
      changed = true
    }
  }
  return changed ? next : grid
}

/**
 * Remove a palette entry and remap every cell. Cells using the removed colour
 * fall back to `fallbackIndex` (evaluated before re-indexing).
 */
export function removePaletteColor(
  grid: StitchGrid,
  palette: PaletteEntry[],
  removeIndex: number,
  fallbackIndex: number,
): { grid: StitchGrid; palette: PaletteEntry[] } {
  if (palette.length <= 1) throw new Error('A chart needs at least one colour')
  if (removeIndex < 0 || removeIndex >= palette.length) throw new Error('No such palette entry')
  const remapped = replaceColor(grid, removeIndex, fallbackIndex)
  const next = cloneGrid(remapped)
  for (let i = 0; i < next.cells.length; i++) {
    const v = next.cells[i] as number
    if (v > removeIndex) next.cells[i] = v - 1
  }
  const nextPalette = palette.filter((_, i) => i !== removeIndex)
  return { grid: next, palette: nextPalette }
}

export function flipHorizontal(grid: StitchGrid): StitchGrid {
  const next = createGrid(grid.stitches, grid.rows)
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.stitches; c++) {
      next.cells[indexOf(next, r, c)] = getCell(grid, r, grid.stitches - 1 - c)
    }
  }
  return next
}

export function flipVertical(grid: StitchGrid): StitchGrid {
  const next = createGrid(grid.stitches, grid.rows)
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.stitches; c++) {
      next.cells[indexOf(next, r, c)] = getCell(grid, grid.rows - 1 - r, c)
    }
  }
  return next
}

/**
 * Resize the chart. Existing stitches keep their position relative to the
 * bottom-left corner; new area is filled with `fill`. This is a crop/extend,
 * not a resample, because resampling a colourwork chart invents stitches.
 */
export function resizeGrid(
  grid: StitchGrid,
  stitches: number,
  rows: number,
  fill = 0,
): StitchGrid {
  assertDimensions(stitches, rows)
  const next = createGrid(stitches, rows, fill)
  const copyRows = Math.min(rows, grid.rows)
  const copyCols = Math.min(stitches, grid.stitches)
  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyCols; c++) {
      next.cells[indexOf(next, r, c)] = getCell(grid, r, c)
    }
  }
  return next
}

/** Sample the grid as a repeating tile, for previews and texture fills. */
export function sampleTiled(grid: StitchGrid, row: number, column: number): number {
  const r = ((row % grid.rows) + grid.rows) % grid.rows
  const c = ((column % grid.stitches) + grid.stitches) % grid.stitches
  return grid.cells[r * grid.stitches + c] as number
}

/** Convert an internal bottom-origin row to a top-origin display row. */
export function toDisplayRow(grid: StitchGrid, internalRow: number): number {
  return grid.rows - 1 - internalRow
}

/** Convert a top-origin display row back to the internal bottom-origin row. */
export function toInternalRow(grid: StitchGrid, displayRow: number): number {
  return grid.rows - 1 - displayRow
}

/** Palette indices that actually appear in the grid, ascending. */
export function usedPaletteIndices(grid: StitchGrid): number[] {
  const seen = new Set<number>()
  for (let i = 0; i < grid.cells.length; i++) seen.add(grid.cells[i] as number)
  return [...seen].sort((a, b) => a - b)
}

/** True when every cell refers to an existing palette entry. */
export function paletteIndicesValid(grid: StitchGrid, paletteLength: number): boolean {
  for (let i = 0; i < grid.cells.length; i++) {
    const v = grid.cells[i] as number
    if (v < 0 || v >= paletteLength) return false
  }
  return true
}

/**
 * Content hash covering everything that can change a rendered motif or its
 * physical proportions. An evaluation record carrying a different hash is
 * stale.
 */
export function chartContentHash(input: {
  grid: StitchGrid
  palette: readonly PaletteEntry[]
  gauge: Gauge
  workingMethod: WorkingMethod
  repeat: RepeatSize
}): string {
  const parts: string[] = [
    `v1`,
    `${input.grid.stitches}x${input.grid.rows}`,
    input.palette.map((p) => p.hex.toLowerCase()).join(','),
    `${input.gauge.stitchesPer10cm}/${input.gauge.rowsPer10cm}`,
    input.workingMethod,
    `${input.repeat.stitches}x${input.repeat.rows}`,
  ]
  // Cell data folded in directly rather than via JSON, to keep this cheap.
  let cellHash = 0x811c9dc5
  for (let i = 0; i < input.grid.cells.length; i++) {
    cellHash = Math.imul(cellHash ^ (input.grid.cells[i] as number), 0x01000193) >>> 0
  }
  parts.push(cellHash.toString(16))
  return hashString(parts.join('|'))
}

/** Run-length encoding used by the project file, so JSON stays small. */
export function encodeCells(grid: StitchGrid): string {
  const out: string[] = []
  let run = 1
  for (let i = 1; i <= grid.cells.length; i++) {
    if (i < grid.cells.length && grid.cells[i] === grid.cells[i - 1]) {
      run++
      continue
    }
    out.push(run === 1 ? `${grid.cells[i - 1]}` : `${grid.cells[i - 1]}x${run}`)
    run = 1
  }
  return out.join('.')
}

export function decodeCells(encoded: string, stitches: number, rows: number): Uint8Array {
  assertDimensions(stitches, rows)
  const cells = new Uint8Array(stitches * rows)
  let at = 0
  if (encoded.length === 0) return cells
  for (const token of encoded.split('.')) {
    const [valueText, runText] = token.split('x')
    const value = Number(valueText)
    const run = runText === undefined ? 1 : Number(runText)
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`Invalid palette index in stitch data: ${valueText}`)
    }
    if (!Number.isInteger(run) || run < 1) {
      throw new Error(`Invalid run length in stitch data: ${runText}`)
    }
    if (at + run > cells.length) throw new Error('Stitch data is longer than the declared chart')
    cells.fill(value, at, at + run)
    at += run
  }
  if (at !== cells.length) throw new Error('Stitch data is shorter than the declared chart')
  return cells
}
