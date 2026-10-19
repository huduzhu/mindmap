import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { putPreset } from '../io/db'
import { BUILT_IN_PRESETS } from '../io/seed'
import { resetDatabase } from '../test/resetDb'
import { makePreset } from '../test/fixtures'
import { useResolvedPreset } from './usePreset'

beforeEach(async () => {
  await resetDatabase()
})

describe('useResolvedPreset', () => {
  it('returns a built-in synchronously on first render, no IDB lookup', () => {
    const { result } = renderHook(() => useResolvedPreset('corporate'))
    expect(result.current.name).toBe('corporate')
    // The bundled corporate preset must come back identity-equal to the import.
    expect(result.current).toBe(BUILT_IN_PRESETS.find((p) => p.name === 'corporate'))
  })

  it('returns the right built-in even when it is not the first one', () => {
    const { result } = renderHook(() => useResolvedPreset('handdrawn'))
    expect(result.current.name).toBe('handdrawn')
    expect(result.current).toBe(BUILT_IN_PRESETS.find((p) => p.name === 'handdrawn'))
  })

  it('does not flash the default preset while resolving a non-default built-in', () => {
    const { result } = renderHook(() => useResolvedPreset('dark'))
    // The very first render must already be the requested preset, not BUILT_IN_PRESETS[0].
    expect(result.current.name).not.toBe(BUILT_IN_PRESETS[0].name)
    expect(result.current.name).toBe('dark')
  })

  it('resolves a custom preset from IDB asynchronously', async () => {
    const custom = { ...makePreset('my-style'), font: { ...makePreset().font, baseSize: 18 } }
    await putPreset(custom)

    const { result } = renderHook(() => useResolvedPreset('my-style'))
    // First render falls back to the first built-in; effect populates the stored preset.
    expect(result.current.name).toBe('default')
    await waitFor(() => expect(result.current.name).toBe('my-style'))
    expect(result.current.font.baseSize).toBe(18)
  })

  it('a later mount renders an already-resolved custom preset on its first frame (#65)', async () => {
    const custom = { ...makePreset('cached-style'), font: { ...makePreset().font, baseSize: 21 } }
    await putPreset(custom)
    const first = renderHook(() => useResolvedPreset('cached-style'))
    await waitFor(() => expect(first.result.current.name).toBe('cached-style'))
    first.unmount()

    const second = renderHook(() => useResolvedPreset('cached-style'))
    expect(second.result.current.name).toBe('cached-style')
  })

  it('returns the inline preset for object refs', () => {
    const inline = { ...makePreset('inline'), font: { ...makePreset().font, baseSize: 24 } }
    const { result } = renderHook(() => useResolvedPreset({ inline }))
    expect(result.current.name).toBe('inline')
    expect(result.current.font.baseSize).toBe(24)
  })
})
