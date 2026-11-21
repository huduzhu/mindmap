import { MAX_ID_LENGTH } from '../io/sanitize'
import type { TreeNode } from '../schema/types'
import {
  addChild,
  clampNotes,
  clampTitle,
  findNode,
  makeNode,
  MAX_CHILDREN,
  moveNode,
  newId,
  removeNode,
  renameNode,
  setNotes,
} from '../store/treeOps'
import type {
  CoeditBatch,
  CoeditConflict,
  CoeditInverseOp,
  CoeditOpError,
  CoeditResolution,
  EvaluateBatchResult,
  RevisionTrackerState,
  SelectiveUndoResult,
} from './types'

/**
 * Evaluate a proposed batch of agent edits against the current `tree` and
 * session `tracker`. Disjoint edits rebase cleanly; same-field edits or
 * deleted targets since `batch.baseRev` are surfaced as conflicts unless
 * overridden by `resolutions`.
 */
export function evaluateCoeditBatch(
  tree: TreeNode,
  tracker: RevisionTrackerState,
  batch: CoeditBatch,
  resolutions?: Record<number, CoeditResolution>,
): EvaluateBatchResult {
  let workingTree = tree
  const addedInBatch = new Set<string>()
  const affected = new Set<string>()
  const forwardInverseOps: CoeditInverseOp[] = []
  const conflicts: CoeditConflict[] = []
  const errors: CoeditOpError[] = []

  for (let opIndex = 0; opIndex < batch.operations.length; opIndex++) {
    const op = batch.operations[opIndex]
    if (!op) continue

    const resolution = resolutions?.[opIndex]
    if (resolution === 'keep_human') continue

    switch (op.type) {
      case 'add_node': {
        if (!op.title.trim()) {
          errors.push({ opIndex, op, reason: 'empty_title' })
          break
        }
        if (op.id !== undefined) {
          if (!op.id.trim() || op.id.length > MAX_ID_LENGTH) {
            errors.push({ opIndex, op, reason: 'invalid_id' })
            break
          }
          if (findNode(workingTree, op.id) !== null) {
            errors.push({ opIndex, op, reason: 'duplicate_id' })
            break
          }
        }

        const parent = findNode(workingTree, op.parentId)
        if (!parent) {
          const deletedRev = tracker.deletedAtRev[op.parentId]
          if (deletedRev !== undefined && deletedRev > batch.baseRev) {
            conflicts.push({
              opIndex,
              op,
              nodeId: op.parentId,
              field: 'existence',
              reason: 'parent_deleted',
              currentValue: null,
              proposedValue: op.title,
              changedAtRev: deletedRev,
            })
          } else {
            errors.push({ opIndex, op, reason: 'parent_not_found' })
          }
          break
        }

        if ((parent.node.children?.length ?? 0) >= MAX_CHILDREN) {
          errors.push({ opIndex, op, reason: 'child_limit' })
          break
        }

        const id = op.id ?? newId()
        const title = clampTitle(op.title)
        const extra: Partial<TreeNode> = { id }
        if (op.notes !== undefined && op.notes.length > 0) {
          const clamped = clampNotes(op.notes)
          if (clamped) extra.notes = clamped
        }
        const node = makeNode(title, extra)

        workingTree = addChild(workingTree, op.parentId, node)
        if (op.index !== undefined) {
          workingTree = moveNode(workingTree, id, op.parentId, op.index)
        }
        addedInBatch.add(id)
        affected.add(id)
        forwardInverseOps.push({ type: 'remove_added_node', id })
        break
      }

      case 'rename_node': {
        if (!op.title.trim()) {
          errors.push({ opIndex, op, reason: 'empty_title' })
          break
        }

        const located = findNode(workingTree, op.id)
        if (!located) {
          const deletedRev = tracker.deletedAtRev[op.id]
          if (deletedRev !== undefined && deletedRev > batch.baseRev) {
            conflicts.push({
              opIndex,
              op,
              nodeId: op.id,
              field: 'existence',
              reason: 'node_deleted',
              currentValue: null,
              proposedValue: op.title,
              changedAtRev: deletedRev,
            })
          } else {
            errors.push({ opIndex, op, reason: 'node_not_found' })
          }
          break
        }

        const nextTitle = clampTitle(op.title)
        const titleRev = tracker.fields[op.id]?.title ?? 0
        if (
          !addedInBatch.has(op.id) &&
          resolution !== 'take_agent' &&
          titleRev > batch.baseRev &&
          located.node.title !== nextTitle
        ) {
          conflicts.push({
            opIndex,
            op,
            nodeId: op.id,
            field: 'title',
            reason: 'concurrent_edit',
            currentValue: located.node.title,
            proposedValue: nextTitle,
            changedAtRev: titleRev,
          })
        }

        const previousTitle = located.node.title
        workingTree = renameNode(workingTree, op.id, nextTitle)
        affected.add(op.id)
        if (previousTitle !== nextTitle) {
          forwardInverseOps.push({
            type: 'restore_title',
            id: op.id,
            previousTitle,
            appliedTitle: nextTitle,
          })
        }
        break
      }

      case 'update_notes': {
        const located = findNode(workingTree, op.id)
        if (!located) {
          const deletedRev = tracker.deletedAtRev[op.id]
          if (deletedRev !== undefined && deletedRev > batch.baseRev) {
            conflicts.push({
              opIndex,
              op,
              nodeId: op.id,
              field: 'existence',
              reason: 'node_deleted',
              currentValue: null,
              proposedValue: op.notes,
              changedAtRev: deletedRev,
            })
          } else {
            errors.push({ opIndex, op, reason: 'node_not_found' })
          }
          break
        }

        const nextNotes = clampNotes(op.notes)
        const currentNotes = located.node.notes ?? ''
        const notesRev = tracker.fields[op.id]?.notes ?? 0
        if (
          !addedInBatch.has(op.id) &&
          resolution !== 'take_agent' &&
          notesRev > batch.baseRev &&
          currentNotes !== nextNotes
        ) {
          conflicts.push({
            opIndex,
            op,
            nodeId: op.id,
            field: 'notes',
            reason: 'concurrent_edit',
            currentValue: currentNotes,
            proposedValue: nextNotes,
            changedAtRev: notesRev,
          })
        }

        workingTree = setNotes(workingTree, op.id, nextNotes)
        affected.add(op.id)
        if (currentNotes !== nextNotes) {
          forwardInverseOps.push({
            type: 'restore_notes',
            id: op.id,
            previousNotes: currentNotes,
            appliedNotes: nextNotes,
          })
        }
        break
      }

      case 'move_node': {
        if (op.id === workingTree.id) {
          errors.push({ opIndex, op, reason: 'cannot_move_root' })
          break
        }

        const located = findNode(workingTree, op.id)
        if (!located) {
          const deletedRev = tracker.deletedAtRev[op.id]
          if (deletedRev !== undefined && deletedRev > batch.baseRev) {
            conflicts.push({
              opIndex,
              op,
              nodeId: op.id,
              field: 'existence',
              reason: 'node_deleted',
              currentValue: null,
              proposedValue: op.newParentId,
              changedAtRev: deletedRev,
            })
          } else {
            errors.push({ opIndex, op, reason: 'node_not_found' })
          }
          break
        }

        if (!located.parent) {
          errors.push({ opIndex, op, reason: 'cannot_move_root' })
          break
        }

        const newParent = findNode(workingTree, op.newParentId)
        if (!newParent) {
          const deletedRev = tracker.deletedAtRev[op.newParentId]
          if (deletedRev !== undefined && deletedRev > batch.baseRev) {
            conflicts.push({
              opIndex,
              op,
              nodeId: op.newParentId,
              field: 'existence',
              reason: 'parent_deleted',
              currentValue: null,
              proposedValue: op.newParentId,
              changedAtRev: deletedRev,
            })
          } else {
            errors.push({ opIndex, op, reason: 'parent_not_found' })
          }
          break
        }

        if (op.id === op.newParentId || findNode(located.node, op.newParentId) !== null) {
          errors.push({ opIndex, op, reason: 'cycle' })
          break
        }

        if (
          located.parent.id !== op.newParentId &&
          (newParent.node.children?.length ?? 0) >= MAX_CHILDREN
        ) {
          errors.push({ opIndex, op, reason: 'child_limit' })
          break
        }

        const parentRev = tracker.fields[op.id]?.parent ?? 0
        if (
          !addedInBatch.has(op.id) &&
          resolution !== 'take_agent' &&
          parentRev > batch.baseRev &&
          located.parent.id !== op.newParentId
        ) {
          conflicts.push({
            opIndex,
            op,
            nodeId: op.id,
            field: 'parent',
            reason: 'concurrent_edit',
            currentValue: located.parent.id,
            proposedValue: op.newParentId,
            changedAtRev: parentRev,
          })
        }

        const previousParentId = located.parent.id
        const previousIndex = located.index
        const nextTree = moveNode(workingTree, op.id, op.newParentId, op.index)
        if (nextTree !== workingTree) {
          workingTree = nextTree
          forwardInverseOps.push({
            type: 'restore_parent',
            id: op.id,
            previousParentId,
            previousIndex,
            appliedParentId: op.newParentId,
          })
        }
        affected.add(op.id)
        break
      }
    }
  }

  const ok = conflicts.length === 0 && errors.length === 0
  return {
    ok,
    conflicts,
    errors,
    nextTree: ok ? workingTree : tree,
    affectedNodeIds: [...affected],
    inverseOps: ok ? [...forwardInverseOps].reverse() : [],
  }
}

/**
 * Selectively undo a previously applied agent batch using its `inverseOps`
 * without disturbing unrelated human edits made afterward. If a human edited
 * the exact field touched by an inverse op (or added children under an
 * agent-added node), returns conflicts unless `force` is true.
 */
export function applySelectiveUndo(
  tree: TreeNode,
  inverseOps: readonly CoeditInverseOp[],
  force = false,
): SelectiveUndoResult {
  let workingTree = tree
  const conflicts: CoeditConflict[] = []

  for (let opIndex = 0; opIndex < inverseOps.length; opIndex++) {
    const op = inverseOps[opIndex]
    if (!op) continue

    switch (op.type) {
      case 'remove_added_node': {
        if (op.id === workingTree.id) break
        const located = findNode(workingTree, op.id)
        if (!located) break
        const childCount = located.node.children?.length ?? 0
        if (!force && childCount > 0) {
          conflicts.push({
            opIndex,
            op,
            nodeId: op.id,
            field: 'existence',
            reason: 'has_children',
            currentValue: String(childCount),
            proposedValue: null,
          })
          break
        }
        workingTree = removeNode(workingTree, op.id)
        break
      }

      case 'restore_title': {
        const located = findNode(workingTree, op.id)
        if (!located) break
        if (!force && located.node.title !== op.appliedTitle) {
          conflicts.push({
            opIndex,
            op,
            nodeId: op.id,
            field: 'title',
            reason: 'concurrent_edit',
            currentValue: located.node.title,
            proposedValue: op.previousTitle,
          })
          break
        }
        workingTree = renameNode(workingTree, op.id, op.previousTitle)
        break
      }

      case 'restore_notes': {
        const located = findNode(workingTree, op.id)
        if (!located) break
        const currentNotes = located.node.notes ?? ''
        if (!force && currentNotes !== op.appliedNotes) {
          conflicts.push({
            opIndex,
            op,
            nodeId: op.id,
            field: 'notes',
            reason: 'concurrent_edit',
            currentValue: currentNotes,
            proposedValue: op.previousNotes,
          })
          break
        }
        workingTree = setNotes(workingTree, op.id, op.previousNotes)
        break
      }

      case 'restore_parent': {
        const located = findNode(workingTree, op.id)
        const prevParent = findNode(workingTree, op.previousParentId)
        if (!located || !prevParent) {
          if (!force) {
            conflicts.push({
              opIndex,
              op,
              nodeId: !located ? op.id : op.previousParentId,
              field: 'parent',
              reason: !located ? 'node_deleted' : 'parent_deleted',
              currentValue: located?.parent?.id ?? null,
              proposedValue: op.previousParentId,
            })
          }
          break
        }
        if (!force && located.parent?.id !== op.appliedParentId) {
          conflicts.push({
            opIndex,
            op,
            nodeId: op.id,
            field: 'parent',
            reason: 'concurrent_edit',
            currentValue: located.parent?.id ?? null,
            proposedValue: op.previousParentId,
          })
          break
        }
        workingTree = moveNode(workingTree, op.id, op.previousParentId, op.previousIndex)
        break
      }
    }
  }

  const ok = conflicts.length === 0
  return {
    ok,
    nextTree: ok ? workingTree : tree,
    conflicts,
  }
}
