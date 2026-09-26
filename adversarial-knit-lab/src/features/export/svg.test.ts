import { describe, expect, it } from 'vitest'
import { chartToSvg, escapeXml } from './svg'
import { createGrid } from '../chart/grid'
import { DEFAULT_GAUGE, DEFAULT_PALETTE } from '../chart/project'

const options = {
  cellSize: 10,
  mode: 'both' as const,
  showGrid: true,
  showNumbers: true,
  showRepeat: true,
  repeat: { stitches: 4, rows: 4 },
  gaugeCorrect: false,
  gauge: DEFAULT_GAUGE,
  title: 'Chart & <friends> "quoted"',
  workingMethod: 'flat-stranded' as const,
  includeLegend: true,
}

describe('SVG export', () => {
  it('escapes user-supplied text', () => {
    expect(escapeXml('a & b <c> "d" \'e\'')).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')
    const svg = chartToSvg(createGrid(8, 8), DEFAULT_PALETTE, options)
    expect(svg).not.toContain('<friends>')
    expect(svg).toContain('&lt;friends&gt;')
  })

  it('produces a well-formed document with the expected dimensions', () => {
    const svg = chartToSvg(createGrid(8, 6), DEFAULT_PALETTE, options)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    // One rect per stitch, plus the page background and the legend swatches.
    const rects = svg.match(/<rect/g) ?? []
    expect(rects.length).toBeGreaterThanOrEqual(8 * 6 + 1)
  })

  it('states the finished size in the header', () => {
    const svg = chartToSvg(createGrid(20, 28), DEFAULT_PALETTE, options)
    // 20 sts at 20/10 cm = 10 cm; 28 rows at 28/10 cm = 10 cm.
    expect(svg).toContain('10.0 x 10.0 cm')
  })

  it('draws the chart body without colour in symbol mode', () => {
    const svg = chartToSvg(createGrid(4, 4), DEFAULT_PALETTE, { ...options, mode: 'symbol' })
    const body = svg.slice(0, svg.indexOf('>Palette<'))
    expect(body).not.toContain(`fill="${DEFAULT_PALETTE[1]!.hex}"`)
    // The legend keeps its swatches: a symbol chart is useless without them.
    expect(svg).toContain(`fill="${DEFAULT_PALETTE[1]!.hex}"`)
  })
})
