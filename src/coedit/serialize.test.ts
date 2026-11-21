import { describe, expect, it } from 'vitest'
import { makeProject, makeTree } from '../test/fixtures'
import { searchNodesForAgent, serializeMapForAgent, serializeNodeForAgent } from './serialize'

function sampleProject() {
  const map = makeTree('root', 'Product Roadmap', [
    makeTree(
      'q1',
      'Q1 Launch',
      [
        makeTree('q1a', 'Draft press kit', [], {
          role: 'task',
          done: false,
          tags: ['marketing', 'launch'],
          notes: 'Coordinate quotes with design and PR partners before Tuesday.',
        }),
      ],
      { notes: 'Top-level release milestone' },
    ),
    makeTree('q2', 'Q2 Growth', [makeTree('q2a', 'Onboarding funnel')]),
  ])
  return makeProject('Roadmap', undefined, map)
}

describe('coedit serialization for agents', () => {
  it('serializeMapForAgent respects includeNotes and maxDepth', () => {
    const project = sampleProject()

    const full = serializeMapForAgent(project, 7)
    expect(full.projectName).toBe('Roadmap')
    expect(full.rev).toBe(7)
    expect(full.root.children?.[0]?.notes).toBe('Top-level release milestone')
    expect(full.root.children?.[0]?.children?.[0]?.tags).toEqual(['marketing', 'launch'])

    const outlineOnly = serializeMapForAgent(project, 7, { includeNotes: false, maxDepth: 1 })
    const q1 = outlineOnly.root.children?.[0]
    expect(q1?.id).toBe('q1')
    expect(q1?.hasNotes).toBe(true)
    expect('notes' in (q1 ?? {})).toBe(false)
    expect(q1?.childCount).toBe(1)
    expect(q1?.children).toBeUndefined()
  })

  it('serializeNodeForAgent returns full details and null when missing', () => {
    const project = sampleProject()

    const detail = serializeNodeForAgent(project.map, 'q1a', 3)
    expect(detail).toEqual({
      rev: 3,
      parentId: 'q1',
      node: {
        id: 'q1a',
        title: 'Draft press kit',
        role: 'task',
        done: false,
        tags: ['marketing', 'launch'],
        notes: 'Coordinate quotes with design and PR partners before Tuesday.',
        hasNotes: true,
        childCount: 0,
      },
    })

    expect(serializeNodeForAgent(project.map, 'nonexistent', 3)).toBeNull()
  })

  it('searchNodesForAgent matches across title, notes, and tags and obeys limit', () => {
    const project = sampleProject()

    const tagMatches = searchNodesForAgent(project.map, 'marketing', 4)
    expect(tagMatches.rev).toBe(4)
    expect(tagMatches.matches).toEqual([
      {
        id: 'q1a',
        title: 'Draft press kit',
        parentId: 'q1',
        tags: ['marketing', 'launch'],
      },
    ])

    const noteMatches = searchNodesForAgent(project.map, 'Tuesday', 4)
    expect(noteMatches.matches[0]?.snippet).toContain('Tuesday')

    const broad = searchNodesForAgent(project.map, 'q', 4, 2)
    expect(broad.matches).toHaveLength(2)

    expect(searchNodesForAgent(project.map, '   ', 4).matches).toEqual([])
  })
})
