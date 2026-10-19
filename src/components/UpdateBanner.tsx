import { useState } from 'react'
import { useT } from '../i18n'
import { reloadApp, useUpdate } from '../pwa/update'

/**
 * "A new version is ready — Reload" (#94, decision O-D1). Non-modal, so work
 * can go on; Later hides it until the next update or failed chunk.
 */
export function UpdateBanner() {
  const t = useT()
  const reason = useUpdate((s) => s.reason)
  const dismissed = useUpdate((s) => s.dismissed)
  const [reloading, setReloading] = useState(false)
  if (!reason || dismissed) return null
  return (
    <div
      className="update-banner"
      role="region"
      aria-label={t('update.label')}
      data-testid="update-banner"
    >
      <span>{reason === 'chunk' ? t('update.chunk') : t('update.ready')}</span>
      <button
        type="button"
        className="primary"
        disabled={reloading}
        onClick={() => {
          setReloading(true)
          void reloadApp()
        }}
        data-testid="update-reload"
      >
        {reloading ? t('update.reloading') : t('update.reload')}
      </button>
      <button
        type="button"
        onClick={() => useUpdate.getState().dismiss()}
        data-testid="update-later"
      >
        {t('update.later')}
      </button>
    </div>
  )
}
