/** Knit tab: chart editing, gauge, working method, analysis, previews, instructions. */
import { useMemo, useState } from 'react'
import type { WorkingMethod } from '../../types/project'
import type { ProjectStore } from '../../state/useProjectStore'
import { ChartCanvas, type EditorTool, type Selection } from '../../components/ChartCanvas'
import { PalettePanel } from '../../components/PalettePanel'
import { TexturePreview } from '../../components/TexturePreview'
import { SubTabs } from '../../components/SubTabs'
import {
  Callout,
  CheckboxField,
  Details,
  NumberField,
  SelectField,
  Section,
  SliderField,
  Stat,
} from '../../components/ui'
import { DEFAULT_CHART_OPTIONS } from '../preview/render'
import { fillRect, floodFill, getCell, replaceColor, setCells } from '../chart/grid'
import { chartHeightCm, chartWidthCm, cellAspect, repeatFit } from './gauge'
import { METHODS, methodOf } from './methods'
import { buildInstructions, directionArrow } from './instructions'
import { suggestRepairs } from './repair'

const TOOLS: { id: EditorTool; label: string; hint: string }[] = [
  { id: 'pencil', label: 'Pencil', hint: 'Paint single stitches. Drag to draw.' },
  { id: 'fill', label: 'Fill', hint: 'Flood fill a connected region.' },
  { id: 'replace', label: 'Replace colour', hint: 'Swap every stitch of the clicked colour.' },
  { id: 'select', label: 'Select', hint: 'Drag a rectangle, then fill or clear it.' },
  { id: 'pan', label: 'Pan', hint: 'Drag to move the view. Hold Shift with any tool.' },
]

export function KnitPanel({
  store,
  onNavigate,
}: {
  store: ProjectStore
  onNavigate?: (tab: 'generate' | 'knit' | 'evaluate' | 'export') => void
}) {
  const { project, analysis } = store
  const [tool, setTool] = useState<EditorTool>('pencil')
  const [activeColor, setActiveColor] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [showNumbers, setShowNumbers] = useState(true)
  const [showSymbols, setShowSymbols] = useState(false)
  const [showRepeat, setShowRepeat] = useState(true)
  const [gaugeCorrect, setGaugeCorrect] = useState(false)
  const [cellSize, setCellSize] = useState(14)
  const [followRow, setFollowRow] = useState<number | null>(null)
  const [fabricShading, setFabricShading] = useState(true)

  const method = methodOf(project.workingMethod)
  const instructions = useMemo(
    () => buildInstructions(project.grid, project.palette, project.workingMethod),
    [project.grid, project.palette, project.workingMethod],
  )
  const repairs = useMemo(
    () =>
      suggestRepairs(
        project.grid,
        project.workingMethod,
        project.analysisOptions,
        project.palette,
      ),
    [project.grid, project.workingMethod, project.analysisOptions, project.palette],
  )
  const fit = repeatFit(project.grid, project.repeat)

  const usedCounts = useMemo(() => {
    const counts = new Array<number>(project.palette.length).fill(0)
    for (let i = 0; i < project.grid.cells.length; i++) {
      const value = project.grid.cells[i] as number
      if (value < counts.length) counts[value] = (counts[value] as number) + 1
    }
    const total = project.grid.cells.length || 1
    return counts.map((n) => n / total)
  }, [project.grid, project.palette.length])



  const chartOptions = {
    ...DEFAULT_CHART_OPTIONS,
    cellSize,
    showGrid,
    showNumbers,
    showSymbols,
    showRepeat,
    repeat: project.repeat,
    highlightRow: followRow,
    gaugeCorrect,
    gauge: project.gauge,
  }

  const toolTabs = [
    {
      id: 'tools',
      label: 'Tools',
      render: () => (
        <Section title="Tools">
          <div className="tool-row" role="radiogroup" aria-label="Editing tool">
            {TOOLS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={tool === entry.id}
                className={tool === entry.id ? 'active' : undefined}
                title={entry.hint}
                onClick={() => setTool(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button type="button" onClick={store.undo} disabled={!store.canUndo}>
              Undo
            </button>
            <button type="button" onClick={store.redo} disabled={!store.canRedo}>
              Redo
            </button>
            <button type="button" onClick={() => onNavigate?.('evaluate')}>
              Test against a model
            </button>
          </div>
          {selection ? (
            <div className="button-row">
              <button
                type="button"
                onClick={() => {
                  store.commitGrid(fillRect(project.grid, selection, activeColor), 'fill selection')
                }}
              >
                Fill selection
              </button>
              <button type="button" onClick={() => setSelection(null)}>
                Clear selection
              </button>
            </div>
          ) : null}
          <p className="hint">
            Arrow keys move the focused cell, Enter or Space applies the current tool. Ctrl or Cmd
            with the scroll wheel zooms.
          </p>
        </Section>
      ),
    },
    {
      id: 'view',
      label: 'View',
      render: () => (
        <Section title="Chart view">
          <SliderField
            label="Cell size"
            value={cellSize}
            min={4}
            max={30}
            format={(v) => `${v} px`}
            onChange={setCellSize}
          />
          <CheckboxField label="Gridlines" checked={showGrid} onChange={setShowGrid} />
          <CheckboxField
            label="Row and stitch numbers"
            checked={showNumbers}
            onChange={setShowNumbers}
          />
          <CheckboxField label="Palette symbols" checked={showSymbols} onChange={setShowSymbols} />
          <CheckboxField
            label="Repeat boundaries"
            checked={showRepeat}
            onChange={setShowRepeat}
          />
          <CheckboxField
            label="Gauge-correct cells"
            checked={gaugeCorrect}
            hint={`A stitch is ${cellAspect(project.gauge).toFixed(2)}x as wide as it is tall at this gauge. Square cells are easier to edit; gauge-correct cells show the real shape.`}
            onChange={setGaugeCorrect}
          />
          <NumberField
            label="Follow row while knitting"
            value={followRow === null ? 0 : followRow + 1}
            min={0}
            max={project.grid.rows}
            hint="0 turns the highlight off. Rows count from the bottom."
            onChange={(value) =>
              setFollowRow(value <= 0 ? null : Math.min(project.grid.rows, value) - 1)
            }
          />
        </Section>
      ),
    },
    {
      id: 'gauge',
      label: 'Gauge',
      render: () => (
        <Section title="Gauge">
          <NumberField
            label="Stitches per 10 cm"
            value={project.gauge.stitchesPer10cm}
            min={1}
            max={100}
            onChange={(value) => store.setGauge({ ...project.gauge, stitchesPer10cm: value })}
          />
          <NumberField
            label="Rows per 10 cm"
            value={project.gauge.rowsPer10cm}
            min={1}
            max={100}
            onChange={(value) => store.setGauge({ ...project.gauge, rowsPer10cm: value })}
          />
          <div className="stat-row">
            <Stat
              label="Finished size"
              value={`${chartWidthCm(project.grid.stitches, project.gauge).toFixed(1)} x ${chartHeightCm(project.grid.rows, project.gauge).toFixed(1)} cm`}
            />
            <Stat
              label="Cell aspect"
              value={cellAspect(project.gauge).toFixed(2)}
              hint="width / height"
            />
          </div>
        </Section>
      ),
    },
    {
      id: 'method',
      label: 'Method',
      render: () => (
        <Section title="Working method">
          <SelectField
            label="Method"
            value={project.workingMethod}
            hint={method.guidance}
            options={Object.values(METHODS).map((m) => ({
              value: m.id as WorkingMethod,
              label: m.label,
            }))}
            onChange={store.setWorkingMethod}
          />
          <Callout tone="info" title="Reading direction">
            {method.direction}
          </Callout>
          <NumberField
            label="Long-float warning at"
            value={project.analysisOptions.longFloatThreshold}
            min={2}
            max={40}
            hint="A configurable warning threshold, not a rule about what can be knitted."
            onChange={(value) =>
              store.setAnalysisOptions({ ...project.analysisOptions, longFloatThreshold: value })
            }
          />
          <NumberField
            label="Colours allowed per row"
            value={project.analysisOptions.maxColorsPerRow}
            min={1}
            max={8}
            hint="Stranded colourwork convention is two. A chart may use more colours overall as long as each row stays within this."
            onChange={(value) =>
              store.setAnalysisOptions({ ...project.analysisOptions, maxColorsPerRow: value })
            }
          />
        </Section>
      ),
    },
  ]

  const sideTabs = [
    {
      id: 'palette',
      label: 'Palette',
      badge: project.palette.length,
      render: () => (
        <Section title="Palette">
          <PalettePanel
            palette={project.palette}
            grid={project.grid}
            activeIndex={activeColor}
            usedCounts={usedCounts}
            onActivate={setActiveColor}
            onChange={store.setPalette}
            onChartChange={(grid, palette) => {
              store.commitChart(grid, palette, 'remove colour')
              setActiveColor(0)
            }}
          />
        </Section>
      ),
    },
    {
      id: 'analysis',
      label: 'Analysis',
      badge: analysis.warnings.length > 0 ? analysis.warnings.length : undefined,
      render: () => (
        <Section title="Knitting analysis">
          <div className="stat-row">
            <Stat label="Colours" value={String(analysis.totalColors)} />
            <Stat label="Most in one row" value={String(analysis.maxColorsInAnyRow)} />
          </div>
          <div className="stat-row">
            <Stat
              label="Longest float"
              value={method.stranded ? `${analysis.longestFloat} sts` : 'n/a'}
              hint={method.stranded ? undefined : 'Not applicable to this method'}
            />
            <Stat label="Longest colour run" value={`${analysis.longestColorRun} sts`} />
          </div>
          <div className="stat-row">
            <Stat label="Isolated regions" value={String(analysis.isolatedRegions.length)} />
            <Stat
              label="Repeats fit"
              value={
                fit.fitsHorizontally && fit.fitsVertically
                  ? `${fit.horizontalRepeats} x ${fit.verticalRepeats}`
                  : 'no'
              }
              hint={
                fit.fitsHorizontally && fit.fitsVertically
                  ? undefined
                  : `${fit.horizontalRemainder} sts / ${fit.verticalRemainder} rows left over`
              }
            />
          </div>
          {analysis.warnings.map((warning) => (
            <Callout key={warning.id} tone={warning.severity === 'warning' ? 'warning' : 'info'}>
              {warning.message}
            </Callout>
          ))}
          {analysis.warnings.length === 0 ? (
            <Callout tone="success">No warnings at the current thresholds.</Callout>
          ) : null}

          <Details summary="How floats and colour runs are counted">
            <p>
              A <strong>colour run</strong> is consecutive stitches of one colour in a row. A{' '}
              <strong>float</strong> is the yarn carried behind the fabric between two stitches
              worked in the same colour, measured in stitches passed over. They are not the same
              thing: a long run only becomes a long float for a yarn that is actually in use on
              that row, on both sides of the run.
            </p>
            <p>
              Stitches before a colour first appears in a row and after it last appears are not
              counted, because the yarn is introduced and dropped there. Yarn dominance and
              catching floats mid-span are out of scope. In circular knitting the join between the
              last and first stitch of a round is analysed as well.
            </p>
          </Details>
        </Section>
      ),
    },
    {
      id: 'repairs',
      label: 'Repairs',
      badge: repairs.length > 0 ? repairs.length : undefined,
      render: () => (
        <Section
          title="Suggested repairs"
          description="Previewed first. Nothing is applied until you ask."
        >
          {repairs.length === 0 ? (
            <p className="hint">Nothing to suggest at the current thresholds.</p>
          ) : (
            repairs.map((repair) => (
              <div key={repair.id} className="repair">
                <strong>{repair.label}</strong>
                <p className="hint">{repair.description}</p>
                <button type="button" onClick={() => store.commitGrid(repair.apply(), repair.id)}>
                  Apply, changing {repair.affectedStitches} stitch(es)
                </button>
              </div>
            ))
          )}
          <Callout tone="warning">
            Any repair that changes visible stitches makes existing evaluation results stale.
          </Callout>
        </Section>
      ),
    },
  ]

  const lowerTabs = [
    {
      id: 'previews',
      label: 'Previews',
      render: () => (
        <>
          <div className="preview-row">
            <TexturePreview
              grid={project.grid}
              palette={project.palette}
              gauge={project.gauge}
              repeatsX={3}
              height={190}
              label="Gauge-correct repeated texture"
            />
            <TexturePreview
              grid={project.grid}
              palette={project.palette}
              gauge={project.gauge}
              repeatsX={1.4}
              height={190}
              fabricShading={fabricShading}
              label="Approximate knitted fabric - an illustration, not a physical simulation"
            />
          </div>
          <CheckboxField
            label="Draw stitch texture in the fabric preview"
            checked={fabricShading}
            onChange={setFabricShading}
          />
        </>
      ),
    },
    {
      id: 'sequence',
      label: 'Colour sequence',
      render: () => (
        <Section title="Colour sequence" description={instructions.convention}>
          <ol className="instructions" tabIndex={0} aria-label="Colour sequence by row">
            {instructions.rows
              .slice()
              .reverse()
              .map((row) => (
                <li
                  key={row.number}
                  className={followRow === row.internalRow ? 'active' : undefined}
                >
                  <code>
                    {directionArrow(row)} {row.unit} {row.number}
                    {row.side ? ` (${row.side})` : ''}
                  </code>
                  <span>{row.text}</span>
                </li>
              ))}
          </ol>
          <p className="hint">
            Listed top of the chart first, the way you read it on paper. The numbers are the
            working order: row 1 is knitted first.
          </p>
        </Section>
      ),
    },
  ]

  return (
    <div className="panel-grid three">
      <div className="panel-column controls">
        <SubTabs tabs={toolTabs} label="Chart tools and settings" />
      </div>

      <div className="panel-column main">
        <ChartCanvas
          grid={project.grid}
          palette={project.palette}
          options={chartOptions}
          tool={tool}
          zoom={zoom}
          onZoomChange={setZoom}
          selection={selection}
          ariaLabel={`Colourwork chart, ${project.grid.stitches} stitches by ${project.grid.rows} rows`}
          onPaint={(cells) => store.commitGrid(setCells(project.grid, cells, activeColor), 'pencil')}
          onFill={(cell) =>
            store.commitGrid(
              floodFill(project.grid, cell.row, cell.column, activeColor, method.circular),
              'fill',
            )
          }
          onReplace={(cell) =>
            store.commitGrid(
              replaceColor(project.grid, getCell(project.grid, cell.row, cell.column), activeColor),
              'replace colour',
            )
          }
          onSelect={setSelection}
        />
        <SubTabs tabs={lowerTabs} label="Chart previews and instructions" />
      </div>

      <div className="panel-column side">
        <SubTabs tabs={sideTabs} label="Palette and analysis" />
      </div>
    </div>
  )
}
