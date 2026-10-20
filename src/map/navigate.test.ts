import { describe, expect, it } from 'vitest'
import defaultPreset from '../../presets/default.json'
import type { Preset, TreeNode } from '../schema/types'
import { makeTree } from '../test/fixtures'
import { layoutGeometry } from './layout'
import { arrowTarget, buildNav, isArrowKey, type ArrowKey } from './navigate'

const preset = defaultPreset as Preset

/**
 *            l1a ─ l1 ┐        ┌ r1 ─ r1a
 *                     ├ root ──┤      └ r1b
 *                  l2 ┘        └ r2
 */
function sample(): TreeNode {
  return makeTree('root', 'Central', [
    makeTree('r1', 'Right one', [makeTree('r1a', 'Right leaf a'), makeTree('r1b', 'Right leaf b')]),
    makeTree('r2', 'Right two', [makeTree('r2a', 'Right two leaf')]),
    makeTree('l1', 'Left one', [makeTree('l1a', 'Left leaf')], { side: 'left' }),
    makeTree('l2', 'Left two', [], { side: 'left' }),
  ])
}

function navFor(tree: TreeNode) {
  const { nodes, edges } = layoutGeometry(tree, preset)
  return buildNav(nodes, edges)
}

describe('arrowTarget (#133)', () => {
  const nav = navFor(sample())
  const go = (id: string, key: ArrowKey) => arrowTarget(nav, id, key)

  it('lays the sample out with r* on the right and l* on the left', () => {
    expect(nav.nodeById.get('r1')!.data.side).toBe('right')
    expect(nav.nodeById.get('l1')!.data.side).toBe('left')
    expect(nav.nodeById.get('l1a')!.data.side).toBe('left')
  })

  it('from the central topic → goes right and ← goes left', () => {
    expect(go('root', 'ArrowRight')).toBe('r1')
    expect(go('root', 'ArrowLeft')).toBe('l1')
    expect(go('root', 'ArrowUp')).toBeNull()
    expect(go('root', 'ArrowDown')).toBeNull()
  })

  it('on the right, → goes to the first child and ← to the parent', () => {
    expect(go('r1', 'ArrowRight')).toBe('r1a')
    expect(go('r1a', 'ArrowLeft')).toBe('r1')
    expect(go('r1', 'ArrowLeft')).toBe('root')
    expect(go('r1a', 'ArrowRight')).toBeNull()
  })

  it('on the left the keys are mirrored', () => {
    expect(go('l1', 'ArrowLeft')).toBe('l1a')
    expect(go('l1a', 'ArrowRight')).toBe('l1')
    expect(go('l1', 'ArrowRight')).toBe('root')
    expect(go('l2', 'ArrowLeft')).toBeNull()
  })

  it('↑/↓ stay among the siblings on the same side', () => {
    expect(go('r1', 'ArrowDown')).toBe('r2')
    expect(go('r2', 'ArrowUp')).toBe('r1')
    expect(go('l1', 'ArrowDown')).toBe('l2')
    expect(go('l2', 'ArrowUp')).toBe('l1')
    // Never across to the other side of the map.
    expect(go('r2', 'ArrowDown') ?? '').not.toMatch(/^l/)
    expect(go('l2', 'ArrowDown')).toBeNull()
    expect(go('r1a', 'ArrowDown')).toBe('r1b')
  })

  it('past the last sibling, goes to the nearest node below on screen', () => {
    // r1b is the last child of r1; the next thing below it on the right is r2's branch.
    const next = go('r1b', 'ArrowDown')
    expect(['r2', 'r2a']).toContain(next)
    const up = go('r2a', 'ArrowUp')
    expect(['r1b', 'r1']).toContain(up)
    // Nothing above the topmost node on the left.
    expect(go('l1a', 'ArrowUp')).toBeNull()
  })

  it('skips siblings that sit on the other side of the map', () => {
    const tree = makeTree('root', 'Central', [
      makeTree('a', 'A'),
      makeTree('b', 'B', [], { side: 'left' }),
      makeTree('c', 'C', [], { side: 'right' }),
    ])
    const mixed = navFor(tree)
    expect(arrowTarget(mixed, 'a', 'ArrowDown')).toBe('c')
    expect(arrowTarget(mixed, 'c', 'ArrowUp')).toBe('a')
    expect(arrowTarget(mixed, 'b', 'ArrowDown')).toBeNull()
    expect(arrowTarget(mixed, 'root', 'ArrowLeft')).toBe('b')
  })

  it('knows which keys are arrows', () => {
    expect(isArrowKey('ArrowUp')).toBe(true)
    expect(isArrowKey('Tab')).toBe(false)
  })
})
