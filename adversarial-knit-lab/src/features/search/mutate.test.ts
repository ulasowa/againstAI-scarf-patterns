import { describe, expect, it } from 'vitest'
import { mutateSettings, searchBudget } from './search'
import { makeSettings } from '../generator/generate'
import { paramsForFamily } from '../generator/families'
import { createProject } from '../chart/project'
import { DEFAULT_TRANSFORMS } from '../evaluation/transforms'
import type { ConditionKind } from '../../types/project'

const base = makeSettings('contour-network', 99, paramsForFamily('contour-network'))

describe('mutateSettings', () => {
  it('is reproducible for the same seed', () => {
    expect(mutateSettings(base, 5, 1)).toEqual(mutateSettings(base, 5, 1))
  })

  it('keeps every parameter inside its valid range', () => {
    for (let seed = 0; seed < 200; seed++) {
      const mutated = mutateSettings(base, seed, 1)
      const p = mutated.params
      expect(p.featureSize).toBeGreaterThanOrEqual(2)
      expect(p.featureSize).toBeLessThanOrEqual(24)
      for (const value of [p.detailBalance, p.contrast, p.warp, p.symmetry]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
      expect(p.density).toBeGreaterThanOrEqual(0.1)
      expect(p.density).toBeLessThanOrEqual(0.9)
    }
  })

  it('stays closer to its parent as the step shrinks', () => {
    const distance = (strength: number) => {
      let total = 0
      for (let seed = 0; seed < 120; seed++) {
        const m = mutateSettings(base, seed, strength).params
        total +=
          Math.abs(m.density - base.params.density) +
          Math.abs(m.contrast - base.params.contrast) +
          Math.abs(m.warp - base.params.warp)
      }
      return total / 120
    }
    expect(distance(0.2)).toBeLessThan(distance(1))
  })

  it('usually keeps the parent variant', () => {
    let kept = 0
    for (let seed = 0; seed < 200; seed++) {
      if (mutateSettings(base, seed, 1).params.variant === base.params.variant) kept++
    }
    // Refinement that changed the variant every time would just be exploration.
    expect(kept / 200).toBeGreaterThan(0.7)
  })

  it('never keeps the parent seed, so the same parameters still give a new chart', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(mutateSettings(base, seed, 0).seed).not.toBe(base.seed)
    }
  })
})

describe('searchBudget', () => {
  const conditions: ConditionKind[] = ['original', 'solid', 'control-pattern', 'chart-pattern']

  function request(overrides: Record<string, unknown> = {}) {
    return {
      project: createProject(),
      exploreCount: 10,
      refineCount: 6,
      seed: 1,
      constraints: { maxFloat: 7, enforceColorsPerRow: true, maxIsolatedRegions: 40 },
      baseConfig: { conditions, transforms: DEFAULT_TRANSFORMS } as never,
      optimizationImages: [{}, {}] as never,
      ...overrides,
    } as Parameters<typeof searchBudget>[0]
  }

  it('counts the baseline once per example, not once per candidate', () => {
    // 2 images x 1 sample = 2 examples. 1 baseline + 3 pattern conditions x
    // (1 starting chart + 10 explore + 6 refine) = 1 + 51 per example.
    expect(searchBudget(request())).toBe(2 * (1 + 3 * 17))
  })

  it('grows with the transformation samples', () => {
    const withTransforms = request({
      baseConfig: {
        conditions,
        transforms: { ...DEFAULT_TRANSFORMS, enabled: true, samplesPerImage: 3 },
      } as never,
    })
    expect(searchBudget(withTransforms)).toBe(searchBudget(request()) * 3)
  })

  it('shrinks when fewer conditions are measured', () => {
    const lean = request({
      baseConfig: {
        conditions: ['original', 'chart-pattern'] as ConditionKind[],
        transforms: DEFAULT_TRANSFORMS,
      } as never,
    })
    expect(searchBudget(lean)).toBe(2 * (1 + 1 * 17))
    expect(searchBudget(lean)).toBeLessThan(searchBudget(request()))
  })
})
