/**
 * Local persistence.
 *
 * IndexedDB via idb-keyval (Apache-2.0), which is a thin wrapper rather than a
 * database layer. Everything written here stays in the browser.
 *
 * Storage can be unavailable — private windows, blocked site data, exhausted
 * quota — so every call returns a result instead of throwing, and the
 * application keeps working with the current in-memory project when it fails.
 */
import { clear, del, get, keys, set } from 'idb-keyval'
import type { KnittingProject } from '../types/project'
import { serializeProject, deserializeProject } from '../features/export/projectFile'

const PROJECT_PREFIX = 'project:'
const AUTOSAVE_KEY = 'autosave'

export interface StorageOutcome<T> {
  ok: boolean
  value?: T
  error?: string
}

export interface StoredProjectSummary {
  key: string
  id: string
  title: string
  modifiedAt: string
}

function describe(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'The browser storage quota is full. Export the project as a file instead.'
  }
  return error instanceof Error ? error.message : String(error)
}

export async function isStorageAvailable(): Promise<boolean> {
  try {
    await get('__probe__')
    return true
  } catch {
    return false
  }
}

export async function saveProject(project: KnittingProject): Promise<StorageOutcome<string>> {
  const key = `${PROJECT_PREFIX}${project.id}`
  try {
    await set(key, serializeProject(project))
    return { ok: true, value: key }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function loadProject(key: string): Promise<StorageOutcome<KnittingProject>> {
  try {
    const text = await get<string>(key)
    if (!text) return { ok: false, error: 'That saved project is no longer in storage.' }
    return { ok: true, value: deserializeProject(text).project }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function listProjects(): Promise<StorageOutcome<StoredProjectSummary[]>> {
  try {
    const allKeys = (await keys()) as string[]
    const summaries: StoredProjectSummary[] = []
    for (const key of allKeys) {
      if (typeof key !== 'string' || !key.startsWith(PROJECT_PREFIX)) continue
      const text = await get<string>(key)
      if (!text) continue
      try {
        const { project } = deserializeProject(text)
        summaries.push({
          key,
          id: project.id,
          title: project.title,
          modifiedAt: project.modifiedAt,
        })
      } catch {
        // A project we can no longer parse is listed by key rather than dropped.
        summaries.push({ key, id: key, title: '(unreadable project)', modifiedAt: '' })
      }
    }
    summaries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    return { ok: true, value: summaries }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function deleteProject(key: string): Promise<StorageOutcome<void>> {
  try {
    await del(key)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function autosave(project: KnittingProject): Promise<StorageOutcome<void>> {
  try {
    await set(AUTOSAVE_KEY, serializeProject(project))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function loadAutosave(): Promise<KnittingProject | null> {
  try {
    const text = await get<string>(AUTOSAVE_KEY)
    if (!text) return null
    return deserializeProject(text).project
  } catch {
    return null
  }
}

/** Clear every saved project and the autosave slot. */
export async function clearAllStorage(): Promise<StorageOutcome<void>> {
  try {
    await clear()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

/**
 * Clear cached model artifacts. TensorFlow.js stores converted models in its
 * own IndexedDB database, which idb-keyval's store does not reach.
 */
export async function clearModelCache(): Promise<StorageOutcome<number>> {
  try {
    const tf = await import('@tensorflow/tfjs')
    const models = await tf.io.listModels()
    const urls = Object.keys(models)
    for (const url of urls) await tf.io.removeModel(url)
    return { ok: true, value: urls.length }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}
