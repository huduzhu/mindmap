/**
 * Whole-library backup and restore (#82).
 *
 * The backup is a store-only ZIP:
 *   manifest.json                      what is inside, and how the files relate
 *   projects/<slug>-<id>.json          every project not in the trash
 *   snapshots/<id>/<slug>-<n>.json     named snapshots of those projects
 *   presets/<slug>.json                custom presets and edited built-ins
 *   assets/<hash>.webp|png|jpg         the images they use (#149), bytes as stored
 * Every project and snapshot file is a plain project document, so a single
 * file can also be pulled out and imported on its own. A backup made before
 * images (no assets/) restores as before.
 */
import type { Preset, Project } from '../schema/types'
import {
  declaredMinVersion,
  FORMAT_VERSION,
  isNewerFormat,
  projectForFile,
  withoutAppInfo,
} from '../schema/formatVersion'
import { formatValidationErrors, validateDoc } from '../schema/validate'
import { useProjects } from '../store/projects'
import * as db from './db'
import { downloadBlob, slugify } from './files'
import { resolvePreset } from './import'
import {
  MAX_TREE_DEPTH,
  describeRepairs,
  dropInvalidMarks,
  sanitizeProject,
  treeDepth,
} from './sanitize'
import { BUILT_IN_PRESETS } from './seed'
import { MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, unzip, ZipError } from './unzip'
import { zipStore, type ZipEntry } from './zip'
import {
  ASSETS_PREFIX,
  assetZipEntries,
  importAssetEntries,
  projectAssetRefs,
} from '../assets/bundle'
import { t, tn } from '../i18n'
import '../i18n/en/files'

export const BACKUP_KIND = 'mindmap-studio-backup'
export const BACKUP_VERSION = 1

export interface BackupManifest {
  kind: typeof BACKUP_KIND
  version: number
  createdAt: string
  projects: { file: string; id: string; name: string }[]
  snapshots: { file: string; projectId: string; name: string; createdAt: string }[]
  presets: { file: string; name: string }[]
  /** The images in the backup (#149); absent in older backups. */
  assets?: { file: string; hash: string }[]
  /** Set when the library or some snapshots could not be read (#158). */
  partial?: true
}

/** A library too big for one backup file that restore could read back (#157). */
export class BackupTooLargeError extends Error {
  readonly megabytes: number
  readonly limit: number

  constructor(megabytes: number, limit: number) {
    super(t('backup.tooLarge', { size: megabytes, max: limit }))
    this.name = 'BackupTooLargeError'
    this.megabytes = megabytes
    this.limit = limit
  }
}

export interface BackupOptions {
  /**
   * The project open in the editor. Its in-memory state wins over the stored
   * copy, so unsaved edits are in the backup even when storage is full.
   */
  current?: { id: string; project: Project } | null
  now?: Date
}

export interface Backup {
  bytes: Uint8Array<ArrayBuffer>
  manifest: BackupManifest
}

const encoder = new TextEncoder()
const jsonBytes = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 2)}\n`)

function isBuiltInUnchanged(preset: Preset): boolean {
  const builtIn = BUILT_IN_PRESETS.find((candidate) => candidate.name === preset.name)
  return builtIn !== undefined && JSON.stringify(builtIn) === JSON.stringify(preset)
}

/** What a backup that could not read all of storage may lack (#158). */
export function partialBackupNote(): string {
  return t('backup.partial')
}

/** Throws when restore could not read these entries back (#157). */
export function checkBackupSize(
  entries: readonly ZipEntry[],
  limits = { entry: MAX_ENTRY_BYTES, total: MAX_TOTAL_BYTES },
): void {
  const total = entries.reduce((sum, entry) => sum + entry.data.length, 0)
  const biggest = entries.reduce((max, entry) => Math.max(max, entry.data.length), 0)
  const mb = (bytes: number) => Math.ceil(bytes / (1024 * 1024))
  if (biggest > limits.entry) throw new BackupTooLargeError(mb(biggest), mb(limits.entry))
  if (total > limits.total) throw new BackupTooLargeError(mb(total), mb(limits.total))
}

export async function buildLibraryBackup(options: BackupOptions = {}): Promise<Backup> {
  const now = options.now ?? new Date()
  // Reading can fail when storage itself is in trouble; the open project is
  // still worth saving, so fall back to it alone.
  let partial = false
  const stored = await db.listProjects().catch(() => {
    partial = true
    return [] as db.ProjectRecord[]
  })
  const projects = new Map<string, Project>()
  for (const record of stored) if (!record.deletedAt) projects.set(record.id, record.project)
  if (options.current) projects.set(options.current.id, options.current.project)

  const entries: ZipEntry[] = []
  const manifest: BackupManifest = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    projects: [],
    snapshots: [],
    presets: [],
  }

  const used = new Set<string>()
  for (const [id, project] of projects) {
    projectAssetRefs([project], used)
    const file = `projects/${slugify(project.name, now)}-${id}.json`
    entries.push({ name: file, data: jsonBytes(projectForFile(project)) })
    manifest.projects.push({ file, id, name: project.name })

    const snapshots = await db.listSnapshots(id).catch(() => {
      partial = true
      return [] as db.SnapshotRecord[]
    })
    projectAssetRefs(
      snapshots.map((snapshot) => snapshot.project),
      used,
    )
    snapshots.forEach((snapshot, index) => {
      const snapshotFile = `snapshots/${id}/${slugify(snapshot.name, now)}-${index + 1}.json`
      entries.push({ name: snapshotFile, data: jsonBytes(projectForFile(snapshot.project)) })
      manifest.snapshots.push({
        file: snapshotFile,
        projectId: id,
        name: snapshot.name,
        createdAt: snapshot.createdAt,
      })
    })
  }

  const presets = await db.listPresets().catch(() => [] as Preset[])
  const usedPresetFiles = new Set<string>()
  for (const preset of presets) {
    if (isBuiltInUnchanged(preset)) continue
    let file = `presets/${slugify(preset.name, now)}.json`
    for (let n = 2; usedPresetFiles.has(file); n++) {
      file = `presets/${slugify(preset.name, now)}-${n}.json`
    }
    usedPresetFiles.add(file)
    entries.push({ name: file, data: jsonBytes(preset) })
    manifest.presets.push({ file, name: preset.name })
  }

  // The images every project and snapshot in the backup uses (#149).
  if (used.size > 0) {
    const images = await assetZipEntries(used, ASSETS_PREFIX)
    entries.push(...images.entries)
    manifest.assets = [...images.paths].map(([hash, file]) => ({ file, hash }))
  }

  if (partial) manifest.partial = true
  entries.unshift({ name: 'manifest.json', data: jsonBytes(manifest) })
  checkBackupSize(entries)
  return { bytes: zipStore(entries, now), manifest }
}

export function backupFilename(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `mindmap-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`
}

/** Build a backup of the whole library, including unsaved edits, and download it. */
export async function downloadLibraryBackup(): Promise<BackupManifest> {
  const { currentId, current } = useProjects.getState()
  const now = new Date()
  const backup = await buildLibraryBackup({
    current: currentId && current ? { id: currentId, project: current } : null,
    now,
  })
  downloadBlob(backupFilename(now), new Blob([backup.bytes], { type: 'application/zip' }))
  return backup.manifest
}

export type RestoreResult =
  | { ok: true; projects: number; snapshots: number; presets: number; notes: string[] }
  | { ok: false; error: string }

function checkProjectDoc(
  input: unknown,
): { ok: true; project: Project } | { ok: false; why: string } {
  const declared = declaredMinVersion(input)
  // Unusable #148 values are dropped; a newer app's file is judged as it is.
  const doc = declared !== null && declared > FORMAT_VERSION ? input : dropInvalidMarks(input)
  if (!doc || typeof doc !== 'object' || (doc as { kind?: unknown }).kind !== 'project') {
    return { ok: false, why: 'not a project document' }
  }
  const candidate = doc as { map?: unknown; brainstorm?: unknown }
  if (Math.max(treeDepth(candidate.map), treeDepth(candidate.brainstorm)) > MAX_TREE_DEPTH) {
    return { ok: false, why: `nested deeper than ${MAX_TREE_DEPTH} levels` }
  }
  const validation = validateDoc(doc)
  if (
    (!validation.ok && isNewerFormat(doc, validation.errors)) ||
    (declared !== null && declared > FORMAT_VERSION)
  ) {
    return { ok: false, why: t('import.newerVersion') }
  }
  if (!validation.ok) return { ok: false, why: formatValidationErrors(validation.errors) }
  return { ok: true, project: withoutAppInfo(doc as Project) }
}

/**
 * Restore a backup made by `buildLibraryBackup`. Everything is added next to
 * what is already in the library — nothing is overwritten and the open project
 * stays open. Presets whose name already exists are kept as they are here.
 */
export async function restoreLibraryBackup(bytes: Uint8Array): Promise<RestoreResult> {
  let entries: ZipEntry[]
  try {
    entries = await unzip(bytes)
  } catch (error) {
    if (error instanceof ZipError) return { ok: false, error: error.message }
    throw error
  }
  return restoreEntries(entries)
}

async function restoreEntries(entries: ZipEntry[]): Promise<RestoreResult> {
  const files = new Map(entries.map((entry) => [entry.name, entry.data]))
  const decoder = new TextDecoder()
  const readJson = (file: string): unknown => {
    const data = files.get(file)
    if (!data) throw new Error('missing from the backup')
    return JSON.parse(decoder.decode(data))
  }

  let manifest: BackupManifest
  try {
    manifest = readJson('manifest.json') as BackupManifest
  } catch {
    return {
      ok: false,
      error: t('restore.noManifest'),
    }
  }
  if (manifest?.kind !== BACKUP_KIND || !Array.isArray(manifest.projects)) {
    return { ok: false, error: t('restore.notBackup') }
  }
  if (typeof manifest.version !== 'number' || manifest.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: t('restore.newer'),
    }
  }

  const notes: string[] = []
  const skipped: string[] = []

  // Images first (#149), so restored projects show them at once.
  const images = await importAssetEntries(entries, ASSETS_PREFIX)
  if (images.rejected > 0) notes.push(tn('restore.imagesRejected', images.rejected))

  // Presets first, so restored projects that use them resolve.
  let presetCount = 0
  const keptPresets: string[] = []
  for (const entry of manifest.presets ?? []) {
    try {
      const preset = readJson(entry.file)
      const validation = validateDoc(preset)
      if (!validation.ok || (preset as { kind?: unknown }).kind !== 'preset') {
        skipped.push(t('restore.item.preset', { name: entry.name }))
        continue
      }
      if (await db.getPreset((preset as Preset).name)) {
        keptPresets.push((preset as Preset).name)
        continue
      }
      await db.putPreset(preset as Preset)
      presetCount += 1
    } catch {
      skipped.push(t('restore.item.preset', { name: entry.name }))
    }
  }
  if (keptPresets.length > 0) {
    notes.push(
      tn('restore.keptPresets', keptPresets.length, {
        names: keptPresets.join(t('restore.listSeparator')),
      }),
    )
  }

  const toRestore: { backupId: string; project: Project }[] = []
  let repairs = 0
  for (const entry of manifest.projects) {
    try {
      const checked = checkProjectDoc(readJson(entry.file))
      if (!checked.ok) {
        skipped.push(t('restore.item.project', { name: entry.name }))
        continue
      }
      const { project, stats } = sanitizeProject(checked.project)
      repairs += describeRepairs(stats).length
      const presetNotes: string[] = []
      const preset = await resolvePreset(project.preset, presetNotes)
      toRestore.push({ backupId: entry.id, project: { ...project, preset } })
    } catch {
      skipped.push(t('restore.item.project', { name: entry.name }))
    }
  }
  const ids = await useProjects.getState().restoreProjects(toRestore.map((item) => item.project))
  const idMap = new Map(toRestore.map((item, index) => [item.backupId, ids[index]]))

  let snapshotCount = 0
  for (const entry of manifest.snapshots ?? []) {
    const projectId = idMap.get(entry.projectId)
    if (!projectId) continue // its project was skipped; already reported
    try {
      const checked = checkProjectDoc(readJson(entry.file))
      if (!checked.ok) {
        skipped.push(t('restore.item.snapshot', { name: entry.name }))
        continue
      }
      await db.putSnapshot({
        projectId,
        name: entry.name,
        createdAt: entry.createdAt,
        project: sanitizeProject(checked.project).project,
      })
      snapshotCount += 1
    } catch {
      skipped.push(t('restore.item.snapshot', { name: entry.name }))
    }
  }

  if (repairs > 0) notes.push(t('restore.repairs'))
  if (skipped.length > 0) {
    notes.push(
      t('restore.skipped', {
        count: skipped.length,
        items: skipped.join(t('restore.listSeparator')),
      }),
    )
  }
  return {
    ok: true,
    projects: ids.length,
    snapshots: snapshotCount,
    presets: presetCount,
    notes,
  }
}

/** What a ZIP turned out to be: a library backup, or a project exported with its images. */
export type ZipOpenResult =
  { kind: 'backup'; result: RestoreResult } | { kind: 'project'; name: string; text: string }

/**
 * Open a ZIP dropped or imported (#82, #149): a library backup is restored;
 * a project exported "with images" (one .json and assets/) has its images
 * taken in and its project text returned for the usual import.
 */
export async function openZipFile(bytes: Uint8Array): Promise<ZipOpenResult> {
  let entries: ZipEntry[]
  try {
    entries = await unzip(bytes)
  } catch (error) {
    if (error instanceof ZipError)
      return { kind: 'backup', result: { ok: false, error: error.message } }
    throw error
  }
  const projects = entries.filter((entry) => /^[^/]+\.json$/i.test(entry.name))
  const isBackup = entries.some((entry) => entry.name === 'manifest.json')
  if (!isBackup && projects.length === 1) {
    await importAssetEntries(entries, ASSETS_PREFIX)
    return {
      kind: 'project',
      name: projects[0].name,
      text: new TextDecoder().decode(projects[0].data),
    }
  }
  return { kind: 'backup', result: await restoreEntries(entries) }
}

export function describeRestore(result: Extract<RestoreResult, { ok: true }>): string {
  const parts = [tn('restore.projects', result.projects)]
  if (result.snapshots > 0) parts.push(tn('restore.snapshots', result.snapshots))
  if (result.presets > 0) parts.push(tn('restore.presets', result.presets))
  const detail = result.notes.length > 0 ? ` ${result.notes.join(' ')}` : ''
  return t('restore.summary', { parts: parts.join(t('restore.listSeparator')), detail })
}
