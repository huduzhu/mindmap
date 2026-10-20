import { describe, expect, it } from 'vitest'
import {
  collapseAll,
  collapseBranch,
  countVisible,
  expandAll,
  hasFoldedBranch,
  hasOpenBranch,
  pathTo,
  showLevels,
  visibleAncestor,
  moveAmongSiblings,
  addChild,
  addSibling,
  countNodes,
  findNode,
  indentNode,
  makeNode,
  moveNode,
  outdentNode,
  removeNode,
  removeNodes,
  renameNode,
  setNotes,
  clampNotes,
  setRole,
  setSide,
  toggleCollapse,
  expandTo,
  MAX_CHILDREN,
  takeChildLimitHit,
} from './treeOps'
import { makeTree } from '../test/fixtures'
import type { TreeNode } from '../schema/types'
import { MAX_NOTES_LENGTH } from '../schema/constants'

function sampleTree() {
  return makeTree('root', 'Root', [
    makeTree('a', 'A', [makeTree('a1', 'A1'), makeTree('a2', 'A2')]),
    makeTree('b', 'B', [makeTree('b1', 'B1')]),
    makeTree('c', 'C'),
  ])
}

describe('findNode', () => {
  it('locates nested nodes with parent and index', () => {
    const root = sampleTree()
    const located = findNode(root, 'a2')!
    expect(located.node.title).toBe('A2')
    expect(located.parent?.id).toBe('a')
    expect(located.index).toBe(1)
  })

  it('returns null for missing ids', () => {
    expect(findNode(sampleTree(), 'nope')).toBeNull()
  })
})

describe('node edits', () => {
  it('renames without touching the original', () => {
    const root = sampleTree()
    const next = renameNode(root, 'a1', 'Renamed')
    expect(findNode(next, 'a1')!.node.title).toBe('Renamed')
    expect(findNode(root, 'a1')!.node.title).toBe('A1')
  })

  it('sets and clears notes', () => {
    const withNotes = setNotes(sampleTree(), 'b', 'some notes')
    expect(findNode(withNotes, 'b')!.node.notes).toBe('some notes')
    const cleared = setNotes(withNotes, 'b', '')
    expect(findNode(cleared, 'b')!.node.notes).toBeUndefined()
  })

  it("caps notes at the schema's maximum without splitting a surrogate pair", () => {
    const long = setNotes(sampleTree(), 'b', 'x'.repeat(MAX_NOTES_LENGTH + 50))
    expect(findNode(long, 'b')!.node.notes).toHaveLength(MAX_NOTES_LENGTH)
    const emoji = `${'x'.repeat(MAX_NOTES_LENGTH - 1)}😀`
    expect(clampNotes(emoji)).toBe('x'.repeat(MAX_NOTES_LENGTH - 1))
    expect(clampNotes('short')).toBe('short')
  })

  it('sets and clears role', () => {
    const withRole = setRole(sampleTree(), 'c', 'risk')
    expect(findNode(withRole, 'c')!.node.role).toBe('risk')
    const cleared = setRole(withRole, 'c', undefined)
    expect(findNode(cleared, 'c')!.node.role).toBeUndefined()
  })

  it('sets side', () => {
    const next = setSide(sampleTree(), 'a', 'left')
    expect(findNode(next, 'a')!.node.side).toBe('left')
  })

  it('toggles collapse', () => {
    const once = toggleCollapse(sampleTree(), 'a')
    expect(findNode(once, 'a')!.node.collapsed).toBe(true)
    const twice = toggleCollapse(once, 'a')
    expect(findNode(twice, 'a')!.node.collapsed).toBe(false)
  })
})

describe('addChild', () => {
  it('appends a new child and uncollapses the parent', () => {
    const collapsed = toggleCollapse(sampleTree(), 'c')
    const next = addChild(collapsed, 'c')
    const c = findNode(next, 'c')!.node
    expect(c.collapsed).toBe(false)
    expect(c.children).toHaveLength(1)
    expect(c.children![0].title).toBe('New idea')
  })

  it('appends a provided child', () => {
    const child = makeNode('Custom', { id: 'fixed-id' })
    const next = addChild(sampleTree(), 'b', child)
    expect(findNode(next, 'fixed-id')!.parent?.id).toBe('b')
  })
})

describe('addSibling', () => {
  it('inserts after the target node', () => {
    const sibling = makeNode('A1.5', { id: 'mid' })
    const next = addSibling(sampleTree(), 'a1', sibling)
    const a = findNode(next, 'a')!.node
    expect(a.children!.map((c) => c.id)).toEqual(['a1', 'mid', 'a2'])
  })

  it('is a no-op for the root', () => {
    const root = sampleTree()
    expect(addSibling(root, 'root')).toBe(root)
  })
})

describe('removeNode', () => {
  it('removes a subtree', () => {
    const next = removeNode(sampleTree(), 'a')
    expect(findNode(next, 'a')).toBeNull()
    expect(findNode(next, 'a1')).toBeNull()
    expect(countNodes(next)).toBe(4)
  })

  it('never removes the root', () => {
    const root = sampleTree()
    expect(removeNode(root, 'root')).toBe(root)
  })

  it('removes multiple branches in one immutable operation and keeps the root', () => {
    const root = sampleTree()
    const next = removeNodes(root, ['a', 'c', 'root'])
    expect(next).not.toBe(root)
    expect(next.id).toBe('root')
    expect(next.children!.map((child) => child.id)).toEqual(['b'])
    expect(findNode(next, 'a1')).toBeNull()
    expect(findNode(root, 'a')).not.toBeNull()
  })
})

describe('moveNode', () => {
  it('moves a node to a new parent at the given index', () => {
    const next = moveNode(sampleTree(), 'a2', 'b', 0)
    const b = findNode(next, 'b')!.node
    expect(b.children!.map((c) => c.id)).toEqual(['a2', 'b1'])
    const a = findNode(next, 'a')!.node
    expect(a.children!.map((c) => c.id)).toEqual(['a1'])
  })

  it('appends when no index is given', () => {
    const next = moveNode(sampleTree(), 'a1', 'c')
    expect(findNode(next, 'c')!.node.children!.map((c) => c.id)).toEqual(['a1'])
  })

  it('refuses to move a node into its own descendant', () => {
    const root = sampleTree()
    expect(moveNode(root, 'a', 'a2')).toBe(root)
  })

  it('refuses to move the root or onto itself', () => {
    const root = sampleTree()
    expect(moveNode(root, 'root', 'a')).toBe(root)
    expect(moveNode(root, 'a', 'a')).toBe(root)
  })

  it('refuses to move to a nonexistent parent', () => {
    const root = sampleTree()
    expect(moveNode(root, 'a1', 'ghost')).toBe(root)
    expect(countNodes(root)).toBe(7)
  })

  it('clamps the index into range', () => {
    const next = moveNode(sampleTree(), 'c', 'a', 99)
    expect(findNode(next, 'a')!.node.children!.map((c) => c.id)).toEqual(['a1', 'a2', 'c'])
  })

  it('returns the original tree when a sibling is dropped back at its index', () => {
    const root = sampleTree()
    expect(moveNode(root, 'b', 'root', 1)).toBe(root)
    expect(moveNode(root, 'c', 'root')).toBe(root)
  })
})

describe('countNodes', () => {
  it('counts every node including the root', () => {
    expect(countNodes(sampleTree())).toBe(7)
  })
})

describe('indentNode', () => {
  it('makes the node the last child of its previous sibling', () => {
    const next = indentNode(sampleTree(), 'b')
    const root = findNode(next, 'root')!.node
    expect(root.children!.map((c) => c.id)).toEqual(['a', 'c'])
    const a = findNode(next, 'a')!.node
    expect(a.children!.map((c) => c.id)).toEqual(['a1', 'a2', 'b'])
    expect(findNode(next, 'b1')!.parent?.id).toBe('b')
  })

  it('is a no-op for a first child', () => {
    const root = sampleTree()
    expect(indentNode(root, 'a')).toBe(root)
    expect(indentNode(root, 'a1')).toBe(root)
  })

  it('is a no-op for the root', () => {
    const root = sampleTree()
    expect(indentNode(root, 'root')).toBe(root)
  })
})

describe('outdentNode', () => {
  it('inserts the node right after its parent in the grandparent', () => {
    const next = outdentNode(sampleTree(), 'a2')
    const root = findNode(next, 'root')!.node
    expect(root.children!.map((c) => c.id)).toEqual(['a', 'a2', 'b', 'c'])
    const a = findNode(next, 'a')!.node
    expect(a.children!.map((c) => c.id)).toEqual(['a1'])
  })

  it('is a no-op when the parent is the root', () => {
    const root = sampleTree()
    expect(outdentNode(root, 'b')).toBe(root)
  })

  it('is a no-op for the root', () => {
    const root = sampleTree()
    expect(outdentNode(root, 'root')).toBe(root)
  })
})

describe('expandTo', () => {
  it('uncollapses ancestors so the target is visible', () => {
    const root = makeTree(
      'root',
      'Root',
      [makeTree('a', 'A', [makeTree('a1', 'A1')], { collapsed: true })],
      { collapsed: true },
    )
    const next = expandTo(root, 'a1')
    expect(next.collapsed).toBe(false)
    expect(findNode(next, 'a')!.node.collapsed).toBe(false)
    expect(findNode(next, 'a1')!.node.collapsed).toBeUndefined()
  })

  it('is a no-op when the path is already expanded', () => {
    const root = sampleTree()
    expect(expandTo(root, 'a2')).toBe(root)
  })

  it('is a no-op for a missing id', () => {
    const root = sampleTree()
    expect(expandTo(root, 'missing')).toBe(root)
  })
})

describe('removeNodes structural sharing (#64)', () => {
  it('reuses every untouched subtree', () => {
    const tree = makeNode('root', {
      id: 'r',
      children: [
        makeNode('a', { id: 'a', children: [makeNode('a1', { id: 'a1' })] }),
        makeNode('b', { id: 'b', children: [makeNode('b1', { id: 'b1' })] }),
        makeNode('c', { id: 'c', children: [makeNode('c1', { id: 'c1' })] }),
      ],
    })
    const next = removeNodes(tree, ['a1'])
    expect(next).not.toBe(tree)
    expect(next.children![0].children).toEqual([])
    expect(next.children![1]).toBe(tree.children![1])
    expect(next.children![2]).toBe(tree.children![2])
    expect(removeNodes(tree, ['missing'])).toBe(tree)
  })
})

describe('moveAmongSiblings (#95)', () => {
  const tree = () =>
    makeNode('Root', {
      id: 'r',
      children: [
        makeNode('A', { id: 'a' }),
        makeNode('B', { id: 'b' }),
        makeNode('C', { id: 'c' }),
      ],
    })
  const order = (root: ReturnType<typeof tree>) => root.children!.map((c) => c.id).join('')

  it('moves up and down one place', () => {
    expect(order(moveAmongSiblings(tree(), 'b', -1))).toBe('bac')
    expect(order(moveAmongSiblings(tree(), 'b', 1))).toBe('acb')
  })

  it('is a no-op at either end and for the root', () => {
    const root = tree()
    expect(moveAmongSiblings(root, 'a', -1)).toBe(root)
    expect(moveAmongSiblings(root, 'c', 1)).toBe(root)
    expect(moveAmongSiblings(root, 'r', 1)).toBe(root)
  })
})

describe('folding the whole tree (#145)', () => {
  const tree = () =>
    makeTree('r', 'Root', [
      makeTree('a', 'A', [makeTree('a1', 'A1', [makeTree('a1x', 'A1x')]), makeTree('a2', 'A2')]),
      makeTree('b', 'B', [], { collapsed: true }),
      makeTree('c', 'C', [makeTree('c1', 'C1')], { collapsed: true }),
    ])
  const folded = (root: TreeNode) => {
    const ids: string[] = []
    const walk = (node: TreeNode) => {
      if (node.collapsed) ids.push(node.id)
      node.children?.forEach(walk)
    }
    walk(root)
    return ids
  }

  it('expandAll unfolds everything, drops the flag on leaves and is a no-op when open', () => {
    const open = expandAll(tree())
    expect(folded(open)).toEqual([])
    expect('collapsed' in findNode(open, 'b')!.node).toBe(false)
    expect(expandAll(open)).toBe(open)
  })

  it('collapseAll folds every branch below the root, only on nodes with children', () => {
    const result = collapseAll(tree())
    expect(folded(result)).toEqual(['a', 'a1', 'c'])
    expect(countVisible(result)).toBe(4)
    expect(collapseAll(result)).toBe(result)
  })

  it('showLevels(n) shows n levels and folds deeper branches', () => {
    expect(folded(showLevels(tree(), 1))).toEqual(['a', 'a1', 'c'])
    const two = showLevels(tree(), 2)
    expect(folded(two)).toEqual(['a1'])
    expect(countVisible(two)).toBe(7)
    expect(folded(showLevels(tree(), 3))).toEqual([])
  })

  it('works on a branch and keeps untouched siblings as the same objects', () => {
    const before = tree()
    const after = collapseAll(before, 'a')
    expect(folded(after)).toEqual(['a1', 'b', 'c'])
    expect(after.children![2]).toBe(before.children![2])
    expect(folded(expandAll(before, 'c'))).toEqual(['b'])
  })

  it('collapseBranch folds a node and every branch inside it', () => {
    expect(folded(collapseBranch(tree(), 'a'))).toEqual(['a', 'a1', 'b', 'c'])
  })

  it('finds the path to a node and where a hidden node shows', () => {
    const t = collapseAll(tree())
    expect(pathTo(t, 'a1x')!.map((n) => n.id)).toEqual(['r', 'a', 'a1', 'a1x'])
    expect(pathTo(t, 'nope')).toBeNull()
    expect(visibleAncestor(t, 'a1x')).toBe('a')
    expect(visibleAncestor(t, 'a')).toBe('a')
    expect(visibleAncestor(expandAll(t), 'a1x')).toBe('a1x')
    expect(visibleAncestor(t, 'nope')).toBeNull()
  })

  it('tells whether a branch has folded or open branches inside', () => {
    const t = tree()
    expect(hasFoldedBranch(findNode(t, 'a')!.node)).toBe(false)
    expect(hasFoldedBranch(t)).toBe(true)
    expect(hasOpenBranch(findNode(t, 'c')!.node)).toBe(false)
    expect(hasOpenBranch(findNode(t, 'a')!.node)).toBe(true)
  })
})

describe('renameNode keeps titles within the schema (#155)', () => {
  it('cuts a pasted 700-character title to 500', async () => {
    const { renameNode } = await import('./treeOps')
    const tree = { id: 'r', title: 'Root', children: [{ id: 'a', title: 'A' }] }
    const renamed = renameNode(tree, 'a', 'x'.repeat(700))
    expect(renamed.children![0].title).toHaveLength(500)
  })
})

describe('the 1,000-children limit (#186)', () => {
  const full = (): TreeNode => ({
    id: 'root',
    title: 'Root',
    children: [
      {
        id: 'full',
        title: 'Full',
        children: Array.from({ length: MAX_CHILDREN }, (_, i) => ({ id: `c${i}`, title: `C${i}` })),
      },
      { id: 'other', title: 'Other', children: [{ id: 'o1', title: 'O1' }] },
      { id: 'last', title: 'Last' },
    ],
  })

  it('refuses to add or move a child into a full node, and says so once', () => {
    takeChildLimitHit()
    const tree = full()
    expect(addChild(tree, 'full')).toBe(tree)
    expect(takeChildLimitHit()).toBe(true)
    expect(takeChildLimitHit()).toBe(false)
    expect(addSibling(tree, 'c0')).toBe(tree)
    expect(moveNode(tree, 'o1', 'full')).toBe(tree)
    // Indenting "Last" puts it under its previous sibling, here "Full".
    const before: TreeNode = {
      ...tree,
      children: [tree.children![1], tree.children![0], tree.children![2]],
    }
    expect(indentNode(before, 'last')).toBe(before)
    expect(takeChildLimitHit()).toBe(true)
  })

  it('still moves nodes inside a full node, and adds to one with room', () => {
    takeChildLimitHit()
    const tree = full()
    expect(moveNode(tree, 'c0', 'full', 5)).not.toBe(tree)
    expect(addChild(tree, 'other')).not.toBe(tree)
    expect(takeChildLimitHit()).toBe(false)
  })
})
