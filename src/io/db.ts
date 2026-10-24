import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb'
import type { NodeLink, Preset, Project, TreeNode } from '../schema/types'

export interface ProjectRecord {
  id: string
  project: Project
  updatedAt: string
  deletedAt?: string
}

export interface HistoryEntry {
  section: 'map' | 'brainstorm' | 'links' | 'snapshot'
  tree?: TreeNode
  links?: NodeLink[]
  map?: TreeNode
  brainstorm?: TreeNode
  /** Present (even when undefined) on a snapshot of a map that had no links. */
  projectLinks?: NodeLink[] | undefined
}

export interface HistoryRecord {
  projectId: string
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export interface SnapshotRecord {
  projectId: string
  name: string
  createdAt: string
  project: Project
}

/**
 * What the folder sync (#107–#111) last agreed with the folder about one
 * project: the file it lives in, that file's modification time, and a hash
 * of the project content both sides had at that moment.
 */
export interface SyncRecord {
  projectId: string
  fileName: string
  lastModified: number
  hash: string
  /**
   * The project was trashed here and its file moved to the folder's _trash.
   * Kept so a file that comes back (restored on another PC) is taken (#114).
   */
  trashed?: boolean
}

/**
 * One stored image (#149), kept by content hash; see src/assets/store.ts. The
 * bytes are kept as ArrayBuffers rather than Blobs: every browser and the
 * test runners' IndexedDB clone those the same way.
 */
export interface AssetRecord {
  /** `sha256-<64 hex>` of `data`. */
  hash: string
  data: ArrayBuffer
  /** MIME type of `data`: image/webp, image/png or image/jpeg. */
  type: string
  w: number
  h: number
  /** Bytes kept for this asset: the image plus its thumbnail. */
  bytes: number
  createdAt: string
  /** The thumbnail, at most 256 px on its longest side. */
  thumb: ArrayBuffer
  thumbType: string
  /** Last time a node took this asset (set when it is added again). */
  lastUsedAt?: string
}

/** Small key/value settings: the sync folder handle, GitHub settings (#107, #112b). */
export interface SettingRecord {
  key: string
  value: unknown
}

interface StudioDB extends DBSchema {
  projects: {
    key: string
    value: ProjectRecord
    indexes: { 'by-updated': string }
  }
  presets: {
    key: string
    value: Preset
  }
  history: {
    key: string
    value: HistoryRecord
  }
  sync: {
    key: string
    value: SyncRecord
  }
  settings: {
    key: string
    value: SettingRecord
  }
  snapshots: {
    key: [string, string]
    value: SnapshotRecord
    indexes: { 'by-project': string }
  }
  assets: {
    key: string
    value: AssetRecord
    indexes: { 'by-bytes': number }
  }
}

export const DB_NAME = 'mindmap-studio'
export const DB_VERSION = 4

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null
let openDb: IDBPDatabase<StudioDB> | null = null

/**
 * Problems opening the database that the user can act on. `blocked`: an older
 * copy of the app (another tab or the installed PWA) still holds the previous
 * schema version open, so the upgrade cannot start. `blocking`: a newer copy
 * wants to upgrade, so this one closed its connection and must reload.
 * `terminated`: the browser closed the connection abnormally.
 */
export type DBIssue = 'blocked' | 'blocking' | 'terminated'
type DBIssueListener = (issue: DBIssue) => void
const issueListeners = new Set<DBIssueListener>()

export function onDBIssue(listener: DBIssueListener): () => void {
  issueListeners.add(listener)
  return () => issueListeners.delete(listener)
}

function reportIssue(issue: DBIssue): void {
  for (const listener of issueListeners) listener(issue)
}

/**
 * The schema upgrade, exported so tests run the real callback against
 * fake-indexeddb instead of a hand-copied duplicate (#60). Each store and each
 * index is checked independently, so a future version can add an index to an
 * existing store.
 */
export function upgradeSchema(
  db: IDBPDatabase<StudioDB>,
  transaction: IDBPTransaction<StudioDB, StoreNames<StudioDB>[], 'versionchange'>,
): void {
  if (!db.objectStoreNames.contains('projects')) {
    db.createObjectStore('projects', { keyPath: 'id' })
  }
  const projects = transaction.objectStore('projects')
  if (!projects.indexNames.contains('by-updated')) {
    projects.createIndex('by-updated', 'updatedAt')
  }
  if (!db.objectStoreNames.contains('presets')) {
    db.createObjectStore('presets', { keyPath: 'name' })
  }
  if (!db.objectStoreNames.contains('history')) {
    db.createObjectStore('history', { keyPath: 'projectId' })
  }
  if (!db.objectStoreNames.contains('snapshots')) {
    db.createObjectStore('snapshots', { keyPath: ['projectId', 'name'] })
  }
  const snapshots = transaction.objectStore('snapshots')
  if (!snapshots.indexNames.contains('by-project')) {
    snapshots.createIndex('by-project', 'projectId')
  }
  // Version 3: folder sync state and settings (#107).
  if (!db.objectStoreNames.contains('sync')) {
    db.createObjectStore('sync', { keyPath: 'projectId' })
  }
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' })
  }
  // Version 4: images by content hash (#149). The index lets the storage meter
  // add up sizes without reading any image.
  if (!db.objectStoreNames.contains('assets')) {
    db.createObjectStore('assets', { keyPath: 'hash' })
  }
  const assets = transaction.objectStore('assets')
  if (!assets.indexNames.contains('by-bytes')) {
    assets.createIndex('by-bytes', 'bytes')
  }
}

export function getDB(): Promise<IDBPDatabase<StudioDB>> {
  if (!dbPromise) {
    const opening = openDB<StudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        upgradeSchema(db, transaction)
      },
      // Without these a version bump with a second window open never settles and
      // the app sits on "Loading studio…" forever (#49).
      blocked() {
        reportIssue('blocked')
      },
      blocking() {
        openDb?.close()
        openDb = null
        dbPromise = null
        reportIssue('blocking')
      },
      terminated() {
        openDb = null
        dbPromise = null
        reportIssue('terminated')
      },
    })
    dbPromise = opening
    opening.then(
      (db) => {
        openDb = db
      },
      () => {
        // Do not cache a rejection forever: the next call retries (#49).
        if (dbPromise === opening) dbPromise = null
      },
    )
  }
  return dbPromise
}

export function resetDBConnection(): void {
  openDb?.close()
  openDb = null
  dbPromise = null
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const db = await getDB()
  const records = await db.getAllFromIndex('projects', 'by-updated')
  return records.reverse()
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const db = await getDB()
  return db.get('projects', id)
}

export async function putProject(record: ProjectRecord): Promise<void> {
  const db = await getDB()
  await db.put('projects', record)
}

export type ConditionalPutResult = { ok: true } | { ok: false; stored: ProjectRecord | undefined }

/**
 * Write `record` only if the stored copy is still the one this tab last read
 * or wrote (same `updatedAt`, not trashed). Read and write share one readwrite
 * transaction, so no other tab can slip a write in between (#53).
 */
export async function putProjectIfUnchanged(
  record: ProjectRecord,
  expectedUpdatedAt: string | null,
): Promise<ConditionalPutResult> {
  const db = await getDB()
  const tx = db.transaction('projects', 'readwrite')
  const stored = await tx.store.get(record.id)
  const unchanged =
    expectedUpdatedAt === null
      ? stored === undefined || !stored.deletedAt
      : stored !== undefined && stored.updatedAt === expectedUpdatedAt && !stored.deletedAt
  if (!unchanged) {
    await tx.done
    return { ok: false, stored }
  }
  await Promise.all([tx.store.put(record), tx.done])
  return { ok: true }
}

/**
 * Folder sync (#125): write `record` only if the stored copy still has the
 * updatedAt the sync pass read (undefined: there must be none). Unlike
 * putProjectIfUnchanged this also replaces a trashed record (a restore).
 */
export async function replaceProjectIf(
  record: ProjectRecord,
  expectedUpdatedAt: string | undefined,
): Promise<boolean> {
  const db = await getDB()
  const tx = db.transaction('projects', 'readwrite')
  const stored = await tx.store.get(record.id)
  if (stored?.updatedAt !== expectedUpdatedAt) {
    await tx.done
    return false
  }
  await Promise.all([tx.store.put(record), tx.done])
  return true
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('projects', id)
}

/**
 * Permanently delete a project together with its undo history and every
 * snapshot, in one transaction, so "Delete forever" actually frees the space
 * (#46). The old purge removed only the `projects` row and orphaned the rest.
 */
export async function purgeProject(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['projects', 'history', 'snapshots'], 'readwrite')
  const snapshotKeys = await tx.objectStore('snapshots').index('by-project').getAllKeys(id)
  await Promise.all([
    tx.objectStore('projects').delete(id),
    tx.objectStore('history').delete(id),
    ...snapshotKeys.map((key) => tx.objectStore('snapshots').delete(key)),
    tx.done,
  ])
}

export async function getHistory(projectId: string): Promise<HistoryRecord | undefined> {
  const db = await getDB()
  return db.get('history', projectId)
}

export async function putHistory(record: HistoryRecord): Promise<void> {
  const db = await getDB()
  await db.put('history', record)
}

export async function deleteHistory(projectId: string): Promise<void> {
  const db = await getDB()
  await db.delete('history', projectId)
}

/**
 * Delete the undo history of every project except `keepId`. First rung of the
 * storage-full recovery ladder (#48): losing another project's undo stack is
 * the cheapest thing to give up. Returns how many records were removed.
 */
export async function deleteHistoryExcept(keepId: string | null): Promise<number> {
  const db = await getDB()
  const tx = db.transaction('history', 'readwrite')
  const keys = await tx.store.getAllKeys()
  const doomed = keys.filter((key) => key !== keepId)
  await Promise.all([...doomed.map((key) => tx.store.delete(key)), tx.done])
  return doomed.length
}

export async function listSnapshots(projectId: string): Promise<SnapshotRecord[]> {
  const db = await getDB()
  const snapshots = await db.getAllFromIndex('snapshots', 'by-project', projectId)
  // Defensive (#191): a stored createdAt that is not a string must not make
  // every load of the project throw.
  return snapshots.sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  )
}

export async function getSnapshot(
  projectId: string,
  name: string,
): Promise<SnapshotRecord | undefined> {
  const db = await getDB()
  return db.get('snapshots', [projectId, name])
}

export async function putSnapshot(snapshot: SnapshotRecord): Promise<void> {
  const db = await getDB()
  await db.put('snapshots', snapshot)
}

export async function deleteSnapshot(projectId: string, name: string): Promise<void> {
  const db = await getDB()
  await db.delete('snapshots', [projectId, name])
}

export async function listPresets(): Promise<Preset[]> {
  const db = await getDB()
  return db.getAll('presets')
}

export async function getPreset(name: string): Promise<Preset | undefined> {
  const db = await getDB()
  return db.get('presets', name)
}

export async function putPreset(preset: Preset): Promise<void> {
  const db = await getDB()
  await db.put('presets', preset)
}

export async function deletePreset(name: string): Promise<void> {
  const db = await getDB()
  await db.delete('presets', name)
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB()
  return (await db.get('settings', key))?.value as T | undefined
}

/** Stores `value` under `key`. Throws DataCloneError for values IndexedDB cannot keep. */
export async function putSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB()
  await db.put('settings', { key, value })
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('settings', key)
}

export async function listSyncRecords(): Promise<SyncRecord[]> {
  const db = await getDB()
  return db.getAll('sync')
}

export async function putSyncRecord(record: SyncRecord): Promise<void> {
  const db = await getDB()
  await db.put('sync', record)
}

export async function deleteSyncRecord(projectId: string): Promise<void> {
  const db = await getDB()
  await db.delete('sync', projectId)
}

export async function clearSyncRecords(): Promise<void> {
  const db = await getDB()
  await db.clear('sync')
}
