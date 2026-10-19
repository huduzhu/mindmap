import { describe, expect, it } from 'vitest'
import defaultPreset from '../../presets/default.json'
import type { Preset, TreeNode } from '../schema/types'
import { decorateLayout, edgeType, layoutGeometry, layoutMap, nodeSize } from './layout'

const preset = defaultPreset as Preset

function tree(): TreeNode {
  return {
    id: 'root',
    title: 'Central',
    children: [
      {
        id: 'r1',
        title: 'Right one',
        notes: 'a memory',
        children: [{ id: 'r1a', title: 'Leaf', children: [] }],
      },
      { id: 'r2', title: 'Right two', children: [] },
      { id: 'l1', title: 'Left one', side: 'left', children: [] },
    ],
  }
}

describe('layoutMap', () => {
  it('produces one node per visible tree node with finite positions', () => {
    const { nodes, edges } = layoutMap(tree(), preset, null, null)
    expect(nodes).toHaveLength(5)
    expect(edges).toHaveLength(4)
    for (const node of nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
      expect(node.type).toBe('mapNode')
    }
  })

  it('sets width and height on every node so the wrapper obeys the reserved box', () => {
    const { nodes } = layoutMap(tree(), preset, null, null)
    for (const node of nodes) {
      expect(node.width).toBeGreaterThan(0)
      expect(node.height).toBeGreaterThan(0)
      // width/height must match measured so React Flow uses the same value for layout
      expect(node.width).toBe(node.measured?.width)
      expect(node.height).toBe(node.measured?.height)
    }
  })

  it('clamps a 309-char title to MAX_WIDTH and grows height past the old single-line value', () => {
    const longTitle: TreeNode = { id: 'long', title: 'x'.repeat(309), children: [] }
    const { nodes } = layoutMap(
      { id: 'root', title: 'Root', children: [longTitle] },
      preset,
      null,
      null,
    )
    const long = nodes.find((n) => n.id === 'long')!
    expect(long.width).toBeLessThanOrEqual(360)
    expect(long.width).toBeGreaterThan(340)
    // 309 chars wrap to more than 8 lines → clamped to 8 × (14 × 1.35) + 15
    expect(long.height!).toBeCloseTo(8 * 18.9 + 15, 1)
  })

  it('keeps left and right depth-1 gaps symmetric and exactly 2 × H_GAP', () => {
    // Shape of fixtures/valid/project-launch.json: root with one forced-left and one
    // forced-right branch. The raw edge of the root box to each child's raw near edge
    // must be 2 × H_GAP on both sides — h.x is the left edge of an hgap-padded box.
    const symmetric: TreeNode = {
      id: 'root',
      title: 'Product Launch',
      children: [
        { id: 'right-branch', title: 'Marketing', side: 'right', children: [] },
        { id: 'left-branch', title: 'Product', side: 'left', children: [] },
      ],
    }
    const { nodes } = layoutMap(symmetric, preset, null, null)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const root = byId.get('root')!
    const right = byId.get('right-branch')!
    const left = byId.get('left-branch')!

    const rightGap = right.position.x - (root.position.x + root.width!)
    const leftGap = root.position.x - (left.position.x + left.width!)

    expect(Math.abs(rightGap - leftGap)).toBeLessThanOrEqual(0.5)
    expect(rightGap).toBeCloseTo(72, 0)
    expect(leftGap).toBeCloseTo(72, 0)
  })

  it('edges connect each visible node to its parent', () => {
    const { edges } = layoutMap(tree(), preset, null, null)
    const pairs = edges.map((e) => `${e.source}->${e.target}`).sort()
    expect(pairs).toEqual(['r1->r1a', 'root->l1', 'root->r1', 'root->r2'])
  })

  it('adds visible cross-links as distinct edges and ignores invalid endpoints', () => {
    const { edges } = layoutMap(tree(), preset, null, null, undefined, [
      { from: 'r1', to: 'l1' },
      { from: 'missing', to: 'l1' },
      { from: 'r2', to: 'r2' },
    ])
    const linkEdges = edges.filter((edge) => edge.type === 'linkEdge')
    expect(linkEdges).toHaveLength(1)
    expect(linkEdges[0]).toMatchObject({ source: 'r1', target: 'l1' })
  })

  it('uses map edges with handles and side-aware curve data', () => {
    const { edges } = layoutMap(tree(), preset, null, null)
    const byPair = new Map(edges.map((edge) => [`${edge.source}->${edge.target}`, edge]))
    const right = byPair.get('root->r1')!
    const left = byPair.get('root->l1')!

    expect(right.type).toBe('mapEdge')
    expect(right.sourceHandle).toBe('source-right')
    expect(right.targetHandle).toBe('target-left')
    expect(right.data).toEqual({ side: 'right', curve: preset.edges.curve })
    expect(left.type).toBe('mapEdge')
    expect(left.sourceHandle).toBe('source-left')
    expect(left.targetHandle).toBe('target-right')
    expect(left.data).toEqual({ side: 'left', curve: preset.edges.curve })
  })

  it('prunes collapsed subtrees but reports the hidden count', () => {
    const collapsed: TreeNode = {
      ...tree(),
      children: tree().children!.map((c) => (c.id === 'r1' ? { ...c, collapsed: true } : c)),
    }
    const { nodes } = layoutMap(collapsed, preset, null, null)
    expect(nodes.map((n) => n.id)).not.toContain('r1a')
    const r1 = nodes.find((n) => n.id === 'r1')!
    expect(r1.data.hiddenCount).toBe(1)
    expect(r1.data.hasChildren).toBe(true)
  })

  it('honors explicit side and balances the rest', () => {
    const { nodes } = layoutMap(tree(), preset, null, null)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(byId.get('l1')!.data.side).toBe('left')
    expect(byId.get('r1')!.data.side).toBe('right')
    expect(byId.get('r2')!.data.side).toBe('right')
    expect(byId.get('r1a')!.data.side).toBe('right')
  })

  it('inherits branch color from the top-level branch', () => {
    const { nodes } = layoutMap(tree(), preset, null, null)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(byId.get('r1a')!.data.branchColor).toBe(byId.get('r1')!.data.branchColor)
  })

  it('marks selection and editing flags', () => {
    const { nodes } = layoutMap(tree(), preset, 'r2', 'l1')
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(byId.get('r2')!.selected).toBe(true)
    expect(byId.get('l1')!.data.editing).toBe(true)
    expect(byId.get('root')!.data.isRoot).toBe(true)
  })

  it('flips hasNotes when a node carries notes', () => {
    const { nodes } = layoutMap(tree(), preset, null, null)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(byId.get('r1')!.data.hasNotes).toBe(true)
    expect(byId.get('root')!.data.hasNotes).toBe(false)
    expect(byId.get('l1')!.data.hasNotes).toBe(false)
    expect(byId.get('r1a')!.data.hasNotes).toBe(false)
  })
})

describe('nodeSize (#72: measured, word-aware)', () => {
  // Tests run in jsdom, so nodeSize uses the estimator from measure.ts; a fixed
  // measurer makes the arithmetic explicit where it matters.
  const tenPx = (text: string) => [...text].length * 10

  it('clamps width between the min and max', () => {
    expect(nodeSize({ id: 'a', title: '', children: [] }, preset, false).width).toBe(72)
    const long = nodeSize({ id: 'b', title: 'x'.repeat(500), children: [] }, preset, false)
    expect(long.width).toBeLessThanOrEqual(360)
  })

  it('returns a one-line height for short titles', () => {
    const { height } = nodeSize({ id: 's', title: 'short', children: [] }, preset, false)
    // 1 line × (14 × 1.35) + 12 padding + 3 border = 33.9
    expect(height).toBeCloseTo(33.9, 1)
  })

  it('sizes the box to the widest wrapped line plus padding, border and safety', () => {
    const size = nodeSize({ id: 's', title: 'aaaa bbbb', children: [] }, preset, false, tenPx)
    // 90 px of text fits on one line (max 331): 90 + 24 + 3 + 2 = 119
    expect(size.width).toBe(119)
    expect(size.height).toBeCloseTo(33.9, 1)
  })

  it('wraps at spaces and grows height per line', () => {
    // "word" is 40 px and a space 10 px; a line holds 331 px → 6 words (290 px).
    // 18 words → 3 lines.
    const title = Array.from({ length: 18 }, () => 'word').join(' ')
    const size = nodeSize({ id: 's', title, children: [] }, preset, false, tenPx)
    expect(size.height).toBeCloseTo(3 * 18.9 + 15, 1)
    expect(size.width).toBe(290 + 24 + 3 + 2)
  })

  it('never sizes a CJK title narrower than one em per character', () => {
    const size = nodeSize({ id: 'c', title: '产品路线图', children: [] }, preset, false)
    expect(size.width).toBeGreaterThanOrEqual(5 * 14 + 24 + 3)
  })

  it('clamps line count at 8', () => {
    const { height } = nodeSize({ id: 's', title: 'x'.repeat(5000), children: [] }, preset, false)
    expect(height).toBeCloseTo(8 * 18.9 + 15, 1)
  })

  it('uses titleScale and weight for the root', () => {
    const rootSize = nodeSize({ id: 'r', title: 'Central', children: [] }, preset, true)
    const childSize = nodeSize({ id: 'c', title: 'Central', children: [] }, preset, false)
    expect(rootSize.height).toBeGreaterThan(childSize.height)
    expect(rootSize.width).toBeGreaterThan(childSize.width)
    // default.json: titleScale 1.5, baseSize 14 → 21 px × 1.35 + 15
    expect(rootSize.height).toBeCloseTo(21 * 1.35 + 15, 1)
  })
})

describe('edgeType', () => {
  it('uses the custom map edge for every preset curve', () => {
    expect(edgeType('bezier')).toBe('mapEdge')
    expect(edgeType('smoothstep')).toBe('mapEdge')
    expect(edgeType('straight')).toBe('mapEdge')
  })
})

describe('decorateLayout (#64)', () => {
  it('matches layoutMap and reuses nodes whose flags did not change', () => {
    const root = tree()
    const geometry = layoutGeometry(root, preset)
    const decorated = decorateLayout(geometry, 'r1', 'r2')
    expect(decorated).toEqual(layoutMap(root, preset, 'r1', 'r2'))
    expect(decorated.nodes.find((n) => n.id === 'l1')).toBe(
      geometry.nodes.find((n) => n.id === 'l1'),
    )
    expect(decorated.nodes.find((n) => n.id === 'r1')?.selected).toBe(true)
    expect(decorated.nodes.find((n) => n.id === 'r2')?.data.editing).toBe(true)
    expect(decorated.edges).toBe(geometry.edges)
  })
})

describe('size cache (#97)', () => {
  const size = (layout: ReturnType<typeof layoutGeometry>, id: string) => {
    const node = layout.nodes.find((n) => n.id === id)!
    return { width: node.width, height: node.height }
  }
  const tree = (title: string): TreeNode => ({
    id: 'root',
    title: 'Root',
    children: [
      { id: 'a', title },
      { id: 'b', title: 'Unchanged neighbour' },
    ],
  })

  it('re-measures a renamed node and keeps the others', () => {
    const p = defaultPreset as Preset
    const before = tree('Short')
    const first = layoutGeometry(before, p)
    const renamed = {
      ...before,
      children: [{ id: 'a', title: 'A much longer title than before' }, before.children![1]],
    }
    const second = layoutGeometry(renamed, p)
    expect(size(second, 'a').width).toBeGreaterThan(size(first, 'a').width!)
    expect(size(second, 'b')).toEqual(size(first, 'b'))
    // Identical input, identical output.
    expect(layoutGeometry(renamed, p).nodes.map((n) => n.width)).toEqual(
      second.nodes.map((n) => n.width),
    )
  })

  it('does not reuse a size across presets or root status', () => {
    const p = defaultPreset as Preset
    const big: Preset = { ...p, font: { ...p.font, baseSize: p.font.baseSize * 2 } }
    const root = tree('Same node')
    expect(size(layoutGeometry(root, big), 'a').height).toBeGreaterThan(
      size(layoutGeometry(root, p), 'a').height!,
    )
    const alone = root.children![0]
    // The same node object laid out as the root is sized as a root.
    expect(size(layoutGeometry(alone, p), 'a')).toEqual({
      width: nodeSize(alone, p, true).width,
      height: nodeSize(alone, p, true).height,
    })
  })
})

describe('object reuse across edits (#140)', () => {
  const p = defaultPreset as Preset
  const leaves = (prefix: string): TreeNode[] =>
    Array.from({ length: 4 }, (_, i) => ({ id: `${prefix}${i}`, title: `Idea ${prefix}${i}` }))
  const big = (): TreeNode => ({
    id: 'root',
    title: 'Root',
    children: [
      { id: 'a', title: 'Branch A', children: leaves('a') },
      { id: 'b', title: 'Branch B', children: leaves('b') },
      { id: 'c', title: 'Branch C', children: leaves('c') },
      { id: 'd', title: 'Branch D', children: leaves('d') },
    ],
  })
  const byId = (layout: ReturnType<typeof layoutGeometry>) =>
    new Map<string, unknown>([
      ...layout.nodes.map((n) => [n.id, n] as const),
      ...layout.edges.map((e) => [e.id, e] as const),
    ])
  const renameLeaf = (root: TreeNode, title: string): TreeNode => ({
    ...root,
    children: root.children!.map((branch) =>
      branch.id !== 'a'
        ? branch
        : {
            ...branch,
            children: branch.children!.map((leaf) =>
              leaf.id === 'a1' ? { ...leaf, title } : leaf,
            ),
          },
    ),
  })

  it('keeps the objects of untouched nodes and edges and replaces changed ones', () => {
    const before = big()
    const first = layoutGeometry(before, p)
    // Same length, so the rename moves nothing: only the edited path changes.
    const after = renameLeaf(before, 'Idea A1')
    const second = layoutGeometry(after, p, undefined, first)
    const old = byId(first)
    const now = byId(second)
    for (const id of ['root', 'a', 'a1']) expect(now.get(id)).not.toBe(old.get(id))
    for (const id of ['b', 'b0', 'c', 'd3', 'a0', 'a2', 'root->a', 'a->a1', 'b->b2'])
      expect(now.get(id)).toBe(old.get(id))
    expect(second.nodes.find((n) => n.id === 'a1')?.data.node.title).toBe('Idea A1')
    // Reuse never changes the result.
    expect(second).toEqual(layoutGeometry(after, p))
  })

  it('replaces nodes that moved and everything after a preset change', () => {
    const before = big()
    const first = layoutGeometry(before, p)
    const longer = renameLeaf(before, 'A much longer title that wraps onto a second line or more')
    const second = layoutGeometry(longer, p, undefined, first)
    expect(second).toEqual(layoutGeometry(longer, p))
    const moved = second.nodes.filter((n) => {
      const old = first.nodes.find((o) => o.id === n.id)!
      return old.position.y !== n.position.y || old.position.x !== n.position.x
    })
    expect(moved.length).toBeGreaterThan(0)
    for (const node of moved) expect(first.nodes).not.toContain(node)

    const dashed: Preset = { ...p, edges: { ...p.edges, dashed: !p.edges.dashed } }
    const third = layoutGeometry(longer, dashed, undefined, second)
    expect(third).toEqual(layoutGeometry(longer, dashed))
    for (const node of third.nodes) expect(second.nodes).not.toContain(node)
    for (const edge of third.edges) expect(second.edges).not.toContain(edge)
  })
})
