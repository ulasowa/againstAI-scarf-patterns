/**
 * Project file schema.
 *
 * Imports are untrusted input: a project file can come from anywhere. Every
 * field is validated, dimensions are bounded, and palette indices are checked
 * against the palette before the project is accepted.
 */
import { z } from 'zod'
import { SCHEMA_VERSION } from '../types/project'
import { MAX_CELLS, MAX_ROWS, MAX_STITCHES } from '../features/chart/grid'

export const PROJECT_FORMAT = 'adversarial-knit-lab.project'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be #rrggbb')

const paletteEntry = z.object({
  id: z.string().min(1).max(64),
  hex,
  symbol: z.string().max(3),
  name: z.string().min(1).max(80),
  yarnNote: z.string().max(400).optional(),
  locked: z.boolean().optional(),
})

const gauge = z.object({
  stitchesPer10cm: z.number().positive().max(200),
  rowsPer10cm: z.number().positive().max(200),
})

const repeatSize = z.object({
  stitches: z.number().int().min(1).max(MAX_STITCHES),
  rows: z.number().int().min(1).max(MAX_ROWS),
})

const generatorParams = z.object({
  featureSize: z.number().min(0.1).max(200),
  detailBalance: z.number().min(0).max(1),
  contrast: z.number().min(0).max(1),
  density: z.number().min(0).max(1),
  warp: z.number().min(0).max(4),
  symmetry: z.number().min(0).max(1),
  minRegion: z.number().min(0).max(100),
  tileRepeat: z.boolean(),
  variant: z.string().min(1).max(64),
})

const generatorSettings = z.object({
  family: z.enum([
    'high-frequency',
    'multiscale-interference',
    'contour-network',
    'chromatic-shock',
    'imported-image',
  ]),
  version: z.string().min(1).max(32),
  seed: z.number().int(),
  params: generatorParams,
})

const encodedGrid = z.object({
  stitches: z.number().int().min(1).max(MAX_STITCHES),
  rows: z.number().int().min(1).max(MAX_ROWS),
  encoding: z.literal('rle-v1'),
  cells: z.string().max(4_000_000),
})

const analysisOptions = z.object({
  longFloatThreshold: z.number().int().min(2).max(100),
  isolatedRegionThreshold: z.number().int().min(0).max(100),
  maxColorsPerRow: z.number().int().min(1).max(16),
})

const sourceImage = z.object({
  fileName: z.string().max(260),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  contentHash: z.string().max(64),
  sourceUrl: z.string().max(2048).optional(),
  license: z.string().max(400).optional(),
  attribution: z.string().max(400).optional(),
  importedAt: z.string().max(40),
})

/**
 * Evaluation records are stored as-is. They are provenance, not executable
 * configuration, so they are bounded rather than re-derived field by field.
 */
const evaluationRecord = z.looseObject({
  id: z.string().max(80),
  createdAt: z.string().max(40),
  patternHash: z.string().max(64),
})

export const projectFileSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  project: z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(200),
    createdAt: z.string().max(40),
    modifiedAt: z.string().max(40),
    generator: generatorSettings.nullable(),
    grid: encodedGrid,
    palette: z.array(paletteEntry).min(1).max(64),
    gauge,
    workingMethod: z.enum([
      'flat-stranded',
      'circular-stranded',
      'intarsia',
      'duplicate-stitch',
    ]),
    repeat: repeatSize,
    analysisOptions,
    sourceImage: sourceImage.optional(),
    placement: z
      .object({ note: z.string().max(400), region: z.string().max(120).optional() })
      .optional(),
    evaluations: z.array(evaluationRecord).max(500),
  }),
  /** Only present when the user explicitly chose to include images. */
  images: z
    .array(
      z.object({
        id: z.string().max(80),
        fileName: z.string().max(260),
        dataUrl: z.string().max(12_000_000),
      }),
    )
    .max(20)
    .optional(),
})

export type ProjectFile = z.infer<typeof projectFileSchema>

/** Extra checks the schema cannot express. */
export function validateCellBudget(stitches: number, rows: number): void {
  if (stitches * rows > MAX_CELLS) {
    throw new Error(
      `This project declares ${stitches * rows} stitches, above the ${MAX_CELLS} limit.`,
    )
  }
}
