/**
 * Run the loaded detector on the pattern itself.
 *
 * The point of this panel is speed: no photograph, no annotation, no
 * compositing. Change a slider, press the button, see what the model makes of
 * the fabric. The disclaimer below is not decoration — this answers a different
 * question from the Evaluate tab and the two must not be confused.
 */
import { useRef, useState } from 'react'
import type { Gauge, PaletteEntry, StitchGrid } from '../types/project'
import { useModel } from '../state/ModelContext'
import {
  DEFAULT_PROBE_SCALES,
  probePattern,
  responseScore,
  totalDetections,
  type PatternProbeResult,
} from '../features/evaluation/patternProbe'
import { formatBytes } from '../features/evaluation/cocoSsd'
import { Callout, Details, Section, Stat } from './ui'

export function PatternProbePanel({
  grid,
  palette,
  gauge,
  patternHash,
}: {
  grid: StitchGrid
  palette: readonly PaletteEntry[]
  gauge: Gauge
  patternHash: string
}) {
  const model = useModel()
  const [result, setResult] = useState<PatternProbeResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stale = result !== null && result.patternHash !== patternHash

  const run = async () => {
    if (!model.adapter) return
    setRunning(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const probe = await probePattern(model.adapter, {
        grid,
        palette,
        gauge,
        patternHash,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(probe)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setError('Probe cancelled.')
      } else {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      setRunning(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  return (
    <Section title="Test this pattern on the model">
      <p className="hint">
        Renders the chart as fabric at {DEFAULT_PROBE_SCALES.join(', ')} stitches across and asks
        the detector what it sees. No photograph needed.
      </p>

      <div className="button-row">
        {model.isReady ? (
          <button type="button" className="primary" onClick={run} disabled={running}>
            {running ? 'Testing...' : 'Test pattern'}
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => void model.load()}
            disabled={model.state === 'loading'}
          >
            {model.state === 'loading' ? 'Loading model...' : `Load model (~${formatBytes(18_561_843)})`}
          </button>
        )}
        {running ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        ) : null}
      </div>

      {model.state === 'loading' ? (
        <p className="hint" aria-live="polite">
          {model.message}
        </p>
      ) : null}
      {model.error ? (
        <Callout tone="error" title="Model did not load">
          {model.error}
        </Callout>
      ) : null}
      {progress ? (
        <p className="hint" aria-live="polite">
          Scale {progress.done + 1} of {progress.total}
        </p>
      ) : null}
      {error ? <Callout tone="error">{error}</Callout> : null}

      {result ? (
        <>
          {stale ? (
            <Callout tone="warning">
              The chart changed after this test. These numbers describe the earlier pattern.
            </Callout>
          ) : null}

          <div className="stat-row">
            <Stat
              label="Objects reported"
              value={String(totalDetections(result))}
              hint={`across ${result.scales.length} scales`}
            />
            <Stat
              label="Total confidence"
              value={responseScore(result).toFixed(2)}
              hint="sum of every score"
            />
          </div>

          <table className="results probe-results">
            <caption>
              {result.model.id} on {result.backend}, reporting at {result.threshold.toFixed(2)} and
              above
            </caption>
            <thead>
              <tr>
                <th scope="col">Stitches across</th>
                <th scope="col">Objects</th>
                <th scope="col">Top score</th>
                <th scope="col">Classes reported</th>
              </tr>
            </thead>
            <tbody>
              {result.scales.map((scale) => (
                <tr key={scale.stitchesAcross}>
                  <th scope="row">{scale.stitchesAcross}</th>
                  <td>{scale.inferenceOk ? scale.detections.length : '-'}</td>
                  <td>
                    {!scale.inferenceOk
                      ? 'failed'
                      : scale.topScore === null
                        ? 'nothing at threshold'
                        : scale.topScore.toFixed(3)}
                  </td>
                  <td>
                    {scale.classes.length === 0
                      ? '-'
                      : scale.classes
                          .map((c) => `${c.label} ${c.topScore.toFixed(2)}${c.count > 1 ? ` x${c.count}` : ''}`)
                          .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.scales.some((scale) => scale.personCount > 0) ? (
            <Callout tone="info">
              The detector reported a <strong>person</strong> in the bare fabric. That is a
              phantom: there is nobody in this image. It says the pattern excites this model's
              person class, not that it hides anyone.
            </Callout>
          ) : null}
        </>
      ) : null}

      <Callout tone="warning" title="What this does and does not show">
        This measures what the detector reports when shown the pattern <em>alone</em>. It is not
        evidence that the pattern hides a person: that is a different question, asked of a
        photograph of someone wearing it and answered against paired controls in the Evaluate tab.
        Whether a pattern that produces phantom objects also hides people is unmeasured, here and
        everywhere else in this project.
      </Callout>

      <Details summary="Why several scales">
        <p>
          A detector resolves detail at a fixed input size, so the same fabric at 24 stitches
          across and at 96 is effectively two different images. A pattern that provokes a response
          only when the stitches are enormous tells you little about a garment seen from across a
          street.
        </p>
        <p>
          The render is decoration-free and gauge-correct: the same renderer the evaluation
          pipeline uses, never the chart with its gridlines and row numbers.
        </p>
      </Details>
    </Section>
  )
}
