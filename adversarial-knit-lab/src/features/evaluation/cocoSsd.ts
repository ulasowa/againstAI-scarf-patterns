/**
 * TensorFlow.js COCO-SSD adapter.
 *
 * This is a practical baseline detector, not a representative sample of current
 * detectors. It is a MobileNet-backed SSD trained on COCO, converted for the
 * browser by the TensorFlow.js team. A result measured here describes this
 * model under these settings and nothing else.
 *
 * Preprocessing and output decoding are performed inside
 * @tensorflow-models/coco-ssd: the image is fed as a uint8 tensor at its native
 * resolution, the SavedModel graph performs its own resize and normalisation,
 * and the package applies non-max suppression and maps class indices to COCO
 * label strings. We do not reimplement any of it, and the descriptor below
 * records that the details live upstream.
 *
 * Weights: https://storage.googleapis.com/tfjs-models/savedmodel/<prefix>/model.json
 * Licence: Apache-2.0 (tfjs-models).
 */
import type { Detection, ModelDescriptor, PreprocessingConfig } from '../../types/project'
import {
  assertNotAborted,
  InferenceError,
  ModelLoadError,
  type DetectOptions,
  type LoadOptions,
  type ModelAdapter,
} from './adapter'

export type CocoBase = 'lite_mobilenet_v2' | 'mobilenet_v2' | 'mobilenet_v1'

const WEIGHTS_BASE = 'https://storage.googleapis.com/tfjs-models/savedmodel'

/**
 * Artifact path. The coco-ssd package spells the lite variant 'ssdlite_...'
 * with no separating underscore and every other variant 'ssd_...'; this mirrors
 * getPrefix() in @tensorflow-models/coco-ssd 2.2.3. Getting it wrong produces a
 * 404 and, worse, an evaluation record pointing at weights that do not exist.
 */
export function artifactPrefix(base: CocoBase): string {
  return base === 'lite_mobilenet_v2' ? `ssd${base}` : `ssd_${base}`
}

/**
 * Total download size, measured on 2026-09-25 by summing model.json and the
 * Content-Length of every weight shard it lists. Not an estimate.
 */
const MEASURED_BYTES: Record<CocoBase, number | null> = {
  lite_mobilenet_v2: 18_561_843,
  mobilenet_v2: 67_771_262,
  mobilenet_v1: null,
}

interface CocoSsdDetection {
  bbox: [number, number, number, number]
  class: string
  score: number
}

interface CocoSsdModel {
  detect(
    input: CanvasImageSource,
    maxNumBoxes?: number,
    minScore?: number,
  ): Promise<CocoSsdDetection[]>
  dispose(): void
}

export function cocoSsdDescriptor(base: CocoBase): ModelDescriptor {
  return {
    id: `coco-ssd/${base}`,
    family: 'SSD (TensorFlow.js coco-ssd)',
    variant: base,
    artifactUrl: `${WEIGHTS_BASE}/${artifactPrefix(base)}/model.json`,
    // Served by a third-party CDN, so we cannot publish a checksum we verified.
    artifactHash: null,
    license: 'Apache-2.0 (tfjs-models); weights hosted by Google',
    inputResolution: 'native image size; the graph resizes internally to 300x300',
    channelOrder: 'RGB',
    normalization: 'uint8 [0,255] input; normalisation is baked into the graph',
    resizeBehavior: 'bilinear resize inside the SavedModel graph, aspect ratio not preserved',
    outputLayout: 'boxes in pixel coordinates [x, y, width, height] plus class label and score',
    classMapping: 'COCO 80 classes, mapped to label strings by the coco-ssd package',
    nmsBehavior: 'non-max suppression applied by the coco-ssd package',
    approximateDownloadBytes: MEASURED_BYTES[base],
  }
}

const PREPROCESSING: PreprocessingConfig = {
  resize: 'handled inside the coco-ssd graph (bilinear to 300x300, aspect ratio not preserved)',
  inputWidth: 300,
  inputHeight: 300,
  channelOrder: 'RGB',
  normalization: 'uint8 [0,255]; scaling baked into the graph',
}

export class CocoSsdAdapter implements ModelAdapter {
  readonly descriptor: ModelDescriptor
  readonly preprocessing = PREPROCESSING
  private model: CocoSsdModel | null = null
  private backendName = 'not loaded'
  private loading: Promise<void> | null = null
  private readonly base: CocoBase

  constructor(base: CocoBase = 'lite_mobilenet_v2') {
    this.base = base
    this.descriptor = cocoSsdDescriptor(base)
  }

  isLoaded(): boolean {
    return this.model !== null
  }

  backend(): string {
    return this.backendName
  }

  async load(options: LoadOptions = {}): Promise<void> {
    if (this.model) return
    if (this.loading) return this.loading

    this.loading = (async () => {
      try {
        assertNotAborted(options.signal)
        options.onProgress?.(null, 'Loading the TensorFlow.js runtime')
        const tf = await import('@tensorflow/tfjs')
        assertNotAborted(options.signal)

        // WebGL where available, CPU as a fallback. No WASM threads and no
        // SharedArrayBuffer, because GitHub Pages does not set the
        // cross-origin isolation headers those need.
        try {
          await tf.setBackend('webgl')
          await tf.ready()
        } catch {
          await tf.setBackend('cpu')
          await tf.ready()
        }
        this.backendName = tf.getBackend()

        options.onProgress?.(
          null,
          `Downloading model weights (~${formatBytes(this.descriptor.approximateDownloadBytes)})`,
        )
        const cocoSsd = await import('@tensorflow-models/coco-ssd')
        assertNotAborted(options.signal)
        this.model = (await cocoSsd.load({ base: this.base })) as unknown as CocoSsdModel
        options.onProgress?.(1, 'Model ready')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        throw new ModelLoadError(
          `Could not load ${this.descriptor.id}. The weights are downloaded from storage.googleapis.com; check the network connection and any content blocker. (${describe(error)})`,
          error,
        )
      } finally {
        this.loading = null
      }
    })()
    return this.loading
  }

  async detect(input: CanvasImageSource, options: DetectOptions): Promise<Detection[]> {
    const model = this.model
    if (!model) throw new InferenceError('Model is not loaded')
    assertNotAborted(options.signal)
    try {
      const raw = await model.detect(input, options.maxDetections, options.minScore)
      return raw.map((d) => ({
        label: d.class,
        score: d.score,
        box: { x: d.bbox[0], y: d.bbox[1], width: d.bbox[2], height: d.bbox[3] },
      }))
    } catch (error) {
      throw new InferenceError(`Inference failed: ${describe(error)}`, error)
    }
  }

  dispose(): void {
    this.model?.dispose()
    this.model = null
    this.backendName = 'not loaded'
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
