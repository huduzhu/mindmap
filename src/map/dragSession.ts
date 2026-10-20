/**
 * Which node drag the map has seen begin (#196). React Flow can end a drag
 * without its stop callback (a second finger aborts it) and then leave its own
 * "drag started" flag set, so the next gesture on that node calls only the
 * stop callback. A drop is applied only for a drag that began and was not
 * abandoned.
 */
export interface DragSession {
  /** onNodeDragStart for `id`. */
  begin: (id: string) => void
  /**
   * React Flow reported the node no longer dragging. A normal drop calls
   * `stop` straight after, in the same task; when nothing does, the drag was
   * abandoned: forget it and call `onAbandon`.
   */
  ended: () => void
  /** onNodeDragStop: whether a drag of `id` began, so the drop may apply. */
  stop: (id: string) => boolean
  /** Set or change the abandon callback (#196). */
  setOnAbandon?: (onAbandon: () => void) => void
}

export function createDragSession(onAbandon?: () => void): DragSession {
  let began: string | null = null
  let generation = 0
  let abandonCb = onAbandon
  return {
    begin: (id) => {
      began = id
      generation += 1
    },
    ended: () => {
      const at = generation
      queueMicrotask(() => {
        if (generation !== at || began === null) return
        began = null
        abandonCb?.()
      })
    },
    stop: (id) => {
      const ok = began === id
      began = null
      generation += 1
      return ok
    },
    setOnAbandon: (cb) => {
      abandonCb = cb
    },
  }
}
