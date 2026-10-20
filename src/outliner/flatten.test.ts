import { describe, expect, it } from 'vitest'
import { makeTree } from '../test/fixtures'
import { flattenTree } from './flatten'

describe('flattenTree (#66)', () => {
  it('lists nodes depth-first with depth, parent and sibling index', () => {
    const tree = makeTree('r', 'Root', [
      makeTree('a', 'A', [makeTree('a1', 'A1')]),
      makeTree('b', 'B'),
    ])
    expect(
      flattenTree(tree).map(({ node, depth, parentId, index }) => [
        node.id,
        depth,
        parentId,
        index,
      ]),
    ).toEqual([
      ['r', 0, null, 0],
      ['a', 1, 'r', 0],
      ['a1', 2, 'a', 0],
      ['b', 1, 'r', 1],
    ])
  })

  it('handles a bare root', () => {
    expect(flattenTree({ id: 'solo', title: 'Solo' })).toHaveLength(1)
  })
})

describe('flattenTree folding (#145)', () => {
  const tree = () =>
    makeTree('r', 'Root', [
      makeTree('a', 'A', [makeTree('a1', 'A1', [makeTree('a1x', 'A1x')])], { collapsed: true }),
      makeTree('b', 'B', [], { collapsed: true }),
    ])

  it('hides the descendants of folded rows and counts them', () => {
    const rows = flattenTree(tree())
    expect(rows.map((row) => [row.node.id, row.hidden])).toEqual([
      ['r', 0],
      ['a', 2],
      ['b', 0],
    ])
  })

  it('lists every node when asked', () => {
    expect(flattenTree(tree(), { all: true }).map((row) => row.node.id)).toEqual([
      'r',
      'a',
      'a1',
      'a1x',
      'b',
    ])
  })
})
