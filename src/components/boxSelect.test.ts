import { act, renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { nodesInBox, useBoxSelect } from './boxSelect'

describe('nodesInBox (#105)', () => {
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 30 },
    { id: 'b', position: { x: 200, y: 0 }, width: 100, height: 30 },
    { id: 'c', position: { x: 0, y: 100 }, width: 100, height: 30 },
  ]

  it('selects every node the box touches, whichever way it was drawn', () => {
    expect(nodesInBox(nodes, { x: 50, y: 10 }, { x: 250, y: 20 })).toEqual(['a', 'b'])
    expect(nodesInBox(nodes, { x: 250, y: 20 }, { x: 50, y: 10 })).toEqual(['a', 'b'])
    expect(nodesInBox(nodes, { x: -10, y: -10 }, { x: 400, y: 200 })).toEqual(['a', 'b', 'c'])
  })

  it('selects nothing in empty space', () => {
    expect(nodesInBox(nodes, { x: 120, y: 50 }, { x: 180, y: 90 })).toEqual([])
  })
})

describe('box select drag (#105)', () => {
  const nodes = [{ id: 'a', position: { x: 0, y: 0 }, width: 100, height: 30 }]

  beforeEach(() => {
    useEditor.getState().reset()
    document.body.innerHTML = '<div id="wrap"><div class="react-flow__pane"></div></div>'
  })

  const setup = () =>
    renderHook(() =>
      useBoxSelect({
        wrapperRef: { current: document.getElementById('wrap') },
        nodesRef: { current: nodes },
        toFlow: (point) => point,
      }),
    )

  const start = (hook: ReturnType<typeof setup>) =>
    act(() =>
      hook.result.current.onPointerDownCapture({
        shiftKey: true,
        button: 0,
        target: document.querySelector('.react-flow__pane'),
        clientX: -10,
        clientY: -10,
        stopPropagation: () => undefined,
        preventDefault: () => undefined,
      } as unknown as ReactPointerEvent),
    )

  const release = () =>
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 200 }))
    })

  it('selects the nodes the box covers on release', () => {
    const hook = setup()
    start(hook)
    expect(hook.result.current.box).not.toBeNull()
    release()
    expect(hook.result.current.box).toBeNull()
    expect(useEditor.getState().selection).toBe('a')
  })

  it.each(['pointercancel', 'blur'])('%s ends the box without selecting', (type) => {
    const hook = setup()
    start(hook)
    act(() => {
      window.dispatchEvent(new Event(type))
    })
    expect(hook.result.current.box).toBeNull()
    release()
    expect(useEditor.getState().selection).toBeNull()
  })

  it('unmounting mid-drag removes the window listeners', () => {
    const hook = setup()
    start(hook)
    hook.unmount()
    release()
    expect(useEditor.getState().selection).toBeNull()
  })
})
