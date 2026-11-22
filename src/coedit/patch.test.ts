import { describe, expect, it } from 'vitest'
import { MAX_ID_LENGTH } from '../io/sanitize'
import {
  MAX_CHILDREN,
  renameNode,
  removeNode,
  setNotes,
  addChild,
  makeNode,
} from '../store/treeOps'
import { makeTree } from '../test/fixtures'
import { applySelectiveUndo, evaluateCoeditBatch } from './patch'
import { createRevisionTracker, recordTreeTransition } from './revisions'
import type { CoeditBatch, CoeditOp } from './types'

function makeBatch(baseRev: number, operations: CoeditOp[], id = 'batch-1'): CoeditBatch {
  return {
    id,
    agentName: 'Hermes',
    baseRev,
    summary: 'Agent update',
    operations,
    createdAt: '2026-11-21T00:00:00.000Z',
  }
}

describe('evaluateCoeditBatch', () => {
  it('applies add_node, rename_node, update_notes, move_node and chained ops in one batch', () => {
    const initial = makeTree('root', 'Launch Plan', [
      makeTree('a', 'Marketing', [], { notes: 'Old notes' }),
      makeTree('b', 'Engineering', [makeTree('b1', 'API')]),
    ])
    const tracker = createRevisionTracker('proj-1', initial)

    const batch = makeBatch(1, [
      { type: 'add_node', parentId: 'a', id: 'a1', title: 'Press Release', index: 0 },
      { type: 'update_notes', id: 'a1', notes: 'Draft before Friday' },
      { type: 'rename_node', id: 'a', title: 'Go-To-Market' },
      { type: 'move_node', id: 'b1', newParentId: 'a1' },
    ])

    const res = evaluateCoeditBatch(initial, tracker, batch)
    expect(res.ok).toBe(true)
    expect(res.conflicts).toEqual([])
    expect(res.errors).toEqual([])
    expect(res.nextTree.children?.[0]?.title).toBe('Go-To-Market')
    expect(res.nextTree.children?.[0]?.children?.[0]?.id).toBe('a1')
    expect(res.nextTree.children?.[0]?.children?.[0]?.notes).toBe('Draft before Friday')
    expect(res.nextTree.children?.[0]?.children?.[0]?.children?.map((c) => c.id)).toEqual(['b1'])
    expect(res.nextTree.children?.[1]?.children).toEqual([])
    expect(res.affectedNodeIds).toEqual(expect.arrayContaining(['a1', 'a', 'b1']))
    expect(res.inverseOps.length).toBeGreaterThanOrEqual(4)
  })

  it('rebases cleanly when human edits another branch concurrently', () => {
    const t1 = makeTree('root', 'Project', [makeTree('a', 'Branch A'), makeTree('b', 'Branch B')])
    let tracker = createRevisionTracker('proj-1', t1)

    // Agent reads at rev 1, human edits Branch A notes -> rev 2
    const t2 = setNotes(t1, 'a', 'Human note on A')
    tracker = recordTreeTransition(tracker, t1, t2)
    expect(tracker.rev).toBe(2)

    // Agent proposes adding a child on Branch B from baseRev 1
    const batch = makeBatch(1, [
      { type: 'add_node', parentId: 'b', id: 'b1', title: 'Agent task on B' },
    ])

    const res = evaluateCoeditBatch(t2, tracker, batch)
    expect(res.ok).toBe(true)
    expect(res.conflicts).toEqual([])
    expect(res.nextTree.children?.[0]?.notes).toBe('Human note on A')
    expect(res.nextTree.children?.[1]?.children?.map((c) => c.title)).toEqual(['Agent task on B'])
  })

  it('allows disjoint field edits on the same node without conflict', () => {
    const t1 = makeTree('root', 'Root', [makeTree('a', 'Initial Title', [], { notes: '' })])
    let tracker = createRevisionTracker('proj-1', t1)

    // Human changes title -> rev 2 (notes untouched at rev 1)
    const t2 = renameNode(t1, 'a', 'Human Title')
    tracker = recordTreeTransition(tracker, t1, t2)

    // Agent updates notes from baseRev 1
    const batch = makeBatch(1, [{ type: 'update_notes', id: 'a', notes: 'Agent details' }])
    const res = evaluateCoeditBatch(t2, tracker, batch)
    expect(res.ok).toBe(true)
    expect(res.nextTree.children?.[0]?.title).toBe('Human Title')
    expect(res.nextTree.children?.[0]?.notes).toBe('Agent details')
  })

  it('detects same-field concurrent_edit conflicts and resolves with keep_human / take_agent', () => {
    const t1 = makeTree('root', 'Root', [
      makeTree('a', 'Node A', [], { notes: 'v1' }),
      makeTree('b', 'Node B'),
    ])
    let tracker = createRevisionTracker('proj-1', t1)

    // Human edits Node A notes and renames Node B -> rev 2
    const t2 = renameNode(setNotes(t1, 'a', 'Human v2'), 'b', 'Human B')
    tracker = recordTreeTransition(tracker, t1, t2)

    const batch = makeBatch(1, [
      { type: 'update_notes', id: 'a', notes: 'Agent v2' },
      { type: 'rename_node', id: 'b', title: 'Agent B' },
      { type: 'add_node', parentId: 'root', id: 'c', title: 'Non-conflicting C' },
    ])

    const conflicted = evaluateCoeditBatch(t2, tracker, batch)
    expect(conflicted.ok).toBe(false)
    expect(conflicted.nextTree).toBe(t2)
    expect(conflicted.inverseOps).toEqual([])
    expect(conflicted.conflicts).toHaveLength(2)
    expect(conflicted.conflicts[0]).toMatchObject({
      opIndex: 0,
      nodeId: 'a',
      field: 'notes',
      reason: 'concurrent_edit',
      currentValue: 'Human v2',
      proposedValue: 'Agent v2',
      changedAtRev: 2,
    })
    expect(conflicted.conflicts[1]).toMatchObject({
      opIndex: 1,
      nodeId: 'b',
      field: 'title',
      reason: 'concurrent_edit',
      currentValue: 'Human B',
      proposedValue: 'Agent B',
      changedAtRev: 2,
    })

    const resolved = evaluateCoeditBatch(t2, tracker, batch, {
      0: 'keep_human',
      1: { choice: 'take_agent', reviewedRev: 2 },
    })
    expect(resolved.ok).toBe(true)
    expect(resolved.nextTree.children?.[0]?.notes).toBe('Human v2')
    expect(resolved.nextTree.children?.[1]?.title).toBe('Agent B')
    expect(resolved.nextTree.children?.[2]?.id).toBe('c')

    const t3 = renameNode(t2, 'b', 'Human B again')
    const newer = recordTreeTransition(tracker, t2, t3)
    const stale = evaluateCoeditBatch(t3, newer, batch, {
      0: 'keep_human',
      1: { choice: 'take_agent', reviewedRev: 2 },
    })
    expect(stale.ok).toBe(false)
    expect(stale.nextTree).toBe(t3)
    expect(stale.conflicts[0]).toMatchObject({ currentValue: 'Human B again', changedAtRev: 3 })
  })

  it('detects node_deleted and parent_deleted conflicts when human removes nodes after baseRev', () => {
    const t1 = makeTree('root', 'Root', [makeTree('a', 'Alpha'), makeTree('b', 'Beta')])
    let tracker = createRevisionTracker('proj-1', t1)

    const t2 = removeNode(removeNode(t1, 'a'), 'b')
    tracker = recordTreeTransition(tracker, t1, t2)

    const batch = makeBatch(1, [
      { type: 'rename_node', id: 'a', title: 'Renamed Alpha' },
      { type: 'add_node', parentId: 'b', title: 'Child under deleted Beta' },
    ])

    const res = evaluateCoeditBatch(t2, tracker, batch)
    expect(res.ok).toBe(false)
    expect(res.conflicts.map((c) => c.reason)).toEqual(['node_deleted', 'parent_deleted'])
    expect(res.conflicts.map((c) => c.nodeId)).toEqual(['a', 'b'])

    // User can discard deleted-target ops via keep_human
    const skipped = evaluateCoeditBatch(t2, tracker, batch, { 0: 'keep_human', 1: 'keep_human' })
    expect(skipped.ok).toBe(true)
    expect(skipped.nextTree).toBe(t2)
  })

  it('reports validation errors for invalid operations and child_limit', () => {
    const tree = makeTree('root', 'Root', [makeTree('a', 'A', [makeTree('a1', 'A1')])])
    const tracker = createRevisionTracker('proj-1', tree)

    const badBatch = makeBatch(1, [
      { type: 'add_node', parentId: 'root', title: '   ' },
      { type: 'add_node', parentId: 'root', id: 'a', title: 'Dup ID' },
      { type: 'add_node', parentId: 'root', id: 'x'.repeat(MAX_ID_LENGTH + 1), title: 'Long ID' },
      { type: 'add_node', parentId: 'missing-parent', title: 'Missing parent' },
      { type: 'rename_node', id: 'root', title: '  ' },
      { type: 'rename_node', id: 'missing-node', title: 'X' },
      { type: 'update_notes', id: 'missing-node', notes: 'N' },
      { type: 'move_node', id: 'root', newParentId: 'a' },
      { type: 'move_node', id: 'a', newParentId: 'a1' },
    ])

    const res = evaluateCoeditBatch(tree, tracker, badBatch)
    expect(res.ok).toBe(false)
    expect(res.errors.map((e) => e.reason)).toEqual([
      'empty_title',
      'duplicate_id',
      'invalid_id',
      'parent_not_found',
      'empty_title',
      'node_not_found',
      'node_not_found',
      'cannot_move_root',
      'cycle',
    ])

    // Child limit test
    let fullRoot = makeTree('root', 'Full')
    for (let i = 0; i < MAX_CHILDREN; i++) {
      fullRoot = addChild(fullRoot, 'root', makeNode(`C${i}`, { id: `c-${i}` }))
    }
    const fullTracker = createRevisionTracker('proj-1', fullRoot)
    const limitRes = evaluateCoeditBatch(
      fullRoot,
      fullTracker,
      makeBatch(1, [{ type: 'add_node', parentId: 'root', title: 'Overflow' }]),
    )
    expect(limitRes.ok).toBe(false)
    expect(limitRes.errors[0]?.reason).toBe('child_limit')
  })
})

describe('applySelectiveUndo', () => {
  it('undoes an accepted agent batch without disturbing unrelated human edits made afterward', () => {
    const t1 = makeTree('root', 'Root', [
      makeTree('a', 'Branch A', [], { notes: 'Initial A' }),
      makeTree('b', 'Branch B', [makeTree('b1', 'Task 1')]),
    ])
    const tracker = createRevisionTracker('proj-1', t1)

    const batch = makeBatch(1, [
      { type: 'add_node', parentId: 'b', id: 'b2', title: 'Agent Item' },
      { type: 'rename_node', id: 'b1', title: 'Task 1 (Agent)' },
      { type: 'update_notes', id: 'a', notes: 'Agent note on A' },
    ])
    const applied = evaluateCoeditBatch(t1, tracker, batch)
    expect(applied.ok).toBe(true)

    // Unrelated human edit on Branch B after the agent batch: adds another node 'h1'
    const afterHuman = addChild(applied.nextTree, 'b', makeNode('Human Item', { id: 'h1' }))

    const undone = applySelectiveUndo(afterHuman, applied.inverseOps)
    expect(undone.ok).toBe(true)
    expect(undone.conflicts).toEqual([])
    expect(undone.nextTree.children?.[0]?.notes).toBe('Initial A')
    expect(undone.nextTree.children?.[1]?.children?.map((c) => c.id)).toEqual(['b1', 'h1'])
    expect(undone.nextTree.children?.[1]?.children?.[0]?.title).toBe('Task 1')
  })

  it('undoes an untouched subtree created in one agent batch', () => {
    const tree = makeTree('root', 'Root')
    const tracker = createRevisionTracker('proj-1', tree)
    const batch = makeBatch(1, [
      { type: 'add_node', parentId: 'root', id: 'new', title: 'Agent parent' },
      { type: 'add_node', parentId: 'new', id: 'leaf', title: 'Agent leaf' },
    ])
    const applied = evaluateCoeditBatch(tree, tracker, batch)
    expect(applied.ok).toBe(true)
    const result = applySelectiveUndo(applied.nextTree, applied.inverseOps)
    expect(result.ok).toBe(true)
    expect(result.nextTree.children).toEqual([])
  })

  it('does not remove an agent-created leaf with later human notes', () => {
    const tree = makeTree('root', 'Root')
    const tracker = createRevisionTracker('proj-1', tree)
    const batch = makeBatch(1, [
      { type: 'add_node', parentId: 'root', id: 'new', title: 'Agent leaf' },
      { type: 'update_notes', id: 'new', notes: 'Agent notes' },
    ])
    const applied = evaluateCoeditBatch(tree, tracker, batch)
    expect(applySelectiveUndo(applied.nextTree, applied.inverseOps).ok).toBe(true)
    const edited = setNotes(applied.nextTree, 'new', 'Human notes')
    const result = applySelectiveUndo(edited, applied.inverseOps)
    expect(result.ok).toBe(false)
    expect(result.nextTree).toBe(edited)
  })

  it('does not remove an agent-created leaf with human notes that the agent never edited', () => {
    const tree = makeTree('root', 'Root')
    const tracker = createRevisionTracker('proj-1', tree)
    const batch = makeBatch(1, [
      { type: 'add_node', parentId: 'root', id: 'new', title: 'Agent leaf' },
    ])
    const applied = evaluateCoeditBatch(tree, tracker, batch)
    const edited = setNotes(applied.nextTree, 'new', 'Human notes')
    const result = applySelectiveUndo(edited, applied.inverseOps)
    expect(result.ok).toBe(false)
    expect(result.nextTree).toBe(edited)
  })

  it('detects conflicts when human modified agent output unless force is true', () => {
    const t1 = makeTree('root', 'Root', [makeTree('a', 'Alpha', [], { notes: 'Before' })])
    const tracker = createRevisionTracker('proj-1', t1)

    const batch = makeBatch(1, [
      { type: 'add_node', parentId: 'root', id: 'new1', title: 'Agent Branch' },
      { type: 'update_notes', id: 'a', notes: 'Agent Note' },
    ])
    const applied = evaluateCoeditBatch(t1, tracker, batch)
    expect(applied.ok).toBe(true)

    // Human adds a child under agent's new node AND edits Alpha's notes further
    let afterHuman = addChild(applied.nextTree, 'new1', makeNode('Human Child', { id: 'hc1' }))
    afterHuman = setNotes(afterHuman, 'a', 'Human edited agent note')

    const blocked = applySelectiveUndo(afterHuman, applied.inverseOps)
    expect(blocked.ok).toBe(false)
    expect(blocked.nextTree).toBe(afterHuman)
    expect(blocked.conflicts.map((c) => c.reason)).toEqual(['concurrent_edit', 'has_children'])

    const forced = applySelectiveUndo(afterHuman, applied.inverseOps, true)
    expect(forced.ok).toBe(true)
    expect(forced.nextTree.children?.map((c) => c.id)).toEqual(['a'])
    expect(forced.nextTree.children?.[0]?.notes).toBe('Before')
  })
})
