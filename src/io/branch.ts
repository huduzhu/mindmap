import { t } from '../i18n'
import '../i18n/en/export'
import type { Project, TreeNode } from '../schema/types'
import { findNode, makeNode } from '../store/treeOps'

export type BranchSection = 'map' | 'brainstorm'

/**
 * One branch as a project of its own (#146, "Export this branch…"): the
 * branch becomes the root of its tree, the other tree is an empty root with
 * the same title, and only cross-links inside the branch are kept. Null when
 * the node is gone.
 */
export function branchProject(
  project: Project,
  section: BranchSection,
  id: string,
): Project | null {
  const branch = findNode(project[section], id)?.node
  if (!branch) return null
  const inside = new Set<string>()
  const stack: TreeNode[] = [branch]
  while (stack.length > 0) {
    const node = stack.pop()!
    inside.add(node.id)
    if (node.children) stack.push(...node.children)
  }
  const other = makeNode(branch.title)
  const links =
    section === 'map'
      ? project.links?.filter((link) => inside.has(link.from) && inside.has(link.to))
      : undefined
  const result: Project = {
    kind: 'project',
    schemaVersion: 1,
    name: t('branch.name', {
      project: project.name,
      branch: branch.title.trim() || t('common.untitled'),
    }),
    preset: project.preset,
    map: section === 'map' ? branch : other,
    brainstorm: section === 'brainstorm' ? branch : other,
  }
  if (links?.length) result.links = links
  return result
}
