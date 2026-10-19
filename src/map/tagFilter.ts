import type { TreeNode } from '../schema/types'
import type { MapLayout } from './layout'
import { provideTagFilterView, type TagFilter, type TagFilterResult, type TagState } from './tags'

/**
 * The tag filter's maths (#150, HB4), loaded with the filter bar and the
 * Outline and Brainstorm views rather than at startup.
 */

/** How many nodes of `trees` carry each tag, most used first, then by name. */
export function countNodeTags(...trees: (TreeNode | undefined)[]): [string, number][] {
  const counts = new Map<string, number>()
  const stack = trees.filter((tree): tree is TreeNode => Boolean(tree))
  while (stack.length > 0) {
    const node = stack.pop()!
    for (const tag of node.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    if (node.children) stack.push(...node.children)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function matchesTags(node: TreeNode, tags: readonly string[], all: boolean): boolean {
  if (tags.length === 0 || !node.tags) return false
  return all
    ? tags.every((tag) => node.tags!.includes(tag))
    : tags.some((tag) => node.tags!.includes(tag))
}

/**
 * The filter applied to a tree: each node's state, and how many matches each
 * folded node hides. Matches inside folded branches count on the folded node.
 */
export function applyTagFilter(root: TreeNode, filter: TagFilter): TagFilterResult {
  const states = new Map<string, TagState>()
  const folded = new Map<string, number>()
  let matches = 0
  // Returns the number of matches at or under `node`.
  const visit = (node: TreeNode): number => {
    const own = matchesTags(node, filter.tags, filter.all) ? 1 : 0
    let below = 0
    for (const child of node.children ?? []) below += visit(child)
    matches += own
    states.set(node.id, own ? 'match' : below > 0 ? 'path' : 'dim')
    if (node.collapsed && below > 0) folded.set(node.id, below)
    return own + below
  }
  visit(root)
  return { states, folded, matches }
}

/**
 * Hide mode: only the matches and their path to the root, as a reduced tree.
 * `keep` are ids shown anyway (the node being renamed). Branches that lose
 * nothing keep their objects, so their measured sizes are reused.
 */
export function pruneToTags(
  root: TreeNode,
  filter: TagFilter,
  keep?: ReadonlySet<string>,
): TreeNode {
  const prune = (node: TreeNode): TreeNode | null => {
    const children = node.children ?? []
    const kept: TreeNode[] = []
    let changed = false
    for (const child of children) {
      const next = prune(child)
      if (next) kept.push(next)
      if (next !== child) changed = true
    }
    const self = matchesTags(node, filter.tags, filter.all) || keep?.has(node.id)
    if (!self && kept.length === 0) return null
    return changed ? { ...node, children: kept } : node
  }
  return prune(root) ?? { ...root, children: [] }
}

/**
 * The tag filter's highlight mode on the map (#150): matches at full strength,
 * the path to them at 60%, the rest at 25%, as a class on React Flow's node so
 * the node itself does not re-render. Edges fade with the node they lead to.
 * Folded nodes say how many matches they hide. Unchanged objects are reused.
 */
export function decorateTags(
  layout: MapLayout,
  result: TagFilterResult | null,
  highlight: boolean,
): MapLayout {
  if (!result) return layout
  const classOf = (id: string) => {
    if (!highlight) return undefined
    const state = result.states.get(id)
    return state === 'dim' ? 'tag-dim' : state === 'path' ? 'tag-path' : undefined
  }
  const nodes = layout.nodes.map((node) => {
    const className = classOf(node.id)
    const tagHits = result.folded.get(node.id)
    if (node.className === className && node.data.tagHits === tagHits) return node
    return {
      ...node,
      className,
      data: node.data.tagHits === tagHits ? node.data : { ...node.data, tagHits },
    }
  })
  const edges = highlight
    ? layout.edges.map((edge) => {
        const className = classOf(edge.target)
        return edge.className === className ? edge : { ...edge, className }
      })
    : layout.edges
  return { nodes, edges }
}

provideTagFilterView({ apply: applyTagFilter, prune: pruneToTags, decorate: decorateTags })
