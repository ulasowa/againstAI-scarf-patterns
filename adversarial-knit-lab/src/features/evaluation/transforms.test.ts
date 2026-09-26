import { describe, expect, it } from 'vitest'
import { DEFAULT_TRANSFORMS, applyPlacement, boxToQuad, sampleTransform } from './transforms'
import type { Quad } from './overlay'

const enabled = { ...DEFAULT_TRANSFORMS, enabled: true, samplesPerImage: 3 }

describe('transformation sampling', () => {
  it('is identity while transformations are off', () => {
    const sample = sampleTransform(DEFAULT_TRANSFORMS, 'img1', 0)
    expect(sample.scale).toBe(1)
    expect(sample.rotationDegrees).toBe(0)
    expect(sample.blurPx).toBe(0)
    expect(sample.jpegQuality).toBeNull()
  })

  it('gives the same parameters for the same image and index', () => {
    // This is what makes the baseline and patterned conditions a paired
    // comparison: both call sampleTransform with the same (image, index).
    const a = sampleTransform(enabled, 'img1', 1)
    const b = sampleTransform(enabled, 'img1', 1)
    expect(b).toEqual(a)
  })

  it('varies across samples and across images', () => {
    const s0 = sampleTransform(enabled, 'img1', 0)
    const s1 = sampleTransform(enabled, 'img1', 1)
    const other = sampleTransform(enabled, 'img2', 0)
    expect(s1.seed).not.toBe(s0.seed)
    expect(other.seed).not.toBe(s0.seed)
  })

  it('reproduces the whole sequence from the stored seed', () => {
    const first = [0, 1, 2].map((i) => sampleTransform(enabled, 'img1', i))
    const again = [0, 1, 2].map((i) => sampleTransform({ ...enabled }, 'img1', i))
    expect(again).toEqual(first)
    const different = sampleTransform({ ...enabled, seed: 99 }, 'img1', 0)
    expect(different.seed).not.toBe(first[0]!.seed)
  })

  it('stays inside the configured ranges', () => {
    for (let i = 0; i < 40; i++) {
      const sample = sampleTransform(enabled, `img${i}`, i)
      expect(sample.scale).toBeGreaterThanOrEqual(enabled.placement.scale[0])
      expect(sample.scale).toBeLessThanOrEqual(enabled.placement.scale[1])
      expect(sample.rotationDegrees).toBeGreaterThanOrEqual(enabled.placement.rotationDegrees[0])
      expect(sample.rotationDegrees).toBeLessThanOrEqual(enabled.placement.rotationDegrees[1])
      expect(sample.blurPx).toBeGreaterThanOrEqual(0)
      expect(sample.jpegQuality!).toBeGreaterThanOrEqual(enabled.camera.jpegQuality[0])
      expect(sample.jpegQuality!).toBeLessThanOrEqual(enabled.camera.jpegQuality[1])
    }
  })
})

describe('placement transformation', () => {
  const quad: Quad = boxToQuad({ x: 100, y: 100, width: 100, height: 100 })

  it('leaves the quad alone for the identity sample', () => {
    const moved = applyPlacement(quad, sampleTransform(DEFAULT_TRANSFORMS, 'img', 0))
    for (let i = 0; i < 4; i++) {
      expect(moved[i]![0]).toBeCloseTo(quad[i]![0], 6)
      expect(moved[i]![1]).toBeCloseTo(quad[i]![1], 6)
    }
  })

  it('keeps the centre in place while scaling and rotating', () => {
    const sample = { ...sampleTransform(enabled, 'img', 0), perspective: [0, 0, 0, 0] as [number, number, number, number] }
    const moved = applyPlacement(quad, sample)
    const cx = moved.reduce((sum, p) => sum + p[0]!, 0) / 4
    const cy = moved.reduce((sum, p) => sum + p[1]!, 0) / 4
    expect(cx).toBeCloseTo(150, 6)
    expect(cy).toBeCloseTo(150, 6)
  })
})
