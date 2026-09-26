/**
 * Browser-side candidate search.
 *
 * This is seeded random search over the generator's parameter space, scored by
 * real inference on real images. It is a heuristic. It is NOT a reproduction of
 * a gradient-based attack from the literature, and neither the TensorFlow.js
 * inference wrapper nor an ONNX inference session exposes a differentiable
 * detector training pipeline — inference and optimisation are different things.
 *
 * Every candidate is converted to the actual knitting representation and
 * rendered without chart decorations before it is measured, so the search
 * scores what a knitter could make, not an idealised texture.
 *
 * Objective, in order:
 *   1. Hard knitting constraints must hold. A candidate that violates them is
 *      never selected, whatever it scores.
 *   2. Lower detection retention for the chart condition on the optimisation
 *      split.
 *   3. Lower mean matched confidence, as a tie-break only.
 *
 * Censored detections: a target that falls below the reporting threshold counts
 * as not detected for (2) and contributes nothing to (3). It is not recorded as
 * zero confidence, because the model did not report zero.
 */
import type {
  EvaluationRecord,
  GeneratorSettings,
  KnittingProject,
  PatternFamily,
  StitchGrid,
} from '../../types/project'
import type { ModelAdapter } from '../evaluation/adapter'
import {
  runEvaluation,
  type BaselineCache,
  type EvaluationConfig,
  type LoadedImage,
} from '../evaluation/runEvaluation'
import { analyzeChart } from '../knitting/analysis'
import { chartContentHash } from '../chart/grid'
import { generatePattern } from '../generator/generate'
import { getFamily, paramsForFamily, GENERATIVE_FAMILIES } from '../generator/families'
import { createRng, deriveSeed } from '../../lib/rng'
import { cellAspect } from '../knitting/gauge'
import { newId } from '../../lib/id'

export const OBJECTIVE_ID = 'min-retention-then-min-confidence/v1'

export const OBJECTIVE_DESCRIPTION =
  'Candidates that violate the hard knitting constraints are rejected before any inference runs. The rest are ranked by detection retention for the chart condition on the optimisation split (lower first), then by mean matched confidence (lower first). Detections censored by the reporting threshold count as not detected and contribute no confidence value. The search explores the parameter space at random, then refines around the best result with shrinking mutation steps.'

export interface SearchConstraints {
  /** Reject candidates whose longest float exceeds this. */
  maxFloat: number
  /** Reject candidates with rows above the stranded colour limit. */
  enforceColorsPerRow: boolean
  /** Reject candidates with more isolated regions than this. */
  maxIsolatedRegions: number
}

export interface SearchRequest {
  project: KnittingProject
  /** Random candidates drawn across the whole parameter space. */
  exploreCount: number
  /** Candidates mutated from the best found so far. 0 disables refinement. */
  refineCount: number
  seed: number
  constraints: SearchConstraints
  /** Evaluation configuration, minus the grid and hash which vary per candidate. */
  baseConfig: Omit<EvaluationConfig, 'grid' | 'patternHash'>
  /** Optimisation split only. The holdout is evaluated afterwards, once. */
  optimizationImages: LoadedImage[]
}

export interface Candidate {
  index: number
  phase: 'baseline' | 'explore' | 'refine'
  settings: GeneratorSettings
  grid: StitchGrid
  patternHash: string
  constraintViolations: string[]
  record: EvaluationRecord | null
  retention: number | null
  meanScore: number | null
}

export interface SearchProgress {
  completed: number
  total: number
  candidateIndex: number
  phase: Candidate['phase']
  message: string
  best: Candidate | null
}

export interface SearchResult {
  searchId: string
  seed: number
  exploreCount: number
  refineCount: number
  candidates: Candidate[]
  best: Candidate | null
  /** The chart the search started from, measured under the same settings. */
  baseline: Candidate | null
  /** False when nothing beat the starting chart. Reported honestly. */
  improved: boolean
  objective: string
  evaluated: number
  rejected: number
}

export interface SearchOptions {
  onProgress?: (progress: SearchProgress) => void
  signal?: AbortSignal
}

/**
 * Inference calls the search will make, before it starts.
 *
 * The baseline condition is measured once per (image, transformation) and then
 * reused, because compositing nothing does not depend on the pattern. Only the
 * pattern conditions are repeated per candidate.
 */
export function searchBudget(request: SearchRequest): number {
  const samples = request.baseConfig.transforms.enabled
    ? Math.max(1, request.baseConfig.transforms.samplesPerImage)
    : 1
  const examples = request.optimizationImages.length * samples
  const patternConditions = request.baseConfig.conditions.filter((c) => c !== 'original').length
  const charts = 1 + request.exploreCount + request.refineCount
  return examples * (1 + patternConditions * charts)
}

/** Reproducible candidate pool. Same seed and count gives the same candidates. */
export function buildCandidatePool(
  project: KnittingProject,
  seed: number,
  count: number,
): GeneratorSettings[] {
  const rng = createRng(deriveSeed(seed, 'candidate-pool'))
  const base = project.generator
  const families = GENERATIVE_FAMILIES.map((descriptor) => descriptor.id)
  const pool: GeneratorSettings[] = []

  for (let i = 0; i < count; i++) {
    const family = base && rng.next() < 0.6 ? base.family : rng.pick(families)
    const effectiveFamily = family === 'imported-image' ? 'multiscale-interference' : family
    const defaults = paramsForFamily(effectiveFamily)
    const source = base && base.family === effectiveFamily ? base.params : defaults
    const variants = variantsFor(effectiveFamily)

    pool.push({
      family: effectiveFamily,
      version: base?.version ?? '1.0.0',
      seed: deriveSeed(seed, `candidate${i}`),
      params: {
        ...source,
        variant: rng.pick(variants),
        featureSize: clampRange(source.featureSize * rng.range(0.6, 1.6), 2, 24),
        detailBalance: clampRange(source.detailBalance + rng.range(-0.3, 0.3), 0, 1),
        contrast: clampRange(source.contrast + rng.range(-0.3, 0.3), 0, 1),
        density: clampRange(source.density + rng.range(-0.25, 0.25), 0.1, 0.9),
        warp: clampRange(source.warp + rng.range(-0.3, 0.3), 0, 1),
        symmetry: clampRange(source.symmetry + rng.range(-0.2, 0.2), 0, 1),
      },
    })
  }
  return pool
}

/** The variants a family actually offers, read from the family descriptors. */
function variantsFor(family: PatternFamily): string[] {
  if (family === 'imported-image') return ['imported']
  return getFamily(family).variants.map((variant) => variant.id)
}

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Perturb a candidate's parameters around a known-good one.
 *
 * `strength` scales every step, so the refinement phase can start wide and
 * narrow down. The variant changes only occasionally: it is the parameter that
 * changes the pattern most, so mutating it every time would be exploration
 * wearing a refinement's clothes.
 */
export function mutateSettings(
  base: GeneratorSettings,
  seed: number,
  strength: number,
): GeneratorSettings {
  const rng = createRng(seed)
  const family =
    base.family === 'imported-image' ? 'multiscale-interference' : base.family
  const variants = variantsFor(family)
  const step = (scale: number) => rng.normal() * strength * scale

  return {
    family,
    version: base.version,
    // A fresh seed: the same parameters with a different seed is still a
    // different pattern, and that is a cheap axis to explore.
    seed: deriveSeed(seed, 'mutated-seed'),
    params: {
      ...base.params,
      variant: rng.next() < 0.2 * strength ? rng.pick(variants) : base.params.variant,
      featureSize: clampRange(base.params.featureSize * (1 + step(0.35)), 2, 24),
      detailBalance: clampRange(base.params.detailBalance + step(0.25), 0, 1),
      contrast: clampRange(base.params.contrast + step(0.25), 0, 1),
      density: clampRange(base.params.density + step(0.2), 0.1, 0.9),
      warp: clampRange(base.params.warp + step(0.25), 0, 1),
      symmetry: clampRange(base.params.symmetry + step(0.2), 0, 1),
    },
  }
}

export function checkConstraints(
  project: KnittingProject,
  grid: StitchGrid,
  constraints: SearchConstraints,
  contentHash: string,
): string[] {
  const analysis = analyzeChart({
    grid,
    workingMethod: project.workingMethod,
    repeat: project.repeat,
    options: project.analysisOptions,
    contentHash,
  })
  const violations: string[] = []
  if (analysis.longestFloat > constraints.maxFloat) {
    violations.push(
      `Longest float is ${analysis.longestFloat} stitches, above the limit of ${constraints.maxFloat}.`,
    )
  }
  if (constraints.enforceColorsPerRow && analysis.rowsExceedingColorLimit.length > 0) {
    violations.push(
      `${analysis.rowsExceedingColorLimit.length} row(s) use more than ${project.analysisOptions.maxColorsPerRow} colours.`,
    )
  }
  if (analysis.isolatedRegions.length > constraints.maxIsolatedRegions) {
    violations.push(
      `${analysis.isolatedRegions.length} isolated region(s), above the limit of ${constraints.maxIsolatedRegions}.`,
    )
  }
  return violations
}

export async function runSearch(
  adapter: ModelAdapter,
  request: SearchRequest,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const searchId = newId('search')
  const rowAspect = cellAspect(request.project.gauge)
  const total = searchBudget(request)

  // The baseline composites nothing, so it is the same for every candidate.
  // Measuring it once turns the per-candidate cost from four conditions into
  // one, which is what makes the loop quick enough to sit and watch.
  const baselineCache: BaselineCache = new Map()

  const candidates: Candidate[] = []
  let completed = 0
  let best: Candidate | null = null
  let rejected = 0
  let evaluated = 0

  const measure = async (
    index: number,
    phase: Candidate['phase'],
    settings: GeneratorSettings,
    grid: StitchGrid,
    label: string,
  ): Promise<Candidate> => {
    const patternHash = chartContentHash({
      grid,
      palette: request.project.palette,
      gauge: request.project.gauge,
      workingMethod: request.project.workingMethod,
      repeat: request.project.repeat,
    })
    const violations = checkConstraints(request.project, grid, request.constraints, patternHash)
    const candidate: Candidate = {
      index,
      phase,
      settings,
      grid,
      patternHash,
      constraintViolations: violations,
      record: null,
      retention: null,
      meanScore: null,
    }

    if (violations.length > 0) {
      // Rejected before any inference: a candidate that cannot be knitted is
      // not worth a forward pass.
      rejected++
      options.onProgress?.({
        completed,
        total,
        candidateIndex: index,
        phase,
        message: `${label}: rejected, ${violations[0]}`,
        best,
      })
      return candidate
    }

    const record = await runEvaluation(
      adapter,
      request.optimizationImages,
      { ...request.baseConfig, grid, patternHash },
      {
        signal: options.signal,
        baselineCache,
        search: {
          searchId,
          candidateCount: request.exploreCount + request.refineCount,
          seed: request.seed,
          objective: OBJECTIVE_ID,
        },
        onProgress: (p) => {
          options.onProgress?.({
            completed: completed + p.completed,
            total,
            candidateIndex: index,
            phase,
            message: `${label}: ${p.message}`,
            best,
          })
        },
      },
    )

    // Cached baselines cost no inference, so count what was actually run.
    completed += record.perExample.reduce(
      (sum, example) => sum + example.conditions.filter((c) => c.inferenceOk || c.failureReason).length,
      0,
    )
    evaluated++

    const chart = record.aggregate.byCondition['chart-pattern']
    candidate.record = record
    candidate.retention = chart?.detectionRetention ?? null
    candidate.meanScore = chart?.meanMatchedScore ?? null
    return candidate
  }

  const buildGrid = (settings: GeneratorSettings): StitchGrid =>
    generatePattern({
      settings,
      stitches: request.project.grid.stitches,
      rows: request.project.grid.rows,
      colorCount: request.project.palette.length,
      repeat: request.project.repeat,
      rowAspect,
    })

  // Measure the starting chart first, under identical settings, so "improved"
  // is a comparison and not an assertion.
  const baselineSettings: GeneratorSettings = request.project.generator ?? {
    family: 'multiscale-interference',
    version: '1.0.0',
    seed: 0,
    params: paramsForFamily('multiscale-interference'),
  }
  const baseline = await measure(
    -1,
    'baseline',
    baselineSettings,
    request.project.grid,
    'Starting chart',
  )

  // Phase 1: explore the parameter space.
  const pool = buildCandidatePool(request.project, request.seed, request.exploreCount)
  for (let i = 0; i < pool.length; i++) {
    if (options.signal?.aborted) break
    const settings = pool[i] as GeneratorSettings
    const candidate = await measure(
      i,
      'explore',
      settings,
      buildGrid(settings),
      `Explore ${i + 1}/${pool.length}`,
    )
    candidates.push(candidate)
    if (isBetter(candidate, best)) best = candidate
  }

  // Phase 2: refine around the best thing found, narrowing the step as it goes.
  // Reproducibility note: the pool in phase 1 is fully determined by the seed,
  // but the refinement path follows measured results, so repeating it needs the
  // same model, images and settings as well as the same seed.
  for (let i = 0; i < request.refineCount; i++) {
    if (options.signal?.aborted) break
    const parent = best ?? baseline
    if (parent.retention === null && parent.constraintViolations.length > 0) break
    const strength = 1 - (i / Math.max(1, request.refineCount)) * 0.7
    const settings = mutateSettings(
      parent.settings,
      deriveSeed(request.seed, `refine${i}`),
      strength,
    )
    const candidate = await measure(
      i,
      'refine',
      settings,
      buildGrid(settings),
      `Refine ${i + 1}/${request.refineCount}`,
    )
    candidates.push(candidate)
    if (isBetter(candidate, best)) best = candidate
  }

  const improved = best !== null && isBetter(best, baseline)

  return {
    searchId,
    seed: request.seed,
    exploreCount: request.exploreCount,
    refineCount: request.refineCount,
    candidates,
    best,
    baseline,
    improved,
    objective: OBJECTIVE_ID,
    evaluated,
    rejected,
  }
}

/** Strict ordering on the documented objective. Violating candidates never win. */
export function isBetter(candidate: Candidate, incumbent: Candidate | null): boolean {
  if (candidate.constraintViolations.length > 0) return false
  if (candidate.retention === null) return false
  if (incumbent === null) return true
  if (incumbent.retention === null) return true
  if (candidate.retention !== incumbent.retention) return candidate.retention < incumbent.retention
  if (candidate.meanScore === null) return incumbent.meanScore !== null
  if (incumbent.meanScore === null) return false
  return candidate.meanScore < incumbent.meanScore
}
