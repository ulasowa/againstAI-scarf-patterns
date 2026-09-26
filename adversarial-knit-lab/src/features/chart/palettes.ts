/**
 * Yarn palette presets.
 *
 * Curated starting points, chosen so that each one has usable contrast between
 * its colours: a colourwork chart whose yarns read the same from two metres
 * away is a lot of work for nothing.
 *
 * Every preset's closest pair is at least 1.8:1, enforced by palettes.test.ts.
 * Two of these failed that on the first pass at 1.23 and 1.09 -- both looked
 * perfectly fine as swatches, which is exactly why it is a test and not a
 * judgement call.
 *
 * These are screen approximations of the kind of shade you can buy, not
 * matches to any manufacturer's card. Check against real yarn.
 */
import type { PaletteEntry, StitchGrid } from '../../types/project'
import { colorDistanceSq, contrastRatio, hexToRgb } from '../../lib/color'
import { cloneGrid } from './grid'
import { newId } from '../../lib/id'

export interface PalettePreset {
  id: string
  label: string
  description: string
  /** Background first; the rest are contrast colours. */
  colors: { hex: string; name: string; symbol: string }[]
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'charcoal-undyed',
    label: 'Charcoal & undyed',
    description: 'Two colours, maximum contrast. The most forgiving stranded colourwork there is.',
    colors: [
      { hex: '#1b1d1c', name: 'Charcoal', symbol: '.' },
      { hex: '#e8e3d6', name: 'Undyed', symbol: 'o' },
    ],
  },
  {
    id: 'lichen',
    label: 'Lichen',
    description: 'Four muted naturals with one warm accent. The default.',
    colors: [
      { hex: '#1b1d1c', name: 'Charcoal', symbol: '.' },
      { hex: '#e8e3d6', name: 'Undyed', symbol: 'o' },
      { hex: '#9aa08d', name: 'Lichen', symbol: '/' },
      { hex: '#b4522f', name: 'Madder', symbol: 'x' },
    ],
  },
  {
    id: 'heather-greys',
    label: 'Heather greys',
    description: 'Three greys. Quiet, and the least likely to read as a warning sign.',
    colors: [
      { hex: '#2e3133', name: 'Slate', symbol: '.' },
      { hex: '#8d9194', name: 'Fog', symbol: '/' },
      { hex: '#dcdcd8', name: 'Chalk', symbol: 'o' },
    ],
  },
  {
    id: 'indigo-madder',
    label: 'Indigo & madder',
    description: 'Four traditional dye colours: indigo, madder, weld and undyed.',
    colors: [
      { hex: '#20304a', name: 'Indigo', symbol: '.' },
      { hex: '#e4dcc6', name: 'Undyed', symbol: 'o' },
      { hex: '#a8462a', name: 'Madder', symbol: 'x' },
      { hex: '#b79337', name: 'Weld', symbol: '+' },
    ],
  },
  {
    id: 'moorland',
    label: 'Moorland',
    description: 'Four cool naturals. Broad shapes stay legible, fine speckle does not.',
    colors: [
      { hex: '#23282a', name: 'Peat', symbol: '.' },
      { hex: '#cfd0c4', name: 'Bracken pale', symbol: 'o' },
      { hex: '#5d6f63', name: 'Moss', symbol: '/' },
      { hex: '#b59372', name: 'Bracken', symbol: 'x' },
    ],
  },
  {
    id: 'mono-ramp',
    label: 'Monochrome ramp',
    description: 'Four evenly spaced greys. Useful for seeing what a shape does, less so to knit.',
    colors: [
      { hex: '#161718', name: 'Ink', symbol: '.' },
      { hex: '#f2f2ee', name: 'Paper', symbol: 'o' },
      { hex: '#5a5c5d', name: 'Graphite', symbol: '/' },
      { hex: '#a9abab', name: 'Ash', symbol: 'x' },
    ],
  },
  {
    id: 'high-vis',
    label: 'High contrast',
    description: 'Three colours at the loudest end. Legible at a distance, and hard to miss.',
    colors: [
      { hex: '#141414', name: 'Black', symbol: '.' },
      { hex: '#f4f1e8', name: 'Bone', symbol: 'o' },
      { hex: '#d2691e', name: 'Ember', symbol: 'x' },
    ],
  },
]

export function presetToPalette(preset: PalettePreset): PaletteEntry[] {
  return preset.colors.map((color) => ({
    id: newId('c'),
    hex: color.hex,
    symbol: color.symbol,
    name: color.name,
  }))
}

/**
 * Swap the palette, keeping the chart readable.
 *
 * When the new palette has at least as many colours, indices map straight
 * across. When it has fewer, every index that no longer exists is remapped to
 * the nearest surviving colour, so the chart keeps its shapes instead of
 * collapsing to the background.
 *
 * Locked colours are preserved: a knitter who locked a yarn they already own
 * did so on purpose.
 */
export function applyPalettePreset(
  grid: StitchGrid,
  current: readonly PaletteEntry[],
  preset: PalettePreset,
): { grid: StitchGrid; palette: PaletteEntry[] } {
  const locked = current.filter((entry) => entry.locked)
  const next: PaletteEntry[] = [...locked.map((entry) => ({ ...entry })), ...presetToPalette(preset)]

  if (next.length >= current.length) {
    return { grid: cloneGrid(grid), palette: next }
  }

  // Shrinking: map each old colour to the nearest new one.
  const nextRgb = next.map((entry) => hexToRgb(entry.hex))
  const mapping = current.map((entry) => {
    const from = hexToRgb(entry.hex)
    let best = 0
    let bestDistance = Infinity
    nextRgb.forEach((to, index) => {
      const distance = colorDistanceSq(from, to)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    return best
  })

  const remapped = cloneGrid(grid)
  for (let i = 0; i < remapped.cells.length; i++) {
    remapped.cells[i] = mapping[remapped.cells[i] as number] ?? 0
  }
  return { grid: remapped, palette: next }
}

/** Lowest contrast ratio between any two colours in a palette. */
export function minimumContrast(palette: readonly PaletteEntry[]): number {
  let lowest = Infinity
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const a = palette[i]
      const b = palette[j]
      if (!a || !b) continue
      lowest = Math.min(lowest, contrastRatio(hexToRgb(a.hex), hexToRgb(b.hex)))
    }
  }
  return lowest === Infinity ? 1 : lowest
}
