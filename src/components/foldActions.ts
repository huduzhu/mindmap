import { announce } from '../a11y/announcer'
import { t, tn } from '../i18n'
import { useEditor, type FocusView, type Section } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import {
  collapseAll,
  collapseBranch,
  countNodes,
  countVisible,
  expandAll,
  findNode,
  showLevels,
  toggleCollapse,
  visibleAncestor,
} from '../store/treeOps'
import type { TreeNode } from '../schema/types'
import type { OutlineRow } from '../outliner/flatten'
import { dialogOpen } from './dialogOpen'
import { currentViewRoot } from './focusActions'

/**
 * Folding commands shared by the map, Outline and Brainstorm (#145). The map
 * and Outline show the same tree, so they share its `collapsed` flags;
 * Brainstorm folds its own tree.
 */
export type FoldCommand =
  { kind: 'expand' } | { kind: 'collapse' } | { kind: 'levels'; levels: number }

/** The tree the keyboard and the palette act on in the current view. */
export function activeSection(): Section {
  const { view, activeSection } = useEditor.getState()
  return view === 'brainstorm' || (view === 'split' && activeSection === 'brainstorm')
    ? 'brainstorm'
    : 'map'
}

function sectionTree(section: Section): TreeNode | undefined {
  return useProjects.getState().current?.[section]
}

/** Whether `view` shows node `id`: inside its focused branch and not folded away. */
export function isShown(view: FocusView, id: string): boolean {
  const root = currentViewRoot(view)
  return Boolean(root && visibleAncestor(root, id) === id)
}

/**
 * Drop the selected nodes `keep` rejects (#199), so Delete, Cut and Copy never
 * act on nodes the view no longer shows. The primary selection stays unless
 * it is dropped too.
 */
export function pruneSelection(keep: (id: string) => boolean): void {
  const { selection, selectionSet } = useEditor.getState()
  const kept = [...selectionSet].filter(keep)
  const primaryKept = !selection || keep(selection)
  if (kept.length === selectionSet.size && primaryKept) return
  const primary = primaryKept ? selection : (kept[0] ?? null)
  useEditor.setState({
    selection: primary,
    selectionSet: new Set(primary ? [primary, ...kept] : kept),
  })
}

/**
 * After a fold, a selection inside a folded branch moves to that branch
 * (#145), and the other selected nodes it hides leave the selection (#199).
 */
function keepSelectionVisible(section: Section, rootId: string): void {
  const editor = useEditor.getState()
  const tree = sectionTree(section)
  const selected = editor.selection
  if (!tree) return
  const root = findNode(tree, rootId)?.node ?? tree
  const shown = selected ? visibleAncestor(root, selected) : null
  if (selected && shown && shown !== selected) {
    const others = [...editor.selectionSet].filter((id) => id !== selected)
    useEditor.setState({ selection: shown, selectionSet: new Set([shown, ...others]) })
  }
  pruneSelection((id) => {
    const visible = visibleAncestor(root, id)
    return visible === null || visible === id
  })
}

/**
 * Expand all, collapse all or show N levels under `rootId` (the whole tree by
 * default) as one undo step, then say what is showing: "Showing 2 levels, 37
 * of 120 topics".
 */
export function foldView(
  command: FoldCommand,
  section: Section = activeSection(),
  rootId?: string,
) {
  const tree = sectionTree(section)
  if (!tree) return
  const from = rootId && findNode(tree, rootId) ? rootId : tree.id
  useEditor.getState().applyTree(section, (current) => {
    if (command.kind === 'expand') return expandAll(current, from)
    if (command.kind === 'collapse') return collapseAll(current, from)
    return showLevels(current, command.levels, from)
  })
  keepSelectionVisible(section, from)
  const after = sectionTree(section)
  const root = after ? findNode(after, from)?.node : undefined
  if (!root) return
  const total = countNodes(root)
  if (command.kind === 'expand') {
    announce(t('announce.showingAll', { total }))
    return
  }
  const levels = command.kind === 'collapse' ? 1 : command.levels
  announce(tn('announce.showingLevels', levels, { visible: countVisible(root), total }))
}

/** Fold or unfold one node: a view change, not an undo step (owner decision B2). */
export function toggleFold(section: Section, id: string, rootId?: string): void {
  useEditor.getState().applyView(section, (tree) => toggleCollapse(tree, id))
  keepSelectionVisible(section, rootId ?? sectionTree(section)?.id ?? id)
}

/** Node menu "Expand whole branch" / "Collapse whole branch" (#145): one undo step. */
export function foldBranch(section: Section, id: string, expand: boolean, rootId?: string): void {
  useEditor
    .getState()
    .applyTree(section, (tree) => (expand ? expandAll(tree, id) : collapseBranch(tree, id)))
  keepSelectionVisible(section, rootId ?? sectionTree(section)?.id ?? id)
}

const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]'

/**
 * Alt+. expands all, Alt+, collapses all, Alt+1…3 show that many levels
 * (#145, decision GB-D2). `code` is checked because a Mac's Option key changes
 * the character typed. Returns true when the key was handled.
 */
export function handleFoldKey(event: KeyboardEvent, section: Section, rootId?: string): boolean {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  if (dialogOpen()) return false
  // Unlike the other shortcuts these also work with a button focused (a tab,
  // the toolbar), but never while typing.
  const target = event.target
  if (target instanceof Element && target.closest(TEXT_ENTRY)) return false
  if (useEditor.getState().editing) return false
  let command: FoldCommand | null = null
  if (event.code === 'Period' || event.key === '.') command = { kind: 'expand' }
  else if (event.code === 'Comma' || event.key === ',') command = { kind: 'collapse' }
  else {
    const digit = /^Digit([1-3])$/.exec(event.code)?.[1] ?? /^[1-3]$/.exec(event.key)?.[0]
    if (digit) command = { kind: 'levels', levels: Number(digit) }
  }
  if (!command) return false
  event.preventDefault()
  foldView(command, section, rootId)
  return true
}

/**
 * Space, → and ← on an Outline or Brainstorm row (#145), as in a tree view:
 * Space folds or unfolds (on a row with a picture and no children, or with
 * Shift, it opens the picture, #149); → unfolds a folded row or steps to its first child;
 * ← folds an unfolded row or steps to its parent. Returns true when handled.
 */
export function handleRowFoldKey(
  event: KeyboardEvent,
  rows: readonly OutlineRow[],
  selected: string | null,
  section: Section,
  rootId?: string,
): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false
  if (event.key !== ' ' && event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false
  const index = selected ? rows.findIndex((row) => row.node.id === selected) : -1
  // findIndex gives -1 (no row) or the selected row's index.
  const row = rows[index]
  if (!row) return false
  event.preventDefault()
  const hasChildren = (row.node.children?.length ?? 0) > 0
  const folded = hasChildren && Boolean(row.node.collapsed)
  const editor = useEditor.getState()
  if (event.key === ' ') {
    // A row with a picture and no children (or Shift+Space) opens it (#149).
    if (row.node.image && (event.shiftKey || !hasChildren))
      useUi.getState().setImageViewer({ section, id: row.node.id })
    else if (hasChildren) toggleFold(section, row.node.id, rootId)
  } else if (event.key === 'ArrowRight') {
    if (folded) toggleFold(section, row.node.id, rootId)
    else {
      const below = rows[index + 1]
      if (hasChildren && below) editor.select(below.node.id)
    }
  } else if (hasChildren && !folded) {
    toggleFold(section, row.node.id, rootId)
  } else if (row.parentId && rows.some((candidate) => candidate.node.id === row.parentId)) {
    editor.select(row.parentId)
  }
  return true
}
