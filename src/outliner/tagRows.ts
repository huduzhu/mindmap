import { useMemo } from 'react'
import { activeTagFilter, type TagFilter, type TagFilterResult } from '../map/tags'
import { applyTagFilter, pruneToTags } from '../map/tagFilter'
import type { TreeNode } from '../schema/types'
import { useEditor, type FocusView } from '../store/editor'

/** What a view lists under the tag filter's hide mode (#150): matches and their path. */
export function tagShownRoot(
  root: TreeNode,
  filter: TagFilter | null,
  editing: string | null,
): TreeNode {
  return filter?.hide ? pruneToTags(root, filter, editing ? new Set([editing]) : undefined) : root
}

/** The same, from the store: for key handlers that read state outside render. */
export function currentTagShownRoot(view: FocusView, root: TreeNode): TreeNode {
  const editor = useEditor.getState()
  return tagShownRoot(root, activeTagFilter(editor.tagFilter[view]), editor.editing)
}

/**
 * The tag filter of an Outline or Brainstorm view (#150): the tree to list
 * (reduced in hide mode) and the filter result for dimming rows and the
 * "+2 tagged" on folded rows.
 */
export function useTagRows(
  view: FocusView,
  root: TreeNode | undefined,
  editing: string | null,
): { shown: TreeNode | undefined; result: TagFilterResult | null; highlight: boolean } {
  const filter = useEditor((s) => activeTagFilter(s.tagFilter[view]))
  const keep = filter?.hide ? editing : null
  const shown = useMemo(
    () => (root ? tagShownRoot(root, filter, keep) : root),
    [root, filter, keep],
  )
  const result = useMemo(
    () => (root && filter ? applyTagFilter(root, filter) : null),
    [root, filter],
  )
  return { shown, result, highlight: Boolean(filter && !filter.hide) }
}

/** The dimming class of a row in highlight mode. */
export function tagRowClass(
  result: TagFilterResult | null,
  highlight: boolean,
  id: string,
): string {
  if (!result || !highlight) return ''
  const state = result.states.get(id)
  return state === 'dim' ? ' tag-dim' : state === 'path' ? ' tag-path' : ''
}
