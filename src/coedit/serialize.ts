import type { Role } from '../schema/constants'
import type { Project, TreeNode } from '../schema/types'
import { findNode } from '../store/treeOps'

export interface AgentNodeSummary {
  id: string
  title: string
  role?: Role
  done?: boolean
  tags?: string[]
  notes?: string
  hasNotes: boolean
  childCount: number
  children?: AgentNodeSummary[]
}

export interface AgentMapSnapshot {
  projectName: string
  rev: number
  root: AgentNodeSummary
}

export interface AgentNodeDetail {
  rev: number
  parentId: string | null
  node: AgentNodeSummary
}

export interface AgentSearchMatch {
  id: string
  title: string
  parentId: string | null
  snippet?: string
  tags?: string[]
}

export interface AgentSearchResult {
  rev: number
  matches: AgentSearchMatch[]
}

function toNodeSummary(
  node: TreeNode,
  depth: number,
  maxDepth: number,
  includeNotes: boolean,
): AgentNodeSummary {
  const kids = node.children ?? []
  const summary: AgentNodeSummary = {
    id: node.id,
    title: node.title,
    hasNotes: Boolean(node.notes && node.notes.length > 0),
    childCount: kids.length,
  }
  if (node.role !== undefined) summary.role = node.role
  if (node.done !== undefined) summary.done = node.done
  if (node.tags && node.tags.length > 0) summary.tags = [...node.tags]
  if (includeNotes && node.notes) summary.notes = node.notes
  if (depth < maxDepth && kids.length > 0) {
    summary.children = kids.map((child) => toNodeSummary(child, depth + 1, maxDepth, includeNotes))
  }
  return summary
}

/**
 * Serialize a project's map tree in a compact, stable-ID format for MCP/AI
 * agent reads. Notes can be omitted (`includeNotes: false`) and depth capped
 * (`maxDepth`) to keep context small.
 */
export function serializeMapForAgent(
  project: Project,
  rev: number,
  options?: { includeNotes?: boolean; maxDepth?: number },
): AgentMapSnapshot {
  const includeNotes = options?.includeNotes ?? true
  const rawMaxDepth = options?.maxDepth ?? Number.POSITIVE_INFINITY
  const maxDepth = Number.isNaN(rawMaxDepth) ? 0 : Math.max(0, rawMaxDepth)
  return {
    projectName: project.name,
    rev,
    root: toNodeSummary(project.map, 0, maxDepth, includeNotes),
  }
}

/**
 * Serialize a single node (including its full notes and immediate children
 * summaries) addressed by stable `id`. Returns null if `id` is not found.
 */
export function serializeNodeForAgent(
  tree: TreeNode,
  id: string,
  rev: number,
): AgentNodeDetail | null {
  const located = findNode(tree, id)
  if (!located) return null
  return {
    rev,
    parentId: located.parent?.id ?? null,
    node: toNodeSummary(located.node, 0, 1, true),
  }
}

function buildNoteSnippet(notes: string, needle: string): string {
  const lower = notes.toLocaleLowerCase()
  const idx = lower.indexOf(needle)
  if (idx === -1) return notes.slice(0, 120)
  const start = Math.max(0, idx - 30)
  const end = Math.min(notes.length, idx + needle.length + 70)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < notes.length ? '…' : ''
  return `${prefix}${notes.slice(start, end).trim()}${suffix}`
}

/**
 * Search nodes iteratively across titles, notes, and tags using a
 * case-insensitive substring query.
 */
export function searchNodesForAgent(
  tree: TreeNode,
  query: string,
  rev: number,
  limit = 25,
): AgentSearchResult {
  const needle = query.trim().toLocaleLowerCase()
  const cap = Math.max(0, Math.floor(limit))
  if (!needle || cap === 0) return { rev, matches: [] }

  const matches: AgentSearchMatch[] = []
  const stack: { node: TreeNode; parentId: string | null }[] = [{ node: tree, parentId: null }]

  while (stack.length > 0 && matches.length < cap) {
    const item = stack.pop()
    if (!item) continue
    const { node, parentId } = item

    const titleHit = node.title.toLocaleLowerCase().includes(needle)
    const notesHit = Boolean(node.notes && node.notes.toLocaleLowerCase().includes(needle))
    const tagHit = Boolean(node.tags?.some((tag) => tag.toLocaleLowerCase().includes(needle)))

    if (titleHit || notesHit || tagHit) {
      const match: AgentSearchMatch = {
        id: node.id,
        title: node.title,
        parentId,
      }
      if (notesHit && node.notes) {
        match.snippet = buildNoteSnippet(node.notes, needle)
      }
      if (node.tags && node.tags.length > 0) {
        match.tags = [...node.tags]
      }
      matches.push(match)
    }

    const kids = node.children
    if (kids) {
      for (let i = kids.length - 1; i >= 0; i--) {
        const child = kids[i]
        if (child) stack.push({ node: child, parentId: node.id })
      }
    }
  }

  return { rev, matches }
}
