import type { TreeNode } from '../schema/types'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// FreeMind stores notes as an HTML <richcontent TYPE="NOTE"> child (#52).
function noteContent(notes: string | undefined, pad: string): string {
  if (!notes?.trim()) return ''
  const paragraphs = notes
    .trim()
    .split(/\r?\n/)
    .map((line) => `<p>${escapeXml(line)}</p>`)
    .join('')
  return `${pad}<richcontent TYPE="NOTE"><html><head></head><body>${paragraphs}</body></html></richcontent>\n`
}

/**
 * Tasks (#148a): a "task" attribute (done / open) and FreeMind's built-in
 * "button_ok" icon on a done task. Markers (#148b): "icon" and "color"
 * (the palette slot) attributes; FreeMind's own icons are a fixed set.
 */
function markLines(node: TreeNode, pad: string): string {
  let lines = ''
  if (node.role === 'task') {
    if (node.done) lines += `${pad}<icon BUILTIN="button_ok"/>\n`
    lines += `${pad}<attribute NAME="task" VALUE="${node.done ? 'done' : 'open'}"/>\n`
  }
  if (node.icon) lines += `${pad}<attribute NAME="icon" VALUE="${escapeXml(node.icon)}"/>\n`
  if (node.color) lines += `${pad}<attribute NAME="color" VALUE="${node.color}"/>\n`
  // Node tags (#150), separated by spaces.
  if (node.tags?.length)
    lines += `${pad}<attribute NAME="tags" VALUE="${escapeXml(node.tags.join(' '))}"/>\n`
  return lines
}

function toNode(node: TreeNode, depth: number): string {
  const pad = '  '.repeat(depth)
  const attrs = [`TEXT="${escapeXml(node.title)}"`]
  if (depth === 1 && node.side && node.side !== 'auto') {
    attrs.push(`POSITION="${node.side}"`)
  }
  if (node.collapsed) attrs.push('FOLDED="true"')
  const children = node.children ?? []
  const note = noteContent(node.notes, `${pad}  `)
  const marks = markLines(node, `${pad}  `)
  if (children.length === 0 && !note && !marks) {
    return `${pad}<node ${attrs.join(' ')} />\n`
  }
  const body = children.map((child) => toNode(child, depth + 1)).join('')
  return `${pad}<node ${attrs.join(' ')}>\n${marks}${note}${body}${pad}</node>\n`
}

export function exportToFreemind(root: TreeNode): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<map version="1.0.1">\n` +
    `${toNode(root, 0)}` +
    `</map>\n`
  )
}
