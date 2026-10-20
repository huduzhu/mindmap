import { useEditor, type Section } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode, toggleDone } from '../store/treeOps'

/** Ctrl/Cmd+Enter: mark the selected task done or not done (#148a). */
export function isToggleDoneKey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): boolean {
  return (
    (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === 'Enter'
  )
}

/** Whether `id` can be a task: any node but a tree's root (the central topic). */
export function canBeTask(section: Section, id: string): boolean {
  const tree = useProjects.getState().current?.[section]
  return Boolean(tree && tree.id !== id && findNode(tree, id))
}

/**
 * Toggle a task's done state, or make another node a task (#148a). One undo
 * step; the editor announces the change.
 */
export function toggleTaskDone(section: Section, id: string): void {
  if (!canBeTask(section, id)) return
  useEditor.getState().applyTree(section, (tree) => toggleDone(tree, id))
}
