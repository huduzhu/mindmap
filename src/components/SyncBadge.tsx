import { useState } from 'react'
import { useT } from '../i18n'
import { loadController, openSyncDialog, useSync } from '../sync/store'

/** Badge for the sync folder (#107, V3, #118); hidden when no folder is linked. */
export function SyncBadge() {
  const t = useT()
  const status = useSync((s) => s.status)
  if (status === 'off') return null
  const attention =
    status === 'reconnect' || status === 'missing' || status === 'paused' || status === 'error'
  return (
    <button
      type="button"
      className={`status-badge sync-badge sync-badge-${status}${attention ? ' sync-badge-attention' : ''}`}
      onClick={() => openSyncDialog()}
      aria-label={t('sync.badgeLabel', { status: t(`sync.status.${status}` as const) })}
      data-testid="sync-badge"
    >
      <span aria-hidden="true">{status === 'syncing' ? '⟳' : attention ? '!' : '☁'}</span>{' '}
      {t(`sync.badge.${status}` as const)}
    </button>
  )
}

/**
 * On the start screen (#118): after a restart the browser asks again before
 * the app may use the folder, and that needs a click. Say so where the user
 * starts, with the button that asks.
 */
export function SyncReconnectPrompt() {
  const t = useT()
  const status = useSync((s) => s.status)
  const folderName = useSync((s) => s.folderName)
  const [busy, setBusy] = useState(false)
  if (status !== 'reconnect') return null
  return (
    <div className="sync-reconnect-prompt" role="status" data-testid="sync-reconnect-prompt">
      <span>{t('sync.reconnectPrompt', { name: folderName ?? '' })}</span>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void loadController()
            .then((controller) => controller.reconnect())
            .finally(() => setBusy(false))
        }}
        data-testid="start-sync-reconnect"
      >
        {t('sync.reconnect')}
      </button>
    </div>
  )
}
