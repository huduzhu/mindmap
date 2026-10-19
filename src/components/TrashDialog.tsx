import { useId, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useProjects } from '../store/projects'
import {
  daysLeftLabel,
  isTrashAutoPurgeOn,
  setTrashAutoPurge,
  TRASH_RETENTION_DAYS,
} from '../store/session'
import { ConfirmDialog } from './ConfirmDialog'
import { useT } from '../i18n'
import '../i18n/en/trash'
import { formatDateTime } from '../i18n/dates'

export function TrashDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const trashed = useProjects((state) => state.trashed)
  const projects = useProjects.getState()
  const [purgeId, setPurgeId] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [autoPurge, setAutoPurge] = useState(isTrashAutoPurgeOn)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  const purgeTarget = purgeId ? trashed.find((record) => record.id === purgeId) : undefined

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="dialog" role="dialog" data-testid="trash-dialog">
        <h2 id={titleId}>{t('trash.title')}</h2>
        {trashed.length === 0 ? (
          <p className="muted">{t('trash.empty')}</p>
        ) : (
          <ul className="project-list">
            {trashed.map((record) => (
              <li key={record.id}>
                <span>{record.project.name}</span>
                <span className="muted">
                  {formatDateTime(record.updatedAt)}
                  {autoPurge ? ` · ${daysLeftLabel(record.deletedAt)}` : ''}
                </span>
                <button type="button" onClick={() => void projects.restore(record.id)}>
                  {t('trash.restore')}
                </button>
                <button type="button" className="danger" onClick={() => setPurgeId(record.id)}>
                  {t('trash.deleteForever')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="trash-auto-purge">
          <input
            type="checkbox"
            checked={autoPurge}
            onChange={(event) => {
              setAutoPurge(event.target.checked)
              setTrashAutoPurge(event.target.checked)
            }}
          />
          {t('trash.autoPurge', { days: TRASH_RETENTION_DAYS })}
        </label>
        <div className="dialog-actions">
          {trashed.length > 0 && (
            <button type="button" className="danger" onClick={() => setConfirmEmpty(true)}>
              {t('trash.emptyTrash')}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
      {confirmEmpty && (
        <ConfirmDialog
          title={t('trash.emptyTrash')}
          message={
            trashed.length === 1
              ? t('trash.confirmAllOne')
              : t('trash.confirmAll', { count: trashed.length })
          }
          confirmLabel={t('trash.emptyTrash')}
          onClose={() => setConfirmEmpty(false)}
          onConfirm={() => {
            const ids = trashed.map((record) => record.id)
            setConfirmEmpty(false)
            void (async () => {
              for (const id of ids) await projects.purge(id)
            })()
          }}
        />
      )}
      {purgeTarget && (
        <ConfirmDialog
          title={t('trash.deleteForever')}
          message={t('trash.confirmOne', { name: purgeTarget.project.name })}
          confirmLabel={t('trash.deleteForever')}
          onClose={() => setPurgeId(null)}
          onConfirm={() => {
            const id = purgeTarget.id
            setPurgeId(null)
            void projects.purge(id)
          }}
        />
      )}
    </div>
  )
}
