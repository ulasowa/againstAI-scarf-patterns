/**
 * Bounded undo/redo over immutable snapshots.
 *
 * Snapshots hold the grid plus the palette, because removing a colour changes
 * both and undo has to restore them together.
 */
import type { PaletteEntry, StitchGrid } from '../../types/project'
import { cloneGrid } from './grid'

export interface ChartSnapshot {
  grid: StitchGrid
  palette: PaletteEntry[]
  label: string
}

export interface History {
  past: ChartSnapshot[]
  present: ChartSnapshot
  future: ChartSnapshot[]
  limit: number
}

export function createHistory(present: ChartSnapshot, limit = 60): History {
  return { past: [], present, future: [], limit }
}

export function pushHistory(history: History, next: ChartSnapshot): History {
  if (next.grid === history.present.grid && next.palette === history.present.palette) {
    return history
  }
  const past = [...history.past, history.present]
  if (past.length > history.limit) past.splice(0, past.length - history.limit)
  return { ...history, past, present: next, future: [] }
}

export function canUndo(history: History): boolean {
  return history.past.length > 0
}

export function canRedo(history: History): boolean {
  return history.future.length > 0
}

export function undo(history: History): History {
  if (history.past.length === 0) return history
  const previous = history.past[history.past.length - 1] as ChartSnapshot
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redo(history: History): History {
  if (history.future.length === 0) return history
  const next = history.future[0] as ChartSnapshot
  return {
    ...history,
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  }
}

export function snapshot(
  grid: StitchGrid,
  palette: PaletteEntry[],
  label: string,
): ChartSnapshot {
  return { grid: cloneGrid(grid), palette: palette.map((p) => ({ ...p })), label }
}
