import { describe, expect, it } from 'vitest'
import { planChartTiles } from './pdf'

// A4 and US Letter minus the 42 pt margins and the 46 pt sheet header.
const A4 = { width: 595.28 - 84, height: 841.89 - 84 - 46 }
const LETTER = { width: 612 - 84, height: 792 - 84 - 46 }

const MIN_CELL = 6
const MAX_CELL = 16
const OVERLAP = 2

function coveredCells(plan: ReturnType<typeof planChartTiles>, stitches: number, rows: number) {
  const seen = new Set<string>()
  for (let ty = 0; ty < plan.tilesY; ty++) {
    for (let tx = 0; tx < plan.tilesX; tx++) {
      const startColumn = tx * plan.strideX
      const startRow = ty * plan.strideY
      const columns = Math.min(plan.tileColumns, stitches - startColumn)
      const tileRows = Math.min(plan.tileRows, rows - startRow)
      for (let r = 0; r < tileRows; r++) {
        for (let c = 0; c < columns; c++) seen.add(`${startRow + r},${startColumn + c}`)
      }
    }
  }
  return seen
}

describe('planChartTiles', () => {
  it('uses one page when the whole chart fits at a readable size', () => {
    const plan = planChartTiles(64, 80, A4.width, A4.height)
    expect(plan.singlePage).toBe(true)
    expect(plan.tilesX).toBe(1)
    expect(plan.tilesY).toBe(1)
    expect(plan.cell).toBeGreaterThanOrEqual(MIN_CELL)
    expect(plan.cell).toBeLessThanOrEqual(MAX_CELL)
  })

  it('never shrinks a cell below the readable minimum', () => {
    for (const page of [A4, LETTER]) {
      for (const [stitches, rows] of [
        [40, 40],
        [140, 180],
        [200, 300],
        [400, 600],
        [13, 401],
      ] as const) {
        const plan = planChartTiles(stitches, rows, page.width, page.height)
        expect(plan.cell, `${stitches}x${rows}`).toBeGreaterThanOrEqual(MIN_CELL - 1e-6)
        expect(plan.cell).toBeLessThanOrEqual(MAX_CELL + 1e-6)
      }
    }
  })

  it('keeps every sheet inside the printable area', () => {
    for (const [stitches, rows] of [
      [140, 180],
      [200, 300],
      [400, 600],
      [97, 233],
    ] as const) {
      const plan = planChartTiles(stitches, rows, A4.width, A4.height)
      expect(plan.tileColumns * plan.cell).toBeLessThanOrEqual(A4.width + 1e-6)
      expect(plan.tileRows * plan.cell).toBeLessThanOrEqual(A4.height + 1e-6)
    }
  })

  it('covers every stitch of the chart, with no gaps', () => {
    for (const [stitches, rows] of [
      [140, 180],
      [200, 300],
      [400, 600],
      [97, 233],
      [86, 119],
    ] as const) {
      const plan = planChartTiles(stitches, rows, A4.width, A4.height)
      const seen = coveredCells(plan, stitches, rows)
      expect(seen.size, `${stitches}x${rows}`).toBe(stitches * rows)
    }
  })

  it('overlaps neighbouring sheets so they can be aligned', () => {
    const plan = planChartTiles(200, 300, A4.width, A4.height)
    expect(plan.singlePage).toBe(false)
    expect(plan.tileColumns - plan.strideX).toBe(OVERLAP)
    expect(plan.tileRows - plan.strideY).toBe(OVERLAP)
  })

  it('spreads the chart evenly instead of leaving a thin last sheet', () => {
    // 140 stitches over two sheets should be about 71 each, not 85 and 57.
    const plan = planChartTiles(140, 180, A4.width, A4.height)
    expect(plan.tilesX).toBe(2)
    expect(plan.tileColumns).toBe(71)
    const lastSheetColumns = 140 - plan.strideX
    expect(Math.abs(lastSheetColumns - plan.tileColumns)).toBeLessThanOrEqual(OVERLAP)
    // Balanced sheets let the cell grow past the bare minimum.
    expect(plan.cell).toBeGreaterThan(MIN_CELL)
  })

  it('uses more of the page than a minimum-size layout would', () => {
    const plan = planChartTiles(140, 180, A4.width, A4.height)
    const usedArea = plan.tileColumns * plan.cell * (plan.tileRows * plan.cell)
    expect(usedArea / (A4.width * A4.height)).toBeGreaterThan(0.75)
  })
})
