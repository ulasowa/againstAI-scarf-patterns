/**
 * Application shell.
 *
 * Tabs are addressed through the URL hash. GitHub Pages serves static files
 * with no rewrite rules, so a path-based route would 404 on a reload; a hash
 * survives both the root deployment and a repository subpath.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { useProjectStore } from './state/useProjectStore'
import { ModelProvider } from './state/ModelContext'
import { EasyMode } from './components/EasyMode'
import { EvidenceBadge } from './components/EvidenceBadge'
import { Callout } from './components/ui'
import { GeneratePanel } from './features/generator/GeneratePanel'
import { KnitPanel } from './features/knitting/KnitPanel'
import { chartHeightCm, chartWidthCm } from './features/knitting/gauge'

const EvaluatePanel = lazy(() =>
  import('./features/evaluation/EvaluatePanel').then((m) => ({ default: m.EvaluatePanel })),
)
const ExportPanel = lazy(() =>
  import('./features/export/ExportPanel').then((m) => ({ default: m.ExportPanel })),
)

const TABS = [
  { id: 'generate', label: 'Generate' },
  { id: 'knit', label: 'Knit' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'export', label: 'Export' },
] as const

type TabId = (typeof TABS)[number]['id']

function tabFromHash(): TabId {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return (TABS.find((tab) => tab.id === raw)?.id ?? 'generate') as TabId
}

export function App() {
  return (
    <ModelProvider>
      <Workspace />
    </ModelProvider>
  )
}

/**
 * Guided mode is a per-viewer preference, so it lives in localStorage rather
 * than in the project. Storage can be unavailable in a private window or with
 * site data blocked, and the application has to work without it.
 */
const EASY_MODE_KEY = 'akl.easyMode'

function readEasyMode(): boolean {
  try {
    return window.localStorage.getItem(EASY_MODE_KEY) === '1'
  } catch {
    return false
  }
}

function Workspace() {
  const store = useProjectStore()
  const [tab, setTab] = useState<TabId>(() => tabFromHash())
  const [easy, setEasy] = useState<boolean>(() => readEasyMode())

  const toggleEasy = () => {
    const next = !easy
    setEasy(next)
    try {
      window.localStorage.setItem(EASY_MODE_KEY, next ? '1' : '0')
    } catch {
      // A remembered preference is a convenience, not a requirement.
    }
  }

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // The tab is the only thing that changes the view, so it belongs in the
  // document title: it is what a screen reader announces on navigation and
  // what a browser shows in a crowded tab strip.
  useEffect(() => {
    const label = TABS.find((entry) => entry.id === tab)?.label ?? 'Generate'
    document.title = `${label} - Adversarial Knit Lab`
  }, [tab])

  const select = (next: TabId) => {
    // The hash is the single source of truth; the listener above turns it into
    // state. Setting both here would run the transition twice, and assigning a
    // hash that is already current fires no event at all -- hence the guard.
    if (tabFromHash() === next) {
      setTab(next)
      return
    }
    window.location.hash = `#/${next}`
  }

  const { project } = store

  return (
    <div className="app">
      <header className="app-header">
        <div className="title-block">
          <h1>Adversarial Knit Lab</h1>
          <input
            className="project-title"
            value={project.title}
            aria-label="Project title"
            maxLength={120}
            onChange={(event) => store.setTitle(event.target.value)}
          />
        </div>
        <div className="header-meta">
          <span>
            {project.grid.stitches} sts x {project.grid.rows} rows
          </span>
          <span>
            {chartWidthCm(project.grid.stitches, project.gauge).toFixed(1)} x{' '}
            {chartHeightCm(project.grid.rows, project.gauge).toFixed(1)} cm
          </span>
          <EvidenceBadge status={store.evidence} />
          <button
            type="button"
            className={easy ? 'mode-toggle on' : 'mode-toggle'}
            role="switch"
            aria-checked={easy}
            onClick={toggleEasy}
          >
            <span className="mode-toggle-track" aria-hidden="true">
              <span className="mode-toggle-knob" />
            </span>
            Guided mode
          </button>
        </div>
      </header>

      {easy ? null : (
      <nav className="tabs" aria-label="Workflow">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-current={tab === entry.id ? 'page' : undefined}
            className={tab === entry.id ? 'active' : undefined}
            onClick={() => select(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      )}

      <main>
        {easy ? <EasyMode store={store} /> : (
          <>
        {tab === 'generate' ? <GeneratePanel store={store} onNavigate={select} /> : null}
        {tab === 'knit' ? <KnitPanel store={store} onNavigate={select} /> : null}
        {tab === 'evaluate' ? (
          <Suspense fallback={<p className="loading">Loading the evaluation tools...</p>}>
            <EvaluatePanel store={store} />
          </Suspense>
        ) : null}
        {tab === 'export' ? (
          <Suspense fallback={<p className="loading">Loading the export tools...</p>}>
            <ExportPanel store={store} />
          </Suspense>
        ) : null}
          </>
        )}
      </main>

      <footer className="app-footer">
        <Callout tone="info">
          This tool designs knitting charts and measures them against a detector you load yourself.
          Nothing here is known to defeat any computer-vision system. Reducing person-detection
          confidence on some photographs is not evidence about face detection, face recognition, or
          any detector other than the one that was run.
        </Callout>
        <p>
          Imported photographs and charts stay in your browser. The only external request is the
          model download, and only after you ask for it.
        </p>
      </footer>
    </div>
  )
}
