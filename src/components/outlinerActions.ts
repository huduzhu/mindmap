import type { TreeNode } from '../schema/types'
import { useEditor, type Section } from '../store/editor'
import { useProjects } from '../store/projects'
import { flattenTree } from '../outliner/flatten'
import { findNode, indentNode, moveAmongSiblings, outdentNode, removeNode } from '../store/treeOps'
import type { OutlinerTouchAction } from './OutlinerTouchBar'
import { openNotes } from './detailsPanel'
import '../i18n/en/outliner'

/** Remove a row and select the one above it (keyboard Delete and the touch bar). */
export function removeRow(section: Section, tree: TreeNode, id: string) {
  const flat = flattenTree(tree)
  const index = flat.findIndex((r) => r.node.id === id)
  if (id === tree.id || index === -1) return
  const fallback = flat[index - 1]?.node.id ?? tree.id
  const editor = useEditor.getState()
  editor.applyTree(section, (t) => removeNode(t, id))
  editor.select(fallback)
}

/**
 * Tab / Shift+Tab inside a row's rename box (#132): indent or outdent the row
 * and keep renaming it, as Workflowy does. RenameInput has saved the text.
 * A child of `viewRootId` (a focused branch, #146) is not outdented out of it.
 */
export function moveWhileRenaming(
  section: Section,
  id: string,
  outdent: boolean,
  viewRootId?: string,
) {
  const editor = useEditor.getState()
  const tree = useProjects.getState().current?.[section]
  const leavesView = outdent && tree && findNode(tree, id)?.parent?.id === viewRootId
  if (!leavesView)
    editor.applyTree(section, (t) => (outdent ? outdentNode(t, id) : indentNode(t, id)))
  editor.select(id)
  editor.setEditing(id)
}

/**
 * The touch bar's buttons for one Brainstorm or Outline row (#95): the same
 * edits as Enter, Tab, Shift+Tab, Alt+↑/↓, F2 and Delete.
 */
export function rowActions(
  section: Section,
  tree: TreeNode,
  id: string,
  addAfter: (id: string) => void,
): OutlinerTouchAction[] {
  const located = findNode(tree, id)
  if (!located) return []
  const isRoot = id === tree.id
  const index = located.index
  const siblings = located.parent?.children?.length ?? 0
  const editor = () => useEditor.getState()
  const actions: OutlinerTouchAction[] = [
    {
      id: 'add',
      label: 'touch.addIdea',
      aria: 'touch.addIdeaLabel',
      icon: '+',
      onClick: () => addAfter(id),
    },
  ]
  if (isRoot) {
    actions.push({
      id: 'rename',
      label: 'touch.rename',
      aria: 'touch.renameLabel',
      icon: '✎',
      onClick: () => editor().setEditing(id),
    })
    return actions
  }
  actions.push(
    {
      id: 'indent',
      label: 'touch.indent',
      aria: 'touch.indentLabel',
      icon: '→',
      disabled: index === 0,
      onClick: () => editor().applyTree(section, (t) => indentNode(t, id)),
    },
    {
      id: 'outdent',
      label: 'touch.outdent',
      aria: 'touch.outdentLabel',
      icon: '←',
      disabled: located.parent?.id === tree.id,
      onClick: () => editor().applyTree(section, (t) => outdentNode(t, id)),
    },
    {
      id: 'up',
      label: 'touch.up',
      aria: 'touch.upLabel',
      icon: '↑',
      disabled: index === 0,
      onClick: () => editor().applyTree(section, (t) => moveAmongSiblings(t, id, -1)),
    },
    {
      id: 'down',
      label: 'touch.down',
      aria: 'touch.downLabel',
      icon: '↓',
      disabled: index >= siblings - 1,
      onClick: () => editor().applyTree(section, (t) => moveAmongSiblings(t, id, 1)),
    },
    {
      id: 'rename',
      label: 'touch.rename',
      aria: 'touch.renameLabel',
      icon: '✎',
      onClick: () => editor().setEditing(id),
    },
    {
      id: 'notes',
      label: 'touch.notes',
      aria: 'touch.notesLabel',
      icon: '¶',
      onClick: openNotes,
    },
    {
      id: 'delete',
      label: 'touch.delete',
      aria: 'touch.deleteLabel',
      icon: '🗑',
      onClick: () => removeRow(section, tree, id),
    },
  )
  return actions
}
