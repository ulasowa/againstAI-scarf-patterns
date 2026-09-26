/** Evaluate tab: load a model, annotate photographs, run paired measurements, search. */
import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  ConditionKind,
  EvaluationRecord,
  TransformSettings,
} from '../../types/project'
import type { ProjectStore } from '../../state/useProjectStore'
import { MODEL_REGISTRY, createAdapter } from './registry'
import { useModel } from '../../state/ModelContext'
import { formatBytes } from './cocoSsd'
import { DEFAULT_TRANSFORMS } from './transforms'
import {
  inferenceBudget,
  isAbort,
  runEvaluation,
  type EvaluationConfig,
  type LoadedImage,
} from './runEvaluation'
import {
  CONDITION_HINTS,
  CONDITION_LABELS,
  aggregate,
  aggregateByTransform,
  formatDelta,
  formatRate,
  formatScore,
} from './metrics'
import { validateGarmentQuad, type Quad } from './overlay'
import { OBJECTIVE_DESCRIPTION, runSearch, searchBudget, type Candidate, type SearchResult } from '../search/search'
import { ImageAnnotator } from '../../components/ImageAnnotator'
import { SubTabs } from '../../components/SubTabs'
import { TexturePreview } from '../../components/TexturePreview'
import {
  Callout,
  CheckboxField,
  Details,
  NumberField,
  SelectField,
  ScrollRegion,
  Section,
  SliderField,
  Stat,
} from '../../components/ui'
import { autoAnnotate, lowerFrameQuad, torsoQuad, type AutoAnnotation } from './autoAnnotate'
import { CameraCapture } from '../../components/CameraCapture'
import { decodeImageFile } from '../chart/imageImport'
import { hashBytes } from '../../lib/hash'
import { newId } from '../../lib/id'
import { clearModelCache } from '../../lib/persistence'

const ALL_CONDITIONS: ConditionKind[] = ['original', 'solid', 'control-pattern', 'chart-pattern']

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function EvaluatePanel({ store }: { store: ProjectStore }) {
  const { project, patternHash } = store
  // One adapter for the whole application: the Generate tab probes patterns
  // with the same loaded model.
  const model = useModel()
  const { modelId, setModelId } = model
  const loadState: LoadState = model.state
  const loadMessage = model.message
  const loadError = model.error
  const [extraMessage, setExtraMessage] = useState('')

  const [images, setImages] = useState<LoadedImage[]>([])
  const [selected, setSelected] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [annotateNote, setAnnotateNote] = useState<string | null>(null)
  const [annotating, setAnnotating] = useState(false)

  const [conditions, setConditions] = useState<ConditionKind[]>(ALL_CONDITIONS)
  const [detectionThreshold, setDetectionThreshold] = useState(0.35)
  const [matchIou, setMatchIou] = useState(0.5)
  const [stitchesAcross, setStitchesAcross] = useState(40)
  const [opacity, setOpacity] = useState(1)
  const [fabricShading, setFabricShading] = useState(true)
  const [transforms, setTransforms] = useState<TransformSettings>(DEFAULT_TRANSFORMS)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<
    { completed: number; total: number; message: string; phase?: string } | null
  >(null)
  const [record, setRecord] = useState<EvaluationRecord | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [exploreCount, setExploreCount] = useState(10)
  const [refineCount, setRefineCount] = useState(6)
  const [searchSeed, setSearchSeed] = useState(1234)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [searchBest, setSearchBest] = useState<Candidate | null>(null)
  const [searching, setSearching] = useState(false)
  const [holdoutUsedForSelection, setHoldoutUsedForSelection] = useState(false)
  const [mainTab, setMainTab] = useState('measure')

  const registryEntry = MODEL_REGISTRY.find((m) => m.id === modelId)!
  const descriptor = useMemo(() => createAdapter(modelId).descriptor, [modelId])

  const optimizationImages = images.filter((i) => i.ref.split === 'optimization')
  const holdoutImages = images.filter((i) => i.ref.split === 'holdout')

  const baseConfig: Omit<EvaluationConfig, 'grid' | 'patternHash'> = useMemo(
    () => ({
      palette: project.palette,
      gauge: project.gauge,
      repeat: project.repeat,
      conditions,
      detectionThreshold,
      matchIou,
      stitchesAcrossRegion: stitchesAcross,
      cellPixels: 6,
      fabricShading,
      overlayOpacity: opacity,
      transforms,
      controlSeed: 90210,
      maxDetections: 20,
    }),
    [project.palette, project.gauge, project.repeat, conditions, detectionThreshold, matchIou, stitchesAcross, fabricShading, opacity, transforms],
  )

  const budget = inferenceBudget(images.length, { conditions, transforms })

  /* ----------------------------- model ----------------------------- */

  const loadModel = async () => {
    await model.load()
    // Photographs imported before the model was available are annotated now,
    // so the order the user happens to work in does not cost them a step.
    if (images.length > 0) void annotateAll(images)
  }

  /* ----------------------------- images ---------------------------- */

  const importImages = async (files: FileList) => {
    setImportError(null)
    const next: LoadedImage[] = []
    for (const file of Array.from(files).slice(0, 12)) {
      try {
        const bitmap = await decodeImageFile(file)
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(1280, bitmap.width)
        canvas.height = Math.round((canvas.width / bitmap.width) * bitmap.height)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('Could not read the image')
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        bitmap.close()
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)

        const box = {
          x: canvas.width * 0.3,
          y: canvas.height * 0.1,
          width: canvas.width * 0.4,
          height: canvas.height * 0.8,
        }
        next.push({
          ref: {
            id: newId('img'),
            fileName: file.name,
            contentHash: hashBytes(data.data),
            width: canvas.width,
            height: canvas.height,
            split: next.length % 3 === 2 ? 'holdout' : 'optimization',
            targetBox: box,
            garmentQuad: [
              [box.x + box.width * 0.12, box.y + box.height * 0.24],
              [box.x + box.width * 0.88, box.y + box.height * 0.24],
              [box.x + box.width * 0.88, box.y + box.height * 0.62],
              [box.x + box.width * 0.12, box.y + box.height * 0.62],
            ],
          },
          data,
        })
      } catch (error) {
        setImportError(error instanceof Error ? error.message : String(error))
      }
    }
    if (next.length > 0) {
      setImages((current) => [...current, ...next])
      // Straight from "dropped a photo" to "ready to measure".
      if (model.adapter?.isLoaded()) void annotateAll(next)
    }
  }

  /**
   * Let the detector mark the target and the garment region.
   *
   * This is the step that used to stand between importing a photograph and
   * learning anything, and the model can do it itself.
   */
  const annotateAll = useCallback(
    async (pool: LoadedImage[]) => {
      // Read the adapter from the shared controller, not from a captured ref:
      // a ref captured before the model loaded stays null, and the callback
      // then returns silently instead of annotating anything.
      const adapter = model.adapter
      if (!adapter?.isLoaded()) return
      setAnnotating(true)
      try {
        const results: { ref: LoadedImage['ref']; annotation: AutoAnnotation }[] = []
        for (const image of pool) {
          const annotation = await autoAnnotate(adapter, image.data, { detectionThreshold })
          results.push({ ref: image.ref, annotation })
        }
        setImages((live) =>
          live.map((image) => {
            const found = results.find((r) => r.ref.id === image.ref.id)
            if (!found?.annotation.targetBox || !found.annotation.garmentQuad) return image
            return {
              ...image,
              ref: {
                ...image.ref,
                targetBox: found.annotation.targetBox,
                garmentQuad: found.annotation.garmentQuad,
              },
            }
          }),
        )
        const found = results.filter((r) => r.annotation.ok).length
        const missed = results.filter((r) => r.annotation.targetBox === null)
        setAnnotateNote(
          missed.length === 0
            ? `Annotated ${found} of ${results.length} photograph(s). Drag any region that looks wrong.`
            : `Annotated ${found} of ${results.length}. No person was detected in ${missed.length}: those cannot tell you whether a pattern hid anyone, so mark them by hand or leave them out.`,
        )
      } catch (error) {
        setImportError(error instanceof Error ? error.message : String(error))
      } finally {
        setAnnotating(false)
      }
    },
    [detectionThreshold, model.adapter],
  )

  /** Add one decoded frame, annotate it, and select it. */
  const addImage = useCallback(
    (data: ImageData, fileName: string, split: 'optimization' | 'holdout' = 'optimization') => {
      const box = {
        x: data.width * 0.2,
        y: data.height * 0.05,
        width: data.width * 0.6,
        height: data.height * 0.9,
      }
      const image: LoadedImage = {
        ref: {
          id: newId('img'),
          fileName,
          contentHash: hashBytes(data.data),
          width: data.width,
          height: data.height,
          split,
          targetBox: box,
          // Until the detector says otherwise, cover the lower part of the
          // frame: at a laptop that is where a garment is.
          garmentQuad: lowerFrameQuad(data),
        },
        data,
      }
      setImages((current) => {
        setSelected(current.length)
        return [...current, image]
      })
      if (model.adapter?.isLoaded()) void annotateAll([image])
      return image
    },
    [annotateAll, model.adapter],
  )

  const updateImage = useCallback((index: number, patch: Partial<LoadedImage['ref']>) => {
    setImages((current) =>
      current.map((image, i) => (i === index ? { ...image, ref: { ...image.ref, ...patch } } : image)),
    )
  }, [])

  const current = images[selected]
  const currentValidation = current
    ? validateGarmentQuad(current.ref.garmentQuad as Quad, current.ref, current.ref.targetBox)
    : null

  const allQuadsValid = images.every(
    (image) => validateGarmentQuad(image.ref.garmentQuad as Quad, image.ref, image.ref.targetBox).ok,
  )

  /* ------------------------------ run ------------------------------ */

  const run = async () => {
    const adapter = model.adapter
    if (!adapter || loadState !== 'ready') return
    setRunning(true)
    setRunError(null)
    setRecord(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runEvaluation(
        adapter,
        images,
        { ...baseConfig, grid: project.grid, patternHash },
        {
          signal: controller.signal,
          holdoutUsedForSelection,
          onProgress: setProgress,
        },
      )
      setRecord(result)
      store.addEvaluation(result)
      // A finished run has something to say; do not make the user go looking.
      setMainTab('results')
    } catch (error) {
      if (isAbort(error)) setRunError('Evaluation cancelled. Partial results were discarded.')
      else setRunError(error instanceof Error ? error.message : String(error))
    } finally {
      setRunning(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  const search = async () => {
    const adapter = model.adapter
    if (!adapter || loadState !== 'ready') return
    if (optimizationImages.length === 0) {
      setRunError('The search needs at least one photograph in the optimisation split.')
      return
    }
    setSearching(true)
    setRunError(null)
    setSearchResult(null)
    setSearchBest(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runSearch(
        adapter,
        {
          project,
          exploreCount,
          refineCount,
          seed: searchSeed,
          constraints: {
            maxFloat: project.analysisOptions.longFloatThreshold,
            enforceColorsPerRow: true,
            maxIsolatedRegions: 40,
          },
          baseConfig,
          optimizationImages,
        },
        {
          signal: controller.signal,
          onProgress: (p) => {
            setProgress({
              completed: p.completed,
              total: p.total,
              message: p.message,
              phase: p.phase,
            })
            setSearchBest(p.best)
          },
        },
      )
      setSearchResult(result)
      setSearchBest(result.best)
    } catch (error) {
      if (isAbort(error)) setRunError('Search cancelled. The best result so far is kept below.')
      else setRunError(error instanceof Error ? error.message : String(error))
    } finally {
      setSearching(false)
      setProgress(null)
      abortRef.current = null
    }
  }

  const cancel = () => abortRef.current?.abort()

  /** A disabled button with no explanation is a dead end. */
  const blockers: string[] = []
  if (loadState !== 'ready') blockers.push('load a model')
  if (images.length === 0) blockers.push('import at least one photograph')
  if (images.length > 0 && !allQuadsValid) blockers.push('fix the invalid garment region')

  /* ---------------------------- rendering --------------------------- */

  const optimizationMetrics = record
    ? aggregate(record.perExample, record.conditions, { split: 'optimization' })
    : null
  const holdoutMetrics = record
    ? aggregate(record.perExample, record.conditions, { split: 'holdout' })
    : null
  const byTransform = record ? aggregateByTransform(record.perExample, record.conditions) : null

  const controlTabs = [
    { id: 'model', label: '1 Model', render: () => (
      <>
              <Section title="1. Load a model" description="Nothing is downloaded until you ask.">
                <SelectField
                  label="Model"
                  value={modelId}
                  hint={registryEntry.note}
                  options={MODEL_REGISTRY.map((m) => ({ value: m.id, label: m.label }))}
                  onChange={setModelId}
                />
                <div className="button-row">
                  <button type="button" className="primary" onClick={loadModel} disabled={loadState === 'loading'}>
                    {loadState === 'ready' ? 'Reload model' : `Load model (~${formatBytes(descriptor.approximateDownloadBytes)})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void clearModelCache().then((outcome) =>
                        setExtraMessage(
                          outcome.ok
                            ? `Cleared ${outcome.value} cached model(s)`
                            : (outcome.error ?? ''),
                        ),
                      )
                    }}
                  >
                    Clear model cache
                  </button>
                </div>
                {loadState === 'loading' ? <p className="hint" aria-live="polite">{loadMessage}</p> : null}
                {loadState === 'ready' ? <Callout tone="success">{loadMessage}</Callout> : null}
                {extraMessage ? <p className="hint">{extraMessage}</p> : null}
          {extraMessage ? <p className="hint">{extraMessage}</p> : null}
                {loadError ? <Callout tone="error" title="Model did not load">{loadError}</Callout> : null}
                <Details summary="Model details">
                  <dl className="model-facts">
                    <dt>Artifact</dt>
                    <dd><code>{descriptor.artifactUrl}</code></dd>
                    <dt>Licence</dt>
                    <dd>{descriptor.license}</dd>
                    <dt>Input</dt>
                    <dd>{descriptor.inputResolution}</dd>
                    <dt>Channels / normalisation</dt>
                    <dd>{descriptor.channelOrder}, {descriptor.normalization}</dd>
                    <dt>Resize</dt>
                    <dd>{descriptor.resizeBehavior}</dd>
                    <dt>Output</dt>
                    <dd>{descriptor.outputLayout}</dd>
                    <dt>Classes</dt>
                    <dd>{descriptor.classMapping}</dd>
                    <dt>NMS</dt>
                    <dd>{descriptor.nmsBehavior}</dd>
                    <dt>Checksum</dt>
                    <dd>{descriptor.artifactHash ?? 'not published by us; the weights are served by a third-party CDN'}</dd>
                  </dl>
                  <p>
                    Weights are fetched from storage.googleapis.com. That is the only external request this
                    application makes.
                  </p>
                </Details>
              </Section>

      </>
    ) },
    { id: 'photos', label: '2 Photos', badge: images.length || undefined, render: () => (
      <>
              <Section title="2. Import photographs" description="Decoded and measured in your browser. Nothing is uploaded.">
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Photographs to evaluate"
                  onChange={(event) => {
                    if (event.target.files) void importImages(event.target.files)
                    event.target.value = ''
                  }}
                />
                <CameraCapture
                  onCapture={(data, fileName) => addImage(data, fileName)}
                  disabled={running || searching}
                />

                {images.length > 0 ? (
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => void annotateAll(images)}
                      disabled={annotating || loadState !== 'ready' || running || searching}
                    >
                      {annotating ? 'Detecting...' : 'Detect people and mark regions'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setImages((live) =>
                          live.map((image) => ({
                            ...image,
                            ref: { ...image.ref, garmentQuad: torsoQuad(image.ref.targetBox) },
                          })),
                        )
                      }
                      disabled={running || searching}
                    >
                      Reset garment regions
                    </button>
                  </div>
                ) : null}
                {annotateNote ? <Callout tone="info">{annotateNote}</Callout> : null}
                {importError ? <Callout tone="error">{importError}</Callout> : null}
                {images.length > 0 ? (
                  <ul className="image-list">
                    {images.map((image, index) => (
                      <li key={image.ref.id} className={index === selected ? 'active' : undefined}>
                        <button type="button" onClick={() => setSelected(index)}>
                          {image.ref.fileName}
                        </button>
                        <select
                          value={image.ref.split}
                          aria-label={`Data split for ${image.ref.fileName}`}
                          onChange={(event) =>
                            updateImage(index, { split: event.target.value as 'optimization' | 'holdout' })
                          }
                        >
                          <option value="optimization">optimisation</option>
                          <option value="holdout">holdout</option>
                        </select>
                        <button
                          type="button"
                          className="link"
                          onClick={() => {
                            setImages((c) => c.filter((_, i) => i !== index))
                            setSelected(0)
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">
                    A texture image with no person in it is not evidence of anything. Use photographs of a
                    person wearing or holding a garment.
                  </p>
                )}
                <p className="hint">
                  {optimizationImages.length} optimisation, {holdoutImages.length} holdout. Keep the
                  holdout aside: it is only meaningful while you have not chosen anything with it.
                </p>
              </Section>

      </>
    ) },
    { id: 'settings', label: '3 Settings', render: () => (
      <>
              <Section title="3. Settings">
                <div className="condition-list">
                  {ALL_CONDITIONS.map((condition) =>
                    condition === 'original' ? (
                      <p key={condition} className="hint required-condition">
                        <strong>{CONDITION_LABELS[condition]}</strong> is always measured:
                        every metric below is defined against it.
                      </p>
                    ) : (
                      <CheckboxField
                        key={condition}
                        label={CONDITION_LABELS[condition]}
                        hint={CONDITION_HINTS[condition]}
                        checked={conditions.includes(condition)}
                        onChange={(checked) =>
                          setConditions((current) =>
                            checked
                              ? ALL_CONDITIONS.filter((c) => current.includes(c) || c === condition)
                              : current.filter((c) => c !== condition),
                          )
                        }
                      />
                    ),
                  )}
                </div>
                <SliderField
                  label="Reporting threshold"
                  value={detectionThreshold}
                  min={0.05}
                  max={0.9}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                  hint="Detections below this are not reported. A target that falls below it is 'not detected at threshold', not zero confidence."
                  onChange={setDetectionThreshold}
                />
                <SliderField
                  label="Match IoU"
                  value={matchIou}
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  format={(v) => v.toFixed(2)}
                  hint="Overlap required before a detection counts as the annotated target."
                  onChange={setMatchIou}
                />
                <NumberField
                  label="Stitches across the garment region"
                  value={stitchesAcross}
                  min={4}
                  max={400}
                  hint="Sets the physical scale of the motif in the photograph."
                  onChange={setStitchesAcross}
                />
                <SliderField
                  label="Overlay opacity"
                  value={opacity}
                  min={0.2}
                  max={1}
                  step={0.05}
                  format={(v) => v.toFixed(2)}
                  onChange={setOpacity}
                />
                <CheckboxField
                  label="Draw stitch texture in the overlay"
                  checked={fabricShading}
                  onChange={setFabricShading}
                />
              </Section>

      </>
    ) },
    { id: 'probes', label: '4 Probes', badge: transforms.enabled ? 'on' : undefined, render: () => (
      <>
              <Section title="4. Transformation probes" description="Robustness probes, not proof of physical performance.">
                <CheckboxField
                  label="Enable transformations"
                  checked={transforms.enabled}
                  onChange={(enabled) => setTransforms({ ...transforms, enabled })}
                />
                <NumberField
                  label="Samples per photograph"
                  value={transforms.samplesPerImage}
                  min={1}
                  max={8}
                  onChange={(samplesPerImage) => setTransforms({ ...transforms, samplesPerImage })}
                />
                <NumberField
                  label="Transform seed"
                  value={transforms.seed}
                  onChange={(seed) => setTransforms({ ...transforms, seed })}
                />
                <CheckboxField
                  label="Partial garment occlusion"
                  checked={transforms.occlusion.enabled}
                  onChange={(enabled) =>
                    setTransforms({ ...transforms, occlusion: { ...transforms.occlusion, enabled } })
                  }
                />
                <p className="hint">
                  The same sampled parameters are applied to the baseline and to every patterned condition
                  of the same example, so the comparison stays paired.
                </p>
              </Section>
      </>
    ) },
  ]

  const mainTabs = [
    { id: 'measure', label: 'Measure', render: () => (
      <>
              {current ? (
                <Section title={`Annotate ${current.ref.fileName}`}>
                  <ImageAnnotator
                    image={current.data}
                    targetBox={current.ref.targetBox}
                    garmentQuad={current.ref.garmentQuad as Quad}
                    onTargetChange={(targetBox) => updateImage(selected, { targetBox })}
                    onGarmentChange={(garmentQuad) => updateImage(selected, { garmentQuad })}
                  />
                </Section>
              ) : (
                <Section title="Annotate">
                  <Callout tone="info">Import a photograph to mark the target person and garment region.</Callout>
                </Section>
              )}

              <Section title="Run" right={<Stat label="Inference calls" value={String(budget)} />}>
                <p className="hint">
                  Budget = {images.length} image(s) x{' '}
                  {transforms.enabled ? transforms.samplesPerImage : 1} transformation(s) x{' '}
                  {conditions.length} condition(s) x 1 model = {budget} inference calls.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary"
                    onClick={run}
                    disabled={running || searching || loadState !== 'ready' || images.length === 0 || !allQuadsValid}
                  >
                    Run evaluation
                  </button>
                  <button type="button" onClick={cancel} disabled={!running}>
                    Cancel run
                  </button>
                </div>
                {blockers.length > 0 && allQuadsValid ? (
                  <p className="hint">
                    To run: {blockers.join(', then ')}.
                  </p>
                ) : null}
                {images.length > 0 && !allQuadsValid ? (
                  <Callout tone="error">
                    At least one garment region is invalid. Fix it before running: a region covering a face
                    would measure occlusion rather than the pattern.
                  </Callout>
                ) : null}
                {currentValidation && currentValidation.warnings.length > 0 && allQuadsValid ? (
                  <Callout tone="warning">{currentValidation.warnings[0]}</Callout>
                ) : null}
                {progress ? (
                  <div className="progress" aria-live="polite">
                    <progress value={progress.completed} max={progress.total} />
                    <span>
                      {progress.completed} / {progress.total} - {progress.message}
                    </span>
                  </div>
                ) : null}
                {runError ? <Callout tone="error">{runError}</Callout> : null}
              </Section>

      </>
    ) },
    { id: 'search', label: 'Search', render: () => (
      <>
              <Section
                title="Candidate search"
                description="Seeded random search ranked by real inference. A heuristic, not a gradient-based attack."
              >
                <NumberField
                  label="Explore"
                  value={exploreCount}
                  min={1}
                  max={60}
                  hint="Random candidates drawn across the whole parameter space."
                  onChange={setExploreCount}
                />
                <NumberField
                  label="Refine"
                  value={refineCount}
                  min={0}
                  max={60}
                  hint="Candidates mutated from the best found so far, with shrinking steps. 0 disables refinement."
                  onChange={setRefineCount}
                />
                <NumberField label="Search seed" value={searchSeed} onChange={setSearchSeed} />
                <p className="hint">
                  Estimated workload:{' '}
                  {optimizationImages.length > 0
                    ? searchBudget({
                        project,
                        exploreCount,
                        refineCount,
                        seed: searchSeed,
                        constraints: { maxFloat: 7, enforceColorsPerRow: true, maxIsolatedRegions: 40 },
                        baseConfig,
                        optimizationImages,
                      })
                    : 0}{' '}
                  inference calls on the optimisation split.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={search}
                    disabled={searching || running || loadState !== 'ready' || optimizationImages.length === 0}
                  >
                    Run search
                  </button>
                  {loadState !== 'ready' || optimizationImages.length === 0 ? (
                    <p className="hint">
                      The search needs a loaded model and at least one photograph in the optimisation
                      split.
                    </p>
                  ) : null}
                  <button type="button" onClick={cancel} disabled={!searching}>
                    Cancel search
                  </button>
                </div>
                {searchBest ? (
                  <div className="search-best">
                    <TexturePreview
                      grid={searchBest.grid}
                      palette={project.palette}
                      gauge={project.gauge}
                      repeatsX={2}
                      height={150}
                      label="Best candidate so far"
                    />
                    <div className="stat-row">
                      <Stat label="Detection retention" value={formatRate(searchBest.retention)} />
                      <Stat label="Mean matched score" value={formatScore(searchBest.meanScore)} />
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        store.commitGrid(searchBest.grid, 'search result')
                        store.setGenerator(searchBest.settings)
                      }}
                    >
                      Save this candidate to the editor
                    </button>
                  </div>
                ) : null}
                {searchResult ? (
                  <>
                    <Callout tone={searchResult.improved ? 'success' : 'warning'}>
                      {searchResult.improved
                        ? `The best candidate beat the starting chart on the optimisation split. ${searchResult.evaluated} candidate(s) evaluated, ${searchResult.rejected} rejected on knitting constraints.`
                        : `No candidate beat the starting chart on the optimisation split. ${searchResult.evaluated} evaluated, ${searchResult.rejected} rejected on knitting constraints. That is a real result, not a failure to report.`}
                    </Callout>
                    <CheckboxField
                      label="I have used the holdout split to choose between candidates"
                      checked={holdoutUsedForSelection}
                      hint="Tick this once you start picking based on holdout numbers. From then on the holdout is a selection set and its results are no longer held out."
                      onChange={setHoldoutUsedForSelection}
                    />
                  </>
                ) : null}
                <Details summary="Search objective">
                  <p>{OBJECTIVE_DESCRIPTION}</p>
                  <p>
                    Selection on one model and one small image set does not generalise. Re-running the
                    search against the holdout until something wins is how a measurement becomes
                    meaningless.
                  </p>
                </Details>
              </Section>
      </>
    ) },
    {
      id: 'results',
      label: 'Results',
      badge: record ? record.aggregate.eligibleExamples : undefined,
      render: () =>
        record ? (
          <ResultsView
            record={record}
            optimization={optimizationMetrics}
            holdout={holdoutMetrics}
            byTransform={byTransform}
          />
        ) : (
          <Section title="Results">
            <Callout tone="info">
              Nothing measured yet. Run an evaluation on the Measure tab, or let the search find a
              candidate first.
            </Callout>
          </Section>
        ),
    },
  ]

  return (
    <div className="panel-grid">
      <div className="panel-column controls">
        <SubTabs tabs={controlTabs} label="Evaluation setup" />
      </div>

      <div className="panel-column main">
        <SubTabs
          tabs={mainTabs}
          label="Measurement, search and results"
          active={mainTab}
          onActiveChange={setMainTab}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ResultsView({
  record,
  optimization,
  holdout,
  byTransform,
}: {
  record: EvaluationRecord
  optimization: ReturnType<typeof aggregate> | null
  holdout: ReturnType<typeof aggregate> | null
  byTransform: Map<number, ReturnType<typeof aggregate>> | null
}) {
  return (
    <Section
      title="Results"
      description={`${record.model.id} on the ${record.runtime.backend} backend, ${record.aggregate.eligibleExamples} eligible example(s), ${record.aggregate.excludedExamples} excluded.`}
    >
      <ConditionTable metrics={record.aggregate} conditions={record.conditions} caption="All examples" />
      {optimization && optimization.eligibleExamples > 0 ? (
        <ConditionTable metrics={optimization} conditions={record.conditions} caption="Optimisation split" />
      ) : null}
      {holdout && holdout.eligibleExamples > 0 ? (
        <ConditionTable metrics={holdout} conditions={record.conditions} caption="Holdout split" />
      ) : null}

      {byTransform && byTransform.size > 1 ? (
        <>
          <h3>By transformation sample</h3>
          {[...byTransform.entries()].map(([index, metrics]) => (
            <ConditionTable key={index} metrics={metrics} conditions={record.conditions} caption={`Sample ${index + 1}`} />
          ))}
        </>
      ) : null}

      <h3>Individual results</h3>
      <ScrollRegion className="table-scroll" label="Individual results table">
        <table className="results">
          <thead>
            <tr>
              <th scope="col">Image</th>
              <th scope="col">Split</th>
              <th scope="col">Sample</th>
              {record.conditions.map((condition) => (
                <th key={condition} scope="col">{CONDITION_LABELS[condition]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {record.perExample.map((example) => {
              const image = record.images.find((i) => i.id === example.imageId)
              return (
                <tr key={`${example.imageId}-${example.transformIndex}`}>
                  <td>{image?.fileName ?? example.imageId}</td>
                  <td>{example.split}</td>
                  <td>{example.transformIndex + 1}</td>
                  {record.conditions.map((condition) => {
                    const measurement = example.conditions.find((c) => c.condition === condition)
                    if (!measurement) return <td key={condition}>-</td>
                    if (!measurement.inferenceOk) {
                      return <td key={condition} className="failed">inference failed</td>
                    }
                    if (!measurement.matched) {
                      return <td key={condition} className="missed">not detected at threshold</td>
                    }
                    return <td key={condition}>{measurement.matched.score.toFixed(3)}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollRegion>

      {record.failures.length > 0 ? (
        <Callout tone="warning" title={`${record.failures.length} failure(s)`}>
          <ul>
            {record.failures.slice(0, 5).map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <Callout tone="info" title="What these numbers mean">
        They describe {record.model.id}, these photographs and these settings. They say nothing about
        other detectors, and nothing about face detection or face recognition, which are different
        tasks. Reducing person-detection confidence is not evidence about any of those.
      </Callout>
    </Section>
  )
}

function ConditionTable({
  metrics,
  conditions,
  caption,
}: {
  metrics: ReturnType<typeof aggregate>
  conditions: readonly ConditionKind[]
  caption: string
}) {
  return (
    <ScrollRegion className="table-scroll" label={`${caption} summary table`}>
      <table className="results">
        <caption>
          {caption} - {metrics.eligibleExamples} eligible, {metrics.excludedExamples} excluded
        </caption>
        <thead>
          <tr>
            <th scope="col">Condition</th>
            <th scope="col">Detection retention</th>
            <th scope="col">Conditional miss rate</th>
            <th scope="col">Baseline detected</th>
            <th scope="col">Mean matched score</th>
            <th scope="col">Mean score delta</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((condition) => {
            const row = metrics.byCondition[condition]
            if (!row) return null
            return (
              <tr key={condition}>
                <th scope="row">{CONDITION_LABELS[condition]}</th>
                <td>{formatRate(row.detectionRetention)}</td>
                <td>
                  {formatRate(row.conditionalMissRate)}
                  <small> of {row.baselineDetectedCount}</small>
                </td>
                <td>{row.baselineDetectedCount}</td>
                <td>{formatScore(row.meanMatchedScore)}</td>
                <td>
                  {formatDelta(row.meanScoreDelta)}
                  <small> from {row.observableDeltaCount}</small>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </ScrollRegion>
  )
}
