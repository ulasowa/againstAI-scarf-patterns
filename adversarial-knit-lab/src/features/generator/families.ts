/**
 * Pattern families.
 *
 * These are NOT military camouflage. Camouflage is designed for low salience
 * against a background; the properties reported in the adversarial-texture
 * literature are close to the opposite, and that is what these families target.
 *
 * WHAT THE RESEARCH ACTUALLY SAYS, AND WHAT IT DOES NOT
 *
 * Every published result that fools a detector was produced by optimising a
 * texture against a specific model with gradients:
 *
 *   Brown et al. 2017, Adversarial Patch            arXiv:1712.09665
 *   Thys et al. 2019 / Xu et al. 2020, clothing     ECCV 2020
 *   Duan et al. 2020, AdvCam                        CVPR 2020
 *   Hu et al. 2022, Adversarial Texture             arXiv:2203.03373
 *
 * The output of that work is a trained artifact tied to the model it was
 * trained against. A procedural generator cannot inherit its effectiveness, and
 * nothing in this file claims to. There is no published recipe of the form
 * "generate a pattern like this and detectors will fail".
 *
 * WHAT THESE FAMILIES DO
 *
 * They generate in the structural vocabulary those papers' outputs share, as
 * described in the papers themselves:
 *
 *   - high spatial-frequency content, near the limit the detector can resolve
 *   - energy at several scales at once rather than one dominant blob size
 *   - abrupt, saturated transitions instead of smooth natural gradients
 *   - dense broken contours rather than closed natural shapes
 *   - tileability, so a garment can be covered at any size (Hu et al.'s
 *     "expandable" property)
 *
 * That makes them plausible candidates to MEASURE. It does not make them
 * effective. The Generate tab probes them against a model you load, and the
 * Evaluate tab measures them against photographs; those measurements are the
 * only claim this application makes about any of them.
 */
import type { GeneratorParams, PatternFamily } from '../../types/project'

export interface VariantDescriptor {
  id: string
  label: string
  description: string
}

export interface FamilyDescriptor {
  id: PatternFamily
  label: string
  summary: string
  /** The structural property this family targets, and where it is reported. */
  rationale: string
  supportsTiling: boolean
  variants: VariantDescriptor[]
  defaults: Partial<GeneratorParams>
}

export const FAMILIES: FamilyDescriptor[] = [
  {
    id: 'high-frequency',
    label: 'High-frequency disruption',
    summary:
      'Dense structure at the smallest scale the fabric can hold, right at the limit a detector can resolve.',
    rationale:
      'Optimised adversarial patches are consistently high-frequency and high-contrast rather than smooth (Brown et al. 2017). At knitting resolution the stitch is the smallest unit, so this family works at one to three stitches.',
    supportsTiling: true,
    variants: [
      {
        id: 'speckle',
        label: 'Speckle',
        description: 'Per-stitch noise with no structure above a few stitches.',
      },
      {
        id: 'micro-checks',
        label: 'Micro checks',
        description: 'A one-to-three stitch check whose phase flips unpredictably.',
      },
      {
        id: 'ordered-dither',
        label: 'Ordered dither',
        description: 'A regular dither lattice modulated by a slow field: structured, not random.',
      },
    ],
    defaults: { featureSize: 2.5, detailBalance: 0.85, contrast: 0.8, warp: 0.1, minRegion: 0 },
  },
  {
    id: 'multiscale-interference',
    label: 'Multiscale interference',
    summary:
      'Coarse, medium and fine structure at equal strength, so no single shape size dominates.',
    rationale:
      'Detectors pool features across a range of receptive-field sizes. Unlike fBm, which decays with each octave, this family keeps every octave at full amplitude so several scales compete.',
    supportsTiling: true,
    variants: [
      {
        id: 'octave-stack',
        label: 'Octave stack',
        description: 'Four octaves at equal amplitude. No dominant shape size.',
      },
      {
        id: 'nested-blocks',
        label: 'Nested blocks',
        description: 'Blocks subdivided into blocks, three levels deep.',
      },
      {
        id: 'ridged-shards',
        label: 'Ridged shards',
        description: 'Ridged multifractal: hard creases where the field folds.',
      },
    ],
    defaults: { featureSize: 7, detailBalance: 0.5, contrast: 0.6, warp: 0.3, minRegion: 0 },
  },
  {
    id: 'contour-network',
    label: 'Contour network',
    summary: 'Dense broken contour lines that cross and terminate, forming no closed object.',
    rationale:
      'Edge and contour structure is what a detector assembles into object proposals. A network of contours that never closes into a recognisable shape gives it many edges and no object.',
    supportsTiling: true,
    variants: [
      {
        id: 'dense-rings',
        label: 'Dense rings',
        description: 'Closely spaced level sets, like a contour map with no terrain.',
      },
      { id: 'maze', label: 'Maze', description: 'Orthogonal paths that branch and dead-end.' },
      {
        id: 'broken-contours',
        label: 'Broken contours',
        description: 'Rings cut by a second field, so no line completes.',
      },
    ],
    defaults: { featureSize: 6, detailBalance: 0.35, contrast: 0.75, warp: 0.3, minRegion: 0 },
  },
  {
    id: 'chromatic-shock',
    label: 'Chromatic shock',
    summary: 'Hard-edged cells and bands with abrupt colour changes and no gradients anywhere.',
    rationale:
      'Natural images have smooth local colour statistics; optimised patches do not. This family removes gradients entirely, which is also what hard palette quantisation does to a knitting chart anyway.',
    supportsTiling: true,
    variants: [
      {
        id: 'shards',
        label: 'Angular shards',
        description: 'Cell boundaries with hard edges, in the manner of a Voronoi diagram.',
      },
      {
        id: 'hard-bands',
        label: 'Hard bands',
        description: 'Bands of uneven width, cut across by breaks.',
      },
      {
        id: 'offset-check',
        label: 'Offset checks',
        description: 'Checks displaced row by row.',
      },
      {
        id: 'zigzag',
        label: 'Disrupted zigzag',
        description: 'Chevrons interrupted by noise.',
      },
    ],
    defaults: { featureSize: 5, detailBalance: 0.4, contrast: 0.9, warp: 0.2, minRegion: 0 },
  },
  {
    id: 'imported-image',
    label: 'Imported image',
    summary: 'A user-supplied image converted to the knitting grid and palette.',
    rationale: 'Bring your own texture, including one produced by the Python research companion.',
    supportsTiling: false,
    variants: [{ id: 'imported', label: 'Imported', description: 'Converted from an image.' }],
    defaults: {},
  },
]

export function getFamily(id: PatternFamily): FamilyDescriptor {
  const found = FAMILIES.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown pattern family: ${id}`)
  return found
}

/** Families that generate; excludes the imported-image passthrough. */
export const GENERATIVE_FAMILIES = FAMILIES.filter((f) => f.id !== 'imported-image')

export const DEFAULT_PARAMS: GeneratorParams = {
  featureSize: 4,
  detailBalance: 0.6,
  contrast: 0.75,
  density: 0.5,
  warp: 0.25,
  symmetry: 0,
  minRegion: 0,
  tileRepeat: true,
  variant: 'octave-stack',
}

export function paramsForFamily(family: PatternFamily): GeneratorParams {
  const descriptor = getFamily(family)
  const firstVariant = descriptor.variants[0]
  return {
    ...DEFAULT_PARAMS,
    ...descriptor.defaults,
    variant: firstVariant ? firstVariant.id : DEFAULT_PARAMS.variant,
  }
}
