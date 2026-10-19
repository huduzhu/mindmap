import type { TreeNode } from '../schema/types'
import { makeNode } from '../store/treeOps'
import { t } from '../i18n'
import { splitLeadingEmoji } from '../map/marks'
import { splitTrailingTags } from '../map/tags'

// The outline format is line-based, so a newline inside a title would split a
// bullet across lines and corrupt the structure on re-import. Flatten any run
// of line breaks (and the whitespace around them) into a single space.
//
// Done with split/trim rather than /\s*\r?\n\s*/g: that regex backtracks
// quadratically on a long run of spaces without a newline (ReDoS).
export function flattenTitle(title: string): string {
  if (!title.includes('\n')) return title
  const parts = title.split('\n')
  const last = parts.length - 1
  const kept: string[] = []
  parts.forEach((part, index) => {
    if (index === 0) kept.push(part.trimEnd())
    else if (index === last) kept.push(part.trimStart())
    else if (part.trim()) kept.push(part.trim())
  })
  return kept.join(' ')
}

// Notes ride along as blockquote lines indented one level under their bullet
// ("  > text"), so a Markdown export → import cycle keeps them (#52). A blank
// line inside a note becomes a bare ">". The root's notes follow the heading.
function noteLines(notes: string | undefined, indent: string): string[] {
  if (!notes?.trim()) return []
  return notes
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `${indent}> ${line}` : `${indent}>`))
}

/** "[x] " / "[ ] " in front of a task (#148a), as GitHub-style task lists write it. */
/** The emoji marker as a text prefix (#148b); colours are not written. */
function iconPrefix(node: TreeNode): string {
  return node.icon ? `${node.icon} ` : ''
}

/** Node tags as trailing ` #p1 #backend` (#150); import reads them back. */
function tagSuffix(node: TreeNode): string {
  return node.tags?.length ? node.tags.map((tag) => ` #${tag}`).join('') : ''
}

function taskBox(node: TreeNode): string {
  if (node.role !== 'task') return ''
  return node.done ? '[x] ' : '[ ] '
}

/**
 * A node's picture (#149) as a line under it: `![alt](images/<file>)` when the
 * export carries the images (a ZIP), otherwise its description as
 * "[image: alt]". Import skips such lines, so the outline reads back as before.
 */
function imageLines(node: TreeNode, indent: string, paths?: Map<string, string>): string[] {
  if (!node.image) return []
  const alt = flattenTitle(node.image.alt ?? '')
  const path = paths?.get(node.image.asset)
  if (path) return [`${indent}![${alt.replace(/([[\]\\])/g, '\\$1')}](${path})`]
  return [`${indent}${alt ? `[image: ${alt}]` : '[image]'}`]
}

export interface MarkdownOptions {
  /** Where each image is in the export, by asset hash (the ZIP export). */
  imagePaths?: Map<string, string>
}

export function exportToMarkdown(root: TreeNode, options: MarkdownOptions = {}): string {
  const paths = options.imagePaths
  const lines: string[] = [
    `# ${iconPrefix(root)}${flattenTitle(root.title) || 'Untitled'}${tagSuffix(root)}`,
    '',
  ]
  const rootImage = imageLines(root, '', paths)
  if (rootImage.length > 0) lines.push(...rootImage, '')
  const rootNotes = noteLines(root.notes, '')
  if (rootNotes.length > 0) lines.push(...rootNotes, '')
  const walk = (node: TreeNode, depth: number) => {
    for (const child of node.children ?? []) {
      lines.push(
        `${'  '.repeat(depth)}- ${taskBox(child)}${iconPrefix(child)}${flattenTitle(child.title)}${tagSuffix(child)}`,
      )
      lines.push(...imageLines(child, '  '.repeat(depth + 1), paths))
      lines.push(...noteLines(child.notes, '  '.repeat(depth + 1)))
      walk(child, depth + 1)
    }
  }
  walk(root, 1)
  return `${lines.join('\n')}\n`
}

export function parseMarkdown(text: string): TreeNode {
  const lines = text.split(/\r?\n/)
  const heading = lines.find((line) => /^#\s+/.test(line))
  const rootTitle = heading ? heading.replace(/^#\s+/, '').trim() : t('import.outlineRoot')
  const rootTagged = splitTrailingTags(rootTitle)
  const rootMarked = splitLeadingEmoji(rootTagged.title)
  const root = makeNode(rootMarked.title, {
    ...(rootMarked.icon ? { icon: rootMarked.icon } : {}),
    ...(rootTagged.tags.length > 0 ? { tags: rootTagged.tags } : {}),
  })

  // Stack of {node, depth}; a bullet attaches to the nearest stack entry shallower than it.
  const stack: { node: TreeNode; depth: number }[] = [{ node: root, depth: 0 }]
  const notes = new Map<TreeNode, string[]>()
  let last: TreeNode = root
  for (const rawLine of lines) {
    const bullet = rawLine.match(/^(\s*)[-*]\s+(.+)$/)
    if (bullet) {
      const spaces = bullet[1].replace(/\t/g, '  ').length
      const depth = Math.floor(spaces / 2)
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop()
      }
      const parent = stack[stack.length - 1].node
      // "- [x] Buy tiles" is a task that is done, "- [ ] …" one that is not (#148a).
      const task = bullet[2].match(/^\[([ xX])\]\s+(.+)$/)
      // A leading emoji ("- 🔥 Hot lead") becomes the node's marker (#148b).
      // Trailing "#p1 #backend" are the node's tags (#150).
      const tagged = splitTrailingTags((task ? task[2] : bullet[2]).trim())
      const marked = splitLeadingEmoji(tagged.title)
      const node = makeNode(marked.title, {
        ...(tagged.tags.length > 0 ? { tags: tagged.tags } : {}),
        ...(task ? { role: 'task' as const } : {}),
        ...(task && task[1] !== ' ' ? { done: true } : {}),
        ...(marked.icon ? { icon: marked.icon } : {}),
      })
      parent.children = [...(parent.children ?? []), node]
      stack.push({ node, depth })
      last = node
      continue
    }
    const quote = rawLine.match(/^\s*>\s?(.*)$/)
    if (quote) {
      const collected = notes.get(last) ?? []
      collected.push(quote[1].trimEnd())
      notes.set(last, collected)
    }
  }
  for (const [node, collected] of notes) {
    const joined = collected.join('\n').trim()
    if (joined) node.notes = joined
  }
  return root
}
