import type { TreeNode } from '../schema/types'
import { newId } from '../store/treeOps'

/**
 * Offline "Brainstorm → Map" (#87). Brainstorm bullets become map branches:
 * top-level bullets are main branches, deeper bullets their children. Titles,
 * notes, tasks and markers carry over; ids are fresh so the two trees never share nodes;
 * sides are left to the layout, which alternates them.
 */
export function brainstormToBranches(brainstorm: TreeNode): TreeNode[] {
  const copy = (node: TreeNode, depth: number): TreeNode => {
    const children = (node.children ?? []).map((child) => copy(child, depth + 1))
    return {
      id: newId(),
      title: node.title,
      ...(node.notes ? { notes: node.notes } : {}),
      ...(node.color ? { color: node.color } : {}),
      ...(node.icon ? { icon: node.icon } : {}),
      // Tasks stay tasks, with their done state (#148a).
      ...(node.role === 'task'
        ? { role: 'task' as const, ...(node.done ? { done: true } : {}) }
        : depth === 1
          ? { role: 'main-branch' as const }
          : {}),
      ...(children.length > 0 ? { children } : {}),
    }
  }
  return (brainstorm.children ?? []).map((child) => copy(child, 1))
}

/** How many bullets the brainstorm holds below its root. */
export function countBullets(brainstorm: TreeNode): number {
  let count = 0
  const stack = [...(brainstorm.children ?? [])]
  while (stack.length > 0) {
    const node = stack.pop()!
    count += 1
    if (node.children) stack.push(...node.children)
  }
  return count
}

/** Add the brainstorm's branches after the map root's existing children. */
export function appendBrainstormToMap(map: TreeNode, brainstorm: TreeNode): TreeNode {
  const branches = brainstormToBranches(brainstorm)
  if (branches.length === 0) return map
  return { ...map, children: [...(map.children ?? []), ...branches] }
}

/** Replace the map's branches with the brainstorm's; the root node itself is kept. */
export function replaceMapWithBrainstorm(map: TreeNode, brainstorm: TreeNode): TreeNode {
  const { collapsed: _collapsed, ...root } = map
  return { ...root, children: brainstormToBranches(brainstorm) }
}
