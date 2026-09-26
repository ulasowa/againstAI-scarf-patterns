/**
 * Digital garment overlay.
 *
 * A chart-derived texture is mapped into a user-drawn quadrilateral with a
 * projective transform and composited into the photograph. This is a digital
 * garment overlay. It is NOT a simulation of knitted clothing: it has no
 * drape, no shadow, no fabric deformation and no lighting response, and the
 * deformation literature (Xu et al., ECCV 2020) exists precisely because those
 * things change the outcome.
 *
 * Pixels outside the quadrilateral are copied through untouched.
 */
import type { BoundingBox } from '../../types/project'

export type Quad = [number, number][]

export interface OverlayOptions {
  /** Texture is sampled in its own pixel space and tiled across the quad. */
  texture: ImageData
  /** How many times the texture repeats across the quad's u axis. */
  repeatsU: number
  repeatsV: number
  /** 0..1 blend with the underlying photograph. 1 replaces it completely. */
  opacity: number
}

/* ------------------------------------------------------------------ *
 * Homography
 * ------------------------------------------------------------------ */

/**
 * Homography mapping the unit square (0,0),(1,0),(1,1),(0,1) to `quad`.
 * Returns the 8 coefficients of
 *   x = (a*u + b*v + c) / (g*u + h*v + 1)
 *   y = (d*u + e*v + f) / (g*u + h*v + 1)
 */
export function unitSquareToQuad(quad: Quad): number[] | null {
  if (quad.length !== 4) return null
  const p = quad.map((q) => ({ x: q[0] as number, y: q[1] as number }))
  const [p0, p1, p2, p3] = p as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ]

  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const sx = p0.x - p1.x + p2.x - p3.x
  const sy = p0.y - p1.y + p2.y - p3.y

  const den = dx1 * dy2 - dx2 * dy1
  if (Math.abs(den) < 1e-12) {
    // Affine case: the quad is a parallelogram.
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0]
  }
  const g = (sx * dy2 - dx2 * sy) / den
  const h = (dx1 * sy - sx * dy1) / den
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
  ]
}

/** Invert a 3x3 homography given as 8 coefficients (i = 1). */
export function invertHomography(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h] = m as [number, number, number, number, number, number, number, number]
  const i = 1
  const A = e * i - f * h
  const B = c * h - b * i
  const C = b * f - c * e
  const det = a * A + d * B + g * C
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  return [
    A * inv,
    B * inv,
    C * inv,
    (f * g - d * i) * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    (d * h - e * g) * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ]
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

export function quadBounds(quad: Quad): BoundingBox {
  const xs = quad.map((q) => q[0] as number)
  const ys = quad.map((q) => q[1] as number)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

export function quadArea(quad: Quad): number {
  let area = 0
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i] as [number, number]
    const b = quad[(i + 1) % quad.length] as [number, number]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(area) / 2
}

export function pointInQuad(quad: Quad, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const a = quad[i] as [number, number]
    const b = quad[j] as [number, number]
    const intersects = a[1] > y !== b[1] > y
    if (!intersects) continue
    const xAt = ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    if (x < xAt) inside = !inside
  }
  return inside
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export interface QuadValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Bounds and sanity checks. A torso garment region that reaches into the top of
 * the target box is almost certainly covering the head, which would make any
 * detection change a statement about occluding a face rather than about the
 * pattern. That is refused rather than silently accepted.
 */
export function validateGarmentQuad(
  quad: Quad,
  image: { width: number; height: number },
  targetBox: BoundingBox | null,
): QuadValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (quad.length !== 4) errors.push('The garment region needs exactly four corners.')
  for (const [x, y] of quad) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) errors.push('A corner has an invalid position.')
    if (x < -1 || y < -1 || x > image.width + 1 || y > image.height + 1) {
      errors.push('A corner lies outside the photograph.')
      break
    }
  }
  const area = quadArea(quad)
  if (area < 64) errors.push('The garment region is too small to render a texture into.')
  if (unitSquareToQuad(quad) === null) errors.push('The garment region is degenerate.')

  if (targetBox && errors.length === 0) {
    const bounds = quadBounds(quad)
    const insideTarget =
      bounds.x >= targetBox.x - 2 &&
      bounds.y >= targetBox.y - 2 &&
      bounds.x + bounds.width <= targetBox.x + targetBox.width + 2 &&
      bounds.y + bounds.height <= targetBox.y + targetBox.height + 2
    if (!insideTarget) {
      warnings.push(
        'The garment region extends past the annotated person. Overlapping the background changes what a detection difference means.',
      )
    }
    // The upper fifth of a standing person's box is where the head sits.
    const headBand = targetBox.y + targetBox.height * 0.2
    if (bounds.y < headBand) {
      errors.push(
        'The garment region reaches into the top fifth of the target box, where the head usually is. Covering a face measures occlusion, not the pattern. Move the region down, or annotate a different target.',
      )
    }
    const coverage = area / Math.max(1, targetBox.width * targetBox.height)
    if (coverage > 0.75) {
      warnings.push(
        `The region covers about ${(coverage * 100).toFixed(0)}% of the target box. At that size the comparison is mostly about how much of the person is hidden.`,
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

/* ------------------------------------------------------------------ *
 * Compositing
 * ------------------------------------------------------------------ */

/**
 * Composite `texture` into `quad` over a copy of `base`.
 * Inverse mapping per destination pixel, so no seams and no resampling of the
 * untouched background.
 */
export function compositeQuad(base: ImageData, quad: Quad, options: OverlayOptions): ImageData {
  const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
  const forward = unitSquareToQuad(quad)
  if (!forward) return out
  const inverse = invertHomography(forward)
  if (!inverse) return out

  const bounds = quadBounds(quad)
  const x0 = Math.max(0, Math.floor(bounds.x))
  const y0 = Math.max(0, Math.floor(bounds.y))
  const x1 = Math.min(base.width, Math.ceil(bounds.x + bounds.width))
  const y1 = Math.min(base.height, Math.ceil(bounds.y + bounds.height))

  const [ia, ib, ic, id, ie, iff, ig, ih, ii] = inverse as [
    number, number, number, number, number, number, number, number, number,
  ]
  const tex = options.texture
  const opacity = Math.max(0, Math.min(1, options.opacity))

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w = ig * px + ih * py + ii
      if (Math.abs(w) < 1e-12) continue
      const u = (ia * px + ib * py + ic) / w
      const v = (id * px + ie * py + iff) / w
      // The unit square is the authoritative mask: outside it, nothing changes.
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue

      const tx = wrapIndex(Math.floor(u * options.repeatsU * tex.width), tex.width)
      const ty = wrapIndex(Math.floor(v * options.repeatsV * tex.height), tex.height)
      const ti = (ty * tex.width + tx) * 4
      const oi = (y * base.width + x) * 4

      if (opacity >= 1) {
        out.data[oi] = tex.data[ti] as number
        out.data[oi + 1] = tex.data[ti + 1] as number
        out.data[oi + 2] = tex.data[ti + 2] as number
      } else {
        for (let k = 0; k < 3; k++) {
          const src = tex.data[ti + k] as number
          const dst = base.data[oi + k] as number
          out.data[oi + k] = dst + (src - dst) * opacity
        }
      }
      out.data[oi + 3] = 255
    }
  }
  return out
}

function wrapIndex(value: number, size: number): number {
  const m = value % size
  return m < 0 ? m + size : m
}

/** Count the pixels a quad would change, for coverage reporting. */
export function coveredPixels(quad: Quad, width: number, height: number): number {
  const bounds = quadBounds(quad)
  const x0 = Math.max(0, Math.floor(bounds.x))
  const y0 = Math.max(0, Math.floor(bounds.y))
  const x1 = Math.min(width, Math.ceil(bounds.x + bounds.width))
  const y1 = Math.min(height, Math.ceil(bounds.y + bounds.height))
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (pointInQuad(quad, x + 0.5, y + 0.5)) count++
    }
  }
  return count
}
