/**
 * Decoration-free pattern preview.
 *
 * Shows the chart as repeated fabric at gauge-correct proportions. The fabric
 * illustration is a drawing of stockinette, not a physical simulation, and the
 * caption says so wherever it is used.
 */
import { useEffect, useRef } from 'react'
import type { Gauge, PaletteEntry, StitchGrid } from '../types/project'
import { renderPatternTexture } from '../features/preview/render'

export function TexturePreview({
  grid,
  palette,
  gauge,
  repeatsX = 3,
  repeatsY = 3,
  fabricShading = false,
  height = 240,
  label,
}: {
  grid: StitchGrid
  palette: readonly PaletteEntry[]
  gauge: Gauge
  repeatsX?: number
  repeatsY?: number
  fabricShading?: boolean
  height?: number
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cssWidth = parent.clientWidth
    if (cssWidth === 0) return

    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Fit the requested number of repeats across the available width.
    const cellPixels = cssWidth / (grid.stitches * repeatsX)
    renderPatternTexture(ctx, grid, palette, {
      cellPixels,
      gauge,
      width: cssWidth,
      height,
      fabricShading,
    })
    void repeatsY
  }, [grid, palette, gauge, repeatsX, repeatsY, fabricShading, height])

  return (
    <figure className="texture-preview">
      <canvas ref={canvasRef} role="img" aria-label={label} />
      <figcaption>{label}</figcaption>
    </figure>
  )
}
