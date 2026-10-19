import type { TreeNode } from '../schema/types'

// Applies viewer's per-session collapse overrides to a tree. The visitor pattern mirrors
// `mapTree` in `src/store/treeOps.ts:29-39`: descend, return the same reference when nothing
// changed. `!!override` collapses the `false` vs `undefined` distinction so an explicit
// un-collapse on an already-expanded node is treated as a no-op instead of allocating a new
// subtree with `collapsed: false`.
export function applyCollapsed(node: TreeNode, overrides: Map<string, boolean>): TreeNode {
  const override = overrides.get(node.id)
  const wantCollapsed = override === undefined ? !!node.collapsed : !!override
  const isCollapsedNow = !!node.collapsed
  if (wantCollapsed === isCollapsedNow && (!node.children || node.children.length === 0)) {
    return node
  }
  let changed = false
  const children = node.children?.map((child) => {
    const next = applyCollapsed(child, overrides)
    if (next !== child) changed = true
    return next
  })
  if (!changed && wantCollapsed === isCollapsedNow) return node
  return { ...node, collapsed: wantCollapsed || undefined, children }
}
