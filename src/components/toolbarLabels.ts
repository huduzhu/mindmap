import { t } from '../i18n'
import type { SaveStatus } from '../store/projects'

/** Save-state badge text (#79). */
export function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case 'pending':
      return t('status.unsaved')
    case 'saving':
      return t('status.saving')
    case 'error':
      return t('status.saveFailed')
    default:
      return t('status.saved')
  }
}

/** Connectivity badge text (#79). The app works offline; say what that means. */
export function connectionLabel(online: boolean): string {
  return online ? t('status.online') : t('status.offline')
}
