/**
 * Show the model the pattern, and nothing else.
 *
 * This is the fastest honest measurement in the application: no photograph, no
 * annotation, no compositing. Render the chart as fabric would look, hand it to
 * the detector, and report every class it claims to see.
 *
 * WHAT THIS MEASURES
 *   What a detector reports when shown this pattern on its own. A pattern that
 *   makes an object detector announce a bird, a kite and two people in a flat
 *   piece of knitting is doing something measurable to that model, and this
 *   shows it immediately, at several scales.
 *
 * WHAT THIS IS NOT
 *   It is **not** evidence that the pattern hides anyone. Hiding a person is a
 *   different question, asked of a different image: a photograph of a person
 *   wearing the thing, measured against paired controls. A texture with no
 *   person in it cannot answer it, and this module never claims otherwise.
 *
 *   The relationship between "the detector sees phantom objects in the fabric"
 *   and "the detector misses a person wearing the fabric" is not established
 *   here or anywhere in this project. They are reported separately because
 *   they are separate things.
 */
import type {
  Detection,
  Gauge,
  ModelDescriptor,
  PaletteEntry,
  StitchGrid,
} from '../../types/project'
import type { ModelAdapter } from './adapter'
import { renderChartTexture } from './texture'
import { TARGET_CLASS } from './matching'

/** Stitches across the probe image. Small numbers mean big, coarse stitches. */
export const DEFAULT_PROBE_SCALES = [24, 48, 96] as const

export interface ProbeScaleResult {
  /** Stitches spanning the width of the probe image. */
  stitchesAcross: number
  /** Pixel size of the square image the model was shown. */
  imagePx: number
  detections: Detection[]
  /** Highest confidence of any class. */
  topScore: number | null
  /** Distinct classes reported, most confident first. */
  classes: { label: string; count: number; topScore: number }[]
  /** Detections of the person class specifically. */
  personCount: number
  inferenceOk: boolean
  failureReason?: string
}

export interface PatternProbeResult {
  patternHash: string
  model: ModelDescriptor
  backend: string
  createdAt: string
  render: {
    imagePx: number
    gauge: Gauge
    fabricShading: boolean
    decorations: false
  }
  threshold: number
  scales: ProbeScaleResult[]
  durationMs: number
}

export interface ProbeOptions {
  grid: StitchGrid
  palette: readonly PaletteEntry[]
  gauge: Gauge
  patternHash: string
  /** Stitch counts to test. Scale changes what a detector can resolve. */
  scales?: readonly number[]
  /** Square image size handed to the model. */
  imagePx?: number
  fabricShading?: boolean
  /** Detections below this are not reported. */
  threshold?: number
  maxDetections?: number
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export async function probePattern(
  adapter: ModelAdapter,
  options: ProbeOptions,
): Promise<PatternProbeResult> {
  if (!adapter.isLoaded()) throw new Error('Load a model before probing a pattern')

  const started = performance.now()
  const imagePx = options.imagePx ?? 512
  const threshold = options.threshold ?? 0.2
  const scales = options.scales ?? DEFAULT_PROBE_SCALES
  const fabricShading = options.fabricShading ?? true

  const canvas = document.createElement('canvas')
  canvas.width = imagePx
  canvas.height = imagePx
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create a 2D context for the pattern probe')

  const results: ProbeScaleResult[] = []

  for (const [index, stitchesAcross] of scales.entries()) {
    if (options.signal?.aborted) throw new DOMException('Probe cancelled', 'AbortError')
    options.onProgress?.(index, scales.length)

    // Decoration-free, exactly as the evaluation pipeline renders it: chart
    // gridlines and row numbers are not part of a knitted motif.
    const texture = renderChartTexture(options.grid, options.palette, {
      cellPixels: Math.max(1, imagePx / Math.max(1, stitchesAcross)),
      gauge: options.gauge,
      fabricShading,
    })

    ctx.clearRect(0, 0, imagePx, imagePx)
    tile(ctx, texture, imagePx)

    try {
      const detections = await adapter.detect(canvas, {
        minScore: threshold,
        maxDetections: options.maxDetections ?? 20,
        signal: options.signal,
      })
      results.push(summarise(stitchesAcross, imagePx, detections))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      results.push({
        stitchesAcross,
        imagePx,
        detections: [],
        topScore: null,
        classes: [],
        personCount: 0,
        inferenceOk: false,
        failureReason: error instanceof Error ? error.message : String(error),
      })
    }
    // Yield so a probe over several scales does not freeze the interface.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  options.onProgress?.(scales.length, scales.length)

  return {
    patternHash: options.patternHash,
    model: adapter.descriptor,
    backend: adapter.backend(),
    createdAt: new Date().toISOString(),
    render: { imagePx, gauge: options.gauge, fabricShading, decorations: false },
    threshold,
    scales: results,
    durationMs: performance.now() - started,
  }
}

/** Repeat a texture across a square canvas. */
function tile(
  ctx: CanvasRenderingContext2D,
  texture: ImageData,
  size: number,
): void {
  const patch = document.createElement('canvas')
  patch.width = texture.width
  patch.height = texture.height
  patch.getContext('2d')?.putImageData(texture, 0, 0)
  for (let y = 0; y < size; y += texture.height) {
    for (let x = 0; x < size; x += texture.width) {
      ctx.drawImage(patch, x, y)
    }
  }
}

export function summarise(
  stitchesAcross: number,
  imagePx: number,
  detections: Detection[],
): ProbeScaleResult {
  const byClass = new Map<string, { count: number; topScore: number }>()
  for (const detection of detections) {
    const entry = byClass.get(detection.label)
    if (entry) {
      entry.count++
      entry.topScore = Math.max(entry.topScore, detection.score)
    } else {
      byClass.set(detection.label, { count: 1, topScore: detection.score })
    }
  }

  return {
    stitchesAcross,
    imagePx,
    detections,
    topScore: detections.length > 0 ? Math.max(...detections.map((d) => d.score)) : null,
    classes: [...byClass.entries()]
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.topScore - a.topScore),
    personCount: detections.filter((d) => d.label === TARGET_CLASS).length,
    inferenceOk: true,
  }
}

/** Total detections across every scale. Used to rank candidates. */
export function totalDetections(result: PatternProbeResult): number {
  return result.scales.reduce((sum, scale) => sum + scale.detections.length, 0)
}

/** Sum of confidences across every scale; 0 when the pattern reads as nothing. */
export function responseScore(result: PatternProbeResult): number {
  return result.scales.reduce(
    (sum, scale) => sum + scale.detections.reduce((s, d) => s + d.score, 0),
    0,
  )
}
