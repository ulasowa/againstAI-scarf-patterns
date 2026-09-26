import { describe, expect, it } from 'vitest'
import { aggregate, formatDelta, formatRate, formatScore } from './metrics'
import type { ConditionKind, Detection, PerExampleResult } from '../../types/project'

const conditions: ConditionKind[] = ['original', 'chart-pattern']

function det(score: number): Detection {
  return { label: 'person', score, box: { x: 0, y: 0, width: 10, height: 10 } }
}

function example(
  id: string,
  baseline: Detection | null,
  patched: Detection | null,
  overrides: Partial<PerExampleResult> = {},
): PerExampleResult {
  return {
    imageId: id,
    split: 'optimization',
    transformIndex: 0,
    transformSeed: 1,
    conditions: [
      { condition: 'original', matched: baseline, inferenceOk: true, candidates: [] },
      { condition: 'chart-pattern', matched: patched, inferenceOk: true, candidates: [] },
    ],
    ...overrides,
  }
}

describe('aggregate', () => {
  it('computes conditional miss rate over baseline-detected instances only', () => {
    const results = [
      example('a', det(0.9), null), // baseline detected, now missed
      example('b', det(0.8), det(0.4)), // baseline detected, still detected
      example('c', null, null), // baseline never detected: not in the denominator
    ]
    const metrics = aggregate(results, conditions)
    const chart = metrics.byCondition['chart-pattern']!
    expect(chart.baselineDetectedCount).toBe(2)
    expect(chart.conditionalMissRate).toBeCloseTo(0.5, 10)
    expect(chart.detectionRetention).toBeCloseTo(1 / 3, 10)
  })

  it('returns null, not 0 or 1, when no baseline detection exists', () => {
    const metrics = aggregate([example('a', null, null)], conditions)
    const chart = metrics.byCondition['chart-pattern']!
    expect(chart.conditionalMissRate).toBeNull()
    expect(formatRate(chart.conditionalMissRate)).toBe('N/A')
  })

  it('averages score deltas only where both conditions produced a detection', () => {
    const results = [
      example('a', det(0.9), det(0.6)), // delta -0.3, observable
      example('b', det(0.8), null), // censored: contributes no delta and no zero
    ]
    const chart = aggregate(results, conditions).byCondition['chart-pattern']!
    expect(chart.observableDeltaCount).toBe(1)
    expect(chart.meanScoreDelta).toBeCloseTo(-0.3, 10)
    // The mean matched score ignores the censored example entirely.
    expect(chart.meanMatchedScore).toBeCloseTo(0.6, 10)
  })

  it('excludes examples where any condition failed to run', () => {
    const failed = example('a', det(0.9), null)
    failed.conditions[1] = {
      condition: 'chart-pattern',
      matched: null,
      inferenceOk: false,
      failureReason: 'WebGL context lost',
      candidates: [],
    }
    const metrics = aggregate([failed, example('b', det(0.7), det(0.5))], conditions)
    expect(metrics.eligibleExamples).toBe(1)
    expect(metrics.excludedExamples).toBe(1)
    // A failed run must never be counted as a successful evasion.
    expect(metrics.byCondition['chart-pattern']!.conditionalMissRate).toBe(0)
  })

  it('can aggregate a single split', () => {
    const results = [
      example('a', det(0.9), null),
      example('b', det(0.9), det(0.9), { split: 'holdout' }),
    ]
    const opt = aggregate(results, conditions, { split: 'optimization' })
    const hold = aggregate(results, conditions, { split: 'holdout' })
    expect(opt.byCondition['chart-pattern']!.conditionalMissRate).toBe(1)
    expect(hold.byCondition['chart-pattern']!.conditionalMissRate).toBe(0)
  })
})

describe('formatters', () => {
  it('never renders a missing value as a number', () => {
    expect(formatRate(null)).toBe('N/A')
    expect(formatScore(null)).toBe('not observed')
    expect(formatDelta(null)).toBe('not observable')
    expect(formatDelta(0.25)).toBe('+0.250')
    expect(formatRate(0.5)).toBe('50.0%')
  })
})
