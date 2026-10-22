/**
 * Edits that live in a component's local state before they reach the editor
 * store — today the notes box in the details panel (#92). Registering one makes
 * `hasUnsavedChanges()` see it and lets the leave-the-page handlers commit it
 * before they save. Its owner calls `notifyPendingEdits()` whenever it may have
 * become dirty or clean, so the save badge can say "Unsaved" meanwhile.
 */
import { useSyncExternalStore } from 'react'

export interface PendingEdit {
  isDirty: () => boolean
  /** Commit the edit to the editor store, synchronously. */
  flush: () => void
}

const pending = new Set<PendingEdit>()
const listeners = new Set<() => void>()

/** Tell subscribers that a pending edit may have become dirty or clean. */
export function notifyPendingEdits(): void {
  for (const listener of listeners) listener()
}

export function registerPendingEdit(edit: PendingEdit): () => void {
  pending.add(edit)
  notifyPendingEdits()
  return () => {
    pending.delete(edit)
    notifyPendingEdits()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether any registered edit is dirty, re-rendering when that changes. */
export function useHasPendingEdits(): boolean {
  return useSyncExternalStore(subscribe, hasPendingEdits)
}

export function hasPendingEdits(): boolean {
  for (const edit of pending) if (edit.isDirty()) return true
  return false
}

export function flushPendingEdits(): void {
  for (const edit of pending) if (edit.isDirty()) edit.flush()
}
