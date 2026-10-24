import { packetDepth, restoreFromSource } from './packet'
import { SCHEMA_VERSION } from '../schema/constants'
import { SYSTEM_PRESET } from '../theme/system'
// Shared with scripts/repair-llm-output.mjs so the repair CLI and the importer
// fill exactly the same wrapper fields (#30).
import { fillWrapperDefaults } from '../../scripts/wrapper-defaults.mjs'
import type {
  BrainstormUpdate,
  NodeLink,
  PresetRef,
  Project,
  Template,
  TreeNode,
} from '../schema/types'
import { copyPayload, type ClipboardPayload } from '../map/clipboard'
import { formatValidationErrors, parseJson, validateDoc } from '../schema/validate'
import { useProjects } from '../store/projects'
import { collectNodeIds, normalizeProjectLinks } from '../store/links'
import { countNodes, findNode, makeNode, replaceNode } from '../store/treeOps'
import * as db from './db'
import { parseMarkdown } from './markdown'
import { describeRepairs } from './repairNotes'
import {
  MAX_TREE_DEPTH,
  clampText,
  emptyRepairStats,
  dropInvalidMarks,
  repairTree,
  sanitizeProject,
  treeDepth,
} from './sanitize'
import {
  declaredMinVersion,
  FORMAT_VERSION,
  isNewerFormat,
  withoutAppInfo,
} from '../schema/formatVersion'
import { t, tn } from '../i18n'
import '../i18n/en/files'

export interface ImportSuccess {
  ok: true
  projectId: string
  name: string
  notes: string[]
  /** The file was merged into an existing project rather than added (#84). */
  merged?: boolean
  /** An AI reply was applied to its source project: its map, or the whole project. */
  applied?: 'map' | 'project'
}

export interface ImportFailure {
  ok: false
  error: string
  /** The user chose Cancel; nothing went wrong and nothing was changed. */
  cancelled?: boolean
}

/** What an LLM "expand" file would change in its source project (#84). */
export interface ExpandPreview {
  sourceName: string
  added: number
  changed: number
  removed: number
  moved: number
}

export type ExpandAction = 'merge' | 'new'

/** What an AI "convert" (map) or "improve" (whole project) reply would do to its source. */
export interface ApplyPreview {
  intent: 'convert' | 'improve'
  sourceName: string
  /** Nodes below the root in the incoming map. */
  mapNodes: number
  /** Nodes below the root in the source project's current map. */
  currentMapNodes: number
}

export type ApplyAction = 'apply' | 'new'

export interface ImportOptions {
  /**
   * Asked when a brainstorm-update names a project in this library. Resolve
   * 'merge' to update that project, 'new' to import a copy, null to cancel.
   * Without it, a copy is imported (the pre-#84 behaviour).
   */
  chooseExpandAction?: (preview: ExpandPreview) => Promise<ExpandAction | null>
  /**
   * Asked when a convert (template) or improve (project) reply names a project
   * in this library. 'apply' updates that project, 'new' imports a separate
   * project, null cancels. Without it, a separate project is imported.
   */
  chooseApplyAction?: (preview: ApplyPreview) => Promise<ApplyAction | null>
}

export type ImportResult = ImportSuccess | ImportFailure

export async function resolvePreset(preset: PresetRef, notes: string[]): Promise<PresetRef> {
  if (typeof preset !== 'string') return preset
  if (preset === SYSTEM_PRESET) return preset
  const found = await db.getPreset(preset)
  if (found) return preset
  notes.push(t('import.presetMissing', { preset }))
  return 'default'
}

function templateToProject(template: Template): Project {
  return {
    kind: 'project',
    schemaVersion: SCHEMA_VERSION,
    name: template.name,
    preset: template.preset,
    brainstorm: makeNode(t('view.brainstorm')),
    map: template.root,
  }
}

function diffAppendOnly(base: TreeNode, updated: TreeNode) {
  const baseInfo = new Map<string, { title: string; notes?: string; parent: string | null }>()
  const walkBase = (node: TreeNode, parent: string | null) => {
    baseInfo.set(node.id, { title: node.title, notes: node.notes, parent })
    for (const child of node.children ?? []) walkBase(child, node.id)
  }
  walkBase(base, null)

  let changed = 0
  let moved = 0
  const seen = new Set<string>()
  const walkUpdated = (node: TreeNode, parent: string | null) => {
    seen.add(node.id)
    const before = baseInfo.get(node.id)
    if (before) {
      if (before.title !== node.title || before.notes !== node.notes) changed += 1
      if (before.parent !== parent) moved += 1
    }
    for (const child of node.children ?? []) walkUpdated(child, node.id)
  }
  walkUpdated(updated, null)

  let missing = 0
  for (const id of baseInfo.keys()) if (!seen.has(id)) missing += 1
  let added = 0
  for (const id of seen) if (!baseInfo.has(id)) added += 1
  return { missing, changed, moved, added }
}

const noMapNote = () => t('import.noMap')

/**
 * An expand packet limited to one branch comes back as that branch (#146):
 * put it back in place, so the rest of the brainstorm is kept as it was.
 */
function graftBranch(update: BrainstormUpdate, base: TreeNode | undefined): BrainstormUpdate {
  if (!base || update.brainstorm.id === base.id || !findNode(base, update.brainstorm.id))
    return update
  return { ...update, brainstorm: replaceNode(base, update.brainstorm.id, update.brainstorm) }
}

/**
 * The project an AI reply names, as it is now: the open project's in-memory
 * state (its latest edits, #184), otherwise the stored copy. 'unsaved' when it
 * is open and its save failed, so nothing may be built on the stored copy.
 */
async function liveSource(
  sourceId: string,
): Promise<{ record: db.ProjectRecord; project: Project } | null | 'unsaved'> {
  const store = useProjects.getState()
  if (store.currentId === sourceId && !(await store.saveCurrent())) return 'unsaved'
  const record = await db.getProject(sourceId)
  if (!record || record.deletedAt) return null
  const { currentId, current } = useProjects.getState()
  return { record, project: currentId === sourceId && current ? current : record.project }
}

async function importBrainstormUpdate(
  received: BrainstormUpdate,
  options: ImportOptions,
): Promise<ImportResult> {
  // The source is often the open project: compare against its latest edits,
  // not a copy the 800 ms autosave has not written yet.
  const live = await liveSource(received.sourceProjectId)
  if (live === 'unsaved') return { ok: false, error: t('import.saveFailed') }
  const source = live?.record
  const sourceProject = live?.project
  const base = sourceProject?.brainstorm
  const grafted = graftBranch(received, base)
  // Pictures and (at "titles only") notes do not go to the AI: put them back by
  // node id (#149, #154, #188).
  const update = {
    ...grafted,
    brainstorm: restoreFromSource(
      grafted.brainstorm,
      [base],
      packetDepth(received.sourceProjectId),
    ),
  }
  const notes: string[] = []
  let project: Project
  if (!source || !sourceProject) {
    notes.push(t('import.noSource', { id: update.sourceProjectId }))
    project = {
      kind: 'project',
      schemaVersion: SCHEMA_VERSION,
      name: update.name,
      preset: update.preset,
      brainstorm: update.brainstorm,
      map: makeNode(update.brainstorm.title),
    }
    notes.push(noMapNote())
  } else {
    const { missing, changed, moved, added } = diffAppendOnly(
      sourceProject.brainstorm,
      update.brainstorm,
    )
    const parts = [
      missing > 0 ? t('import.violation.removed', { count: missing }) : '',
      changed > 0 ? t('import.violation.renamed', { count: changed }) : '',
      moved > 0 ? t('import.violation.moved', { count: moved }) : '',
    ].filter(Boolean)
    const violation =
      parts.length > 0
        ? t('import.violation', { parts: parts.join(t('restore.listSeparator')) })
        : null

    const action = options.chooseExpandAction
      ? await options.chooseExpandAction({
          sourceName: sourceProject.name,
          added,
          changed,
          removed: missing,
          moved,
        })
      : 'new'
    if (action === null) {
      return { ok: false, cancelled: true, error: t('import.cancelled') }
    }
    if (action === 'merge') return mergeIntoSource(source.id, update, violation)

    if (violation) {
      notes.push(t('import.violationKept', { violation }))
    }
    project = {
      ...structuredClone(sourceProject),
      // Room for the translated " (expanded)" within the 200-character limit (#155).
      name: t('import.expandedName', { name: clampText(sourceProject.name, 180) }),
      brainstorm: update.brainstorm,
    }
  }

  const stats = emptyRepairStats()
  const seen = new Set<string>()
  project = {
    ...project,
    brainstorm: repairTree(project.brainstorm, seen, stats),
    map: repairTree(project.map, seen, stats),
  }
  project = normalizeProjectLinks(project)
  notes.push(...describeRepairs(stats))

  project = { ...project, preset: await resolvePreset(update.preset, notes) }
  if (sourceProject && !sourceProject.map.children?.length) {
    notes.push(noMapNote())
  }

  const projectId = await useProjects.getState().importProject(project)
  return { ok: true, projectId, name: project.name, notes }
}

/**
 * Merge an expand result into its source project (#84, decision K-D1): the
 * brainstorm is replaced by the returned one (the append-only contract says it
 * only adds), the map is left alone, and the change is one undo step.
 */
async function mergeIntoSource(
  sourceId: string,
  update: BrainstormUpdate,
  violation: string | null,
): Promise<ImportResult> {
  const store = useProjects.getState()
  if (store.currentId !== sourceId) await store.loadProject(sourceId)
  const current = useProjects.getState().current
  if (useProjects.getState().currentId !== sourceId || !current) {
    return { ok: false, error: t('import.mergeOpenFailed') }
  }
  const stats = emptyRepairStats()
  // Ids are unique project-wide, so the map's ids are taken already.
  const seen = collectNodeIds(current.map)
  const brainstorm = repairTree(update.brainstorm, seen, stats)
  const { useEditor } = await import('../store/editor')
  useEditor.getState().applyTree('brainstorm', () => brainstorm)
  useEditor.getState().setView('brainstorm')
  const notes: string[] = []
  if (violation) {
    notes.push(t('import.mergeViolation', { violation }))
  } else {
    notes.push(t('import.mergeUndo'))
  }
  notes.push(...describeRepairs(stats))
  return { ok: true, projectId: sourceId, name: current.name, notes, merged: true }
}

export async function importJsonText(
  text: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const parsed = parseJson(text)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const filled = fillWrapperDefaults(parsed.doc)
  const declared = declaredMinVersion(filled)
  // A bad marker or task flag is dropped, not a reason to refuse (#148); a file
  // from a newer app is left exactly as it is (GE0a).
  const doc = declared !== null && declared > FORMAT_VERSION ? filled : dropInvalidMarks(filled)
  const tooDeep = deepestTree(doc)
  if (tooDeep > MAX_TREE_DEPTH) {
    return {
      ok: false,
      error: t('import.tooDeep', { depth: tooDeep, max: MAX_TREE_DEPTH }),
    }
  }
  const validation = validateDoc(doc)
  // Made by a newer version of the app (GE0a): say so instead of listing
  // fields this version does not know.
  if (
    (!validation.ok && isNewerFormat(doc, validation.errors)) ||
    (declared !== null && declared > FORMAT_VERSION)
  ) {
    return { ok: false, error: t('import.newerVersion') }
  }
  if (!validation.ok) {
    return {
      ok: false,
      error: t('import.schema', { errors: formatValidationErrors(validation.errors) }),
    }
  }

  const typedDoc = withoutAppInfo(doc) as Project | Template | BrainstormUpdate
  if (typedDoc.kind === 'brainstorm-update') return importBrainstormUpdate(typedDoc, options)
  if (typedDoc.kind !== 'project' && typedDoc.kind !== 'template') {
    const kind = (doc as { kind?: unknown }).kind
    return {
      ok: false,
      error: t('import.wrongKind', { kind: String(kind) }),
    }
  }

  const notes: string[] = []
  let sources: TreeNode[] = []
  if (typedDoc.sourceProjectId) {
    const decided = await offerToApply(typedDoc, options, notes)
    if (decided.result) return decided.result
    sources = decided.sources
  }
  // Imported as a separate project, the reply still gets its source's pictures
  // and unseen notes back, and loses the "[image: …]" lines (#182).
  const restore = (tree: TreeNode) =>
    sources.length > 0
      ? restoreFromSource(tree, sources, packetDepth(typedDoc.sourceProjectId))
      : tree
  let project: Project
  if (typedDoc.kind === 'project') {
    // The source id is a routing hint for this import, not part of a stored project.
    const { sourceProjectId: _source, ...rest } = typedDoc
    project = { ...rest, map: restore(rest.map), brainstorm: restore(rest.brainstorm) }
  } else {
    project = templateToProject({ ...typedDoc, root: restore(typedDoc.root) })
    notes.push(t('import.template'))
  }

  const stats = emptyRepairStats()
  const seen = new Set<string>()
  project = {
    ...project,
    brainstorm: repairTree(project.brainstorm, seen, stats),
    map: repairTree(project.map, seen, stats),
  }
  project = normalizeProjectLinks(project)
  notes.push(...describeRepairs(stats))

  project = { ...project, preset: await resolvePreset(project.preset, notes) }

  const projectId = await useProjects.getState().importProject(project)
  return { ok: true, projectId, name: project.name, notes }
}

/**
 * A convert/improve reply that names its source project (#84 follow-up): ask
 * whether to apply it there. `result` is set when it was applied, cancelled
 * or refused; otherwise it is imported as a separate project, and `sources`
 * are the source's trees to restore pictures and notes from (#182).
 */
async function offerToApply(
  doc: Project | Template,
  options: ImportOptions,
  notes: string[],
): Promise<{ result: ImportResult | null; sources: TreeNode[] }> {
  const sourceId = doc.sourceProjectId!
  const live = await liveSource(sourceId)
  if (live === 'unsaved') {
    return { result: { ok: false, error: t('import.saveFailed') }, sources: [] }
  }
  if (!live) {
    notes.push(t('import.noSourceCopy', { id: sourceId }))
    return { result: null, sources: [] }
  }
  const sources = [live.project.map, live.project.brainstorm]
  if (!options.chooseApplyAction) return { result: null, sources }
  const incomingMap = doc.kind === 'template' ? doc.root : doc.map
  const action = await options.chooseApplyAction({
    intent: doc.kind === 'template' ? 'convert' : 'improve',
    sourceName: live.project.name,
    mapNodes: countNodes(incomingMap) - 1,
    currentMapNodes: countNodes(live.project.map) - 1,
  })
  if (action === null) {
    return { result: { ok: false, cancelled: true, error: t('import.cancelled') }, sources }
  }
  if (action === 'new') return { result: null, sources }
  return { result: await applyToSource(live.record.id, doc), sources }
}

/**
 * Put an AI reply into the project it was made from, as one undo step:
 * a convert reply replaces the map (the brainstorm stays), an improve reply
 * replaces both trees and the cross-links. Name, preset, tags and snapshots
 * are the project's own and stay.
 */
async function applyToSource(sourceId: string, doc: Project | Template): Promise<ImportResult> {
  const store = useProjects.getState()
  if (store.currentId !== sourceId) await store.loadProject(sourceId)
  const current = useProjects.getState().current
  if (useProjects.getState().currentId !== sourceId || !current) {
    return { ok: false, error: t('import.applyOpenFailed') }
  }
  const { useEditor } = await import('../store/editor')
  const editor = useEditor.getState()
  const stats = emptyRepairStats()
  const notes: string[] = []
  // Pictures and (at "titles only") notes do not go to the AI: put them back by
  // node id (#149, #154).
  const sources = [current.map, current.brainstorm]
  const depth = packetDepth(sourceId)
  if (doc.kind === 'template') {
    // Ids are unique project-wide, so the brainstorm's ids are taken already.
    const root = restoreFromSource(doc.root, sources, depth)
    const map = repairTree(root, collectNodeIds(current.brainstorm), stats)
    editor.applyTree('map', () => map)
    notes.push(t('import.applyMapUndo'))
  } else {
    const seen = new Set<string>()
    const brainstorm = repairTree(restoreFromSource(doc.brainstorm, sources, depth), seen, stats)
    const map = repairTree(restoreFromSource(doc.map, sources, depth), seen, stats)
    editor.replaceTrees(map, brainstorm, doc.links)
    notes.push(t('import.applyProjectUndo'))
  }
  notes.push(...describeRepairs(stats))
  editor.setView('map')
  return {
    ok: true,
    projectId: sourceId,
    name: current.name,
    notes,
    applied: doc.kind === 'template' ? 'map' : 'project',
  }
}

function deepestTree(doc: unknown): number {
  if (!doc || typeof doc !== 'object') return 0
  const candidate = doc as { map?: unknown; brainstorm?: unknown; root?: unknown }
  return Math.max(
    treeDepth(candidate.map),
    treeDepth(candidate.brainstorm),
    treeDepth(candidate.root),
  )
}

export async function importMarkdownText(text: string): Promise<ImportResult> {
  const brainstorm = parseMarkdown(text)
  const depth = treeDepth(brainstorm)
  if (depth > MAX_TREE_DEPTH) {
    return {
      ok: false,
      error: t('import.outlineTooDeep', { depth, max: MAX_TREE_DEPTH }),
    }
  }
  const bulletCount = countNodes(brainstorm) - 1
  if (bulletCount === 0) {
    return { ok: false, error: t('import.noBullets') }
  }
  // Markdown has no schema of its own, so it goes through the same repair and
  // validation gate as JSON; otherwise a long bullet produced a stored project
  // that its own JSON export could not re-import (#44).
  const { project, stats } = sanitizeProject({
    kind: 'project',
    schemaVersion: SCHEMA_VERSION,
    name: brainstorm.title,
    preset: 'default',
    brainstorm,
    map: makeNode(brainstorm.title),
  })
  const validation = validateDoc(project)
  if (!validation.ok) {
    return {
      ok: false,
      error: t('import.markdownInvalid', { errors: formatValidationErrors(validation.errors) }),
    }
  }
  const projectId = await useProjects.getState().importProject(project)
  return {
    ok: true,
    projectId,
    name: project.name,
    notes: [tn('import.markdownDone', bulletCount), ...describeRepairs(stats)],
  }
}

export async function importFileText(
  filename: string,
  text: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  if (/\.(md|markdown|txt)$/i.test(filename)) return importMarkdownText(text)
  return importJsonText(text, options)
}

/** A file read as one branch to add to the open project (#102). */
export interface ImportBranch {
  /** The branch as clipboard data, so it pastes like a copy (fresh ids, links, one undo step). */
  payload: ClipboardPayload
  title: string
  /** Nodes in the branch, its top node included. */
  count: number
}

/**
 * Read a Markdown outline, a project or a template as a single branch. Returns
 * null for anything that is not offered as a branch: AI replies meant for the
 * open project (they have their own flows), expand files, invalid files (the
 * normal import reports those), and outlines without bullets.
 */
export async function readBranch(
  filename: string,
  text: string,
  openProjectId: string | null,
): Promise<ImportBranch | null> {
  let root: TreeNode
  let links: NodeLink[] = []
  if (/\.(md|markdown|txt)$/i.test(filename)) {
    const parsed = parseMarkdown(text)
    if (!parsed.children?.length) return null
    const hasHeading = text.split(/\r\n?|\n/).some((line) => /^#\s+\S/.test(line))
    const stem = filename.replace(/\.[^.]+$/, '').trim()
    root = hasHeading || !stem ? parsed : { ...parsed, title: stem }
  } else {
    const parsed = parseJson(text)
    if (!parsed.ok) return null
    // As importJsonText: a file from a newer app is not offered (the normal
    // import explains why), and a bad marker or task flag is dropped, not a
    // reason to refuse.
    const filled = fillWrapperDefaults(parsed.doc)
    const declared = declaredMinVersion(filled)
    if (declared !== null && declared > FORMAT_VERSION) return null
    const doc = dropInvalidMarks(filled) as {
      kind?: unknown
      sourceProjectId?: string
    }
    if (doc.kind !== 'project' && doc.kind !== 'template') return null
    if (doc.sourceProjectId && doc.sourceProjectId === openProjectId) return null
    if (deepestTree(doc) > MAX_TREE_DEPTH - 1 || !validateDoc(doc).ok) return null
    if (doc.kind === 'project') {
      root = (doc as Project).map
      links = (doc as Project).links ?? []
    } else root = (doc as Template).root
    // An AI reply for a project that is not open (#182): its pictures and the
    // notes the AI did not see come back from that project.
    if (doc.sourceProjectId) {
      const source = await db.getProject(doc.sourceProjectId).catch(() => undefined)
      if (source && !source.deletedAt) {
        root = restoreFromSource(
          root,
          [source.project.map, source.project.brainstorm],
          packetDepth(doc.sourceProjectId),
        )
      }
    }
  }
  if (treeDepth(root) > MAX_TREE_DEPTH - 1) return null
  const stats = emptyRepairStats()
  const repaired = repairTree(root, new Set<string>(), stats)
  const payload = copyPayload(repaired, [repaired.id], links)
  if (!payload) return null
  return { payload, title: repaired.title, count: countNodes(repaired) }
}
