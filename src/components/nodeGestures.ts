import { createContext, useContext, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Touch gestures on map nodes (#91): long-press opens the node menu,
 * double-tap renames. Mouse input is untouched (it has right-click and
 * dblclick). The canvas provides what the gestures do.
 */
export interface NodeGestureActions {
  openMenu: (id: string, x: number, y: number) => void
  rename: (id: string) => void
}

export const NodeGestureContext = createContext<NodeGestureActions | null>(null)

export const LONG_PRESS_MS = 500
export const DOUBLE_TAP_MS = 350
/** A finger that moves further than this is panning or dragging, not pressing. */
const SLOP_PX = 10

export function useNodeTouchGestures(id: string, enabled: boolean) {
  const actions = useContext(NodeGestureContext)
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const lastTap = useRef(0)
  const longPressed = useRef(false)

  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }

  // A node removed mid-press (deleted, folded away) must not open its menu later.
  useEffect(() => {
    const pending = press
    return () => {
      if (pending.current) clearTimeout(pending.current.timer)
    }
  }, [])

  if (!actions || !enabled) return {}

  return {
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType !== 'touch') return
      cancel()
      longPressed.current = false
      const { clientX: x, clientY: y } = event
      press.current = {
        x,
        y,
        timer: setTimeout(() => {
          press.current = null
          longPressed.current = true
          actions.openMenu(id, x, y)
        }, LONG_PRESS_MS),
      }
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const start = press.current
      if (!start || event.pointerType !== 'touch') return
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX) cancel()
    },
    onPointerCancel: cancel,
    onPointerUp: (event: ReactPointerEvent) => {
      if (event.pointerType !== 'touch') return
      const wasPressing = press.current !== null
      cancel()
      if (!wasPressing || longPressed.current) return
      const now = event.timeStamp || Date.now()
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0
        actions.rename(id)
      } else {
        lastTap.current = now
      }
    },
    // Android also fires contextmenu on long-press; the gesture already handled it.
    onContextMenu: (event: { pointerType?: string; preventDefault: () => void }) => {
      if (longPressed.current) event.preventDefault()
    },
  }
}
