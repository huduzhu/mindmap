import type { ProjectRecord } from '../io/db'
import type { TreeNode } from '../schema/types'
import { normalizeNodeTag } from '../map/tags'

export interface ProjectMatch {
  record: ProjectRecord
  /** Set when the name did not match but a node title did: the first such title. */
  foundIn?: string
  /** Set when nodes carry the searched tag (#150): "3 nodes tagged #q4". */
  tagged?: { tag: string; count: number }
}

function countTagged(trees: TreeNode[], tag: string): number {
  let count = 0
  const stack = [...trees]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.tags?.includes(tag)) count += 1
    if (node.children) stack.push(...node.children)
  }
  return count
}

const fold = (text: string) => text.normalize('NFKC').toLocaleLowerCase()

function findTitle(node: TreeNode, needle: string): string | undefined {
  // Iterative: stored trees can be deep (up to MAX_TREE_DEPTH).
  const stack = [node]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (fold(current.title).includes(needle)) return current.title
    const children = current.children ?? []
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i])
  }
  return undefined
}

/**
 * Projects matching a search on the start screen (#103): by name or tag
 * first, then by a node tag ("q4" or "#q4", #150), then by any node title in
 * the map or the brainstorm. Keeps the order it is given. An empty query
 * matches everything.
 */
export function searchProjects(records: ProjectRecord[], query: string): ProjectMatch[] {
  const trimmed = query.trim()
  const needle = fold(trimmed)
  if (!needle) return records.map((record) => ({ record }))
  const bare = fold(trimmed.replace(/^#+/, ''))
  const nodeTag = normalizeNodeTag(trimmed)
  const matches: ProjectMatch[] = []
  for (const record of records) {
    const { project } = record
    if (
      fold(project.name).includes(needle) ||
      (bare && (project.tags ?? []).some((tag) => fold(tag).includes(bare)))
    ) {
      matches.push({ record })
      continue
    }
    const count = nodeTag ? countTagged([project.map, project.brainstorm], nodeTag) : 0
    if (count > 0) {
      matches.push({ record, tagged: { tag: nodeTag!, count } })
      continue
    }
    const foundIn = findTitle(project.map, needle) ?? findTitle(project.brainstorm, needle)
    if (foundIn !== undefined) matches.push({ record, foundIn })
  }
  return matches
}
