/**
 * One loaded model, shared by every tab.
 *
 * The detector is an 18 MB download. Loading it separately for the pattern
 * probe in the Generate tab and the evaluation in the Evaluate tab would
 * download it twice and hold two copies in GPU memory, so it lives here.
 *
 * Loading stays explicit: nothing is fetched until something asks.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ModelAdapter } from '../features/evaluation/adapter'
import { MODEL_REGISTRY, createAdapter } from '../features/evaluation/registry'

export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface ModelController {
  modelId: string
  setModelId: (id: string) => void
  state: ModelLoadState
  message: string
  error: string | null
  /** Null until a model has finished loading. */
  adapter: ModelAdapter | null
  isReady: boolean
  load: () => Promise<void>
  dispose: () => void
}

const ModelContext = createContext<ModelController | null>(null)

export function ModelProvider({ children }: { children: ReactNode }) {
  const adapterRef = useRef<ModelAdapter | null>(null)
  const [modelId, setModelIdState] = useState(MODEL_REGISTRY[0]?.id ?? '')
  const [state, setState] = useState<ModelLoadState>('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, forceRender] = useState(0)

  const dispose = useCallback(() => {
    adapterRef.current?.dispose()
    adapterRef.current = null
    setState('idle')
    setMessage('')
    forceRender((n) => n + 1)
  }, [])

  const setModelId = useCallback(
    (id: string) => {
      setModelIdState(id)
      dispose()
    },
    [dispose],
  )

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      adapterRef.current?.dispose()
      const adapter = createAdapter(modelId)
      adapterRef.current = adapter
      await adapter.load({ onProgress: (_fraction, text) => setMessage(text) })
      setState('ready')
      setMessage(`Ready on the ${adapter.backend()} backend`)
      forceRender((n) => n + 1)
    } catch (caught) {
      setState('error')
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [modelId])

  const value = useMemo<ModelController>(
    () => ({
      modelId,
      setModelId,
      state,
      message,
      error,
      adapter: state === 'ready' ? adapterRef.current : null,
      isReady: state === 'ready' && adapterRef.current !== null,
      load,
      dispose,
    }),
    [modelId, setModelId, state, message, error, load, dispose],
  )

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>
}

export function useModel(): ModelController {
  const value = useContext(ModelContext)
  if (!value) throw new Error('useModel must be used inside a ModelProvider')
  return value
}
