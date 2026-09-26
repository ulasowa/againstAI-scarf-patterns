import { describe, expect, it } from 'vitest'
import { createProject, currentEvaluations, currentHash, evidenceStatus, staleEvaluations } from './project'
import { createGrid } from './grid'
import type { EvaluationRecord, KnittingProject } from '../../types/project'

function recordFor(project: KnittingProject, overrides: Partial<EvaluationRecord> = {}) {
  return {
    id: 'eval_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    patternHash: currentHash(project),
    ...overrides,
  } as EvaluationRecord
}

describe('evaluation staleness', () => {
  it('starts as an untested procedural candidate', () => {
    expect(evidenceStatus(createProject())).toBe('procedural-untested')
  })

  it('treats a record for the current chart as current', () => {
    const project = createProject()
    const withRecord = { ...project, evaluations: [recordFor(project)] }
    expect(currentEvaluations(withRecord)).toHaveLength(1)
    expect(staleEvaluations(withRecord)).toHaveLength(0)
    expect(evidenceStatus(withRecord)).toBe('evaluated-current')
  })

  it('marks results stale as soon as a stitch changes', () => {
    const project = createProject()
    const withRecord = { ...project, evaluations: [recordFor(project)] }
    const edited = createGrid(project.grid.stitches, project.grid.rows)
    edited.cells[10] = 2
    const afterEdit = { ...withRecord, grid: edited }

    expect(currentEvaluations(afterEdit)).toHaveLength(0)
    expect(staleEvaluations(afterEdit)).toHaveLength(1)
    expect(evidenceStatus(afterEdit)).toBe('evaluated-stale')
    // The record is kept in history, it is simply no longer current.
    expect(afterEdit.evaluations).toHaveLength(1)
  })

  it('marks results stale when only the gauge changes', () => {
    const project = createProject()
    const withRecord = { ...project, evaluations: [recordFor(project)] }
    const afterGauge = { ...withRecord, gauge: { stitchesPer10cm: 24, rowsPer10cm: 32 } }
    expect(evidenceStatus(afterGauge)).toBe('evaluated-stale')
  })

  it('reports a model-selected chart distinctly', () => {
    const project = createProject()
    const selected = {
      ...project,
      evaluations: [
        recordFor(project, {
          search: { searchId: 's', candidateCount: 8, seed: 1, objective: 'o' },
        }),
      ],
    }
    expect(evidenceStatus(selected)).toBe('selected-by-model')
  })
})
