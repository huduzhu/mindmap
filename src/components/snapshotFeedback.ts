import type { SnapshotRecord } from '../io/db'
import { showToast } from './toastStore'
import { t } from '../i18n'

/**
 * Toast for a `createSnapshot` result. Shared by the toolbar and the command
 * palette so both entry points report a renamed (de-duplicated) snapshot the
 * same way — the old palette path reported nothing at all.
 */
export function announceSnapshot(requested: string, snapshot: SnapshotRecord | null): void {
  if (!snapshot) {
    showToast(t('snapshot.rejected'), 'error')
    return
  }
  if (snapshot.name !== requested.trim()) {
    showToast(t('snapshot.renamed', { requested: requested.trim(), name: snapshot.name }))
    return
  }
  showToast(t('snapshot.saved', { name: snapshot.name }))
}
