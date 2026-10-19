import { useEffect, useState } from 'react'
import {
  formatBytes,
  getStorageStatus,
  requestPersistentStorage,
  type StorageStatus,
} from '../io/quota'
import { useProjects } from '../store/projects'
import { lazyImport } from '../pwa/update'
import { showToast } from './toastStore'
import { useT } from '../i18n'

/**
 * How much browser storage the library uses, and whether the browser may
 * clear it under pressure (#83). Browsers can evict a site's data without
 * asking unless the site is granted persistent storage.
 */
export function StorageMeter() {
  const t = useT()
  const [status, setStatus] = useState<StorageStatus | null>(null)
  /** Bytes the images on nodes take (#149), part of the usage above. */
  const [imageBytes, setImageBytes] = useState(0)
  // Re-measure when the library changes (saves, deletes, restores).
  const records = useProjects((s) => s.records)
  const trashed = useProjects((s) => s.trashed)

  useEffect(() => {
    let live = true
    void getStorageStatus().then((next) => {
      if (live) setStatus(next)
    })
    void lazyImport(() => import('../assets/store'))
      .then((store) => store.assetBytesTotal())
      .then(
        (bytes) => {
          if (live) setImageBytes(bytes)
        },
        () => undefined,
      )
    return () => {
      live = false
    }
  }, [records, trashed])

  if (!status) return null
  const percent = status.quota > 0 ? (status.usage / status.quota) * 100 : 0
  const shownPercent = percent > 0 && percent < 1 ? '<1' : Math.round(percent).toString()

  const keep = async () => {
    const granted = await requestPersistentStorage()
    const next = await getStorageStatus()
    if (next) setStatus(next)
    showToast(
      granted ? t('storage.granted') : t('storage.declined'),
      granted ? 'info' : 'error',
      9000,
    )
  }

  return (
    <section className="storage-meter" aria-label={t('storage.label')} data-testid="storage-meter">
      <div className="storage-meter-line">
        <span>
          {t('storage.using', { used: formatBytes(status.usage) })}
          {status.quota > 0
            ? t('storage.ofQuota', { quota: formatBytes(status.quota), percent: shownPercent })
            : ''}
          {imageBytes > 0 ? t('storage.images', { size: formatBytes(imageBytes) }) : ''}
        </span>
        {status.quota > 0 && (
          <meter
            className="storage-meter-bar"
            min={0}
            max={100}
            low={70}
            high={90}
            optimum={0}
            value={percent}
            aria-label={t('storage.bar')}
          />
        )}
      </div>
      {status.persisted ? (
        <p className="muted storage-meter-note">{t('storage.protected')}</p>
      ) : (
        <p className="muted storage-meter-note">
          {t('storage.mayClear')}
          {status.canPersist && (
            <>
              {' '}
              <button type="button" onClick={() => void keep()}>
                {t('storage.keep')}
              </button>
            </>
          )}
        </p>
      )}
    </section>
  )
}
