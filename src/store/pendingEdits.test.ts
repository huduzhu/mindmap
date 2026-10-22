import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  hasPendingEdits,
  notifyPendingEdits,
  registerPendingEdit,
  useHasPendingEdits,
} from './pendingEdits'

describe('pending edits (#92)', () => {
  it('reports a dirty edit, and the hook follows it as it changes', () => {
    let dirty = false
    const { result } = renderHook(() => useHasPendingEdits())
    let unregister = () => {}
    act(() => {
      unregister = registerPendingEdit({ isDirty: () => dirty, flush: () => (dirty = false) })
    })
    expect(result.current).toBe(false)

    act(() => {
      dirty = true
      notifyPendingEdits()
    })
    expect(hasPendingEdits()).toBe(true)
    expect(result.current).toBe(true)

    act(() => unregister())
    expect(hasPendingEdits()).toBe(false)
    expect(result.current).toBe(false)
  })
})
