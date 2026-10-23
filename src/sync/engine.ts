/**
 * The folder sync itself (#108, #110, #111): one pass that compares the
 * browser's projects, the folder's files and what the two last agreed on
 * (the sync records), then writes, takes, copies or trashes as needed.
 *
 * The browser copy stays the working copy; the folder is a mirror plus an
 * inbox for changes made on other PCs. Nothing here deletes a file outright:
 * removed files move to `_trash`.
 */
import type { ProjectRecord, SyncRecord } from '../io/db'
import {
  dropInvalidMarks,
  MAX_TREE_DEPTH,
  nameWithSuffix,
  sanitizeProject,
  treeDepth,
} from '../io/sanitize'
import { parseJson, validateDoc, formatValidationErrors } from '../schema/validate'
import {
  declaredMinVersion,
  FORMAT_VERSION,
  isNewerFormat,
  projectForFile,
  withoutAppInfo,
} from '../schema/formatVersion'
import type { Project } from '../schema/types'
import { FolderBusyError, type FolderFile, type SyncFolder } from './folder'
import { FILE_SUFFIX, fileNameFor, idFromFileName, projectHash, TRASH_DIR } from './names'

export interface EngineDeps {
  folder: SyncFolder
  /** Every project record, trashed ones included. */
  listRecords(): Promise<ProjectRecord[]>
  listSync(): Promise<SyncRecord[]>
  putSync(record: SyncRecord): Promise<void>
  deleteSync(projectId: string): Promise<void>
  /**
   * Put a file's content into the project with this id (creating it when
   * missing). 'busy' when it is the open project and has unsaved edits.
   */
  adopt(id: string, project: Project, expectedUpdatedAt?: string): Promise<'applied' | 'busy'>
  /** True while this project is open here with unsaved edits (it cannot be replaced now). */
  isBusy?(id: string): boolean
  /** Keep the losing side of a conflict as separate, new projects. */
  addCopies(projects: Project[]): Promise<void>
  /**
   * Move a project to the app's Trash. 'open' when it is open here: it is
   * left alone until it is closed (#119).
   */
  trash(id: string): Promise<'trashed' | 'open'>
  /** Allow trashing many projects in this pass (the user confirmed, plan §0a-5). */
  allowMassDelete?: boolean
  /** Label for conflict copies, e.g. a date. */
  conflictLabel(): string
  /** Images in `_assets` (#149, src/sync/assets.ts); without it, images are not synced. */
  assets?: AssetSyncStep
}

/** What a pass did with images (#149). */
export interface AssetSyncResult {
  /** Images projects here use that are not in the folder yet (OneDrive still downloading). */
  pending: number
  /** Image files whose bytes do not match their name: refused. */
  rejected: number
  imported: number
  written: number
}

export interface AssetSyncStep {
  /** Before a project file is written: write the image files it needs that are missing. */
  beforeWrite(project: Project): Promise<void>
  /** After the pass: fetch missing images of these projects, write any the folder lacks. */
  settle(projects: Project[]): Promise<AssetSyncResult>
}

export type SkipReason =
  | 'unavailable'
  | 'invalid'
  | 'newer' // made by a newer version of the app: never moved or overwritten (GE0a)
  | 'busy'
  | 'open-unsaved'
  | 'open-removed'

export interface SyncReport {
  written: number
  taken: number
  created: number
  conflicts: string[]
  trashedHere: number
  trashedInFolder: number
  /** Projects trashed here that came back from the folder (restored on another PC, #114). */
  restored: number
  skipped: { file: string; reason: SkipReason; detail?: string }[]
  /** Set when the mass-deletion guard stopped this pass from trashing projects. */
  paused: { missing: number; known: number } | null
  /** Images (#149); null when the pass did not sync images. */
  images: AssetSyncResult | null
}

/** Tag on conflict copies so the start screen's tag filter finds them (#120). */
/** A file name as case- and normalisation-insensitive file systems compare it (#153). */
export function foldName(name: string): string {
  return name.normalize('NFC').toLowerCase()
}

export const CONFLICT_TAG = 'conflict'

/** The losing side of a conflict, kept as a separate project. */
export function conflictCopy(project: Project, label: string): Project {
  const tags = project.tags ?? []
  return {
    ...project,
    name: nameWithSuffix(project.name, ` (${label})`),
    tags: tags.includes(CONFLICT_TAG) ? tags : [...tags, CONFLICT_TAG],
  }
}

function errorName(error: unknown): string {
  return (error as { name?: string } | null)?.name ?? ''
}

/**
 * For each project, the hash of this PC's version that was kept as a conflict
 * copy by a pass that then could not take the folder's version (the project
 * was being edited meanwhile): the next pass does not keep it a second time.
 */
const keptLocal = new Map<string, string>()

/** More than this share of known files gone in one pass pauses deletions. */
const MASS_DELETE_SHARE = 0.5

/**
 * The file a project is synced or committed as. It says which file format it
 * needs (`app.minVersion`) only when it uses fields older apps cannot read.
 */
export function projectFileText(record: ProjectRecord): string {
  const { sourceProjectId: _source, ...project } = record.project
  return `${JSON.stringify(projectForFile({ ...project, updatedAt: record.updatedAt }), null, 2)}\n`
}

export type ParsedFile =
  | { ok: true; project: Project }
  | { ok: false; detail: string; /** Made by a newer app version (GE0a). */ newer?: boolean }

/** Read a project file as the importer would: JSON, schema, repairs. */
export function parseProjectFile(text: string): ParsedFile {
  const parsed = parseJson(text)
  if (!parsed.ok) return { ok: false, detail: parsed.error }
  const raw = parsed.doc as { kind?: unknown }
  if (raw?.kind !== 'project') return { ok: false, detail: `kind "${String(raw?.kind)}"` }
  // As import and backup restore do (#179): a tree too deep to lay out is
  // reported as invalid, before the schema check could overflow on it.
  const trees = raw as { map?: unknown; brainstorm?: unknown }
  if (Math.max(treeDepth(trees.map), treeDepth(trees.brainstorm)) > MAX_TREE_DEPTH) {
    return { ok: false, detail: `nested deeper than ${MAX_TREE_DEPTH} levels` }
  }
  const rawDeclared = declaredMinVersion(raw)
  // Unusable #148 values are dropped; a newer app's file is judged as it is.
  const doc = rawDeclared !== null && rawDeclared > FORMAT_VERSION ? raw : dropInvalidMarks(raw)
  const validation = validateDoc(doc)
  if (!validation.ok) {
    const detail = formatValidationErrors(validation.errors)
    return isNewerFormat(doc, validation.errors)
      ? { ok: false, detail, newer: true }
      : { ok: false, detail }
  }
  const declared = declaredMinVersion(doc)
  if (declared !== null && declared > FORMAT_VERSION) {
    return { ok: false, detail: `format version ${declared}`, newer: true }
  }
  const { project } = sanitizeProject(withoutAppInfo(doc as Project))
  return { ok: true, project }
}

function skipUnreadable(
  file: FolderFile,
  parsed: { detail: string; newer?: boolean },
): SyncReport['skipped'][number] {
  return { file: file.name, reason: parsed.newer ? 'newer' : 'invalid', detail: parsed.detail }
}

function newerIsLocal(record: ProjectRecord, file: Project, fileTime: number): boolean {
  const fileStamp = file.updatedAt ?? new Date(fileTime).toISOString()
  return record.updatedAt >= fileStamp
}

export async function reconcile(engineDeps: EngineDeps): Promise<SyncReport> {
  const { folder } = engineDeps
  const report: SyncReport = {
    written: 0,
    taken: 0,
    created: 0,
    conflicts: [],
    trashedHere: 0,
    trashedInFolder: 0,
    restored: 0,
    skipped: [],
    paused: null,
    images: null,
  }

  const [files, records, states] = await Promise.all([
    folder.listFiles(),
    engineDeps.listRecords(),
    engineDeps.listSync(),
  ])
  const filesById = new Map<string, FolderFile[]>()
  for (const file of files) {
    const id = idFromFileName(file.name)
    if (!id) continue
    filesById.set(id, [...(filesById.get(id) ?? []), file])
  }
  const deps: EngineDeps = {
    ...engineDeps,
    adopt: async (id, project, expectedUpdatedAt) => {
      const result = await engineDeps.adopt(id, project, expectedUpdatedAt)
      if (result === 'applied') live.set(id, project)
      return result
    },
  }
  const recordById = new Map(records.map((record) => [record.id, record]))
  // The projects kept here after this pass, for the images step (#149).
  const live = new Map<string, Project>()
  for (const record of records) if (!record.deletedAt) live.set(record.id, record.project)
  const stateById = new Map(states.map((state) => [state.projectId, state]))

  // Mass-deletion guard (plan §0a-5): files the folder had last time that are
  // all, or mostly, gone now look like a paused OneDrive or a wrong folder.
  const known = states.filter(
    (state) => !state.trashed && recordById.get(state.projectId)?.deletedAt === undefined,
  )
  const missing = known.filter((state) => !filesById.has(state.projectId)).length
  const looksWrong =
    known.length > 0 &&
    ((filesById.size === 0 && known.length >= 2) ||
      (known.length >= 3 && missing / known.length > MASS_DELETE_SHARE))
  const guardDeletes = looksWrong && !deps.allowMassDelete
  if (guardDeletes) report.paused = { missing, known: known.length }

  const read = async (file: FolderFile): Promise<ParsedFile | 'unavailable'> => {
    try {
      const { text } = await folder.readText(file.name)
      return parseProjectFile(text)
    } catch {
      // A cloud-only file while offline, or one being synced: try again later (§0a-3).
      return 'unavailable'
    }
  }

  const write = async (record: ProjectRecord, replacing?: FolderFile) => {
    // Its images first, so another PC never sees the project before them (#149).
    await deps.assets?.beforeWrite(record.project)
    const name = fileNameFor(record.project.name, record.id)
    const lastModified = await folder.writeText(name, projectFileText(record))
    // The name the file really has in the folder (see #153 below).
    let fileName = name
    if (replacing && replacing.name !== name) {
      // A rename that only changes letter case or Unicode normalisation (#153):
      // on Windows, OneDrive and macOS the write above went into the same file,
      // and moving "the old one" away would remove the project's only file.
      // Only when the folder really holds both names is the old one separate.
      let separate = true
      if (foldName(replacing.name) === foldName(name)) {
        const names = await folder.listNames().catch(() => null)
        if (!names) {
          // Unknown whether the old spelling is a separate file (#190): leave
          // the last agreement as it was, so the next pass reads the folder
          // again and moves a stale old file aside as an already-synced copy.
          report.written += 1
          return
        }
        separate = names.includes(replacing.name) && names.includes(name)
      }
      if (separate) {
        await folder.moveTo(replacing.name, TRASH_DIR).catch(() => undefined)
      } else {
        fileName = replacing.name
      }
    }
    await deps.putSync({
      projectId: record.id,
      fileName,
      lastModified,
      hash: projectHash(record.project),
    })
    report.written += 1
  }

  const remember = (id: string, file: FolderFile, project: Project) =>
    deps.putSync({
      projectId: id,
      fileName: file.name,
      lastModified: file.lastModified,
      hash: projectHash(project),
    })

  const markTrashed = (id: string, state: SyncRecord) =>
    deps.putSync({ ...state, projectId: id, trashed: true })

  const ids = new Set([...filesById.keys(), ...recordById.keys(), ...stateById.keys()])
  for (const id of ids) {
    const record = recordById.get(id)
    const stored = stateById.get(id)
    const candidates = [...(filesById.get(id) ?? [])].sort(
      (a, b) => b.lastModified - a.lastModified,
    )
    // A file OneDrive is busy with: leave this project alone until next time (#116).
    const unreadable = candidates.find((file) => file.unavailable)
    if (unreadable) {
      report.skipped.push({ file: unreadable.name, reason: 'unavailable' })
      continue
    }
    // A file the app itself wrote ("<name> (<id>).mindmap.json"); the newest
    // one wins, so a rename made on another PC is taken even while OneDrive
    // has not yet removed the old name (#130). OneDrive's own copies have
    // another ending and are only used when nothing else is there.
    const appShaped = candidates.find((file) => file.name.endsWith(`(${id})${FILE_SUFFIX}`))
    const canonical =
      appShaped ??
      candidates.find((file) => file.name === stored?.fileName) ??
      candidates.find((file) => record && file.name === fileNameFor(record.project.name, id)) ??
      candidates[0]
    const duplicates = candidates.filter((file) => file !== canonical)
    // The canonical file, read at most once per pass (a failed read is retried).
    let canonicalRead: Promise<ParsedFile | 'unavailable'> | null = null
    const readCanonical = async (file: FolderFile): Promise<ParsedFile | 'unavailable'> => {
      canonicalRead ??= read(file)
      const parsed = await canonicalRead
      if (parsed === 'unavailable') canonicalRead = null
      return parsed
    }

    try {
      // OneDrive's own conflict files and copies (§0a-6): keep their content
      // as a conflict copy when it differs, then move them out of the way.
      for (const duplicate of duplicates) {
        const parsed = await read(duplicate)
        if (parsed === 'unavailable') {
          report.skipped.push({ file: duplicate.name, reason: 'unavailable' })
          continue
        }
        if (!parsed.ok && parsed.newer) {
          // Made by a newer app: leave it exactly where it is (GE0a).
          report.skipped.push({ file: duplicate.name, reason: 'newer', detail: parsed.detail })
          continue
        }
        // Content both sides last agreed on is not a separate edit (#190): it
        // is an old file a rename left behind.
        const duplicateHash = parsed.ok ? projectHash(parsed.project) : undefined
        const separateEdit =
          parsed.ok &&
          duplicateHash !== stored?.hash &&
          (!record || duplicateHash !== projectHash(record.project))
        // The same content as the canonical file is not a separate edit either:
        // a copy OneDrive made of it. Unreadable canonical: keep the copy.
        const sameAsCanonical = async () => {
          if (!canonical) return false
          const main = await readCanonical(canonical)
          return main !== 'unavailable' && main.ok && projectHash(main.project) === duplicateHash
        }
        if (parsed.ok && separateEdit && !(await sameAsCanonical())) {
          await deps.addCopies([conflictCopy(parsed.project, deps.conflictLabel())])
          report.conflicts.push(parsed.project.name)
        }
        await folder.moveTo(duplicate.name, TRASH_DIR)
        report.trashedInFolder += 1
      }

      if (record?.deletedAt) {
        if (canonical && stored?.trashed) {
          // Its file came back after it went to _trash: restored on another PC (#114).
          const parsed = await readCanonical(canonical)
          if (parsed === 'unavailable') {
            report.skipped.push({ file: canonical.name, reason: 'unavailable' })
          } else if (!parsed.ok) {
            report.skipped.push(skipUnreadable(canonical, parsed))
          } else {
            // Its trashed copy here may hold edits the restored file lacks
            // (#183): keep them as a conflict copy before taking the file.
            if (projectHash(record.project) !== projectHash(parsed.project)) {
              await deps.addCopies([conflictCopy(record.project, deps.conflictLabel())])
              report.conflicts.push(record.project.name)
            }
            if ((await deps.adopt(id, parsed.project, record.updatedAt)) === 'applied') {
              await remember(id, canonical, parsed.project)
              report.restored += 1
            }
          }
        } else if (canonical && stored) {
          if (canonical.lastModified !== stored.lastModified) {
            // Changed on another PC since the last agreement (#183): its edit
            // wins over the trashing here, so the project comes back with it.
            const parsed = await readCanonical(canonical)
            if (parsed === 'unavailable') {
              report.skipped.push({ file: canonical.name, reason: 'unavailable' })
              continue
            }
            if (!parsed.ok) {
              report.skipped.push(skipUnreadable(canonical, parsed))
              continue
            }
            if (projectHash(parsed.project) !== stored.hash) {
              if ((await deps.adopt(id, parsed.project, record.updatedAt)) === 'applied') {
                await remember(id, canonical, parsed.project)
                report.restored += 1
              }
              continue
            }
          }
          // Trashed in this browser: move its file to _trash, and remember that.
          await folder.moveTo(canonical.name, TRASH_DIR)
          report.trashedInFolder += 1
          await markTrashed(id, stored)
        } else if (stored && !stored.trashed) {
          // Trashed here after its file went elsewhere: nothing left to move.
          await markTrashed(id, stored)
        }
        continue
      }

      // Restored from the Trash here: start over as if it had never been synced.
      const state = stored?.trashed ? undefined : stored

      if (!record) {
        if (canonical && state) {
          // Deleted for good here after it was synced: move the file aside.
          await folder.moveTo(canonical.name, TRASH_DIR)
          report.trashedInFolder += 1
          await deps.deleteSync(id)
        } else if (canonical) {
          // A project made on another PC.
          const parsed = await readCanonical(canonical)
          if (parsed === 'unavailable') {
            report.skipped.push({ file: canonical.name, reason: 'unavailable' })
          } else if (!parsed.ok) {
            report.skipped.push(skipUnreadable(canonical, parsed))
          } else if ((await deps.adopt(id, parsed.project, undefined)) === 'applied') {
            await remember(id, canonical, parsed.project)
            report.created += 1
          }
        } else if (stored) {
          await deps.deleteSync(id)
        }
        continue
      }

      const localHash = projectHash(record.project)
      if (!canonical) {
        if (state && state.hash === localHash) {
          // Its file was removed elsewhere and nothing changed here since.
          if (guardDeletes) continue
          if ((await deps.trash(id)) === 'open') {
            report.skipped.push({ file: record.project.name, reason: 'open-removed' })
            continue
          }
          await markTrashed(id, state)
          report.trashedHere += 1
        } else {
          // New here, or edited here after the file went: the edit wins.
          await write(record)
        }
        continue
      }

      const fileChanged = !state || canonical.lastModified !== state.lastModified
      const localChanged = !state || localHash !== state.hash
      if (!fileChanged && !localChanged) continue
      if (!fileChanged) {
        await write(record, canonical)
        continue
      }

      const parsed = await readCanonical(canonical)
      if (parsed === 'unavailable') {
        report.skipped.push({ file: canonical.name, reason: 'unavailable' })
        continue
      }
      if (!parsed.ok) {
        report.skipped.push(skipUnreadable(canonical, parsed))
        // A newer app's file is never moved or overwritten (GE0a): this PC's
        // edits wait here until the app is updated.
        if (localChanged && !parsed.newer) {
          // Keep the unreadable file in _trash rather than writing over it.
          await folder.moveTo(canonical.name, TRASH_DIR)
          report.trashedInFolder += 1
          await write(record)
        }
        continue
      }
      const fileHash = projectHash(parsed.project)
      if (fileHash === localHash) {
        await remember(id, canonical, parsed.project)
        continue
      }
      if (!localChanged) {
        const result = await deps.adopt(id, parsed.project, record.updatedAt)
        if (result === 'busy') {
          report.skipped.push({ file: canonical.name, reason: 'open-unsaved' })
          continue
        }
        await remember(id, canonical, parsed.project)
        report.taken += 1
        continue
      }

      // Changed on both sides: the newer one stays, the other is kept as a copy (W-D1).
      if (newerIsLocal(record, parsed.project, canonical.lastModified)) {
        await deps.addCopies([conflictCopy(parsed.project, deps.conflictLabel())])
        await write(record, canonical)
      } else {
        if (deps.isBusy?.(id)) {
          report.skipped.push({ file: canonical.name, reason: 'open-unsaved' })
          continue
        }
        // Keep this PC's version first: if anything below fails, it is not lost
        // (#124). Once per version: a pass that could not take the file kept it.
        if (keptLocal.get(id) !== localHash) {
          await deps.addCopies([conflictCopy(record.project, deps.conflictLabel())])
        }
        const result = await deps.adopt(id, parsed.project, record.updatedAt)
        if (result === 'busy') {
          keptLocal.set(id, localHash)
          report.skipped.push({ file: canonical.name, reason: 'open-unsaved' })
          continue
        }
        keptLocal.delete(id)
        await remember(id, canonical, parsed.project)
        report.taken += 1
      }
      report.conflicts.push(record.project.name)
    } catch (error) {
      if (error instanceof FolderBusyError) {
        report.skipped.push({ file: canonical?.name ?? id, reason: 'busy' })
        continue
      }
      // One file gone mid-pass (moved or renamed by OneDrive) is not a missing
      // folder: skip it and look again next time (#113). A folder that is really
      // gone fails the listing at the start of the next pass.
      if (errorName(error) === 'NotFoundError') {
        report.skipped.push({ file: canonical?.name ?? id, reason: 'unavailable' })
        continue
      }
      throw error
    }
  }
  if (deps.assets) report.images = await deps.assets.settle([...live.values()])
  return report
}
