/**
 * Model registry.
 *
 * One entry per model we can actually run: an adapter that we have verified,
 * with preprocessing and decoding we can describe. There is deliberately no
 * "load any ONNX model" option — supporting an arbitrary artifact would mean
 * guessing its input layout, normalisation and output decoding, and guessing
 * those produces confident numbers that mean nothing.
 *
 * ONNX Runtime Web is not shipped. Adding it is a real option (see
 * docs/evaluation.md), but it needs a verified artifact, licence, preprocessing
 * and output decoder first, and shipping a second inference runtime without one
 * only inflates the bundle.
 */
import { CocoSsdAdapter, type CocoBase } from './cocoSsd'
import type { ModelAdapter } from './adapter'

export interface RegistryEntry {
  id: string
  label: string
  note: string
  create: () => ModelAdapter
}

export const MODEL_REGISTRY: RegistryEntry[] = [
  {
    id: 'coco-ssd/lite_mobilenet_v2',
    label: 'COCO-SSD lite_mobilenet_v2 (baseline)',
    note: 'Smallest and fastest of the three. A practical baseline detector, not a representative sample of current detectors.',
    create: () => new CocoSsdAdapter('lite_mobilenet_v2'),
  },
  {
    id: 'coco-ssd/mobilenet_v2',
    label: 'COCO-SSD mobilenet_v2',
    note: 'Larger download, higher accuracy than the lite variant. Results are not comparable across variants.',
    create: () => new CocoSsdAdapter('mobilenet_v2'),
  },
]

export function createAdapter(id: string): ModelAdapter {
  const entry = MODEL_REGISTRY.find((m) => m.id === id)
  if (!entry) throw new Error(`Unknown model: ${id}`)
  return entry.create()
}

export function isCocoBase(value: string): value is CocoBase {
  return value === 'lite_mobilenet_v2' || value === 'mobilenet_v2' || value === 'mobilenet_v1'
}
