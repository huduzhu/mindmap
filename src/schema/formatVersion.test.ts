import { describe, expect, it } from 'vitest'
import { makeProject, makeTree } from '../test/fixtures'
import { declaredMinVersion, FORMAT_VERSION, isNewerFormat, withoutAppInfo } from './formatVersion'
import { validateDoc } from './validate'

const withUnknownField = () => {
  const project = makeProject('P', undefined, makeTree('m', 'Root'))
  return { ...project, map: { ...project.map, progressRing: true } }
}

describe('file-format guard (GE0a)', () => {
  it('treats a file whose only problems are unknown fields as made by a newer app', () => {
    const doc = withUnknownField()
    const result = validateDoc(doc)
    expect(result.ok).toBe(false)
    expect(isNewerFormat(doc, result.errors)).toBe(true)
  })

  it('does not call a broken file newer', () => {
    const doc = { ...makeProject('P'), name: '' }
    const result = validateDoc(doc)
    expect(isNewerFormat(doc, result.errors)).toBe(false)
  })

  it('reads the declared format version and accepts the app block', () => {
    const doc = { ...makeProject('P'), app: { minVersion: FORMAT_VERSION + 1 } }
    expect(validateDoc(doc).ok).toBe(true)
    expect(declaredMinVersion(doc)).toBe(FORMAT_VERSION + 1)
    expect(isNewerFormat(doc, [])).toBe(true)
    expect(withoutAppInfo(doc)).not.toHaveProperty('app')
    expect(declaredMinVersion({ app: { minVersion: 'x' } })).toBeNull()
  })
})
