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

describe('the app never writes a file its own checks refuse (#155)', () => {
  it('cuts over-long titles, notes and names before validation', async () => {
    const { dropInvalidMarks, nameWithSuffix } = await import('./sanitize')
    const { parseProjectFile, conflictCopy } = await import('../sync/engine')
    const long = makeProject('N'.repeat(200))
    long.map = { id: 'm', title: 'T'.repeat(700), notes: 'n'.repeat(25000) }
    const cleaned = dropInvalidMarks(long)
    expect(cleaned.map.title.length).toBeLessThanOrEqual(500)
    expect(cleaned.map.notes!.length).toBeLessThanOrEqual(20000)
    expect(validateDoc(cleaned).ok).toBe(true)
    // A sync file written that way is read, not refused.
    expect(parseProjectFile(JSON.stringify({ ...long, name: 'P'.repeat(260) })).ok).toBe(true)

    expect(nameWithSuffix('N'.repeat(200), ' (copy)')).toHaveLength(200)
    expect(nameWithSuffix('Plan', ' (copy)')).toBe('Plan (copy)')
    const copy = conflictCopy(makeProject('N'.repeat(200)), 'conflict, PC-2, 19 Oct 2026')
    expect(copy.name.length).toBeLessThanOrEqual(200)
    expect(copy.name.endsWith('(conflict, PC-2, 19 Oct 2026)')).toBe(true)
  })

  it('never cuts an emoji in half', () => {
    expect(clampText('ab😀cd', 4)).toBe('ab…')
  })
})
