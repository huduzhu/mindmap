/**
 * Ctrl+] indents and Ctrl+[ outdents (Cmd on a Mac) in the map, Brainstorm and
 * Outline (#131). Windows reserves Alt+Tab for switching windows, so the map's
 * old Alt+Tab binding never reached the app there.
 *
 * `key` is checked first; `code` covers layouts where the bracket keys type
 * something else with Ctrl held.
 */
export function indentBracket(event: {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
}): 'indent' | 'outdent' | null {
  if (!event.ctrlKey && !event.metaKey) return null
  if (event.key === ']') return 'indent'
  if (event.key === '[') return 'outdent'
  if (event.code === 'BracketRight') return 'indent'
  if (event.code === 'BracketLeft') return 'outdent'
  return null
}
