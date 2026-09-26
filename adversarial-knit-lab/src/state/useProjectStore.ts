/**
 * Project state.
 *
 * React holds the project, the undo history and the derived analysis. All of
 * the mathematics and knitting-domain logic lives in features/* and lib/* and
 * is called from here; nothing domain-specific is implemented inside a
 * component.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnalysisOptions,
  EvaluationRecord,
  Gauge,
  GeneratorSettings,
  KnittingProject,
  PaletteEntry,
  RepeatSize,
  StitchGrid,
  WorkingMethod,
} from '../types/project'
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo as redoHistory,
  snapshot,
  undo as undoHistory,
  type History,
} from '../features/chart/history'
import { createProject, currentHash, evidenceStatus, touch } from '../features/chart/project'
import { PRESETS } from '../features/generator/presets'
import { generatePattern, makeSettings } from '../features/generator/generate'
import { cellAspect } from '../features/knitting/gauge'
import { analyzeChart } from '../features/knitting/analysis'
import { autosave, loadAutosave } from '../lib/persistence'

export interface ProjectStore {
  project: KnittingProject
  analysis: ReturnType<typeof analyzeChart>
  patternHash: string
  evidence: ReturnType<typeof evidenceStatus>
  canUndo: boolean
  canRedo: boolean
  storageWarning: string | null
  /** Replace the chart, recording an undo step. */
  commitGrid: (grid: StitchGrid, label: string) => void
  /** Replace chart and palette together, recording one undo step. */
  commitChart: (grid: StitchGrid, palette: PaletteEntry[], label: string) => void
  setPalette: (palette: PaletteEntry[]) => void
  setGauge: (gauge: Gauge) => void
  setRepeat: (repeat: RepeatSize) => void
  setWorkingMethod: (method: WorkingMethod) => void
  setTitle: (title: string) => void
  setAnalysisOptions: (options: AnalysisOptions) => void
  setGenerator: (settings: GeneratorSettings | null) => void
  setSourceImage: (meta: KnittingProject['sourceImage']) => void
  addEvaluation: (record: EvaluationRecord) => void
  replaceProject: (project: KnittingProject) => void
  undo: () => void
  redo: () => void
}

/**
 * The chart a first-time visitor lands on.
 *
 * An empty project renders as a solid block of the background colour, which
 * shows nothing about what the tool does. Starting from a preset means the
 * editor, the previews, the knitting analysis and the instructions all have
 * something real in them from the first frame. It is still an untested
 * procedural candidate, and the evidence badge says so.
 */
function createStarterProject(): KnittingProject {
  const preset = PRESETS[0]
  const base = createProject()
  if (!preset) return base

  const settings = makeSettings(preset.family, preset.seed, preset.params)
  const grid = generatePattern({
    settings,
    stitches: preset.stitches,
    rows: preset.rows,
    colorCount: Math.min(preset.colorCount, base.palette.length),
    repeat: preset.repeat,
    rowAspect: cellAspect(base.gauge),
  })
  return { ...base, title: preset.label, grid, generator: settings, repeat: preset.repeat }
}

export function useProjectStore(): ProjectStore {
  const [project, setProject] = useState<KnittingProject>(() => createStarterProject())
  const [history, setHistory] = useState<History>(() =>
    createHistory(snapshot(project.grid, project.palette, 'initial')),
  )
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const restored = useRef(false)

  // Mirror of the history, so undo/redo can compute the next state without
  // performing side effects inside a state updater (React may call an updater
  // more than once).
  const historyRef = useRef(history)
  useEffect(() => {
    historyRef.current = history
  }, [history])

  // Restore the autosave once, on first mount.
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void loadAutosave().then((saved) => {
      if (!saved) return
      setProject(saved)
      setHistory(createHistory(snapshot(saved.grid, saved.palette, 'restored')))
    })
  }, [])

  // Debounced autosave. A storage failure is surfaced, never silent.
  useEffect(() => {
    const timer = setTimeout(() => {
      void autosave(project).then((outcome) => {
        setStorageWarning(outcome.ok ? null : (outcome.error ?? 'Could not save locally.'))
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [project])

  const patternHash = useMemo(() => currentHash(project), [project])

  const analysis = useMemo(
    () =>
      analyzeChart({
        grid: project.grid,
        workingMethod: project.workingMethod,
        repeat: project.repeat,
        options: project.analysisOptions,
        contentHash: patternHash,
      }),
    [project.grid, project.workingMethod, project.repeat, project.analysisOptions, patternHash],
  )

  const evidence = useMemo(() => evidenceStatus(project), [project])

  const commitChart = useCallback((grid: StitchGrid, palette: PaletteEntry[], label: string) => {
    const next = pushHistory(historyRef.current, snapshot(grid, palette, label))
    historyRef.current = next
    setHistory(next)
    setProject((current) => touch({ ...current, grid, palette }))
  }, [])

  const commitGrid = useCallback(
    (grid: StitchGrid, label: string) => {
      commitChart(grid, historyRef.current.present.palette, label)
    },
    [commitChart],
  )

  const setPalette = useCallback(
    (palette: PaletteEntry[]) => {
      commitChart(historyRef.current.present.grid, palette, 'palette')
    },
    [commitChart],
  )

  const step = useCallback((direction: 'undo' | 'redo') => {
    const current = historyRef.current
    const guard = direction === 'undo' ? canUndo : canRedo
    if (!guard(current)) return
    const next = direction === 'undo' ? undoHistory(current) : redoHistory(current)
    historyRef.current = next
    setHistory(next)
    setProject((live) =>
      touch({ ...live, grid: next.present.grid, palette: next.present.palette }),
    )
  }, [])

  const undo = useCallback(() => step('undo'), [step])
  const redo = useCallback(() => step('redo'), [step])

  const replaceProject = useCallback((next: KnittingProject) => {
    const fresh = createHistory(snapshot(next.grid, next.palette, 'imported'))
    historyRef.current = fresh
    setHistory(fresh)
    setProject(next)
  }, [])

  return {
    project,
    analysis,
    patternHash,
    evidence,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    storageWarning,
    commitGrid,
    commitChart,
    setPalette,
    setGauge: (gauge) => setProject((current) => touch({ ...current, gauge })),
    setRepeat: (repeat) => setProject((current) => touch({ ...current, repeat })),
    setWorkingMethod: (workingMethod) =>
      setProject((current) => touch({ ...current, workingMethod })),
    setTitle: (title) => setProject((current) => touch({ ...current, title })),
    setAnalysisOptions: (analysisOptions) =>
      setProject((current) => touch({ ...current, analysisOptions })),
    setGenerator: (generator) => setProject((current) => touch({ ...current, generator })),
    setSourceImage: (sourceImage) => setProject((current) => touch({ ...current, sourceImage })),
    addEvaluation: (record) =>
      setProject((current) => touch({ ...current, evaluations: [record, ...current.evaluations] })),
    replaceProject,
    undo,
    redo,
  }
}
