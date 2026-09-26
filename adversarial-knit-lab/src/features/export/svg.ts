/**
 * Vector chart export.
 *
 * Text coming from the user (project title, colour names, yarn notes) is
 * escaped, because an SVG is a document that other software will open.
 */
import type { Gauge, PaletteEntry, RepeatSize, StitchGrid, WorkingMethod } from '../../types/project'
import { getCell, toDisplayRow } from '../chart/grid'
import { readableTextColor } from '../../lib/color'
import { cellAspect, chartHeightCm, chartWidthCm } from '../knitting/gauge'
import { conventionText } from '../knitting/instructions'

export interface SvgOptions {
  cellSize: number
  mode: 'color' | 'symbol' | 'both'
  showGrid: boolean
  showNumbers: boolean
  showRepeat: boolean
  repeat: RepeatSize
  gaugeCorrect: boolean
  gauge: Gauge
  title: string
  workingMethod: WorkingMethod
  includeLegend: boolean
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function chartToSvg(
  grid: StitchGrid,
  palette: readonly PaletteEntry[],
  options: SvgOptions,
): string {
  const cw = options.cellSize
  const ch = options.gaugeCorrect ? options.cellSize / cellAspect(options.gauge) : options.cellSize
  const gutter = options.showNumbers ? Math.max(18, cw * 1.6) : 0
  const headerHeight = 54
  const legendHeight = options.includeLegend ? 28 + palette.length * 20 : 0
  const boardWidth = grid.stitches * cw
  const boardHeight = grid.rows * ch
  const width = boardWidth + gutter * 2
  const height = headerHeight + boardHeight + gutter + legendHeight

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" role="img" aria-label="${escapeXml(`${options.title}: ${grid.stitches} stitch by ${grid.rows} row colourwork chart`)}">`,
  )
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`)

  // Header
  parts.push(
    `<text x="${round(gutter)}" y="22" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#141414">${escapeXml(options.title)}</text>`,
  )
  const dims = `${grid.stitches} sts x ${grid.rows} rows - ${chartWidthCm(grid.stitches, options.gauge).toFixed(1)} x ${chartHeightCm(grid.rows, options.gauge).toFixed(1)} cm at ${options.gauge.stitchesPer10cm}/${options.gauge.rowsPer10cm} per 10 cm`
  parts.push(
    `<text x="${round(gutter)}" y="40" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#555">${escapeXml(dims)}</text>`,
  )

  parts.push(`<g transform="translate(${round(gutter)} ${headerHeight})">`)

  // Cells
  for (let r = 0; r < grid.rows; r++) {
    const y = toDisplayRow(grid, r) * ch
    for (let c = 0; c < grid.stitches; c++) {
      const entry = palette[getCell(grid, r, c)]
      const fill = options.mode === 'symbol' ? '#ffffff' : (entry?.hex ?? '#ff00ff')
      parts.push(
        `<rect x="${round(c * cw)}" y="${round(y)}" width="${round(cw)}" height="${round(ch)}" fill="${fill}"/>`,
      )
    }
  }

  // Symbols
  if (options.mode !== 'color') {
    parts.push(
      `<g font-family="monospace" font-size="${round(Math.min(cw, ch) * 0.72)}" text-anchor="middle" dominant-baseline="central">`,
    )
    for (let r = 0; r < grid.rows; r++) {
      const y = toDisplayRow(grid, r) * ch + ch / 2
      for (let c = 0; c < grid.stitches; c++) {
        const entry = palette[getCell(grid, r, c)]
        if (!entry || !entry.symbol) continue
        const fill = options.mode === 'symbol' ? '#141414' : readableTextColor(entry.hex)
        parts.push(
          `<text x="${round(c * cw + cw / 2)}" y="${round(y)}" fill="${fill}">${escapeXml(entry.symbol)}</text>`,
        )
      }
    }
    parts.push('</g>')
  }

  // Gridlines
  if (options.showGrid) {
    const lines: string[] = []
    for (let c = 0; c <= grid.stitches; c++) {
      lines.push(`M${round(c * cw)} 0V${round(boardHeight)}`)
    }
    for (let r = 0; r <= grid.rows; r++) {
      lines.push(`M0 ${round(r * ch)}H${round(boardWidth)}`)
    }
    parts.push(`<path d="${lines.join('')}" stroke="#c9c9c2" stroke-width="0.5" fill="none"/>`)

    // Heavier every ten, so a knitter can count.
    const decades: string[] = []
    for (let c = 0; c <= grid.stitches; c += 10) decades.push(`M${round(c * cw)} 0V${round(boardHeight)}`)
    for (let r = 0; r <= grid.rows; r += 10) decades.push(`M0 ${round(r * ch)}H${round(boardWidth)}`)
    parts.push(`<path d="${decades.join('')}" stroke="#8a8a82" stroke-width="1" fill="none"/>`)
  }

  // Repeat outlines
  if (options.showRepeat) {
    const marks: string[] = []
    for (let c = options.repeat.stitches; c < grid.stitches; c += options.repeat.stitches) {
      marks.push(`M${round(c * cw)} 0V${round(boardHeight)}`)
    }
    for (let r = options.repeat.rows; r < grid.rows; r += options.repeat.rows) {
      marks.push(`M0 ${round((grid.rows - r) * ch)}H${round(boardWidth)}`)
    }
    if (marks.length > 0) {
      parts.push(
        `<path d="${marks.join('')}" stroke="#b4341a" stroke-width="1.6" stroke-dasharray="5 3" fill="none"/>`,
      )
    }
  }

  parts.push(`<rect x="0" y="0" width="${round(boardWidth)}" height="${round(boardHeight)}" fill="none" stroke="#141414" stroke-width="1.2"/>`)

  // Numbering: rows count up from the bottom, stitches count right to left.
  if (options.showNumbers) {
    parts.push(`<g font-family="monospace" font-size="9" fill="#4a4a44">`)
    const step = cw < 10 ? 10 : cw < 15 ? 5 : 1
    for (let r = 0; r < grid.rows; r++) {
      const number = r + 1
      if (number !== 1 && number !== grid.rows && number % step !== 0) continue
      const y = toDisplayRow(grid, r) * ch + ch / 2
      parts.push(
        `<text x="-4" y="${round(y)}" text-anchor="end" dominant-baseline="central">${number}</text>`,
      )
    }
    for (let c = 0; c < grid.stitches; c++) {
      const number = grid.stitches - c
      if (number !== 1 && number !== grid.stitches && number % step !== 0) continue
      parts.push(
        `<text x="${round(c * cw + cw / 2)}" y="${round(boardHeight + 12)}" text-anchor="middle">${number}</text>`,
      )
    }
    parts.push('</g>')
  }

  parts.push('</g>')

  // Legend
  if (options.includeLegend) {
    let y = headerHeight + boardHeight + gutter + 14
    parts.push(
      `<text x="${round(gutter)}" y="${round(y)}" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#141414">Palette</text>`,
    )
    y += 16
    for (const entry of palette) {
      parts.push(
        `<rect x="${round(gutter)}" y="${round(y - 9)}" width="14" height="12" fill="${entry.hex}" stroke="#141414" stroke-width="0.6"/>`,
      )
      const label = `${entry.symbol ? `${entry.symbol}  ` : ''}${entry.name}${entry.yarnNote ? ` - ${entry.yarnNote}` : ''}`
      parts.push(
        `<text x="${round(gutter + 20)}" y="${round(y)}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#333">${escapeXml(label)}</text>`,
      )
      y += 20
    }
    parts.push(
      `<text x="${round(gutter)}" y="${round(y + 2)}" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#666">${escapeXml(conventionText(options.workingMethod))}</text>`,
    )
  }

  parts.push('</svg>')
  return parts.join('')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
