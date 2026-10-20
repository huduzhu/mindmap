import { create } from 'zustand'

/**
 * One polite live region for the whole app (#85). `announce` is debounced:
 * a burst of edits (typing a title, holding an arrow key, a multi-step
 * command) is read once, as its last message, instead of queueing a backlog.
 */
export const ANNOUNCE_DELAY_MS = 250

interface AnnouncerState {
  message: string
  /** Flips so that the same text twice in a row is still re-read. */
  toggle: boolean
}

export const useAnnouncer = create<AnnouncerState>()(() => ({ message: '', toggle: false }))

let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Queue `message`. By default it replaces anything still pending; with
 * `append` (used for "where am I" selection messages) it follows the pending
 * edit message instead, so "Deleted “X”" is not lost to the selection moving.
 */
export function announce(
  message: string | null | undefined,
  options: { append?: boolean } = {},
): void {
  if (!message) return
  pending = options.append && pending ? `${pending}. ${message}` : message
  if (timer) clearTimeout(timer)
  timer = setTimeout(flushAnnouncement, ANNOUNCE_DELAY_MS)
}

/** Publish the pending message now (tests, and before navigation). */
export function flushAnnouncement(): void {
  if (timer) clearTimeout(timer)
  timer = null
  if (pending === null) return
  const message = pending
  pending = null
  useAnnouncer.setState((state) => ({ message, toggle: !state.toggle }))
}

export function resetAnnouncer(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pending = null
  useAnnouncer.setState({ message: '', toggle: false })
}
