import { describe, expect, it } from 'vitest'
import { makeTree } from '../test/fixtures'
import { searchNodes } from './nodes'

function tree() {
  return makeTree('root', 'Product Launch', [
    makeTree('a', 'Marketing', [makeTree('a1', 'Landing page', [], { notes: 'hero copy' })]),
    makeTree('b', 'Engineering', [makeTree('b1', 'API launch')]),
  ])
}

describe('searchNodes', () => {
  it('returns nothing for a blank query', () => {
    expect(searchNodes(tree(), '')).toEqual([])
    expect(searchNodes(tree(), '   ')).toEqual([])
  })

  it('matches titles case-insensitively in document order', () => {
    expect(searchNodes(tree(), 'launch').map((h) => h.id)).toEqual(['root', 'b1'])
  })

  it('matches notes as well as titles', () => {
    expect(searchNodes(tree(), 'hero').map((h) => h.id)).toEqual(['a1'])
  })

  it('walks collapsed branches', () => {
    const collapsed = makeTree('root', 'Root', [
      makeTree('a', 'Hidden parent', [makeTree('a1', 'Deep match')], { collapsed: true }),
    ])
    expect(searchNodes(collapsed, 'deep').map((h) => h.id)).toEqual(['a1'])
  })
})
