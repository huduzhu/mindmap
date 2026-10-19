import { create } from 'zustand'
import { lazyImport } from '../pwa/update'
import { flushPendingEdits, hasPendingEdits } from './pendingEdits'
import { t } from '../i18n'
import { createAutosave } from '../io/autosave'
import * as db from '../io/db'
import type { ProjectRecord, SnapshotRecord } from '../io/db'
import { isQuotaError, requestPersistentStorage } from '../io/quota'
import { describeRepairs, sanitizeProject } from '../io/sanitize'
import { seedBuiltInPresets } from '../io/seed'
import { SYSTEM_PRESET } from '../theme/system'
import {
  getLastProjectId,
  isTrashAutoPurgeOn,
  markPersistenceRequested,
  setLastProjectId,
  skipReopenRequested,
  TRASH_RETENTION_DAYS,
  wasPersistenceRequested,
} from './session'
import type { Project, TreeNode } from '../schema/types'
import { makeNode, newId } from './treeOps'
import { normalizeProjectLinks } from './links'

const AUTOSAVE_DELAY_MS = 800
// Mirrors the name constraints in schemas/project.schema.json.
const MAX_NAME_LENGTH = 200

/**
 * Ask the browser once to keep this site's storage (#143), after the first
 * project is created or imported: eviction would otherwise lose the whole
 * library. Best effort and never repeated, so prompting browsers ask once.
 */
function requestPersistenceOnce(): void {
  if (wasPersistenceRequested()) return
  markPersistenceRequested()
  void requestPersistentStorage()
}

export const MAX_TAG_LENGTH = 40
export const MAX_TAG_COUNT = 20

export function sortProjectRecords(records: ProjectRecord[]): ProjectRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const pinnedDelta =
        Number(Boolean(b.record.project.pinned)) - Number(Boolean(a.record.project.pinned))
      if (pinnedDelta !== 0) return pinnedDelta
      // A record written without updatedAt must not throw inside init() (#70).
      const recencyDelta = (b.record.updatedAt ?? '').localeCompare(a.record.updatedAt ?? '')
      return recencyDelta !== 0 ? recencyDelta : a.index - b.index
    })
    .map(({ record }) => record)
}

export function filterProjectRecords(
  records: ProjectRecord[],
  tag: string | null,
): ProjectRecord[] {
  const normalized = tag?.trim().toLocaleLowerCase()
  if (!normalized) return [...records]
  return records.filter((record) =>
    (record.project.tags ?? []).some((value) => value.toLocaleLowerCase() === normalized),
  )
}

export function normalizeTag(tag: string): string | null {
  const trimmed = tag.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_TAG_LENGTH ? trimmed : null
}

export function normalizeTags(tags: string[] | undefined): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const tag of tags ?? []) {
    const normalized = normalizeTag(tag)
    if (!normalized) continue
    const key = normalized.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
    if (result.length >= MAX_TAG_COUNT) break
  }
  return result
}

// The root is a user-editable theme, seeded from the name only at creation;
// it follows a rename only while it still exactly equals the old name.
export function withRenamedRoot(map: TreeNode, oldName: string, newName: string): TreeNode {
  return map.title === oldName ? { ...map, title: newName } : map
}

/**
 * First free snapshot name for `base`: `base`, then `base (2)`, `base (3)`, …
 * The base is shortened when needed so the suffixed name stays within
 * MAX_NAME_LENGTH.
 */
export async function uniqueSnapshotName(projectId: string, base: string): Promise<string> {
  if (!(await db.getSnapshot(projectId, base))) return base
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`
    const candidate = `${base.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`
    if (!(await db.getSnapshot(projectId, candidate))) return candidate
  }
}

/** Trashed records whose deletedAt is older than TRASH_RETENTION_DAYS (#83). */
export function expiredTrash(records: ProjectRecord[], now: number): ProjectRecord[] {
  const cutoff = now - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return records.filter((record) => {
    if (!record.deletedAt) return false
    const deleted = Date.parse(record.deletedAt)
    return Number.isFinite(deleted) && deleted < cutoff
  })
}

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

type LibraryMessage =
  { type: 'project-saved'; id: string; updatedAt: string } | { type: 'library-changed' }

export interface OpenError {
  id: string
  name: string
  message: string
}

type StoredProjectCheck =
  { ok: true; project: Project; notes: string[] } | { ok: false; message: string }

/**
 * Records read back from IndexedDB were never validated (#54). A valid record
 * opens as-is; an invalid one is repaired in memory when that is enough, and
 * otherwise refused (it stays in the list, and its raw JSON can be exported).
 */
export async function checkStoredProject(stored: Project): Promise<StoredProjectCheck> {
  // Ajv and the schemas are a separate chunk (#88), loaded on first open.
  const { formatValidationErrors, validateDoc } = await lazyImport(
    () => import('../schema/validate'),
  )
  const project = normalizeProjectLinks(stored)
  if (validateDoc(project).ok) return { ok: true, project, notes: [] }
  const { project: repaired, stats } = sanitizeProject(project)
  const validation = validateDoc(repaired)
  if (validation.ok) return { ok: true, project: repaired, notes: describeRepairs(stats) }
  const first = validation.errors.slice(0, 3)
  return { ok: false, message: formatValidationErrors(first) }
}

export function dbIssueMessage(issue: db.DBIssue): string {
  switch (issue) {
    case 'blocked':
      return t('db.blocked')
    case 'blocking':
      return t('db.blocking')
    case 'terminated':
      return t('db.terminated')
  }
}

export function saveErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return t('db.quota')
  }
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') return t('db.quota')
    if (error.message) return error.message
  }
  return t('db.writeFailed')
}

export interface ProjectsState {
  records: ProjectRecord[]
  snapshots: SnapshotRecord[]
  trashed: ProjectRecord[]
  currentId: string | null
  current: Project | null
  loaded: boolean
  saveStatus: SaveStatus
  saveError: string | null
  /** A storage problem the user must act on (another tab, reload); see db.onDBIssue. */
  dbNotice: string | null
  /** Set when loadProject refused a stored record that fails the schema (#54). */
  openError: OpenError | null
  /** Repairs applied in memory to the project that was just opened (#54). */
  openNotes: string[]
  clearOpenError: () => void
  /**
   * True once a QuotaExceededError survived the recovery ladder. The toolbar
   * reacts by downloading a JSON backup of the open project (#48).
   */
  storageFull: boolean
  recoverStorage: () => Promise<boolean>
  /** Set when another tab changed the open project (#53); shown as a toast. */
  syncNotice: string | null
  init: () => Promise<void>
  /** Close the open project and return to the start screen (#75). */
  goHome: () => Promise<void>
  createProject: (name?: string) => Promise<string>
  loadProject: (id: string) => Promise<void>
  createSnapshot: (name: string) => Promise<SnapshotRecord | null>
  listSnapshots: () => Promise<SnapshotRecord[]>
  restoreSnapshot: (name: string) => Promise<boolean>
  deleteSnapshot: (name: string) => Promise<boolean>
  /** Rename a snapshot; the new name is made unique like a new one (#98). */
  renameSnapshot: (name: string, next: string) => Promise<string | null>
  saveCurrent: () => Promise<void>
  saveAs: (name: string) => Promise<string | null>
  duplicate: (id: string) => Promise<string>
  rename: (id: string, name: string) => Promise<boolean>
  setPinned: (id: string, pinned: boolean) => Promise<boolean>
  togglePin: (id: string) => Promise<boolean>
  togglePinned: (id: string) => Promise<boolean>
  addTag: (id: string, tag: string) => Promise<boolean>
  removeTag: (id: string, tag: string) => Promise<boolean>
  remove: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  purge: (id: string) => Promise<void>
  updateCurrent: (mutator: (project: Project) => Project) => void
  importProject: (project: Project) => Promise<string>
  /**
   * Add projects from a library backup as new records without opening any of
   * them (#82). Returns the new ids in the same order.
   */
  restoreProjects: (projects: Project[]) => Promise<string[]>
  /**
   * Folder sync (#110): put a project from the sync folder into the record with
   * this id, creating it when missing. The open project is replaced as one undo
   * step, or left alone ('busy') while it has unsaved edits.
   */
  adoptSynced: (
    id: string,
    project: Project,
    /** The stored updatedAt the sync pass compared against; a newer save here wins (#125). */
    expectedUpdatedAt?: string,
  ) => Promise<'applied' | 'busy'>
  hasUnsavedChanges: () => boolean
}

interface PendingSave {
  id: string
  project: Project
  /** The stored updatedAt this edit was based on, for when it is no longer open. */
  base: string | null
}

export const useProjects = create<ProjectsState>()((set, get) => {
  db.onDBIssue((issue) => set({ dbNotice: dbIssueMessage(issue) }))
  // Each pending save carries the project it belongs to (#126): opening
  // another project while a save waits must not drop or misdirect it.
  const autosave = createAutosave<PendingSave>(
    async ({ id, project, base }) => {
      const open = get().currentId === id
      // A newer copy of the open project replaced this one without a save
      // (another tab's version was adopted): nothing to write.
      if (open && get().current !== project) return
      const now = new Date().toISOString()
      const stamped: Project = { ...project, updatedAt: now }
      const result = await db.putProjectIfUnchanged(
        { id, project: stamped, updatedAt: now },
        open ? baseUpdatedAt : base,
      )
      if (!result.ok) {
        if (open) await resolveConflict(id, stamped, result.stored)
        // Deleted for good meanwhile: nothing left to keep it next to.
        else if (result.stored) await keepAsCopy(stamped)
        return
      }
      if (get().currentId === id) baseUpdatedAt = now
      set((state) => ({
        records: [
          { id, project: stamped, updatedAt: now },
          ...state.records.filter((r) => r.id !== id),
        ],
      }))
      announce({ type: 'project-saved', id, updatedAt: now })
    },
    AUTOSAVE_DELAY_MS,
    (status, error) => {
      set({
        saveStatus: status === 'idle' ? 'saved' : status,
        saveError: status === 'error' ? saveErrorMessage(error) : null,
        ...(status === 'idle' ? { storageFull: false } : {}),
      })
      if (status === 'error' && isQuotaError(error)) void get().recoverStorage()
    },
  )

  let loadSeq = 0
  // updatedAt of the stored record this tab last read or wrote for currentId.
  // Autosave writes only if the stored copy still has it (#53).
  let baseUpdatedAt: string | null = null

  // Cross-tab coordination (#53). The installed PWA and a browser tab share one
  // origin and one database; without this the last writer silently won.
  const channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('mindmap-studio')
  // Never keep a Node test worker alive just for this channel.
  ;(channel as unknown as { unref?: () => void } | null)?.unref?.()

  function announce(message: LibraryMessage) {
    try {
      channel?.postMessage(message)
    } catch {
      // A closed channel is not worth failing a save over.
    }
  }

  async function refreshLibrary() {
    const projects = await db.listProjects()
    set({
      records: sortProjectRecords(projects.filter((record) => !record.deletedAt)),
      trashed: projects.filter((record) => Boolean(record.deletedAt)),
    })
  }

  // Another tab changed the open project. Adopt its version when this tab has
  // nothing unsaved; otherwise the next autosave detects the conflict.
  async function adoptExternalChange(id: string) {
    if (get().currentId !== id || autosave.hasPending() || autosave.status() === 'saving') return
    const record = await db.getProject(id)
    if (!record || get().currentId !== id || autosave.hasPending()) return
    if (record.updatedAt === baseUpdatedAt) return
    if (record.deletedAt) {
      baseUpdatedAt = null
      set({
        currentId: null,
        current: null,
        snapshots: [],
        syncNotice: t('sync.trashed', { name: record.project.name }),
      })
      await resetEditor()
      return
    }
    const history = await db.getHistory(id)
    if (get().currentId !== id || autosave.hasPending()) return
    const editor = await import('./editor')
    baseUpdatedAt = record.updatedAt
    set({
      current: normalizeProjectLinks(record.project),
      syncNotice: t('sync.updated', { name: record.project.name }),
    })
    editor.useEditor.getState().loadHistory(history)
  }

  if (channel) {
    channel.onmessage = (event: MessageEvent<LibraryMessage>) => {
      const message = event.data
      if (!message || typeof message !== 'object') return
      void refreshLibrary().catch(() => undefined)
      if (
        message.type === 'project-saved' &&
        message.id === get().currentId &&
        message.updatedAt !== baseUpdatedAt
      ) {
        void adoptExternalChange(message.id).catch(() => undefined)
      }
    }
  }

  // A save for a project that is no longer open lost the race: keep it as a
  // separate project rather than overwrite the newer stored one.
  async function keepAsCopy(ours: Project) {
    const copy: Project = { ...ours, name: `${ours.name}${t('sync.conflictSuffix')}` }
    const copyId = newId()
    const updatedAt = new Date().toISOString()
    await db.putProject({ id: copyId, project: { ...copy, updatedAt }, updatedAt })
    announce({ type: 'library-changed' })
    await refreshLibrary().catch(() => undefined)
  }

  /**
   * Save what is pending before leaving the open project. False when the save
   * failed: the project stays open so the edit is not thrown away (#127).
   */
  async function settleBeforeLeaving(): Promise<boolean> {
    await autosave.flush()
    if (autosave.status() === 'error' && autosave.hasPending()) {
      set({ syncNotice: t('save.stayOpen') })
      return false
    }
    return true
  }

  // Our write lost the race: keep both versions. Ours becomes a new
  // "(conflict copy)" project; the tab then shows the other tab's version.
  async function resolveConflict(id: string, ours: Project, stored: ProjectRecord | undefined) {
    const copyId = newId()
    const now = new Date().toISOString()
    const suffix = t('sync.conflictSuffix')
    const copy: Project = {
      ...ours,
      name: `${ours.name.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`,
      updatedAt: now,
    }
    const copyRecord: ProjectRecord = { id: copyId, project: copy, updatedAt: now }
    await db.putProject(copyRecord)
    set((state) => ({
      records: sortProjectRecords([copyRecord, ...state.records.filter((r) => r.id !== copyId)]),
    }))
    announce({ type: 'library-changed' })
    if (get().currentId !== id) return
    const editor = await import('./editor')
    if (stored && !stored.deletedAt) {
      const history = await db.getHistory(id)
      if (get().currentId !== id) return
      baseUpdatedAt = stored.updatedAt
      set({
        current: normalizeProjectLinks(stored.project),
        syncNotice: t('sync.conflict', { name: stored.project.name, copy: copy.name }),
      })
      editor.useEditor.getState().loadHistory(history)
    } else {
      baseUpdatedAt = now
      set({
        currentId: copyId,
        current: copy,
        snapshots: [],
        syncNotice: t('sync.deletedElsewhere', { copy: copy.name }),
      })
      editor.useEditor.getState().loadHistory(undefined)
    }
  }
  let recovering: Promise<boolean> | null = null

  const flushEditorHistory = async () => {
    const editor = await import('./editor')
    await editor.flushHistory()
  }

  // Clears undo history and transient editor state for a freshly opened
  // project (create / import / Save As), then selects its root the same way
  // ProjectView does on mount. That mount effect runs before this async reset
  // finishes, so without the re-select a new project opened with nothing
  // selected and the first Tab / F2 / Space did nothing (#71).
  const resetEditor = async () => {
    const editor = await import('./editor')
    const state = editor.useEditor.getState()
    state.reset()
    const current = get().current
    if (!current) return
    const tree = state.view === 'brainstorm' ? current.brainstorm : current.map
    state.select(tree.id)
  }

  return {
    records: [],
    snapshots: [],
    trashed: [],
    currentId: null,
    current: null,
    loaded: false,
    saveStatus: 'saved',
    saveError: null,
    dbNotice: null,
    openError: null,
    openNotes: [],

    clearOpenError: () => set({ openError: null }),

    storageFull: false,
    syncNotice: null,

    // Storage-full recovery ladder (#48): free what can be rebuilt, retry the
    // failed write once, and only then flag storageFull so the UI can save a
    // backup. Named snapshots are user data and are never deleted here, and
    // neither are images (#149): any project, snapshot, Trash entry or undo
    // step may still refer to them, and they cannot be rebuilt.
    recoverStorage() {
      if (recovering) return recovering
      recovering = (async () => {
        try {
          await db.deleteHistoryExcept(get().currentId).catch(() => 0)
          const editor = await import('./editor')
          editor.useEditor.getState().shrinkHistory()
          await editor.flushHistory()
          if (autosave.hasPending()) await autosave.flush()
          const ok =
            autosave.status() !== 'error' && editor.useEditor.getState().historyError === null
          set({ storageFull: !ok })
          if (!ok) void requestPersistentStorage()
          return ok
        } finally {
          // Let a later, separate failure run the ladder again.
          setTimeout(() => {
            recovering = null
          }, 0)
        }
      })()
      return recovering
    },

    async init() {
      await autosave.flush()
      await flushEditorHistory()
      let projects: ProjectRecord[]
      try {
        await seedBuiltInPresets()
        projects = await db.listProjects()
      } catch (error) {
        set({
          dbNotice: t('db.openFailed', { error: saveErrorMessage(error) }),
        })
        return
      }
      if (get().dbNotice === dbIssueMessage('blocked')) set({ dbNotice: null })
      if (isTrashAutoPurgeOn()) {
        const expired = expiredTrash(projects, Date.now())
        for (const record of expired) await db.purgeProject(record.id).catch(() => undefined)
        if (expired.length > 0) {
          const gone = new Set(expired.map((record) => record.id))
          projects = projects.filter((record) => !gone.has(record.id))
        }
      }
      const records = sortProjectRecords(projects.filter((record) => !record.deletedAt))
      const trashed = projects.filter((record) => Boolean(record.deletedAt))
      set({ records, trashed })
      // Reopen the project that was open last time (#75), before showing
      // anything, so a reload does not flash the start screen first.
      const lastId = getLastProjectId()
      if (!get().currentId && lastId && !skipReopenRequested()) {
        if (records.some((record) => record.id === lastId)) await get().loadProject(lastId)
        else setLastProjectId(null)
      }
      set({ loaded: true })
      if (!get().currentId) {
        set({ snapshots: [] })
        const editor = await import('./editor')
        editor.useEditor.getState().loadHistory(undefined)
        editor.useEditor.getState().resetTransient()
      }
    },

    async goHome() {
      if (!(await settleBeforeLeaving())) return
      await flushEditorHistory()
      loadSeq += 1 // abandon any load still in flight
      set({ currentId: null, current: null, snapshots: [], openNotes: [] })
      await resetEditor()
    },

    async createProject(requestedName?: string) {
      if (!(await settleBeforeLeaving())) return get().currentId ?? ''
      // The default name is in the interface language (#137).
      const name = requestedName ?? t('project.untitled')
      await flushEditorHistory()
      const id = newId()
      const now = new Date().toISOString()
      const project: Project = {
        kind: 'project',
        schemaVersion: 1,
        name,
        preset: SYSTEM_PRESET,
        brainstorm: makeNode(t('view.brainstorm')),
        map: makeNode(name),
        updatedAt: now,
      }
      const record: ProjectRecord = { id, project, updatedAt: now }
      await db.putProject(record)
      baseUpdatedAt = now
      set((state) => ({
        records: sortProjectRecords([record, ...state.records]),
        currentId: id,
        current: project,
        snapshots: [],
      }))
      announce({ type: 'library-changed' })
      await resetEditor()
      requestPersistenceOnce()
      return id
    },

    async loadProject(id) {
      // Every await below is a window in which another loadProject, a create or
      // an import can switch projects. Abort as soon as that happens, and install
      // the project and its undo history in one synchronous block, so B can never
      // open with A's history (#50).
      const seq = ++loadSeq
      const startId = get().currentId
      const superseded = () => seq !== loadSeq || get().currentId !== startId
      if (!(await settleBeforeLeaving())) return
      if (superseded()) return
      await flushEditorHistory()
      if (superseded()) return
      const record = await db.getProject(id)
      if (superseded() || !record || record.deletedAt) return
      const checked = await checkStoredProject(record.project)
      if (superseded()) return
      if (!checked.ok) {
        set({ openError: { id, name: record.project.name, message: checked.message } })
        return
      }
      const history = await db.getHistory(id)
      if (superseded()) return
      const snapshots = await db.listSnapshots(id)
      if (superseded()) return
      const editor = await import('./editor')
      if (superseded()) return
      baseUpdatedAt = record.updatedAt
      set({
        currentId: id,
        current: checked.project,
        snapshots,
        openError: null,
        openNotes: checked.notes,
      })
      editor.useEditor.getState().loadHistory(history)
    },

    async createSnapshot(name) {
      const trimmed = name.trim()
      const projectId = get().currentId
      const project = get().current
      if (!projectId || !project || !trimmed || trimmed.length > MAX_NAME_LENGTH) return null
      await autosave.flush()
      if (get().currentId !== projectId) return null
      await flushEditorHistory()
      if (get().currentId !== projectId) return null
      // Snapshots are keyed by [projectId, name] and `put` upserts, so reusing a
      // name used to overwrite the earlier restore point silently (#43).
      const uniqueName = await uniqueSnapshotName(projectId, trimmed)
      if (get().currentId !== projectId) return null
      const snapshot: SnapshotRecord = {
        projectId,
        name: uniqueName,
        createdAt: new Date().toISOString(),
        project: structuredClone(project),
      }
      await db.putSnapshot(snapshot)
      if (get().currentId !== projectId) return null
      const snapshots = await db.listSnapshots(projectId)
      if (get().currentId !== projectId) return null
      set({ snapshots })
      return snapshot
    },

    async listSnapshots() {
      const projectId = get().currentId
      if (!projectId) {
        set({ snapshots: [] })
        return []
      }
      const snapshots = await db.listSnapshots(projectId)
      if (projectId === get().currentId) set({ snapshots })
      return snapshots
    },

    async restoreSnapshot(name) {
      const projectId = get().currentId
      if (!projectId || !get().current) return false
      await autosave.flush()
      if (get().currentId !== projectId) return false
      await flushEditorHistory()
      if (get().currentId !== projectId) return false
      const snapshot = await db.getSnapshot(projectId, name.trim())
      if (get().currentId !== projectId) return false
      if (!snapshot) return false
      const editor = await import('./editor')
      if (get().currentId !== projectId) return false
      const restored = editor.useEditor
        .getState()
        .replaceTrees(snapshot.project.map, snapshot.project.brainstorm, snapshot.project.links)
      if (restored) {
        await flushEditorHistory()
        if (get().currentId !== projectId) return false
      }
      return restored
    },

    async renameSnapshot(name, next) {
      const projectId = get().currentId
      const from = name.trim()
      const to = next.trim()
      if (!projectId || !from || !to || to.length > MAX_NAME_LENGTH) return null
      if (from === to) return from
      const snapshot = await db.getSnapshot(projectId, from)
      if (get().currentId !== projectId || !snapshot) return null
      const uniqueName = await uniqueSnapshotName(projectId, to)
      if (get().currentId !== projectId) return null
      await db.putSnapshot({ ...snapshot, name: uniqueName })
      await db.deleteSnapshot(projectId, from)
      const snapshots = await db.listSnapshots(projectId)
      if (get().currentId === projectId) set({ snapshots })
      return uniqueName
    },

    async deleteSnapshot(name) {
      const projectId = get().currentId
      const trimmed = name.trim()
      if (!projectId || !trimmed) return false
      const snapshot = await db.getSnapshot(projectId, trimmed)
      if (get().currentId !== projectId) return false
      if (!snapshot) return false
      await db.deleteSnapshot(projectId, trimmed)
      if (get().currentId !== projectId) return false
      const snapshots = await db.listSnapshots(projectId)
      if (get().currentId !== projectId) return false
      set({ snapshots })
      return true
    },

    async saveCurrent() {
      flushPendingEdits()
      await autosave.flush()
      await flushEditorHistory()
    },

    async saveAs(name) {
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return null

      const sourceId = get().currentId
      if (!sourceId || !get().current) return null
      await autosave.flush()
      if (get().currentId !== sourceId) return null
      await flushEditorHistory()
      if (get().currentId !== sourceId) return null

      const source = get().current
      if (!source) return null
      const id = newId()
      const now = new Date().toISOString()
      const project: Project = {
        ...structuredClone(source),
        name: trimmed,
        updatedAt: now,
      }
      const record: ProjectRecord = { id, project, updatedAt: now }
      await db.putProject(record)
      if (get().currentId !== sourceId) return null
      baseUpdatedAt = now
      announce({ type: 'library-changed' })
      set((state) => ({
        records: sortProjectRecords([record, ...state.records]),
        currentId: id,
        current: project,
        snapshots: [],
      }))
      await resetEditor()
      return id
    },

    async duplicate(id) {
      await autosave.flush()
      const source = await db.getProject(id)
      if (!source) throw new Error(`Project ${id} not found`)
      const copyId = newId()
      const now = new Date().toISOString()
      const sourceProject = normalizeProjectLinks(structuredClone(source.project))
      const copy: Project = {
        ...sourceProject,
        ...(sourceProject.tags ? { tags: normalizeTags(sourceProject.tags) } : {}),
        name: `${source.project.name} (copy)`,
        updatedAt: now,
      }
      const record: ProjectRecord = { id: copyId, project: copy, updatedAt: now }
      await db.putProject(record)
      announce({ type: 'library-changed' })
      set((state) => ({ records: sortProjectRecords([record, ...state.records]) }))
      return copyId
    },

    async rename(id, name) {
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return false
      await autosave.flush()
      if (id === get().currentId) {
        const current = get().current
        if (!current) return false
        if (current.name === trimmed) return true
        get().updateCurrent((project) => ({
          ...project,
          name: trimmed,
          map: withRenamedRoot(project.map, project.name, trimmed),
        }))
        await autosave.flush()
        return true
      }
      const record = await db.getProject(id)
      if (!record) return false
      if (record.project.name === trimmed) return true
      const now = new Date().toISOString()
      const renamed: Project = {
        ...record.project,
        name: trimmed,
        map: withRenamedRoot(record.project.map, record.project.name, trimmed),
        updatedAt: now,
      }
      await db.putProject({ id, project: renamed, updatedAt: now })
      announce({ type: 'project-saved', id, updatedAt: now })
      set((state) => ({
        records: sortProjectRecords(
          state.records.map((r) => (r.id === id ? { id, project: renamed, updatedAt: now } : r)),
        ),
      }))
      return true
    },

    async setPinned(id, pinned) {
      await autosave.flush()
      if (id === get().currentId) {
        if (!get().current) return false
        get().updateCurrent((project) =>
          project.pinned === pinned ? project : { ...project, pinned },
        )
        await autosave.flush()
        return true
      }
      const record = await db.getProject(id)
      if (!record) return false
      if (record.project.pinned === pinned) return true
      const now = new Date().toISOString()
      const project: Project = { ...record.project, pinned, updatedAt: now }
      await db.putProject({ id, project, updatedAt: now })
      set((state) => ({
        records: sortProjectRecords(
          state.records.map((r) => (r.id === id ? { id, project, updatedAt: now } : r)),
        ),
      }))
      return true
    },

    async togglePin(id) {
      const record = id === get().currentId ? get().current : (await db.getProject(id))?.project
      if (!record) return false
      return get().setPinned(id, !record.pinned)
    },

    async togglePinned(id) {
      return get().togglePin(id)
    },

    async addTag(id, tag) {
      const normalized = normalizeTag(tag)
      if (!normalized) return false
      await autosave.flush()
      const current = id === get().currentId ? get().current : undefined
      const record = current ? { project: current } : await db.getProject(id)
      if (!record) return false
      const tags = normalizeTags(record.project.tags)
      const existing = tags.find(
        (value) => value.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
      )
      if (existing && tags.length === (record.project.tags ?? []).length && existing === normalized)
        return true
      if (!existing && tags.length >= MAX_TAG_COUNT) return false
      const nextTags = existing ? tags : [...tags, normalized]
      const project: Project = { ...record.project, tags: nextTags }
      if (id === get().currentId) {
        get().updateCurrent(() => project)
        await autosave.flush()
        return true
      }
      const now = new Date().toISOString()
      const stamped = { ...project, updatedAt: now }
      await db.putProject({ id, project: stamped, updatedAt: now })
      announce({ type: 'project-saved', id, updatedAt: now })
      set((state) => ({
        records: sortProjectRecords(
          state.records.map((r) => (r.id === id ? { id, project: stamped, updatedAt: now } : r)),
        ),
      }))
      return true
    },

    async removeTag(id, tag) {
      const normalized = tag.trim().toLocaleLowerCase()
      if (!normalized) return false
      await autosave.flush()
      const current = id === get().currentId ? get().current : undefined
      const record = current ? { project: current } : await db.getProject(id)
      if (!record) return false
      const tags = normalizeTags(record.project.tags)
      const nextTags = tags.filter((value) => value.toLocaleLowerCase() !== normalized)
      if (nextTags.length === tags.length) return false
      const project: Project = {
        ...record.project,
        tags: nextTags.length > 0 ? nextTags : undefined,
      }
      if (id === get().currentId) {
        get().updateCurrent(() => project)
        await autosave.flush()
        return true
      }
      const now = new Date().toISOString()
      const stamped = { ...project, updatedAt: now }
      await db.putProject({ id, project: stamped, updatedAt: now })
      announce({ type: 'project-saved', id, updatedAt: now })
      set((state) => ({
        records: sortProjectRecords(
          state.records.map((r) => (r.id === id ? { id, project: stamped, updatedAt: now } : r)),
        ),
      }))
      return true
    },

    async remove(id) {
      await autosave.flush()
      if (id === get().currentId) await flushEditorHistory()
      const record =
        get().records.find((candidate) => candidate.id === id) ?? (await db.getProject(id))
      if (!record || record.deletedAt) return
      const deletedAt = new Date().toISOString()
      const trashedRecord: ProjectRecord = { ...record, deletedAt }
      await db.putProject(trashedRecord)
      announce({ type: 'library-changed' })
      set((state) => {
        const records = state.records.filter((r) => r.id !== id)
        const trashed = [trashedRecord, ...state.trashed.filter((r) => r.id !== id)]
        if (state.currentId === id) return { records, trashed, currentId: null, current: null }
        return { records, trashed }
      })
      if (get().currentId === null) {
        set({ snapshots: [] })
        await resetEditor()
      }
    },

    async restore(id) {
      await autosave.flush()
      // Like remove(): let a pending history write land before touching records (#70).
      await flushEditorHistory()
      const record =
        get().trashed.find((candidate) => candidate.id === id) ?? (await db.getProject(id))
      if (!record || !record.deletedAt) return
      const restored: ProjectRecord = {
        id: record.id,
        project: record.project,
        updatedAt: record.updatedAt,
      }
      await db.putProject(restored)
      announce({ type: 'library-changed' })
      set((state) => ({
        records: sortProjectRecords([restored, ...state.records.filter((r) => r.id !== id)]),
        trashed: state.trashed.filter((r) => r.id !== id),
      }))
    },

    async purge(id) {
      await autosave.flush()
      await flushEditorHistory()
      await db.purgeProject(id)
      announce({ type: 'library-changed' })
      set((state) => ({
        records: state.records.filter((r) => r.id !== id),
        trashed: state.trashed.filter((r) => r.id !== id),
      }))
    },

    updateCurrent(mutator) {
      const { current } = get()
      if (!current) return
      const next = mutator(current)
      set({ current: next })
      const id = get().currentId
      if (id) autosave.schedule({ id, project: next, base: baseUpdatedAt })
    },

    async importProject(project) {
      await autosave.flush()
      const id = newId()
      const now = new Date().toISOString()
      const cloned = normalizeProjectLinks(structuredClone(project))
      const stamped: Project = {
        ...cloned,
        ...(cloned.tags ? { tags: normalizeTags(cloned.tags) } : {}),
        updatedAt: now,
      }
      const record: ProjectRecord = { id, project: stamped, updatedAt: now }
      await db.putProject(record)
      baseUpdatedAt = now
      announce({ type: 'library-changed' })
      set((state) => ({
        records: sortProjectRecords([record, ...state.records]),
        currentId: id,
        current: stamped,
        snapshots: [],
      }))
      await resetEditor()
      requestPersistenceOnce()
      return id
    },

    async restoreProjects(projects) {
      const added: ProjectRecord[] = []
      for (const project of projects) {
        const id = newId()
        const updatedAt = project.updatedAt ?? new Date().toISOString()
        const cloned = normalizeProjectLinks(structuredClone(project))
        const stamped: Project = {
          ...cloned,
          ...(cloned.tags ? { tags: normalizeTags(cloned.tags) } : {}),
          updatedAt,
        }
        const record: ProjectRecord = { id, project: stamped, updatedAt }
        await db.putProject(record)
        added.push(record)
      }
      if (added.length > 0) {
        announce({ type: 'library-changed' })
        set((state) => ({ records: sortProjectRecords([...added, ...state.records]) }))
        requestPersistenceOnce()
      }
      return added.map((record) => record.id)
    },

    async adoptSynced(id, project, expectedUpdatedAt) {
      if (id === get().currentId) {
        if (get().hasUnsavedChanges()) return 'busy'
        // Saved here after the pass read it: the next pass sees both changes.
        if (expectedUpdatedAt !== undefined && baseUpdatedAt !== expectedUpdatedAt) return 'busy'
        const editor = await import('./editor')
        if (get().currentId !== id) return 'busy'
        editor.useEditor.getState().replaceTrees(project.map, project.brainstorm, project.links)
        get().updateCurrent((current) => {
          const { tags: _tags, pinned: _pinned, ...rest } = current
          return {
            ...rest,
            name: project.name,
            preset: project.preset,
            ...(project.tags ? { tags: normalizeTags(project.tags) } : {}),
            ...(project.pinned ? { pinned: true } : {}),
          }
        })
        await autosave.flush()
        return 'applied'
      }
      const updatedAt = project.updatedAt ?? new Date().toISOString()
      const cloned = normalizeProjectLinks(structuredClone(project))
      const { sourceProjectId: _source, ...clean } = cloned
      const record: ProjectRecord = {
        id,
        project: {
          ...clean,
          ...(clean.tags ? { tags: normalizeTags(clean.tags) } : {}),
          updatedAt,
        },
        updatedAt,
      }
      // Only over the copy the pass compared: an edit saved meanwhile (here or
      // in another tab) is never overwritten (#125).
      if (!(await db.replaceProjectIf(record, expectedUpdatedAt))) return 'busy'
      // Its undo history describes the replaced content; undoing it would
      // silently bring the old version back (#129).
      await db.deleteHistory(id).catch(() => undefined)
      // project-saved, so a tab that has it open takes the new version (#128).
      announce({ type: 'project-saved', id, updatedAt })
      set((state) => ({
        records: sortProjectRecords([record, ...state.records.filter((r) => r.id !== id)]),
        trashed: state.trashed.filter((r) => r.id !== id),
      }))
      return 'applied'
    },

    // A write in flight counts too: reloading while it runs can drop it (found by
    // the #75 E2E: Save, then an immediate reload, lost the edit).
    // Text still in an input (the notes box) counts too (#92).
    hasUnsavedChanges: () =>
      hasPendingEdits() || autosave.hasPending() || autosave.status() === 'saving',
  }
})

// Remember the open project across reloads (#75). Closing it (Home, delete,
// trash elsewhere) clears the memory, so the start screen shows next time.
useProjects.subscribe((state, previous) => {
  if (state.currentId !== previous.currentId) setLastProjectId(state.currentId)
})

// Hold a Web Lock named after the open project while it is open (#128), so
// folder sync in any tab can tell that a project is open somewhere and leave
// it alone instead of trashing it.
type LockManagerLike = {
  request(name: string, callback: () => Promise<void>): Promise<void>
  query?(): Promise<{ held?: { name?: string }[] }>
}
const OPEN_LOCK_PREFIX = 'mms-open:'
const lockManager = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks
let releaseOpenLock: (() => void) | null = null
useProjects.subscribe((state, previous) => {
  if (state.currentId === previous.currentId || !lockManager) return
  releaseOpenLock?.()
  releaseOpenLock = null
  const id = state.currentId
  if (!id) return
  void lockManager
    .request(
      `${OPEN_LOCK_PREFIX}${id}`,
      () =>
        new Promise<void>((resolve) => {
          // Granted after the user already moved on: let it go at once.
          if (useProjects.getState().currentId !== id) resolve()
          else releaseOpenLock = resolve
        }),
    )
    .catch(() => undefined)
})

/** Ids of the projects open in any tab of this app (this one included), when the browser can tell. */
export async function projectsOpenAnywhere(): Promise<Set<string>> {
  const open = new Set<string>()
  const current = useProjects.getState().currentId
  if (current) open.add(current)
  const held = await lockManager
    ?.query?.()
    .then((snapshot) => snapshot.held ?? [])
    .catch(() => [])
  for (const lock of held ?? []) {
    if (lock.name?.startsWith(OPEN_LOCK_PREFIX)) open.add(lock.name.slice(OPEN_LOCK_PREFIX.length))
  }
  return open
}
