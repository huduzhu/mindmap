import { announce } from '../a11y/announcer'
import { quote } from '../a11y/describe'
import { t } from '../i18n'
import type { TreeNode } from '../schema/types'
import { focusSection, focusViewOf, useEditor, type FocusView } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode, removeNode } from '../store/treeOps'

/**
 * Focus on one branch (#146): a view shows the subtree under its focused node
 * as if it were the whole tree. Map, Outline and Brainstorm each keep their
 * own focus for the session (decision GC-D1).
 */

/** The focusable view the keyboard and the palette act on. */
export function activeFocusView(): FocusView {
  const { view, activeSection } = useEditor.getState()
  return focusViewOf(view, activeSection)
}

/** What `view` shows: its focused branch, or the whole tree. */
export function viewRootOf(tree: TreeNode, focusId: string | null): TreeNode {
  return (focusId && findNode(tree, focusId)?.node) || tree
}

/** The root `view` currently shows, or undefined with no project open. */
export function currentViewRoot(view: FocusView): TreeNode | undefined {
  const tree = useProjects.getState().current?.[focusSection(view)]
  return tree ? viewRootOf(tree, useEditor.getState().focus[view]) : undefined
}

function sayWhatShows(view: FocusView): void {
  const id = useEditor.getState().focus[view]
  const root = id ? currentViewRoot(view) : undefined
  announce(root ? t('announce.focused', { title: quote(root.title) }) : t('announce.unfocused'))
}

/** Show only the branch `id` in `view` and select it. */
export function focusOn(view: FocusView, id: string): void {
  const editor = useEditor.getState()
  editor.setFocus(view, id)
  editor.select(id)
  sayWhatShows(view)
}

/**
 * Focus `view` on `target` (null: the whole tree), keeping the node that was
 * focused selected so you can see where you were. Used by the breadcrumbs.
 */
export function focusBackTo(view: FocusView, target: string | null): void {
  const editor = useEditor.getState()
  const previous = editor.focus[view]
  editor.setFocus(view, target)
  if (previous) editor.select(previous)
  sayWhatShows(view)
}

/** Esc / Alt+←: go up one level. False when `view` is not focused. */
export function focusUp(view: FocusView): boolean {
  const editor = useEditor.getState()
  const id = editor.focus[view]
  const tree = useProjects.getState().current?.[focusSection(view)]
  if (!id || !tree) return false
  const parent = findNode(tree, id)?.parent ?? null
  focusBackTo(view, parent && parent.id !== tree.id ? parent.id : null)
  return true
}

/**
 * Delete in a focused view on the focused node itself: the branch is removed
 * (one undo step), focus is left and its parent is selected (#146).
 */
export function deleteFocusedBranch(view: FocusView, id: string): void {
  const section = focusSection(view)
  const tree = useProjects.getState().current?.[section]
  const parent = tree ? findNode(tree, id)?.parent : null
  if (!parent) return
  const editor = useEditor.getState()
  editor.applyTree(section, (current) => removeNode(current, id))
  editor.setFocus(view, null)
  editor.select(parent.id)
}

/**
 * Alt+→ focuses on the selected branch; Alt+← and Esc go up a level (#146).
 * Alt+← is also kept from the browser, where it would mean "Back" and leave
 * the app. Returns true when the key was handled.
 */
export function handleFocusKey(event: KeyboardEvent, view: FocusView): boolean {
  const editor = useEditor.getState()
  if (event.key === 'Escape') {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
    if (!focusUp(view)) return false
    event.preventDefault()
    return true
  }
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false
  event.preventDefault()
  if (event.key === 'ArrowLeft') {
    focusUp(view)
    return true
  }
  const selected = editor.selection
  const root = currentViewRoot(view)
  if (selected && root && selected !== root.id && findNode(root, selected)) focusOn(view, selected)
  return true
}
