import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from '../io/db'
import { makeProject, makeTree } from '../test/fixtures'
import { searchProjects } from './projectSearch'

function record(id: string, name: string, extra: Partial<ReturnType<typeof makeProject>> = {}) {
  return {
    id,
    updatedAt: '2026-09-27T00:00:00Z',
    project: { ...makeProject(name), ...extra },
  } as ProjectRecord
}

const records = [
  record('1', 'Launch plan', { tags: ['work'] }),
  record('2', 'Garden', {
    map: makeTree('m', 'Garden', [
      makeTree('t', 'Tomatoes', [makeTree('d', 'Launch day watering')]),
    ]),
  }),
  record('3', '旅行计划', { brainstorm: makeTree('b', '想法', [makeTree('x', '京都')]) }),
]

const ids = (query: string) => searchProjects(records, query).map((m) => m.record.id)

describe('searchProjects (#103)', () => {
  it('matches everything for an empty query, in the given order', () => {
    expect(ids('')).toEqual(['1', '2', '3'])
    expect(ids('   ')).toEqual(['1', '2', '3'])
  })

  it('matches names and tags case-insensitively', () => {
    expect(ids('LAUNCH')).toEqual(['1', '2'])
    expect(ids('work')).toEqual(['1'])
    expect(ids('旅行')).toEqual(['3'])
  })

  it('finds ideas inside the map and the brainstorm, and says where', () => {
    const [garden] = searchProjects(records, 'watering')
    expect(garden.record.id).toBe('2')
    expect(garden.foundIn).toBe('Launch day watering')
    expect(searchProjects(records, '京都')[0].foundIn).toBe('京都')
    // A name match needs no hint.
    expect(searchProjects(records, 'launch plan')[0].foundIn).toBeUndefined()
  })

  it('finds nothing when nothing matches', () => {
    expect(ids('zebra')).toEqual([])
  })
})
