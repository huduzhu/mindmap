import { lazyImport } from '../pwa/update'

/**
 * Where new images come in (#149, HC3), the part in the startup bundle: it
 * only spots a picture on the clipboard or in a drop. Choosing the node and
 * the work itself (decoding, scaling, storing, the tree edit) are in the
 * lazily loaded src/assets/attach.ts, which `loadImages` fetches.
 */

const isImage = (type: string) => /^image\//i.test(type) && !/svg/i.test(type)

/** Whether `file` is a picture to attach rather than a project to import. */
export function isImageFile(file: { type: string; name?: string }): boolean {
  return file.type ? isImage(file.type) : /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name ?? '')
}

/**
 * The picture a paste should attach (HC3): only when the clipboard has an
 * image file and no text. Office apps put a picture of the copied cells next
 * to their text; that text keeps pasting as nodes, as before.
 */
export function pastesImage(data: DataTransfer | null | undefined): File | null {
  if (!data || data.getData('text/plain').trim()) return null
  const files = [
    ...Array.from(data.files ?? []),
    ...Array.from(data.items ?? []).map((item) => (item.kind === 'file' ? item.getAsFile() : null)),
  ]
  return files.find((file): file is File => Boolean(file && isImageFile(file))) ?? null
}

/** The image actions (attach.ts), loaded on first use. */
export const loadImages = () => lazyImport(() => import('./attach'))
