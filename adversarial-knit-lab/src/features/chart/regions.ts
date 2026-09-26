/**
 * Connected-component analysis over the stitch grid.
 *
 * `wrapColumns` makes the left and right chart edges adjacent, which is what a
 * repeat tile and circular knitting actually do. `wrapRows` does the same
 * vertically for a tile that repeats up the fabric. Without these, every tile
 * would report false "isolated region" and "seam" results at its edges.
 */
import type { StitchGrid } from '../../types/project'
import { cloneGrid, getCell, indexOf } from './grid'

export interface Region {
  paletteIndex: number
  size: number
  cells: number[]
  /** One representative cell. */
  row: number
  column: number
}

export interface RegionOptions {
  wrapColumns?: boolean
  wrapRows?: boolean
}

export function findRegions(grid: StitchGrid, options: RegionOptions = {}): Region[] {
  const { wrapColumns = false, wrapRows = false } = options
  const labels = new Int32Array(grid.cells.length).fill(-1)
  const regions: Region[] = []
  const queue: number[] = []

  for (let start = 0; start < grid.cells.length; start++) {
    if (labels[start] !== -1) continue
    const paletteIndex = grid.cells[start] as number
    const id = regions.length
    const cells: number[] = []
    queue.length = 0
    queue.push(start)
    labels[start] = id

    while (queue.length > 0) {
      const i = queue.pop() as number
      cells.push(i)
      const r = Math.floor(i / grid.stitches)
      const c = i % grid.stitches

      for (const [dr, dc] of NEIGHBOURS) {
        let nr = r + (dr as number)
        let nc = c + (dc as number)
        if (nr < 0 || nr >= grid.rows) {
          if (!wrapRows) continue
          nr = (nr + grid.rows) % grid.rows
        }
        if (nc < 0 || nc >= grid.stitches) {
          if (!wrapColumns) continue
          nc = (nc + grid.stitches) % grid.stitches
        }
        const ni = nr * grid.stitches + nc
        if (labels[ni] !== -1) continue
        if (grid.cells[ni] !== paletteIndex) continue
        labels[ni] = id
        queue.push(ni)
      }
    }

    regions.push({
      paletteIndex,
      size: cells.length,
      cells,
      row: Math.floor(start / grid.stitches),
      column: start % grid.stitches,
    })
  }
  return regions
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * Replace regions at or below `minSize` with the palette index that occupies
 * most of their boundary. Runs repeatedly because merging two small regions can
 * produce one that is still small.
 */
export function removeSmallRegions(
  grid: StitchGrid,
  minSize: number,
  options: RegionOptions = {},
  maxPasses = 12,
): StitchGrid {
  if (minSize < 1) return grid
  let current = grid
  for (let pass = 0; pass < maxPasses; pass++) {
    const regions = findRegions(current, options)
    // Largest first: absorbing a bigger region gives its smaller neighbours a
    // more stable colour to merge into on the same pass.
    const small = regions
      .filter((region) => region.size <= minSize)
      .sort((a, b) => b.size - a.size)
    if (small.length === 0) break

    const next = cloneGrid(current)
    let changed = false
    // Sequential, against the working copy: if two small regions are adjacent,
    // the second one sees the first one's new colour instead of swapping with
    // it, which is what previously prevented convergence.
    for (const region of small) {
      const stillSmall = region.cells.every((i) => next.cells[i] === region.paletteIndex)
      if (!stillSmall) continue
      const replacement = dominantNeighbour(next, region, options)
      if (replacement === null || replacement === region.paletteIndex) continue
      for (const i of region.cells) next.cells[i] = replacement
      changed = true
    }
    if (!changed) break
    current = next
  }
  return current
}

function dominantNeighbour(
  grid: StitchGrid,
  region: Region,
  options: RegionOptions,
): number | null {
  const { wrapColumns = false, wrapRows = false } = options
  const counts = new Map<number, number>()
  const member = new Set(region.cells)

  for (const i of region.cells) {
    const r = Math.floor(i / grid.stitches)
    const c = i % grid.stitches
    for (const [dr, dc] of NEIGHBOURS) {
      let nr = r + (dr as number)
      let nc = c + (dc as number)
      if (nr < 0 || nr >= grid.rows) {
        if (!wrapRows) continue
        nr = (nr + grid.rows) % grid.rows
      }
      if (nc < 0 || nc >= grid.stitches) {
        if (!wrapColumns) continue
        nc = (nc + grid.stitches) % grid.stitches
      }
      const ni = nr * grid.stitches + nc
      if (member.has(ni)) continue
      const value = grid.cells[ni] as number
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }

  let best: number | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      best = value
    }
  }
  return best
}

/** Count cells where the tile does not join itself across the repeat seam. */
export function seamMismatch(grid: StitchGrid, repeatStitches: number, repeatRows: number) {
  let seamMismatchColumns = 0
  let seamMismatchRows = 0

  if (repeatStitches > 0 && repeatStitches <= grid.stitches) {
    for (let r = 0; r < grid.rows; r++) {
      const left = getCell(grid, r, 0)
      const right = getCell(grid, r, repeatStitches - 1)
      // A seam "matches" when the colour continuing past the tile edge is the
      // one the next tile starts with, judged against the neighbour inside.
      const inwardRight = getCell(grid, r, Math.max(0, repeatStitches - 2))
      if (left !== right && left !== inwardRight) seamMismatchColumns++
    }
  }
  if (repeatRows > 0 && repeatRows <= grid.rows) {
    for (let c = 0; c < grid.stitches; c++) {
      const bottom = getCell(grid, 0, c)
      const top = getCell(grid, repeatRows - 1, c)
      const inwardTop = getCell(grid, Math.max(0, repeatRows - 2), c)
      if (bottom !== top && bottom !== inwardTop) seamMismatchRows++
    }
  }
  return { seamMismatchColumns, seamMismatchRows }
}

export { indexOf }
