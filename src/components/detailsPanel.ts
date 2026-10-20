import { announce } from '../a11y/announcer'
import { t } from '../i18n'
import { useEditor } from '../store/editor'
import { useUi } from '../store/ui'

/** Show or hide the details panel (toolbar toggle, palette, Ctrl/Cmd+I — #144). */
export function toggleDetailsPanel(): void {
  const ui = useUi.getState()
  const next = ui.detailsPanel === 'shown' ? 'hidden' : 'shown'
  const focusWasInside = Boolean(document.activeElement?.closest('.node-details'))
  ui.setDetailsPanel(next)
  announce(next === 'shown' ? t('announce.detailsShown') : t('announce.detailsHidden'))
  // Hiding the panel removes what had focus; keep the keyboard in the view.
  if (next === 'hidden' && focusWasInside) focusView()
}

/** Hide the panel without touching the selection, so Tab and Enter keep working (#144). */
export function hideDetailsPanel(): void {
  if (useUi.getState().detailsPanel === 'hidden') return
  toggleDetailsPanel()
}

/**
 * Open the notes of the selected node: shows the panel when it is hidden and
 * focuses its notes box (✎, "Add notes", the node menu's "Notes…", #144).
 */
export function openNotes(): void {
  useUi.getState().setDetailsPanel('shown')
  useEditor.getState().setFocusNotes(true)
}

/** Move focus to the keyboard surface of the current view (map canvas or outliner). */
export function focusView(): void {
  const editor = useEditor.getState()
  const scope =
    editor.view === 'split'
      ? document.querySelector(
          editor.activeSection === 'brainstorm'
            ? '[data-testid="split-brainstorm-pane"]'
            : '[data-testid="split-outline-pane"]',
        )
      : document.getElementById('tab-panel')
  scope?.querySelector<HTMLElement>('.canvas-wrap, .outliner')?.focus()
}

/** True for keys typed into a text field, where app shortcuts must not take over. */
export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(
    el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]'),
  )
}
