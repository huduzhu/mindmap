import { create } from 'zustand'
import type { TreeNode } from '../schema/types'
import { useEditor } from '../store/editor'
import { flushPendingEdits } from '../store/pendingEdits'
import { useProjects } from '../store/projects'
import { applySelectiveUndo, evaluateCoeditBatch } from './patch'
import { createRevisionTracker, recordTreeTransition } from './revisions'
import type {
  CoeditActivityEntry,
  CoeditBatch,
  CoeditMode,
  CoeditResolution,
  EvaluateBatchResult,
  RevisionTrackerState,
  SelectiveUndoResult,
} from './types'

export type EnqueueBatchResult =
  | { accepted: true }
  | { accepted: false; reason: 'not_connected' | 'wrong_project' | 'read_only' | 'duplicate_batch' }

export interface CoeditSessionState {
  projectId: string | null
  agentName: string | null
  mode: CoeditMode
  tracker: RevisionTrackerState | null
  lastObservedMap: TreeNode | null
  pendingBatches: CoeditBatch[]
  activity: CoeditActivityEntry[]
  startSession: (
    projectId: string,
    agentName: string,
    mode: CoeditMode,
    initialRev?: number,
  ) => boolean
  setMode: (mode: CoeditMode) => void
  disconnect: () => void
  syncFromCurrentTree: () => RevisionTrackerState | null
  enqueueBatch: (batch: CoeditBatch, targetProjectId?: string) => EnqueueBatchResult
  approveBatch: (
    batchId: string,
    resolutions?: Record<number, CoeditResolution>,
  ) => EvaluateBatchResult | null
  rejectBatch: (batchId: string) => boolean
  undoActivityEntry: (entryId: string, force?: boolean) => SelectiveUndoResult | null
}

const DISCONNECTED_STATE = {
  projectId: null,
  agentName: null,
  mode: 'read-only' as CoeditMode,
  tracker: null,
  lastObservedMap: null,
  pendingBatches: [] as CoeditBatch[],
  activity: [] as CoeditActivityEntry[],
}

export const useCoedit = create<CoeditSessionState>()((set, get) => ({
  ...DISCONNECTED_STATE,

  startSession: (projectId, agentName, mode, initialRev) => {
    const { currentId, current } = useProjects.getState()
    if (!projectId || currentId !== projectId || !current) return false
    set({
      projectId,
      agentName,
      mode,
      tracker: createRevisionTracker(projectId, current.map, initialRev),
      lastObservedMap: current.map,
      pendingBatches: [],
      activity: [],
    })
    return true
  },

  setMode: (mode) => {
    if (!get().projectId) return
    set({ mode })
  },

  disconnect: () => {
    set({ ...DISCONNECTED_STATE })
  },

  syncFromCurrentTree: () => {
    const { projectId, tracker, lastObservedMap } = get()
    if (!projectId || !tracker || !lastObservedMap) return null

    const { currentId, current } = useProjects.getState()
    if (currentId !== projectId || !current) {
      get().disconnect()
      return null
    }

    if (current.map !== lastObservedMap) {
      const nextTracker = recordTreeTransition(tracker, lastObservedMap, current.map)
      set({ tracker: nextTracker, lastObservedMap: current.map })
      return nextTracker
    }

    return tracker
  },

  enqueueBatch: (batch, targetProjectId) => {
    const synced = get().syncFromCurrentTree()
    const { projectId, mode, pendingBatches } = get()
    if (!synced || !projectId) {
      return { accepted: false, reason: 'not_connected' }
    }
    if (targetProjectId !== undefined && targetProjectId !== projectId) {
      return { accepted: false, reason: 'wrong_project' }
    }
    if (mode === 'read-only') {
      return { accepted: false, reason: 'read_only' }
    }
    if (pendingBatches.some((existing) => existing.id === batch.id)) {
      return { accepted: false, reason: 'duplicate_batch' }
    }
    set({ pendingBatches: [...pendingBatches, batch] })
    return { accepted: true }
  },

  approveBatch: (batchId, resolutions) => {
    flushPendingEdits()
    const tracker = get().syncFromCurrentTree()
    const { projectId, mode, pendingBatches, activity } = get()
    if (!tracker || !projectId || mode === 'read-only') return null

    const batch = pendingBatches.find((item) => item.id === batchId)
    const project = useProjects.getState().current
    if (!batch || !project || useProjects.getState().currentId !== projectId) return null

    const result = evaluateCoeditBatch(project.map, tracker, batch, resolutions)
    if (!result.ok) return result

    useEditor.getState().applyTree('map', () => result.nextTree)
    const nextTracker = get().syncFromCurrentTree() ?? tracker

    const entry: CoeditActivityEntry = {
      id: batch.id,
      author: 'agent',
      authorLabel: batch.agentName,
      summary: batch.summary,
      timestamp: new Date().toISOString(),
      rev: nextTracker.rev,
      affectedNodeIds: result.affectedNodeIds,
      inverseOps: result.inverseOps,
      undone: false,
    }

    set({
      pendingBatches: get().pendingBatches.filter((item) => item.id !== batchId),
      activity: [...activity, entry],
    })
    return result
  },

  rejectBatch: (batchId) => {
    const before = get().pendingBatches
    const next = before.filter((item) => item.id !== batchId)
    if (next.length === before.length) return false
    set({ pendingBatches: next })
    return true
  },

  undoActivityEntry: (entryId, force = false) => {
    flushPendingEdits()
    const tracker = get().syncFromCurrentTree()
    const { projectId, activity } = get()
    if (!tracker || !projectId) return null

    const entry = activity.find((item) => item.id === entryId && !item.undone)
    const project = useProjects.getState().current
    if (!entry || !project || useProjects.getState().currentId !== projectId) return null

    const result = applySelectiveUndo(project.map, entry.inverseOps, force)
    if (!result.ok) return result

    useEditor.getState().applyTree('map', () => result.nextTree)
    get().syncFromCurrentTree()

    set({
      activity: get().activity.map((item) =>
        item.id === entryId ? { ...item, undone: true } : item,
      ),
    })
    return result
  },
}))
