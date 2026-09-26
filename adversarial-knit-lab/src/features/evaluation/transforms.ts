/**
 * Transformation probes.
 *
 * These are robustness probes under digital transformations. They are not proof
 * of physical performance: a knitted garment on a moving body is not a rotated,
 * blurred and JPEG-compressed rectangle.
 *
 * Two groups are kept distinct because they mean different things:
 *   Placement  — scale, rotation and perspective of the garment region. Models
 *                how the motif sits on the body.
 *   Camera     — brightness, contrast, blur and JPEG compression applied to the
 *                whole photograph. Models the capture path.
 *
 * Every sample is derived from (transform seed, image id, sample index), so the
 * SAME parameters are applied to the baseline and to every patterned condition
 * of the same example. Paired comparison is the entire point; sampling
 * independently per condition would make the differences meaningless.
 */
import type { BoundingBox, TransformSettings } from '../../types/project'
import { createRng, deriveSeed, seedFromString } from '../../lib/rng'
import type { Quad } from './overlay'

export const DEFAULT_TRANSFORMS: TransformSettings = {
  enabled: false,
  seed: 1,
  samplesPerImage: 1,
  placement: {
    scale: [0.9, 1.1],
    rotationDegrees: [-8, 8],
    perspective: 0.06,
  },
  camera: {
    brightness: [-0.12, 0.12],
    contrast: [0.9, 1.1],
    blurPx: [0, 1.5],
    jpegQuality: [0.55, 0.95],
  },
  occlusion: {
    enabled: false,
    maxFraction: 0.25,
  },
}

export interface TransformSample {
  index: number
  seed: number
  scale: number
  rotationDegrees: number
  perspective: [number, number, number, number]
  brightness: number
  contrast: number
  blurPx: number
  jpegQuality: number | null
  occlusion: { x: number; y: number; width: number; height: number } | null
}

export const IDENTITY_SAMPLE: TransformSample = {
  index: 0,
  seed: 0,
  scale: 1,
  rotationDegrees: 0,
  perspective: [0, 0, 0, 0],
  brightness: 0,
  contrast: 1,
  blurPx: 0,
  jpegQuality: null,
  occlusion: null,
}

export function sampleTransform(
  settings: TransformSettings,
  imageId: string,
  index: number,
): TransformSample {
  if (!settings.enabled) return { ...IDENTITY_SAMPLE, index }
  const seed = deriveSeed(settings.seed ^ seedFromString(imageId), `sample${index}`)
  const rng = createRng(seed)
  const p = settings.placement
  const c = settings.camera

  const perspective: [number, number, number, number] = [
    rng.range(-p.perspective, p.perspective),
    rng.range(-p.perspective, p.perspective),
    rng.range(-p.perspective, p.perspective),
    rng.range(-p.perspective, p.perspective),
  ]

  let occlusion: TransformSample['occlusion'] = null
  if (settings.occlusion.enabled && settings.occlusion.maxFraction > 0) {
    const fraction = rng.range(0.05, settings.occlusion.maxFraction)
    const aspect = rng.range(0.4, 2.5)
    const width = Math.sqrt(fraction * aspect)
    const height = fraction / Math.max(1e-6, width)
    occlusion = {
      x: rng.range(0, Math.max(0, 1 - width)),
      y: rng.range(0, Math.max(0, 1 - height)),
      width: Math.min(1, width),
      height: Math.min(1, height),
    }
  }

  return {
    index,
    seed,
    scale: rng.range(p.scale[0], p.scale[1]),
    rotationDegrees: rng.range(p.rotationDegrees[0], p.rotationDegrees[1]),
    perspective,
    brightness: rng.range(c.brightness[0], c.brightness[1]),
    contrast: rng.range(c.contrast[0], c.contrast[1]),
    blurPx: rng.range(c.blurPx[0], c.blurPx[1]),
    jpegQuality: rng.range(c.jpegQuality[0], c.jpegQuality[1]),
    occlusion,
  }
}

/** Scale, rotate and perspective-jitter the garment quad about its centre. */
export function applyPlacement(quad: Quad, sample: TransformSample): Quad {
  const cx = quad.reduce((sum, q) => sum + (q[0] as number), 0) / quad.length
  const cy = quad.reduce((sum, q) => sum + (q[1] as number), 0) / quad.length
  const angle = (sample.rotationDegrees * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  // Average edge length gives the jitter a scale-independent magnitude.
  let perimeter = 0
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i] as [number, number]
    const b = quad[(i + 1) % quad.length] as [number, number]
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  const jitterScale = perimeter / 4

  return quad.map((point, i) => {
    const dx = (point[0] as number) - cx
    const dy = (point[1] as number) - cy
    const sx = dx * sample.scale
    const sy = dy * sample.scale
    const rx = sx * cos - sy * sin
    const ry = sx * sin + sy * cos
    const jitter = (sample.perspective[i] ?? 0) * jitterScale
    // Push each corner along its own diagonal, which tilts the plane.
    const len = Math.hypot(rx, ry) || 1
    return [cx + rx + (rx / len) * jitter, cy + ry + (ry / len) * jitter] as [number, number]
  })
}

/* ------------------------------------------------------------------ *
 * Whole-image camera degradations
 * ------------------------------------------------------------------ */

/** Brightness and contrast, in place on a copy. */
export function applyToneCurve(image: ImageData, sample: TransformSample): ImageData {
  if (sample.brightness === 0 && sample.contrast === 1) return image
  const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
  const offset = sample.brightness * 255
  for (let i = 0; i < out.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = out.data[i + k] as number
      out.data[i + k] = (v - 128) * sample.contrast + 128 + offset
    }
  }
  return out
}

/**
 * Three box-blur passes approximate a Gaussian closely enough for a robustness
 * probe, and stay deterministic and dependency-free.
 */
export function applyBlur(image: ImageData, radiusPx: number): ImageData {
  const radius = Math.round(radiusPx)
  if (radius < 1) return image
  let current = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
  for (let pass = 0; pass < 3; pass++) {
    current = boxBlurPass(current, radius, true)
    current = boxBlurPass(current, radius, false)
  }
  return current
}

function boxBlurPass(image: ImageData, radius: number, horizontal: boolean): ImageData {
  const { width, height } = image
  const out = new ImageData(width, height)
  const span = radius * 2 + 1
  const outer = horizontal ? height : width
  const inner = horizontal ? width : height

  for (let o = 0; o < outer; o++) {
    for (let k = 0; k < 3; k++) {
      let sum = 0
      for (let i = -radius; i <= radius; i++) {
        sum += sampleChannel(image, horizontal, o, clampIndex(i, inner), k)
      }
      for (let i = 0; i < inner; i++) {
        const index = horizontal ? (o * width + i) * 4 : (i * width + o) * 4
        out.data[index + k] = sum / span
        const outgoing = sampleChannel(image, horizontal, o, clampIndex(i - radius, inner), k)
        const incoming = sampleChannel(image, horizontal, o, clampIndex(i + radius + 1, inner), k)
        sum += incoming - outgoing
      }
    }
    for (let i = 0; i < inner; i++) {
      const index = horizontal ? (o * width + i) * 4 : (i * width + o) * 4
      out.data[index + 3] = 255
    }
  }
  return out
}

function sampleChannel(
  image: ImageData,
  horizontal: boolean,
  outer: number,
  inner: number,
  channel: number,
): number {
  const index = horizontal ? (outer * image.width + inner) * 4 : (inner * image.width + outer) * 4
  return image.data[index + channel] as number
}

function clampIndex(value: number, size: number): number {
  return value < 0 ? 0 : value >= size ? size - 1 : value
}

/** Grey rectangle over part of the garment region, applied to every condition. */
export function applyOcclusion(image: ImageData, quad: Quad, sample: TransformSample): ImageData {
  if (!sample.occlusion) return image
  const xs = quad.map((q) => q[0] as number)
  const ys = quad.map((q) => q[1] as number)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX
  const h = Math.max(...ys) - minY

  const rect = {
    x: Math.round(minX + sample.occlusion.x * w),
    y: Math.round(minY + sample.occlusion.y * h),
    width: Math.round(sample.occlusion.width * w),
    height: Math.round(sample.occlusion.height * h),
  }
  const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
  for (let y = Math.max(0, rect.y); y < Math.min(image.height, rect.y + rect.height); y++) {
    for (let x = Math.max(0, rect.x); x < Math.min(image.width, rect.x + rect.width); x++) {
      const i = (y * image.width + x) * 4
      out.data[i] = 110
      out.data[i + 1] = 110
      out.data[i + 2] = 110
      out.data[i + 3] = 255
    }
  }
  return out
}

/** Re-encode through JPEG at the sampled quality. Browser only. */
export async function applyJpeg(image: ImageData, quality: number): Promise<ImageData> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return image
  ctx.putImageData(image, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', Math.max(0.05, Math.min(1, quality))),
  )
  if (!blob) return image
  const bitmap = await createImageBitmap(blob)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Full camera path. Identical for every condition of the same example. */
export async function applyCameraPath(
  image: ImageData,
  sample: TransformSample,
): Promise<ImageData> {
  let current = applyToneCurve(image, sample)
  current = applyBlur(current, sample.blurPx)
  if (sample.jpegQuality !== null && sample.jpegQuality < 0.999) {
    current = await applyJpeg(current, sample.jpegQuality)
  }
  return current
}

export function describeSample(sample: TransformSample): string {
  if (sample.seed === 0) return 'no transformation'
  const parts = [
    `scale ${sample.scale.toFixed(2)}`,
    `rotation ${sample.rotationDegrees.toFixed(1)}°`,
    `brightness ${sample.brightness >= 0 ? '+' : ''}${(sample.brightness * 100).toFixed(0)}%`,
    `contrast ${sample.contrast.toFixed(2)}`,
  ]
  if (sample.blurPx >= 1) parts.push(`blur ${sample.blurPx.toFixed(1)} px`)
  if (sample.jpegQuality !== null) parts.push(`JPEG q${(sample.jpegQuality * 100).toFixed(0)}`)
  if (sample.occlusion) parts.push('occlusion')
  return parts.join(', ')
}

export function boxToQuad(box: BoundingBox): Quad {
  return [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ]
}
