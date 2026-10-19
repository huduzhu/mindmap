import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { MapNodeData } from './layout'
import {
  applyDropIntent,
  applyOutlinerDropIntent,
  isOutlinerCycleDrop,
  resolveDropIntent,
  resolveDropPreview,
  resolveOutlinerDropIntent,
} from './drop'
import { moveNode, setSide } from '../store/treeOps'
import { makePreset, makeTree } from '../test/fixtures'

function layout(
  id: string,
  x: number,
  y: number,
  side: 'left' | 'right',
  isRoot = false,
): Node<MapNodeData> {
  return {
    id,
    type: 'mapNode',
    position: { x, y },
    width: 100,
    height: 40,
    data: {
      node: makeTree(id, id),
      preset: makePreset(),
      isRoot,
      side,
      depth: isRoot ? 0 : 1,
      branchColor: '#000',
      editing: false,
      hasChildren: false,
      hiddenCount: 0,
      hasNotes: false,
    },
  }
}

describe('resolveDropIntent', () => {
  const root = makeTree('root', 'Root', [
    makeTree('a', 'A', [], { side: 'right' }),
    makeTree('b', 'B', [], { side: 'right' }),
    makeTree('c', 'C', [], { side: 'right' }),
  ])
  const nodes = [
    layout('root', 200, 50, 'right', true),
    layout('a', 400, 0, 'right'),
    layout('b', 400, 100, 'right'),
    layout('c', 400, 200, 'right'),
  ]

  it('drops onto a node as its first child', () => {
    expect(resolveDropIntent(root, nodes, 'a', { x: 450, y: 120 })).toEqual({
      parentId: 'b',
      index: 0,
    })
  })

  it('uses the sibling gap to reorder without changing parent', () => {
    expect(resolveDropIntent(root, nodes, 'c', { x: 450, y: -20 })).toEqual({
      parentId: 'root',
      index: 0,
      side: 'right',
    })
  })

  it('uses the left or right half of the root for a depth-one side', () => {
    const intent = resolveDropIntent(root, nodes, 'a', { x: 220, y: 70 })
    expect(intent).toEqual({
      parentId: 'root',
      index: 0,
      side: 'left',
    })

    const result = applyDropIntent(root, 'a', intent!)
    expect(result).not.toBe(root)
    expect(result.children![0].side).toBe('left')
  })

  it('lets moveNode reject a descendant target', () => {
    const nested = makeTree('root', 'Root', [makeTree('a', 'A', [makeTree('a1', 'A1')])])
    const intent = resolveDropIntent(
      nested,
      [
        layout('root', 200, 50, 'right', true),
        layout('a', 400, 0, 'right'),
        layout('a1', 600, 0, 'right'),
      ],
      'a',
      { x: 650, y: 20 },
    )
    expect(intent?.parentId).toBe('a1')
    expect(moveNode(nested, 'a', intent!.parentId, intent!.index)).toBe(nested)
    expect(applyDropIntent(nested, 'a', { ...intent!, side: 'left' })).toBe(nested)
  })

  it('combines a successful move and side change as one tree operation', () => {
    const moved = moveNode(root, 'a', 'root', 2)
    const sided = setSide(moved, 'a', 'left')
    expect(sided.children!.map((child) => child.id)).toEqual(['b', 'c', 'a'])
    expect(sided.children![2].side).toBe('left')
  })
})

describe('dragging feedback and side flips (live test, item 2)', () => {
  const root = makeTree('root', 'Root', [
    makeTree('a', 'A', [], { side: 'right' }),
    makeTree('b', 'B', [], { side: 'right' }),
    makeTree('l', 'L', [], { side: 'left' }),
  ])
  const nodes = [
    layout('root', 200, 50, 'right', true),
    layout('a', 400, 0, 'right'),
    layout('b', 400, 100, 'right'),
    layout('l', 0, 50, 'left'),
  ]

  it('flips a main branch let go in open space past the central topic', () => {
    // Far left of the root, below the left lane: no node and no lane there.
    expect(resolveDropIntent(root, nodes, 'a', { x: -300, y: 400 })).toEqual({
      parentId: 'root',
      index: 2,
      side: 'left',
    })
  })

  it('still ignores open space on its own side outside its lane', () => {
    expect(resolveDropIntent(root, nodes, 'a', { x: 900, y: 600 })).toBeNull()
  })

  it('previews the parent and the line where the node lands', () => {
    const preview = resolveDropPreview(root, nodes, 'a', { x: 450, y: 120 })
    expect(preview).toMatchObject({ targetId: 'b', intent: { parentId: 'b', index: 0 } })
    // B has no children yet: the line stands to its right.
    expect(preview!.line).toEqual({ x: 528, y: 120, width: 96 })
    expect(preview!.flipTo).toBeUndefined()
  })

  it('says which side a flip lands on, with the line in that lane', () => {
    const preview = resolveDropPreview(root, nodes, 'a', { x: -300, y: 400 })
    expect(preview).toMatchObject({ targetId: 'root', flipTo: 'left' })
    expect(preview!.line).toEqual({ x: 0, y: 96, width: 100 })
  })

  it('shows nothing where letting go would change nothing', () => {
    // Back into its own place, and onto its own child.
    expect(resolveDropPreview(root, nodes, 'a', { x: 450, y: -20 })).toBeNull()
    const nested = makeTree('root', 'Root', [makeTree('a', 'A', [makeTree('a1', 'A1')])])
    const nestedNodes = [
      layout('root', 200, 50, 'right', true),
      layout('a', 400, 0, 'right'),
      layout('a1', 600, 0, 'right'),
    ]
    expect(resolveDropPreview(nested, nestedNodes, 'a', { x: 650, y: 20 })).toBeNull()
  })
})

describe('focus mode (#161)', () => {
  // Focused on X: X is laid out as the centre, its children on both sides.
  const root = makeTree('root', 'Root', [
    makeTree('x', 'X', [
      makeTree('c1', 'C1'),
      makeTree('c2', 'C2'),
      makeTree('c3', 'C3', [], { side: 'left' }),
      makeTree('c4', 'C4', [], { side: 'left' }),
    ]),
  ])
  const nodes = [
    layout('x', 200, 50, 'right', true),
    layout('c1', 400, 0, 'right'),
    layout('c2', 400, 100, 'right'),
    layout('c3', 0, 0, 'left'),
    layout('c4', 0, 100, 'left'),
  ]

  it('reorders within the focused branch on the side it is dropped on', () => {
    // C4 above C3, both on the left.
    expect(resolveDropIntent(root, nodes, 'c4', { x: 50, y: -15 }, 'x')).toEqual({
      parentId: 'x',
      index: 2,
      side: 'left',
    })
  })

  it('previews a line in that side’s lane only', () => {
    const preview = resolveDropPreview(root, nodes, 'c4', { x: 50, y: -15 }, 'x')
    expect(preview).toMatchObject({ targetId: 'x' })
    expect(preview!.line).toEqual({ x: 0, y: -6, width: 100 })
  })
})

describe('outliner drop intents', () => {
  it('reorders siblings and reparents onto the last child', () => {
    const root = makeTree('root', 'Root', [
      makeTree('a', 'A'),
      makeTree('b', 'B', [makeTree('b1', 'B1')]),
      makeTree('c', 'C'),
    ])
    const reorder = resolveOutlinerDropIntent(root, 'c', 'a', 'before')!
    expect(applyOutlinerDropIntent(root, 'c', reorder).children!.map((node) => node.id)).toEqual([
      'c',
      'a',
      'b',
    ])
    const reparent = resolveOutlinerDropIntent(root, 'a', 'b', 'child')!
    const reparented = applyOutlinerDropIntent(root, 'a', reparent)
    expect(reparented.children![0].children!.map((node) => node.id)).toEqual(['b1', 'a'])
  })

  it('outdents, promotes to the root, and rejects cycles', () => {
    const root = makeTree('root', 'Root', [
      makeTree('a', 'A', [makeTree('a1', 'A1')]),
      makeTree('b', 'B'),
    ])
    const outdent = resolveOutlinerDropIntent(root, 'a1', 'b', 'outdent')!
    const outdented = applyOutlinerDropIntent(root, 'a1', outdent)
    expect(outdented.children!.map((node) => node.id)).toEqual(['a', 'a1', 'b'])
    const promote = resolveOutlinerDropIntent(root, 'a1', null, 'promote')!
    expect(applyOutlinerDropIntent(root, 'a1', promote).children!.map((node) => node.id)).toEqual([
      'a1',
      'a',
      'b',
    ])
    expect(isOutlinerCycleDrop(root, 'a', 'a1')).toBe(true)
    expect(
      applyOutlinerDropIntent(root, 'a', resolveOutlinerDropIntent(root, 'a', 'a1', 'child')!),
    ).toBe(root)
  })
})
