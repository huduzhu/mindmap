/** Quota handling shared by autosave and undo-history writes (#48). */

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  // Firefox historically used NS_ERROR_DOM_QUOTA_REACHED.
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

/**
 * Ask the browser not to evict this origin's storage under pressure. Best
 * effort: unsupported browsers and denials are ignored.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (!storage?.persist) return false
    if (storage.persisted && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}

export interface StorageStatus {
  /** Bytes this site uses, as the browser reports it (an estimate). */
  usage: number
  /** Bytes the browser will let this site use. */
  quota: number
  /** True when the browser has agreed not to evict this site's data. */
  persisted: boolean
  /** False when the browser has no way to ask for persistence. */
  canPersist: boolean
}

/** Storage use for the start-screen meter (#83); null where unsupported. */
export async function getStorageStatus(): Promise<StorageStatus | null> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (!storage?.estimate) return null
    const estimate = await storage.estimate()
    const persisted = storage.persisted ? await storage.persisted() : false
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted,
      canPersist: typeof storage.persist === 'function',
    }
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
