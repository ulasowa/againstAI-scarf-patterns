/**
 * Take a photograph with the built-in camera.
 *
 * The shortest path from "I made a pattern" to "what does a detector do when I
 * am wearing it": sit at the laptop, take a frame, and the pattern is
 * composited over the lower part of the picture where a garment would be.
 *
 * Privacy: the frame never leaves the browser. It is drawn to a canvas, read
 * as pixels and kept in memory like any imported photograph. Nothing is
 * uploaded, and the camera is released the moment the panel is closed.
 *
 * getUserMedia needs a secure context. That means https:// or localhost; it
 * does NOT work from a file:// page or over plain http:// on a LAN address,
 * and the component says so rather than failing silently.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Callout } from './ui'

export interface CameraCaptureProps {
  onCapture: (data: ImageData, fileName: string) => void
  disabled?: boolean
}

type Status = 'idle' | 'starting' | 'live' | 'error' | 'unsupported'

export function CameraCapture({ onCapture, disabled = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  // Release the camera when the panel goes away. A live camera light left on
  // because a tab changed is not acceptable.
  useEffect(() => stop, [stop])

  const start = async () => {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      setError(
        window.isSecureContext
          ? 'This browser does not expose a camera API.'
          : 'The camera needs a secure context. Open the application over https:// or on localhost; a file:// page or a plain http:// address cannot use it.',
      )
      return
    }

    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setStatus('live')
    } catch (caught) {
      setStatus('error')
      const name = caught instanceof DOMException ? caught.name : ''
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow it in the browser’s site settings and try again.'
          : name === 'NotFoundError'
            ? 'No camera was found.'
            : caught instanceof Error
              ? caught.message
              : String(caught),
      )
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || status !== 'live') return
    const width = video.videoWidth
    const height = video.videoHeight
    if (width === 0 || height === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    // Captured unmirrored: the preview is mirrored so it feels like a mirror,
    // but the detector should see the frame as the camera recorded it.
    ctx.drawImage(video, 0, 0, width, height)
    onCapture(
      ctx.getImageData(0, 0, width, height),
      `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
    )
  }

  return (
    <div className="camera">
      <div className="button-row">
        {status === 'live' ? (
          <>
            <button type="button" className="primary" onClick={capture} disabled={disabled}>
              Take photograph
            </button>
            <button type="button" onClick={stop}>
              Stop camera
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={disabled || status === 'starting'}
          >
            {status === 'starting' ? 'Starting camera...' : 'Use the camera'}
          </button>
        )}
      </div>

      <video
        ref={videoRef}
        className={status === 'live' ? 'camera-preview live' : 'camera-preview'}
        playsInline
        muted
        aria-label="Camera preview"
      />

      {status === 'live' ? (
        <p className="hint" aria-live="polite">
          The preview is mirrored so it reads like a mirror; the captured frame is not.
        </p>
      ) : null}

      {error ? (
        <Callout tone={status === 'unsupported' ? 'warning' : 'error'}>{error}</Callout>
      ) : null}

      <p className="hint">
        The frame stays in your browser. It is never uploaded, and it is only written to a file if
        you explicitly export it.
      </p>
    </div>
  )
}
