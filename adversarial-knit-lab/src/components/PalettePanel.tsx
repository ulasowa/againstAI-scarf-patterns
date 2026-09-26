/** Palette editing: colours, symbols, yarn notes, locking, merging, removal. */
import type { PaletteEntry, StitchGrid } from '../types/project'
import { removePaletteColor } from '../features/chart/grid'
import {
  PALETTE_PRESETS,
  applyPalettePreset,
  minimumContrast,
} from '../features/chart/palettes'
import { isValidHex } from '../lib/color'
import { newId } from '../lib/id'
import { Callout } from './ui'

export function PalettePanel({
  palette,
  grid,
  activeIndex,
  usedCounts,
  onActivate,
  onChange,
  onChartChange,
}: {
  palette: PaletteEntry[]
  grid: StitchGrid
  activeIndex: number
  usedCounts: number[]
  onActivate: (index: number) => void
  onChange: (palette: PaletteEntry[]) => void
  onChartChange: (grid: StitchGrid, palette: PaletteEntry[]) => void
}) {
  const update = (index: number, patch: Partial<PaletteEntry>) => {
    onChange(palette.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }

  const addColor = () => {
    if (palette.length >= 12) return
    onChange([
      ...palette,
      {
        id: newId('c'),
        hex: '#8a8f7a',
        symbol: SYMBOLS[palette.length % SYMBOLS.length] as string,
        name: `Colour ${palette.length + 1}`,
      },
    ])
  }

  const remove = (index: number) => {
    if (palette.length <= 2) return
    const fallback = index === 0 ? 1 : 0
    const result = removePaletteColor(grid, palette, index, fallback)
    onChartChange(result.grid, result.palette)
    onActivate(0)
  }

  const contrast = minimumContrast(palette)

  return (
    <div className="palette-panel">
      <div className="palette-presets">
        <span className="field-label">Colour presets</span>
        <div className="swatch-row">
          {PALETTE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="preset-swatch"
              title={`${preset.label} - ${preset.description}`}
              aria-label={`Use the ${preset.label} palette: ${preset.description}`}
              onClick={() => {
                const next = applyPalettePreset(grid, palette, preset)
                onChartChange(next.grid, next.palette)
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
        <p className="hint">
          Swapping a palette recolours the chart. A preset with fewer colours remaps the extras to
          the nearest shade rather than dropping them, and locked colours are kept.
        </p>
      </div>

      <ul className="palette-list">
        {palette.map((entry, index) => (
          <li key={entry.id} className={index === activeIndex ? 'active' : undefined}>
            <button
              type="button"
              className="swatch"
              style={{ background: entry.hex }}
              aria-label={`Select ${entry.name}`}
              aria-pressed={index === activeIndex}
              onClick={() => onActivate(index)}
            >
              <span aria-hidden="true">{entry.symbol}</span>
            </button>
            <div className="palette-fields">
              <input
                type="text"
                value={entry.name}
                aria-label={`Name of colour ${index + 1}`}
                maxLength={40}
                onChange={(event) => update(index, { name: event.target.value })}
              />
              {/* Only the selected colour shows its detail fields. Four colours
                  with five controls each is most of a phone screen, and you are
                  only ever editing one of them. */}
              {index === activeIndex ? (
                <>
                  <div className="palette-row">
                    <input
                      type="color"
                      value={entry.hex}
                      aria-label={`Colour of ${entry.name}`}
                      onChange={(event) => update(index, { hex: event.target.value })}
                    />
                    <input
                      type="text"
                      className="hex"
                      value={entry.hex}
                      aria-label={`Hex value of ${entry.name}`}
                      onChange={(event) => {
                        const value = event.target.value
                        if (isValidHex(value)) {
                          update(index, { hex: value.startsWith('#') ? value : `#${value}` })
                        }
                      }}
                    />
                    <input
                      type="text"
                      className="symbol"
                      value={entry.symbol}
                      maxLength={2}
                      aria-label={`Chart symbol for ${entry.name}`}
                      onChange={(event) => update(index, { symbol: event.target.value })}
                    />
                  </div>
                  <input
                    type="text"
                    className="yarn-note"
                    placeholder="Yarn note (brand, shade, dye lot)"
                    value={entry.yarnNote ?? ''}
                    maxLength={80}
                    aria-label={`Yarn note for ${entry.name}`}
                    onChange={(event) => update(index, { yarnNote: event.target.value })}
                  />
                  <div className="palette-meta">
                    <label>
                      <input
                        type="checkbox"
                        checked={entry.locked ?? false}
                        onChange={(event) => update(index, { locked: event.target.checked })}
                      />
                      Lock
                    </label>
                    <span>{((usedCounts[index] ?? 0) * 100).toFixed(1)}% of stitches</span>
                    <button
                      type="button"
                      className="link"
                      disabled={palette.length <= 2}
                      onClick={() => remove(index)}
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <div className="palette-meta">
                  <span>{((usedCounts[index] ?? 0) * 100).toFixed(1)}% of stitches</span>
                  {entry.locked ? <span>locked</span> : null}
                  {entry.yarnNote ? <span className="truncate">{entry.yarnNote}</span> : null}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={addColor} disabled={palette.length >= 12}>
        Add colour
      </button>
      {contrast < 1.6 && palette.length > 1 ? (
        <Callout tone="warning">
          The two closest colours in this palette differ by a contrast ratio of{' '}
          {contrast.toFixed(2)}. At that distance the motif will read as one colour from a few
          metres away, whatever the chart says.
        </Callout>
      ) : null}
      <Callout tone="info">
        Screen colours are approximations. Dye lot, fibre and lighting all shift a yarn, so check
        against a real ball before buying.
      </Callout>
    </div>
  )
}

const SYMBOLS = ['.', 'o', '/', 'x', '+', '=', '~', '*', '#', '-', 'v', 'c']
