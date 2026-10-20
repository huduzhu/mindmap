import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { t } from '../i18n'
import '../i18n/en/files'
import { toPng, toSvg } from 'html-to-image'
import { layoutMap } from '../map/layout'
import { useEditor } from '../store/editor'
import type { Preset, Project } from '../schema/types'
import { loadThumbUrl } from '../assets/thumbs'
import { collectAssetRefs } from '../assets/store'

const EXPORT_WIDTH = 1920
const EXPORT_HEIGHT = 1080

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Pictures on nodes (#149): load every thumbnail the map shows and wait until
 * the <img> elements have decoded, so the capture has them. html-to-image
 * then inlines each one as a data URI (the SVG embeds them too).
 */
async function imagesReady(element: HTMLElement, project: Project): Promise<void> {
  const hashes = collectAssetRefs([project.map])
  if (hashes.size === 0) return
  await Promise.all([...hashes].map((hash) => loadThumbUrl(hash)))
  await nextFrames(2)
  await Promise.all(
    [...element.querySelectorAll('img')].map((img) => img.decode?.().catch(() => undefined)),
  )
}

/** Longest side of a capture framed on the map itself (printing, #106). */
const MAX_FRAMED_SIDE = 4000
const FRAME_PADDING = 40

export async function exportCanvasImage(
  format: 'png' | 'svg',
  preset: Preset,
  project: Project,
  /** 'bounds' sizes the image to the map's own shape instead of 1920×1080. */
  frame: 'screen' | 'bounds' = 'screen',
): Promise<Blob> {
  const element = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!element) {
    throw new Error(t('image.switchToMap'))
  }
  const { nodes } = layoutMap(project.map, preset, null, null)
  if (nodes.length === 0) {
    throw new Error(t('image.empty'))
  }

  // The canvas virtualizes nodes outside the current viewport
  // (onlyRenderVisibleElements), so capturing while zoomed in would silently
  // drop every off-screen branch. Flip the editor into capturing mode — the
  // canvas renders the full map — then frame the capture on the map's own
  // bounding box instead of whatever is on screen.
  useEditor.getState().setCapturing(true)
  try {
    await nextFrames(2)
    await imagesReady(element, project)
    const bounds = getNodesBounds(nodes)
    let width = EXPORT_WIDTH
    let height = EXPORT_HEIGHT
    if (frame === 'bounds') {
      const w = bounds.width + 2 * FRAME_PADDING
      const h = bounds.height + 2 * FRAME_PADDING
      const scale = Math.min(1, MAX_FRAMED_SIDE / Math.max(w, h))
      width = Math.max(200, Math.round(w * scale))
      height = Math.max(120, Math.round(h * scale))
    }
    const viewport =
      frame === 'bounds'
        ? getViewportForBounds(bounds, width, height, 0.02, 2.5, 0.02)
        : getViewportForBounds(bounds, width, height, 0.15, 2.5, 0.1)
    const options = {
      backgroundColor: preset.palette.background,
      width,
      height,
      pixelRatio: 2,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    }
    const dataUrl = format === 'png' ? await toPng(element, options) : await toSvg(element, options)
    const response = await fetch(dataUrl)
    return await response.blob()
  } finally {
    useEditor.getState().setCapturing(false)
  }
}
