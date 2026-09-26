import { describe, expect, it } from 'vitest'
import { EXAMPLE_PROJECTS } from '../../examples'
import { deserializeProject } from './projectFile'
import { analyzeChart } from '../knitting/analysis'
import { paletteIndicesValid } from '../chart/grid'

/**
 * The examples are bundled rather than fetched, so a broken one is a build-time
 * problem rather than a runtime error in front of a user. They are still parsed
 * here through the real import path.
 */
describe('example projects', () => {
  it('ships a distinct set with usable descriptions', () => {
    expect(EXAMPLE_PROJECTS.length).toBeGreaterThanOrEqual(5)
    const ids = EXAMPLE_PROJECTS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of EXAMPLE_PROJECTS) {
      expect(entry.description.length).toBeGreaterThan(20)
      expect(entry.title.length).toBeGreaterThan(3)
    }
  })

  for (const entry of EXAMPLE_PROJECTS) {
    it(`${entry.id} parses and is internally consistent`, () => {
      const { project } = deserializeProject(JSON.stringify(entry.file))

      expect(project.title).toBe(entry.title)
      expect(project.generator).not.toBeNull()
      expect(paletteIndicesValid(project.grid, project.palette.length)).toBe(true)
      expect(project.grid.stitches).toBeGreaterThan(0)
      expect(project.grid.rows).toBeGreaterThan(0)
      expect(project.gauge.stitchesPer10cm).toBeGreaterThan(0)

      // Shipped examples carry no measurements: they are untested candidates.
      expect(project.evaluations).toEqual([])

      const analysis = analyzeChart({
        grid: project.grid,
        workingMethod: project.workingMethod,
        repeat: project.repeat,
        options: project.analysisOptions,
        contentHash: 'example',
      })
      expect(analysis.totalColors).toBeGreaterThanOrEqual(1)
      expect(analysis.totalColors).toBeLessThanOrEqual(project.palette.length)
    })
  }
})
