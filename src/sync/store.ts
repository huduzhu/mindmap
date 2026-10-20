import { create } from 'zustand'
import { getSetting } from '../io/db'
import { lazyImport } from '../pwa/update'

/**
 * Folder sync state for the toolbar badge and the Sync dialog (#107). Small
 * on purpose: the engine and the controller load only when a folder is linked
 * or the dialog opens.
 */
export type SyncStatus =
  | 'off' // no folder linked
  | 'idle'
  | 'syncing'
  | 'retrying' // a file was locked (plan §0a-1)
  | 'reconnect' // the browser wants permission again
  | 'missing' // the folder was moved or deleted
  | 'paused' // the mass-deletion guard (§0a-5)
  | 'error'

export interface SyncSkip {
  file: string
  reason: 'unavailable' | 'invalid' | 'newer' | 'busy' | 'open-unsaved' | 'open-removed'
  detail?: string
}

interface SyncState {
  status: SyncStatus
  folderName: string | null
  lastSync: string | null
  skipped: SyncSkip[]
  paused: { missing: number; known: number } | null
  /** Images (#149) still downloading, or refused, after the last pass. */
  images: { pending: number; rejected: number } | null
  error: string | null
  dialogOpen: boolean
}

export const useSync = create<SyncState>()(() => ({
  status: 'off',
  folderName: null,
  lastSync: null,
  skipped: [],
  paused: null,
  images: null,
  error: null,
  dialogOpen: false,
}))

export const SYNC_FOLDER_KEY = 'syncFolder'
const CLEANUP_DELAY_MS = 60_000

/** Chrome and Edge on a computer; elsewhere the feature is hidden (§0). */
export function isFolderSyncSupported(): boolean {
  return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

export function openSyncDialog(open = true): void {
  useSync.setState({ dialogOpen: open })
}

export const loadController = () => lazyImport(() => import('./controller'))

/** Ask for a sync pass: now (Save, leaving) or soon (after an edit). No-op when off. */
export function requestSync(when: 'now' | 'soon' = 'now'): void {
  if (useSync.getState().status === 'off') return
  void loadController().then((controller) => controller.requestSync(when))
}

/** At start-up: resume syncing when a folder was linked before. */
export async function startSyncIfLinked(): Promise<void> {
  const handle = isFolderSyncSupported()
    ? await getSetting(SYNC_FOLDER_KEY).catch(() => undefined)
    : undefined
  if (!handle) {
    // No folder: the image cleanup (#149, HC10) runs a while after start-up
    // instead of after a sync pass, at most once a day.
    setTimeout(() => {
      void lazyImport(() => import('../assets/cleanup'))
        .then((cleanup) => cleanup.cleanupAssetsIfDue())
        .catch(() => undefined)
    }, CLEANUP_DELAY_MS)
    return
  }
  const controller = await loadController()
  await controller.resume(handle as Parameters<typeof controller.resume>[0])
}
