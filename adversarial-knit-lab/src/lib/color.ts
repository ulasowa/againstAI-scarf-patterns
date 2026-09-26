/** Colour utilities. Yarn colours are stored as #rrggbb strings. */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.trim().replace(/^#/, '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex colour: ${hex}`)
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex.trim())
}

/** Relative luminance (WCAG). */
export function luminance(rgb: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Pick black or white text for a background, whichever has more contrast. */
export function readableTextColor(hex: string): string {
  return luminance(hexToRgb(hex)) > 0.45 ? '#111111' : '#ffffff'
}

/** Squared distance in a cheap perceptual weighting ("redmean"). */
export function colorDistanceSq(a: Rgb, b: Rgb): number {
  const rmean = (a.r + b.r) / 2
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return (((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8)
}

/** Index of the nearest palette colour. */
export function nearestPaletteIndex(rgb: Rgb, palette: readonly Rgb[]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const d = colorDistanceSq(rgb, palette[i] as Rgb)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}
