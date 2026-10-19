import type { Node } from '@xyflow/react'
import type { MapNodeData } from './layout'
import type { TreeNode } from '../schema/types'
import { findNode, moveNode, outdentNode, setSide } from '../store/treeOps'

export interface DropPoint {
  x: number
  y: number
}

export interface DropIntent {
  parentId: string
  index: number
  side?: 'left' | 'right'
}

/** The structural drop operations used by the Brainstorm outliner. */
export type OutlinerDropIntent =
  | { kind: 'reorder'; parentId: string; index: number }
  | { kind: 'reparent'; parentId: string }
  | { kind: 'outdent' }
  | { kind: 'promote' }

export type OutlinerDropZone = 'before' | 'after' | 'child' | 'outdent' | 'promote'

/**
 * Resolve an outliner row/zone into a tree operation. Indices are deliberately
 * calculated after removing the dragged node, which makes same-parent moves
 * behave the same as moves between parents.
 */
export function resolveOutlinerDropIntent(
  root: TreeNode,
  draggedId: string,
  targetId: string | null,
  zone: OutlinerDropZone,
): OutlinerDropIntent | null {
  const source = findNode(root, draggedId)
  if (!source?.parent || draggedId === root.id) return null
  if (zone === 'outdent') return { kind: 'outdent' }
  if (zone === 'promote') return { kind: 'promote' }
  if (!targetId || targetId === root.id || targetId === draggedId) return null

  const target = findNode(root, targetId)
  if (!target?.parent) return null
  if (zone === 'child') return { kind: 'reparent', parentId: targetId }

  const siblings = target.parent.children ?? []
  const remaining = siblings.filter((child) => child.id !== draggedId)
  const targetIndex = remaining.findIndex((child) => child.id === targetId)
  if (targetIndex < 0) return null
  return {
    kind: 'reorder',
    parentId: target.parent.id,
    index: targetIndex + (zone === 'after' ? 1 : 0),
  }
}

/**
 * `viewRootId` is the root the outliner shows (a focused branch, #146):
 * "promote" moves to its top and nothing is outdented out of it.
 */
export function applyOutlinerDropIntent(
  root: TreeNode,
  draggedId: string,
  intent: OutlinerDropIntent,
  viewRootId: string = root.id,
): TreeNode {
  switch (intent.kind) {
    case 'reorder':
      return moveNode(root, draggedId, intent.parentId, intent.index)
    case 'reparent':
      return moveNode(root, draggedId, intent.parentId)
    case 'outdent':
      return findNode(root, draggedId)?.parent?.id === viewRootId
        ? root
        : outdentNode(root, draggedId)
    case 'promote':
      return moveNode(root, draggedId, viewRootId, 0)
  }
}

export function isOutlinerCycleDrop(root: TreeNode, draggedId: string, targetId: string): boolean {
  const dragged = findNode(root, draggedId)?.node
  return Boolean(dragged && draggedId !== targetId && findNode(dragged, targetId))
}

export function applyDropIntent(root: TreeNode, draggedId: string, intent: DropIntent): TreeNode {
  const moved = moveNode(root, draggedId, intent.parentId, intent.index)
  if (!intent.side) return moved

  // A same-index root drop is a valid side change even when moveNode preserves
  // the tree. Invalid moves must remain no-ops, however.
  const located = findNode(root, draggedId)
  const newParent = findNode(root, intent.parentId)
  if (
    !located?.parent ||
    !newParent ||
    intent.parentId === draggedId ||
    findNode(located.node, intent.parentId)
  )
    return moved
  if (moved === root) {
    const remainingChildren = (newParent.node.children ?? []).filter(
      (child) => child.id !== draggedId,
    )
    const at = Math.max(0, Math.min(intent.index, remainingChildren.length))
    if (located.parent.id !== intent.parentId || located.index !== at) return moved
  }
  return setSide(moved, draggedId, intent.side)
}

type LayoutNode = Pick<Node<MapNodeData>, 'id' | 'position' | 'width' | 'height' | 'data'>

function box(node: LayoutNode) {
  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + (node.width ?? 0),
    bottom: node.position.y + (node.height ?? 0),
  }
}

function contains(node: LayoutNode, point: DropPoint): boolean {
  const bounds = box(node)
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  )
}

function centerY(node: LayoutNode): number {
  return node.position.y + (node.height ?? 0) / 2
}

function childIndex(children: TreeNode[], childId: string): number {
  return children.findIndex((child) => child.id === childId)
}

function insertIndex(
  children: TreeNode[],
  visibleChildren: LayoutNode[],
  draggedId: string,
  pointY: number,
): number {
  const remaining = children.filter((child) => child.id !== draggedId)
  let lastVisibleId: string | null = null
  for (const child of remaining) {
    const layout = visibleChildren.find((node) => node.id === child.id)
    if (!layout) continue
    lastVisibleId = child.id
    if (pointY < centerY(layout)) {
      return Math.max(0, childIndex(remaining, child.id))
    }
  }
  if (lastVisibleId) return childIndex(remaining, lastVisibleId) + 1
  return remaining.length
}

function rootInsertIndex(
  children: TreeNode[],
  sideNodes: LayoutNode[],
  draggedId: string,
  side: 'left' | 'right',
  pointY: number,
): number {
  if (sideNodes.length === 0) {
    return side === 'left' ? 0 : children.filter((child) => child.id !== draggedId).length
  }
  return insertIndex(children, sideNodes, draggedId, pointY)
}

function reorderLaneContains(siblings: LayoutNode[], draggedId: string, point: DropPoint): boolean {
  const remaining = siblings.filter((node) => node.id !== draggedId)
  if (remaining.length === 0) return false
  const bounds = remaining.reduce(
    (result, node) => {
      const current = box(node)
      return {
        left: Math.min(result.left, current.left),
        top: Math.min(result.top, current.top),
        right: Math.max(result.right, current.right),
        bottom: Math.max(result.bottom, current.bottom),
      }
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  )
  const padding = 80
  return (
    point.x >= bounds.left - padding &&
    point.x <= bounds.right + padding &&
    point.y >= bounds.top - padding &&
    point.y <= bounds.bottom + padding
  )
}

/** Each node's parent id, from one walk of the tree (#163: not one walk per node). */
function parentIds(root: TreeNode): Map<string, string> {
  const parents = new Map<string, string>()
  const stack = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    for (const child of node.children ?? []) {
      parents.set(child.id, node.id)
      stack.push(child)
    }
  }
  return parents
}

/**
 * Resolve a laid-out drop into tree coordinates. A node under the pointer is a
 * parent drop; a gap in the dragged node's current sibling lane is a reorder.
 * The returned index is calculated against the source-removed child list.
 * `viewRootId` is the node laid out as the centre: the focused branch in focus
 * mode (#161), whose children have two sides like the central topic's.
 */
export function resolveDropIntent(
  root: TreeNode,
  nodes: LayoutNode[],
  draggedId: string,
  point: DropPoint,
  viewRootId: string = root.id,
): DropIntent | null {
  const source = findNode(root, draggedId)
  if (!source?.parent) return null
  const parents = parentIds(root)
  const centre = findNode(root, viewRootId)?.node
  if (!centre) return null

  const dragged = nodes.find((node) => node.id === draggedId)
  if (!dragged) return null

  const target = nodes.find((node) => node.id !== draggedId && contains(node, point))
  if (target) {
    const targetLocated = findNode(root, target.id)
    if (!targetLocated) return null

    if (target.id === centre.id) {
      const side = point.x < box(target).left + (target.width ?? 0) / 2 ? 'left' : 'right'
      const children = centre.children ?? []
      const sideNodes = nodes.filter(
        (node) =>
          node.id !== draggedId && node.data.side === side && parents.get(node.id) === centre.id,
      )
      return {
        parentId: centre.id,
        index: rootInsertIndex(children, sideNodes, draggedId, side, point.y),
        side,
      }
    }

    const children = targetLocated.node.children ?? []
    const childNodes = nodes.filter((node) => parents.get(node.id) === target.id)
    return {
      parentId: target.id,
      index: insertIndex(children, childNodes, draggedId, point.y),
    }
  }

  const sourceParent = source.parent
  const siblingNodes = nodes.filter(
    (node) => node.id !== draggedId && parents.get(node.id) === sourceParent.id,
  )

  if (sourceParent.id === centre.id) {
    const rootNode = nodes.find((node) => node.id === centre.id)
    const side =
      rootNode && point.x < box(rootNode).left + (rootNode.width ?? 0) / 2 ? 'left' : 'right'
    // A main branch carried across the central topic's centre line flips
    // sides wherever it is let go on that side, not only inside the root's
    // box or the other side's lane (live test, item 2).
    const flips = side !== dragged.data.side
    if (!flips && !reorderLaneContains(siblingNodes, draggedId, point)) return null
    const sideNodes = siblingNodes.filter((node) => node.data.side === side)
    return {
      parentId: centre.id,
      index: rootInsertIndex(centre.children ?? [], sideNodes, draggedId, side, point.y),
      side,
    }
  }

  if (!reorderLaneContains(siblingNodes, draggedId, point)) return null
  return {
    parentId: sourceParent.id,
    index: insertIndex(sourceParent.children ?? [], siblingNodes, draggedId, point.y),
  }
}

/** What a drop would do, shown while dragging: the new parent and where the node lands. */
export interface DropPreview {
  intent: DropIntent
  /** The node that becomes the parent; it is highlighted. */
  targetId: string
  /** The insertion line, in flow coordinates. */
  line: { x: number; y: number; width: number }
  /** Set when the node moves to the other side of the central topic. */
  flipTo?: 'left' | 'right'
}

const LINE_GAP = 6
const LINE_WIDTH = 96
const LINE_OFFSET = 28

/**
 * The preview for a drop at `point`, or null when letting go there would
 * change nothing (no target, a move into the node's own branch, or the place
 * it already is), so the map never promises a drop that snaps back.
 */
export function resolveDropPreview(
  root: TreeNode,
  nodes: LayoutNode[],
  draggedId: string,
  point: DropPoint,
  viewRootId: string = root.id,
): DropPreview | null {
  const intent = resolveDropIntent(root, nodes, draggedId, point, viewRootId)
  if (!intent) return null
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const parentLayout = byId.get(intent.parentId)
  const parent = findNode(root, intent.parentId)?.node
  const dragged = byId.get(draggedId)
  if (!parentLayout || !parent) return null
  // moveNode keeps the tree for its own place and for a move into its own branch.
  const flips = Boolean(intent.side && dragged && intent.side !== dragged.data.side)
  if (!flips && moveNode(root, draggedId, intent.parentId, intent.index) === root) return null

  const parentIsRoot = intent.parentId === viewRootId
  const laneSide = intent.side ?? parentLayout.data.side
  const remaining = (parent.children ?? []).filter((child) => child.id !== draggedId)
  const lane = remaining
    .map((child, index) => ({ index, layout: byId.get(child.id) }))
    .filter(
      (entry): entry is { index: number; layout: LayoutNode } =>
        entry.layout !== undefined && (!parentIsRoot || entry.layout.data.side === laneSide),
    )
  const before = lane.filter((entry) => entry.index < intent.index).at(-1)?.layout
  const after = lane.find((entry) => entry.index >= intent.index)?.layout

  let line: DropPreview['line']
  const reference = after ?? before
  if (reference) {
    const left = Math.min(...lane.map((entry) => entry.layout.position.x))
    const right = Math.max(
      ...lane.map((entry) => entry.layout.position.x + (entry.layout.width ?? 0)),
    )
    const y =
      before && after
        ? (box(before).bottom + box(after).top) / 2
        : after
          ? box(after).top - LINE_GAP
          : box(before!).bottom + LINE_GAP
    line = { x: left, y, width: Math.max(LINE_WIDTH / 2, right - left) }
  } else {
    // An empty lane: the line stands where the first child will go.
    const bounds = box(parentLayout)
    const x =
      laneSide === 'left' ? bounds.left - LINE_OFFSET - LINE_WIDTH : bounds.right + LINE_OFFSET
    line = { x, y: centerY(parentLayout), width: LINE_WIDTH }
  }
  return {
    intent,
    targetId: intent.parentId,
    line,
    ...(flips && intent.side ? { flipTo: intent.side } : {}),
  }
}
