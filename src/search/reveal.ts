import { focusSection, focusViewOf, useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { expandTo, findNode } from '../store/treeOps'

export function revealNode(id: string) {
  const { view, activeSection, focus } = useEditor.getState()
  const focusView = focusViewOf(view, activeSection)
  const section = focusSection(focusView)
  const tree = useProjects.getState().current?.[section]
  if (!tree) return
  // A node outside the branch the view is focused on leaves focus (#146).
  const focusId = focus[focusView]
  const branch = focusId ? findNode(tree, focusId)?.node : undefined
  if (branch && !findNode(branch, id)) useEditor.getState().setFocus(focusView, null)
  // Expanding ancestors is a view change, not an undo step (B2).
  useEditor.getState().applyView(section, (current) => expandTo(current, id))
  useEditor.getState().reveal(id)
}
