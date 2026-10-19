import { describe, expect, it } from 'vitest'
import { indentBracket } from './indentKeys'

const key = (init: Partial<Parameters<typeof indentBracket>[0]>) =>
  indentBracket({ key: '', ctrlKey: false, metaKey: false, ...init })

describe('indentBracket (#131)', () => {
  it('reads Ctrl or Cmd with ] and [', () => {
    expect(key({ key: ']', ctrlKey: true })).toBe('indent')
    expect(key({ key: '[', ctrlKey: true })).toBe('outdent')
    expect(key({ key: ']', metaKey: true })).toBe('indent')
  })

  it('falls back to the physical key on other layouts', () => {
    expect(key({ key: '+', code: 'BracketRight', ctrlKey: true })).toBe('indent')
    expect(key({ key: 'ü', code: 'BracketLeft', ctrlKey: true })).toBe('outdent')
  })

  it('ignores brackets typed without Ctrl or Cmd', () => {
    expect(key({ key: ']' })).toBeNull()
    expect(key({ key: 'a', ctrlKey: true })).toBeNull()
  })
})
