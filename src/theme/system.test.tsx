import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useResolvedPreset } from '../hooks/usePreset'
import { isDarkColor } from '../hooks/useTheme'
import { prefersDark, systemPresetName, useSystemDark } from './system'

type Listener = () => void
const original = globalThis.matchMedia

function mockScheme(initialDark: boolean) {
  let dark = initialDark
  const listeners = new Set<Listener>()
  globalThis.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('dark') ? dark : false
    },
    media: query,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  })) as unknown as typeof matchMedia
  return {
    set(next: boolean) {
      dark = next
      listeners.forEach((listener) => listener())
    },
  }
}

afterEach(() => {
  globalThis.matchMedia = original
})

describe('system colour scheme (#86)', () => {
  it('maps the device setting to a built-in preset', () => {
    expect(systemPresetName(true)).toBe('dark')
    expect(systemPresetName(false)).toBe('default')
    mockScheme(true)
    expect(prefersDark()).toBe(true)
  })

  it('"system" resolves to dark or default and follows changes live', () => {
    const scheme = mockScheme(false)
    const { result } = renderHook(() => ({
      dark: useSystemDark(),
      preset: useResolvedPreset('system'),
    }))
    expect(result.current.dark).toBe(false)
    expect(result.current.preset.name).toBe('default')
    act(() => scheme.set(true))
    expect(result.current.dark).toBe(true)
    expect(result.current.preset.name).toBe('dark')
  })

  it('other presets ignore the device setting', () => {
    mockScheme(true)
    const { result } = renderHook(() => useResolvedPreset('corporate'))
    expect(result.current.name).toBe('corporate')
  })

  it('tells dark backgrounds from light ones', () => {
    expect(isDarkColor('#1e1e2e')).toBe(true)
    expect(isDarkColor('#ffffff')).toBe(false)
    expect(isDarkColor('not a colour')).toBe(false)
  })
})
