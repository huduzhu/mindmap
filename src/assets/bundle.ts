/**
 * Images inside ZIP files (#149): library backups and "with images" exports
 * carry each image as `<dir>/<hash>.<ext>`, the bytes exactly as stored, and
 * importing takes them back only when the bytes hash to the name. Loaded on
 * demand with the backup and export code.
 */
import type { Project } from '../schema/types'
import type { ZipEntry } from '../io/zip'
import { hashFromAssetName } from '../sync/assets'
import { imageCodec } from './codec'
import { importAssetBlob } from './process'
import {
  assetFileName,
  blobBytes,
  collectAssetRefs,
  getAsset,
  hasAsset,
  typeForFileName,
} from './store'

/** Folder of the images inside a backup or a "with images" export. */
export const ASSETS_PREFIX = 'assets/'
/** Folder of the images in a "Markdown with images" ZIP. */
export const MARKDOWN_IMAGES_PREFIX = 'images/'

/** Every image the projects use. */
export function projectAssetRefs(
  projects: Iterable<Project>,
  into = new Set<string>(),
): Set<string> {
  for (const project of projects) collectAssetRefs([project.map, project.brainstorm], into)
  return into
}

export interface AssetFiles {
  entries: ZipEntry[]
  /** The path of each image put in, by hash. */
  paths: Map<string, string>
  /** Images the projects use that are not in this browser. */
  missing: string[]
}

/** ZIP entries `<dir><hash>.<ext>` for the images in `hashes` that are here. */
export async function assetZipEntries(hashes: Iterable<string>, dir: string): Promise<AssetFiles> {
  const result: AssetFiles = { entries: [], paths: new Map(), missing: [] }
  for (const hash of hashes) {
    const blob = await getAsset(hash).catch(() => null)
    if (!blob) {
      result.missing.push(hash)
      continue
    }
    const path = `${dir}${assetFileName(hash, blob.type)}`
    result.entries.push({ name: path, data: new Uint8Array(await blobBytes(blob)) })
    result.paths.set(hash, path)
  }
  return result
}

export interface AssetImport {
  imported: number
  /** Already in this browser. */
  present: number
  /** Not a picture, or bytes that do not match the name. */
  rejected: number
}

/** Take in the images among `entries` under `dir` (e.g. "assets/"). */
export async function importAssetEntries(entries: ZipEntry[], dir: string): Promise<AssetImport> {
  const result: AssetImport = { imported: 0, present: 0, rejected: 0 }
  for (const entry of entries) {
    if (!entry.name.startsWith(dir)) continue
    const name = entry.name.slice(dir.length)
    const hash = hashFromAssetName(name)
    if (!hash) continue
    if (await hasAsset(hash)) {
      result.present += 1
      continue
    }
    const blob = new Blob([new Uint8Array(entry.data)], { type: typeForFileName(name) ?? '' })
    if (await importAssetBlob(blob, imageCodec(), hash)) result.imported += 1
    else result.rejected += 1
  }
  return result
}
