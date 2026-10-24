/**
 * Cleaning up images nothing uses any more (#149, HC10, decision HC-D4: 30
 * days of grace). Loaded on demand, at most once a day: after a clean folder
 * sync pass, or on idle when no folder is linked.
 *
 * - The reference scan covers every project (the Trash included), every
 *   snapshot, every stored undo history, and the open project with its undo
 *   steps still in memory.
 * - An asset nothing refers to gets an "unreferenced since" stamp (kept in the
 *   settings store, so no image bytes are read or rewritten). Referenced again
 *   (an undo, a restore, a sync) clears it. Only after 30 days with the stamp
 *   is the asset deleted from IndexedDB, so undoing an image removal within
 *   the grace period still finds its bytes.
 * - A picture added again after the scan (pasting the same bytes refreshes
 *   `lastUsedAt`) is never deleted by that run.
 * - Sync folder rule (when in doubt, never delete): a PC moves
 *   `_assets/<hash>.<ext>` to `_assets/_trash` only when (1) it holds the
 *   asset itself, i.e. it used the picture, so a PC that never had it never
 *   touches the file; (2) its own scan has found no reference for 30 days;
 *   and (3) the sync pass just before was clean (nothing skipped, no image
 *   pending, deletions not paused). Files are moved, never deleted, and sync
 *   still reads a picture from `_assets/_trash` when a project needs it. A
 *   PC that still uses the picture has its bytes and writes the file again.
 */
import { getDB, getSetting, putSetting } from '../io/db'
import type { TreeNode } from '../schema/types'
import type { SyncFolder } from '../sync/folder'
import { ASSETS_DIR, hashFromAssetName } from '../sync/assets'
import { TRASH_DIR } from '../sync/names'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { collectAssetRefs, deleteAsset, getAssetMeta, listAssetHashes } from './store'

export const ASSET_GRACE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_MS = ASSET_GRACE_DAYS * DAY_MS
/** Settings key of the cleanup's own record. */
export const CLEANUP_KEY = 'assetCleanup'

export interface CleanupState {
  /** When the cleanup last ran (it runs at most once a day). */
  lastRun?: string
  /** Assets nothing referred to, and since when. */
  since: Record<string, string>
}

export interface CleanupResult {
  /** Assets newly found unreferenced. */
  stamped: number
  /** Assets referenced again, their stamp cleared. */
  cleared: number
  /** Assets deleted from this browser. */
  deleted: string[]
  /** Asset files moved to `_assets/_trash`. */
  movedInFolder: number
}

/** The trees of the open project and of its undo steps still in memory. */
function openTrees(): (TreeNode | undefined)[] {
  const project = useProjects.getState().current
  const { past, future } = useEditor.getState()
  const trees: (TreeNode | undefined)[] = project ? [project.map, project.brainstorm] : []
  for (const entry of [...past, ...future]) trees.push(entry.tree, entry.map, entry.brainstorm)
  return trees
}

/** Every asset any project, snapshot or undo step (stored or in memory) refers to. */
export async function scanAssetReferences(): Promise<Set<string>> {
  const db = await getDB()
  const [projects, snapshots, histories] = await Promise.all([
    db.getAll('projects'),
    db.getAll('snapshots'),
    db.getAll('history'),
  ])
  const refs = new Set<string>()
  for (const { project } of [...projects, ...snapshots])
    collectAssetRefs([project.map, project.brainstorm], refs)
  for (const history of histories) {
    for (const entry of [...history.past, ...history.future])
      collectAssetRefs([entry.tree, entry.map, entry.brainstorm], refs)
  }
  return collectAssetRefs(openTrees(), refs)
}

/** Whether the cleanup has not run in the last day. */
export async function cleanupDue(now: Date = new Date()): Promise<boolean> {
  const state = await getSetting<CleanupState>(CLEANUP_KEY).catch(() => undefined)
  const last = state?.lastRun ? Date.parse(state.lastRun) : NaN
  return !(now.getTime() - last < DAY_MS)
}

/** Move an asset's file to `_assets/_trash` (never overwriting, never deleting there). */
async function moveToTrash(assets: SyncFolder, name: string): Promise<void> {
  const trash = await assets.subfolder(TRASH_DIR, true)
  if (!trash) return
  if (!(await trash.listNames()).includes(name)) {
    await trash.writeBytes(name, await assets.readBytes(name))
  }
  await assets.remove(name)
}

/**
 * Stamp unreferenced assets and delete those unreferenced for 30 days. With
 * `folder` (the sync folder, after a clean pass), their `_assets` files move
 * to `_assets/_trash` first.
 */
export async function cleanupAssets(
  options: { now?: Date; folder?: SyncFolder | null | undefined } = {},
): Promise<CleanupResult> {
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  const result: CleanupResult = { stamped: 0, cleared: 0, deleted: [], movedInFolder: 0 }
  const [refs, hashes, saved] = await Promise.all([
    scanAssetReferences(),
    listAssetHashes(),
    getSetting<CleanupState>(CLEANUP_KEY).catch(() => undefined),
  ])
  const before = saved?.since ?? {}
  const since: Record<string, string> = {}
  for (const hash of hashes) {
    if (refs.has(hash)) {
      if (before[hash]) result.cleared += 1
      continue
    }
    since[hash] = before[hash] ?? stamp
    if (!before[hash]) result.stamped += 1
  }

  const expired: string[] = []
  for (const [hash, from] of Object.entries(since)) {
    if (now.getTime() - Date.parse(from) < GRACE_MS) continue
    // Added again since the scan began (the same picture pasted): keep it.
    const meta = await getAssetMeta(hash)
    if (!meta || (meta.lastUsedAt && Date.parse(meta.lastUsedAt) > Date.parse(from))) {
      delete since[hash]
      continue
    }
    expired.push(hash)
  }
  if (expired.length > 0) {
    // The open project may have changed while scanning (an undo): look again.
    const still = collectAssetRefs(openTrees())
    const gone = expired.filter((hash) => !still.has(hash))
    if (options.folder && gone.length > 0) {
      const assets = await options.folder.subfolder(ASSETS_DIR, false)
      if (assets) {
        const names = new Map<string, string>()
        for (const name of await assets.listNames()) {
          const hash = hashFromAssetName(name)
          if (hash) names.set(hash, name)
        }
        for (const hash of gone) {
          const name = names.get(hash)
          if (!name) continue
          await moveToTrash(assets, name)
          result.movedInFolder += 1
        }
      }
    }
    for (const hash of gone) {
      await deleteAsset(hash)
      delete since[hash]
      result.deleted.push(hash)
    }
  }
  await putSetting(CLEANUP_KEY, { lastRun: stamp, since } satisfies CleanupState)
  return result
}

/** Run the cleanup if it has not run today; never throws. */
export async function cleanupAssetsIfDue(folder?: SyncFolder | null): Promise<void> {
  try {
    if (await cleanupDue()) await cleanupAssets({ folder })
  } catch {
    // A busy folder or a storage problem: try again another day.
  }
}
