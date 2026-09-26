/**
 * Control pattern.
 *
 * The point of the control is to separate "this specific pattern did something"
 * from "any busy texture in the same colours did something". It therefore uses
 * the same palette and matches the chart's colour histogram as closely as a
 * random draw allows, at the same stitch dimensions.
 *
 * It is random noise at the chart's own scale, not a second designed pattern.
 */
import type { StitchGrid } from '../../types/project'
import { createGrid } from '../chart/grid'
import { createRng } from '../../lib/rng'
import { paletteHistogram } from './texture'

export function buildControlPattern(
  reference: StitchGrid,
  paletteLength: number,
  seed: number,
): StitchGrid {
  const histogram = paletteHistogram(reference, paletteLength)
  const cumulative: number[] = []
  let running = 0
  for (const share of histogram) {
    running += share
    cumulative.push(running)
  }
  const total = running || 1

  const rng = createRng(seed)
  const grid = createGrid(reference.stitches, reference.rows)
  for (let i = 0; i < grid.cells.length; i++) {
    const draw = rng.next() * total
    let index = cumulative.findIndex((edge) => draw <= edge)
    if (index < 0) index = Math.max(0, paletteLength - 1)
    grid.cells[i] = index
  }
  return grid
}
