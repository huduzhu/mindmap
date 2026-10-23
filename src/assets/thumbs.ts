import { getDB } from '../io/db'

/**
 * Thumbnails on screen (#149, HC5): the small, always-loaded part of the asset
 * store (src/assets/store.ts has the rest and the design note). A cache of
 * object URLs for the ≤256 px thumbnails, revoked when evicted, never while a
 * node shows one.
 */

/** The ≤256 px thumbnail, or null when the asset is not here (yet). */
export async function getThumb(hash: string): Promise<Blob | null> {
  const record = await (await getDB()).get('assets', hash)
  return record ? new Blob([record.thumb], { type: record.thumbType }) : null
}

/** Loaded thumbnails: a URL, or null when the asset is missing. Oldest first. */
const thumbUrls = new Map<string, string | null>()
const loading = new Map<string, Promise<string | null>>()
const watchers = new Map<string, Set<() => void>>()
/**
 * Bumped whenever what is known about a hash is dropped (refreshAsset,
 * forgetThumb), so a load that started before cannot cache its stale result.
 */
const generations = new Map<string, number>()
const generationOf = (hash: string) => generations.get(hash) ?? 0
/** Most thumbnail URLs kept that no mounted node is showing. */
const SPARE_THUMBS = 200

function notify(hash: string): void {
  for (const listener of watchers.get(hash) ?? []) listener()
}

/** Revoke the URLs of thumbnails nobody shows, oldest first, beyond the spare limit. */
function evict(): void {
  for (const hash of thumbUrls.keys()) {
    if (thumbUrls.size <= watchers.size + SPARE_THUMBS) return
    if (!watchers.has(hash)) forgetThumb(hash)
  }
}

/** Revoke and forget the cached thumbnail of `hash`. */
export function forgetThumb(hash: string): void {
  generations.set(hash, generationOf(hash) + 1)
  const url = thumbUrls.get(hash)
  if (url) URL.revokeObjectURL(url)
  thumbUrls.delete(hash)
}

/** The cached thumbnail URL: a string, null (missing), or undefined (not loaded yet). */
export function peekThumbUrl(hash: string): string | null | undefined {
  return thumbUrls.get(hash)
}

/** Load (once) the thumbnail of `hash` into an object URL; null when it is missing. */
export function loadThumbUrl(hash: string): Promise<string | null> {
  if (thumbUrls.has(hash)) return Promise.resolve(thumbUrls.get(hash)!)
  const existing = loading.get(hash)
  if (existing) return existing
  const generation = generationOf(hash)
  const pending: Promise<string | null> = getThumb(hash)
    .then((blob) => (blob ? URL.createObjectURL(blob) : null))
    .catch(() => null)
    .then((url) => {
      if (loading.get(hash) === pending) loading.delete(hash)
      if (generationOf(hash) !== generation) {
        // Dropped while loading (the asset arrived, say): this result may be
        // stale, so it is thrown away and the thumbnail read again.
        if (url) URL.revokeObjectURL(url)
        return loadThumbUrl(hash)
      }
      thumbUrls.set(hash, url)
      evict()
      notify(hash)
      return url
    })
  loading.set(hash, pending)
  return pending
}

/**
 * Follow the thumbnail of `hash` while a node shows it: `listener` runs when
 * its URL changes. A watched thumbnail is never evicted. Returns the unwatch.
 */
export function watchThumb(hash: string, listener: () => void): () => void {
  let set = watchers.get(hash)
  if (!set) {
    set = new Set()
    watchers.set(hash, set)
  }
  set.add(listener)
  return () => {
    const current = watchers.get(hash)
    current?.delete(listener)
    if (current?.size === 0) {
      watchers.delete(hash)
      evict()
    }
  }
}

/**
 * Forget what is known about `hash` (it arrived, or was missing and may have
 * arrived) so watchers load it again.
 */
export function refreshAsset(hash: string): void {
  const known = thumbUrls.has(hash) || loading.has(hash)
  // Even while a load runs: it may have read the asset before it arrived.
  forgetThumb(hash)
  loading.delete(hash)
  if (known) notify(hash)
}

/** Tests: revoke every cached URL. */
export function clearThumbCache(): void {
  for (const url of thumbUrls.values()) if (url) URL.revokeObjectURL(url)
  thumbUrls.clear()
  loading.clear()
}
