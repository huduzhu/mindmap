import type { TreeNode } from '../schema/types'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Attribute values normalize raw newlines to spaces, so encode them.
function escapeAttr(value: string): string {
  return escapeXml(value).replace(/\r?\n/g, '&#10;')
}

function attrs(node: TreeNode): string {
  // `_note` is the de-facto OPML notes attribute (OmniOutliner, Dynalist, …) (#52).
  const note = node.notes?.trim() ? ` _note="${escapeAttr(node.notes)}"` : ''
  // Tasks (#148a): `_task` and `_done`, in the same underscore style.
  const task = node.role === 'task' ? ` _task="true"${node.done ? ' _done="true"' : ''}` : ''
  // Markers (#148b): the emoji, and the colour as its palette slot.
  const icon = node.icon ? ` _icon="${escapeAttr(node.icon)}"` : ''
  const color = node.color ? ` _color="${node.color}"` : ''
  // Node tags (#150), separated by spaces.
  const tags = node.tags?.length ? ` _tags="${escapeAttr(node.tags.join(' '))}"` : ''
  return `text="${escapeAttr(node.title)}"${note}${task}${icon}${color}${tags}`
}

function toOutline(node: TreeNode, depth: number): string {
  const pad = '  '.repeat(depth + 2)
  const children = node.children ?? []
  if (children.length === 0) {
    return `${pad}<outline ${attrs(node)} />\n`
  }
  const body = children.map((child) => toOutline(child, depth + 1)).join('')
  return `${pad}<outline ${attrs(node)}>\n${body}${pad}</outline>\n`
}

export function exportToOpml(root: TreeNode, title: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<opml version="2.0">\n` +
    `  <head>\n` +
    `    <title>${escapeXml(title)}</title>\n` +
    `  </head>\n` +
    `  <body>\n` +
    `${toOutline(root, 0)}` +
    `  </body>\n` +
    `</opml>\n`
  )
}
