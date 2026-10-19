/**
 * Print / save as PDF (#106, decision U-D2: the whole map on one page).
 *
 * The map is captured as an image framed on the map itself and printed from
 * a hidden frame, scaled to fit one page; Brainstorm and Outline print as an
 * indented list. The browser's print dialog offers "Save as PDF".
 */
import type { Preset, Project, TreeNode } from '../schema/types'
import { renderNotesMarkdown } from '../notesMarkdown'
import { exportCanvasImage } from './image'

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A task's box and the emoji marker in front of a title (#148). */
function marks(node: TreeNode): string {
  const box = node.role === 'task' ? (node.done ? '☑ ' : '☐ ') : ''
  return `${box}${node.icon ? `${escapeHtml(node.icon)} ` : ''}`
}

/** A tree as nested lists, notes under their idea. */
export function outlineHtml(root: TreeNode): string {
  const item = (node: TreeNode): string => {
    const notes = node.notes?.trim()
      ? `<div class="notes">${renderNotesMarkdown(node.notes)}</div>`
      : ''
    const children = node.children?.length ? `<ul>${node.children.map(item).join('')}</ul>` : ''
    return `<li>${marks(node)}<span class="title">${escapeHtml(node.title)}</span>${notes}${children}</li>`
  }
  const rootNotes = root.notes?.trim()
    ? `<div class="notes">${renderNotesMarkdown(root.notes)}</div>`
    : ''
  const children = root.children?.length ? `<ul>${root.children.map(item).join('')}</ul>` : ''
  return `<h1>${marks(root)}${escapeHtml(root.title)}</h1>${rootNotes}${children}`
}

const PAGE_CSS = `
@page { margin: 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; font: 11pt/1.45 system-ui, 'Segoe UI', sans-serif; color: #111; }
h1 { font-size: 16pt; margin: 0 0 8pt; }
ul { margin: 2pt 0; padding-left: 16pt; }
li { margin: 2pt 0; break-inside: avoid; }
.title { font-weight: 600; }
.notes { color: #444; font-size: 10pt; }
.notes p { margin: 1pt 0; }
.map-page { height: calc(100vh - 1px); display: flex; align-items: center; justify-content: center; }
.map-page img { max-width: 100%; max-height: 100%; object-fit: contain; }
`

/** Print a small HTML document from a hidden frame, then remove the frame. */
export async function printHtml(title: string, body: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.className = 'print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    throw new Error('printing is not available')
  }
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${PAGE_CSS}</style></head><body>${body}</body></html>`,
  )
  doc.close()
  // Images must be decoded before the print dialog takes its snapshot.
  await Promise.all(Array.from(doc.images).map((img) => img.decode().catch(() => undefined)))
  const cleanUp = () => setTimeout(() => frame.remove(), 1000)
  win.addEventListener('afterprint', cleanUp, { once: true })
  win.focus()
  win.print()
  // Browsers that print without an afterprint event still get tidied up.
  setTimeout(() => frame.remove(), 60_000)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('could not read the image'))
    reader.readAsDataURL(blob)
  })
}

export async function printMap(project: Project, preset: Preset): Promise<void> {
  const blob = await exportCanvasImage('svg', preset, project, 'bounds')
  const src = await blobToDataUrl(blob)
  await printHtml(
    project.name,
    `<div class="map-page"><img src="${src}" alt="${escapeHtml(project.map.title)}"></div>`,
  )
}

export async function printOutline(project: Project, section: 'map' | 'brainstorm') {
  await printHtml(project.name, outlineHtml(project[section]))
}
