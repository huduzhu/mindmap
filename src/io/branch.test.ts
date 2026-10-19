import { describe, expect, it } from 'vitest'
import { makeProject, makeTree } from '../test/fixtures'
import { branchProject } from './branch'

describe('branchProject (#146)', () => {
  const project = () => ({
    ...makeProject('Plan'),
    map: makeTree('r', 'Root', [
      makeTree('a', 'Launch', [makeTree('a1', 'Pricing'), makeTree('a2', 'Press')]),
      makeTree('b', 'Other'),
    ]),
    links: [
      { from: 'a1', to: 'a2' },
      { from: 'a1', to: 'b' },
    ],
  })

  it('makes the branch the root and keeps only the links inside it', () => {
    const result = branchProject(project(), 'map', 'a')!
    expect(result.name).toBe('Plan – Launch')
    expect(result.map.id).toBe('a')
    expect(result.map.children!.map((c) => c.id)).toEqual(['a1', 'a2'])
    expect(result.links).toEqual([{ from: 'a1', to: 'a2' }])
    expect(result.brainstorm.title).toBe('Launch')
    expect(result.brainstorm.children).toEqual([])
    expect(JSON.stringify(result)).not.toContain('Other')
  })

  it('returns null for a node that is gone', () => {
    expect(branchProject(project(), 'map', 'nope')).toBeNull()
  })
})
