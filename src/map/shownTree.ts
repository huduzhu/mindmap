import type { TreeNode } from '../schema/types'
import { findNode } from '../store/treeOps'
import { tagFilterView, type TagFilter } from './tags'

/** What a view shows: its focused branch (#146), or the whole tree. */
export function viewRootOf(tree: TreeNode, focusId: string | null): TreeNode {
  return (focusId && findNode(tree, focusId)?.node) || tree
}

/**
 * The tree the map lays out under a tag filter (#150): in hide mode only the
 * matches and their path to the root (plus `keepId`, the node being renamed);
 * otherwise `root` itself. The filter maths is registered by the lazily loaded
 * ./tagFilter, which is in place whenever a filter is on.
 */
export function pruneHiddenByTags(
  root: TreeNode,
  filter: TagFilter | null,
  keepId?: string | null,
): TreeNode {
  const view = filter?.hide ? tagFilterView() : null
  return view && filter ? view.prune(root, filter, keepId ? new Set([keepId]) : undefined) : root
}
