import { restoreImages } from './packet'
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
import {
  MAX_TREE_DEPTH,
  describeRepairs,
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
import { t } from '../i18n'
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

async function importBrainstormUpdate(
  received: BrainstormUpdate,
  options: ImportOptions,
): Promise<ImportResult> {
  // The source is often the open project: compare against its latest edits,
  // not a copy the 800 ms autosave has not written yet.
  if (useProjects.getState().currentId === received.sourceProjectId) {
    await useProjects.getState().saveCurrent()
  }
  const source = await db.getProject(received.sourceProjectId)
  const base = source && !source.deletedAt ? source.project.brainstorm : undefined
  const grafted = graftBranch(received, base)
  // Pictures do not go to the AI: put them back by node id (#149).
  const update = { ...grafted, brainstorm: restoreImages(grafted.brainstorm, [base]) }
  const notes: string[] = []
  let project: Project
  if (!source || source.deletedAt) {
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
      source.project.brainstorm,
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
          sourceName: source.project.name,
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
      ...structuredClone(source.project),
      name: t('import.expandedName', { name: source.project.name }),
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
  if (source && !source.deletedAt && !source.project.map.children?.length) {
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
  if (typedDoc.sourceProjectId) {
    const decided = await offerToApply(typedDoc, options, notes)
    if (decided) return decided
  }
  let project: Project
  if (typedDoc.kind === 'project') {
    // The source id is a routing hint for this import, not part of a stored project.
    const { sourceProjectId: _source, ...rest } = typedDoc
    project = rest
  } else {
    project = templateToProject(typedDoc)
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
 * whether to apply it there. Returns the result when it was applied or
 * cancelled, or null to import it as a separate project.
 */
async function offerToApply(
  doc: Project | Template,
  options: ImportOptions,
  notes: string[],
): Promise<ImportResult | null> {
  const sourceId = doc.sourceProjectId!
  if (useProjects.getState().currentId === sourceId) await useProjects.getState().saveCurrent()
  const source = await db.getProject(sourceId)
  if (!source || source.deletedAt) {
    notes.push(t('import.noSourceCopy', { id: sourceId }))
    return null
  }
  if (!options.chooseApplyAction) return null
  const incomingMap = doc.kind === 'template' ? doc.root : doc.map
  const action = await options.chooseApplyAction({
    intent: doc.kind === 'template' ? 'convert' : 'improve',
    sourceName: source.project.name,
    mapNodes: countNodes(incomingMap) - 1,
    currentMapNodes: countNodes(source.project.map) - 1,
  })
  if (action === null) {
    return { ok: false, cancelled: true, error: t('import.cancelled') }
  }
  if (action === 'new') return null
  return applyToSource(source.id, doc)
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
  // Pictures do not go to the AI: put them back by node id (#149).
  const sources = [current.map, current.brainstorm]
  if (doc.kind === 'template') {
    // Ids are unique project-wide, so the brainstorm's ids are taken already.
    const root = restoreImages(doc.root, sources)
    const map = repairTree(root, collectNodeIds(current.brainstorm), stats)
    editor.applyTree('map', () => map)
    notes.push(t('import.applyMapUndo'))
  } else {
    const seen = new Set<string>()
    const brainstorm = repairTree(restoreImages(doc.brainstorm, sources), seen, stats)
    const map = repairTree(restoreImages(doc.map, sources), seen, stats)
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
    notes: [t('import.markdownDone', { count: bulletCount }), ...describeRepairs(stats)],
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
export function readBranch(
  filename: string,
  text: string,
  openProjectId: string | null,
): ImportBranch | null {
  let root: TreeNode
  let links: NodeLink[] = []
  if (/\.(md|markdown|txt)$/i.test(filename)) {
    const parsed = parseMarkdown(text)
    if (!parsed.children?.length) return null
    const hasHeading = text.split(/\r?\n/).some((line) => /^#\s+\S/.test(line))
    const stem = filename.replace(/\.[^.]+$/, '').trim()
    root = hasHeading || !stem ? parsed : { ...parsed, title: stem }
  } else {
    const parsed = parseJson(text)
    if (!parsed.ok) return null
    const doc = fillWrapperDefaults(parsed.doc) as {
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
  }
  if (treeDepth(root) > MAX_TREE_DEPTH - 1) return null
  const stats = emptyRepairStats()
  const repaired = repairTree(root, new Set<string>(), stats)
  const payload = copyPayload(repaired, [repaired.id], links)
  if (!payload) return null
  return { payload, title: repaired.title, count: countNodes(repaired) }
}
