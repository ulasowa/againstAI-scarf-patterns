/** Export tab: images, vector charts, printable PDFs, project files, measurements. */
import { useRef, useState } from 'react'
import type { ProjectStore } from '../../state/useProjectStore'
import { Callout, CheckboxField, NumberField, SelectField, Section, SliderField } from '../../components/ui'
import { downloadBlob, downloadText, safeFileName } from '../../lib/download'
import { canvasToBlob, renderDecoratedChartPng, renderGaugePreviewPng, renderRepeatedPng, renderTilePng } from './png'
import { chartToSvg } from './svg'
import { evaluationToCsv, evaluationToJson } from './evaluationExport'
import { deserializeProject, serializeProject } from './projectFile'
import type { PageSize } from './pdf'
import { currentEvaluations, staleEvaluations } from '../chart/project'
import { listProjects, saveProject, loadProject, deleteProject, type StoredProjectSummary } from '../../lib/persistence'
import { EXAMPLE_PROJECTS } from '../../examples'
import { SubTabs } from '../../components/SubTabs'

export function ExportPanel({ store }: { store: ProjectStore }) {
  const { project, analysis, patternHash, evidence } = store
  const [scale, setScale] = useState(10)
  const [pageSize, setPageSize] = useState<PageSize>('A4')
  const [pdfSymbols, setPdfSymbols] = useState(true)
  const [pdfInstructions, setPdfInstructions] = useState(true)
  const [svgMode, setSvgMode] = useState<'color' | 'symbol' | 'both'>('both')
  const [includeImages, setIncludeImages] = useState(false)
  const [repeatsX, setRepeatsX] = useState(3)
  const [repeatsY, setRepeatsY] = useState(3)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<StoredProjectSummary[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)

  const run = async (label: string, task: () => Promise<void> | void) => {
    setBusy(true)
    setError(null)
    try {
      await task()
      setStatus(`${label} exported.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openExample = (id: string) => {
    const entry = EXAMPLE_PROJECTS.find((e) => e.id === id)
    if (!entry) return
    try {
      // Bundled, not fetched, so this also works from a file:// page.
      const { project: imported } = deserializeProject(JSON.stringify(entry.file))
      store.replaceProject(imported)
      setStatus(`Opened the example "${entry.title}".`)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const current = currentEvaluations(project)
  const stale = staleEvaluations(project)
  const pngOptions = { gauge: project.gauge, repeat: project.repeat, scale }

  const refreshSaved = async () => {
    const outcome = await listProjects()
    if (outcome.ok && outcome.value) setSaved(outcome.value)
    else setError(outcome.error ?? 'Could not read local storage.')
  }

  const optionTabs = [
    { id: 'image', label: 'Image', render: () => (
      <>
              <Section title="Image options">
                <SliderField
                  label="Pixels per stitch"
                  value={scale}
                  min={2}
                  max={40}
                  format={(v) => `${v} px`}
                  onChange={setScale}
                />
                <NumberField label="Repeats across" value={repeatsX} min={1} max={12} onChange={setRepeatsX} />
                <NumberField label="Repeats up" value={repeatsY} min={1} max={12} onChange={setRepeatsY} />
              </Section>

      </>
    ) },
    { id: 'vector', label: 'Vector', render: () => (
      <>
              <Section title="Vector options">
                <SelectField
                  label="Chart mode"
                  value={svgMode}
                  options={[
                    { value: 'both', label: 'Colour and symbols' },
                    { value: 'color', label: 'Colour only' },
                    { value: 'symbol', label: 'Symbols only (black and white printing)' },
                  ]}
                  onChange={setSvgMode}
                />
              </Section>

      </>
    ) },
    { id: 'pdf', label: 'PDF', render: () => (
      <>
              <Section title="PDF options">
                <SelectField
                  label="Page size"
                  value={pageSize}
                  options={[
                    { value: 'A4', label: 'A4' },
                    { value: 'Letter', label: 'US Letter' },
                  ]}
                  onChange={setPageSize}
                />
                <CheckboxField label="Palette symbols in the chart" checked={pdfSymbols} onChange={setPdfSymbols} />
                <CheckboxField
                  label="Row-by-row colour instructions"
                  checked={pdfInstructions}
                  onChange={setPdfInstructions}
                />
                <p className="hint">
                  Charts too large for one page are tiled with a two-stitch overlap and corner assembly
                  marks, rather than shrunk until the cells stop being countable.
                </p>
              </Section>
      </>
    ) },
  ]

  const outputTabs = [
    { id: 'images', label: 'Images', render: () => (
      <>
              <Section title="PNG" description="Only the decorated chart contains gridlines and numbering.">
                <div className="button-row wrap">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run('Pattern tile', async () =>
                        downloadBlob(
                          await canvasToBlob(renderTilePng(project.grid, project.palette, pngOptions)),
                          safeFileName(`${project.title}-tile`, 'png'),
                        ),
                      )
                    }
                  >
                    Clean pattern tile
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run('Repeated pattern', async () =>
                        downloadBlob(
                          await canvasToBlob(
                            renderRepeatedPng(project.grid, project.palette, { ...pngOptions, repeatsX, repeatsY }),
                          ),
                          safeFileName(`${project.title}-repeat`, 'png'),
                        ),
                      )
                    }
                  >
                    Repeated pattern
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run('Gauge-correct preview', async () =>
                        downloadBlob(
                          await canvasToBlob(renderGaugePreviewPng(project.grid, project.palette, pngOptions)),
                          safeFileName(`${project.title}-gauge`, 'png'),
                        ),
                      )
                    }
                  >
                    Gauge-correct preview
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run('Decorated chart', async () =>
                        downloadBlob(
                          await canvasToBlob(
                            renderDecoratedChartPng(project.grid, project.palette, {
                              ...pngOptions,
                              showSymbols: true,
                            }),
                          ),
                          safeFileName(`${project.title}-chart`, 'png'),
                        ),
                      )
                    }
                  >
                    Decorated knitting chart
                  </button>
                </div>
              </Section>

      </>
    ) },
    { id: 'documents', label: 'Documents', render: () => (
      <>
              <Section title="SVG">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run('Vector chart', () =>
                      downloadText(
                        chartToSvg(project.grid, project.palette, {
                          cellSize: 16,
                          mode: svgMode,
                          showGrid: true,
                          showNumbers: true,
                          showRepeat: true,
                          repeat: project.repeat,
                          gaugeCorrect: false,
                          gauge: project.gauge,
                          title: project.title,
                          workingMethod: project.workingMethod,
                          includeLegend: true,
                        }),
                        safeFileName(project.title, 'svg'),
                        'image/svg+xml',
                      ),
                    )
                  }
                >
                  Vector chart with legend
                </button>
              </Section>

              <Section title="PDF">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run('Knitting document', async () => {
                      const { buildProjectPdf } = await import('./pdf')
                      const blob = await buildProjectPdf(project, analysis, patternHash, {
                        pageSize,
                        showSymbols: pdfSymbols,
                        includeInstructions: pdfInstructions,
                        evidenceStatus: evidence,
                      })
                      downloadBlob(blob, safeFileName(project.title, 'pdf'))
                    })
                  }
                >
                  Printable knitting document
                </button>
                <p className="hint">
                  Includes the title and project id, gauge and finished size, palette legend, the chart,
                  working direction, colour instructions, knitting warnings, the pattern hash and the
                  current evidence status.
                </p>
              </Section>

      </>
    ) },
    { id: 'project', label: 'Project', render: () => (
      <>
              <Section title="Project file">
                <CheckboxField
                  label="Include imported photographs"
                  checked={includeImages}
                  hint="Off by default. Photographs stay in your browser unless you deliberately put them in a file you will share."
                  onChange={setIncludeImages}
                />
                <div className="button-row">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run('Project', () =>
                        downloadText(
                          serializeProject(project),
                          safeFileName(project.title, 'json'),
                          'application/json',
                        ),
                      )
                    }
                  >
                    Export project JSON
                  </button>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                    Import project JSON
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="visually-hidden"
                    aria-label="Project file to import"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return
                      try {
                        const text = await file.text()
                        const { project: imported } = deserializeProject(text)
                        store.replaceProject(imported)
                        setStatus(`Imported ${imported.title}.`)
                        setError(null)
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e))
                      }
                    }}
                  />
                </div>
                {includeImages ? (
                  <Callout tone="warning">
                    Photographs are not yet embedded by this build. Export them from your own files if you
                    need to share them, and remember that a photograph of a person is personal data.
                  </Callout>
                ) : null}
              </Section>

              <Section
                title="Example projects"
                description="Complete projects with a palette, gauge and repeat already set. All are untested procedural candidates."
              >
                <ul className="image-list">
                  {EXAMPLE_PROJECTS.map((entry) => (
                    <li key={entry.id}>
                      <button type="button" onClick={() => openExample(entry.id)}>
                        {entry.title}
                      </button>
                      <span className="hint">{entry.description}</span>
                      <span />
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Saved in this browser">
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() =>
                      run('Project', async () => {
                        const outcome = await saveProject(project)
                        if (!outcome.ok) throw new Error(outcome.error ?? 'Could not save')
                        await refreshSaved()
                      })
                    }
                  >
                    Save to this browser
                  </button>
                  <button type="button" onClick={() => void refreshSaved()}>
                    Refresh list
                  </button>
                </div>
                {saved.length > 0 ? (
                  <ul className="image-list">
                    {saved.map((entry) => (
                      <li key={entry.key}>
                        <button
                          type="button"
                          onClick={async () => {
                            const outcome = await loadProject(entry.key)
                            if (outcome.ok && outcome.value) store.replaceProject(outcome.value)
                            else setError(outcome.error ?? 'Could not load')
                          }}
                        >
                          {entry.title}
                        </button>
                        <span className="hint">{entry.modifiedAt.slice(0, 19).replace('T', ' ')}</span>
                        <button
                          type="button"
                          className="link"
                          onClick={async () => {
                            await deleteProject(entry.key)
                            await refreshSaved()
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {store.storageWarning ? <Callout tone="warning">{store.storageWarning}</Callout> : null}
              </Section>
      </>
    ) },
    {
      id: 'data',
      label: 'Measurements',
      badge: current.length > 0 ? current.length : undefined,
      render: () => (
        <>
              <Section title="Measurements">
                {current.length === 0 && stale.length === 0 ? (
                  <p className="hint">No evaluation has been run for this project yet.</p>
                ) : null}
                {current.map((record) => (
                  <div key={record.id} className="export-record">
                    <strong>{record.model.id}</strong>
                    <span className="hint">
                      {new Date(record.createdAt).toLocaleString()} - {record.aggregate.eligibleExamples}{' '}
                      eligible example(s)
                    </span>
                    <div className="button-row">
                      <button
                        type="button"
                        onClick={() =>
                          run('Evaluation JSON', () =>
                            downloadText(
                              evaluationToJson(record),
                              safeFileName(`${project.title}-evaluation`, 'json'),
                              'application/json',
                            ),
                          )
                        }
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run('Evaluation CSV', () =>
                            downloadText(
                              evaluationToCsv(record),
                              safeFileName(`${project.title}-evaluation`, 'csv'),
                              'text/csv',
                            ),
                          )
                        }
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                ))}
                {stale.length > 0 ? (
                  <Callout tone="warning" title={`${stale.length} stale record(s)`}>
                    These were measured on a chart that has since changed. They stay in the project history
                    and can still be exported from the JSON file, but they do not describe the current
                    chart and are not offered here as current results.
                  </Callout>
                ) : null}
              </Section>

        </>
      ),
    },
  ]

  return (
    <div className="panel-grid">
      <div className="panel-column controls">
        <SubTabs tabs={optionTabs} label="Export options" />
      </div>

      <div className="panel-column main">
        {status ? <Callout tone="success">{status}</Callout> : null}
        {error ? (
          <Callout tone="error" title="Export failed">
            {error}
          </Callout>
        ) : null}
        <SubTabs tabs={outputTabs} label="Export formats" />
      </div>
    </div>
  )
}
