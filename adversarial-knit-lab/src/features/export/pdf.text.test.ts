import { describe, expect, it } from 'vitest'
import { toWinAnsi } from './pdf'

/**
 * The PDF standard fonts are WinAnsi-encoded. Drawing a character outside that
 * encoding makes pdf-lib throw, which used to abort the whole export when a
 * chart contained a direction arrow or a colour name in another script.
 */
describe('toWinAnsi', () => {
  it('folds typographic characters to their ASCII equivalents', () => {
    expect(toWinAnsi('‘quoted’')).toBe("'quoted'")
    expect(toWinAnsi('a — b')).toBe('a - b')
    expect(toWinAnsi('12 × 8')).toBe('12 x 8')
    expect(toWinAnsi('→ right')).toBe('-> right')
    expect(toWinAnsi('← left')).toBe('<- left')
  })

  it('keeps the Latin-1 range that WinAnsi shares with it', () => {
    expect(toWinAnsi('Grün Ø å')).toBe('Grün Ø å')
  })

  it('replaces characters it cannot encode rather than throwing', () => {
    expect(toWinAnsi('шерсть')).toBe('??????')
    // Iteration is by code point, so an astral character becomes a single '?'.
    expect(toWinAnsi('yarn 🧶')).toBe('yarn ?')
  })

  it('leaves plain ASCII untouched', () => {
    const text = 'Row 12 (RS): 4 Charcoal, 2 Undyed'
    expect(toWinAnsi(text)).toBe(text)
  })
})
