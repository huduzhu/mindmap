import { renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { LONG_PRESS_MS, NodeGestureContext, useNodeTouchGestures } from './nodeGestures'

const touch = (x = 10, y = 10) =>
  ({ pointerType: 'touch', clientX: x, clientY: y, timeStamp: 1 }) as unknown as ReactPointerEvent

describe('node touch gestures (#91)', () => {
  it('a node removed mid-press does not open its menu afterwards', async () => {
    const opened: string[] = []
    const actions = { openMenu: (id: string) => opened.push(id), rename: () => undefined }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NodeGestureContext.Provider value={actions}>{children}</NodeGestureContext.Provider>
    )
    const pressed = renderHook(() => useNodeTouchGestures('a', true), { wrapper })
    pressed.result.current.onPointerDown?.(touch())
    pressed.unmount()

    // A node that stays does open it, so the wait below is long enough.
    const kept = renderHook(() => useNodeTouchGestures('b', true), { wrapper })
    kept.result.current.onPointerDown?.(touch())
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 100))
    expect(opened).toEqual(['b'])
    kept.unmount()
  })
})
