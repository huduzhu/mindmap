/**
 * Geometry caching for the MindMap canvas (#140).
 *
 * Keeps the previous layout across tree edits so unchanged nodes and edges
 * keep their object identities for React Flow. Separated from the component
 * so the caching does not mutate refs or component globals during render.
 */
import type { NodeLink, Preset, TreeNode } from '../schema/types'
import { layoutGeometry, type MapLayout } from '../map/layout'

interface CachedLayout {
  projectId: string | null
  layout: MapLayout
  version: number
}

let cached: CachedLayout | undefined

export function getCachedLayout(
  projectId: string | null,
  map: TreeNode | undefined,
  preset: Preset,
  links: NodeLink[] | undefined,
  version: number,
): MapLayout {
  if (!map) return { nodes: [], edges: [] }
  const previous =
    cached && cached.projectId === projectId && cached.version === version
      ? cached.layout
      : undefined
  const layout = layoutGeometry(map, preset, links, previous)
  cached = { projectId, layout, version }
  return layout
}

export function resetCachedLayout(): void {
  cached = undefined
}
