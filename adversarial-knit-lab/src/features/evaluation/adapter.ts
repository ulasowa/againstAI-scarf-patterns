/**
 * Shared model-adapter interface.
 *
 * Everything the evaluation pipeline knows about a detector goes through this
 * interface, so adding a second model means writing one adapter and nothing
 * else. Adapters are responsible for their own preprocessing and output
 * decoding, and must describe both in their descriptor.
 */
import type { Detection, ModelDescriptor, PreprocessingConfig } from '../../types/project'

export interface LoadOptions {
  /** 0..1 where known, otherwise called with null for indeterminate progress. */
  onProgress?: (fraction: number | null, message: string) => void
  signal?: AbortSignal
}

export interface DetectOptions {
  /** Detections below this score are not returned. */
  minScore: number
  maxDetections: number
  signal?: AbortSignal
}

export interface ModelAdapter {
  readonly descriptor: ModelDescriptor
  readonly preprocessing: PreprocessingConfig
  isLoaded(): boolean
  load(options?: LoadOptions): Promise<void>
  /** Runs inference. Throws on failure; never silently returns an empty list. */
  detect(input: CanvasImageSource, options: DetectOptions): Promise<Detection[]>
  /** Backend actually in use, known only after load. */
  backend(): string
  dispose(): void
}

export class ModelLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ModelLoadError'
  }
}

export class InferenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'InferenceError'
  }
}

export function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError')
}
