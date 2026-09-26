/** Small shared controls. Every input is labelled and keyboard reachable. */
import { useId, type ReactNode } from 'react'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step?: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="slider-row">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <output htmlFor={id}>{format ? format(value) : value}</output>
        </div>
      )}
    </Field>
  )
}

export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
      )}
    </Field>
  )
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="field checkbox">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function Callout({
  tone = 'info',
  title,
  children,
  /** Static explanatory text does not need announcing; feedback does. */
  live = tone === 'error' || tone === 'success',
}: {
  tone?: 'info' | 'warning' | 'error' | 'success'
  title?: string
  children: ReactNode
  live?: boolean
}) {
  return (
    <div
      className={`callout callout-${tone}`}
      role={tone === 'error' ? 'alert' : live ? 'status' : undefined}>
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  )
}

export function Section({
  title,
  description,
  children,
  right,
}: {
  title: string
  description?: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <section className="panel-section">
      <header>
        {/* h2 under the page h1: skipping a level leaves screen-reader users
            without a usable outline. */}
        <h2>{title}</h2>
        {right}
      </header>
      {description ? <p className="hint">{description}</p> : null}
      {children}
    </section>
  )
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="methodology">
      <summary>{summary}</summary>
      <div>{children}</div>
    </details>
  )
}

/**
 * A scrollable box that keyboard users can actually reach.
 *
 * `overflow: auto` alone creates a region a mouse can scroll and a keyboard
 * cannot; it needs to be focusable and named.
 */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className} tabIndex={0} role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  )
}
