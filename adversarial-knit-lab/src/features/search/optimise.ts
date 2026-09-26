/**
 * Query-based optimisation of the chart against a loaded detector.
 *
 * WHY THIS EXISTS
 *
 * The published results that defeat person detectors are outputs of
 * optimisation, not of a procedural recipe:
 *
 *   Brown et al. 2017 (arXiv:1712.09665)  optimised patch
 *   Thys et al. 2019 / Xu et al. 2020     optimised printed panel
 *   Hu et al. 2022 (arXiv:2203.03373)     optimised expandable texture
 *
 * Generating patterns "in the style of" those results inherits none of their
 * effect. The method is the transferable part, so this implements the method.
 *
 * WHY IT IS BLACK-BOX
 *
 * The published work uses gradients. TensorFlow.js executes the converted
 * COCO-SSD graph for inference only; it exposes no gradient through it. So this
 * optimises with forward queries alone: propose a local change to the stitches,
 * measure, keep it if the detector's grip on the target weakened. That is a
 * weaker optimiser than a gradient one and needs more queries to get anywhere.
 *
 * WHAT MAKES IT DIFFERENT FROM THE CANDIDATE SEARCH
 *
 * The search in search.ts draws whole patterns from the generator's parameter
 * space. This edits the stitch grid itself, so it is not confined to what the
 * generator can express -- which is the point, because nothing in the generator
 * was designed to fool anything.
 *
 * WHAT IT DOES NOT DO
 *
 * It optimises against the model you loaded, the photographs you supplied and
 * the rendering settings you chose. A result is evidence about those and
 * nothing else. Improvement on the optimisation split is not a finding; the
 * holdout measurement afterwards is the finding, and it can be negative.
 */
import type { KnittingProject, StitchGrid } from '../../types/project'
import type { ModelAdapter } from '../evaluation/adapter'
import {
  runEvaluation,
  type BaselineCache,
  type EvaluationConfig,
  type LoadedImage,
} from '../evaluation/runEvaluation'
import { analyzeChart } from '../knitting/analysis'
import { chartContentHash, cloneGrid, indexOf } from '../chart/grid'
import { createRng, deriveSeed, type Rng } from '../../lib/rng'

export const OPTIMISER_ID = 'stitch-block-hill-climb/v1'

export const OPTIMISER_DESCRIPTION =
  'Greedy hill climbing over the stitch grid. Each step recolours one rectangular block of stitches, keeps the change only if it lowers the objective on the optimisation split, and rejects outright any change that breaks the knitting constraints. Block sizes shrink over the run, so it moves in broad strokes first and fine ones later.'

/**
 * Objective, lower is better.
 *
 * Lexicographic: first how many target instances are still detected, then the
 * confidence summed over those that are.
 *
 * Note on censoring. For the OBJECTIVE, a target that falls below the
 * reporting threshold contributes nothing to the confidence term. That is a
 * search decision, and it is not how results are reported: the metrics in
 * metrics.ts never substitute zero for a censored detection.
 */
export interface Objective {
  detected: number
  confidence: number
}

export function objectiveFrom(record: {
  perExample: { conditions: { condition: string; matched: { score: number } | null; inferenceOk: boolean }[] }[]
}): Objective {
  let detected = 0
  let confidence = 0
  for (const example of record.perExample) {
    const measurement = example.conditions.find((c) => c.condition === 'chart-pattern')
    if (!measurement?.inferenceOk) continue
    if (measurement.matched) {
      detected++
      confidence += measurement.matched.score
    }
  }
  return { detected, confidence }
}

/** True when `a` is a strict improvement over `b`. */
export function isImprovement(a: Objective, b: Objective): boolean {
  if (a.detected !== b.detected) return a.detected < b.detected
  return a.confidence < b.confidence - 1e-6
}

export function formatObjective(objective: Objective): string {
  return `${objective.detected} detected, confidence ${objective.confidence.toFixed(3)}`
}

/* ------------------------------------------------------------------ *
 * Proposals
 * ------------------------------------------------------------------ */

export interface Proposal {
  row: number
  column: number
  rows: number
  stitches: number
  paletteIndex: number
}

/**
 * Recolour one rectangular block.
 *
 * Blocks rather than single stitches because a single stitch is far below what
 * the detector can resolve once the garment is a few hundred pixels across: a
 * change it cannot see carries no signal, and the run would be noise.
 */
export function proposeBlock(
  grid: StitchGrid,
  paletteLength: number,
  blockSize: number,
  rng: Rng,
): Proposal {
  const stitches = Math.max(1, Math.min(grid.stitches, Math.round(blockSize)))
  const rows = Math.max(1, Math.min(grid.rows, Math.round(blockSize)))
  return {
    row: rng.int(0, Math.max(0, grid.rows - rows)),
    column: rng.int(0, Math.max(0, grid.stitches - stitches)),
    rows,
    stitches,
    paletteIndex: rng.int(0, paletteLength - 1),
  }
}

export function applyProposal(grid: StitchGrid, proposal: Proposal): StitchGrid {
  const next = cloneGrid(grid)
  let changed = false
  for (let r = proposal.row; r < proposal.row + proposal.rows; r++) {
    for (let c = proposal.column; c < proposal.column + proposal.stitches; c++) {
      const i = indexOf(grid, r, c)
      if (next.cells[i] !== proposal.paletteIndex) {
        next.cells[i] = proposal.paletteIndex
        changed = true
      }
    }
  }
  return changed ? next : grid
}

/**
 * Block-size schedule: broad strokes first, fine ones later.
 * Expressed as a fraction of the chart's shorter side.
 */
export function blockSizeAt(step: number, total: number, grid: StitchGrid): number {
  const shorter = Math.min(grid.stitches, grid.rows)
  const progress = total <= 1 ? 1 : step / (total - 1)
  const large = Math.max(3, shorter * 0.28)
  const small = Math.max(1, shorter * 0.05)
  return large + (small - large) * progress
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

export interface OptimiseConstraints {
  maxFloat: number
  enforceColorsPerRow: boolean
}

export interface OptimiseRequest {
  project: KnittingProject
  /** Forward queries to spend. Each step costs one per optimisation example. */
  steps: number
  seed: number
  constraints: OptimiseConstraints
  baseConfig: Omit<EvaluationConfig, 'grid' | 'patternHash'>
  optimizationImages: LoadedImage[]
}

export interface OptimiseProgress {
  step: number
  steps: number
  accepted: number
  rejectedByConstraint: number
  current: Objective
  best: Objective
  bestGrid: StitchGrid
  message: string
}

export interface OptimiseResult {
  optimiser: string
  seed: number
  steps: number
  accepted: number
  rejectedByConstraint: number
  startObjective: Objective
  bestObjective: Objective
  bestGrid: StitchGrid
  /** False when nothing beat the starting chart. Reported, not hidden. */
  improved: boolean
  queries: number
}

export interface OptimiseOptions {
  onProgress?: (progress: OptimiseProgress) => void
  signal?: AbortSignal
}

/** Queries this run will make, before it starts. */
export function optimiseBudget(request: OptimiseRequest): number {
  const samples = request.baseConfig.transforms.enabled
    ? Math.max(1, request.baseConfig.transforms.samplesPerImage)
    : 1
  const examples = request.optimizationImages.length * samples
  // One baseline per example, then one patterned query per step, plus the
  // starting measurement.
  return examples * (1 + request.steps + 1)
}

export async function optimiseChart(
  adapter: ModelAdapter,
  request: OptimiseRequest,
  options: OptimiseOptions = {},
): Promise<OptimiseResult> {
  if (!adapter.isLoaded()) throw new Error('Load a model before optimising')
  if (request.optimizationImages.length === 0) {
    throw new Error('Optimisation needs at least one photograph in the optimisation split')
  }

  const rng = createRng(deriveSeed(request.seed, 'optimise'))
  const baselineCache: BaselineCache = new Map()
  let queries = 0

  const measure = async (grid: StitchGrid): Promise<Objective> => {
    const patternHash = chartContentHash({
      grid,
      palette: request.project.palette,
      gauge: request.project.gauge,
      workingMethod: request.project.workingMethod,
      repeat: request.project.repeat,
    })
    const record = await runEvaluation(
      adapter,
      request.optimizationImages,
      { ...request.baseConfig, grid, patternHash },
      { signal: options.signal, baselineCache },
    )
    queries += record.perExample.length
    return objectiveFrom(record)
  }

  /** Cheap constraint gate: rejected candidates never reach the model. */
  const violatesConstraints = (grid: StitchGrid): boolean => {
    const analysis = analyzeChart({
      grid,
      workingMethod: request.project.workingMethod,
      repeat: request.project.repeat,
      options: request.project.analysisOptions,
      contentHash: 'candidate',
    })
    if (analysis.longestFloat > request.constraints.maxFloat) return true
    if (request.constraints.enforceColorsPerRow && analysis.rowsExceedingColorLimit.length > 0) {
      return true
    }
    return false
  }

  let currentGrid = cloneGrid(request.project.grid)
  const startObjective = await measure(currentGrid)
  let currentObjective = startObjective
  let bestGrid = cloneGrid(currentGrid)
  let bestObjective = startObjective

  let accepted = 0
  let rejectedByConstraint = 0

  for (let step = 0; step < request.steps; step++) {
    if (options.signal?.aborted) break

    const proposal = proposeBlock(
      currentGrid,
      request.project.palette.length,
      blockSizeAt(step, request.steps, currentGrid),
      rng,
    )
    const candidate = applyProposal(currentGrid, proposal)

    if (candidate === currentGrid) continue

    if (violatesConstraints(candidate)) {
      rejectedByConstraint++
      options.onProgress?.({
        step: step + 1,
        steps: request.steps,
        accepted,
        rejectedByConstraint,
        current: currentObjective,
        best: bestObjective,
        bestGrid,
        message: 'rejected: would break the knitting constraints',
      })
      continue
    }

    const objective = await measure(candidate)
    if (isImprovement(objective, currentObjective)) {
      currentGrid = candidate
      currentObjective = objective
      accepted++
      if (isImprovement(objective, bestObjective)) {
        bestObjective = objective
        bestGrid = cloneGrid(candidate)
      }
    }

    options.onProgress?.({
      step: step + 1,
      steps: request.steps,
      accepted,
      rejectedByConstraint,
      current: currentObjective,
      best: bestObjective,
      bestGrid,
      message: `${formatObjective(currentObjective)} (best ${formatObjective(bestObjective)})`,
    })

    // Yield so the interface stays responsive and cancellation lands.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    optimiser: OPTIMISER_ID,
    seed: request.seed,
    steps: request.steps,
    accepted,
    rejectedByConstraint,
    startObjective,
    bestObjective,
    bestGrid,
    improved: isImprovement(bestObjective, startObjective),
    queries,
  }
}
