import type { Project, TreeNode } from '../schema/types'
import { MAX_NOTES_LENGTH } from '../schema/constants'
import { cleanLinkLabel, normalizeProjectLinks } from '../store/links'
import { newId } from '../store/treeOps'
import { t } from '../i18n'
import { isColorSlot, isEmojiMarker } from '../map/marks'
import { areCleanTags, normalizeNodeTags } from '../map/tags'
import { cleanImage } from '../map/image'

// Mirrors schemas/tree-node.schema.json and schemas/project.schema.json.
export const MAX_ID_LENGTH = 64
export const MAX_TITLE_LENGTH = 500
export { MAX_NOTES_LENGTH }
export const MAX_PROJECT_NAME_LENGTH = 200
/**
 * The schemas cap children per level but not depth. Validation, layout and the
 * outliners all recurse, and around 20 000 levels they overflow the stack, so
 * imports deeper than this are refused with a clear message (#65).
 */
export const MAX_TREE_DEPTH = 1000

/**
 * Depth of a parsed (not yet validated) tree, computed iteratively so that a
 * pathological input cannot overflow the stack while being measured.
 * A lone root has depth 1; anything that is not a node has depth 0.
 */
export function treeDepth(root: unknown): number {
  if (!root || typeof root !== 'object') return 0
  let max = 0
  const stack: { node: unknown; depth: number }[] = [{ node: root, depth: 1 }]
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    if (depth > max) max = depth
    const children = (node as { children?: unknown }).children
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === 'object') stack.push({ node: child, depth: depth + 1 })
      }
    }
  }
  return max
}

export interface RepairStats {
  repairedIds: number
  repairedTitles: number
  truncatedTitles: number
  truncatedNotes: number
}

export function emptyRepairStats(): RepairStats {
  return { repairedIds: 0, repairedTitles: 0, truncatedTitles: 0, truncatedNotes: 0 }
}

/** Cut `text` to at most `max` characters, marking the cut with an ellipsis. */
export function clampText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Make a tree schema-valid where that can be done without guessing: reassign
 * duplicate or over-long ids, fill empty titles, and truncate over-long titles
 * and notes. `seen` is shared across trees so ids stay unique project-wide.
 */
export function repairTree(tree: TreeNode, seen: Set<string>, stats: RepairStats): TreeNode {
  let node = tree
  if (seen.has(node.id) || !node.id || node.id.length > MAX_ID_LENGTH) {
    node = { ...node, id: newId() }
    stats.repairedIds += 1
  }
  seen.add(node.id)
  if (!node.title.trim()) {
    node = { ...node, title: 'Untitled' }
    stats.repairedTitles += 1
  } else if (node.title.length > MAX_TITLE_LENGTH) {
    node = { ...node, title: clampText(node.title, MAX_TITLE_LENGTH) }
    stats.truncatedTitles += 1
  }
  if (node.notes !== undefined && node.notes.length > MAX_NOTES_LENGTH) {
    node = { ...node, notes: clampText(node.notes, MAX_NOTES_LENGTH) }
    stats.truncatedNotes += 1
  }
  node = withValidMarks(node)
  if (node.children?.length) {
    node = { ...node, children: node.children.map((c) => repairTree(c, seen, stats)) }
  }
  return node
}

/**
 * The #148 fields are extras: a value this app cannot use is dropped, never a
 * reason to refuse the whole project. `done` on a node that is not a task is
 * kept (it shows again if the node becomes a task). Node tags (#150) are
 * normalised: `#`, spaces and capitals go, unusable tags and duplicates are
 * dropped, at most 10 stay. An image (#149) with an unusable asset or size is
 * dropped; its alt text is trimmed and cut to 300 characters.
 */
function withValidMarks(node: TreeNode): TreeNode {
  const raw = node as TreeNode & Record<string, unknown>
  const badDone = raw.done !== undefined && typeof raw.done !== 'boolean'
  const badColor = raw.color !== undefined && !isColorSlot(raw.color)
  const badIcon = raw.icon !== undefined && !isEmojiMarker(raw.icon)
  const badTags = raw.tags !== undefined && !areCleanTags(raw.tags)
  const image = raw.image === undefined ? undefined : cleanImage(raw.image)
  const badImage = image !== undefined && JSON.stringify(image) !== JSON.stringify(raw.image)
  if (!badDone && !badColor && !badIcon && !badTags && !badImage) return node
  const next = { ...raw }
  if (badDone) delete next.done
  if (badColor) delete next.color
  if (badIcon) delete next.icon
  if (badTags) {
    const tags = normalizeNodeTags(raw.tags)
    if (tags) next.tags = tags
    else delete next.tags
  }
  if (badImage) {
    if (image) next.image = image
    else delete next.image
  }
  return next as TreeNode
}

function cleanTreeMarks(tree: unknown): unknown {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return tree
  const node = tree as TreeNode
  let next = withValidMarks(node)
  if (Array.isArray(node.children)) {
    const children = node.children.map(cleanTreeMarks) as TreeNode[]
    if (children.some((child, index) => child !== node.children![index])) {
      next = { ...next, children }
    }
  }
  return next
}

/**
 * Drop unusable values of the #148 fields from a parsed document before it is
 * validated, so a bad marker does not make the schema reject the project.
 * Copies only what changes; anything that is not a tree is left as it is.
 */
export function dropInvalidMarks<T>(doc: T): T {
  if (!doc || typeof doc !== 'object') return doc
  const record = doc as Record<string, unknown>
  let next: Record<string, unknown> = record
  for (const key of ['map', 'brainstorm', 'root']) {
    // Too deep to walk safely: the depth check refuses it afterwards.
    if (!(key in record) || treeDepth(record[key]) > MAX_TREE_DEPTH) continue
    const cleaned = cleanTreeMarks(record[key])
    if (cleaned !== record[key]) next = { ...next, [key]: cleaned }
  }
  // Link labels (#148c): trimmed and cut to 80 characters, or dropped.
  if (Array.isArray(record.links)) {
    let changed = false
    const links = record.links.map((link: unknown) => {
      if (!link || typeof link !== 'object' || !('label' in link)) return link
      const { label, ...rest } = link as { label?: unknown }
      const clean = cleanLinkLabel(label)
      if (clean === label) return link
      changed = true
      return clean ? { ...rest, label: clean } : rest
    })
    if (changed) next = { ...next, links }
  }
  return next as T
}

/** Repair both trees, clamp the name and drop dangling links. */
export function sanitizeProject(project: Project): { project: Project; stats: RepairStats } {
  const stats = emptyRepairStats()
  const seen = new Set<string>()
  const name = project.name.trim()
    ? clampText(project.name.trim(), MAX_PROJECT_NAME_LENGTH)
    : t('project.untitled')
  const repaired: Project = normalizeProjectLinks({
    ...project,
    name,
    brainstorm: repairTree(project.brainstorm, seen, stats),
    map: repairTree(project.map, seen, stats),
  })
  return { project: repaired, stats }
}

export function describeRepairs(stats: RepairStats): string[] {
  const notes: string[] = []
  if (stats.repairedIds > 0) notes.push(t('repair.ids', { count: stats.repairedIds }))
  if (stats.repairedTitles > 0) notes.push(t('repair.titles', { count: stats.repairedTitles }))
  if (stats.truncatedTitles > 0) {
    notes.push(t('repair.longTitles', { count: stats.truncatedTitles, max: MAX_TITLE_LENGTH }))
  }
  if (stats.truncatedNotes > 0) {
    notes.push(t('repair.longNotes', { count: stats.truncatedNotes, max: MAX_NOTES_LENGTH }))
  }
  return notes
}
