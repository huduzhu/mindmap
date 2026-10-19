import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * A key pressed while an input method (Chinese pinyin, Japanese, Korean…) is
 * still composing (#167). Enter then accepts the candidate and Esc cancels
 * it; neither may commit, cancel or close what the user is typing into.
 */
export function isComposing(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event
  return native.isComposing || native.keyCode === 229
}
