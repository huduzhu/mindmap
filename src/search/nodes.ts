import type { TreeNode } from '../schema/types'
import { normalizeNodeTag } from '../map/tags'

export interface SearchHit {
  id: string
  title: string
}

interface ParsedQuery {
  /** `#p1` terms (#150); the one still being typed also matches as a prefix. */
  tags: { tag: string; prefix: boolean }[]
  text: string
}

/** "#p1 pricing" → the tag p1 and the text "pricing" (#150, HB5). */
export function parseSearchQuery(query: string): ParsedQuery {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  const typing = !/\s$/.test(query)
  const tags: ParsedQuery['tags'] = []
  const words: string[] = []
  tokens.forEach((token, index) => {
    const tag = token.length > 1 && token.startsWith('#') ? normalizeNodeTag(token) : null
    if (tag) tags.push({ tag, prefix: typing && index === tokens.length - 1 })
    else words.push(token)
  })
  return { tags, text: words.join(' ').toLowerCase() }
}

/**
 * Nodes whose title or notes contain the text and that carry every `#tag` of
 * the query: `#p1` alone finds the nodes tagged p1, `#p1 pricing` those of
 * them that mention pricing.
 */
export function searchNodes(root: TreeNode, query: string): SearchHit[] {
  const { tags, text } = parseSearchQuery(query)
  if (!text && tags.length === 0) return []
  const hits: SearchHit[] = []
  const walk = (node: TreeNode) => {
    const title = node.title ?? ''
    const notes = node.notes ?? ''
    const tagged = tags.every(({ tag, prefix }) =>
      (node.tags ?? []).some((own) => (prefix ? own.startsWith(tag) : own === tag)),
    )
    if (
      tagged &&
      (!text || title.toLowerCase().includes(text) || notes.toLowerCase().includes(text))
    ) {
      hits.push({ id: node.id, title })
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return hits
}
