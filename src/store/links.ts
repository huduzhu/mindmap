import type { NodeLink, Project, TreeNode } from '../schema/types'

export function collectNodeIds(root: TreeNode): Set<string> {
  const ids = new Set<string>()
  const visit = (node: TreeNode) => {
    ids.add(node.id)
    for (const child of node.children ?? []) visit(child)
  }
  visit(root)
  return ids
}

/** Longest link label (#148c), as in schemas/project.schema.json. */
export const MAX_LINK_LABEL = 80

/**
 * A link label as stored: trimmed, on one line, at most 80 characters; blank
 * or not text means no label.
 */
export function cleanLinkLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const flat = value.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  const chars = Array.from(flat)
  return chars.length > MAX_LINK_LABEL ? chars.slice(0, MAX_LINK_LABEL).join('').trimEnd() : flat
}

export function normalizeLinks(
  map: TreeNode,
  links: NodeLink[] | undefined,
): NodeLink[] | undefined {
  if (!links?.length) return undefined
  const ids = collectNodeIds(map)
  const seen = new Set<string>()
  const valid: NodeLink[] = []
  for (const link of links) {
    if (!ids.has(link.from) || !ids.has(link.to) || link.from === link.to) continue
    const key = `${link.from}\u0000${link.to}`
    if (seen.has(key)) continue
    seen.add(key)
    const label = cleanLinkLabel(link.label)
    valid.push(label ? { from: link.from, to: link.to, label } : { from: link.from, to: link.to })
  }
  return valid.length > 0 ? valid : undefined
}

export function normalizeProjectLinks(project: Project): Project {
  const links = normalizeLinks(project.map, project.links)
  if (links) return { ...project, links }
  if (!project.links) return project
  const { links: _ignored, ...withoutLinks } = project
  return withoutLinks
}

const joins = (link: NodeLink, a: string, b: string) =>
  (link.from === a && link.to === b) || (link.from === b && link.to === a)

/** Add a cross-link unless the two nodes are already linked either way (#90). */
export function addLink(links: NodeLink[], from: string, to: string): NodeLink[] {
  if (from === to || links.some((link) => joins(link, from, to))) return links
  return [...links, { from, to }]
}

/** Remove the cross-link between two nodes, whichever way it points (#90). */
export function removeLinkBetween(links: NodeLink[], a: string, b: string): NodeLink[] {
  const next = links.filter((link) => !joins(link, a, b))
  return next.length === links.length ? links : next
}

/**
 * Set or clear (blank) the label of the link between two nodes, whichever way
 * it points (#148c). The same label returns the same array.
 */
export function setLinkLabel(links: NodeLink[], a: string, b: string, label: string): NodeLink[] {
  const next = cleanLinkLabel(label)
  let changed = false
  const updated = links.map((link) => {
    if (!joins(link, a, b) || link.label === next) return link
    changed = true
    return next ? { ...link, label: next } : { from: link.from, to: link.to }
  })
  return changed ? updated : links
}

/** The link between two nodes, whichever way it points. */
export function linkBetween(links: NodeLink[] | undefined, a: string, b: string) {
  return links?.find((link) => joins(link, a, b))
}

/** The nodes linked to `id`, in link order (#90). */
export function linkedIds(links: NodeLink[] | undefined, id: string): string[] {
  const out: string[] = []
  for (const link of links ?? []) {
    const other = link.from === id ? link.to : link.to === id ? link.from : null
    if (other && !out.includes(other)) out.push(other)
  }
  return out
}
