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

/**
 * Resolve a laid-out drop into tree coordinates. A node under the pointer is a
 * parent drop; a gap in the dragged node's current sibling lane is a reorder.
 * The returned index is calculated against the source-removed child list.
 */
export function resolveDropIntent(
  root: TreeNode,
  nodes: LayoutNode[],
  draggedId: string,
  point: DropPoint,
): DropIntent | null {
  const source = findNode(root, draggedId)
  if (!source?.parent) return null

  const dragged = nodes.find((node) => node.id === draggedId)
  if (!dragged) return null

  const target = nodes.find((node) => node.id !== draggedId && contains(node, point))
  if (target) {
    const targetLocated = findNode(root, target.id)
    if (!targetLocated) return null

    if (target.id === root.id) {
      const side = point.x < box(target).left + (target.width ?? 0) / 2 ? 'left' : 'right'
      const children = root.children ?? []
      const sideNodes = nodes.filter(
        (node) =>
          node.id !== draggedId &&
          node.data.side === side &&
          findNode(root, node.id)?.parent?.id === root.id,
      )
      return {
        parentId: root.id,
        index: rootInsertIndex(children, sideNodes, draggedId, side, point.y),
        side,
      }
    }

    const children = targetLocated.node.children ?? []
    const childNodes = nodes.filter((node) => findNode(root, node.id)?.parent?.id === target.id)
    return {
      parentId: target.id,
      index: insertIndex(children, childNodes, draggedId, point.y),
    }
  }

  const sourceParent = source.parent
  const siblingNodes = nodes.filter(
    (node) => node.id !== draggedId && findNode(root, node.id)?.parent?.id === sourceParent.id,
  )
  if (!reorderLaneContains(siblingNodes, draggedId, point)) return null

  if (sourceParent.id === root.id) {
    const rootNode = nodes.find((node) => node.id === root.id)
    const side =
      rootNode && point.x < box(rootNode).left + (rootNode.width ?? 0) / 2 ? 'left' : 'right'
    const sideNodes = siblingNodes.filter((node) => node.data.side === side)
    return {
      parentId: root.id,
      index: rootInsertIndex(root.children ?? [], sideNodes, draggedId, side, point.y),
      side,
    }
  }

  return {
    parentId: sourceParent.id,
    index: insertIndex(sourceParent.children ?? [], siblingNodes, draggedId, point.y),
  }
}
