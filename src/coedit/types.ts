import type { TreeNode } from '../schema/types'

export type CoeditAuthor = 'human' | 'agent'

export type CoeditMode = 'read-only' | 'approve-writes'

export type CoeditField = 'title' | 'notes' | 'parent'

export interface AddNodeOp {
  type: 'add_node'
  parentId: string
  id?: string | undefined
  title: string
  notes?: string | undefined
  index?: number | undefined
}

export interface RenameNodeOp {
  type: 'rename_node'
  id: string
  title: string
}

export interface MoveNodeOp {
  type: 'move_node'
  id: string
  newParentId: string
  index?: number | undefined
}

export interface UpdateNotesOp {
  type: 'update_notes'
  id: string
  notes: string
}

export type CoeditOp = AddNodeOp | RenameNodeOp | MoveNodeOp | UpdateNotesOp

export interface CoeditBatch {
  id: string
  agentName: string
  baseRev: number
  summary: string
  operations: CoeditOp[]
  createdAt: string
}

export interface NodeFieldRevs {
  title: number
  notes: number
  parent: number
}

export interface RevisionTrackerState {
  projectId: string
  rev: number
  fields: Record<string, NodeFieldRevs>
  deletedAtRev: Record<string, number>
}

export type CoeditInverseOp =
  | { type: 'remove_added_node'; id: string }
  | { type: 'restore_title'; id: string; previousTitle: string; appliedTitle: string }
  | { type: 'restore_notes'; id: string; previousNotes: string; appliedNotes: string }
  | {
      type: 'restore_parent'
      id: string
      previousParentId: string
      previousIndex: number
      appliedParentId: string
    }

export interface CoeditConflict {
  opIndex: number
  op: CoeditOp | CoeditInverseOp
  nodeId: string
  field: CoeditField | 'existence'
  reason: 'concurrent_edit' | 'node_deleted' | 'parent_deleted' | 'has_children'
  currentValue?: string | null | undefined
  proposedValue?: string | null | undefined
  changedAtRev?: number | undefined
}

export interface CoeditOpError {
  opIndex: number
  op: CoeditOp
  reason:
    | 'node_not_found'
    | 'parent_not_found'
    | 'duplicate_id'
    | 'invalid_id'
    | 'empty_title'
    | 'cannot_move_root'
    | 'cycle'
    | 'child_limit'
}

export interface CoeditActivityEntry {
  id: string
  author: CoeditAuthor
  authorLabel: string
  summary: string
  timestamp: string
  rev: number
  affectedNodeIds: string[]
  inverseOps: CoeditInverseOp[]
  undone: boolean
}

export type CoeditResolution = 'take_agent' | 'keep_human'

export interface EvaluateBatchResult {
  ok: boolean
  conflicts: CoeditConflict[]
  errors: CoeditOpError[]
  nextTree: TreeNode
  affectedNodeIds: string[]
  inverseOps: CoeditInverseOp[]
}

export interface SelectiveUndoResult {
  ok: boolean
  nextTree: TreeNode
  conflicts: CoeditConflict[]
}
