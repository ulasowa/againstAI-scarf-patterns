/** Generate tab: pattern families, parameters, candidate batches, image import. */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { GeneratorParams, PatternFamily, StitchGrid } from '../../types/project'
import { GENERATOR_VERSION } from '../../types/project'
import { FAMILIES, getFamily, paramsForFamily } from './families'
import { generatePattern, makeSettings, randomSeed } from './generate'
import { PRESETS } from './presets'
import { cellAspect, chartHeightCm, chartWidthCm } from '../knitting/gauge'
import { decodeImageFile, imageToChart, rowsForAspect, type DitherMode } from '../chart/imageImport'
import { assertDimensions, MAX_ROWS, MAX_STITCHES } from '../chart/grid'
import type { ProjectStore } from '../../state/useProjectStore'
import { Callout, CheckboxField, Details, NumberField, SelectField, Section, SliderField } from '../../components/ui'
import { TexturePreview } from '../../components/TexturePreview'
import { SubTabs } from '../../components/SubTabs'
import { PatternProbePanel } from '../../components/PatternProbePanel'
import { SIZE_PRESETS, sizeToStitches } from '../knitting/garments'
import { nowIso } from '../../lib/id'
import { useDebounced } from '../../lib/useDebounced'

interface CandidatePreview {
  seed: number
  grid: StitchGrid
}

export function GeneratePanel({
  store,
  onNavigate,
}: {
  store: ProjectStore
  onNavigate?: (tab: 'generate' | 'knit' | 'evaluate' | 'export') => void
}) {
  const { project } = store
  const [family, setFamily] = useState<PatternFamily>(project.generator?.family ?? 'multiscale-interference')
  const [seed, setSeed] = useState(project.generator?.seed ?? 481_502)
  const [params, setParams] = useState<GeneratorParams>(
    project.generator?.params ?? paramsForFamily('multiscale-interference'),
  )
  const [stitches, setStitches] = useState(project.grid.stitches)
  const [rows, setRows] = useState(project.grid.rows)
  const [colorCount, setColorCount] = useState(project.palette.length)
  const [candidates, setCandidates] = useState<CandidatePreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [dither, setDither] = useState<DitherMode>('none')
  const [sizeMode, setSizeMode] = useState<'stitches' | 'centimetres'>('centimetres')
  const [widthCm, setWidthCm] = useState(25)
  const [lengthCm, setLengthCm] = useState(28.6)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const descriptor = getFamily(family)

  /** Applying a finished size converts through the gauge, then sets the chart. */
  const applySize = (nextWidthCm: number, nextLengthCm: number) => {
    setWidthCm(nextWidthCm)
    setLengthCm(nextLengthCm)
    const size = sizeToStitches(nextWidthCm, nextLengthCm, project.gauge)
    setStitches(size.stitches)
    setRows(size.rows)
    return size
  }

  const sizeNow = sizeToStitches(widthCm, lengthCm, project.gauge)
  const rowAspect = cellAspect(project.gauge)

  const build = useCallback(
    (useSeed: number, useParams: GeneratorParams, useFamily: PatternFamily) =>
      generatePattern({
        settings: makeSettings(useFamily, useSeed, useParams),
        stitches,
        rows,
        colorCount: Math.min(colorCount, project.palette.length),
        repeat: project.repeat,
        rowAspect,
      }),
    [stitches, rows, colorCount, project.palette.length, project.repeat, rowAspect],
  )

  // The preview follows the controls rather than chasing them: at larger chart
  // sizes a regeneration costs over 100 ms, which a slider would feel.
  const previewSeed = useDebounced(seed)
  const previewParams = useDebounced(params)
  const preview = useMemo(() => {
    try {
      assertDimensions(stitches, rows)
      return build(previewSeed, previewParams, family)
    } catch {
      return null
    }
  }, [build, previewSeed, previewParams, family, stitches, rows])

  const apply = (grid: StitchGrid, useSeed: number, useParams: GeneratorParams, useFamily: PatternFamily) => {
    store.commitGrid(grid, 'generate')
    store.setGenerator({ family: useFamily, version: GENERATOR_VERSION, seed: useSeed, params: useParams })
    setError(null)
  }

  const regenerate = () => {
    try {
      assertDimensions(stitches, rows)
      apply(build(seed, params, family), seed, params, family)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const randomise = () => {
    const next = randomSeed()
    setSeed(next)
    try {
      apply(build(next, params, family), next, params, family)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const generateBatch = () => {
    try {
      assertDimensions(stitches, rows)
      const batch: CandidatePreview[] = []
      for (let i = 0; i < 6; i++) {
        const candidateSeed = randomSeed()
        batch.push({ seed: candidateSeed, grid: build(candidateSeed, params, family) })
      }
      setCandidates(batch)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setFamily(preset.family)
    setSeed(preset.seed)
    setParams(preset.params)
    setStitches(preset.stitches)
    setRows(preset.rows)
    setColorCount(preset.colorCount)
    store.setRepeat(preset.repeat)
    const grid = generatePattern({
      settings: makeSettings(preset.family, preset.seed, preset.params),
      stitches: preset.stitches,
      rows: preset.rows,
      colorCount: Math.min(preset.colorCount, project.palette.length),
      repeat: preset.repeat,
      rowAspect,
    })
    apply(grid, preset.seed, preset.params, preset.family)
  }

  const handleImport = async (file: File) => {
    setImportStatus('Decoding image...')
    setError(null)
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await decodeImageFile(file)
      const targetRows = rowsForAspect(stitches, bitmap.width, bitmap.height, project.gauge)
      const boundedRows = Math.min(MAX_ROWS, targetRows)
      setImportStatus('Reducing to the yarn palette...')
      const result = await imageToChart(bitmap, {
        stitches,
        rows: boundedRows,
        gauge: project.gauge,
        paletteMode: 'extract',
        colorCount: Math.min(colorCount, 12),
        palette: project.palette,
        backgroundHex: project.palette[0]?.hex ?? '#ffffff',
        dither,
      })
      setRows(boundedRows)
      // One undo step covering the chart and the palette it brought with it.
      store.commitChart(result.grid, result.palette, 'import image')
      store.setGenerator({
        family: 'imported-image',
        version: GENERATOR_VERSION,
        seed: 0,
        params: { ...params, variant: 'imported' },
      })
      store.setSourceImage({
        fileName: file.name,
        width: bitmap.width,
        height: bitmap.height,
        contentHash: result.contentHash,
        importedAt: nowIso(),
      })
      setImportStatus(
        `Imported ${file.name} at ${stitches} x ${boundedRows} stitches. Add the source and licence in the Knit tab if you plan to share this chart.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setImportStatus(null)
    } finally {
      bitmap?.close()
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const controlTabs = [
    {
      id: 'presets',
      label: 'Presets',
      render: () => (
        <Section
          title="Start from a preset"
          description="Each preset is a procedural candidate. None has been tested against a model."
        >
          <div className="preset-list">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)}>
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </Section>
      ),
    },
    {
      id: 'pattern',
      label: 'Pattern',
      render: () => (
        <>
          <Section title="Pattern family">
            <SelectField
              label="Family"
              value={family}
              hint={descriptor.summary}
              options={FAMILIES.filter((f) => f.id !== 'imported-image').map((f) => ({
                value: f.id,
                label: f.label,
              }))}
              onChange={(value) => {
                setFamily(value)
                setParams(paramsForFamily(value))
              }}
            />
            <SelectField
              label="Variant"
              value={params.variant}
              hint={descriptor.variants.find((v) => v.id === params.variant)?.description}
              options={descriptor.variants.map((v) => ({ value: v.id, label: v.label }))}
              onChange={(variant) => setParams({ ...params, variant })}
            />
          </Section>
          <Section title="Seed">
            <NumberField label="Seed" value={seed} step={1} onChange={setSeed} />
            <div className="button-row">
              <button type="button" className="primary" onClick={regenerate}>
                Regenerate
              </button>
              <button type="button" onClick={randomise}>
                Random seed
              </button>
              <button type="button" onClick={generateBatch}>
                Generate 6 candidates
              </button>
            </div>
            <p className="hint">
              Generator {GENERATOR_VERSION}. The seed, every parameter and the generator version
              are stored with the project, so the same chart can always be rebuilt.
            </p>
          </Section>
        </>
      ),
    },
    {
      id: 'size',
      label: 'Size',
      render: () => (
        <>
          <Section
            title="Finished size"
            description="Stitch counts follow from the size and the gauge. Nothing here is a garment pattern; it is a rectangle of the stated size."
          >
            <div className="preset-list compact">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    applySize(preset.widthCm, preset.lengthCm)
                    setSizeMode('centimetres')
                    store.setWorkingMethod(preset.method)
                  }}
                >
                  <strong>
                    {preset.label} - {preset.widthCm} x {preset.lengthCm} cm
                  </strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>

            <SelectField
              label="Set the size by"
              value={sizeMode}
              options={[
                { value: 'centimetres', label: 'Finished measurements (cm)' },
                { value: 'stitches', label: 'Stitch and row counts' },
              ]}
              onChange={setSizeMode}
            />

            {sizeMode === 'centimetres' ? (
              <>
                <NumberField
                  label={
                    project.workingMethod === 'circular-stranded'
                      ? 'Circumference (cm)'
                      : 'Width (cm)'
                  }
                  value={widthCm}
                  min={1}
                  max={300}
                  step={1}
                  onChange={(value) => applySize(value, lengthCm)}
                />
                <NumberField
                  label="Length (cm)"
                  value={lengthCm}
                  min={1}
                  max={300}
                  step={1}
                  onChange={(value) => applySize(widthCm, value)}
                />
                <p className="hint">
                  {sizeNow.stitches} stitches x {sizeNow.rows} rows at{' '}
                  {project.gauge.stitchesPer10cm}/{project.gauge.rowsPer10cm} per 10 cm, finishing{' '}
                  {sizeNow.actualWidthCm.toFixed(1)} x {sizeNow.actualLengthCm.toFixed(1)} cm after
                  rounding to whole stitches.
                </p>
                {sizeNow.warning ? <Callout tone="warning">{sizeNow.warning}</Callout> : null}
              </>
            ) : (
              <>
                <NumberField
                  label="Stitches"
                  value={stitches}
                  min={4}
                  max={MAX_STITCHES}
                  onChange={setStitches}
                />
                <NumberField label="Rows" value={rows} min={4} max={MAX_ROWS} onChange={setRows} />
                <p className="hint">
                  {chartWidthCm(stitches, project.gauge).toFixed(1)} x{' '}
                  {chartHeightCm(rows, project.gauge).toFixed(1)} cm at{' '}
                  {project.gauge.stitchesPer10cm}/{project.gauge.rowsPer10cm} per 10 cm.
                </p>
              </>
            )}

            <NumberField
              label="Colours used"
              value={colorCount}
              min={1}
              max={project.palette.length}
              hint={`The palette holds ${project.palette.length}. Change it in the Knit tab.`}
              onChange={setColorCount}
            />
            <p className="hint">
              Gauge is set in the Knit tab. Change it there and these numbers follow.
            </p>
          </Section>

          <Section title="Repeat">
            <NumberField
              label="Repeat stitches"
              value={project.repeat.stitches}
              min={2}
              max={MAX_STITCHES}
              onChange={(value) => store.setRepeat({ ...project.repeat, stitches: value })}
            />
            <NumberField
              label="Repeat rows"
              value={project.repeat.rows}
              min={2}
              max={MAX_ROWS}
              onChange={(value) => store.setRepeat({ ...project.repeat, rows: value })}
            />
            <CheckboxField
              label="Generate a seamless tile"
              checked={params.tileRepeat}
              hint={
                descriptor.supportsTiling
                  ? 'The field is built on a periodic construction, so the tile genuinely repeats. Repeating a non-periodic image would only look like a tile.'
                  : 'This family does not produce a periodic tile.'
              }
              onChange={(tileRepeat) => setParams({ ...params, tileRepeat })}
            />
          </Section>
        </>
      ),
    },
    {
      id: 'shape',
      label: 'Shape',
      render: () => (
        <Section title="Shape">
          <SliderField
            label="Feature size"
            value={params.featureSize}
            min={2}
            max={28}
            step={0.5}
            format={(v) => `${v} sts`}
            hint="Approximate diameter of one shape, in stitches."
            onChange={(featureSize) => setParams({ ...params, featureSize })}
          />
          <SliderField
            label="Coarse / fine balance"
            value={params.detailBalance}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(detailBalance) => setParams({ ...params, detailBalance })}
          />
          <SliderField
            label="Contrast"
            value={params.contrast}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(contrast) => setParams({ ...params, contrast })}
          />
          <SliderField
            label="Density"
            value={params.density}
            min={0.05}
            max={0.95}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            hint="Share of the chart covered by colours other than the background."
            onChange={(density) => setParams({ ...params, density })}
          />
          <SliderField
            label="Domain warp"
            value={params.warp}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(warp) => setParams({ ...params, warp })}
          />
          <SliderField
            label="Symmetry"
            value={params.symmetry}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            hint="Probability that a horizontal band is mirrored."
            onChange={(symmetry) => setParams({ ...params, symmetry })}
          />
          <SliderField
            label="Minimum region"
            value={params.minRegion}
            min={0}
            max={8}
            format={(v) => (v === 0 ? 'off' : `${v} sts`)}
            hint="Absorbs regions this small into their surroundings. Boundary-aware for tiles."
            onChange={(minRegion) => setParams({ ...params, minRegion })}
          />
        </Section>
      ),
    },
    {
      id: 'image',
      label: 'Image',
      render: () => (
        <Section title="Import an image" description="Converted locally. Nothing is uploaded.">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Image file to convert into a chart"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
            }}
          />
          <SelectField
            label="Dithering"
            value={dither}
            hint="Off by default: isolated alternating stitches are awkward in stranded colourwork and read as noise in the fabric."
            options={[
              { value: 'none', label: 'None (recommended)' },
              { value: 'floyd-steinberg', label: 'Floyd-Steinberg' },
              { value: 'atkinson', label: 'Atkinson' },
              { value: 'stucki', label: 'Stucki' },
              { value: 'jarvis', label: 'Jarvis' },
              { value: 'sierra-lite', label: 'Sierra Lite' },
            ]}
            onChange={setDither}
          />
          {importStatus ? <Callout tone="success">{importStatus}</Callout> : null}
          <p className="hint">
            Do not import third-party pattern assets or paper figures you do not have permission
            to use. Record the source and licence with the project.
          </p>
        </Section>
      ),
    },
  ]

  return (
    <div className="panel-grid">
      <div className="panel-column controls">
        <SubTabs tabs={controlTabs} label="Generator settings" />
      </div>

      <div className="panel-column main">
        {error ? (
          <Callout tone="error" title="Could not generate">
            {error}
          </Callout>
        ) : null}
        <Section
          title="Preview"
          description="Three repeats across, so a tile seam shows up if there is one."
        >
          {preview ? (
            <>
              <TexturePreview
                grid={preview}
                palette={project.palette}
                gauge={project.gauge}
                repeatsX={3}
                height={280}
                label="Generated pattern, repeated three times across at gauge-correct proportions"
              />
              <div className="button-row">
                <button type="button" className="primary" onClick={regenerate}>
                  Save this candidate to the editor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    regenerate()
                    onNavigate?.('evaluate')
                  }}
                >
                  Save and test against a model
                </button>
              </div>
            </>
          ) : (
            <Callout tone="warning">Adjust the dimensions to preview this pattern.</Callout>
          )}
        </Section>

        {preview ? (
          <PatternProbePanel
            grid={preview}
            palette={project.palette}
            gauge={project.gauge}
            patternHash={`${store.patternHash}:${seed}:${JSON.stringify(params)}`}
          />
        ) : null}

        {candidates.length > 0 ? (
          <Section title="Candidate batch" description="Compare, then save one to the editor.">
            <div className="candidate-grid">
              {candidates.map((candidate) => (
                <figure key={candidate.seed}>
                  <TexturePreview
                    grid={candidate.grid}
                    palette={project.palette}
                    gauge={project.gauge}
                    repeatsX={2}
                    height={120}
                    label={`Candidate with seed ${candidate.seed}`}
                  />
                  <figcaption>
                    <code>{candidate.seed}</code>
                    <button
                      type="button"
                      onClick={() => {
                        setSeed(candidate.seed)
                        apply(candidate.grid, candidate.seed, params, family)
                      }}
                    >
                      Use
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Section>
        ) : null}

        <Details summary="What these patterns are, and what they are not">
          <p>
            These are exploratory visual baselines inspired by the repeating-texture and
            natural-camouflage literature. They are not reproductions of any published attack, and
            no procedural pattern here is known to affect any computer-vision system.
          </p>
          <p>
            A pattern only earns a measurement in the Evaluate tab, against a named model, on your
            own photographs. Even then the result describes that model and those images. It says
            nothing about other detectors, and nothing about face detection or face recognition,
            which are different tasks.
          </p>
        </Details>
      </div>
    </div>
  )
}
