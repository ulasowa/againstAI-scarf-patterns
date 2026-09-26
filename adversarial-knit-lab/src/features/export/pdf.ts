/**
 * Printable knitting document.
 *
 * pdf-lib is loaded on demand, so the PDF code never lands in the initial
 * bundle.
 *
 * PDF user space has its origin at the bottom-left corner, which happens to
 * match the chart's internal bottom-origin row convention: internal row 0 is
 * drawn at the bottom of the chart box with no flip.
 *
 * Large charts are tiled across pages with a deliberate overlap and corner
 * assembly marks rather than being shrunk until the cells are unreadable.
 */
// Type-only import: erased at build time, so pdf-lib stays in its lazy chunk.
import type { Color, PDFDocument, PDFFont, PDFPage } from 'pdf-lib'
import type {
  EvaluationRecord,
  EvidenceStatus,
  KnittingAnalysis,
  KnittingProject,
} from '../../types/project'
import { getCell } from '../chart/grid'
import { hexToRgb } from '../../lib/color'
import { chartHeightCm, chartWidthCm } from '../knitting/gauge'
import { buildInstructions, directionArrowAscii } from '../knitting/instructions'
import { methodOf } from '../knitting/methods'
import { EVIDENCE_LABELS, currentEvaluations } from '../chart/project'
import { formatRate, formatScore, CONDITION_LABELS } from '../evaluation/metrics'

export type PageSize = 'A4' | 'Letter'

/** Points. 1 pt = 1/72 inch. */
const PAGE_SIZES: Record<PageSize, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
}

const MARGIN = 42
/** Below roughly 6 pt a colourwork cell stops being countable in print. */
const MIN_CELL_PT = 6
const MAX_CELL_PT = 16
/** Stitches and rows repeated on the neighbouring sheet, for assembly. */
const TILE_OVERLAP = 2
/** Space reserved above the chart box for the sheet title and subtitle. */
const HEADER_HEIGHT = 46

export interface PdfOptions {
  pageSize: PageSize
  showSymbols: boolean
  includeInstructions: boolean
  evidenceStatus: EvidenceStatus
}

export async function buildProjectPdf(
  project: KnittingProject,
  analysis: KnittingAnalysis | undefined,
  patternHash: string,
  options: PdfOptions,
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const [pageWidth, pageHeight] = PAGE_SIZES[options.pageSize]

  doc.setTitle(toWinAnsi(project.title))
  doc.setSubject('Colourwork knitting chart')
  doc.setCreator('Adversarial Knit Lab')

  const color = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)
    return rgb(r / 255, g / 255, b / 255)
  }
  const ink = rgb(0.08, 0.08, 0.08)
  const muted = rgb(0.42, 0.42, 0.4)

  /* ---------------- Page 1: summary ---------------- */
  const summary = doc.addPage([pageWidth, pageHeight])
  let y = pageHeight - MARGIN

  const line = (
    text: string,
    size = 10,
    useFont = font,
    tone = ink,
    gap = 14,
  ) => {
    summary.drawText(toWinAnsi(text), { x: MARGIN, y, size, font: useFont, color: tone })
    y -= gap
  }

  line(project.title, 20, bold, ink, 26)
  line(`Project ${project.id}`, 8, mono, muted, 12)
  line(`Pattern hash ${patternHash}`, 8, mono, muted, 20)

  line('Dimensions and gauge', 12, bold, ink, 17)
  line(`${project.grid.stitches} stitches x ${project.grid.rows} rows`)
  line(
    `${chartWidthCm(project.grid.stitches, project.gauge).toFixed(1)} cm wide x ${chartHeightCm(project.grid.rows, project.gauge).toFixed(1)} cm high`,
  )
  line(
    `Gauge ${project.gauge.stitchesPer10cm} stitches and ${project.gauge.rowsPer10cm} rows per 10 cm`,
  )
  line(`Repeat ${project.repeat.stitches} stitches x ${project.repeat.rows} rows`, 10, font, ink, 20)

  line('Working method', 12, bold, ink, 17)
  const method = methodOf(project.workingMethod)
  line(method.label)
  y = wrapText(summary, method.direction, MARGIN, y, pageWidth - MARGIN * 2, 9, font, muted)
  y -= 4
  y = wrapText(summary, method.guidance, MARGIN, y, pageWidth - MARGIN * 2, 9, font, muted)
  y -= 14

  line('Palette', 12, bold, ink, 17)
  for (const entry of project.palette) {
    summary.drawRectangle({
      x: MARGIN,
      y: y - 2,
      width: 16,
      height: 10,
      color: color(entry.hex),
      borderColor: ink,
      borderWidth: 0.5,
    })
    const label = `${entry.symbol || ' '}  ${entry.name}${entry.yarnNote ? ` - ${entry.yarnNote}` : ''}`
    summary.drawText(
      truncateToWidth(toWinAnsi(label), font, 9, pageWidth - MARGIN * 2 - 22 - 60),
      { x: MARGIN + 22, y, size: 9, font, color: ink },
    )
    summary.drawText(toWinAnsi(entry.hex), { x: pageWidth - MARGIN - 52, y, size: 8, font: mono, color: muted })
    y -= 15
  }
  y -= 6
  y = wrapText(
    summary,
    'Screen colours are approximations. Dye lot, fibre and light all shift the result; check against real yarn before you buy.',
    MARGIN,
    y,
    pageWidth - MARGIN * 2,
    8,
    font,
    muted,
  )
  y -= 12

  if (analysis) {
    line('Knitting notes', 12, bold, ink, 17)
    line(`Colours in the chart: ${analysis.totalColors}; most in any single row: ${analysis.maxColorsInAnyRow}`, 9)
    if (method.stranded) {
      line(`Longest float: ${analysis.longestFloat} stitches; longest colour run: ${analysis.longestColorRun}`, 9)
    }
    for (const warning of analysis.warnings) {
      y = wrapText(summary, `- ${warning.message}`, MARGIN, y, pageWidth - MARGIN * 2, 8.5, font, muted)
      y -= 3
    }
    y -= 10
  }

  /* ---------------- Evidence status ---------------- */
  line('Evidence status', 12, bold, ink, 17)
  y = wrapText(
    summary,
    EVIDENCE_LABELS[options.evidenceStatus],
    MARGIN,
    y,
    pageWidth - MARGIN * 2,
    10,
    bold,
    ink,
  )
  y -= 4
  const current = currentEvaluations(project)
  if (current.length === 0) {
    y = wrapText(
      summary,
      'This pattern has not been measured against any model, or it was edited after it was measured. Nothing here claims it affects any computer-vision system.',
      MARGIN,
      y,
      pageWidth - MARGIN * 2,
      9,
      font,
      muted,
    )
  } else {
    for (const record of current.slice(0, 3)) {
      y = drawEvaluationSummary(summary, record, MARGIN, y, pageWidth - MARGIN * 2, font, mono, ink, muted)
    }
    y -= 4
    y = wrapText(
      summary,
      'These numbers describe the listed model, images and settings only. They are not evidence about other detectors, other tasks such as face recognition, or knitted fabric in the physical world.',
      MARGIN,
      y,
      pageWidth - MARGIN * 2,
      8.5,
      font,
      muted,
    )
  }

  /* ---------------- Chart pages ---------------- */
  drawChartPages(doc, project, options, { pageWidth, pageHeight, font, bold, mono, color, ink, muted })

  /* ---------------- Instruction pages ---------------- */
  if (options.includeInstructions) {
    drawInstructionPages(doc, project, { pageWidth, pageHeight, font, bold, mono, ink, muted })
  }

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}

/* ------------------------------------------------------------------ *
 * Chart pages
 * ------------------------------------------------------------------ */

interface DrawContext {
  pageWidth: number
  pageHeight: number
  font: PdfFont
  bold: PdfFont
  mono: PdfFont
  color: (hex: string) => PdfColor
  ink: PdfColor
  muted: PdfColor
}

type PdfFont = PDFFont
type PdfColor = Color
type PdfPage = PDFPage
type PdfDoc = PDFDocument

export interface TilePlan {
  singlePage: boolean
  tilesX: number
  tilesY: number
  /** Stitches and rows on one sheet (the last sheet in a direction may hold fewer). */
  tileColumns: number
  tileRows: number
  /** Distance between the start of one sheet and the next. */
  strideX: number
  strideY: number
  /** Side of one chart cell, in points. */
  cell: number
}

/**
 * Work out how to spread a chart over printed sheets.
 *
 * A chart that does not fit at a readable cell size is tiled rather than shrunk.
 * Sheet counts come from what one sheet could hold at the minimum readable cell
 * size; the chart is then spread *evenly* over those sheets rather than filling
 * each to capacity and leaving a thin strip on the last. Balanced sheets are
 * smaller, which lets the cell grow, which is what makes them readable.
 *
 * Neighbouring sheets repeat TILE_OVERLAP stitches and rows so they can be
 * aligned and taped.
 */
export function planChartTiles(
  stitches: number,
  rows: number,
  usableWidth: number,
  usableHeight: number,
): TilePlan {
  const fitCell = Math.min(usableWidth / stitches, usableHeight / rows)
  const singlePage = fitCell >= MIN_CELL_PT

  if (singlePage) {
    return {
      singlePage: true,
      tilesX: 1,
      tilesY: 1,
      tileColumns: stitches,
      tileRows: rows,
      strideX: stitches,
      strideY: rows,
      cell: Math.min(MAX_CELL_PT, fitCell),
    }
  }

  const capacityStitches = Math.max(1, Math.floor(usableWidth / MIN_CELL_PT))
  const capacityRows = Math.max(1, Math.floor(usableHeight / MIN_CELL_PT))

  const tilesX = Math.max(
    1,
    Math.ceil((stitches - TILE_OVERLAP) / Math.max(1, capacityStitches - TILE_OVERLAP)),
  )
  const tilesY = Math.max(
    1,
    Math.ceil((rows - TILE_OVERLAP) / Math.max(1, capacityRows - TILE_OVERLAP)),
  )

  const tileColumns = Math.min(
    stitches,
    Math.ceil((stitches - TILE_OVERLAP) / tilesX) + TILE_OVERLAP,
  )
  const tileRows = Math.min(rows, Math.ceil((rows - TILE_OVERLAP) / tilesY) + TILE_OVERLAP)

  return {
    singlePage: false,
    tilesX,
    tilesY,
    tileColumns,
    tileRows,
    strideX: Math.max(1, tileColumns - TILE_OVERLAP),
    strideY: Math.max(1, tileRows - TILE_OVERLAP),
    cell: Math.min(MAX_CELL_PT, usableWidth / tileColumns, usableHeight / tileRows),
  }
}

function drawChartPages(
  doc: PdfDoc,
  project: KnittingProject,
  options: PdfOptions,
  ctx: DrawContext,
): void {
  const { pageWidth, pageHeight } = ctx
  const grid = project.grid
  const plan = planChartTiles(
    grid.stitches,
    grid.rows,
    pageWidth - MARGIN * 2,
    pageHeight - MARGIN * 2 - HEADER_HEIGHT,
  )
  const { tilesX, tilesY, cell } = plan

  for (let ty = tilesY - 1; ty >= 0; ty--) {
    for (let tx = 0; tx < tilesX; tx++) {
      const startColumn = tx * plan.strideX
      const startRow = ty * plan.strideY
      const columns = Math.min(plan.tileColumns, grid.stitches - startColumn)
      const rows = Math.min(plan.tileRows, grid.rows - startRow)
      drawChartTile(doc, project, options, ctx, {
        startColumn,
        startRow,
        columns,
        rows,
        cell,
        tileLabel:
          tilesX * tilesY === 1
            ? 'Chart'
            : `Chart sheet ${tilesX * (tilesY - 1 - ty) + tx + 1} of ${tilesX * tilesY} - column block ${tx + 1}, row block ${ty + 1}`,
        overlap: plan.singlePage ? 0 : TILE_OVERLAP,
      })
    }
  }
}

interface TileSpec {
  startColumn: number
  startRow: number
  columns: number
  rows: number
  cell: number
  tileLabel: string
  overlap: number
}

function drawChartTile(
  doc: PdfDoc,
  project: KnittingProject,
  options: PdfOptions,
  ctx: DrawContext,
  tile: TileSpec,
): void {
  const page = doc.addPage([ctx.pageWidth, ctx.pageHeight])
  const { cell } = tile
  const grid = project.grid
  const originX = MARGIN + 16
  // PDF y grows upwards, so the chart box is placed by its top edge: it hangs
  // from just under the header rather than sitting on the bottom margin.
  const originY = Math.max(
    MARGIN + 18,
    ctx.pageHeight - MARGIN - HEADER_HEIGHT - tile.rows * cell,
  )

  page.drawText(toWinAnsi(tile.tileLabel), {
    x: MARGIN,
    y: ctx.pageHeight - MARGIN,
    size: 11,
    font: ctx.bold,
    color: ctx.ink,
  })
  page.drawText(
    toWinAnsi(`${project.title} - stitches ${grid.stitches - tile.startColumn}-${grid.stitches - tile.startColumn - tile.columns + 1}, rows ${tile.startRow + 1}-${tile.startRow + tile.rows}`),
    { x: MARGIN, y: ctx.pageHeight - MARGIN - 14, size: 8, font: ctx.font, color: ctx.muted },
  )

  // Cells. PDF y grows upwards, so internal row 0 sits at the bottom.
  for (let r = 0; r < tile.rows; r++) {
    const internalRow = tile.startRow + r
    for (let c = 0; c < tile.columns; c++) {
      const entry = project.palette[getCell(grid, internalRow, tile.startColumn + c)]
      page.drawRectangle({
        x: originX + c * cell,
        y: originY + r * cell,
        width: cell,
        height: cell,
        color: ctx.color(entry?.hex ?? '#ff00ff'),
      })
      if (options.showSymbols && entry?.symbol) {
        const width = ctx.mono.widthOfTextAtSize(entry.symbol, cell * 0.66)
        page.drawText(toWinAnsi(entry.symbol), {
          x: originX + c * cell + (cell - width) / 2,
          y: originY + r * cell + cell * 0.24,
          size: cell * 0.66,
          font: ctx.mono,
          color: textInk(entry.hex, ctx),
        })
      }
    }
  }

  // Gridlines, heavier every ten.
  for (let c = 0; c <= tile.columns; c++) {
    const absolute = tile.startColumn + c
    const heavy = absolute % 10 === 0
    page.drawLine({
      start: { x: originX + c * cell, y: originY },
      end: { x: originX + c * cell, y: originY + tile.rows * cell },
      thickness: heavy ? 0.9 : 0.3,
      color: ctx.muted,
    })
  }
  for (let r = 0; r <= tile.rows; r++) {
    const absolute = tile.startRow + r
    const heavy = absolute % 10 === 0
    page.drawLine({
      start: { x: originX, y: originY + r * cell },
      end: { x: originX + tile.columns * cell, y: originY + r * cell },
      thickness: heavy ? 0.9 : 0.3,
      color: ctx.muted,
    })
  }

  // Numbering: rows up from the bottom, stitches right to left.
  const labelStep = cell < 9 ? 5 : 1
  for (let r = 0; r < tile.rows; r++) {
    const number = tile.startRow + r + 1
    if (number % labelStep !== 0 && number !== 1) continue
    page.drawText(String(number), {
      x: MARGIN - 12,
      y: originY + r * cell + cell * 0.25,
      size: Math.min(7, cell * 0.7),
      font: ctx.mono,
      color: ctx.muted,
    })
  }
  for (let c = 0; c < tile.columns; c++) {
    const number = grid.stitches - (tile.startColumn + c)
    if (number % labelStep !== 0 && number !== 1) continue
    page.drawText(String(number), {
      x: originX + c * cell + 1,
      y: originY - 9,
      size: Math.min(7, cell * 0.7),
      font: ctx.mono,
      color: ctx.muted,
    })
  }

  // Assembly marks: corner crosses plus a note naming the overlap.
  if (tile.overlap > 0) {
    drawAssemblyMarks(page, originX, originY, tile.columns * cell, tile.rows * cell, ctx)
    page.drawText(
      toWinAnsi(
        `Overlap ${tile.overlap} stitches and ${tile.overlap} rows with the neighbouring sheets. Trim on the outer rule and align the corner crosses.`,
      ),
      { x: MARGIN, y: MARGIN - 12, size: 7.5, font: ctx.font, color: ctx.muted },
    )
  }

  page.drawText(toWinAnsi(directionNote(project)), {
    x: MARGIN,
    y: MARGIN - 2,
    size: 7.5,
    font: ctx.font,
    color: ctx.muted,
  })
}

function drawAssemblyMarks(
  page: PdfPage,
  x: number,
  y: number,
  width: number,
  height: number,
  ctx: DrawContext,
): void {
  const arm = 7
  const corners: [number, number][] = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ]
  for (const [cx, cy] of corners) {
    page.drawLine({
      start: { x: cx - arm, y: cy },
      end: { x: cx + arm, y: cy },
      thickness: 0.6,
      color: ctx.ink,
    })
    page.drawLine({
      start: { x: cx, y: cy - arm },
      end: { x: cx, y: cy + arm },
      thickness: 0.6,
      color: ctx.ink,
    })
  }
}

function directionNote(project: KnittingProject): string {
  const method = methodOf(project.workingMethod)
  if (method.id === 'duplicate-stitch') return method.direction
  if (method.circular) return `${method.direction}  <-- every round`
  return `${method.direction}  <-- right side    --> wrong side`
}

function textInk(hex: string, ctx: DrawContext): PdfColor {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.55 ? ctx.ink : ctx.color('#ffffff')
}

/* ------------------------------------------------------------------ *
 * Instructions
 * ------------------------------------------------------------------ */

function drawInstructionPages(
  doc: PdfDoc,
  project: KnittingProject,
  ctx: Omit<DrawContext, 'color'>,
): void {
  const instructions = buildInstructions(project.grid, project.palette, project.workingMethod)
  let page = doc.addPage([ctx.pageWidth, ctx.pageHeight])
  let y = ctx.pageHeight - MARGIN

  page.drawText(toWinAnsi('Colour sequence'), { x: MARGIN, y, size: 14, font: ctx.bold, color: ctx.ink })
  y -= 18
  y = wrapText(page, instructions.convention, MARGIN, y, ctx.pageWidth - MARGIN * 2, 9, ctx.font, ctx.muted)
  y -= 6
  y = wrapText(
    page,
    'Each line lists the stitches in the order you work them. An arrow shows the reading direction for that row.',
    MARGIN,
    y,
    ctx.pageWidth - MARGIN * 2,
    9,
    ctx.font,
    ctx.muted,
  )
  y -= 12

  // Rows are listed in working order: row 1 first.
  for (const row of instructions.rows) {
    if (y < MARGIN + 24) {
      page = doc.addPage([ctx.pageWidth, ctx.pageHeight])
      y = ctx.pageHeight - MARGIN
    }
    const label = `${directionArrowAscii(row)} ${row.unit} ${row.number}${row.side ? ` (${row.side})` : ''}: `
    page.drawText(toWinAnsi(label), { x: MARGIN, y, size: 8.5, font: ctx.mono, color: ctx.ink })
    const indent = MARGIN + ctx.mono.widthOfTextAtSize(label, 8.5)
    y = wrapText(page, row.text, indent, y, ctx.pageWidth - indent - MARGIN, 8.5, ctx.font, ctx.ink)
    y -= 2
  }
}

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

function wrapText(
  page: PdfPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: PdfFont,
  color: PdfColor,
): number {
  const words = toWinAnsi(text).split(/\s+/)
  let current = ''
  let cursor = y
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      page.drawText(toWinAnsi(current), { x, y: cursor, size, font, color })
      cursor -= size * 1.32
      current = word
    } else {
      current = candidate
    }
  }
  if (current) {
    page.drawText(toWinAnsi(current), { x, y: cursor, size, font, color })
    cursor -= size * 1.32
  }
  return cursor
}

function drawEvaluationSummary(
  page: PdfPage,
  record: EvaluationRecord,
  x: number,
  y: number,
  maxWidth: number,
  font: PdfFont,
  mono: PdfFont,
  ink: PdfColor,
  muted: PdfColor,
): number {
  let cursor = y
  page.drawText(toWinAnsi(`${record.model.id} (${record.runtime.backend})`), {
    x,
    y: cursor,
    size: 9,
    font: mono,
    color: ink,
  })
  cursor -= 12
  const chart = record.aggregate.byCondition['chart-pattern']
  const control = record.aggregate.byCondition['control-pattern']
  const summary = [
    `eligible examples ${record.aggregate.eligibleExamples}`,
    `chart conditional miss rate ${formatRate(chart?.conditionalMissRate ?? null)}`,
    `chart mean matched score ${formatScore(chart?.meanMatchedScore ?? null)}`,
    control
      ? `${CONDITION_LABELS['control-pattern']} conditional miss rate ${formatRate(control.conditionalMissRate)}`
      : '',
  ]
    .filter(Boolean)
    .join('; ')
  cursor = wrapText(page, summary, x, cursor, maxWidth, 8.5, font, muted)
  return cursor - 4
}


/* ------------------------------------------------------------------ *
 * Text encoding
 * ------------------------------------------------------------------ */

/**
 * The PDF standard fonts are encoded in WinAnsi (cp1252). Anything outside it
 * -- an arrow, an emoji in a colour name, a Cyrillic yarn note -- makes pdf-lib
 * throw while drawing. User-supplied text is folded to the closest ASCII
 * equivalent, and anything left over becomes '?', so an export never fails on
 * a character in a project title.
 */
const FOLD: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201a': ',', '\u201c': '"', '\u201d': '"',
  '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2192': '->', '\u2190': '<-',
  '\u2191': '^', '\u2193': 'v', '\u00d7': 'x', '\u00b7': '-', '\u2022': '-',
  '\u00a0': ' ', '\u2212': '-',
}

/** Shorten text with an ellipsis so it cannot run into the next column. */
export function truncateToWidth(
  text: string,
  font: PdfFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let shortened = text
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}...`, size) > maxWidth) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened}...`
}

export function toWinAnsi(text: string): string {
  let out = ''
  for (const character of text.normalize('NFC')) {
    const folded = FOLD[character]
    if (folded !== undefined) {
      out += folded
      continue
    }
    const code = character.codePointAt(0) ?? 63
    // Printable ASCII plus the Latin-1 range that cp1252 shares with it.
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) out += character
    else out += '?'
  }
  return out
}

export { PAGE_SIZES }
