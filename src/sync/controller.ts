/**
 * Runs the folder sync (#107–#111): links the folder, keeps its permission,
 * decides when to sync, and turns engine reports into status and toasts.
 */
import * as db from '../io/db'
import { t, tn } from '../i18n'
import '../i18n/en/sync'
import { projectsOpenAnywhere, useProjects } from '../store/projects'
import { showToast } from '../components/toastStore'
import { cleanupAssetsIfDue } from '../assets/cleanup'
import { assetSync } from './assets'
import { reconcile, type SyncReport } from './engine'
import { wrapHandle, type DirectoryHandleLike } from './folder'
import { PRESET_STATE_KEY, syncPresets, type PresetSyncReport } from './presets'
import { SYNC_FOLDER_KEY, useSync } from './store'
import { formatDateTime } from '../i18n/dates'

/** Write this long after the last change (decision V-D2). */
export const SYNC_DELAY_MS = 10_000
/** Look for changes from other PCs this often while the app is visible (W1). */
export const SCAN_INTERVAL_MS = 3 * 60_000

let handle: DirectoryHandleLike | null = null
let running: Promise<void> | null = null
let again = false
let allowMassDeleteOnce = false
let soonTimer: ReturnType<typeof setTimeout> | null = null
let scanTimer: ReturnType<typeof setInterval> | null = null
let detach: (() => void) | null = null
/** Open projects already told about: removed elsewhere, trashed when closed (#119). */
const toldOpenRemoved = new Set<string>()
/** Image files in `_assets` whose bytes did not match their name (#149): not read again. */
const rejectedAssets = new Set<string>()

type PickerWindow = {
  showDirectoryPicker?: (options: {
    id?: string
    mode?: 'readwrite'
    startIn?: string
  }) => Promise<DirectoryHandleLike>
}

function errorName(error: unknown): string {
  return (error as { name?: string } | null)?.name ?? ''
}

async function permitted(request: boolean): Promise<boolean> {
  if (!handle) return false
  const descriptor = { mode: 'readwrite' as const }
  let state = (await handle.queryPermission?.(descriptor)) ?? 'granted'
  if (state !== 'granted' && request)
    state = (await handle.requestPermission?.(descriptor)) ?? state
  if (state !== 'granted') {
    useSync.setState({ status: 'reconnect' })
    return false
  }
  return true
}

function conflictLabel(): string {
  return t('sync.copyLabel', { date: formatDateTime(new Date()) })
}

function describe(report: SyncReport, presets: PresetSyncReport | null): void {
  const state = useSync.getState()
  const busy = report.skipped.some((skip) => skip.reason === 'busy')
  useSync.setState({
    status: report.paused ? 'paused' : busy ? 'retrying' : 'idle',
    paused: report.paused,
    skipped: report.skipped,
    images:
      report.images && (report.images.pending > 0 || report.images.rejected > 0)
        ? { pending: report.images.pending, rejected: report.images.rejected }
        : null,
    lastSync: new Date().toISOString(),
    error: null,
  })
  if (report.paused && !state.paused) showToast(t('sync.pausedToast'), 'error', 12000)
  if (report.created > 0) showToast(tn('sync.created', report.created))
  for (const name of report.conflicts) showToast(t('sync.conflictToast', { name }), 'info', 12000)
  if (report.trashedHere > 0) showToast(tn('sync.trashedHere', report.trashedHere))
  if (report.restored > 0) showToast(tn('sync.restored', report.restored))
  const openRemoved = report.skipped.filter((skip) => skip.reason === 'open-removed')
  for (const skip of openRemoved) {
    if (toldOpenRemoved.has(skip.file)) continue
    toldOpenRemoved.add(skip.file)
    showToast(t('sync.openRemoved', { name: skip.file }), 'info', 12000)
  }
  for (const name of [...toldOpenRemoved]) {
    if (!openRemoved.some((skip) => skip.file === name)) toldOpenRemoved.delete(name)
  }
  // Files from a newer app version (GE0a): say it once per run of such files.
  const newer = report.skipped.some((skip) => skip.reason === 'newer')
  if (newer && !state.skipped.some((skip) => skip.reason === 'newer'))
    showToast(t('sync.newerToast'), 'info', 15000)
  for (const name of presets?.conflicts ?? [])
    showToast(t('sync.presetConflict', { name }), 'info', 12000)
}

async function runOnce(): Promise<void> {
  if (!handle) return
  const allowMassDelete = allowMassDeleteOnce
  allowMassDeleteOnce = false
  // Everything in the try: a pass started by a timer or an event has no one
  // to catch for it (#130).
  try {
    if (!(await permitted(false))) return
    const folder = wrapHandle(handle)
    const projects = useProjects.getState()
    useSync.setState({ status: 'syncing' })
    // What is still in the editor goes to the browser store first (#92).
    if (projects.currentId) await projects.saveCurrent()
    const openId = projects.currentId
    let openTaken = false
    const report = await reconcile({
      folder,
      listRecords: () => db.listProjects(),
      listSync: () => db.listSyncRecords(),
      putSync: (record) => db.putSyncRecord(record),
      deleteSync: (id) => db.deleteSyncRecord(id),
      adopt: async (id, project, expectedUpdatedAt) => {
        const result = await useProjects.getState().adoptSynced(id, project, expectedUpdatedAt)
        if (result === 'applied' && id === openId) openTaken = true
        return result
      },
      addCopies: async (copies) => {
        await useProjects.getState().restoreProjects(copies)
      },
      isBusy: (id) => {
        const state = useProjects.getState()
        return state.currentId === id && state.hasUnsavedChanges()
      },
      trash: async (id) => {
        // Never close a project the user is working in, in this tab or another (#119, #128).
        if ((await projectsOpenAnywhere()).has(id)) return 'open'
        await useProjects.getState().remove(id)
        return 'trashed'
      },
      allowMassDelete,
      conflictLabel,
      assets: assetSync(folder, rejectedAssets),
    })
    // While project deletions are paused, presets are not deleted either (#123).
    const presets = await syncPresets(folder, { allowDeletes: !report.paused }).catch(() => null)
    describe(report, presets)
    if (openTaken) showToast(t('sync.updatedOpen'))
    // Unused images (#149, HC10): at most once a day, and only after a clean pass.
    const clean =
      !report.paused &&
      report.skipped.length === 0 &&
      !report.images?.pending &&
      !report.images?.rejected
    if (clean) await cleanupAssetsIfDue(folder)
  } catch (error) {
    const name = errorName(error)
    if (name === 'NotFoundError') useSync.setState({ status: 'missing', error: null })
    else if (name === 'NotAllowedError' || name === 'SecurityError')
      useSync.setState({ status: 'reconnect', error: null })
    else
      useSync.setState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
  }
}

type LockNavigator = {
  locks?: { request<T>(name: string, callback: () => Promise<T>): Promise<T> }
}

/**
 * One pass at a time across every tab and the installed app (#117): they
 * share the folder and the database, and two passes at once would both take
 * the same change. Without Web Locks, this tab's own queue still applies.
 */
function exclusive(pass: () => Promise<void>): Promise<void> {
  const locks = (globalThis.navigator as LockNavigator | undefined)?.locks
  return locks ? locks.request('mindmap-sync', pass) : pass()
}

/** One pass at a time; a request during a pass runs one more pass after it. */
export function runSync(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await exclusive(runOnce)
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

export function requestSync(when: 'now' | 'soon'): void {
  if (!handle) return
  if (soonTimer) clearTimeout(soonTimer)
  soonTimer = null
  if (when === 'now') {
    void runSync()
    return
  }
  soonTimer = setTimeout(() => {
    soonTimer = null
    void runSync()
  }, SYNC_DELAY_MS)
}

function attach(): void {
  detach?.()
  // Flush when the user switches away: to another app, tab or PC (§0a-4).
  const onBlur = () => requestSync('now')
  const onVisibility = () => requestSync('now')
  const onFocus = () => requestSync('now')
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)
  window.addEventListener('pagehide', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
  scanTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void runSync()
  }, SCAN_INTERVAL_MS)
  // Writes follow saves: soon after an edit, at once when the project changes.
  const unsubscribe = useProjects.subscribe((state, previous) => {
    if (state.currentId !== previous.currentId) requestSync('now')
    else if (state.records !== previous.records || state.trashed !== previous.trashed)
      requestSync('soon')
  })
  detach = () => {
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('pagehide', onBlur)
    document.removeEventListener('visibilitychange', onVisibility)
    if (scanTimer) clearInterval(scanTimer)
    scanTimer = null
    unsubscribe()
    detach = null
  }
}

async function remember(next: DirectoryHandleLike): Promise<void> {
  try {
    await db.putSetting(SYNC_FOLDER_KEY, next)
  } catch {
    // A handle IndexedDB cannot keep (tests): linked for this session only.
  }
}

/** Start syncing with a folder linked earlier (on start-up). */
export async function resume(saved: DirectoryHandleLike): Promise<void> {
  handle = saved
  useSync.setState({ folderName: saved.name, status: 'idle' })
  attach()
  if (await permitted(false)) await runSync()
}

/** Pick a folder and sync with it (V2). Returns false when the picker was cancelled. */
export async function linkFolder(): Promise<boolean> {
  const picker = (window as unknown as PickerWindow).showDirectoryPicker
  if (!picker) return false
  let next: DirectoryHandleLike
  try {
    next = await picker({ id: 'mindmap-sync', mode: 'readwrite', startIn: 'documents' })
  } catch (error) {
    if (errorName(error) === 'AbortError') return false
    throw error
  }
  // A new folder starts from a clean slate: the first pass compares by content.
  await db.clearSyncRecords()
  // A new folder starts with no preset agreement either (#123).
  await db.deleteSetting(PRESET_STATE_KEY)
  handle = next
  await remember(next)
  useSync.setState({ folderName: next.name, status: 'idle', paused: null, skipped: [] })
  attach()
  if (await permitted(true)) await runSync()
  return true
}

export async function unlinkFolder(): Promise<void> {
  detach?.()
  if (soonTimer) clearTimeout(soonTimer)
  soonTimer = null
  handle = null
  await db.deleteSetting(SYNC_FOLDER_KEY)
  await db.clearSyncRecords()
  // A new folder starts with no preset agreement either (#123).
  await db.deleteSetting(PRESET_STATE_KEY)
  useSync.setState({
    status: 'off',
    folderName: null,
    lastSync: null,
    skipped: [],
    paused: null,
    images: null,
    error: null,
  })
}

/** "Reconnect folder": must run from a click (the browser asks for permission). */
export async function reconnect(): Promise<void> {
  if (await permitted(true)) await runSync()
}

/** "Trash them anyway" after the mass-deletion guard paused sync (§0a-5). */
export async function confirmDeletes(): Promise<void> {
  allowMassDeleteOnce = true
  await runSync()
}

/** For tests. */
export function resetController(): void {
  detach?.()
  if (soonTimer) clearTimeout(soonTimer)
  soonTimer = null
  handle = null
  running = null
  again = false
  allowMassDeleteOnce = false
  toldOpenRemoved.clear()
  rejectedAssets.clear()
}
