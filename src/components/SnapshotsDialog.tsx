import { useEffect, useId, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { SnapshotRecord } from '../io/db'
import { tn, useLocale, useT } from '../i18n'
import '../i18n/en/snapshots'
import { useProjects } from '../store/projects'
import { countNodes } from '../store/treeOps'
import { ConfirmDialog } from './ConfirmDialog'
import { askSnapshotName } from './projectPrompts'
import { askText, MAX_NAME_CHARS, nameProblem } from './promptStore'
import { showToast } from './toastStore'
import { formatDateTime } from '../i18n/dates'

type Pending = { kind: 'restore' | 'delete'; name: string }

/** Newest first; the store lists them in key (name) order. */
const byDate = (a: SnapshotRecord, b: SnapshotRecord) => b.createdAt.localeCompare(a.createdAt)

/**
 * Named snapshots of the open project (#98): when each was taken, how big it
 * is, and Restore / Rename / Delete — the last two asking first. Replaces the
 * loose strip that used to open between the toolbar rows.
 */
export function SnapshotsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const snapshots = useProjects((s) => s.snapshots)
  const [pending, setPending] = useState<Pending | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  useEffect(() => {
    void useProjects.getState().listSnapshots()
  }, [])

  const formatDate = (iso: string) => formatDateTime(iso, locale)

  const rename = async (name: string) => {
    const next = await askText({
      title: t('snapshots.renameTitle'),
      label: t('prompt.snapshotLabel'),
      initial: name,
      confirmLabel: t('snapshots.rename'),
      maxLength: MAX_NAME_CHARS,
      validate: nameProblem,
    })
    if (next === null || next.trim() === name) return
    const renamed = await useProjects.getState().renameSnapshot(name, next)
    if (renamed) showToast(t('snapshots.renamed', { name: renamed }))
    else showToast(t('snapshots.renameFailed', { name }), 'error')
  }

  const confirm = (action: Pending) => {
    setPending(null)
    const projects = useProjects.getState()
    const { name } = action
    if (action.kind === 'restore') {
      void projects.restoreSnapshot(name).then((restored) => {
        if (restored) {
          showToast(t('toast.snapshotRestored', { name }))
          onClose()
        } else showToast(t('toast.snapshotRestoreFailed', { name }), 'error')
      })
    } else {
      void projects.deleteSnapshot(name).then((deleted) => {
        if (deleted) showToast(t('toast.snapshotDeleted', { name }))
        else showToast(t('toast.snapshotDeleteFailed', { name }), 'error')
      })
    }
  }

  const sorted = [...snapshots].sort(byDate)
  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog snapshots-dialog"
        role="dialog"
        aria-labelledby={titleId}
        data-testid="snapshots-dialog"
      >
        <h2 id={titleId}>{t('snapshots.title')}</h2>
        <p className="muted">{t('snapshots.intro')}</p>
        {sorted.length === 0 ? (
          <p className="muted" data-testid="snapshots-empty">
            {t('toolbar.noSnapshots')}
          </p>
        ) : (
          <ul className="project-list snapshot-list-dialog">
            {sorted.map((snapshot) => (
              <li key={snapshot.name} data-testid="snapshot-row">
                <span className="snapshot-name">{snapshot.name}</span>
                <span className="muted">
                  {t('snapshots.meta', {
                    date: formatDate(snapshot.createdAt),
                    nodes: tn('snapshots.nodes', countNodes(snapshot.project.map)),
                  })}
                </span>
                <button
                  type="button"
                  aria-label={t('toolbar.restoreSnapshot', { name: snapshot.name })}
                  onClick={() => setPending({ kind: 'restore', name: snapshot.name })}
                >
                  {t('snapshots.restore')}
                </button>
                <button
                  type="button"
                  aria-label={t('snapshots.renameLabel', { name: snapshot.name })}
                  onClick={() => void rename(snapshot.name)}
                >
                  {t('snapshots.rename')}
                </button>
                <button
                  type="button"
                  className="danger"
                  aria-label={t('toolbar.deleteSnapshot', { name: snapshot.name })}
                  onClick={() => setPending({ kind: 'delete', name: snapshot.name })}
                >
                  {t('snapshots.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={() => void askSnapshotName()}>
            {t('menu.saveSnapshot')}
          </button>
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'restore' ? t('snapshots.restoreTitle') : t('snapshots.deleteTitle')
          }
          message={
            pending.kind === 'restore'
              ? t('snapshots.confirmRestore', { name: pending.name })
              : t('snapshots.confirmDelete', { name: pending.name })
          }
          confirmLabel={pending.kind === 'restore' ? t('snapshots.restore') : t('snapshots.delete')}
          onClose={() => setPending(null)}
          onConfirm={() => confirm(pending)}
        />
      )}
    </div>
  )
}
