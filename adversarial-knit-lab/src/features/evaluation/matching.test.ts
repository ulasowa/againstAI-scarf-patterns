import { describe, expect, it } from 'vitest'
import { intersectionOverUnion, matchTarget } from './matching'
import type { Detection } from '../../types/project'

const target = { x: 100, y: 50, width: 80, height: 200 }

function detection(x: number, y: number, w: number, h: number, score: number, label = 'person'): Detection {
  return { label, score, box: { x, y, width: w, height: h } }
}

describe('intersectionOverUnion', () => {
  it('is 1 for identical boxes and 0 for disjoint ones', () => {
    expect(intersectionOverUnion(target, { ...target })).toBeCloseTo(1, 10)
    expect(intersectionOverUnion(target, { x: 500, y: 500, width: 10, height: 10 })).toBe(0)
  })

  it('handles touching boxes without producing a negative overlap', () => {
    expect(intersectionOverUnion(target, { x: 180, y: 50, width: 80, height: 200 })).toBe(0)
  })

  it('computes a known partial overlap', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    const b = { x: 5, y: 0, width: 10, height: 10 }
    // intersection 50, union 150
    expect(intersectionOverUnion(a, b)).toBeCloseTo(50 / 150, 10)
  })
})

describe('matchTarget', () => {
  const options = { detectionThreshold: 0.3, matchIou: 0.5 }

  it('matches the overlapping person detection', () => {
    const result = matchTarget([detection(102, 52, 78, 196, 0.91)], target, options)
    expect(result.matched?.score).toBeCloseTo(0.91)
  })

  it('does not credit another person in the frame to the target', () => {
    const other = detection(400, 50, 80, 200, 0.99)
    const result = matchTarget([other], target, options)
    expect(result.matched).toBeNull()
    // The detection is still reported as a candidate for auditing.
    expect(result.candidates).toHaveLength(1)
  })

  it('picks the highest-IoU detection when several people overlap the target', () => {
    const near = detection(101, 51, 79, 198, 0.55)
    const loose = detection(80, 40, 130, 240, 0.99)
    const result = matchTarget([loose, near], target, options)
    expect(result.matched?.score).toBeCloseTo(0.55)
  })

  it('ignores detections of other classes', () => {
    const result = matchTarget([detection(100, 50, 80, 200, 0.95, 'backpack')], target, options)
    expect(result.matched).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })

  it('ignores detections below the reporting threshold', () => {
    const result = matchTarget([detection(100, 50, 80, 200, 0.2)], target, options)
    expect(result.matched).toBeNull()
    expect(result.bestIou).toBe(0)
  })

  it('reports the best IoU even when nothing clears the match threshold', () => {
    const result = matchTarget([detection(150, 50, 80, 200, 0.9)], target, options)
    expect(result.matched).toBeNull()
    expect(result.bestIou).toBeGreaterThan(0)
    expect(result.bestIou).toBeLessThan(0.5)
  })
})
