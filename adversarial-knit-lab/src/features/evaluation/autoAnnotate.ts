/**
 * Automatic annotation.
 *
 * Marking a target person and a garment region by hand before every
 * measurement is the slowest part of the loop, and it is work the detector can
 * do itself: run it on the untouched photograph, take the person it is most
 * confident about, and derive a torso region from that box.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not invent a target. If the detector finds no person above the
 *     threshold, that is reported and nothing is annotated. A photograph whose
 *     baseline has no detection cannot tell you whether a pattern hid anyone,
 *     and the metrics already treat it that way.
 *   - It does not replace judgement. The derived region is a proportional guess
 *     at where a torso sits inside a bounding box; it is shown on the
 *     photograph and stays draggable.
 */
import type { BoundingBox, Detection, EvalImageRef } from '../../types/project'
import type { ModelAdapter } from './adapter'
import { TARGET_CLASS } from './matching'
import { validateGarmentQuad, type Quad } from './overlay'

/**
 * Proportions of a person's bounding box that the torso occupies.
 *
 * Measured from nothing: these are a convention, chosen so the region clears
 * the head band that `validateGarmentQuad` refuses, and stays inside the arms
 * for a typical upright standing pose. Any other pose needs dragging.
 */
export const TORSO_FRACTIONS = {
  top: 0.24,
  bottom: 0.62,
  left: 0.14,
  right: 0.86,
} as const

export function torsoQuad(box: BoundingBox): Quad {
  const top = box.y + box.height * TORSO_FRACTIONS.top
  const bottom = box.y + box.height * TORSO_FRACTIONS.bottom
  const left = box.x + box.width * TORSO_FRACTIONS.left
  const right = box.x + box.width * TORSO_FRACTIONS.right
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]
}

export interface AutoAnnotation {
  ok: boolean
  /** Null when no person cleared the threshold. */
  targetBox: BoundingBox | null
  garmentQuad: Quad | null
  /** Confidence of the chosen detection, for display. */
  score: number | null
  /** Every person the detector reported, so a wrong pick is visible. */
  people: Detection[]
  message: string
}

export interface AutoAnnotateOptions {
  detectionThreshold: number
  maxDetections?: number
  signal?: AbortSignal
}

/** Draw ImageData onto a canvas the adapter can consume. */
function toCanvas(image: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create a 2D context for auto-annotation')
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Largest-area person wins, with confidence as the tie-break. */
export function pickTarget(people: readonly Detection[]): Detection | null {
  let best: Detection | null = null
  let bestArea = -1
  for (const person of people) {
    const area = person.box.width * person.box.height
    if (area > bestArea || (area === bestArea && best !== null && person.score > best.score)) {
      best = person
      bestArea = area
    }
  }
  return best
}

export async function autoAnnotate(
  adapter: ModelAdapter,
  image: ImageData,
  options: AutoAnnotateOptions,
): Promise<AutoAnnotation> {
  const detections = await adapter.detect(toCanvas(image), {
    minScore: options.detectionThreshold,
    maxDetections: options.maxDetections ?? 20,
    signal: options.signal,
  })
  const people = detections.filter((d) => d.label === TARGET_CLASS)

  if (people.length === 0) {
    return {
      ok: false,
      targetBox: null,
      garmentQuad: null,
      score: null,
      people: [],
      message: `No person detected above ${options.detectionThreshold.toFixed(2)}. Nothing was annotated: a photograph the baseline cannot detect says nothing about whether a pattern hides anyone. Use a clearer photograph, or lower the reporting threshold.`,
    }
  }

  const target = pickTarget(people) as Detection
  const quad = torsoQuad(target.box)
  const validation = validateGarmentQuad(quad, image, target.box)

  return {
    ok: validation.ok,
    targetBox: target.box,
    garmentQuad: quad,
    score: target.score,
    people,
    message: validation.ok
      ? `Annotated the largest of ${people.length} detected person(s) at confidence ${target.score.toFixed(3)}. Drag the corners if the garment region is wrong.`
      : `Detected a person at confidence ${target.score.toFixed(3)}, but the derived region is not usable: ${validation.errors[0]}`,
  }
}

/**
 * Fallback region when no person was detected: the lower part of the frame.
 *
 * At a laptop the camera sees head and shoulders, so the lower band of the
 * picture is where a garment sits. This lets you see the pattern in place
 * immediately. It is a placement aid, not a measurement: with no detected
 * person the baseline has nothing to lose, and the evaluation metrics already
 * treat such an example as ineligible.
 */
export function lowerFrameQuad(
  image: { width: number; height: number },
  topFraction = 0.55,
  insetFraction = 0.12,
): Quad {
  const top = image.height * topFraction
  const bottom = image.height * 0.98
  const left = image.width * insetFraction
  const right = image.width * (1 - insetFraction)
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]
}

/** Apply an annotation to an image reference. */
export function withAnnotation(
  ref: EvalImageRef,
  annotation: AutoAnnotation,
): EvalImageRef {
  if (!annotation.targetBox || !annotation.garmentQuad) return ref
  return { ...ref, targetBox: annotation.targetBox, garmentQuad: annotation.garmentQuad }
}
