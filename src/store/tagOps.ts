import { withTags } from '../map/tags'
import type { TreeNode } from '../schema/types'

/**
 * Tag edits (#150) used by the lazily loaded tag editor. Like the other tree
 * operations they copy only the path to a change and return the same tree
 * when nothing changes, so a no-op adds no undo step.
 */

/** Replace a node's tags (#150); an empty list removes the field. */
export function setTags(root: TreeNode, id: string, tags: readonly string[]): TreeNode {
  return mapNodes(root, (n) => {
    if (n.id !== id) return n
    const same = (n.tags ?? []).length === tags.length && tags.every((t, i) => n.tags![i] === t)
    if (same) return n
    if (tags.length > 0) return { ...n, tags: [...tags] }
    const { tags: _tags, ...rest } = n
    return rest
  })
}

/** Add `tags` to every node in `ids` (#150, "Add tag to selection"). */
export function addTagsTo(
  root: TreeNode,
  ids: ReadonlySet<string>,
  tags: readonly string[],
): TreeNode {
  return mapNodes(root, (node) => {
    if (!ids.has(node.id)) return node
    const merged = withTags(node.tags, tags)
    return merged === node.tags ? node : { ...node, tags: merged }
  })
}

/** Apply `fn` to every node, copying only the paths to the nodes it changes. */
function mapNodes(node: TreeNode, fn: (node: TreeNode) => TreeNode): TreeNode {
  const next = fn(node)
  if (!node.children?.length) return next
  let changed = false
  const children = node.children.map((child) => {
    const updated = mapNodes(child, fn)
    if (updated !== child) changed = true
    return updated
  })
  return changed ? { ...next, children } : next
}
