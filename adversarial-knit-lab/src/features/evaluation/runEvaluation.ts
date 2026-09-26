/**
 * Evaluation run.
 *
 * For every (image, transformation sample) pair, every requested condition is
 * rendered and measured through an identical path:
 *
 *   base photograph
 *     -> composite condition texture into the placement-transformed quad
 *     -> apply the SAME camera degradations sampled for this example
 *     -> apply the SAME occlusion rectangle
 *     -> hand the resulting canvas to the model adapter
 *
 * The 'original' condition skips only the compositing step; everything after it
 * is byte-identical in treatment. There is exactly one resize and normalisation
 * path, and it lives inside the adapter.
 */
import type {
  ConditionKind,
  ConditionMeasurement,
  EvalImageRef,
  EvaluationRecord,
  Gauge,
  PaletteEntry,
  PerExampleResult,
  RenderParams,
  RepeatSize,
  StitchGrid,
  TransformSettings,
} from '../../types/project'
import type { ModelAdapter } from './adapter'
import { InferenceError } from './adapter'
import { aggregate } from './metrics'
import { matchTarget } from './matching'
import { compositeQuad, type Quad } from './overlay'
import { applyCameraPath, applyOcclusion, applyPlacement, sampleTransform } from './transforms'
import { dominantPaletteIndex, renderChartTexture, renderSolidTexture } from './texture'
import { buildControlPattern } from './control'
import { cellAspect } from '../knitting/gauge'
import { newId, nowIso } from '../../lib/id'

export interface LoadedImage {
  ref: EvalImageRef
  data: ImageData
}

export interface EvaluationConfig {
  grid: StitchGrid
  palette: PaletteEntry[]
  gauge: Gauge
  repeat: RepeatSize
  patternHash: string
  conditions: ConditionKind[]
  detectionThreshold: number
  matchIou: number
  /** How many stitches span the width of the garment region. */
  stitchesAcrossRegion: number
  /** Pixels per stitch in the rendered texture. */
  cellPixels: number
  fabricShading: boolean
  overlayOpacity: number
  transforms: TransformSettings
  controlSeed: number
  maxDetections: number
}

export interface EvaluationProgress {
  completed: number
  total: number
  message: string
}

/**
 * Cache of baseline measurements, keyed by image and transformation sample.
 *
 * The 'original' condition composites nothing, so its result depends only on
 * the photograph and the sampled transformation -- never on the pattern. During
 * a candidate search the same baseline would otherwise be re-measured once per
 * candidate, which is the single largest waste in the loop.
 *
 * The cache is only valid while the transform settings, thresholds and model
 * stay fixed. A search holds all three constant; anything else must pass a
 * fresh cache or none.
 */
export type BaselineCache = Map<string, ConditionMeasurement>

export function baselineKey(imageId: string, transformIndex: number): string {
  return `${imageId}:${transformIndex}`
}

export interface RunOptions {
  onProgress?: (progress: EvaluationProgress) => void
  signal?: AbortSignal
  baselineCache?: BaselineCache
  /** Provenance when this run came out of a candidate search. */
  search?: EvaluationRecord['search']
  holdoutUsedForSelection?: boolean
}

export function inferenceBudget(
  imageCount: number,
  config: Pick<EvaluationConfig, 'conditions' | 'transforms'>,
): number {
  const samples = config.transforms.enabled ? Math.max(1, config.transforms.samplesPerImage) : 1
  return imageCount * samples * config.conditions.length
}

export async function runEvaluation(
  adapter: ModelAdapter,
  images: LoadedImage[],
  config: EvaluationConfig,
  options: RunOptions = {},
): Promise<EvaluationRecord> {
  if (!adapter.isLoaded()) throw new Error('Load a model before running an evaluation')
  if (images.length === 0) throw new Error('Import at least one photograph')

  const started = performance.now()
  const failures: string[] = []
  const perExample: PerExampleResult[] = []

  const textures = buildTextures(config)
  const samplesPerImage = config.transforms.enabled
    ? Math.max(1, config.transforms.samplesPerImage)
    : 1
  const total = inferenceBudget(images.length, config)
  let completed = 0

  const scratch = document.createElement('canvas')
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true })
  if (!scratchCtx) throw new Error('Could not create a 2D context for evaluation')

  for (const image of images) {
    for (let s = 0; s < samplesPerImage; s++) {
      throwIfAborted(options.signal)
      const sample = sampleTransform(config.transforms, image.ref.id, s)
      const quad = applyPlacement(image.ref.garmentQuad as Quad, sample)
      const measurements: ConditionMeasurement[] = []

      for (const condition of config.conditions) {
        throwIfAborted(options.signal)
        options.onProgress?.({
          completed,
          total,
          message: `${image.ref.fileName} - sample ${s + 1}/${samplesPerImage} - ${condition}`,
        })

        const cacheKey = baselineKey(image.ref.id, s)
        const cached =
          condition === 'original' ? options.baselineCache?.get(cacheKey) : undefined
        if (cached) {
          measurements.push(cached)
          completed++
          continue
        }

        let measurement: ConditionMeasurement
        try {
          const composited =
            condition === 'original'
              ? image.data
              : compositeQuad(image.data, quad, {
                  texture: textureFor(condition, textures),
                  repeatsU: repeatsU(condition, config),
                  repeatsV: repeatsV(condition, config, quad),
                  opacity: config.overlayOpacity,
                })

          // Identical camera path and occlusion for every condition.
          const degraded = await applyCameraPath(composited, sample)
          const occluded = applyOcclusion(degraded, quad, sample)

          scratch.width = occluded.width
          scratch.height = occluded.height
          scratchCtx.putImageData(occluded, 0, 0)

          const detections = await adapter.detect(scratch, {
            minScore: config.detectionThreshold,
            maxDetections: config.maxDetections,
            signal: options.signal,
          })
          const match = matchTarget(detections, image.ref.targetBox, {
            detectionThreshold: config.detectionThreshold,
            matchIou: config.matchIou,
          })
          measurement = {
            condition,
            matched: match.matched,
            inferenceOk: true,
            candidates: match.candidates,
          }
        } catch (error) {
          if (isAbort(error)) throw error
          const reason = error instanceof Error ? error.message : String(error)
          failures.push(`${image.ref.fileName} / sample ${s} / ${condition}: ${reason}`)
          // A failed run is NOT a miss. It is excluded from the metrics.
          measurement = {
            condition,
            matched: null,
            inferenceOk: false,
            failureReason: reason,
            candidates: [],
          }
          if (!(error instanceof InferenceError)) throw error
        }

        if (condition === 'original' && measurement.inferenceOk) {
          options.baselineCache?.set(cacheKey, measurement)
        }
        measurements.push(measurement)
        completed++
        // Yield so the interface stays responsive and cancellation lands.
        await yieldToEventLoop()
      }

      perExample.push({
        imageId: image.ref.id,
        split: image.ref.split,
        transformIndex: s,
        transformSeed: sample.seed,
        conditions: measurements,
      })
    }
  }

  options.onProgress?.({ completed, total, message: 'Aggregating' })

  const renderParams: RenderParams = {
    cellPixels: config.cellPixels,
    gauge: config.gauge,
    decorations: false,
    repeat: config.repeat,
    fabricShading: config.fabricShading,
  }

  const record: EvaluationRecord = {
    id: newId('eval'),
    createdAt: nowIso(),
    patternHash: config.patternHash,
    renderParams,
    model: adapter.descriptor,
    preprocessing: adapter.preprocessing,
    thresholds: { detection: config.detectionThreshold, matchIou: config.matchIou },
    images: images.map((i) => i.ref),
    transforms: config.transforms,
    conditions: config.conditions,
    perExample,
    aggregate: aggregate(perExample, config.conditions),
    runtime: {
      backend: adapter.backend(),
      userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      durationMs: performance.now() - started,
    },
    failures,
    holdoutUsedForSelection: options.holdoutUsedForSelection ?? false,
  }
  if (options.search) record.search = options.search
  return record
}

/* ------------------------------------------------------------------ *
 * Textures
 * ------------------------------------------------------------------ */

interface ConditionTextures {
  chart: ImageData
  control: ImageData
  solid: ImageData
  controlGrid: StitchGrid
}

export function buildTextures(config: EvaluationConfig): ConditionTextures {
  const renderOptions = {
    cellPixels: config.cellPixels,
    gauge: config.gauge,
    fabricShading: config.fabricShading,
  }
  const controlGrid = buildControlPattern(config.grid, config.palette.length, config.controlSeed)
  const dominant = config.palette[dominantPaletteIndex(config.grid)]
  return {
    chart: renderChartTexture(config.grid, config.palette, renderOptions),
    control: renderChartTexture(controlGrid, config.palette, renderOptions),
    solid: renderSolidTexture(dominant ? dominant.hex : '#808080'),
    controlGrid,
  }
}

function textureFor(condition: ConditionKind, textures: ConditionTextures): ImageData {
  switch (condition) {
    case 'chart-pattern':
      return textures.chart
    case 'control-pattern':
      return textures.control
    case 'solid':
      return textures.solid
    case 'original':
      return textures.solid
  }
}

function repeatsU(condition: ConditionKind, config: EvaluationConfig): number {
  if (condition === 'solid') return 1
  return Math.max(0.05, config.stitchesAcrossRegion / config.grid.stitches)
}

/**
 * Vertical repeat count that keeps the motif at gauge-correct proportions
 * inside the quad: pixels per row are pixels per stitch divided by the cell
 * aspect, so the number of rows spanning the quad follows from its pixel
 * height.
 */
function repeatsV(condition: ConditionKind, config: EvaluationConfig, quad: Quad): number {
  if (condition === 'solid') return 1
  const xs = quad.map((q) => q[0] as number)
  const ys = quad.map((q) => q[1] as number)
  const quadWidth = Math.max(1, Math.max(...xs) - Math.min(...xs))
  const quadHeight = Math.max(1, Math.max(...ys) - Math.min(...ys))
  const pixelsPerStitch = quadWidth / Math.max(1, config.stitchesAcrossRegion)
  const rowsAcross = (quadHeight * cellAspect(config.gauge)) / pixelsPerStitch
  return Math.max(0.05, rowsAcross / config.grid.rows)
}

/* ------------------------------------------------------------------ *
 * Cancellation helpers
 * ------------------------------------------------------------------ */

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Evaluation cancelled', 'AbortError')
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
