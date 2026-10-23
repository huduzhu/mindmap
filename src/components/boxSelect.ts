import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { useEditor } from '../store/editor'

export interface ScreenBox {
  left: number
  top: number
  width: number
  height: number
}

interface Placed {
  id: string
  position: { x: number; y: number }
  width?: number
  height?: number
}

function startsBox(event: PointerEvent | MouseEvent): boolean {
  if (!event.shiftKey || event.button !== 0) return false
  const target = event.target as HTMLElement | null
  return Boolean(target?.closest('.react-flow__pane') && !target.closest('.react-flow__node'))
}

/** Below this many pixels a Shift+drag is a Shift+click, not a box. */
const MIN_DRAG_PX = 4

/** Ids of the nodes (in flow coordinates) that overlap the box, in layout order. */
export function nodesInBox(
  nodes: Placed[],
  a: { x: number; y: number },
  b: { x: number; y: number },
): string[] {
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const bottom = Math.max(a.y, b.y)
  return nodes
    .filter((node) => {
      const x = node.position.x
      const y = node.position.y
      return x < right && x + (node.width ?? 0) > left && y < bottom && y + (node.height ?? 0) > top
    })
    .map((node) => node.id)
}

/**
 * Shift+drag on empty canvas draws a selection box (#105); plain drag still
 * pans. The nodes it touches become the selection, ready for Delete, Copy and
 * Cut.
 */
export function useBoxSelect(options: {
  wrapperRef: RefObject<HTMLElement | null>
  nodesRef: RefObject<Placed[]>
  toFlow: (point: { x: number; y: number }) => { x: number; y: number }
}) {
  const { wrapperRef, nodesRef, toFlow } = options
  const [box, setBox] = useState<ScreenBox | null>(null)
  /** Swallows the pane click that follows the drag, which would select the root. */
  const justSelectedRef = useRef(false)
  /** Removes the window listeners of the box being drawn, if any. */
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const stop = stopRef
    return () => stop.current?.()
  }, [])

  const onMouseDownCapture = useCallback((event: MouseEvent) => {
    // React Flow pans on mousedown; a box drag must not pan.
    if (startsBox(event)) event.stopPropagation()
  }, [])

  const onPointerDownCapture = useCallback(
    (event: PointerEvent) => {
      if (!startsBox(event)) return
      event.stopPropagation()
      event.preventDefault()
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const origin = wrapper.getBoundingClientRect()
      const start = { x: event.clientX, y: event.clientY }
      const draw = (x: number, y: number) =>
        setBox({
          left: Math.min(start.x, x) - origin.left,
          top: Math.min(start.y, y) - origin.top,
          width: Math.abs(x - start.x),
          height: Math.abs(y - start.y),
        })
      const onMove = (moveEvent: globalThis.PointerEvent) =>
        draw(moveEvent.clientX, moveEvent.clientY)
      // A cancelled pointer or a window losing focus (Alt+Tab mid-drag) never
      // sends pointerup: drop the box instead of leaving it stuck to the cursor.
      const onCancel = () => {
        stop()
        setBox(null)
      }
      const onUp = (upEvent: globalThis.PointerEvent) => {
        stop()
        setBox(null)
        const end = { x: upEvent.clientX, y: upEvent.clientY }
        if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_DRAG_PX) return
        const ids = nodesInBox(nodesRef.current ?? [], toFlow(start), toFlow(end))
        justSelectedRef.current = true
        setTimeout(() => {
          justSelectedRef.current = false
        }, 0)
        if (ids.length === 0) return
        const editor = useEditor.getState()
        editor.select(ids[0])
        for (const id of ids.slice(1)) editor.select(id, true)
      }
      const stop = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('blur', onCancel)
        if (stopRef.current === stop) stopRef.current = null
      }
      stopRef.current?.()
      stopRef.current = stop
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('blur', onCancel)
      draw(start.x, start.y)
    },
    [wrapperRef, nodesRef, toFlow],
  )

  return { box, onPointerDownCapture, onMouseDownCapture, justSelectedRef }
}
