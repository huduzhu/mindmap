/**
 * Edits that live in a component's local state before they reach the editor
 * store — today the notes box in the details panel (#92). Registering one makes
 * `hasUnsavedChanges()` see it and lets the leave-the-page handlers commit it
 * before they save.
 */
export interface PendingEdit {
  isDirty: () => boolean
  /** Commit the edit to the editor store, synchronously. */
  flush: () => void
}

const pending = new Set<PendingEdit>()

export function registerPendingEdit(edit: PendingEdit): () => void {
  pending.add(edit)
  return () => {
    pending.delete(edit)
  }
}

export function hasPendingEdits(): boolean {
  for (const edit of pending) if (edit.isDirty()) return true
  return false
}

export function flushPendingEdits(): void {
  for (const edit of pending) if (edit.isDirty()) edit.flush()
}
