/**
 * Copy, cut and paste of nodes (#101, decision S-D1).
 *
 * A copy puts two things on the clipboard: the nodes as a Markdown outline
 * (text/plain), so they paste cleanly into notes, chat and documents, and the
 * full data (titles, notes, roles, sides, folds and the cross-links between
 * the copied nodes) under a custom type, so a paste back into the app loses
 * nothing. Pasting plain text from anywhere else reads it as an outline.
 */
import type { NodeLink, TreeNode } from '../schema/types'
import { MAX_TREE_DEPTH, treeDepth } from '../io/sanitize'
import { flattenTitle as flatten, parseMarkdown } from '../io/markdown'
import { ROLES, SIDES, type Role, type Side } from '../schema/constants'
import { clampNotes, clampTitle, findNode, MAX_CHILDREN, newId, pathTo } from '../store/treeOps'
import { cleanLinkLabel } from '../store/links'
import { cleanImage } from './image'
import { isColorSlot, isEmojiMarker } from './marks'
import { normalizeNodeTags } from './tags'

export const CLIPBOARD_MIME = 'application/x-mindmap-studio+json'
export const CLIPBOARD_KIND = 'mindmap-studio-nodes'
export { MAX_CHILDREN }

export interface ClipboardPayload {
  kind: typeof CLIPBOARD_KIND
  version: 1
  nodes: TreeNode[]
  /** Cross-links whose ends are both inside the copied nodes. */
  links: NodeLink[]
}

/** Every id in a subtree. */
function collectIds(node: TreeNode, into = new Set<string>()): Set<string> {
  into.add(node.id)
  for (const child of node.children ?? []) collectIds(child, into)
  return into
}

/**
 * The selected nodes to copy, in outline order, leaving out any node whose
 * ancestor is also selected (it comes along with that ancestor).
 */
export function topLevelSelection(tree: TreeNode, ids: Iterable<string>): TreeNode[] {
  const wanted = new Set(ids)
  const result: TreeNode[] = []
  const walk = (node: TreeNode) => {
    if (wanted.has(node.id)) {
      result.push(node)
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return result
}

export function copyPayload(
  tree: TreeNode,
  ids: Iterable<string>,
  links: NodeLink[] = [],
): ClipboardPayload | null {
  const nodes = topLevelSelection(tree, ids)
  if (nodes.length === 0) return null
  const inside = new Set<string>()
  for (const node of nodes) collectIds(node, inside)
  return {
    kind: CLIPBOARD_KIND,
    version: 1,
    nodes: structuredClone(nodes),
    links: links.filter((link) => inside.has(link.from) && inside.has(link.to)),
  }
}

/** The copied nodes as a Markdown outline: bullets, notes as quotes under them. */
export function payloadToText(payload: ClipboardPayload): string {
  const lines: string[] = []
  const walk = (node: TreeNode, depth: number) => {
    const indent = '  '.repeat(depth)
    lines.push(`${indent}- ${flatten(node.title)}`)
    if (node.notes?.trim()) {
      for (const line of node.notes.trimEnd().split(/\r?\n/)) {
        lines.push(line.trim() ? `${indent}  > ${line}` : `${indent}  >`)
      }
    }
    for (const child of node.children ?? []) walk(child, depth + 1)
  }
  for (const node of payload.nodes) walk(node, 0)
  return `${lines.join('\n')}\n`
}

/** Give every pasted node a new id, and move the links along with them. */
export function withFreshIds(payload: ClipboardPayload): ClipboardPayload {
  const ids = new Map<string, string>()
  const renew = (node: TreeNode): TreeNode => {
    const id = newId()
    ids.set(node.id, id)
    return { ...node, id, children: node.children?.map(renew) }
  }
  const nodes = payload.nodes.map(renew)
  const links = payload.links.flatMap((link) => {
    const from = ids.get(link.from)
    const to = ids.get(link.to)
    if (!from || !to) return []
    return [link.label ? { from, to, label: link.label } : { from, to }]
  })
  return { ...payload, nodes, links }
}

/**
 * Read the app's own clipboard data defensively — it may come from another
 * page. Returns null for anything that is not a well-formed node list.
 */
export function parsePayload(json: string): ClipboardPayload | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const candidate = data as { kind?: unknown; nodes?: unknown; links?: unknown }
  if (candidate.kind !== CLIPBOARD_KIND || !Array.isArray(candidate.nodes)) return null
  if (candidate.nodes.length === 0 || candidate.nodes.length > MAX_CHILDREN) return null
  const nodes: TreeNode[] = []
  for (const raw of candidate.nodes) {
    const node = readNode(raw, 1)
    if (!node) return null
    nodes.push(node)
  }
  const links = Array.isArray(candidate.links)
    ? candidate.links.flatMap((raw) => {
        const link = raw as { from?: unknown; to?: unknown; label?: unknown }
        if (typeof link?.from !== 'string' || typeof link.to !== 'string') return []
        const label = cleanLinkLabel(link.label)
        return [label ? { from: link.from, to: link.to, label } : { from: link.from, to: link.to }]
      })
    : []
  return { kind: CLIPBOARD_KIND, version: 1, nodes, links }
}

function readNode(raw: unknown, depth: number): TreeNode | null {
  if (depth > MAX_TREE_DEPTH || !raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.title !== 'string') return null
  const node: TreeNode = {
    // Replaced on paste; kept only so links inside the copy can be matched.
    id: typeof value.id === 'string' && value.id ? value.id : newId(),
    title: clampTitle(value.title),
  }
  if (typeof value.notes === 'string' && value.notes) {
    node.notes = clampNotes(value.notes)
  }
  if ((ROLES as readonly unknown[]).includes(value.role)) node.role = value.role as Role
  if ((SIDES as readonly unknown[]).includes(value.side)) node.side = value.side as Side
  if (value.collapsed === true) node.collapsed = true
  // Task state and markers (#148) travel with a copied branch.
  if (value.done === true) node.done = true
  if (isColorSlot(value.color)) node.color = value.color
  if (isEmojiMarker(value.icon)) node.icon = value.icon
  // Tags (#150) and the picture (#149) travel too; the image bytes stay in the
  // browser-wide asset store, so the pasted node shows the same picture.
  const tags = normalizeNodeTags(value.tags)
  if (tags) node.tags = tags
  const image = cleanImage(value.image)
  if (image) node.image = image
  if (Array.isArray(value.children)) {
    if (value.children.length > MAX_CHILDREN) return null
    const children: TreeNode[] = []
    for (const child of value.children) {
      const read = readNode(child, depth + 1)
      if (!read) return null
      children.push(read)
    }
    node.children = children
  }
  return node
}

/**
 * Plain text from anywhere, read as an outline: Markdown bullets (- or *),
 * numbered lists, or simply one idea per line, nested by indentation. A
 * leading "# Heading" becomes the parent of the list below it.
 */
export function textToPayload(text: string): ClipboardPayload | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const normalized = lines.map((line) => line.replace(/^(\s*)\d+[.)]\s+/, '$1- '))
  const hasBullets = normalized.some((line) => /^\s*[-*]\s+\S/.test(line))
  const outline = hasBullets
    ? normalized
    : normalized.map((line) =>
        /^\s*#\s/.test(line) || !line.trim() ? line : line.replace(/^(\s*)/, '$1- '),
      )
  const heading = outline.some((line) => /^#\s+\S/.test(line))
  const root = parseMarkdown(outline.join('\n'))
  const nodes = heading ? [root] : (root.children ?? [])
  if (nodes.length === 0 || nodes.length > MAX_CHILDREN) return null
  // An outline deeper than a map may be is still read (without recursion), so
  // the paste can say why it is refused (`pasteTooDeep`, #192).
  return { kind: CLIPBOARD_KIND, version: 1, nodes: nodes.map(clampTree), links: [] }
}

/** Titles and notes cut to their limits, walking the tree without recursion. */
function clampTree(root: TreeNode): TreeNode {
  const clampOne = (node: TreeNode): TreeNode => ({
    ...node,
    title: clampTitle(node.title),
    ...(node.notes ? { notes: clampNotes(node.notes) } : {}),
  })
  const top = clampOne(root)
  const stack: TreeNode[] = [top]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (!node.children) continue
    node.children = node.children.map(clampOne)
    stack.push(...node.children)
  }
  return top
}

/** The levels a payload's deepest node is below where it is pasted (#192). */
export function payloadDepth(nodes: readonly TreeNode[]): number {
  return nodes.reduce((deepest, node) => Math.max(deepest, treeDepth(node)), 0)
}

/**
 * Whether pasting would nest the tree deeper than MAX_TREE_DEPTH, which
 * backups, sync and import refuse (#192). A missing target is not too deep.
 */
export function pasteTooDeep(
  tree: TreeNode,
  targetId: string,
  payload: ClipboardPayload,
  mode: PasteMode,
): boolean {
  const path = pathTo(tree, targetId)
  if (!path) return false
  const asChild = mode === 'child' || path.length === 1
  const parentDepth = asChild ? path.length : path.length - 1
  return parentDepth + payloadDepth(payload.nodes) > MAX_TREE_DEPTH
}

export type PasteMode = 'child' | 'sibling'

export interface PasteResult {
  tree: TreeNode
  /** Ids of the pasted top-level nodes. */
  pasted: string[]
  links: NodeLink[]
}

/**
 * Insert the payload (with fresh ids) under `targetId`, or after it among its
 * siblings. Pasting beside the root goes under the root. Returns null when the
 * target is gone, its parent would exceed the children limit or the tree would
 * be nested too deep (#192).
 */
export function pasteInto(
  tree: TreeNode,
  targetId: string,
  payload: ClipboardPayload,
  mode: PasteMode,
): PasteResult | null {
  const located = findNode(tree, targetId)
  if (!located || pasteTooDeep(tree, targetId, payload, mode)) return null
  const fresh = withFreshIds(payload)
  const asChild = mode === 'child' || !located.parent
  const parentId = asChild ? targetId : located.parent!.id
  const parent = asChild ? located.node : located.parent!
  const existing = parent.children ?? []
  if (existing.length + fresh.nodes.length > MAX_CHILDREN) return null
  const at = asChild ? existing.length : located.index + 1
  const insert = (node: TreeNode): TreeNode => {
    if (node.id === parentId) {
      const children = [...existing]
      children.splice(at, 0, ...fresh.nodes)
      return { ...node, collapsed: false, children }
    }
    if (!node.children) return node
    let changed = false
    const children = node.children.map((child) => {
      const next = insert(child)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }
  return {
    tree: insert(tree),
    pasted: fresh.nodes.map((node) => node.id),
    links: fresh.links,
  }
}

/** How many nodes a payload holds, for announcements. */
export function payloadSize(payload: ClipboardPayload): number {
  let count = 0
  const walk = (node: TreeNode) => {
    count += 1
    node.children?.forEach(walk)
  }
  payload.nodes.forEach(walk)
  return count
}
