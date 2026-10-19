import { useId, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { tn, useLocale, useT } from '../i18n'
import '../i18n/en/sync'
import { isFolderSyncSupported, loadController, useSync } from '../sync/store'
import { showToast } from './toastStore'

/**
 * Sync folder (#107, #111): link a folder (in practice inside OneDrive), see
 * how syncing is going, reconnect, sync now, resolve a pause, unlink.
 */
export function SyncDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const { status, folderName, lastSync, skipped, paused, images, error } = useSync()
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })
  const supported = isFolderSyncSupported()

  const act = (action: (c: Awaited<ReturnType<typeof loadController>>) => Promise<unknown>) => {
    setBusy(true)
    void loadController()
      .then(action)
      .catch((err: unknown) =>
        showToast(
          t('sync.failed', { error: err instanceof Error ? err.message : String(err) }),
          'error',
          9000,
        ),
      )
      .finally(() => setBusy(false))
  }

  const when = lastSync
    ? new Date(lastSync).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog sync-dialog"
        role="dialog"
        aria-labelledby={titleId}
        data-testid="sync-dialog"
      >
        <h2 id={titleId}>{t('sync.title')}</h2>
        {!supported ? (
          <p data-testid="sync-unsupported">{t('sync.unsupported')}</p>
        ) : status === 'off' ? (
          <>
            <p>{t('sync.intro')}</p>
            <ol className="sync-steps">
              <li>{t('sync.step1')}</li>
              <li>{t('sync.step2')}</li>
              <li>{t('sync.step3')}</li>
            </ol>
            <p className="muted">{t('sync.onDemandTip')}</p>
          </>
        ) : (
          <>
            <p>
              {t('sync.linkedTo', { name: folderName ?? '' })}
              <br />
              <span className="muted" data-testid="sync-dialog-status">
                {t(`sync.status.${status}` as const)}
                {when ? ` · ${t('sync.lastSync', { time: when })}` : ''}
              </span>
            </p>
            {paused && (
              <div className="sync-paused" role="alert">
                <p>{t('sync.pausedDetail', { missing: paused.missing, known: paused.known })}</p>
                <button type="button" disabled={busy} onClick={() => act((c) => c.runSync())}>
                  {t('sync.checkAgain')}
                </button>{' '}
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => act((c) => c.confirmDeletes())}
                  data-testid="sync-confirm-deletes"
                >
                  {t('sync.trashAnyway')}
                </button>
              </div>
            )}
            {error && <p className="sync-error">{t('sync.failed', { error })}</p>}
            {images?.pending ? (
              <p className="muted" data-testid="sync-images-pending">
                {tn('sync.images.pending', images.pending)}
              </p>
            ) : null}
            {images?.rejected ? (
              <p className="sync-error" data-testid="sync-images-rejected">
                {tn('sync.images.rejected', images.rejected)}
              </p>
            ) : null}
            {skipped.length > 0 && (
              <details className="sync-skipped">
                <summary>{t('sync.skippedSummary', { count: skipped.length })}</summary>
                <ul>
                  {skipped.map((skip) => (
                    <li key={`${skip.file}-${skip.reason}`}>
                      {skip.file} — {t(`sync.skip.${skip.reason}` as const)}
                      {skip.detail ? ` (${skip.detail})` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="muted">{t('sync.onDemandTip')}</p>
          </>
        )}
        <div className="dialog-actions">
          {supported && status === 'off' && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => act((c) => c.linkFolder())}
              data-testid="sync-link"
            >
              {t('sync.choose')}
            </button>
          )}
          {status === 'reconnect' && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => act((c) => c.reconnect())}
              data-testid="sync-reconnect"
            >
              {t('sync.reconnect')}
            </button>
          )}
          {supported && status !== 'off' && (
            <>
              <button
                type="button"
                disabled={busy || status === 'reconnect'}
                onClick={() => act((c) => c.runSync())}
                data-testid="sync-now"
              >
                {t('sync.now')}
              </button>
              <button type="button" disabled={busy} onClick={() => act((c) => c.linkFolder())}>
                {t('sync.change')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act((c) => c.unlinkFolder())}
                data-testid="sync-unlink"
              >
                {t('sync.unlink')}
              </button>
            </>
          )}
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
