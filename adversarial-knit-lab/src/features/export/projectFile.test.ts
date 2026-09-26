import { describe, expect, it } from 'vitest'
import { deserializeProject, serializeProject } from './projectFile'
import { createProject } from '../chart/project'
import { createGrid } from '../chart/grid'
import { makeSettings } from '../generator/generate'
import { paramsForFamily } from '../generator/families'

function sampleProject() {
  const grid = createGrid(12, 9)
  for (let i = 0; i < grid.cells.length; i++) grid.cells[i] = i % 4
  return {
    ...createProject({ grid }),
    title: 'Round trip <chart> & "quotes"',
    generator: makeSettings('contour-network', 4242, paramsForFamily('contour-network')),
    repeat: { stitches: 6, rows: 3 },
    workingMethod: 'circular-stranded' as const,
    gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 },
  }
}

describe('project file round trip', () => {
  it('restores every editable field', () => {
    const project = sampleProject()
    const { project: restored } = deserializeProject(serializeProject(project))

    expect(restored.title).toBe(project.title)
    expect(restored.id).toBe(project.id)
    expect(restored.gauge).toEqual(project.gauge)
    expect(restored.repeat).toEqual(project.repeat)
    expect(restored.workingMethod).toBe(project.workingMethod)
    expect(restored.generator).toEqual(project.generator)
    expect(restored.palette).toEqual(project.palette)
    expect(restored.grid.stitches).toBe(project.grid.stitches)
    expect(restored.grid.rows).toBe(project.grid.rows)
    expect(Array.from(restored.grid.cells)).toEqual(Array.from(project.grid.cells))
  })

  it('does not include photographs unless they are passed in', () => {
    const text = serializeProject(sampleProject())
    expect(text).not.toContain('"images"')
    const withImages = serializeProject(sampleProject(), [
      { id: 'i1', fileName: 'a.png', dataUrl: 'data:image/png;base64,AAAA' },
    ])
    expect(withImages).toContain('"images"')
  })

  it('rejects a file that is not JSON', () => {
    expect(() => deserializeProject('not json at all')).toThrow(/not valid JSON/)
  })

  it('rejects a file with the wrong format marker', () => {
    expect(() => deserializeProject('{"format":"something-else"}')).toThrow(/not a valid project/)
  })

  it('rejects a chart with a palette index it does not define', () => {
    const project = sampleProject()
    const text = serializeProject(project)
    // Point every stitch at a colour beyond the palette.
    const broken = text.replace(/"cells": "[^"]*"/, '"cells": "9x108"')
    expect(() => deserializeProject(broken)).toThrow(/palette colours it does not define/)
  })

  it('rejects an oversized chart', () => {
    const project = sampleProject()
    const text = serializeProject(project)
    const broken = text
      .replace(/"stitches": 12/, '"stitches": 5000')
      .replace(/"rows": 9,/, '"rows": 5000,')
    expect(() => deserializeProject(broken)).toThrow()
  })

  it('rejects an invalid colour value', () => {
    const project = sampleProject()
    const broken = serializeProject(project).replace(/"hex": "#[0-9a-f]{6}"/, '"hex": "red"')
    expect(() => deserializeProject(broken)).toThrow(/#rrggbb/)
  })
})
