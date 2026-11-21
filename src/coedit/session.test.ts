import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { registerPendingEdit } from '../store/pendingEdits'
import { useProjects } from '../store/projects'
import { addChild, makeNode, renameNode, setNotes } from '../store/treeOps'
import { resetDatabase } from '../test/resetDb'
import { useCoedit } from './session'

beforeEach(async () => {
  useCoedit.getState().disconnect()
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
})

describe('useCoedit session store', () => {
  it('binds to a single open project and disconnects on switch or disconnect()', async () => {
    const idA = await useProjects.getState().createProject('Project A')
    const idB = await useProjects.getState().createProject('Project B')
    await useProjects.getState().loadProject(idA)

    expect(useCoedit.getState().startSession(idB, 'Hermes', 'approve-writes')).toBe(false)
    expect(useCoedit.getState().startSession(idA, 'Hermes', 'approve-writes')).toBe(true)
    expect(useCoedit.getState().projectId).toBe(idA)

    expect(
      useCoedit.getState().enqueueBatch(
        {
          id: 'b-wrong',
          agentName: 'Hermes',
          baseRev: 1,
          summary: 'Wrong project',
          operations: [],
          createdAt: '2026-11-21T00:00:00.000Z',
        },
        idB,
      ),
    ).toEqual({ accepted: false, reason: 'wrong_project' })

    // Switching projects auto-disconnects
    await useProjects.getState().loadProject(idB)
    expect(useCoedit.getState().syncFromCurrentTree()).toBeNull()
    expect(useCoedit.getState().projectId).toBeNull()

    // Manual disconnect clears access
    expect(useCoedit.getState().startSession(idB, 'Hermes', 'approve-writes')).toBe(true)
    useCoedit.getState().disconnect()
    expect(useCoedit.getState().projectId).toBeNull()
    expect(
      useCoedit.getState().enqueueBatch({
        id: 'b-after',
        agentName: 'Hermes',
        baseRev: 1,
        summary: 'After disconnect',
        operations: [],
        createdAt: '2026-11-21T00:00:00.000Z',
      }),
    ).toEqual({ accepted: false, reason: 'not_connected' })
  })

  it('rejects write batches in read-only mode', async () => {
    const id = await useProjects.getState().createProject('ReadOnly Map')
    useCoedit.getState().startSession(id, 'Hermes', 'read-only')

    const res = useCoedit.getState().enqueueBatch({
      id: 'b1',
      agentName: 'Hermes',
      baseRev: 1,
      summary: 'Try write',
      operations: [{ type: 'rename_node', id: 'missing', title: 'New' }],
      createdAt: '2026-11-21T00:00:00.000Z',
    })
    expect(res).toEqual({ accepted: false, reason: 'read_only' })
  })

  it('flushes pending notes draft before evaluating a batch so conflicts are caught', async () => {
    const id = await useProjects.getState().createProject('Draft Map')
    const rootId = useProjects.getState().current!.map.id
    useEditor
      .getState()
      .applyTree('map', (tree) => addChild(tree, rootId, makeNode('Branch A', { id: 'branch-a' })))

    useCoedit.getState().startSession(id, 'Hermes', 'approve-writes')
    const baseRev = useCoedit.getState().tracker!.rev

    // Human has an uncommitted note draft in the textarea
    let dirty = true
    const unregister = registerPendingEdit({
      isDirty: () => dirty,
      flush: () => {
        dirty = false
        useEditor.getState().applyTree('map', (tree) => setNotes(tree, 'branch-a', 'Human draft'))
      },
    })

    useCoedit.getState().enqueueBatch({
      id: 'b-conflict',
      agentName: 'Hermes',
      baseRev,
      summary: 'Agent updates notes on Branch A',
      operations: [{ type: 'update_notes', id: 'branch-a', notes: 'Agent note' }],
      createdAt: '2026-11-21T00:00:00.000Z',
    })

    const result = useCoedit.getState().approveBatch('b-conflict')
    expect(result?.ok).toBe(false)
    expect(result?.conflicts).toHaveLength(1)
    expect(result?.conflicts[0]).toMatchObject({
      nodeId: 'branch-a',
      field: 'notes',
      reason: 'concurrent_edit',
      currentValue: 'Human draft',
      proposedValue: 'Agent note',
    })

    unregister()
  })

  it('commits approved batches as one undoable step and supports selective undo', async () => {
    const id = await useProjects.getState().createProject('Coedit Map')
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => {
      let next = addChild(tree, rootId, makeNode('Branch A', { id: 'a' }))
      next = addChild(next, rootId, makeNode('Branch B', { id: 'b' }))
      return next
    })

    useCoedit.getState().startSession(id, 'Hermes', 'approve-writes')
    const baseRev = useCoedit.getState().tracker!.rev
    const pastLenBefore = useEditor.getState().past.length

    expect(
      useCoedit.getState().enqueueBatch({
        id: 'batch-multi',
        agentName: 'Hermes',
        baseRev,
        summary: 'Add two items to Branch B',
        operations: [
          { type: 'add_node', parentId: 'b', id: 'b1', title: 'Step 1' },
          { type: 'add_node', parentId: 'b', id: 'b2', title: 'Step 2' },
        ],
        createdAt: '2026-11-21T00:00:00.000Z',
      }),
    ).toEqual({ accepted: true })

    const applied = useCoedit.getState().approveBatch('batch-multi')
    expect(applied?.ok).toBe(true)
    expect(useCoedit.getState().pendingBatches).toEqual([])
    expect(useCoedit.getState().activity).toHaveLength(1)
    // Entire multi-op batch becomes a single undo entry
    expect(useEditor.getState().past.length).toBe(pastLenBefore + 1)

    // Unrelated human edit afterward on Branch A
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, 'a', 'Branch A (Human)'))

    // Selectively undo Hermes's batch without undoing the human's Branch A rename
    const undone = useCoedit.getState().undoActivityEntry('batch-multi')
    expect(undone?.ok).toBe(true)
    expect(useCoedit.getState().activity[0]?.undone).toBe(true)

    const map = useProjects.getState().current!.map
    expect(map.children?.[0]?.title).toBe('Branch A (Human)')
    expect(map.children?.[1]?.children).toEqual([])
  })
})
