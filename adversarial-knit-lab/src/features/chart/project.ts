/** Project construction, defaults and evidence status. */
import {
  DEFAULT_ANALYSIS_OPTIONS,
  SCHEMA_VERSION,
  type EvidenceStatus,
  type Gauge,
  type KnittingProject,
  type PaletteEntry,
  type StitchGrid,
} from '../../types/project'
import { newId, nowIso } from '../../lib/id'
import { chartContentHash, createGrid } from './grid'

/**
 * A restrained default palette: one background plus three contrast yarns.
 *
 * Every pair is at least 1.8:1 apart in contrast, checked by
 * palettes.test.ts. An earlier version had Lichen and Madder at 1.23, which
 * looks fine on a chart and reads as a single colour in fabric from two metres.
 *
 * These are display approximations, not yarn matches.
 */
export const DEFAULT_PALETTE: PaletteEntry[] = [
  { id: 'c1', hex: '#1b1d1c', symbol: '.', name: 'Charcoal' },
  { id: 'c2', hex: '#e8e3d6', symbol: 'o', name: 'Undyed' },
  { id: 'c3', hex: '#9aa08d', symbol: '/', name: 'Lichen' },
  { id: 'c4', hex: '#b4522f', symbol: 'x', name: 'Madder' },
]

/** Worsted-weight stranded colourwork is a reasonable starting point. */
export const DEFAULT_GAUGE: Gauge = { stitchesPer10cm: 20, rowsPer10cm: 28 }

export const DEFAULT_STITCHES = 64
export const DEFAULT_ROWS = 80

export function createProject(overrides: Partial<KnittingProject> = {}): KnittingProject {
  const grid: StitchGrid = overrides.grid ?? createGrid(DEFAULT_STITCHES, DEFAULT_ROWS)
  const now = nowIso()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('proj'),
    title: 'Untitled chart',
    createdAt: now,
    modifiedAt: now,
    generator: null,
    grid,
    palette: DEFAULT_PALETTE.map((p) => ({ ...p })),
    gauge: { ...DEFAULT_GAUGE },
    workingMethod: 'flat-stranded',
    repeat: { stitches: grid.stitches, rows: grid.rows },
    analysisOptions: { ...DEFAULT_ANALYSIS_OPTIONS },
    evaluations: [],
    ...overrides,
  }
}

export function currentHash(project: KnittingProject): string {
  return chartContentHash({
    grid: project.grid,
    palette: project.palette,
    gauge: project.gauge,
    workingMethod: project.workingMethod,
    repeat: project.repeat,
  })
}

/** Evaluation records whose pattern hash still matches the live chart. */
export function currentEvaluations(project: KnittingProject) {
  const hash = currentHash(project)
  return project.evaluations.filter((record) => record.patternHash === hash)
}

export function staleEvaluations(project: KnittingProject) {
  const hash = currentHash(project)
  return project.evaluations.filter((record) => record.patternHash !== hash)
}

/**
 * Evidence label for the chart as it stands.
 *
 * "Evaluated" means measurements exist for this exact chart on a named model.
 * It never means the pattern works.
 */
export function evidenceStatus(project: KnittingProject): EvidenceStatus {
  const current = currentEvaluations(project)
  if (current.length === 0) {
    return project.evaluations.length > 0 ? 'evaluated-stale' : 'procedural-untested'
  }
  if (current.some((r) => r.search !== undefined)) return 'selected-by-model'
  return 'evaluated-current'
}

export const EVIDENCE_LABELS: Record<EvidenceStatus, string> = {
  'procedural-untested': 'Procedural candidate — untested',
  'evaluated-current': 'Evaluated on a local model',
  'evaluated-stale': 'Edited since last evaluation — previous results are stale',
  'selected-by-model': 'Selected using a local model',
  'physical-observed': 'Physical swatch photographs evaluated',
}

export const EVIDENCE_HINTS: Record<EvidenceStatus, string> = {
  'procedural-untested':
    'This pattern has not been measured against any model. Appearance alone is not evidence.',
  'evaluated-current':
    'Measurements exist for this exact chart. "Evaluated" describes what was measured, not whether the pattern works.',
  'evaluated-stale':
    'The chart, palette, gauge or repeat changed after these results were recorded. They are kept in history but do not describe the current chart.',
  'selected-by-model':
    'A search ranked candidates using model output. Selection on one model and one image set does not generalise.',
  'physical-observed':
    'Photographs of knitted fabric were measured. Photographic conditions are not controlled by this application.',
}

export function touch(project: KnittingProject): KnittingProject {
  return { ...project, modifiedAt: nowIso() }
}
