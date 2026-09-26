import { describe, expect, it } from 'vitest'
import {
  applyProposal,
  blockSizeAt,
  isImprovement,
  objectiveFrom,
  optimiseBudget,
  proposeBlock,
  type Objective,
} from './optimise'
import { createGrid, getCell } from '../chart/grid'
import { createRng } from '../../lib/rng'
import { createProject } from '../chart/project'
import { DEFAULT_TRANSFORMS } from '../evaluation/transforms'

const objective = (detected: number, confidence: number): Objective => ({ detected, confidence })

describe('objective', () => {
  it('prefers fewer detections over lower confidence', () => {
    // One fewer detection beats any confidence advantage.
    expect(isImprovement(objective(1, 0.99), objective(2, 0.01))).toBe(true)
    expect(isImprovement(objective(2, 0.01), objective(1, 0.99))).toBe(false)
  })

  it('falls back to confidence at equal detection counts', () => {
    expect(isImprovement(objective(2, 0.4), objective(2, 0.6))).toBe(true)
    expect(isImprovement(objective(2, 0.6), objective(2, 0.4))).toBe(false)
  })

  it('does not count a negligible confidence change as progress', () => {
    expect(isImprovement(objective(2, 0.5), objective(2, 0.5000001))).toBe(false)
  })

  it('reads only the chart condition, and ignores failed inference', () => {
    const record = {
      perExample: [
        {
          conditions: [
            { condition: 'original', matched: { score: 0.9 }, inferenceOk: true },
            { condition: 'chart-pattern', matched: { score: 0.4 }, inferenceOk: true },
          ],
        },
        {
          conditions: [
            { condition: 'chart-pattern', matched: { score: 0.8 }, inferenceOk: false },
          ],
        },
        {
          conditions: [{ condition: 'chart-pattern', matched: null, inferenceOk: true }],
        },
      ],
    }
    // Only the first example counts: the second failed, the third was censored.
    expect(objectiveFrom(record)).toEqual({ detected: 1, confidence: 0.4 })
  })
})

describe('proposals', () => {
  it('stays inside the chart', () => {
    const grid = createGrid(20, 30)
    const rng = createRng(7)
    for (let i = 0; i < 300; i++) {
      const proposal = proposeBlock(grid, 4, 8, rng)
      expect(proposal.row).toBeGreaterThanOrEqual(0)
      expect(proposal.column).toBeGreaterThanOrEqual(0)
      expect(proposal.row + proposal.rows).toBeLessThanOrEqual(grid.rows)
      expect(proposal.column + proposal.stitches).toBeLessThanOrEqual(grid.stitches)
      expect(proposal.paletteIndex).toBeLessThan(4)
    }
  })

  it('is reproducible from the seed', () => {
    const grid = createGrid(20, 30)
    const a = proposeBlock(grid, 4, 6, createRng(11))
    const b = proposeBlock(grid, 4, 6, createRng(11))
    expect(b).toEqual(a)
  })

  it('recolours exactly the proposed block and nothing else', () => {
    const grid = createGrid(10, 10)
    const proposal = { row: 2, column: 3, rows: 3, stitches: 4, paletteIndex: 2 }
    const next = applyProposal(grid, proposal)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const inside = r >= 2 && r < 5 && c >= 3 && c < 7
        expect(getCell(next, r, c), `${r},${c}`).toBe(inside ? 2 : 0)
      }
    }
  })

  it('returns the same grid when the block already has that colour', () => {
    const grid = createGrid(8, 8)
    const next = applyProposal(grid, { row: 0, column: 0, rows: 2, stitches: 2, paletteIndex: 0 })
    expect(next).toBe(grid)
  })

  it('does not mutate the grid it was given', () => {
    const grid = createGrid(8, 8)
    const before = Array.from(grid.cells)
    applyProposal(grid, { row: 1, column: 1, rows: 3, stitches: 3, paletteIndex: 3 })
    expect(Array.from(grid.cells)).toEqual(before)
  })
})

describe('block schedule', () => {
  const grid = createGrid(64, 80)

  it('starts broad and ends fine', () => {
    const first = blockSizeAt(0, 100, grid)
    const last = blockSizeAt(99, 100, grid)
    expect(first).toBeGreaterThan(last)
    expect(last).toBeGreaterThanOrEqual(1)
  })

  it('shrinks monotonically', () => {
    let previous = Infinity
    for (let step = 0; step < 50; step++) {
      const size = blockSizeAt(step, 50, grid)
      expect(size).toBeLessThanOrEqual(previous + 1e-9)
      previous = size
    }
  })

  it('scales with the chart rather than using fixed stitch counts', () => {
    const small = blockSizeAt(0, 10, createGrid(20, 20))
    const large = blockSizeAt(0, 10, createGrid(200, 200))
    expect(large).toBeGreaterThan(small)
  })

  it('handles a single-step run', () => {
    expect(blockSizeAt(0, 1, grid)).toBeGreaterThanOrEqual(1)
  })
})

describe('optimiseBudget', () => {
  it('counts one baseline per example plus one query per step', () => {
    const request = {
      project: createProject(),
      steps: 50,
      seed: 1,
      constraints: { maxFloat: 7, enforceColorsPerRow: true },
      baseConfig: { transforms: DEFAULT_TRANSFORMS } as never,
      optimizationImages: [{}, {}] as never,
    } as Parameters<typeof optimiseBudget>[0]
    // 2 examples x (1 baseline + 50 steps + 1 starting measurement).
    expect(optimiseBudget(request)).toBe(2 * 52)
  })
})
