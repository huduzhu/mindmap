import { describe, expect, it } from 'vitest'
import { makeProject } from '../test/fixtures'
import { fileNameFor, idFromFileName, projectHash, safeFileStem } from './names'

describe('sync file names (#108, plan §0a-2)', () => {
  it('replaces characters Windows forbids and trims the end', () => {
    expect(safeFileStem('Q1/Q2 Planning: What? <draft>*')).toBe('Q1-Q2 Planning- What- -draft--')
    expect(safeFileStem('Ends with dots...  ')).toBe('Ends with dots')
    expect(safeFileStem('tab\there')).toBe('tab-here')
  })

  it('avoids reserved device names and empty names', () => {
    expect(safeFileStem('CON')).toBe('Untitled')
    expect(safeFileStem('com1.txt')).toBe('Untitled')
    expect(safeFileStem('   ')).toBe('Untitled')
    expect(safeFileStem('Console')).toBe('Console')
  })

  it('keeps Chinese names and caps the length', () => {
    expect(safeFileStem('厨房 改造 计划')).toBe('厨房 改造 计划')
    expect(Array.from(safeFileStem('长'.repeat(300)))).toHaveLength(120)
  })

  it('puts the id in brackets before the extension', () => {
    expect(fileNameFor('Roadmap', 'V1StGXR8_Z')).toBe('Roadmap (V1StGXR8_Z).mindmap.json')
  })

  it('finds the id in every shape OneDrive and Windows give a copy (§0a-6)', () => {
    for (const name of [
      'Roadmap (V1StGXR8_Z).mindmap.json',
      'Roadmap (V1StGXR8_Z).mindmap-DESKTOP-ABC.json',
      'Roadmap (V1StGXR8_Z).mindmap - Copy.json',
      'Roadmap (V1StGXR8_Z)-LAPTOP.mindmap.json',
      'Q (1) plan (V1StGXR8_Z).mindmap.json',
    ]) {
      expect(idFromFileName(name)).toBe('V1StGXR8_Z')
    }
    expect(idFromFileName('notes.txt')).toBeNull()
    expect(idFromFileName('Roadmap.json')).toBeNull()
    expect(idFromFileName('~$Roadmap (V1StGXR8_Z).mindmap.json')).toBeNull()
  })
})

describe('projectHash', () => {
  it('ignores the save time and key order', () => {
    const project = makeProject('Same')
    const reordered = Object.fromEntries(Object.entries(project).reverse()) as typeof project
    expect(projectHash({ ...project, updatedAt: '2020-01-01' })).toBe(
      projectHash({ ...reordered, updatedAt: '2030-01-01' }),
    )
    expect(projectHash({ ...project, name: 'Different' })).not.toBe(projectHash(project))
  })
})
