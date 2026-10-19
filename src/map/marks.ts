import type { TreeNode } from '../schema/types'

/**
 * Task done state (#148a). `done` is kept on any node, but only a node whose
 * role is "task" shows a checkbox or counts towards its parent's progress
 * (decision GE-D2): switching a node away from "task" and back keeps its state.
 */
export function isTask(node: TreeNode): boolean {
  return node.role === 'task'
}

export function isDone(node: TreeNode): boolean {
  return node.role === 'task' && node.done === true
}

export interface TaskProgress {
  done: number
  total: number
}

/**
 * "3/5" on a parent: its direct children that are tasks, and how many of those
 * are done. Only direct children count, so every level reads on its own and a
 * sub-task list does not inflate its grandparent. Null without task children.
 */
export function taskProgress(node: TreeNode): TaskProgress | null {
  let total = 0
  let done = 0
  for (const child of node.children ?? []) {
    if (!isTask(child)) continue
    total += 1
    if (child.done === true) done += 1
  }
  return total > 0 ? { done, total } : null
}

/**
 * Colour markers (#148b) are a 1-based slot in the active preset's
 * `palette.branchColors` (decision GE-D3), stored as an integer 1–8, so a
 * marked node follows the theme. Presets have 3–8 colours: a slot past the
 * end wraps around.
 */
export const MAX_COLOR = 8

export function isColorSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_COLOR
}

export function markerColor(
  palette: { branchColors: readonly string[] },
  color: number | undefined,
): string | undefined {
  if (!isColorSlot(color) || palette.branchColors.length === 0) return undefined
  return palette.branchColors[(color - 1) % palette.branchColors.length]
}

/** Mirrors the `icon` pattern in schemas/tree-node.schema.json. */
const ICON_SHAPE = /^[#*0-9]?\P{ASCII}[^\s\p{ASCII}]*$/u
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u
export const MAX_ICON_CODE_POINTS = 16

type Segmenter = { segment(text: string): Iterable<{ segment: string }> }

function graphemes(text: string): string[] {
  const Ctor = (Intl as { Segmenter?: new (locale?: string, options?: object) => Segmenter })
    .Segmenter
  if (Ctor)
    return Array.from(
      new Ctor(undefined, { granularity: 'grapheme' }).segment(text),
      (s) => s.segment,
    )
  return Array.from(text)
}

/** Whether `value` is exactly one emoji (one grapheme), as `icon` must be (#148b). */
export function isEmojiMarker(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  if (Array.from(value).length > MAX_ICON_CODE_POINTS) return false
  if (!ICON_SHAPE.test(value) || !EMOJI.test(value)) return false
  return graphemes(value).length === 1
}

/** The emoji a typed text starts with, or null (free entry in the marker picker). */
export function firstEmoji(text: string): string | null {
  const [first] = graphemes(text.trim())
  return first && isEmojiMarker(first) ? first : null
}

/** "🔥 Title" → { icon: "🔥", title: "Title" } (Markdown import, #148b). */
export function splitLeadingEmoji(title: string): { icon?: string; title: string } {
  const [first] = graphemes(title)
  if (!first || !isEmojiMarker(first)) return { title }
  const rest = title.slice(first.length)
  if (!/^\s+\S/.test(rest)) return { title }
  return { icon: first, title: rest.trim() }
}
