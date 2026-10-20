import type { Edge, Node } from '@xyflow/react'
import type { MapNodeData } from './layout'

/** The laid-out map as the arrow keys see it. */
export interface NavIndex {
  nodeById: Map<string, Node<MapNodeData>>
  /** Visible children in tree order (folded branches have none). */
  childrenOf: Map<string, string[]>
  parentOf: Map<string, string>
}

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export function isArrowKey(key: string): key is ArrowKey {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
}

export function buildNav(nodes: Node<MapNodeData>[], edges: Edge[]): NavIndex {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string, string[]>()
  const parentOf = new Map<string, string>()
  for (const edge of edges) {
    if (edge.type !== 'mapEdge') continue // cross-links are not part of the tree
    const list = childrenOf.get(edge.source) ?? []
    list.push(edge.target)
    childrenOf.set(edge.source, list)
    parentOf.set(edge.target, edge.source)
  }
  return { nodeById, childrenOf, parentOf }
}

function centre(node: Node<MapNodeData>): { x: number; y: number } {
  return {
    x: node.position.x + (node.width ?? 0) / 2,
    y: node.position.y + (node.height ?? 0) / 2,
  }
}

/**
 * Where an arrow key takes the selection on the map (#133). Navigation follows
 * what is on screen:
 * - from the central topic, → goes to the first right-hand branch and ← to the
 *   first left-hand one;
 * - on a right-hand node → goes to its first child and ← to its parent; on a
 *   left-hand node it is mirrored;
 * - ↑/↓ move between the siblings on the same side, in screen order; past the
 *   first or last sibling they go to the nearest node above or below on that
 *   side of the map.
 * Returns null when there is nowhere to go.
 */
export function arrowTarget(nav: NavIndex, id: string, key: ArrowKey): string | null {
  const node = nav.nodeById.get(id)
  if (!node) return null
  const isRoot = node.data.isRoot || !nav.parentOf.has(id)
  const children = nav.childrenOf.get(id) ?? []

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (isRoot) {
      const side = key === 'ArrowRight' ? 'right' : 'left'
      return children.find((child) => nav.nodeById.get(child)?.data.side === side) ?? null
    }
    const towardChildren = (key === 'ArrowRight') === (node.data.side === 'right')
    if (towardChildren) return children[0] ?? null
    return nav.parentOf.get(id) ?? null
  }

  if (isRoot) return null
  const down = key === 'ArrowDown'
  const side = node.data.side
  const parent = nav.parentOf.get(id)!
  const byScreen = (a: string, b: string) =>
    centre(nav.nodeById.get(a)!).y - centre(nav.nodeById.get(b)!).y
  const siblings = (nav.childrenOf.get(parent) ?? [])
    .filter((sibling) => nav.nodeById.get(sibling)?.data.side === side)
    .sort(byScreen)
  const index = siblings.indexOf(id)
  const next = siblings[down ? index + 1 : index - 1]
  if (next) return next

  // Past the end of the list: the nearest node above or below on this side.
  const from = centre(node)
  let best: string | null = null
  let bestScore = Infinity
  for (const [candidateId, candidate] of nav.nodeById) {
    if (candidateId === id || candidate.data.isRoot || candidate.data.side !== side) continue
    const at = centre(candidate)
    const dy = down ? at.y - from.y : from.y - at.y
    if (dy <= 1) continue
    const score = dy + Math.abs(at.x - from.x) / 2
    if (score < bestScore) {
      bestScore = score
      best = candidateId
    }
  }
  return best
}
