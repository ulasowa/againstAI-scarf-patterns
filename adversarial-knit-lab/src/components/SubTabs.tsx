/**
 * Grouped controls, one group visible at a time.
 *
 * The control columns are dense by nature: the generator alone has a family, a
 * variant, six shape parameters, dimensions, a repeat and a seed. Stacked, that
 * ran to several screen heights on a phone, which turns every adjustment into a
 * scroll hunt.
 *
 * Unlike the top-level workflow navigation, this really is a tab list: it
 * switches panels inside one view and is not reflected in the URL. So it gets
 * the full pattern — `tablist`/`tab`/`tabpanel`, roving tabindex, and arrow,
 * Home and End keys.
 */
import { useId, useRef, useState, type ReactNode } from 'react'

export interface SubTab {
  id: string
  label: string
  /** Rendered only while this tab is selected. */
  render: () => ReactNode
  /** Small count or marker shown next to the label. */
  badge?: string | number
}

function hasBadge(tab: SubTab): boolean {
  return tab.badge !== undefined && tab.badge !== ''
}

export function SubTabs({
  tabs,
  label,
  initial,
  active: controlled,
  onActiveChange,
}: {
  tabs: SubTab[]
  /** Accessible name for the tab list, e.g. "Generator settings". */
  label: string
  initial?: string
  /** Controlled selection, for cases where a result should pull focus to a tab. */
  active?: string
  onActiveChange?: (id: string) => void
}) {
  const baseId = useId()
  const first = tabs[0]
  const [uncontrolled, setUncontrolled] = useState(initial ?? first?.id ?? '')
  const active = controlled ?? uncontrolled
  const setActive = (id: string) => {
    setUncontrolled(id)
    onActiveChange?.(id)
  }
  const refs = useRef(new Map<string, HTMLButtonElement>())

  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active),
  )
  const current = tabs[index] ?? first
  if (!current) return null

  const focusTab = (next: number) => {
    const wrapped = (next + tabs.length) % tabs.length
    const tab = tabs[wrapped]
    if (!tab) return
    setActive(tab.id)
    refs.current.get(tab.id)?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        focusTab(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        focusTab(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusTab(0)
        break
      case 'End':
        event.preventDefault()
        focusTab(tabs.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div className="subtabs">
      <div className="subtab-list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === current.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              // The name is the label alone. Without this the badge is folded
              // into the accessible name and a tab called "Palette" becomes
              // "Palette 4" as soon as a colour is added -- a name that moves
              // is a name nothing can reliably refer to. The count is still
              // announced, as a description.
              aria-label={tab.label}
              aria-describedby={hasBadge(tab) ? `${baseId}-badge-${tab.id}` : undefined}
              // Roving tabindex: one stop for the whole group, then arrow keys.
              tabIndex={selected ? 0 : -1}
              className={selected ? 'active' : undefined}
              ref={(node) => {
                if (node) refs.current.set(tab.id, node)
                else refs.current.delete(tab.id)
              }}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
              {hasBadge(tab) ? (
                <span className="subtab-badge" id={`${baseId}-badge-${tab.id}`}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${current.id}`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        tabIndex={0}
        className="subtab-panel"
      >
        {current.render()}
      </div>
    </div>
  )
}
