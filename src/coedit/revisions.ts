import type { TreeNode } from '../schema/types'
import type { NodeFieldRevs, RevisionTrackerState } from './types'

interface IndexedNode {
  node: TreeNode
  parentId: string | null
}

/**
 * Index every node in `root` iteratively alongside its `parentId` so deep
 * trees cannot overflow the call stack.
 */
function indexTree(root: TreeNode): Map<string, IndexedNode> {
  const map = new Map<string, IndexedNode>()
  const stack: IndexedNode[] = [{ node: root, parentId: null }]
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) continue
    map.set(entry.node.id, entry)
    const children = entry.node.children
    if (children) {
      for (const child of children) {
        stack.push({ node: child, parentId: entry.node.id })
      }
    }
  }
  return map
}

/** Create initial revision tracking state (`rev = 1`) for `initialTree`. */
export function createRevisionTracker(
  projectId: string,
  initialTree: TreeNode,
  initialRev = 1,
): RevisionTrackerState {
  const fields: Record<string, NodeFieldRevs> = {}
  for (const id of indexTree(initialTree).keys()) {
    fields[id] = { title: initialRev, notes: initialRev, parent: initialRev }
  }
  return {
    projectId,
    rev: initialRev,
    fields,
    deletedAtRev: {},
  }
}

/**
 * Advance the revision tracker across a tree change from `before` to `after`,
 * bumping per-field revision numbers on added, edited, moved, or deleted nodes.
 */
export function recordTreeTransition(
  state: RevisionTrackerState,
  before: TreeNode,
  after: TreeNode,
): RevisionTrackerState {
  if (before === after) return state

  const beforeMap = indexTree(before)
  const afterMap = indexTree(after)
  const nextRev = state.rev + 1
  const fields: Record<string, NodeFieldRevs> = { ...state.fields }
  const deletedAtRev: Record<string, number> = { ...state.deletedAtRev }

  for (const [id, afterInfo] of afterMap) {
    const prev = beforeMap.get(id)
    if (!prev) {
      fields[id] = { title: nextRev, notes: nextRev, parent: nextRev }
      delete deletedAtRev[id]
      continue
    }

    const existing = fields[id]
    const nextField: NodeFieldRevs = existing ? { ...existing } : { title: 1, notes: 1, parent: 1 }
    if (afterInfo.node.title !== prev.node.title) nextField.title = nextRev
    if ((afterInfo.node.notes ?? '') !== (prev.node.notes ?? '')) nextField.notes = nextRev
    if (afterInfo.parentId !== prev.parentId) nextField.parent = nextRev
    fields[id] = nextField
  }

  for (const id of beforeMap.keys()) {
    if (!afterMap.has(id)) {
      deletedAtRev[id] = nextRev
    }
  }

  return {
    ...state,
    rev: nextRev,
    fields,
    deletedAtRev,
  }
}
