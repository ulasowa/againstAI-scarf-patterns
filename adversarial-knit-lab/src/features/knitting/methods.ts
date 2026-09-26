/** Working-method metadata shared by analysis, instructions and the UI. */
import type { WorkingMethod } from '../../types/project'

export interface MethodDescriptor {
  id: WorkingMethod
  label: string
  /** Stranded methods carry unworked yarn across the back of the fabric. */
  stranded: boolean
  /** Circular work reads every round in the same direction and wraps at the edge. */
  circular: boolean
  /** Reading-direction sentence shown to the knitter. */
  direction: string
  guidance: string
}

export const METHODS: Record<WorkingMethod, MethodDescriptor> = {
  'flat-stranded': {
    id: 'flat-stranded',
    label: 'Flat stranded colourwork',
    stranded: true,
    circular: false,
    direction:
      'Worked flat in stockinette. Right-side rows are read right to left, wrong-side rows left to right.',
    guidance:
      'Unworked colours are carried across the back of the row. Float length is the practical limit on how far apart two stitches of the same colour can sit.',
  },
  'circular-stranded': {
    id: 'circular-stranded',
    label: 'Circular stranded colourwork',
    stranded: true,
    circular: true,
    direction: 'Worked in the round. Every round is read right to left.',
    guidance:
      'Every round is a right-side round. Floats can also run across the round boundary, so the join between the last and first stitch is analysed as well.',
  },
  intarsia: {
    id: 'intarsia',
    label: 'Intarsia',
    stranded: false,
    circular: false,
    direction:
      'Worked flat. Right-side rows are read right to left, wrong-side rows left to right.',
    guidance:
      'Each colour block uses its own yarn supply and the yarns are linked at every colour change. Float limits do not apply, but isolated single stitches are still awkward, and intarsia in the round needs a specialised method.',
  },
  'duplicate-stitch': {
    id: 'duplicate-stitch',
    label: 'Duplicate stitch',
    stranded: false,
    circular: false,
    direction:
      'Embroidered onto finished stockinette. Work in any order; the chart shows placement, not a knitting sequence.',
    guidance:
      'Stitches are embroidered over a finished fabric, so stranded float limits and per-row colour limits do not apply. Dense coverage stiffens the fabric.',
  },
}

export function methodOf(method: WorkingMethod): MethodDescriptor {
  return METHODS[method]
}
