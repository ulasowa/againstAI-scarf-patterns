/**
 * Starting points.
 *
 * Each preset is a procedural candidate built in the structural vocabulary
 * described in families.ts. None of them is a published pattern, none of them
 * reproduces a published attack, and none is known to affect any model. The
 * `measured` block below is knitting data, not evidence of anything else.
 *
 * To find out what a model makes of one, probe it in the Generate tab.
 */
import type { GeneratorParams, PatternFamily } from '../../types/project'
import { paramsForFamily } from './families'

export interface Preset {
  id: string
  label: string
  description: string
  /**
   * Measured properties of the chart this preset produces, asserted by
   * presets.test.ts. If the generator changes, the test fails rather than
   * leaving a description that quietly stops being true.
   */
  measured: {
    colors: number
    maxColorsInAnyRow: number
    longestFloat: number
    rowsOverTwoColorLimit: number
  }
  family: PatternFamily
  seed: number
  stitches: number
  rows: number
  repeat: { stitches: number; rows: number }
  colorCount: number
  params: GeneratorParams
}

export const PRESETS: Preset[] = [
  {
    id: 'octave-stack',
    label: 'Octave stack',
    description:
      'Coarse, medium and fine structure at equal strength, so no shape size dominates. Four colours in every row and floats up to 31 stitches: apply the per-row colour repair in the Knit tab before knitting this stranded.',
    measured: { colors: 4, maxColorsInAnyRow: 4, longestFloat: 31, rowsOverTwoColorLimit: 80 },
    family: 'multiscale-interference',
    seed: 481_502,
    stitches: 64,
    rows: 80,
    repeat: { stitches: 32, rows: 40 },
    colorCount: 4,
    params: {
      ...paramsForFamily('multiscale-interference'),
      variant: 'octave-stack',
      featureSize: 8,
      detailBalance: 0.5,
      contrast: 0.6,
      density: 0.5,
      warp: 0.3,
      symmetry: 0,
      minRegion: 0,
      tileRepeat: true,
    },
  },
  {
    id: 'dense-contours',
    label: 'Dense contour network',
    description:
      'Closely spaced level sets, like a contour map with no terrain. Two colours, every row within the stranded limit, but the open ground between lines gives floats up to 31 stitches.',
    measured: { colors: 2, maxColorsInAnyRow: 2, longestFloat: 31, rowsOverTwoColorLimit: 0 },
    family: 'contour-network',
    seed: 9_120_034,
    stitches: 64,
    rows: 80,
    repeat: { stitches: 32, rows: 40 },
    colorCount: 2,
    params: {
      ...paramsForFamily('contour-network'),
      variant: 'dense-rings',
      featureSize: 5,
      detailBalance: 0.35,
      contrast: 0.75,
      density: 0.5,
      warp: 0.35,
      symmetry: 0,
      minRegion: 0,
      tileRepeat: true,
    },
  },
  {
    id: 'broken-contours',
    label: 'Broken contours',
    description:
      'Rings cut by a second field, so no line ever closes. Two colours and no row over the stranded limit; floats reach 31 stitches across the gaps.',
    measured: { colors: 2, maxColorsInAnyRow: 2, longestFloat: 31, rowsOverTwoColorLimit: 0 },
    family: 'contour-network',
    seed: 77_301,
    stitches: 64,
    rows: 80,
    repeat: { stitches: 32, rows: 40 },
    // The contour field is binary, so a third colour would never be reached.
    colorCount: 2,
    params: {
      ...paramsForFamily('contour-network'),
      variant: 'broken-contours',
      featureSize: 6,
      detailBalance: 0.4,
      contrast: 0.7,
      density: 0.55,
      warp: 0.3,
      symmetry: 0,
      minRegion: 0,
      tileRepeat: true,
    },
  },
  {
    id: 'angular-shards',
    label: 'Angular shards',
    description:
      'Hard cell boundaries with no gradient anywhere. Four colours, 34 of 80 rows over the stranded limit, longest float 31 stitches.',
    measured: { colors: 4, maxColorsInAnyRow: 4, longestFloat: 31, rowsOverTwoColorLimit: 34 },
    family: 'chromatic-shock',
    seed: 2_048_811,
    stitches: 64,
    rows: 80,
    repeat: { stitches: 32, rows: 40 },
    colorCount: 4,
    params: {
      ...paramsForFamily('chromatic-shock'),
      variant: 'shards',
      featureSize: 7,
      detailBalance: 0.4,
      contrast: 0.9,
      density: 0.5,
      warp: 0.15,
      symmetry: 0,
      minRegion: 0,
      tileRepeat: true,
    },
  },
  {
    id: 'micro-checks',
    label: 'Micro checks',
    description:
      'A two-stitch check whose phase flips unpredictably. Two colours, no row over the stranded limit and a longest float of 4 stitches: by far the most straightforward of these to knit.',
    measured: { colors: 2, maxColorsInAnyRow: 2, longestFloat: 4, rowsOverTwoColorLimit: 0 },
    family: 'high-frequency',
    seed: 5_150_900,
    stitches: 64,
    rows: 80,
    repeat: { stitches: 16, rows: 20 },
    colorCount: 2,
    params: {
      ...paramsForFamily('high-frequency'),
      variant: 'micro-checks',
      featureSize: 2.5,
      detailBalance: 0.85,
      contrast: 0.8,
      density: 0.5,
      warp: 0.1,
      symmetry: 0,
      minRegion: 0,
      tileRepeat: true,
    },
  },
]
