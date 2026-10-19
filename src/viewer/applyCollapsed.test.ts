import { describe, expect, it } from 'vitest'
import { makeTree } from '../test/fixtures'
import { applyCollapsed } from './applyCollapsed'

function sampleTree() {
  return makeTree('root', 'Root', [
    makeTree('a', 'A', [makeTree('a1', 'A1'), makeTree('a2', 'A2')]),
    makeTree('b', 'B', [makeTree('b1', 'B1')]),
    makeTree('c', 'C'),
  ])
}

describe('applyCollapsed', () => {
  it('returns the same reference when no overrides apply', () => {
    const tree = sampleTree()
    expect(applyCollapsed(tree, new Map())).toBe(tree)
  })

  it('returns the same reference when overrides map only other ids', () => {
    const tree = sampleTree()
    expect(applyCollapsed(tree, new Map([['nope', true]]))).toBe(tree)
  })

  it('treats an explicit false override as a no-op when source was not collapsed', () => {
    // Source `a` is not collapsed; an explicit `false` override carries no new intent so the
    // visitor must keep the same reference. This is the `!!override` refinement over the
    // old behaviour that always wrote `collapsed: false` and re-allocated.
    const tree = sampleTree()
    expect(applyCollapsed(tree, new Map([['a', false]]))).toBe(tree)
  })

  it('flips the collapsed flag on a depth-1 node when overridden to true', () => {
    const tree = sampleTree()
    const next = applyCollapsed(tree, new Map([['a', true]]))
    expect(next).not.toBe(tree)
    expect(next.children!.find((c) => c.id === 'a')!.collapsed).toBe(true)
    // Untouched siblings keep their reference identity.
    expect(next.children!.find((c) => c.id === 'b')).toBe(tree.children!.find((c) => c.id === 'b'))
    expect(next.children!.find((c) => c.id === 'c')).toBe(tree.children!.find((c) => c.id === 'c'))
  })

  it('un-collapses a node that was collapsed in the source tree', () => {
    const tree: ReturnType<typeof sampleTree> = {
      ...sampleTree(),
      children: sampleTree().children!.map((c) => (c.id === 'a' ? { ...c, collapsed: true } : c)),
    }
    const next = applyCollapsed(tree, new Map([['a', false]]))
    expect(next).not.toBe(tree)
    expect(next.children!.find((c) => c.id === 'a')!.collapsed).toBeUndefined()
  })

  it('walks overrides into nested descendants', () => {
    const tree = sampleTree()
    const next = applyCollapsed(tree, new Map([['a1', true]]))
    expect(next).not.toBe(tree)
    const a = next.children!.find((c) => c.id === 'a')!
    expect(a.children!.find((c) => c.id === 'a1')!.collapsed).toBe(true)
    // `a2` reference identity preserved.
    expect(a.children!.find((c) => c.id === 'a2')).toBe(
      tree.children!.find((c) => c.id === 'a')!.children!.find((c) => c.id === 'a2'),
    )
  })

  it('toggles a leaf without producing new arrays for unrelated branches', () => {
    const tree = sampleTree()
    const next = applyCollapsed(tree, new Map([['b1', true]]))
    const b = next.children!.find((c) => c.id === 'b')!
    const b1 = b.children!.find((c) => c.id === 'b1')!
    expect(b1.collapsed).toBe(true)
    // `b` itself stays uncollapsed (the override landed on the leaf).
    expect(b.collapsed).toBeUndefined()
    // `a` is structurally unchanged.
    expect(next.children!.find((c) => c.id === 'a')).toBe(tree.children!.find((c) => c.id === 'a'))
    expect(next.children!.find((c) => c.id === 'c')).toBe(tree.children!.find((c) => c.id === 'c'))
  })
})
