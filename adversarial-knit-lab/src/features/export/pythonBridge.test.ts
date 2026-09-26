import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deserializeProject } from './projectFile'
import { analyzeChart } from '../knitting/analysis'
import { paletteIndicesValid } from '../chart/grid'

/**
 * Cross-language contract.
 *
 * The Python research companion writes the same project format this
 * application reads. The fixture below was produced by
 * `python -m akl.cli` (see research/README.md); if either side drifts, this
 * fails instead of the drift surfacing as a broken import for a user.
 */
const FIXTURE = '../research/tests/fixtures/python-export.json'

describe('research companion bridge', () => {
  it('imports a project written by the Python CLI', () => {
    const { project } = deserializeProject(readFileSync(FIXTURE, 'utf8'))

    expect(project.title).toBe('Research bridge fixture')
    expect(project.grid.stitches).toBe(40)
    expect(project.grid.rows).toBe(67)
    expect(project.generator?.family).toBe('imported-image')
    expect(project.repeat).toEqual({ stitches: 20, rows: 28 })
    expect(paletteIndicesValid(project.grid, project.palette.length)).toBe(true)
  })

  it('carries no measurements, whatever the optimiser reported', () => {
    const { project } = deserializeProject(readFileSync(FIXTURE, 'utf8'))
    // A figure measured on another model, before hard quantisation, does not
    // describe this chart. The bridge must never import one.
    expect(project.evaluations).toEqual([])
  })

  it('produces a chart the knitting analysis can read', () => {
    const { project } = deserializeProject(readFileSync(FIXTURE, 'utf8'))
    const analysis = analyzeChart({
      grid: project.grid,
      workingMethod: project.workingMethod,
      repeat: project.repeat,
      options: project.analysisOptions,
      contentHash: 'bridge',
    })
    expect(analysis.totalColors).toBeGreaterThanOrEqual(2)
    expect(analysis.rowColorUsage).toHaveLength(67)
  })
})
