import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { isTextEntry } from './detailsPanel'

/**
 * Starting and stopping presentation mode (#152). The presentation itself is
 * a lazy chunk (src/components/PresentOverlay.tsx); this stays small because
 * F5 and the toolbar button need it up front.
 */

let endedAt = 0
let heldKeys: ((event: KeyboardEvent) => void) | null = null

/**
 * Until the presentation's chunk has loaded and taken over the keyboard, keys
 * must not reach the map underneath, where an arrow would move the selection
 * and Space would fold a branch.
 */
function holdKeys(): void {
  releaseKeys()
  heldKeys = (event) => {
    event.stopImmediatePropagation()
    event.preventDefault()
    if (event.key === 'Escape') stopPresentation()
  }
  window.addEventListener('keydown', heldKeys, true)
}

/** The presentation is on screen and handles the keys itself. */
export function releaseKeys(): void {
  if (heldKeys) window.removeEventListener('keydown', heldKeys, true)
  heldKeys = null
}

/** Present the map from the central topic, or from the selected node ("Present from here"). */
export function startPresentation(fromHere = false): boolean {
  if (!useProjects.getState().current || useUi.getState().presenting) return false
  const editor = useEditor.getState()
  const from = fromHere && editor.activeSection === 'map' ? editor.selection : null
  holdKeys()
  useUi.getState().setPresenting({ from })
  return true
}

export function stopPresentation(): void {
  releaseKeys()
  endedAt = Date.now()
  useUi.getState().setPresenting(null)
}

/**
 * True while presenting and just after: going full screen resizes the
 * window, and the map underneath must not refit or pan for it, so leaving
 * finds the view exactly as it was (HA1).
 */
export function presentationResizing(): boolean {
  return useUi.getState().presenting !== null || Date.now() - endedAt < 1500
}

/** F5 presents from the start, Shift+F5 from the selected node; not in text fields. */
export function handlePresentKey(event: KeyboardEvent): boolean {
  if (event.key !== 'F5' || event.ctrlKey || event.metaKey || event.altKey) return false
  if (isTextEntry(event.target) || !useProjects.getState().current) return false
  // The browser would reload the page instead.
  event.preventDefault()
  if (!event.repeat) startPresentation(event.shiftKey)
  return true
}
