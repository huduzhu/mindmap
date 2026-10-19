import type { Preset, Project } from '../schema/types'
import { downloadBlob, downloadJson, downloadText, slugify } from './files'
import { exportToFreemind } from './freemind'
import { buildInteractiveHtml } from './htmlExport'
import { exportCanvasImage } from './image'
import { exportToMarkdown } from './markdown'
import { exportToOpml } from './opml'
import { zipStore } from './zip'
import { printMap, printOutline } from './print'
import { branchProject, type BranchSection } from './branch'
import { buildPacket } from './packet'
import { useEditor } from '../store/editor'
import { projectForFile } from '../schema/formatVersion'
import {
  ASSETS_PREFIX,
  assetZipEntries,
  MARKDOWN_IMAGES_PREFIX,
  projectAssetRefs,
} from '../assets/bundle'
import { collectAssetRefs } from '../assets/store'

/**
 * Download actions shared by the toolbar's Export menu and the command
 * palette, so the two surfaces can never drift apart.
 */

export function exportProjectJson(project: Project): void {
  downloadJson(`${slugify(project.name)}.mindmap.json`, projectForFile(project))
}

function downloadZip(name: string, entries: { name: string; data: Uint8Array }[]): void {
  downloadBlob(name, new Blob([zipStore(entries)], { type: 'application/zip' }))
}

/**
 * "Project JSON with images (.zip)" (#149): the project file and the images
 * it uses as `assets/<hash>.<ext>`. Importing the ZIP brings both back.
 */
export async function exportProjectZip(project: Project): Promise<void> {
  const slug = slugify(project.name)
  const json = new TextEncoder().encode(`${JSON.stringify(projectForFile(project), null, 2)}\n`)
  const images = await assetZipEntries(projectAssetRefs([project]), ASSETS_PREFIX)
  downloadZip(`${slug}.mindmap.zip`, [
    { name: `${slug}.mindmap.json`, data: json },
    ...images.entries,
  ])
}

/** "Markdown with images (.zip)" (#149): the outline with `![alt](images/…)` and the images. */
export async function exportMarkdownZip(project: Project): Promise<void> {
  const slug = slugify(project.name)
  const images = await assetZipEntries(
    collectAssetRefs([project.brainstorm]),
    MARKDOWN_IMAGES_PREFIX,
  )
  const text = exportToMarkdown(project.brainstorm, { imagePaths: images.paths })
  downloadZip(`${slug}-brainstorm.zip`, [
    { name: `${slug}-brainstorm.md`, data: new TextEncoder().encode(text) },
    ...images.entries,
  ])
}

export function exportMarkdownFile(project: Project): void {
  downloadText(
    `${slugify(project.name)}-brainstorm.md`,
    exportToMarkdown(project.brainstorm),
    'text/markdown',
  )
}

export function exportOpmlFile(project: Project): void {
  downloadText(
    `${slugify(project.name)}.opml`,
    exportToOpml(project.brainstorm, project.name),
    'text/x-opml',
  )
}

export function exportFreemindFile(project: Project): void {
  downloadText(`${slugify(project.name)}.mm`, exportToFreemind(project.map), 'application/xml')
}

export async function exportImageFile(
  format: 'png' | 'svg',
  preset: Preset,
  project: Project,
): Promise<void> {
  const blob = await exportCanvasImage(format, preset, project)
  downloadBlob(`${slugify(project.name)}.${format}`, blob)
}

export async function exportHtmlFile(
  project: Project,
  preset: Preset,
  zip: boolean,
): Promise<void> {
  const html = await buildInteractiveHtml(project, preset)
  if (!zip) {
    downloadText(`${slugify(project.name)}.html`, html, 'text/html')
    return
  }
  const bytes = new TextEncoder().encode(html)
  const archive = zipStore([{ name: `${slugify(project.name)}.html`, data: bytes }])
  downloadBlob(`${slugify(project.name)}.zip`, new Blob([archive], { type: 'application/zip' }))
}

/**
 * Print / save as PDF (#106): the map view prints the whole map on one page,
 * Brainstorm and Outline print their outline.
 */
export async function printProject(
  project: Project,
  preset: Preset,
  view: 'map' | 'brainstorm' | 'outline' | 'split',
): Promise<void> {
  if (view === 'map') await printMap(project, preset)
  else await printOutline(project, view === 'brainstorm' || view === 'split' ? 'brainstorm' : 'map')
}

export type BranchFormat = 'markdown' | 'opml' | 'png' | 'svg' | 'json' | 'html' | 'ai'

function afterFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count
    const tick = () => {
      left -= 1
      if (left <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * "Export this branch…" (#146): the usual exports, limited to one branch.
 * Images are taken from the map canvas, focused on the branch for the capture.
 */
export async function exportBranch(
  format: BranchFormat,
  project: Project,
  section: BranchSection,
  id: string,
  preset: Preset,
  projectId?: string,
): Promise<void> {
  const branch = branchProject(project, section, id)
  if (!branch) return
  const root = branch[section]
  const file = `${slugify(project.name)}-${slugify(root.title)}`
  switch (format) {
    case 'markdown':
      downloadText(`${file}.md`, exportToMarkdown(root), 'text/markdown')
      return
    case 'opml':
      downloadText(`${file}.opml`, exportToOpml(root, branch.name), 'text/x-opml')
      return
    case 'json':
      downloadJson(`${file}.mindmap.json`, projectForFile(branch))
      return
    case 'ai':
      downloadJson(
        `packet-expand-${file}.json`,
        buildPacket(project, 'expand', 'full', projectId, id),
      )
      return
    case 'html': {
      // The interactive page shows the map, so a Brainstorm branch goes there.
      const page = section === 'map' ? branch : { ...branch, map: root, brainstorm: branch.map }
      const html = await buildInteractiveHtml(page, preset)
      downloadText(`${file}.html`, html, 'text/html')
      return
    }
    case 'png':
    case 'svg': {
      const editor = useEditor.getState()
      const before = editor.focus.map
      editor.setFocus('map', id)
      try {
        // Let the canvas lay out the branch on its own before the capture.
        await afterFrames(3)
        const blob = await exportCanvasImage(format, preset, { ...project, map: root })
        downloadBlob(`${file}.${format}`, blob)
      } finally {
        useEditor.getState().setFocus('map', before)
      }
    }
  }
}
