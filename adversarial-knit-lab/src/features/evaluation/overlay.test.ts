import { describe, expect, it } from 'vitest'
import {
  invertHomography,
  pointInQuad,
  quadArea,
  quadBounds,
  unitSquareToQuad,
  validateGarmentQuad,
  type Quad,
} from './overlay'

const square: Quad = [
  [10, 10],
  [110, 10],
  [110, 110],
  [10, 110],
]

describe('homography', () => {
  it('maps the unit square corners onto the quad corners', () => {
    const trapezoid: Quad = [
      [20, 10],
      [120, 30],
      [110, 130],
      [10, 100],
    ]
    const m = unitSquareToQuad(trapezoid)!
    expect(m).not.toBeNull()
    const project = (u: number, v: number) => {
      const w = m[6]! * u + m[7]! * v + 1
      return [
        (m[0]! * u + m[1]! * v + m[2]!) / w,
        (m[3]! * u + m[4]! * v + m[5]!) / w,
      ]
    }
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    corners.forEach(([u, v], index) => {
      const [x, y] = project(u!, v!)
      expect(x).toBeCloseTo(trapezoid[index]![0], 6)
      expect(y).toBeCloseTo(trapezoid[index]![1], 6)
    })
  })

  it('inverts back to the unit square', () => {
    const m = unitSquareToQuad(square)!
    const inv = invertHomography(m)!
    const w = inv[6]! * 60 + inv[7]! * 60 + inv[8]!
    const u = (inv[0]! * 60 + inv[1]! * 60 + inv[2]!) / w
    const v = (inv[3]! * 60 + inv[4]! * 60 + inv[5]!) / w
    expect(u).toBeCloseTo(0.5, 6)
    expect(v).toBeCloseTo(0.5, 6)
  })

  it('refuses a degenerate quad', () => {
    const collapsed: Quad = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]
    expect(invertHomography(unitSquareToQuad(collapsed)!)).toBeNull()
  })
})

describe('quad geometry', () => {
  it('measures area and bounds', () => {
    expect(quadArea(square)).toBeCloseTo(10_000, 6)
    expect(quadBounds(square)).toEqual({ x: 10, y: 10, width: 100, height: 100 })
  })

  it('tests containment', () => {
    expect(pointInQuad(square, 60, 60)).toBe(true)
    expect(pointInQuad(square, 5, 60)).toBe(false)
  })
})

describe('garment region validation', () => {
  const image = { width: 400, height: 600 }
  const target = { x: 100, y: 50, width: 200, height: 500 }

  it('accepts a torso region inside the target', () => {
    const torso: Quad = [
      [130, 200],
      [270, 200],
      [270, 380],
      [130, 380],
    ]
    const result = validateGarmentQuad(torso, image, target)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('refuses a region reaching into the head band', () => {
    const overHead: Quad = [
      [130, 80],
      [270, 80],
      [270, 380],
      [130, 380],
    ]
    const result = validateGarmentQuad(overHead, image, target)
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/head/)
  })

  it('warns when the region leaves the annotated person', () => {
    const wide: Quad = [
      [20, 200],
      [380, 200],
      [380, 380],
      [20, 380],
    ]
    const result = validateGarmentQuad(wide, image, target)
    expect(result.warnings.join(' ')).toMatch(/past the annotated person/)
  })

  it('warns when the region swallows most of the target', () => {
    const huge: Quad = [
      [101, 160],
      [299, 160],
      [299, 545],
      [101, 545],
    ]
    const result = validateGarmentQuad(huge, image, target)
    expect(result.warnings.join(' ')).toMatch(/of the target box/)
  })

  it('refuses a region that is too small or off the photograph', () => {
    expect(validateGarmentQuad([[0, 0], [2, 0], [2, 2], [0, 2]], image, target).ok).toBe(false)
    expect(
      validateGarmentQuad(
        [
          [-50, 200],
          [270, 200],
          [270, 380],
          [-50, 380],
        ],
        image,
        target,
      ).ok,
    ).toBe(false)
  })
})
