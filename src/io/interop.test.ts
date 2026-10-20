import { describe, expect, it } from 'vitest'
import { exportToFreemind } from './freemind'
import { exportToOpml } from './opml'
import type { TreeNode } from '../schema/types'

const tree: TreeNode = {
  id: 'r',
  title: 'Roadshow <plan> & "quotes"',
  children: [
    {
      id: 'a',
      title: 'Tokyo',
      side: 'right',
      collapsed: true,
      children: [{ id: 'a1', title: 'Venue list' }],
    },
    { id: 'b', title: 'Osaka', side: 'left' },
  ],
}

describe('OPML export', () => {
  it('produces nested outline elements with escaped titles', () => {
    const xml = exportToOpml(tree, 'Roadshow')
    expect(xml).toContain('<opml version="2.0">')
    expect(xml).toContain('<title>Roadshow</title>')
    expect(xml).toContain('<outline text="Roadshow &lt;plan&gt; &amp; &quot;quotes&quot;">')
    expect(xml).toContain('<outline text="Venue list" />')
    expect(xml.trimEnd().endsWith('</opml>')).toBe(true)
  })

  it('renders a bare root without children as a self-closing outline', () => {
    const xml = exportToOpml({ id: 'x', title: 'Solo' }, 'Solo')
    expect(xml).toContain('<outline text="Solo" />')
  })
})

describe('FreeMind export', () => {
  it('maps sides and folded flags onto node elements', () => {
    const xml = exportToFreemind(tree)
    expect(xml).toContain('<map version="1.0.1">')
    expect(xml).toContain('TEXT="Roadshow &lt;plan&gt; &amp; &quot;quotes&quot;"')
    expect(xml).toContain('TEXT="Tokyo" POSITION="right" FOLDED="true"')
    expect(xml).toContain('TEXT="Osaka" POSITION="left"')
    expect(xml).toContain('TEXT="Venue list" />')
  })

  it('omits POSITION for deep nodes and auto sides', () => {
    const xml = exportToFreemind({
      id: 'r',
      title: 'R',
      children: [
        { id: 'c', title: 'C', side: 'auto', children: [{ id: 'd', title: 'D', side: 'right' }] },
      ],
    })
    expect(xml).toContain('<node TEXT="C">')
    expect(xml).toContain('TEXT="D" />')
    expect(xml).not.toContain('POSITION')
  })
})

describe('notes survive the outline exports (#52)', () => {
  const withNotes: TreeNode = {
    id: 'r',
    title: 'Root',
    notes: 'Root note',
    children: [{ id: 'a', title: 'A', notes: 'line one\nline <two> & "3"' }],
  }

  it('OPML carries notes in _note with encoded newlines', () => {
    const xml = exportToOpml(withNotes, 'Root')
    expect(xml).toContain('_note="Root note"')
    expect(xml).toContain('_note="line one&#10;line &lt;two&gt; &amp; &quot;3&quot;"')
  })

  it('FreeMind carries notes as richcontent', () => {
    const xml = exportToFreemind(withNotes)
    expect(xml).toContain('<richcontent TYPE="NOTE">')
    expect(xml).toContain('<p>line one</p><p>line &lt;two&gt; &amp; &quot;3&quot;</p>')
    expect(xml).toContain('<node TEXT="A">')
  })
})
