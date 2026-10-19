import { describe, expect, it } from 'vitest'
import { makeProject } from '../test/fixtures'
import { validateDoc } from '../schema/validate'
import { clampText, describeRepairs, sanitizeProject } from './sanitize'

describe('sanitizeProject', () => {
  it('clamps titles, notes and the name to the schema limits', () => {
    const base = makeProject('p')
    const { project, stats } = sanitizeProject({
      ...base,
      name: 'n'.repeat(250),
      map: { ...base.map, title: 't'.repeat(600), notes: 'z'.repeat(20001) },
    })
    expect(project.name).toHaveLength(200)
    expect(project.map.title).toHaveLength(500)
    expect(project.map.notes).toHaveLength(20000)
    expect(stats.truncatedTitles).toBe(1)
    expect(stats.truncatedNotes).toBe(1)
    expect(validateDoc(project).ok).toBe(true)
    expect(describeRepairs(stats)).toHaveLength(2)
  })

  it('reassigns duplicate ids across both trees and drops dangling links', () => {
    const base = makeProject('p')
    const { project, stats } = sanitizeProject({
      ...base,
      brainstorm: { ...base.brainstorm, id: base.map.id },
      links: [{ from: base.map.id, to: 'missing' }],
    })
    expect(project.brainstorm.id).not.toBe(project.map.id)
    expect(stats.repairedIds).toBe(1)
    expect(project.links).toBeUndefined()
  })

  it('clampText marks the cut', () => {
    expect(clampText('abcdef', 4)).toBe('abc…')
    expect(clampText('abc', 4)).toBe('abc')
  })
})
