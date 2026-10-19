import type { TreeNode } from '../schema/types'
import type { MapLayout } from './layout'

/**
 * Node tags (#150, HB1). Stored without the `#`, trimmed and in lowercase:
 * letters of any script (Chinese included), digits, `-`, `_` and `/`, 1–32
 * characters, at most 10 per node. Separate from the project tags on the start
 * screen (decision HB-D3).
 */
export const MAX_NODE_TAGS = 10
export const MAX_NODE_TAG_LENGTH = 32

/** Mirrors the `tags` item pattern in schemas/tree-node.schema.json. */
const TAG_SHAPE = /^[\p{L}\p{M}\p{N}_/-]{1,32}$/u

/** `#P1 ` → `p1`; null when nothing usable is left. */
export function normalizeNodeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const tag = raw.trim().replace(/^#+/, '').trim().normalize('NFC').toLowerCase()
  return TAG_SHAPE.test(tag) ? tag : null
}

/** Clean, deduplicated tags (at most 10), or undefined when none are usable. */
export function normalizeNodeTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const tags: string[] = []
  for (const item of raw) {
    const tag = normalizeNodeTag(item)
    if (tag && !tags.includes(tag)) tags.push(tag)
    if (tags.length >= MAX_NODE_TAGS) break
  }
  return tags.length > 0 ? tags : undefined
}

/** Whether `tags` is already exactly what normalizeNodeTags makes of it. */
export function areCleanTags(raw: unknown): boolean {
  return JSON.stringify(normalizeNodeTags(raw)) === JSON.stringify(raw)
}

/** `tags` plus `added` (deduplicated, capped at 10); the same array when nothing is new. */
export function withTags(tags: string[] | undefined, added: readonly string[]): string[] {
  const next = [...(tags ?? [])]
  for (const tag of added) {
    if (next.length >= MAX_NODE_TAGS) break
    if (!next.includes(tag)) next.push(tag)
  }
  return next.length === (tags?.length ?? 0) && tags ? tags : next
}

/**
 * Trailing `#word` tokens of a typed title become tags when the rename is
 * committed (HB-D1, Workflowy style): "Fix login #p1 #backend" → "Fix login"
 * with p1 and backend. Only whole tokens after a space count ("C#" stays), a
 * token of digits alone is kept as text ("Issue #12"), and a title that would
 * be left empty keeps its text.
 */
export function splitTrailingTags(text: string): { title: string; tags: string[] } {
  let title = text.trim()
  const tags: string[] = []
  for (;;) {
    const match = /(^|\s)#([^\s#]+)$/u.exec(title)
    if (!match || /^\p{N}+$/u.test(match[2])) break
    const tag = normalizeNodeTag(match[2])
    if (!tag) break
    const rest = title.slice(0, match.index).trimEnd()
    if (!rest) break
    if (!tags.includes(tag)) tags.unshift(tag)
    title = rest
  }
  return tags.length > 0 ? { title, tags } : { title: text.trim(), tags }
}

/**
 * A tag's stable colour: a hash of its name into the preset's branch colours
 * (HB3), so `#p1` looks the same on every node and after every reload.
 */
export function tagColor(tag: string, branchColors: readonly string[]): string | undefined {
  if (branchColors.length === 0) return undefined
  let hash = 0x811c9dc5
  for (let i = 0; i < tag.length; i++) {
    hash ^= tag.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return branchColors[(hash >>> 0) % branchColors.length]
}

/**
 * The tag filter of one view (HB4): which tags, whether a node needs any or
 * all of them, and whether the others are dimmed or hidden. Per view and per
 * session; never saved.
 */
export interface TagFilter {
  tags: string[]
  all: boolean
  hide: boolean
}

/** The filter when it does something: at least one tag picked. */
export function activeTagFilter(filter: TagFilter | null | undefined): TagFilter | null {
  return filter && filter.tags.length > 0 ? filter : null
}

/**
 * What the map needs to apply a filter (#150): the filter maths lives in the
 * lazily loaded ./tagFilter, which hands it over here when it loads. A filter
 * can only be switched on from code that loads it (the filter bar), so the
 * map finds it in place whenever a filter is on.
 */
export interface TagFilterView {
  apply: (root: TreeNode, filter: TagFilter) => TagFilterResult
  prune: (root: TreeNode, filter: TagFilter, keep?: ReadonlySet<string>) => TreeNode
  decorate: (layout: MapLayout, result: TagFilterResult | null, highlight: boolean) => MapLayout
}

let filterView: TagFilterView | null = null

export function provideTagFilterView(view: TagFilterView): void {
  filterView = view
}

export function tagFilterView(): TagFilterView | null {
  return filterView
}

/** What highlight mode does with a node: full strength, 60% (on a path) or 25%. */
export type TagState = 'match' | 'path' | 'dim'

export interface TagFilterResult {
  states: Map<string, TagState>
  /** Matches hidden inside each folded node ("+2 tagged"). */
  folded: Map<string, number>
  matches: number
}
