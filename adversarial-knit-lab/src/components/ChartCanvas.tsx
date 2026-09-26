/**
 * Interactive chart canvas.
 *
 * Pointer coordinates survive zoom, pan and device-pixel-ratio scaling because
 * every screen point is converted through the same inverse transform:
 *
 *   board = (screen - rect.origin) / zoom - pan
 *
 * and the canvas backing store is sized by devicePixelRatio while the context
 * is scaled by it once per draw. Getting this wrong is the classic canvas-editor
 * bug: cells paint one place and the pointer reports another.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaletteEntry, StitchGrid } from '../types/project'
import {
  cellAtBoardPoint,
  chartMetrics,
  renderChart,
  type ChartRenderOptions,
} from '../features/preview/render'

export type EditorTool = 'pencil' | 'fill' | 'replace' | 'select' | 'pan'

export interface Selection {
  row: number
  column: number
  rows: number
  stitches: number
}

export interface ChartCanvasProps {
  grid: StitchGrid
  palette: readonly PaletteEntry[]
  options: ChartRenderOptions
  tool: EditorTool
  zoom: number
  onZoomChange: (zoom: number) => void
  onPaint: (cells: { row: number; column: number }[]) => void
  onFill: (cell: { row: number; column: number }) => void
  onReplace: (cell: { row: number; column: number }) => void
  onSelect: (selection: Selection | null) => void
  selection: Selection | null
  /** Read-only preview mode disables editing but keeps zoom and pan. */
  readOnly?: boolean
  ariaLabel: string
}

export function ChartCanvas(props: ChartCanvasProps) {
  const {
    grid,
    palette,
    options,
    tool,
    zoom,
    onZoomChange,
    onPaint,
    onFill,
    onReplace,
    onSelect,
    selection,
    readOnly = false,
    ariaLabel,
  } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [cursor, setCursor] = useState<{ row: number; column: number } | null>(null)
  const [focusCell, setFocusCell] = useState({ row: 0, column: 0 })
  const stroke = useRef<{ active: boolean; cells: { row: number; column: number }[] } | null>(null)
  const dragStart = useRef<{ row: number; column: number } | null>(null)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const metrics = chartMetrics(grid, options)

  /** Zoom that shows the whole chart, never magnifying past 1:1. */
  const fitToView = useCallback(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const board = chartMetrics(grid, options)
    const next = Math.min(
      1,
      wrapper.clientWidth / Math.max(1, board.boardWidth),
      wrapper.clientHeight / Math.max(1, board.boardHeight),
    )
    setPan({ x: 0, y: 0 })
    onZoomChange(Number(Math.max(0.25, next).toFixed(3)))
  }, [grid, options, onZoomChange])

  // Fit once on mount and whenever the chart changes size, so a tall chart is
  // not silently cropped at the top of the surface.
  const fittedFor = useRef('')
  useEffect(() => {
    const key = `${grid.stitches}x${grid.rows}`
    if (fittedFor.current === key) return
    fittedFor.current = key
    fitToView()
  }, [grid.stitches, grid.rows, fitToView])

  /** Screen point -> board point, independent of zoom, pan and DPR. */
  const toBoardPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left) / zoom - pan.x,
        y: (clientY - rect.top) / zoom - pan.y,
      }
    },
    [zoom, pan.x, pan.y],
  )

  const cellAt = useCallback(
    (clientX: number, clientY: number) => {
      const point = toBoardPoint(clientX, clientY)
      if (!point) return null
      return cellAtBoardPoint(grid, options, point.x, point.y)
    },
    [grid, options, toBoardPoint],
  )

  // Draw. The backing store is DPR-scaled; the context is scaled once to match.
  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const cssWidth = wrapper.clientWidth
    const cssHeight = wrapper.clientHeight
    if (cssWidth === 0 || cssHeight === 0) return

    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssWidth, cssHeight)
    ctx.fillStyle = '#f4f2ec'
    ctx.fillRect(0, 0, cssWidth, cssHeight)
    ctx.save()
    ctx.scale(zoom, zoom)
    ctx.translate(pan.x, pan.y)

    renderChart(ctx, grid, palette, { ...options, cursor: cursor ?? options.cursor })

    if (selection) {
      const y = (grid.rows - selection.row - selection.rows) * metrics.cellHeight
      ctx.strokeStyle = '#0b5fff'
      ctx.lineWidth = 2 / zoom
      ctx.setLineDash([4 / zoom, 3 / zoom])
      ctx.strokeRect(
        metrics.gutter + selection.column * metrics.cellWidth,
        y,
        selection.stitches * metrics.cellWidth,
        selection.rows * metrics.cellHeight,
      )
      ctx.setLineDash([])
    }
    ctx.restore()
  }, [grid, palette, options, zoom, pan, cursor, selection, metrics.cellHeight, metrics.cellWidth, metrics.gutter])

  // Redraw on container resize.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setPan((p) => ({ ...p })))
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)

    if (tool === 'pan' || event.button === 1 || event.shiftKey) {
      panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
      return
    }
    if (readOnly) return

    const cell = cellAt(event.clientX, event.clientY)
    if (!cell) return
    setFocusCell(cell)

    if (tool === 'pencil') {
      stroke.current = { active: true, cells: [cell] }
      onPaint([cell])
    } else if (tool === 'fill') {
      onFill(cell)
    } else if (tool === 'replace') {
      onReplace(cell)
    } else if (tool === 'select') {
      dragStart.current = cell
      onSelect({ row: cell.row, column: cell.column, rows: 1, stitches: 1 })
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panStart.current) {
      const start = panStart.current
      setPan({
        x: start.panX + (event.clientX - start.x) / zoom,
        y: start.panY + (event.clientY - start.y) / zoom,
      })
      return
    }
    const cell = cellAt(event.clientX, event.clientY)
    setCursor(cell)
    if (readOnly || !cell) return

    if (stroke.current?.active && tool === 'pencil') {
      const last = stroke.current.cells[stroke.current.cells.length - 1]
      if (!last || last.row !== cell.row || last.column !== cell.column) {
        stroke.current.cells.push(cell)
        onPaint([cell])
      }
    } else if (dragStart.current && tool === 'select') {
      const start = dragStart.current
      onSelect({
        row: Math.min(start.row, cell.row),
        column: Math.min(start.column, cell.column),
        rows: Math.abs(cell.row - start.row) + 1,
        stitches: Math.abs(cell.column - start.column) + 1,
      })
    }
  }

  const endInteraction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(event.pointerId)
    stroke.current = null
    dragStart.current = null
    panStart.current = null
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const next = Math.min(8, Math.max(0.25, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))

    // Anchor the zoom on the pointer: the board point under the cursor has to
    // stay under the cursor, or the cell you were aiming at slides away.
    //   board = screen / zoom - pan   =>   pan' = screen / zoom' - screen / zoom + pan
    const rect = canvas.getBoundingClientRect()
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    setPan({
      x: screenX / next - screenX / zoom + pan.x,
      y: screenY / next - screenY / zoom + pan.y,
    })
    onZoomChange(Number(next.toFixed(3)))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [1, 0],
      ArrowDown: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      const next = {
        row: clamp(focusCell.row + (move[0] as number), 0, grid.rows - 1),
        column: clamp(focusCell.column + (move[1] as number), 0, grid.stitches - 1),
      }
      setFocusCell(next)
      setCursor(next)
      return
    }
    if (readOnly) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (tool === 'fill') onFill(focusCell)
      else if (tool === 'replace') onReplace(focusCell)
      else onPaint([focusCell])
    }
  }

  const active = cursor ?? focusCell

  return (
    <div className="chart-canvas">
      <div className="chart-canvas-surface" ref={wrapperRef}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label={ariaLabel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          onPointerLeave={() => setCursor(null)}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          style={{ cursor: tool === 'pan' ? 'grab' : readOnly ? 'default' : 'crosshair' }}
        />
      </div>
      <div className="chart-status" aria-live="polite">
        <span>
          Stitch {grid.stitches - active.column} of {grid.stitches}, row {active.row + 1} of{' '}
          {grid.rows}
        </span>
        <span>
          Zoom {(zoom * 100).toFixed(0)}%
          <button type="button" onClick={fitToView}>
            Fit
          </button>
          <button
            type="button"
            onClick={() => {
              onZoomChange(1)
              setPan({ x: 0, y: 0 })
            }}
          >
            Reset view
          </button>
        </span>
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
