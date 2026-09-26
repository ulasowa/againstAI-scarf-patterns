/**
 * Bundled example projects.
 *
 * Imported rather than fetched. They are a few kilobytes in total, and
 * bundling them means the application makes no request for its own files at
 * all: it works from a plain folder, from any subdirectory of any static host,
 * and from a `file://` page where `fetch` of a sibling file is blocked.
 *
 * Each one is an untested procedural candidate. The descriptions quote
 * measured knitting properties and nothing else.
 */
import octaveStack from './octave-stack.json'
import denseContours from './dense-contours.json'
import brokenContours from './broken-contours.json'
import angularShards from './angular-shards.json'
import microChecks from './micro-checks.json'

export interface ExampleProject {
  id: string
  title: string
  description: string
  /** The project file contents, exactly as an export would produce them. */
  file: unknown
}

export const EXAMPLE_PROJECTS: ExampleProject[] = [
  {
    id: 'octave-stack',
    title: 'Octave stack',
    description:
      'Coarse, medium and fine structure at equal strength, so no shape size dominates. Four colours in every row and floats up to 31 stitches: apply the per-row colour repair in the Knit tab before knitting this stranded.',
    file: octaveStack,
  },
  {
    id: 'dense-contours',
    title: 'Dense contour network',
    description:
      'Closely spaced level sets, like a contour map with no terrain. Two colours, every row within the stranded limit, but the open ground between lines gives floats up to 31 stitches.',
    file: denseContours,
  },
  {
    id: 'broken-contours',
    title: 'Broken contours',
    description:
      'Rings cut by a second field, so no line ever closes. Two colours and no row over the stranded limit; floats reach 31 stitches across the gaps.',
    file: brokenContours,
  },
  {
    id: 'angular-shards',
    title: 'Angular shards',
    description:
      'Hard cell boundaries with no gradient anywhere. Four colours, 34 of 80 rows over the stranded limit, longest float 31 stitches.',
    file: angularShards,
  },
  {
    id: 'micro-checks',
    title: 'Micro checks',
    description:
      'A two-stitch check whose phase flips unpredictably. Two colours, no row over the stranded limit and a longest float of 4 stitches: by far the most straightforward of these to knit.',
    file: microChecks,
  },
]
