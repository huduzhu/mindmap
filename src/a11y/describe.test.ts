import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../schema/types'
import { makeTree as t } from '../test/fixtures'
import {
  addChild,
  makeNode,
  moveNode,
  removeNode,
  renameNode,
  toggleCollapse,
} from '../store/treeOps'
import { describeLinkChange, describeTreeChange, nodeAccessibleName } from './describe'

const base = (): TreeNode =>
  t('root', 'Plan', [
    t('a', 'Alpha', [t('a1', 'One'), t('a2', 'Two')]),
    t('b', 'Beta'),
    t('c', 'Gamma'),
  ])

describe('describeTreeChange (#85)', () => {
  it('describes an added node with its parent', () => {
    const before = base()
    const after = addChild(before, 'b', { ...makeNode('Idea'), id: 'n' })
    expect(describeTreeChange(before, after)).toBe('Added “Idea” under “Beta”')
  })

  it('describes a deletion and how many children went with it', () => {
    const before = base()
    expect(describeTreeChange(before, removeNode(before, 'a'))).toBe(
      'Deleted “Alpha” and 2 children',
    )
    expect(describeTreeChange(before, removeNode(before, 'b'))).toBe('Deleted “Beta”')
  })

  it('describes a rename', () => {
    const before = base()
    expect(describeTreeChange(before, renameNode(before, 'c', 'Delta'))).toBe('Renamed to “Delta”')
  })

  it('describes a move to a new parent, and a reorder among siblings', () => {
    const before = base()
    const moved = moveNode(before, 'c', 'a', 0)
    expect(describeTreeChange(before, moved)).toBe('Moved “Gamma” under “Alpha”')
    const reordered: TreeNode = {
      ...before,
      children: [before.children![0], before.children![2], before.children![1]],
    }
    expect(describeTreeChange(before, reordered)).toMatch(/^Moved “(Gamma” up|Beta” down)$/)
  })

  it('describes folding', () => {
    const before = base()
    const folded = toggleCollapse(before, 'a')
    expect(describeTreeChange(before, folded)).toBe('Collapsed “Alpha”')
    expect(describeTreeChange(folded, toggleCollapse(folded, 'a'))).toBe('Expanded “Alpha”')
  })

  it('describes notes and role changes', () => {
    const before = base()
    const withNotes: TreeNode = {
      ...before,
      children: [before.children![0], { ...before.children![1], notes: 'x' }, before.children![2]],
    }
    expect(describeTreeChange(before, withNotes)).toBe('Updated the notes of “Beta”')
    const withRole: TreeNode = {
      ...before,
      children: [
        before.children![0],
        { ...before.children![1], role: 'risk' },
        before.children![2],
      ],
    }
    expect(describeTreeChange(before, withRole)).toBe('Set the role of “Beta” to risk')
  })

  it('says nothing when nothing changed', () => {
    const before = base()
    expect(describeTreeChange(before, before)).toBeNull()
    expect(describeTreeChange(before, base())).toBeNull()
  })

  it('summarises bulk edits', () => {
    const before = base()
    const after = removeNode(removeNode(before, 'b'), 'c')
    expect(describeTreeChange(before, after)).toBe('Deleted 2 nodes')
  })
})

describe('describeLinkChange (#85)', () => {
  it('names both ends of an added or removed cross-link', () => {
    const map = base()
    const link = { from: 'a1', to: 'c' }
    expect(describeLinkChange(map, [], [link])).toBe('Linked “One” and “Gamma”')
    expect(describeLinkChange(map, [link], [])).toBe('Removed the link between “One” and “Gamma”')
    expect(describeLinkChange(map, [link], [link])).toBeNull()
  })
})

describe('nodeAccessibleName (#85)', () => {
  it('says title, level, children, folding and notes', () => {
    const map = base()
    expect(nodeAccessibleName(map, 0)).toBe('Plan, central topic, 3 children')
    expect(nodeAccessibleName({ ...map.children![0], collapsed: true, notes: 'n' }, 1)).toBe(
      'Alpha, level 1, 2 children, collapsed, has notes',
    )
    expect(nodeAccessibleName(t('x', '  '), 3)).toBe('Untitled, level 3')
  })
})

describe('announcements in Simplified Chinese (follow-up)', () => {
  it('follow the interface language', async () => {
    const { setLocale, useLocale } = await import('../i18n')
    await setLocale('zh-CN')
    try {
      const before = base()
      expect(describeTreeChange(before, removeNode(before, 'a'))).toBe(
        '已删除 “Alpha” 及 2 个子节点',
      )
      expect(nodeAccessibleName(before, 0)).toBe('Plan，中心主题，3 个子节点')
    } finally {
      useLocale.setState({ locale: 'en' })
    }
  })
})
