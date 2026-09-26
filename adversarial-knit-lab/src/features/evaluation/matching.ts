/**
 * Associating detections with the annotated target person.
 *
 * Matching rule, applied in this order and documented here because the metrics
 * are meaningless without it:
 *   1. Keep detections whose class label is the target class ('person').
 *   2. Keep detections whose score is at or above the reporting threshold.
 *   3. Compute IoU against the user-annotated target box.
 *   4. Keep detections whose IoU is at or above the match threshold.
 *   5. Of those, take the highest IoU. Ties break on the higher score.
 *
 * Step 4 is what stops another person's box being credited to the target in a
 * photograph containing several people. A detection that overlaps the target
 * only slightly is not the target.
 */
import type { BoundingBox, Detection } from '../../types/project'

export const TARGET_CLASS = 'person'

export function intersectionOverUnion(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const interWidth = Math.max(0, x2 - x1)
  const interHeight = Math.max(0, y2 - y1)
  const intersection = interWidth * interHeight
  if (intersection <= 0) return 0
  const union = a.width * a.height + b.width * b.height - intersection
  return union <= 0 ? 0 : intersection / union
}

export interface MatchOptions {
  detectionThreshold: number
  matchIou: number
  targetClass?: string
}

export interface MatchResult {
  matched: Detection | null
  /** Every target-class detection at or above the reporting threshold. */
  candidates: Detection[]
  /** Best IoU seen, even when it fell below the match threshold. */
  bestIou: number
}

export function matchTarget(
  detections: readonly Detection[],
  target: BoundingBox,
  options: MatchOptions,
): MatchResult {
  const targetClass = options.targetClass ?? TARGET_CLASS
  const candidates = detections.filter(
    (d) => d.label === targetClass && d.score >= options.detectionThreshold,
  )

  let matched: Detection | null = null
  let matchedIou = -1
  let bestIou = 0

  for (const candidate of candidates) {
    const iou = intersectionOverUnion(candidate.box, target)
    if (iou > bestIou) bestIou = iou
    if (iou < options.matchIou) continue
    if (iou > matchedIou || (iou === matchedIou && matched !== null && candidate.score > matched.score)) {
      matched = candidate
      matchedIou = iou
    }
  }

  return { matched, candidates, bestIou }
}

export function boxFromCorners(x1: number, y1: number, x2: number, y2: number): BoundingBox {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

export function boxArea(box: BoundingBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height)
}

export function clampBoxToImage(box: BoundingBox, width: number, height: number): BoundingBox {
  const x = Math.max(0, Math.min(box.x, width))
  const y = Math.max(0, Math.min(box.y, height))
  return {
    x,
    y,
    width: Math.max(0, Math.min(box.width, width - x)),
    height: Math.max(0, Math.min(box.height, height - y)),
  }
}
