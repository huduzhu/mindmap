import { nanoid } from 'nanoid'
import { MAX_NOTES_LENGTH, type Role } from '../schema/constants'
import type { TreeNode } from '../schema/types'
import { withTags } from '../map/tags'

export const newId = () => nanoid(10)

export function makeNode(title: string, extra: Partial<TreeNode> = {}): TreeNode {
  return { id: newId(), title, children: [], ...extra }
}

export interface LocatedNode {
  node: TreeNode
  parent: TreeNode | null
  index: number
}

export function findNode(root: TreeNode, id: string): LocatedNode | null {
  const walk = (node: TreeNode, parent: TreeNode | null, index: number): LocatedNode | null => {
    if (node.id === id) return { node, parent, index }
    for (let i = 0; i < (node.children?.length ?? 0); i++) {
      const found = walk(node.children![i], node, i)
      if (found) return found
    }
    return null
  }
  return walk(root, null, 0)
}

function mapTree(root: TreeNode, id: string, fn: (node: TreeNode) => TreeNode): TreeNode {
  if (root.id === id) return fn(root)
  if (!root.children?.length) return root
  let changed = false
  const children = root.children.map((child) => {
    const next = mapTree(child, id, fn)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...root, children } : root
}

export function renameNode(
  root: TreeNode,
  id: string,
  title: string,
  addTags: readonly string[] = [],
): TreeNode {
  // The same title keeps the node, so committing unchanged text (for example
  // Enter after Tab already saved it, #132) adds no empty undo step.
  // Typed or pasted titles are cut to the schema's limit (#155), so the
  // project never becomes a file other copies of the app refuse.
  title = clampTitle(title)
  return mapTree(root, id, (n) => {
    const tags = addTags.length > 0 ? withTags(n.tags, addTags) : n.tags
    if (n.title === title && tags === n.tags) return n
    return tags && tags.length > 0 ? { ...n, title, tags } : { ...n, title }
  })
}

/** Longest node title, as in schemas/tree-node.schema.json. */
export const MAX_NODE_TITLE_LENGTH = 500

/** A title cut to the schema's maximum, without leaving half of a surrogate pair. */
export function clampTitle(title: string): string {
  if (title.length <= MAX_NODE_TITLE_LENGTH) return title
  const cut = title.slice(0, MAX_NODE_TITLE_LENGTH)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/**
 * Notes cut to the schema's maximum, without leaving half of a surrogate pair,
 * so typed or pasted notes can never make the project fail validation.
 */
export function clampNotes(notes: string): string {
  if (notes.length <= MAX_NOTES_LENGTH) return notes
  const cut = notes.slice(0, MAX_NOTES_LENGTH)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

export function setNotes(root: TreeNode, id: string, text: string): TreeNode {
  const notes = clampNotes(text)
  // Identical text returns the same node, so applyTree's identity bail-out skips
  // the no-op instead of pushing an empty undo entry (#45).
  return mapTree(root, id, (n) => {
    if ((n.notes ?? '') === notes) return n
    return notes ? { ...n, notes } : { ...n, notes: undefined }
  })
}

export function setRole(root: TreeNode, id: string, role: Role | undefined): TreeNode {
  return mapTree(root, id, (n) => (role ? { ...n, role } : { ...n, role: undefined }))
}

/**
 * Ctrl+Enter / the checkbox on a task (#148a): a task flips between done and
 * not done (`done` is written as true or left out); any other node becomes a
 * task that is not done yet. One undo step either way.
 */
export function toggleDone(root: TreeNode, id: string): TreeNode {
  return mapTree(root, id, (n) => {
    if (n.role !== 'task') {
      const { done: _done, ...rest } = n
      return { ...rest, role: 'task' }
    }
    if (n.done) {
      const { done: _done, ...rest } = n
      return rest
    }
    return { ...n, done: true }
  })
}

/**
 * Set or clear (undefined) a node's colour or emoji marker (#148b). The same
 * value returns the same tree, so it adds no empty undo step.
 */
export function setMark(
  root: TreeNode,
  id: string,
  field: 'color' | 'icon',
  value: number | string | undefined,
): TreeNode {
  return mapTree(root, id, (n) => {
    if (n[field] === value) return n
    if (value === undefined) {
      const { [field]: _old, ...rest } = n
      return rest
    }
    return { ...n, [field]: value }
  })
}

export function setSide(root: TreeNode, id: string, side: TreeNode['side']): TreeNode {
  return mapTree(root, id, (n) => ({ ...n, side }))
}

export function toggleCollapse(root: TreeNode, id: string): TreeNode {
  return mapTree(root, id, (n) => ({ ...n, collapsed: !n.collapsed }))
}

/** Expand every collapsed ancestor so `id` is visible. The target itself is left as-is. */
export function expandTo(root: TreeNode, id: string): TreeNode {
  const walk = (node: TreeNode): { next: TreeNode; found: boolean } => {
    if (node.id === id) return { next: node, found: true }
    if (!node.children?.length) return { next: node, found: false }
    let found = false
    let childChanged = false
    const children = node.children.map((child) => {
      const result = walk(child)
      if (result.found) found = true
      if (result.next !== child) childChanged = true
      return result.next
    })
    if (!found) return { next: node, found: false }
    const uncollapse = !!node.collapsed
    if (!childChanged && !uncollapse) return { next: node, found: true }
    return {
      next: {
        ...node,
        children: childChanged ? children : node.children,
        collapsed: uncollapse ? false : node.collapsed,
      },
      found: true,
    }
  }
  return walk(root).next
}

export function addChild(root: TreeNode, parentId: string, child?: TreeNode): TreeNode {
  const node = child ?? makeNode('New idea')
  return mapTree(root, parentId, (n) => ({
    ...n,
    collapsed: false,
    children: [...(n.children ?? []), node],
  }))
}

export function addSibling(root: TreeNode, id: string, sibling?: TreeNode): TreeNode {
  const located = findNode(root, id)
  if (!located || !located.parent) return root
  const node = sibling ?? makeNode('New idea')
  const parentId = located.parent.id
  return mapTree(root, parentId, (n) => {
    const children = [...(n.children ?? [])]
    children.splice(located.index + 1, 0, node)
    return { ...n, children }
  })
}

export function removeNode(root: TreeNode, id: string): TreeNode {
  if (root.id === id) return root
  const located = findNode(root, id)
  if (!located?.parent) return root
  const parentId = located.parent.id
  return mapTree(root, parentId, (n) => ({
    ...n,
    children: (n.children ?? []).filter((c) => c.id !== id),
  }))
}

/** Remove several nodes as one immutable tree operation. Descendants of a removed
 * node are removed with it, and the root is never eligible for removal. */
export function removeNodes(root: TreeNode, ids: Iterable<string>): TreeNode {
  const remove = new Set(ids)
  remove.delete(root.id)
  if (remove.size === 0) return root

  // `changed` is per call: a shared flag cloned every node visited after the
  // first removal, destroying structural sharing (#64).
  const visit = (node: TreeNode): TreeNode => {
    if (!node.children?.length) return node
    let changed = false
    const children: TreeNode[] = []
    for (const child of node.children) {
      if (remove.has(child.id)) {
        changed = true
        continue
      }
      const next = visit(child)
      if (next !== child) changed = true
      children.push(next)
    }
    return changed ? { ...node, children } : node
  }

  return visit(root)
}

function isDescendant(root: TreeNode, ancestorId: string, id: string): boolean {
  const ancestor = findNode(root, ancestorId)?.node
  if (!ancestor) return false
  return findNode(ancestor, id) !== null && ancestorId !== id
}

export function moveNode(
  root: TreeNode,
  id: string,
  newParentId: string,
  index?: number,
): TreeNode {
  if (id === newParentId || id === root.id) return root
  if (isDescendant(root, id, newParentId)) return root
  const located = findNode(root, id)
  const newParent = findNode(root, newParentId)
  if (!located || !newParent) return root
  const remainingChildren = (newParent.node.children ?? []).filter((child) => child.id !== id)
  const at =
    index === undefined
      ? remainingChildren.length
      : Math.max(0, Math.min(index, remainingChildren.length))
  if (located.parent?.id === newParentId && located.index === at) return root
  const without = removeNode(root, id)
  return mapTree(without, newParentId, (n) => {
    const children = [...(n.children ?? [])]
    const at = index === undefined ? children.length : Math.max(0, Math.min(index, children.length))
    children.splice(at, 0, located.node)
    return { ...n, collapsed: false, children }
  })
}

export function countNodes(root: TreeNode): number {
  return 1 + (root.children ?? []).reduce((sum, c) => sum + countNodes(c), 0)
}

export function indentNode(root: TreeNode, id: string): TreeNode {
  if (root.id === id) return root
  const located = findNode(root, id)
  if (!located?.parent || located.index === 0) return root
  const newParent = located.parent.children![located.index - 1]
  return moveNode(root, id, newParent.id)
}

export function outdentNode(root: TreeNode, id: string): TreeNode {
  if (root.id === id) return root
  const located = findNode(root, id)
  const grandparent = located?.parent ? findNode(root, located.parent.id)?.parent : null
  if (!located?.parent || !grandparent) return root
  const parentIndex = (grandparent.children ?? []).findIndex((c) => c.id === located.parent!.id)
  return moveNode(root, id, grandparent.id, parentIndex + 1)
}

/**
 * Move a node up (-1) or down (+1) among its siblings (#95). Unchanged at
 * either end, and for the root.
 */
export function moveAmongSiblings(root: TreeNode, id: string, delta: -1 | 1): TreeNode {
  const located = findNode(root, id)
  if (!located?.parent) return root
  const target = located.index + delta
  const siblings = located.parent.children ?? []
  if (target < 0 || target >= siblings.length) return root
  return moveNode(root, id, located.parent.id, target)
}

/** Replace the node `id` (and its subtree) with `next` (#146: a branch coming back from an AI). */
export function replaceNode(root: TreeNode, id: string, next: TreeNode): TreeNode {
  return mapTree(root, id, () => next)
}

/**
 * Re-fold the subtree at `fromId` (#145): `fold(depth)` says whether a node
 * `depth` levels below it is folded. Only nodes with children keep a
 * `collapsed` flag, and nodes whose folding does not change keep their
 * objects, so an expand-all on an expanded map returns the same tree (no undo
 * step) and the layout keeps every untouched node.
 */
function refold(root: TreeNode, fromId: string, fold: (depth: number) => boolean): TreeNode {
  const visit = (node: TreeNode, depth: number): TreeNode => {
    const kids = node.children
    let children = kids
    if (kids?.length) {
      let changed = false
      const next = kids.map((child) => {
        const result = visit(child, depth + 1)
        if (result !== child) changed = true
        return result
      })
      if (changed) children = next
    }
    const folded = (kids?.length ?? 0) > 0 && fold(depth)
    const flagOk = folded ? node.collapsed === true : !node.collapsed
    if (flagOk && children === kids) return node
    const copy: TreeNode = { ...node }
    if (children !== kids) copy.children = children
    if (folded) copy.collapsed = true
    else delete copy.collapsed
    return copy
  }
  return mapTree(root, fromId, (node) => visit(node, 0))
}

/** Unfold every branch under (and including) `fromId`, the root by default (#145). */
export function expandAll(root: TreeNode, fromId: string = root.id): TreeNode {
  return refold(root, fromId, () => false)
}

/** Fold every branch under `fromId` except `fromId` itself, so only its children show (#145). */
export function collapseAll(root: TreeNode, fromId: string = root.id): TreeNode {
  return refold(root, fromId, (depth) => depth >= 1)
}

/** Show `levels` levels below `fromId` and fold everything deeper (#145). */
export function showLevels(root: TreeNode, levels: number, fromId: string = root.id): TreeNode {
  return refold(root, fromId, (depth) => depth >= levels)
}

/** Fold `id` and every branch inside it, so unfolding it again shows one level (#145). */
export function collapseBranch(root: TreeNode, id: string): TreeNode {
  return refold(root, id, () => true)
}

/** Nodes shown when folded branches hide their descendants (#145). */
export function countVisible(root: TreeNode): number {
  let count = 0
  const stack = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    count += 1
    if (!node.collapsed && node.children) stack.push(...node.children)
  }
  return count
}

/** The nodes from `root` down to `id` (both included), or null when `id` is not in the tree. */
export function pathTo(root: TreeNode, id: string): TreeNode[] | null {
  const path: TreeNode[] = []
  const walk = (node: TreeNode): boolean => {
    path.push(node)
    if (node.id === id) return true
    for (const child of node.children ?? []) if (walk(child)) return true
    path.pop()
    return false
  }
  return walk(root) ? path : null
}

/**
 * Where `id` shows once folding is applied (#145): itself when every ancestor
 * below `root` is unfolded, otherwise the outermost folded ancestor. Null when
 * `id` is not under `root`.
 */
export function visibleAncestor(root: TreeNode, id: string): string | null {
  const path = pathTo(root, id)
  if (!path) return null
  for (let i = 0; i < path.length - 1; i++) if (path[i].collapsed) return path[i].id
  return id
}

/** Whether `node` or any branch inside it is folded (#145). */
export function hasFoldedBranch(node: TreeNode): boolean {
  if (node.collapsed && node.children?.length) return true
  return (node.children ?? []).some(hasFoldedBranch)
}

/** Whether `node` or any branch inside it is unfolded (#145). */
export function hasOpenBranch(node: TreeNode): boolean {
  if (!node.collapsed && node.children?.length) return true
  return (node.children ?? []).some(hasOpenBranch)
}
