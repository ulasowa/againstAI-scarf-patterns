/**
 * Aggregate metrics.
 *
 * Every definition here is deliberately narrow, and each one is displayed next
 * to its denominator in the interface.
 *
 *   Detection retention — matched detections divided by eligible examples, for
 *     one condition. "Eligible" means inference succeeded in every condition of
 *     that example.
 *
 *   Conditional miss rate — of the target instances the BASELINE detected, the
 *     share that this condition does not detect. Denominator zero yields null,
 *     which the interface shows as "N/A" and never as 0% or 100%.
 *
 *   Mean matched score — averaged only over examples where this condition
 *     produced a matched detection. A censored detection contributes nothing;
 *     it is not treated as zero confidence, because the model did not report
 *     zero, it reported nothing above threshold.
 *
 *   Mean score delta — averaged only over examples where BOTH the baseline and
 *     this condition produced a matched detection, so the difference is
 *     actually observable. The count of such examples is reported alongside.
 *
 * Scores from different model families are never pooled.
 */
import type {
  AggregateMetrics,
  ConditionKind,
  ConditionMeasurement,
  PerExampleResult,
} from '../../types/project'

export const BASELINE_CONDITION: ConditionKind = 'original'

export interface AggregateOptions {
  baseline?: ConditionKind
  /** Restrict to one data split. */
  split?: 'optimization' | 'holdout'
}

export function aggregate(
  results: readonly PerExampleResult[],
  conditions: readonly ConditionKind[],
  options: AggregateOptions = {},
): AggregateMetrics {
  const baselineCondition = options.baseline ?? BASELINE_CONDITION
  const scoped = options.split ? results.filter((r) => r.split === options.split) : results

  const eligible = scoped.filter((example) =>
    example.conditions.every((measurement) => measurement.inferenceOk),
  )
  const excluded = scoped.length - eligible.length

  const byCondition: AggregateMetrics['byCondition'] = {}

  for (const condition of conditions) {
    let detectedCount = 0
    let baselineDetectedCount = 0
    let baselineDetectedAndMissed = 0
    let scoreSum = 0
    let scoreCount = 0
    let deltaSum = 0
    let deltaCount = 0

    for (const example of eligible) {
      const measurement = find(example.conditions, condition)
      const baseline = find(example.conditions, baselineCondition)
      if (!measurement) continue

      const matched = measurement.matched
      if (matched) {
        detectedCount++
        scoreSum += matched.score
        scoreCount++
      }

      const baselineMatched = baseline?.matched ?? null
      if (baselineMatched) {
        baselineDetectedCount++
        if (!matched) baselineDetectedAndMissed++
        else {
          deltaSum += matched.score - baselineMatched.score
          deltaCount++
        }
      }
    }

    byCondition[condition] = {
      detectionRetention: eligible.length > 0 ? detectedCount / eligible.length : null,
      conditionalMissRate:
        baselineDetectedCount > 0 ? baselineDetectedAndMissed / baselineDetectedCount : null,
      baselineDetectedCount,
      detectedCount,
      meanMatchedScore: scoreCount > 0 ? scoreSum / scoreCount : null,
      meanScoreDelta: deltaCount > 0 ? deltaSum / deltaCount : null,
      observableDeltaCount: deltaCount,
    }
  }

  return { eligibleExamples: eligible.length, excludedExamples: excluded, byCondition }
}

function find(
  measurements: readonly ConditionMeasurement[],
  condition: ConditionKind,
): ConditionMeasurement | undefined {
  return measurements.find((m) => m.condition === condition)
}

/** Aggregate separately per transformation index, for per-transform reporting. */
export function aggregateByTransform(
  results: readonly PerExampleResult[],
  conditions: readonly ConditionKind[],
  options: AggregateOptions = {},
): Map<number, AggregateMetrics> {
  const groups = new Map<number, PerExampleResult[]>()
  for (const result of results) {
    const list = groups.get(result.transformIndex)
    if (list) list.push(result)
    else groups.set(result.transformIndex, [result])
  }
  const out = new Map<number, AggregateMetrics>()
  for (const [index, group] of groups) out.set(index, aggregate(group, conditions, options))
  return out
}

/** "N/A" rather than a number when the denominator is empty. */
export function formatRate(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`
}

export function formatScore(value: number | null): string {
  return value === null ? 'not observed' : value.toFixed(3)
}

export function formatDelta(value: number | null): string {
  if (value === null) return 'not observable'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(3)}`
}

export const CONDITION_LABELS: Record<ConditionKind, string> = {
  original: 'Original photograph',
  solid: 'Solid-colour garment overlay',
  'control-pattern': 'Random control pattern',
  'chart-pattern': 'Chart-derived pattern',
}

export const CONDITION_HINTS: Record<ConditionKind, string> = {
  original: 'Nothing composited. This is the baseline every other condition is compared against.',
  solid:
    'The garment region filled with one palette colour. Separates "the garment was covered" from "this pattern did something".',
  'control-pattern':
    'A random pattern with comparable coverage and palette. Separates a pattern-specific effect from any busy texture.',
  'chart-pattern': 'The actual chart-derived knitted motif, rendered without chart decorations.',
}
