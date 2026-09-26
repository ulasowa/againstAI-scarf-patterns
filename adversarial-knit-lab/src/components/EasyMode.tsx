/**
 * Guided mode.
 *
 * The full interface exposes every parameter because the measurements depend
 * on them. That is right for someone checking the method and wrong for someone
 * who wants to knit a scarf, so this walks through the same process with the
 * few decisions that actually change the outcome.
 *
 * What it does NOT do is soften the claims. A guided interface that quietly
 * implies the pattern works would be worse than a dense one, because the
 * person using it has less to go on. Every caveat in the full interface has a
 * plain-language equivalent here.
 */
import { useMemo, useRef, useState } from 'react'
import type { ProjectStore } from '../state/useProjectStore'
import { useModel } from '../state/ModelContext'
import { PRESETS } from '../features/generator/presets'
import { generatePattern, makeSettings, randomSeed } from '../features/generator/generate'
import { PALETTE_PRESETS, applyPalettePreset } from '../features/chart/palettes'
import { SIZE_PRESETS, sizeToStitches } from '../features/knitting/garments'
import { cellAspect } from '../features/knitting/gauge'
import { decodeImageFile } from '../features/chart/imageImport'
import { autoAnnotate } from '../features/evaluation/autoAnnotate'
import { runEvaluation, type LoadedImage } from '../features/evaluation/runEvaluation'
import { aggregate, formatRate } from '../features/evaluation/metrics'
import { DEFAULT_TRANSFORMS } from '../features/evaluation/transforms'
import { formatBytes } from '../features/evaluation/cocoSsd'
import type { EvaluationRecord } from '../types/project'
import { hashBytes } from '../lib/hash'
import { newId } from '../lib/id'
import { downloadBlob, safeFileName } from '../lib/download'
import { TexturePreview } from './TexturePreview'
import { CameraCapture } from './CameraCapture'
import { Callout, Details } from './ui'

/**
 * How hard a preset is to knit, from its measured figures rather than from an
 * opinion. These families were built for detector structure, not for
 * knittability, and several of them are genuinely awkward -- saying so up
 * front is more use than a warning after the chart is chosen.
 */
function knittingEase(measured: {
  longestFloat: number
  rowsOverTwoColorLimit: number
}): { label: string; tone: 'ok' | 'warn' } {
  if (measured.rowsOverTwoColorLimit === 0 && measured.longestFloat <= 7) {
    return { label: 'straightforward to knit', tone: 'ok' }
  }
  if (measured.rowsOverTwoColorLimit === 0) {
    return { label: `long floats, up to ${measured.longestFloat} stitches`, tone: 'warn' }
  }
  return { label: 'demanding: more than two colours per row', tone: 'warn' }
}

const STEPS = [
  { id: 'pattern', label: 'Pattern' },
  { id: 'yarn', label: 'Yarn and size' },
  { id: 'test', label: 'Test it' },
  { id: 'knit', label: 'Knit it' },
] as const

export function EasyMode({ store }: { store: ProjectStore }) {
  const [step, setStep] = useState(0)
  const { project, analysis } = store

  return (
    <div className="easy">
      <ol className="easy-steps" aria-label="Steps">
        {STEPS.map((entry, index) => (
          <li key={entry.id} className={index === step ? 'active' : index < step ? 'done' : undefined}>
            <button
              type="button"
              aria-current={index === step ? 'step' : undefined}
              onClick={() => setStep(index)}
            >
              <span className="easy-step-number" aria-hidden="true">
                {index + 1}
              </span>
              {entry.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="easy-body">
        {step === 0 ? <PatternStep store={store} /> : null}
        {step === 1 ? <YarnStep store={store} /> : null}
        {step === 2 ? <TestStep store={store} /> : null}
        {step === 3 ? <KnitStep store={store} analysis={analysis} /> : null}
      </div>

      <div className="easy-nav">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </button>
        <span className="hint">
          {project.grid.stitches} sts x {project.grid.rows} rows, {project.palette.length} colours
        </span>
        <button
          type="button"
          className="primary"
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          disabled={step === STEPS.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ step 1 ----------------------------- */

function PatternStep({ store }: { store: ProjectStore }) {
  const { project } = store
  const [seed, setSeed] = useState(project.generator?.seed ?? PRESETS[0]!.seed)
  const [presetId, setPresetId] = useState(PRESETS[0]!.id)

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]!

  const apply = (nextPresetId: string, nextSeed: number) => {
    const chosen = PRESETS.find((p) => p.id === nextPresetId) ?? PRESETS[0]!
    const settings = makeSettings(chosen.family, nextSeed, chosen.params)
    const grid = generatePattern({
      settings,
      stitches: project.grid.stitches,
      rows: project.grid.rows,
      colorCount: Math.min(chosen.colorCount, project.palette.length),
      repeat: chosen.repeat,
      rowAspect: cellAspect(project.gauge),
    })
    store.setRepeat(chosen.repeat)
    store.commitGrid(grid, 'easy: pattern')
    store.setGenerator(settings)
    store.setTitle(chosen.label)
    setPresetId(nextPresetId)
    setSeed(nextSeed)
  }

  return (
    <section>
      <h2>Pick a pattern</h2>
      <p className="lead">
        Five starting points. Each one is a design, not a proven anything — what it does to a
        detector is measured in step 3.
      </p>

      <div className="easy-choices">
        {PRESETS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === presetId ? 'easy-choice active' : 'easy-choice'}
            aria-pressed={entry.id === presetId}
            onClick={() => apply(entry.id, entry.seed)}
          >
            <TexturePreview
              grid={generatePattern({
                settings: makeSettings(entry.family, entry.seed, entry.params),
                stitches: 40,
                rows: 40,
                colorCount: Math.min(entry.colorCount, project.palette.length),
                repeat: entry.repeat,
                rowAspect: cellAspect(project.gauge),
              })}
              palette={project.palette}
              gauge={project.gauge}
              repeatsX={1.6}
              height={96}
              label={`${entry.label} preview`}
            />
            <strong>{entry.label}</strong>
            <span className={knittingEase(entry.measured).tone === 'ok' ? 'ease ok' : 'ease warn'}>
              {knittingEase(entry.measured).label}
            </span>
          </button>
        ))}
      </div>

      <div className="button-row">
        <button type="button" onClick={() => apply(presetId, randomSeed())}>
          Another variation
        </button>
      </div>

      <TexturePreview
        grid={project.grid}
        palette={project.palette}
        gauge={project.gauge}
        repeatsX={3}
        height={220}
        label="Your pattern, repeated as it would be knitted"
      />

      <Details summary={`About "${preset.label}"`}>
        <p>{preset.description}</p>
        <p>
          Seed {seed}. The same seed and settings always produce exactly this chart, so you can
          come back to it.
        </p>
      </Details>
    </section>
  )
}

/* ------------------------------ step 2 ----------------------------- */

function YarnStep({ store }: { store: ProjectStore }) {
  const { project } = store
  const [sizeId, setSizeId] = useState('classic-scarf')

  const applySize = (id: string) => {
    const preset = SIZE_PRESETS.find((s) => s.id === id)
    if (!preset) return
    const size = sizeToStitches(preset.widthCm, preset.lengthCm, project.gauge)
    const settings = project.generator
    const grid = settings
      ? generatePattern({
          settings,
          stitches: size.stitches,
          rows: size.rows,
          colorCount: project.palette.length,
          repeat: project.repeat,
          rowAspect: cellAspect(project.gauge),
        })
      : null
    if (grid) store.commitGrid(grid, 'easy: size')
    store.setWorkingMethod(preset.method)
    setSizeId(id)
  }

  const chosenSize = SIZE_PRESETS.find((s) => s.id === sizeId)
  const size = chosenSize
    ? sizeToStitches(chosenSize.widthCm, chosenSize.lengthCm, project.gauge)
    : null

  return (
    <section>
      <h2>Choose yarn colours and size</h2>
      <p className="lead">
        Colours first, because they decide whether the pattern is visible at all in fabric.
      </p>

      <h3>Colours</h3>
      <div className="swatch-row">
        {PALETTE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset-swatch"
            aria-label={`Use the ${preset.label} palette`}
            onClick={() => {
              const next = applyPalettePreset(project.grid, project.palette, preset)
              store.commitChart(next.grid, next.palette, 'easy: colours')
            }}
          >
            <span className="preset-swatch-colours" aria-hidden="true">
              {preset.colors.map((color) => (
                <span key={color.hex} style={{ background: color.hex }} />
              ))}
            </span>
            <span className="preset-swatch-label">{preset.label}</span>
          </button>
        ))}
      </div>

      <h3>Size</h3>
      <div className="easy-choices compact">
        {SIZE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={preset.id === sizeId ? 'easy-choice active' : 'easy-choice'}
            aria-pressed={preset.id === sizeId}
            onClick={() => applySize(preset.id)}
          >
            <strong>{preset.label}</strong>
            <span>
              {preset.widthCm} x {preset.lengthCm} cm
            </span>
          </button>
        ))}
      </div>

      {size?.warning ? <Callout tone="warning">{size.warning}</Callout> : null}

      <TexturePreview
        grid={project.grid}
        palette={project.palette}
        gauge={project.gauge}
        repeatsX={2.4}
        height={200}
        fabricShading
        label="How it would look knitted. An illustration, not a photograph of fabric."
      />

      <Details summary="If your knitting comes out a different size">
        <p>
          Stitch counts come from a gauge of {project.gauge.stitchesPer10cm} stitches and{' '}
          {project.gauge.rowsPer10cm} rows per 10 cm. Yours will differ. Knit a swatch, measure it,
          and set your own gauge in the full interface — everything recalculates from it.
        </p>
      </Details>
    </section>
  )
}

/* ------------------------------ step 3 ----------------------------- */

function TestStep({ store }: { store: ProjectStore }) {
  const { project, patternHash } = store
  const model = useModel()
  const [images, setImages] = useState<LoadedImage[]>([])
  const [record, setRecord] = useState<EvaluationRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const addFrame = async (data: ImageData, fileName: string) => {
    const image: LoadedImage = {
      ref: {
        id: newId('img'),
        fileName,
        contentHash: hashBytes(data.data),
        width: data.width,
        height: data.height,
        split: 'optimization',
        targetBox: {
          x: data.width * 0.2,
          y: data.height * 0.05,
          width: data.width * 0.6,
          height: data.height * 0.9,
        },
        garmentQuad: [
          [data.width * 0.12, data.height * 0.55],
          [data.width * 0.88, data.height * 0.55],
          [data.width * 0.88, data.height * 0.98],
          [data.width * 0.12, data.height * 0.98],
        ],
      },
      data,
    }
    if (model.adapter?.isLoaded()) {
      const annotation = await autoAnnotate(model.adapter, data, { detectionThreshold: 0.35 })
      if (annotation.targetBox && annotation.garmentQuad) {
        image.ref.targetBox = annotation.targetBox
        image.ref.garmentQuad = annotation.garmentQuad
        setStatus(annotation.message)
      } else {
        setStatus(annotation.message)
      }
    }
    setImages((current) => [...current, image])
  }

  const run = async () => {
    if (!model.adapter || images.length === 0) return
    setBusy(true)
    setError(null)
    setRecord(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runEvaluation(
        model.adapter,
        images,
        {
          grid: project.grid,
          palette: project.palette,
          gauge: project.gauge,
          repeat: project.repeat,
          patternHash,
          conditions: ['original', 'solid', 'control-pattern', 'chart-pattern'],
          detectionThreshold: 0.35,
          matchIou: 0.5,
          stitchesAcrossRegion: 40,
          cellPixels: 6,
          fabricShading: true,
          overlayOpacity: 1,
          transforms: DEFAULT_TRANSFORMS,
          controlSeed: 90210,
          maxDetections: 20,
        },
        { signal: controller.signal, onProgress: (p) => setStatus(p.message) },
      )
      setRecord(result)
      store.addEvaluation(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
      setStatus(null)
      abortRef.current = null
    }
  }

  const summary = useMemo(() => (record ? aggregate(record.perExample, record.conditions) : null), [record])

  return (
    <section>
      <h2>See what a detector makes of it</h2>
      <p className="lead">
        Take a photograph of yourself, and the pattern is placed over the lower part of the picture
        where a garment would be. Then a person detector looks at both versions.
      </p>

      <h3>1. Load the detector</h3>
      {model.isReady ? (
        <Callout tone="success">Detector ready.</Callout>
      ) : (
        <div className="button-row">
          <button
            type="button"
            className="primary"
            onClick={() => void model.load()}
            disabled={model.state === 'loading'}
          >
            {model.state === 'loading'
              ? 'Loading...'
              : `Load the detector (~${formatBytes(18_561_843)})`}
          </button>
        </div>
      )}
      {model.error ? <Callout tone="error">{model.error}</Callout> : null}
      <p className="hint">
        Downloaded once from Google's servers. It then runs on your machine; no picture is ever
        sent anywhere.
      </p>

      <h3>2. Take a picture</h3>
      <CameraCapture onCapture={(data, name) => void addFrame(data, name)} disabled={busy} />
      <label className="easy-file">
        <span>or choose a photograph</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Photograph to test with"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            try {
              const bitmap = await decodeImageFile(file)
              const canvas = document.createElement('canvas')
              canvas.width = Math.min(1280, bitmap.width)
              canvas.height = Math.round((canvas.width / bitmap.width) * bitmap.height)
              const ctx = canvas.getContext('2d', { willReadFrequently: true })
              if (!ctx) throw new Error('Could not read that image')
              ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
              bitmap.close()
              await addFrame(ctx.getImageData(0, 0, canvas.width, canvas.height), file.name)
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : String(caught))
            }
          }}
        />
      </label>
      {images.length > 0 ? (
        <p className="hint">
          {images.length} picture(s) ready.
        </p>
      ) : null}
      {status ? <Callout tone="info">{status}</Callout> : null}

      <h3>3. Run the test</h3>
      <div className="button-row">
        <button
          type="button"
          className="primary"
          onClick={run}
          disabled={busy || !model.isReady || images.length === 0}
        >
          {busy ? 'Testing...' : 'Test the pattern'}
        </button>
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        ) : null}
      </div>
      {!model.isReady || images.length === 0 ? (
        <p className="hint">Load the detector and add a picture first.</p>
      ) : null}
      {error ? <Callout tone="error">{error}</Callout> : null}

      {summary && record ? <PlainResult summary={summary} record={record} /> : null}

      <Callout tone="warning" title="Read this before you believe any of it">
        This tells you what one detector did with your pictures. It is not evidence that the
        pattern hides you from cameras in general, and it says nothing about face recognition,
        which works differently. A pattern that changes nothing here is the normal outcome.
      </Callout>
    </section>
  )
}

function PlainResult({
  summary,
  record,
}: {
  summary: ReturnType<typeof aggregate>
  record: EvaluationRecord
}) {
  const chart = summary.byCondition['chart-pattern']
  const control = summary.byCondition['control-pattern']
  const baseline = summary.byCondition['original']

  if (!chart || !baseline) return null

  const baselineFound = baseline.detectedCount
  const chartFound = chart.detectedCount
  const eligible = summary.eligibleExamples

  return (
    <div className="easy-result">
      <h3>What happened</h3>
      {baselineFound === 0 ? (
        <Callout tone="warning">
          The detector did not find a person in your untouched picture{eligible === 1 ? '' : 's'} at
          all. Nothing can be concluded: if it cannot see you to begin with, it cannot be made to
          lose you. Try a clearer, better-lit picture with more of you in frame.
        </Callout>
      ) : (
        <>
          <p className="easy-headline">
            Without the pattern, you were found in <strong>{baselineFound} of {eligible}</strong>{' '}
            picture{eligible === 1 ? '' : 's'}. With it, <strong>{chartFound} of {eligible}</strong>.
          </p>
          <table className="results">
            <thead>
              <tr>
                <th scope="col">Picture</th>
                <th scope="col">Found?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Untouched</th>
                <td>{baselineFound} of {eligible}</td>
              </tr>
              <tr>
                <th scope="row">Plain colour over the garment</th>
                <td>{summary.byCondition['solid']?.detectedCount ?? '-'} of {eligible}</td>
              </tr>
              <tr>
                <th scope="row">Random pattern, same colours</th>
                <td>{control?.detectedCount ?? '-'} of {eligible}</td>
              </tr>
              <tr>
                <th scope="row">Your pattern</th>
                <td>{chartFound} of {eligible}</td>
              </tr>
            </tbody>
          </table>

          {control && chart.detectedCount >= control.detectedCount ? (
            <Callout tone="info">
              A random pattern in the same colours did at least as well as yours. Whatever changed
              is not specific to your design — it is what covering a garment with any busy texture
              does.
            </Callout>
          ) : null}

          {chartFound < baselineFound ? (
            <Callout tone="info">
              Your pattern was worn in {baselineFound - chartFound} case(s) where the detector lost
              you. On this many pictures that is as likely to be chance as anything else. Add more
              pictures, in different poses and light, before reading anything into it.
            </Callout>
          ) : null}
        </>
      )}
      <Details summary="The precise numbers">
        <p>
          Detector {record.model.id}, reporting at {record.thresholds.detection.toFixed(2)} and
          above, {summary.eligibleExamples} usable example(s), {summary.excludedExamples} excluded.
          Conditional miss rate for your pattern: {formatRate(chart.conditionalMissRate)}.
        </p>
        <p>Switch off the guided mode for the full methodology and every export.</p>
      </Details>
    </div>
  )
}

/* ------------------------------ step 4 ----------------------------- */

function KnitStep({
  store,
  analysis,
}: {
  store: ProjectStore
  analysis: ProjectStore['analysis']
}) {
  const { project, patternHash, evidence } = store
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      const { buildProjectPdf } = await import('../features/export/pdf')
      const blob = await buildProjectPdf(project, analysis, patternHash, {
        pageSize: 'A4',
        showSymbols: true,
        includeInstructions: true,
        evidenceStatus: evidence,
      })
      downloadBlob(blob, safeFileName(project.title, 'pdf'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const hardBits: string[] = []
  if (analysis.longestFloat >= project.analysisOptions.longFloatThreshold) {
    hardBits.push(
      `the yarn is carried up to ${analysis.longestFloat} stitches behind the work, which is long enough that you will want to catch it`,
    )
  }
  if (analysis.rowsExceedingColorLimit.length > 0) {
    hardBits.push(
      `${analysis.rowsExceedingColorLimit.length} row(s) use more than two colours, which is awkward in stranded knitting`,
    )
  }
  const isolatedShare = analysis.isolatedRegions.length / Math.max(1, project.grid.cells.length)
  if (isolatedShare > 0.08) {
    hardBits.push(
      'much of the chart is single stitches rather than blocks, which is deliberate in this pattern but slow to work and easy to lose your place in',
    )
  } else if (analysis.isolatedRegions.length > 0) {
    hardBits.push(`${analysis.isolatedRegions.length} single stitch(es) sit on their own`)
  }

  return (
    <section>
      <h2>Knit it</h2>
      <p className="lead">
        The printable document has the chart, the colour sequence row by row, the yarn list and the
        finished measurements.
      </p>

      <div className="button-row">
        <button type="button" className="primary" onClick={() => void download()} disabled={busy}>
          {busy ? 'Building the PDF...' : 'Download the knitting pattern (PDF)'}
        </button>
      </div>
      {error ? <Callout tone="error">{error}</Callout> : null}

      <h3>Before you cast on</h3>
      {hardBits.length === 0 ? (
        <Callout tone="success">
          Nothing about this chart looks awkward to knit at the current settings.
        </Callout>
      ) : (
        <Callout tone="warning">
          Worth knowing: {hardBits.join('; ')}. The full interface has a repair for each of these.
        </Callout>
      )}

      <p className="hint">
        {project.grid.stitches} stitches by {project.grid.rows} rows,{' '}
        {analysis.totalColors} colours, at {project.gauge.stitchesPer10cm}/
        {project.gauge.rowsPer10cm} stitches and rows per 10 cm.
      </p>

      <Callout tone="info" title="What you are making">
        A knitting chart. Whether it does anything to a camera is a separate question, answered
        only by the measurement in step 3, only for the detector you ran, and only for the pictures
        you used.
      </Callout>
    </section>
  )
}
