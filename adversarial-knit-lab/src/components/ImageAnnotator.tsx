/**
 * Photograph annotation.
 *
 * Two things are marked per photograph:
 *   target  — a bounding box around the person the measurement is about.
 *   garment — a quadrilateral for the region the texture is mapped into.
 *
 * The quadrilateral is validated against the target box before anything is
 * composited, so a region that would cover a face is refused rather than
 * silently accepted.
 */
import { useEffect, useRef, useState } from 'react'
import type { BoundingBox } from '../types/project'
import { boxFromCorners } from '../features/evaluation/matching'
import { quadBounds, validateGarmentQuad, type Quad } from '../features/evaluation/overlay'
import { Callout } from './ui'

export type AnnotationMode = 'target' | 'garment'

export function ImageAnnotator({
  image,
  targetBox,
  garmentQuad,
  onTargetChange,
  onGarmentChange,
  maxHeight = 420,
}: {
  image: ImageData
  targetBox: BoundingBox
  garmentQuad: Quad
  onTargetChange: (box: BoundingBox) => void
  onGarmentChange: (quad: Quad) => void
  maxHeight?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [mode, setMode] = useState<AnnotationMode>('target')
  const [scale, setScale] = useState(1)
  const drag = useRef<{ kind: 'box' | 'corner'; corner?: number; startX: number; startY: number } | null>(
    null,
  )

  const validation = validateGarmentQuad(garmentQuad, image, targetBox)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const available = parent.clientWidth || image.width
    const next = Math.min(1, available / image.width, maxHeight / image.height)
    setScale(next)

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(image.width * next * dpr)
    canvas.height = Math.round(image.height * next * dpr)
    canvas.style.width = `${image.width * next}px`
    canvas.style.height = `${image.height * next}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr * next, 0, 0, dpr * next, 0, 0)

    // Draw the photograph through an offscreen canvas so ImageData scales.
    const off = document.createElement('canvas')
    off.width = image.width
    off.height = image.height
    off.getContext('2d')?.putImageData(image, 0, 0)
    ctx.drawImage(off, 0, 0)

    // Target box
    ctx.lineWidth = 2 / next
    ctx.strokeStyle = '#0b5fff'
    ctx.setLineDash([])
    ctx.strokeRect(targetBox.x, targetBox.y, targetBox.width, targetBox.height)
    ctx.fillStyle = '#0b5fff'
    ctx.font = `${14 / next}px sans-serif`
    ctx.fillText('target person', targetBox.x + 4 / next, targetBox.y - 6 / next)

    // Garment quad
    ctx.strokeStyle = validation.ok ? '#f0a202' : '#c8331d'
    ctx.setLineDash([6 / next, 4 / next])
    ctx.beginPath()
    garmentQuad.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x as number, y as number)
      else ctx.lineTo(x as number, y as number)
    })
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = validation.ok ? '#f0a202' : '#c8331d'
    garmentQuad.forEach(([x, y]) => {
      ctx.beginPath()
      ctx.arc(x as number, y as number, 6 / next, 0, Math.PI * 2)
      ctx.fill()
    })
  }, [image, targetBox, garmentQuad, maxHeight, validation.ok])

  const toImagePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    }
  }

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toImagePoint(event)
    if (!point) return
    canvasRef.current?.setPointerCapture(event.pointerId)

    if (mode === 'garment') {
      let nearest = -1
      let nearestDistance = Infinity
      garmentQuad.forEach(([x, y], index) => {
        const d = Math.hypot((x as number) - point.x, (y as number) - point.y)
        if (d < nearestDistance) {
          nearestDistance = d
          nearest = index
        }
      })
      if (nearestDistance < 24 / scale) {
        drag.current = { kind: 'corner', corner: nearest, startX: point.x, startY: point.y }
        return
      }
      return
    }
    drag.current = { kind: 'box', startX: point.x, startY: point.y }
    onTargetChange(boxFromCorners(point.x, point.y, point.x, point.y))
  }

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drag.current
    if (!state) return
    const point = toImagePoint(event)
    if (!point) return
    const x = Math.max(0, Math.min(image.width, point.x))
    const y = Math.max(0, Math.min(image.height, point.y))

    if (state.kind === 'box') {
      onTargetChange(boxFromCorners(state.startX, state.startY, x, y))
    } else if (state.corner !== undefined) {
      const next = garmentQuad.map((corner, index) =>
        index === state.corner ? ([x, y] as [number, number]) : corner,
      )
      onGarmentChange(next)
    }
  }

  const handleUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(event.pointerId)
    drag.current = null
  }

  const fitGarmentToTorso = () => {
    // Default torso region: below the head band, inset from the box edges.
    const top = targetBox.y + targetBox.height * 0.24
    const bottom = targetBox.y + targetBox.height * 0.62
    const left = targetBox.x + targetBox.width * 0.12
    const right = targetBox.x + targetBox.width * 0.88
    onGarmentChange([
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ])
  }

  const bounds = quadBounds(garmentQuad)

  return (
    <div className="annotator">
      <div className="tool-row" role="radiogroup" aria-label="Annotation mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'target'}
          className={mode === 'target' ? 'active' : undefined}
          onClick={() => setMode('target')}
        >
          Drag target person
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'garment'}
          className={mode === 'garment' ? 'active' : undefined}
          onClick={() => setMode('garment')}
        >
          Drag garment corners
        </button>
        <button type="button" onClick={fitGarmentToTorso}>
          Fit garment to torso
        </button>
      </div>
      <div className="annotator-surface">
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          role="img"
          aria-label="Photograph with the target person and garment region marked"
        />
      </div>
      <p className="hint">
        Target {Math.round(targetBox.width)} x {Math.round(targetBox.height)} px. Garment region{' '}
        {Math.round(bounds.width)} x {Math.round(bounds.height)} px.
      </p>
      {validation.errors.map((message) => (
        <Callout key={message} tone="error">
          {message}
        </Callout>
      ))}
      {validation.warnings.map((message) => (
        <Callout key={message} tone="warning">
          {message}
        </Callout>
      ))}
    </div>
  )
}
