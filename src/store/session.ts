import { t } from '../i18n'

/**
 * Small per-browser preferences kept in localStorage (#75, #83). Every access
 * is wrapped: localStorage throws in some private modes and sandboxed frames,
 * and none of this is worth failing over.
 */

const LAST_PROJECT_KEY = 'mms.lastProjectId'
const TRASH_AUTO_PURGE_KEY = 'mms.trashAutoPurge'
const MINIMAP_KEY = 'mms.minimap'
const PERSIST_ASKED_KEY = 'mms.persistAsked'
const DETAILS_PANEL_KEY = 'mms.detailsPanel'

/** Trashed projects older than this are deleted forever at startup (owner decision G-D1). */
export const TRASH_RETENTION_DAYS = 30

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, value)
  } catch {
    // Not persisted; the app still works.
  }
}

export function getLastProjectId(): string | null {
  return read(LAST_PROJECT_KEY)
}

export function setLastProjectId(id: string | null): void {
  write(LAST_PROJECT_KEY, id)
}

/** Auto-purge of old trash is on unless the user switched it off. */
export function isTrashAutoPurgeOn(): boolean {
  return read(TRASH_AUTO_PURGE_KEY) !== 'off'
}

export function setTrashAutoPurge(on: boolean): void {
  write(TRASH_AUTO_PURGE_KEY, on ? null : 'off')
}

/** Narrow screens: below this width the minimap starts hidden (#80). */
export const NARROW_SCREEN_PX = 700

/**
 * Whether the map overview (minimap) is shown (#80). The user's last choice
 * wins; without one it is shown except on narrow screens, where it would
 * cover the nodes.
 */
export function isMinimapShown(): boolean {
  const stored = read(MINIMAP_KEY)
  if (stored === 'on') return true
  if (stored === 'off') return false
  try {
    return !globalThis.matchMedia?.(`(max-width: ${NARROW_SCREEN_PX - 1}px)`).matches
  } catch {
    return true
  }
}

/**
 * Above this many visible topics the overview starts hidden (#139): React
 * Flow's minimap redraws one element per node on every edit, which costs tens
 * of milliseconds on a big map. The toggle still shows it on request.
 */
export const MINIMAP_NODE_LIMIT = 500

export function setMinimapShown(shown: boolean): void {
  write(MINIMAP_KEY, shown ? 'on' : 'off')
}

export type DetailsPanelSetting = 'shown' | 'hidden'

/**
 * Whether the details panel beside (or, on phones, below) the view is shown
 * (#144). The user's last choice on this device wins; without one it is shown
 * on desktops and hidden on touch and narrow screens, where it would take a
 * large part of the screen (decision GA-D1).
 */
export function getDetailsPanel(): DetailsPanelSetting {
  const stored = read(DETAILS_PANEL_KEY)
  if (stored === 'shown' || stored === 'hidden') return stored
  try {
    const small = globalThis.matchMedia?.(
      `(max-width: ${NARROW_SCREEN_PX - 1}px), (pointer: coarse)`,
    ).matches
    return small ? 'hidden' : 'shown'
  } catch {
    return 'shown'
  }
}

export function setDetailsPanel(setting: DetailsPanelSetting): void {
  write(DETAILS_PANEL_KEY, setting)
}

/**
 * Whether the app already asked the browser to keep its storage (#143). Asked
 * once, after the first project is created or imported, so browsers that
 * prompt never prompt again.
 */
export function wasPersistenceRequested(): boolean {
  return read(PERSIST_ASKED_KEY) === '1'
}

export function markPersistenceRequested(): void {
  write(PERSIST_ASKED_KEY, '1')
}

/** `?home` in the URL opens the start screen instead of the last project. */
export function skipReopenRequested(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').has('home')
  } catch {
    return false
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** "deleted forever in 12 days" for a trashed record (#83). */
export function daysLeftLabel(deletedAt: string | undefined, now: number = Date.now()): string {
  const deleted = deletedAt ? Date.parse(deletedAt) : NaN
  if (!Number.isFinite(deleted)) return t('trash.kept', { days: TRASH_RETENTION_DAYS })
  const left = Math.ceil((deleted + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS)
  if (left <= 1) return t('trash.lastDay')
  return t('trash.daysLeft', { days: left })
}
