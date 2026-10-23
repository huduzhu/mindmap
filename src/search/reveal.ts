import { activeTagFilter, tagFilterView } from '../map/tags'
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
  const inBranch = !branch || Boolean(findNode(branch, id))
  if (!inBranch) useEditor.getState().setFocus(focusView, null)
  // A node the tag filter's hide mode leaves out switches the filter to
  // highlight, so the node can be shown; the picked tags stay.
  const filter = activeTagFilter(useEditor.getState().tagFilter[focusView])
  if (filter?.hide) {
    const root = branch && inBranch ? branch : tree
    const editing = useEditor.getState().editing
    // The filter maths is in place whenever a filter is on; without it, play safe.
    const shown = tagFilterView()?.prune(root, filter, editing ? new Set([editing]) : undefined)
    if (!shown || !findNode(shown, id))
      useEditor.getState().setTagFilter(focusView, { ...filter, hide: false })
  }
  // Expanding ancestors is a view change, not an undo step (B2).
  useEditor.getState().applyView(section, (current) => expandTo(current, id))
  useEditor.getState().reveal(id)
}
