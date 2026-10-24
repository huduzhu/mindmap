import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../schema/types'
import { MAX_TREE_DEPTH } from '../io/sanitize'
import {
  CLIPBOARD_KIND,
  copyPayload,
  type ClipboardPayload,
  MAX_CHILDREN,
  parsePayload,
  pasteInto,
  pasteTooDeep,
  payloadDepth,
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

  it('carries tags and pictures through a copy and paste', () => {
    const image = { asset: `sha256-${'a'.repeat(64)}`, w: 40, h: 30, alt: 'A cat' }
    const source = node('r', 'Root', [
      node('a', 'Alpha', [node('a1', 'Alpha one', undefined, { tags: ['p2'], image })], {
        tags: ['p1', 'work'],
        image: { asset: image.asset, w: 40, h: 30 },
      }),
    ])
    const read = parsePayload(JSON.stringify(copyPayload(source, ['a'])))!
    expect(read.nodes[0].tags).toEqual(['p1', 'work'])
    expect(read.nodes[0].image).toEqual({ asset: image.asset, w: 40, h: 30 })
    expect(read.nodes[0].children![0].tags).toEqual(['p2'])
    expect(read.nodes[0].children![0].image).toEqual(image)
  })

  it('never cuts an over-long title or note in half of an emoji', () => {
    const long = `${'T'.repeat(499)}😀 tail`
    const lone = (text: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text)
    const fromApp = parsePayload(
      JSON.stringify({
        kind: CLIPBOARD_KIND,
        nodes: [{ id: 'x', title: long, notes: `${'n'.repeat(19_999)}😀` }],
      }),
    )!
    expect(fromApp.nodes[0].title).toBe('T'.repeat(499))
    expect(lone(fromApp.nodes[0].notes!)).toBe(false)
    const fromText = textToPayload(`- ${long}\n  > ${'n'.repeat(19_999)}😀`)!
    expect(fromText.nodes[0].title).toBe('T'.repeat(499))
    expect(lone(fromText.nodes[0].notes!)).toBe(false)
  })

  it('keeps notes from quoted lines', () => {
    expect(textToPayload('- Idea\n  > why it matters')!.nodes[0].notes).toBe('why it matters')
  })
})

describe('nesting depth (#192)', () => {
  const indented = (levels: number) =>
    Array.from({ length: levels }, (_, i) => `${'  '.repeat(i)}- Level ${i + 1}`).join('\n')
  /** A chain `levels` deep, built without recursion. */
  const chain = (levels: number): TreeNode => {
    const top = node('d0', 'Level 1')
    let at = top
    for (let i = 1; i < levels; i++) {
      const next = node(`d${i}`, `Level ${i + 1}`)
      at.children = [next]
      at = next
    }
    return top
  }

  it('reads an outline deeper than the limit, so the paste can say why it refuses it', () => {
    const payload = textToPayload(indented(1500))!
    expect(payloadDepth(payload.nodes)).toBe(1500)
    expect(payload.nodes[0].children![0].title).toBe('Level 2')
  })

  it('refuses a paste that would nest the map deeper than the limit', () => {
    const payload = textToPayload(indented(MAX_TREE_DEPTH + 500))!
    expect(pasteTooDeep(tree(), 'r', payload, 'child')).toBe(true)
    expect(pasteInto(tree(), 'r', payload, 'child')).toBeNull()
  })

  it('counts the depth of the target: the root plus a full-depth payload is too deep', () => {
    const payload: ClipboardPayload = {
      kind: CLIPBOARD_KIND,
      version: 1,
      nodes: [chain(MAX_TREE_DEPTH - 2)],
      links: [],
    }
    // Under the root (level 1): 1 + 998 levels fit.
    expect(pasteTooDeep(tree(), 'r', payload, 'child')).toBe(false)
    // Under a1 (level 3): 3 + 998 is one level too many.
    expect(pasteTooDeep(tree(), 'a1', payload, 'child')).toBe(true)
    // Beside a1 its parent a is level 2: 2 + 998 fits exactly.
    expect(pasteTooDeep(tree(), 'a1', payload, 'sibling')).toBe(false)
    expect(pasteInto(tree(), 'a1', payload, 'sibling')).not.toBeNull()
  })

  it('refuses app data nested deeper than the limit', () => {
    const json = JSON.stringify({ kind: CLIPBOARD_KIND, nodes: [chain(MAX_TREE_DEPTH + 1)] })
    expect(parsePayload(json)).toBeNull()
  })
})
