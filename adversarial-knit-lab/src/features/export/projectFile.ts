/**
 * Project import and export.
 *
 * The exported file round-trips every editable part of a project. Imported
 * photographs are only included when the user explicitly asks, because they are
 * the one thing in this application that might contain a person's face.
 */
import type { KnittingProject } from '../../types/project'
import { SCHEMA_VERSION } from '../../types/project'
import { decodeCells, encodeCells, paletteIndicesValid } from '../chart/grid'
import { PROJECT_FORMAT, projectFileSchema, validateCellBudget } from '../../schemas/project'
import { z } from 'zod'

export interface ExportedImage {
  id: string
  fileName: string
  dataUrl: string
}

export function serializeProject(
  project: KnittingProject,
  images?: ExportedImage[],
): string {
  const payload = {
    format: PROJECT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: project.id,
      title: project.title,
      createdAt: project.createdAt,
      modifiedAt: project.modifiedAt,
      generator: project.generator,
      grid: {
        stitches: project.grid.stitches,
        rows: project.grid.rows,
        encoding: 'rle-v1' as const,
        cells: encodeCells(project.grid),
      },
      palette: project.palette,
      gauge: project.gauge,
      workingMethod: project.workingMethod,
      repeat: project.repeat,
      analysisOptions: project.analysisOptions,
      ...(project.sourceImage ? { sourceImage: project.sourceImage } : {}),
      ...(project.placement ? { placement: project.placement } : {}),
      evaluations: project.evaluations,
    },
    ...(images && images.length > 0 ? { images } : {}),
  }
  return JSON.stringify(payload, null, 2)
}

export interface ImportResult {
  project: KnittingProject
  images: ExportedImage[]
}

export function deserializeProject(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  const parsed = projectFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`That file is not a valid project: ${firstIssue(parsed.error)}`)
  }
  const file = parsed.data
  const { grid: encoded, ...rest } = file.project
  validateCellBudget(encoded.stitches, encoded.rows)

  const cells = decodeCells(encoded.cells, encoded.stitches, encoded.rows)
  const grid = { stitches: encoded.stitches, rows: encoded.rows, cells }

  if (!paletteIndicesValid(grid, file.project.palette.length)) {
    throw new Error(
      'That project refers to palette colours it does not define. It may have been edited by hand.',
    )
  }

  const project: KnittingProject = {
    schemaVersion: file.schemaVersion,
    ...rest,
    grid,
    // Records are provenance written by this application; the schema bounds
    // them, and anything hand-edited beyond that shape simply reads as stale.
    evaluations: file.project.evaluations as unknown as KnittingProject['evaluations'],
  }
  return { project, images: file.images ?? [] }
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'unknown problem'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
