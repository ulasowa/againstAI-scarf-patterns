import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets'
import { generatePattern, makeSettings } from './generate'
import { analyzeChart } from '../knitting/analysis'
import { DEFAULT_ANALYSIS_OPTIONS } from '../../types/project'
import { cellAspect } from '../knitting/gauge'
import { DEFAULT_GAUGE } from '../chart/project'

/**
 * Each preset's description quotes measured knitting properties. These tests
 * hold the description to them: if generation changes, this fails instead of
 * leaving the interface making a claim that is no longer true.
 */
describe('preset descriptions match the charts they produce', () => {
  for (const preset of PRESETS) {
    it(preset.id, () => {
      const grid = generatePattern({
        settings: makeSettings(preset.family, preset.seed, preset.params),
        stitches: preset.stitches,
        rows: preset.rows,
        colorCount: preset.colorCount,
        repeat: preset.repeat,
        rowAspect: cellAspect(DEFAULT_GAUGE),
      })
      expect(grid.stitches).toBe(preset.stitches)
      expect(grid.rows).toBe(preset.rows)

      const analysis = analyzeChart({
        grid,
        workingMethod: 'flat-stranded',
        repeat: preset.repeat,
        options: DEFAULT_ANALYSIS_OPTIONS,
        contentHash: 'preset',
      })
      expect(analysis.totalColors).toBe(preset.measured.colors)
      expect(analysis.maxColorsInAnyRow).toBe(preset.measured.maxColorsInAnyRow)
      expect(analysis.longestFloat).toBe(preset.measured.longestFloat)
      expect(analysis.rowsExceedingColorLimit.length).toBe(preset.measured.rowsOverTwoColorLimit)
    })
  }

  it('tiling presets produce a genuinely periodic chart', () => {
    for (const preset of PRESETS.filter((p) => p.params.tileRepeat)) {
      const grid = generatePattern({
        settings: makeSettings(preset.family, preset.seed, preset.params),
        stitches: preset.stitches,
        rows: preset.rows,
        colorCount: preset.colorCount,
        repeat: preset.repeat,
        rowAspect: cellAspect(DEFAULT_GAUGE),
      })
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.stitches; c++) {
          const tiled =
            grid.cells[(r % preset.repeat.rows) * grid.stitches + (c % preset.repeat.stitches)]
          expect(grid.cells[r * grid.stitches + c], `${preset.id} at ${r},${c}`).toBe(tiled)
        }
      }
    }
  })
})
