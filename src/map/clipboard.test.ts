import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../schema/types'
import {
  CLIPBOARD_KIND,
  copyPayload,
  MAX_CHILDREN,
  parsePayload,
  pasteInto,
  payloadSize,
  payloadToText,
  textToPayload,
  topLevelSelection,
  withFreshIds,
} from './clipboard'

const node = (id: string, title: string, children?: TreeNode[], extra: Partial<TreeNode> = {}) =>
  ({ id, title, ...(children ? { children } : {}), ...extra }) as TreeNode

const tree = () =>
  node('r', 'Root', [
    node('a', 'Alpha', [node('a1', 'Alpha one', undefined, { notes: 'Line 1\n\nLine 2' })]),
    node('b', 'Beta', undefined, { role: 'task', side: 'left' }),
    node('c', 'Gamma'),
  ])

const titles = (nodes: TreeNode[]): unknown[] =>
  nodes.map((n) => (n.children?.length ? { [n.title]: titles(n.children) } : n.title))

describe('copying (#101)', () => {
  it('keeps outline order and drops nodes whose ancestor is also selected', () => {
    expect(topLevelSelection(tree(), ['c', 'a1', 'a']).map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('carries only the links inside the copy', () => {
    const payload = copyPayload(
      tree(),
      ['a', 'b'],
      [
        { from: 'a1', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    )!
    expect(payload.kind).toBe(CLIPBOARD_KIND)
    expect(payload.links).toEqual([{ from: 'a1', to: 'b' }])
    expect(payloadSize(payload)).toBe(3)
  })

  it('writes a Markdown outline with notes as quotes', () => {
    const payload = copyPayload(tree(), ['a', 'c'])!
    expect(payloadToText(payload)).toBe(
      '- Alpha\n  - Alpha one\n    > Line 1\n    >\n    > Line 2\n- Gamma\n',
    )
  })

  it('returns nothing for an empty selection', () => {
    expect(copyPayload(tree(), [])).toBeNull()
    expect(copyPayload(tree(), ['missing'])).toBeNull()
  })
})

describe('pasting (#101)', () => {
  it('gives every node a fresh id and moves links with them', () => {
    const payload = copyPayload(tree(), ['a', 'b'], [{ from: 'a1', to: 'b' }])!
    const fresh = withFreshIds(payload)
    const ids = [fresh.nodes[0].id, fresh.nodes[0].children![0].id, fresh.nodes[1].id]
    expect(ids.some((id) => ['a', 'a1', 'b'].includes(id))).toBe(false)
    expect(fresh.links).toEqual([{ from: ids[1], to: ids[2] }])
  })

  it('pastes as the last children of the target', () => {
    const payload = copyPayload(tree(), ['b'])!
    const result = pasteInto(tree(), 'a', payload, 'child')!
    expect(titles(result.tree.children!)).toEqual([
      { Alpha: ['Alpha one', 'Beta'] },
      'Beta',
      'Gamma',
    ])
    const pasted = result.tree.children![0].children![1]
    expect(pasted).toMatchObject({ title: 'Beta', role: 'task', side: 'left' })
    expect(result.pasted).toEqual([pasted.id])
  })

  it('pastes right after the target as siblings, and under the root when it is the target', () => {
    const payload = copyPayload(tree(), ['c'])!
    expect(titles(pasteInto(tree(), 'a', payload, 'sibling')!.tree.children!)).toEqual([
      { Alpha: ['Alpha one'] },
      'Gamma',
      'Beta',
      'Gamma',
    ])
    expect(pasteInto(tree(), 'r', payload, 'sibling')!.tree.children!.at(-1)!.title).toBe('Gamma')
  })

  it('unfolds a folded target so the paste is visible', () => {
    const folded = { ...tree(), children: [{ ...tree().children![0], collapsed: true }] }
    const result = pasteInto(folded, 'a', copyPayload(tree(), ['c'])!, 'child')!
    expect(result.tree.children![0].collapsed).toBe(false)
  })

  it('refuses a paste past the children limit or onto a missing node', () => {
    const payload = copyPayload(tree(), ['c'])!
    const full = node(
      'r',
      'Root',
      Array.from({ length: MAX_CHILDREN }, (_, i) => node(`n${i}`, `N${i}`)),
    )
    expect(pasteInto(full, 'r', payload, 'child')).toBeNull()
    expect(pasteInto(tree(), 'missing', payload, 'child')).toBeNull()
  })
})

describe('reading the clipboard (#101)', () => {
  it('round-trips the app’s own data', () => {
    const payload = copyPayload(tree(), ['a', 'b'], [{ from: 'a1', to: 'b' }])!
    expect(parsePayload(JSON.stringify(payload))).toEqual(payload)
  })

  it('rejects or cleans data from elsewhere', () => {
    expect(parsePayload('not json')).toBeNull()
    expect(parsePayload(JSON.stringify({ kind: 'other', nodes: [] }))).toBeNull()
    expect(parsePayload(JSON.stringify({ kind: CLIPBOARD_KIND, nodes: [{ title: 5 }] }))).toBeNull()
    const cleaned = parsePayload(
      JSON.stringify({
        kind: CLIPBOARD_KIND,
        nodes: [{ id: 'x', title: 'T'.repeat(600), role: 'boss', side: 'up', extra: 1 }],
        links: [{ from: 'x' }, 'junk'],
      }),
    )!
    expect(cleaned.nodes[0]).toEqual({ id: 'x', title: 'T'.repeat(500) })
    expect(cleaned.links).toEqual([])
  })

  it('reads Markdown bullets, numbered lists and plain lines as outlines', () => {
    expect(titles(textToPayload('- One\n  - Two\n- Three')!.nodes)).toEqual([
      { One: ['Two'] },
      'Three',
    ])
    expect(titles(textToPayload('1. First\n2. Second\n   3) Nested')!.nodes)).toEqual([
      'First',
      { Second: ['Nested'] },
    ])
    expect(titles(textToPayload('Buy milk\n\nCall Sam\n  about Friday\n')!.nodes)).toEqual([
      'Buy milk',
      { 'Call Sam': ['about Friday'] },
    ])
    expect(titles(textToPayload('# Plan\n- Step')!.nodes)).toEqual([{ Plan: ['Step'] }])
    expect(textToPayload('   \n\n')).toBeNull()
  })

  it('keeps notes from quoted lines', () => {
    expect(textToPayload('- Idea\n  > why it matters')!.nodes[0].notes).toBe('why it matters')
  })
})
