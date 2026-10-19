import { create } from 'zustand'
import { announce } from '../a11y/announcer'
import { t } from '../i18n'

/**
 * App updates (#94, decision O-D1: a banner, never an automatic reload).
 *
 * The service worker registers in "prompt" mode: a new version installs in
 * the background and waits. The banner offers to reload into it; until then
 * the old version keeps running from its own cache. The banner also shows when
 * a lazily loaded part of the app can't be fetched any more because the
 * server already has a newer build (a tab left open across a deploy with no
 * service worker, or with site data cleared).
 */
export type UpdateReason = 'update' | 'chunk'

interface UpdateState {
  reason: UpdateReason | null
  dismissed: boolean
  dismiss: () => void
}

export const useUpdate = create<UpdateState>()((set) => ({
  reason: null,
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}))

type ApplyUpdate = (reloadPage?: boolean) => Promise<void>
let applyUpdate: ApplyUpdate | null = null
let saveBeforeReload: () => Promise<void> = async () => {}

/** Called once from main.tsx: how to save the open project before reloading. */
export function setSaveBeforeReload(save: () => Promise<void>): void {
  saveBeforeReload = save
}

function show(reason: UpdateReason) {
  const current = useUpdate.getState()
  // A missing chunk is the more urgent message; never downgrade it.
  if (current.reason === 'chunk' && !current.dismissed) return
  if (current.reason === reason && !current.dismissed) return
  useUpdate.setState({ reason, dismissed: false })
  announce(reason === 'chunk' ? t('update.chunk') : t('update.ready'))
}

/** The service worker has a new version waiting. */
export function notifyUpdateReady(apply: ApplyUpdate): void {
  applyUpdate = apply
  show('update')
}

/** A lazily loaded part of the app could not be fetched (see `lazyImport`). */
export function notifyChunkFailed(): void {
  show('chunk')
}

async function saveQuietly(): Promise<void> {
  try {
    await saveBeforeReload()
  } catch {
    // The reload still goes ahead: the beforeunload guard warns if work is unsaved.
  }
}

/**
 * The banner's Reload: save, then activate the waiting service worker (its
 * `controlling` event calls `saveAndReload`) or, without one, plain reload.
 */
export async function reloadApp(): Promise<void> {
  await saveQuietly()
  if (applyUpdate) {
    await applyUpdate(true)
    return
  }
  window.location.reload()
}

/** A new service worker took control (from this tab or another): save and reload. */
export async function saveAndReload(): Promise<void> {
  await saveQuietly()
  window.location.reload()
}

const CHUNK_ERROR =
  /dynamically imported module|importing a module script failed|error loading dynamically|loading (css )?chunk|failed to fetch/i

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  return name === 'ChunkLoadError' || (typeof message === 'string' && CHUNK_ERROR.test(message))
}

/**
 * Wrap every dynamic `import()` (#94). If the chunk cannot be fetched the
 * update banner offers a reload, and the error is still thrown so the
 * caller's own error handling runs. There is no retry (#143): browsers keep a
 * failed module import in their module map, so calling the same `import()`
 * again only replays the failure; a reload is what actually fetches it anew.
 */
export async function lazyImport<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch (error) {
    if (isChunkLoadError(error)) notifyChunkFailed()
    throw error
  }
}

/** For tests. */
export function resetUpdate(): void {
  applyUpdate = null
  saveBeforeReload = async () => {}
  useUpdate.setState({ reason: null, dismissed: false })
}
