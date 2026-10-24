import type { TreeNode } from '../schema/types'

export interface OutlineRow {
  node: TreeNode
  depth: number
  parentId: string | null
  index: number
  /** Descendants hidden by folding this row (#145); 0 when it is unfolded. */
  hidden: number
}

function countDescendants(node: TreeNode): number {
  let count = 0
  const stack = [...(node.children ?? [])]
  while (stack.length > 0) {
    const next = stack.pop()!
    count += 1
    if (next.children) stack.push(...next.children)
  }
  return count
}

/**
 * The rows of an outline, depth first. Folded branches hide their
 * descendants (#145), as on the map, unless `all` asks for every node.
 */
export function flattenTree(root: TreeNode, { all = false }: { all?: boolean } = {}): OutlineRow[] {
  const rows: OutlineRow[] = []
  const walk = (node: TreeNode, depth: number, parentId: string | null, index: number) => {
    const children = node.children ?? []
    const folded = !all && Boolean(node.collapsed) && children.length > 0
    rows.push({ node, depth, parentId, index, hidden: folded ? countDescendants(node) : 0 })
    if (folded) return
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child) walk(child, depth + 1, node.id, i)
    }
  }
  walk(root, 0, null, 0)
  return rows
}
