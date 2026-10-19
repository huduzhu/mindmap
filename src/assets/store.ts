import { getDB, type AssetRecord } from '../io/db'
import type { TreeNode } from '../schema/types'
import { forgetThumb, refreshAsset } from './thumbs'

export {
  clearThumbCache,
  getThumb,
  loadThumbUrl,
  peekThumbUrl,
  refreshAsset,
  watchThumb,
} from './thumbs'

/**
 * Asset store (#149, HC2): images kept outside the projects, by content hash.
 *
 * Design note (the API the other image parts plug into):
 *
 * - A node carries `image: { asset, w, h, alt? }` (src/map/image.ts). `asset`
 *   is `sha256-<64 hex>` of the stored bytes, so the same picture is kept once
 *   however many nodes, projects, snapshots or undo steps use it. Records live
 *   in the IndexedDB store `assets` (DB version 4, src/io/db.ts `AssetRecord`):
 *   the bytes and a ≤256 px thumbnail as ArrayBuffers, type, w, h, bytes,
 *   createdAt and lastUsedAt.
 * - Writing: `putAsset(blob, { w, h, thumb })` hashes the bytes and stores
 *   them once (a second put of the same bytes only refreshes lastUsedAt), then
 *   returns the `AssetMeta`. New images go through the lazy processing module
 *   first (src/assets/process.ts: `processImage` scales and re-encodes,
 *   `importAssetBlob` keeps given bytes as they are, for a file that already
 *   has a hash name such as `_assets/<hash>.webp`), and are put on nodes by
 *   src/assets/attach.ts.
 * - Reading: `getAsset(hash)` / `getThumb(hash)` give Blobs (null when the
 *   asset is not here yet); `getAssetMeta`, `hasAsset`, `listAssetHashes` and
 *   `assetBytesTotal` never read image bytes.
 * - Files: `assetFileName(hash, type)` is `<hash>.webp|png|jpg`, the name for
 *   folder sync, backups and exports; `typeForFileName` maps it back.
 * - References: `collectAssetRefs(trees)` lists the hashes the given trees
 *   use. Nothing here deletes an asset on its own: `deleteAsset` is for a
 *   cleanup that has scanned every project, snapshot, undo history and the
 *   Trash first. The storage-full recovery never deletes assets.
 * - Thumbnails on screen: `peekThumbUrl`, `loadThumbUrl` and `watchThumb`
 *   keep an object-URL cache (revoked when evicted, never while shown);
 *   `useThumbUrl` (src/assets/useThumb.ts) wraps them for components. They
 *   live in src/assets/thumbs.ts, the only part in the startup bundle, and
 *   are re-exported here. When an asset arrives later (for example from the
 *   sync folder), `putAsset` calls `refreshAsset(hash)`, so placeholders
 *   showing "not available yet" retry.
 * - This module loads on demand: import it from lazily loaded code (or with
 *   a dynamic import), never from the startup bundle.
 */

export interface AssetMeta {
  hash: string
  type: string
  w: number
  h: number
  /** Bytes kept: the image plus its thumbnail. */
  bytes: number
  createdAt: string
  lastUsedAt?: string
}

const HEX = '0123456789abcdef'

/** `sha256-<hex>` of `data`. */
export async function hashBytes(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  let hex = ''
  for (const byte of digest) hex += HEX[byte >> 4] + HEX[byte & 15]
  return `sha256-${hex}`
}

/** A Blob's bytes, also where Blob#arrayBuffer is missing (older test DOMs). */
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsArrayBuffer(blob)
  })
}

function metaOf(record: AssetRecord): AssetMeta {
  const meta: AssetMeta = {
    hash: record.hash,
    type: record.type,
    w: record.w,
    h: record.h,
    bytes: record.bytes,
    createdAt: record.createdAt,
  }
  if (record.lastUsedAt) meta.lastUsedAt = record.lastUsedAt
  return meta
}

/**
 * Store `blob` (already processed) under the hash of its bytes, with its
 * stored size and thumbnail. The same bytes are kept once: putting them again
 * only refreshes `lastUsedAt`. Throws on a storage error (e.g. quota).
 */
export async function putAsset(
  blob: Blob,
  info: { w: number; h: number; thumb: Blob },
  now: Date = new Date(),
): Promise<AssetMeta> {
  const data = await blobBytes(blob)
  const hash = await hashBytes(data)
  const thumb = await blobBytes(info.thumb)
  const db = await getDB()
  const tx = db.transaction('assets', 'readwrite')
  const existing = await tx.store.get(hash)
  const stamp = now.toISOString()
  let record: AssetRecord
  if (existing) {
    record = { ...existing, lastUsedAt: stamp }
  } else {
    record = {
      hash,
      data,
      type: blob.type || 'application/octet-stream',
      w: info.w,
      h: info.h,
      bytes: data.byteLength + thumb.byteLength,
      createdAt: stamp,
      thumb,
      thumbType: info.thumb.type || blob.type,
      lastUsedAt: stamp,
    }
  }
  await Promise.all([tx.store.put(record), tx.done])
  if (!existing) refreshAsset(hash)
  return metaOf(record)
}

export async function getAssetMeta(hash: string): Promise<AssetMeta | null> {
  const record = await (await getDB()).get('assets', hash)
  return record ? metaOf(record) : null
}

/** The stored image, or null when it is not here (yet). */
export async function getAsset(hash: string): Promise<Blob | null> {
  const record = await (await getDB()).get('assets', hash)
  return record ? new Blob([record.data], { type: record.type }) : null
}

export async function hasAsset(hash: string): Promise<boolean> {
  return (await (await getDB()).getKey('assets', hash)) !== undefined
}

export async function listAssetHashes(): Promise<string[]> {
  return (await getDB()).getAllKeys('assets')
}

/** Only for a cleanup that has checked nothing refers to `hash` any more. */
export async function deleteAsset(hash: string): Promise<void> {
  await (await getDB()).delete('assets', hash)
  forgetThumb(hash)
}

/** Bytes all assets take (images and thumbnails), read from the size index only. */
export async function assetBytesTotal(): Promise<number> {
  const db = await getDB()
  let total = 0
  let cursor = await db.transaction('assets').store.index('by-bytes').openKeyCursor()
  while (cursor) {
    total += cursor.key
    cursor = await cursor.continue()
  }
  return total
}

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/** `<hash>.webp` (or .png / .jpg): the file name of an asset outside the browser. */
export function assetFileName(hash: string, type: string): string {
  return `${hash}.${EXTENSIONS[type] ?? 'bin'}`
}

/** The MIME type for an asset file name, or null when it is not one. */
export function typeForFileName(name: string): string | null {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  for (const [type, ext] of Object.entries(EXTENSIONS)) if (ext === extension) return type
  return null
}

/** Every asset hash the given trees use. */
export function collectAssetRefs(
  trees: Iterable<TreeNode | undefined>,
  into: Set<string> = new Set(),
): Set<string> {
  for (const tree of trees) {
    const stack: TreeNode[] = tree ? [tree] : []
    while (stack.length > 0) {
      const node = stack.pop()!
      if (node.image?.asset) into.add(node.image.asset)
      if (node.children) stack.push(...node.children)
    }
  }
  return into
}
