/**
 * Images in the sync folder (#149, HC8, decision HC-D1): every asset is a
 * file `_assets/<hash>.webp` (or .png / .jpg), named by the SHA-256 of its
 * bytes, so the same picture in many projects is one file.
 *
 * - Written once: before a project file that uses an image is written, the
 *   image's file is written if no file of that hash is in `_assets` yet. A
 *   file that is there is never written again (the name is the content).
 * - Read when needed: an incoming project whose images are not in this
 *   browser gets them from `_assets` (or, if a cleanup on another PC moved
 *   them there, from `_assets/_trash`). The bytes must hash to the name, or
 *   the file is refused. A file not there yet (OneDrive still downloading)
 *   leaves the project showing a placeholder; every later pass tries again.
 * - Never deleted by a sync pass. Only the cleanup (src/assets/cleanup.ts)
 *   moves files nothing uses any more to `_assets/_trash`, under its rules.
 */
import {
  assetFileName,
  collectAssetRefs,
  getAsset,
  listAssetHashes,
  typeForFileName,
} from '../assets/store'
import { imageCodec } from '../assets/codec'
import { importAssetBlob } from '../assets/process'
import { isAssetHash } from '../map/image'
import type { Project } from '../schema/types'
import type { AssetSyncStep } from './engine'
import { FolderBusyError, type SyncFolder } from './folder'
import { TRASH_DIR } from './names'

export const ASSETS_DIR = '_assets'

/** The hash an asset file is named after, or null for any other file. */
export function hashFromAssetName(name: string): string | null {
  const dot = name.indexOf('.')
  if (dot < 0 || !typeForFileName(name)) return null
  const hash = name.slice(0, dot)
  return isAssetHash(hash) && name.lastIndexOf('.') === dot ? hash : null
}

/** Asset file names by hash. */
async function indexFolder(folder: SyncFolder | null): Promise<Map<string, string>> {
  const index = new Map<string, string>()
  if (!folder) return index
  for (const name of await folder.listNames()) {
    const hash = hashFromAssetName(name)
    if (hash && !index.has(hash)) index.set(hash, name)
  }
  return index
}

const isBusy = (error: unknown) => error instanceof FolderBusyError

/**
 * The asset part of one sync pass over `root`. `rejected` (kept by the caller
 * across passes) holds file names whose bytes did not match their name, so
 * they are not read again on every pass.
 */
export function assetSync(root: SyncFolder, rejected: Set<string> = new Set()): AssetSyncStep {
  let folder: SyncFolder | null = null
  let index: Map<string, string> | null = null

  const load = async (): Promise<Map<string, string>> => {
    if (!index) {
      folder = await root.subfolder(ASSETS_DIR, false)
      index = await indexFolder(folder)
    }
    return index
  }

  /** Write the files of `hashes` that are here but not in the folder yet. */
  const write = async (hashes: Iterable<string>): Promise<number> => {
    const known = await load()
    let written = 0
    for (const hash of hashes) {
      if (known.has(hash)) continue
      const blob = await getAsset(hash)
      if (!blob) continue // not in this browser either: nothing to write
      folder ??= await root.subfolder(ASSETS_DIR, true)
      if (!folder) continue
      const name = assetFileName(hash, blob.type)
      await folder.writeBytes(name, blob)
      known.set(hash, name)
      written += 1
    }
    return written
  }

  return {
    async beforeWrite(project) {
      const refs = collectAssetRefs([project.map, project.brainstorm])
      if (refs.size > 0) await write(refs)
    },

    async settle(projects: Project[]) {
      const result = { pending: 0, rejected: 0, imported: 0, written: 0 }
      const refs = collectAssetRefs(
        projects.flatMap((project) => [project.map, project.brainstorm]),
      )
      if (refs.size === 0) return result
      const here = new Set(await listAssetHashes())
      try {
        // Images used here that the folder lacks (e.g. synced before #149 part 2).
        result.written = await write([...refs].filter((hash) => here.has(hash)))
      } catch (error) {
        if (!isBusy(error)) throw error
      }
      const missing = [...refs].filter((hash) => !here.has(hash))
      if (missing.length === 0) return result
      const known = await load()
      let trash: { folder: SyncFolder; index: Map<string, string> } | null | undefined
      for (const hash of missing) {
        let source = folder
        let name = known.get(hash)
        if (!name) {
          // A cleanup elsewhere may have moved it aside; it is still good.
          if (trash === undefined) {
            const trashFolder = folder ? await folder.subfolder(TRASH_DIR, false) : null
            trash = trashFolder
              ? { folder: trashFolder, index: await indexFolder(trashFolder) }
              : null
          }
          name = trash?.index.get(hash)
          source = trash?.folder ?? null
        }
        if (!name || !source) {
          result.pending += 1
          continue
        }
        if (rejected.has(name)) {
          result.rejected += 1
          continue
        }
        let bytes: Blob
        try {
          bytes = await source.readBytes(name)
        } catch {
          // Listed but not downloaded yet: try again next pass.
          result.pending += 1
          continue
        }
        const blob = new Blob([bytes], { type: typeForFileName(name) ?? '' })
        let meta
        try {
          meta = await importAssetBlob(blob, imageCodec(), hash)
        } catch {
          // Could not be stored (e.g. storage full): try again next pass.
          result.pending += 1
          continue
        }
        if (meta) result.imported += 1
        else {
          rejected.add(name)
          result.rejected += 1
        }
      }
      return result
    },
  }
}
