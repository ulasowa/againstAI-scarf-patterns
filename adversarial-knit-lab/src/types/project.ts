/**
 * Core data model.
 *
 * The stitch grid is the source of truth for a knitting project. Every other
 * view (chart canvas, gauge-correct preview, fabric illustration, evaluation
 * texture, PDF, SVG) is derived from it.
 *
 * Coordinate convention — fixed, and relied on by the whole codebase:
 *   - Internal row 0 is the BOTTOM chart row (the first row worked).
 *   - Internal column 0 is the LEFTMOST chart column as viewed from the right
 *     side of the fabric.
 *   - Renderers convert to top-origin canvas coordinates.
 *   - Written instructions use working direction, not raw storage order.
 */

export const SCHEMA_VERSION = 1

/** Bumped whenever generator output changes for the same parameters. */
export const GENERATOR_VERSION = '1.0.0'

/**
 * Pattern families, named for the structural property they target rather than
 * for any claimed effect. See features/generator/families.ts.
 */
export type PatternFamily =
  | 'high-frequency'
  | 'multiscale-interference'
  | 'contour-network'
  | 'chromatic-shock'
  | 'imported-image'

export type WorkingMethod =
  | 'flat-stranded'
  | 'circular-stranded'
  | 'intarsia'
  | 'duplicate-stitch'

export interface PaletteEntry {
  /** Stable across edits; evaluation records and cells refer to positions, notes refer to ids. */
  id: string
  /** Display colour. On-screen RGB is an approximation of yarn, never a match. */
  hex: string
  /** Chart symbol for black-and-white printing. Single short glyph. */
  symbol: string
  name: string
  yarnNote?: string
  /** A locked colour is preserved by regeneration and by palette reduction. */
  locked?: boolean
}

export interface Gauge {
  stitchesPer10cm: number
  rowsPer10cm: number
}

export interface RepeatSize {
  stitches: number
  rows: number
}

/**
 * Flattened stitch data. `cells[row * stitches + column]` is a palette index.
 * Row 0 is the bottom chart row.
 */
export interface StitchGrid {
  stitches: number
  rows: number
  cells: Uint8Array
}

export interface GeneratorParams {
  /** Approximate feature diameter in stitches. */
  featureSize: number
  /** 0 = only coarse structure, 1 = only fine detail. */
  detailBalance: number
  /** Threshold sharpness between palette bands. 0 = soft, 1 = hard. */
  contrast: number
  /** 0..1, share of the chart covered by non-background colours. */
  density: number
  /** 0..1 domain-warp strength. */
  warp: number
  /** 0..1 mirror probability per band, 0 disables symmetry. */
  symmetry: number
  /** Minimum region size in stitches used by the optional cleanup pass. 0 disables. */
  minRegion: number
  /** Only meaningful for 'repeat-tile' and 'geometric-interference'. */
  tileRepeat: boolean
  /** Sub-variant within a family. */
  variant: string
}

export interface GeneratorSettings {
  family: PatternFamily
  version: string
  seed: number
  params: GeneratorParams
}

export interface SourceImageMeta {
  fileName: string
  width: number
  height: number
  /** Hash of the decoded pixels, so a project can be matched to its source. */
  contentHash: string
  /** Free text supplied by the user. Not verified by this application. */
  sourceUrl?: string
  license?: string
  attribution?: string
  importedAt: string
}

export interface GarmentPlacementMeta {
  note: string
  /** Optional free-text description of where the motif sits on a garment. */
  region?: string
}

/* ------------------------------------------------------------------ *
 * Knitting analysis
 * ------------------------------------------------------------------ */

export interface RowColorUsage {
  /** Internal row index (0 = bottom). */
  row: number
  paletteIndices: number[]
}

export interface FloatSpan {
  row: number
  /** Inclusive internal column of the first stitch the yarn is carried over. */
  startColumn: number
  /** Inclusive internal column of the last stitch the yarn is carried over. */
  endColumn: number
  length: number
  /** Palette index of the yarn being carried (the one NOT worked here). */
  paletteIndex: number
  /** True when the span crosses the round boundary in circular knitting. */
  wrapsRoundBoundary: boolean
}

export interface IsolatedRegion {
  paletteIndex: number
  size: number
  /** One representative cell. */
  row: number
  column: number
}

export interface KnittingAnalysis {
  computedForHash: string
  totalColors: number
  rowColorUsage: RowColorUsage[]
  maxColorsInAnyRow: number
  /** Rows (internal indices) using more colours than the stranded limit allows. */
  rowsExceedingColorLimit: number[]
  /** Longest horizontal run of a single colour, per row, maximum over rows. */
  longestColorRun: number
  floats: FloatSpan[]
  longestFloat: number
  /** Floats longer than the configured warning threshold. */
  longFloats: FloatSpan[]
  isolatedRegions: IsolatedRegion[]
  repeat: {
    fitsHorizontally: boolean
    fitsVertically: boolean
    horizontalRemainder: number
    verticalRemainder: number
    /** Columns where the pattern does not join smoothly across the tile seam. */
    seamMismatchColumns: number
    seamMismatchRows: number
  }
  warnings: AnalysisWarning[]
}

export interface AnalysisWarning {
  id: string
  severity: 'info' | 'warning'
  message: string
}

export interface AnalysisOptions {
  /** Floats at or above this length raise a warning. Configurable, not universal. */
  longFloatThreshold: number
  /** Regions at or below this stitch count count as isolated. */
  isolatedRegionThreshold: number
  /** Stranded colourwork limit. Applied only to stranded working methods. */
  maxColorsPerRow: number
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  longFloatThreshold: 7,
  isolatedRegionThreshold: 2,
  maxColorsPerRow: 2,
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

/** What was composited into the garment region for one measured condition. */
export type ConditionKind = 'original' | 'solid' | 'control-pattern' | 'chart-pattern'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface Detection {
  label: string
  score: number
  box: BoundingBox
}

export interface RenderParams {
  /** Stitches per rendered texture pixel block. */
  cellPixels: number
  /** Gauge used when rendering, since row aspect changes the texture. */
  gauge: Gauge
  /** Chart decorations are never included in evaluation renders. */
  decorations: false
  /** Repeat used to fill the garment region. */
  repeat: RepeatSize
  /** Fabric illustration on/off for the evaluated texture. */
  fabricShading: boolean
}

export interface ModelDescriptor {
  id: string
  family: string
  variant: string
  artifactUrl: string
  /** Checksum when the artifact is served by us; null for third-party CDN artifacts. */
  artifactHash: string | null
  license: string
  inputResolution: string
  channelOrder: 'RGB' | 'BGR'
  normalization: string
  resizeBehavior: string
  outputLayout: string
  classMapping: string
  nmsBehavior: string
  approximateDownloadBytes: number | null
}

export interface PreprocessingConfig {
  /** Resize path used to feed the model. Must be identical across conditions. */
  resize: string
  inputWidth: number | null
  inputHeight: number | null
  channelOrder: 'RGB' | 'BGR'
  normalization: string
}

export interface TransformSettings {
  enabled: boolean
  seed: number
  samplesPerImage: number
  /** Applied to the garment texture before compositing. */
  placement: {
    scale: [number, number]
    rotationDegrees: [number, number]
    perspective: number
  }
  /** Applied to the whole image after compositing. */
  camera: {
    brightness: [number, number]
    contrast: [number, number]
    blurPx: [number, number]
    jpegQuality: [number, number]
  }
  occlusion: {
    enabled: boolean
    maxFraction: number
  }
}

export interface EvalImageRef {
  id: string
  fileName: string
  /** Hash of the decoded pixels; the image itself stays in the browser. */
  contentHash: string
  width: number
  height: number
  split: 'optimization' | 'holdout'
  /** Annotated target person. */
  targetBox: BoundingBox
  /** Garment region as a quadrilateral, clockwise from top-left. */
  garmentQuad: [number, number][]
}

export interface ConditionMeasurement {
  condition: ConditionKind
  /** Null when inference failed; distinct from "not detected at threshold". */
  matched: Detection | null
  /** True when inference ran successfully. */
  inferenceOk: boolean
  failureReason?: string
  /** All person detections returned, for auditing the matching rule. */
  candidates: Detection[]
}

export interface PerExampleResult {
  imageId: string
  split: 'optimization' | 'holdout'
  transformIndex: number
  transformSeed: number
  conditions: ConditionMeasurement[]
}

export interface AggregateMetrics {
  eligibleExamples: number
  excludedExamples: number
  /** Per condition. */
  byCondition: Record<
    string,
    {
      detectionRetention: number | null
      conditionalMissRate: number | null
      baselineDetectedCount: number
      detectedCount: number
      meanMatchedScore: number | null
      meanScoreDelta: number | null
      observableDeltaCount: number
    }
  >
}

export interface EvaluationRecord {
  id: string
  createdAt: string
  /** Chart content this was measured on. Compare with the live hash for staleness. */
  patternHash: string
  renderParams: RenderParams
  model: ModelDescriptor
  preprocessing: PreprocessingConfig
  thresholds: {
    /** Detections below this are not reported. */
    detection: number
    /** IoU required to match a detection to the annotated target. */
    matchIou: number
  }
  images: EvalImageRef[]
  transforms: TransformSettings
  /** Baseline conditions measured alongside the chart pattern. */
  conditions: ConditionKind[]
  perExample: PerExampleResult[]
  aggregate: AggregateMetrics
  runtime: {
    backend: string
    userAgent: string
    durationMs: number
  }
  failures: string[]
  /** Set when the holdout split has been used to pick between candidates. */
  holdoutUsedForSelection: boolean
  /** Provenance when this record came out of a candidate search. */
  search?: {
    searchId: string
    candidateCount: number
    seed: number
    objective: string
  }
}

/* ------------------------------------------------------------------ *
 * Project
 * ------------------------------------------------------------------ */

export interface KnittingProject {
  schemaVersion: number
  id: string
  title: string
  createdAt: string
  modifiedAt: string
  generator: GeneratorSettings | null
  grid: StitchGrid
  palette: PaletteEntry[]
  gauge: Gauge
  workingMethod: WorkingMethod
  repeat: RepeatSize
  analysisOptions: AnalysisOptions
  sourceImage?: SourceImageMeta
  placement?: GarmentPlacementMeta
  analysis?: KnittingAnalysis
  evaluations: EvaluationRecord[]
}

/** Evidence labels. "Evaluated" never implies "effective". */
export type EvidenceStatus =
  | 'procedural-untested'
  | 'evaluated-current'
  | 'evaluated-stale'
  | 'selected-by-model'
  | 'physical-observed'
