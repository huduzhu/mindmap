import { describe, expect, it } from 'vitest'
import { makeTree } from '../test/fixtures'
import { addLink, linkedIds, normalizeLinks, removeLinkBetween } from './links'

describe('normalizeLinks', () => {
  it('drops missing and self links while keeping valid links', () => {
    const map = makeTree('root', 'Root', [makeTree('a', 'A'), makeTree('b', 'B')])
    expect(
      normalizeLinks(map, [
        { from: 'a', to: 'b' },
        { from: 'missing', to: 'b' },
        { from: 'a', to: 'a' },
      ]),
    ).toEqual([{ from: 'a', to: 'b' }])
  })

  it('deduplicates repeated links', () => {
    const map = makeTree('root', 'Root', [makeTree('a', 'A'), makeTree('b', 'B')])
    expect(
      normalizeLinks(map, [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
      ]),
    ).toEqual([{ from: 'a', to: 'b' }])
  })
})

describe('link helpers (#90)', () => {
  it('adds a link once, in either direction', () => {
    const links = addLink([], 'a', 'b')
    expect(links).toEqual([{ from: 'a', to: 'b' }])
    expect(addLink(links, 'b', 'a')).toBe(links)
    expect(addLink(links, 'a', 'a')).toBe(links)
  })

  it('removes the link between two nodes whichever way it points', () => {
    const links = [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'a' },
    ]
    expect(removeLinkBetween(links, 'b', 'a')).toEqual([{ from: 'c', to: 'a' }])
    expect(removeLinkBetween(links, 'x', 'y')).toBe(links)
  })

  it('lists the nodes linked to one node', () => {
    expect(
      linkedIds(
        [
          { from: 'a', to: 'b' },
          { from: 'c', to: 'a' },
          { from: 'b', to: 'c' },
        ],
        'a',
      ),
    ).toEqual(['b', 'c'])
    expect(linkedIds(undefined, 'a')).toEqual([])
  })
})
