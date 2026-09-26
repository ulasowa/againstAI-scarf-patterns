import { describe, expect, it } from 'vitest'
import { lowerFrameQuad, pickTarget, torsoQuad, TORSO_FRACTIONS } from './autoAnnotate'
import { validateGarmentQuad, quadBounds } from './overlay'
import type { Detection } from '../../types/project'

function person(x: number, y: number, w: number, h: number, score: number): Detection {
  return { label: 'person', score, box: { x, y, width: w, height: h } }
}

describe('pickTarget', () => {
  it('returns null when nobody was detected', () => {
    expect(pickTarget([])).toBeNull()
  })

  it('prefers the largest person, not the most confident one', () => {
    const distant = person(10, 10, 20, 50, 0.98)
    const subject = person(100, 40, 160, 400, 0.71)
    expect(pickTarget([distant, subject])?.score).toBeCloseTo(0.71)
  })

  it('breaks a tie on area with the higher confidence', () => {
    const a = person(0, 0, 100, 100, 0.6)
    const b = person(200, 0, 100, 100, 0.9)
    expect(pickTarget([a, b])?.score).toBeCloseTo(0.9)
  })
})

describe('torsoQuad', () => {
  const box = { x: 100, y: 50, width: 200, height: 500 }

  it('sits inside the person box', () => {
    const bounds = quadBounds(torsoQuad(box))
    expect(bounds.x).toBeGreaterThanOrEqual(box.x)
    expect(bounds.y).toBeGreaterThanOrEqual(box.y)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(box.y + box.height)
  })

  it('clears the head band that validation refuses', () => {
    expect(TORSO_FRACTIONS.top).toBeGreaterThan(0.2)
    const result = validateGarmentQuad(torsoQuad(box), { width: 800, height: 800 }, box)
    expect(result.ok, result.errors.join(' ')).toBe(true)
  })

  it('produces a usable region for small and large people alike', () => {
    for (const candidate of [
      { x: 0, y: 0, width: 60, height: 160 },
      { x: 300, y: 20, width: 400, height: 900 },
    ]) {
      const result = validateGarmentQuad(
        torsoQuad(candidate),
        { width: 1000, height: 1000 },
        candidate,
      )
      expect(result.ok, JSON.stringify(candidate)).toBe(true)
    }
  })

  it('scales with the box rather than using fixed pixels', () => {
    const small = quadBounds(torsoQuad({ x: 0, y: 0, width: 100, height: 200 }))
    const large = quadBounds(torsoQuad({ x: 0, y: 0, width: 200, height: 400 }))
    expect(large.width / small.width).toBeCloseTo(2, 6)
    expect(large.height / small.height).toBeCloseTo(2, 6)
  })
})

describe('lowerFrameQuad', () => {
  const frame = { width: 1280, height: 720 }

  it('covers the lower band of the picture, where a garment is at a laptop', () => {
    const bounds = quadBounds(lowerFrameQuad(frame))
    expect(bounds.y).toBeGreaterThan(frame.height * 0.5)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(frame.height)
  })

  it('leaves the upper half, where a head would be, untouched', () => {
    const bounds = quadBounds(lowerFrameQuad(frame))
    expect(bounds.y).toBeGreaterThanOrEqual(frame.height * 0.5)
  })

  it('stays inside the frame', () => {
    const bounds = quadBounds(lowerFrameQuad(frame))
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(frame.width)
  })

  it('scales with the frame rather than using fixed pixels', () => {
    const small = quadBounds(lowerFrameQuad({ width: 640, height: 360 }))
    const large = quadBounds(lowerFrameQuad({ width: 1280, height: 720 }))
    expect(large.width / small.width).toBeCloseTo(2, 6)
    expect(large.height / small.height).toBeCloseTo(2, 6)
  })
})
