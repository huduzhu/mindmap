import { t } from '../i18n'
import '../i18n/en/images'
import { MAX_IMAGE_SIDE } from '../map/image'
import { blobBytes, hashBytes, putAsset, type AssetMeta } from './store'
import { isAcceptableImageHeader } from './dimensions'

/**
 * Image processing for new images (#149, HC4, decision HC-D2). Loaded on
 * demand: nothing here is in the startup bundle.
 *
 * An added image is decoded, scaled so its longest side is at most 1600 px
 * and re-encoded as WebP at quality 0.85. A picture with transparency stays
 * PNG when the PNG is no bigger than the WebP or is small anyway (≤ 256 KB),
 * since screenshots with flat colours and diagrams often compress better
 * losslessly. Inputs over 8 MB and results over 2 MB are refused with a
 * translated message. A ≤256 px thumbnail is made for the map.
 *
 * The decoding and encoding sit behind `ImageCodec`, so tests pass their own
 * instead of a real canvas.
 */

export const MAX_INPUT_BYTES = 8 * 1024 * 1024
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
export const THUMB_SIDE = 256
export const WEBP_QUALITY = 0.85
const THUMB_QUALITY = 0.8
/** A transparent picture stays PNG up to this size even when WebP is smaller. */
export const SMALL_PNG_BYTES = 256 * 1024

export interface DecodedImage {
  width: number
  height: number
  /** Whether any pixel is not fully opaque. */
  hasAlpha(): boolean
  close(): void
}

export interface ImageCodec<I extends DecodedImage = DecodedImage> {
  decode(blob: Blob): Promise<I>
  /** Draw `image` at width×height and encode it; may return another type if unsupported. */
  encode(image: I, width: number, height: number, type: string, quality?: number): Promise<Blob>
}

export type ImageErrorCode = 'notImage' | 'tooLarge' | 'tooLargeAfter' | 'unreadable'

/** A refused image; `message` is translated. */
export class ImageError extends Error {
  readonly code: ImageErrorCode
  constructor(code: ImageErrorCode, message: string) {
    super(message)
    this.name = 'ImageError'
    this.code = code
  }
}

export interface ProcessedImage {
  blob: Blob
  /** Stored size in pixels. */
  w: number
  h: number
  thumb: Blob
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)

/** Scale (w, h) down so the longest side is at most `max`; never up. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** Whether `blob` claims to be a picture this app can take. */
export function isImageType(type: string): boolean {
  return /^image\//i.test(type) && !/svg/i.test(type)
}

/** Types that cannot hold transparency, so their pixels need not be checked. */
const OPAQUE_TYPES = /^image\/(jpe?g|bmp)$/i

async function makeThumb<I extends DecodedImage>(
  codec: ImageCodec<I>,
  image: I,
  w: number,
  h: number,
  stored: Blob,
): Promise<Blob> {
  if (Math.max(w, h) <= THUMB_SIDE) return stored
  const size = fitWithin(w, h, THUMB_SIDE)
  return codec.encode(image, size.w, size.h, 'image/webp', THUMB_QUALITY)
}

/**
 * Scale, re-encode and thumbnail `input` (HC4). Throws `ImageError` with a
 * translated message when it is too big, not a picture or unreadable.
 */
export async function processImage<I extends DecodedImage>(
  input: Blob,
  codec: ImageCodec<I>,
): Promise<ProcessedImage> {
  if (input.type && !isImageType(input.type)) {
    throw new ImageError('notImage', t('img.notImage'))
  }
  if (input.size > MAX_INPUT_BYTES) {
    throw new ImageError('tooLarge', t('img.tooLarge', { size: mb(input.size), max: '8' }))
  }
  let image: I
  try {
    image = await codec.decode(input)
  } catch {
    throw new ImageError('unreadable', t('img.unreadable'))
  }
  try {
    if (!(image.width > 0 && image.height > 0)) {
      throw new ImageError('unreadable', t('img.unreadable'))
    }
    const { w, h } = fitWithin(image.width, image.height, MAX_IMAGE_SIDE)
    let blob = await codec.encode(image, w, h, 'image/webp', WEBP_QUALITY)
    // A browser that cannot write WebP hands back PNG instead; that is fine.
    const transparent = !OPAQUE_TYPES.test(input.type) && image.hasAlpha()
    if (transparent && blob.type === 'image/webp') {
      const png = await codec.encode(image, w, h, 'image/png')
      if (png.size <= blob.size || png.size <= SMALL_PNG_BYTES) blob = png
    }
    if (blob.size > MAX_OUTPUT_BYTES) {
      throw new ImageError('tooLargeAfter', t('img.tooLargeAfter', { size: mb(blob.size) }))
    }
    const thumb = await makeThumb(codec, image, w, h, blob)
    return { blob, w, h, thumb }
  } finally {
    image.close()
  }
}

/** Process `input` and keep it in the asset store: what a node needs to show it. */
export async function storeImage<I extends DecodedImage>(
  input: Blob,
  codec: ImageCodec<I>,
): Promise<AssetMeta> {
  const processed = await processImage(input, codec)
  return putAsset(processed.blob, processed)
}

/**
 * Keep given bytes as they are (no re-encoding, so the hash stays the same),
 * measuring them and making the thumbnail: for an asset file that already has
 * a hash name, e.g. `_assets/<hash>.webp` from the sync folder or a backup.
 * Returns null when the bytes do not decode or do not match `expectedHash`.
 *
 * These bytes come from outside (another PC, a backup, GitHub), so before the
 * browser decodes them they must be at most `MAX_INPUT_BYTES` and carry a PNG,
 * WebP or JPEG header declaring at most 8000×8000 px: a small file claiming
 * huge dimensions would otherwise allocate gigabytes when decoded.
 */
export async function importAssetBlob<I extends DecodedImage>(
  blob: Blob,
  codec: ImageCodec<I>,
  expectedHash?: string,
): Promise<AssetMeta | null> {
  if (blob.size > MAX_INPUT_BYTES) return null
  const bytes = await blobBytes(blob)
  if (expectedHash && (await hashBytes(bytes)) !== expectedHash) return null
  if (!isAcceptableImageHeader(new Uint8Array(bytes))) return null
  let image: I
  try {
    image = await codec.decode(blob)
  } catch {
    return null
  }
  try {
    const { w, h } = fitWithin(image.width, image.height, MAX_IMAGE_SIDE)
    const thumb = await makeThumb(codec, image, image.width, image.height, blob)
    return await putAsset(blob, { w, h, thumb })
  } finally {
    image.close()
  }
}

// ---- The browser's codec ---------------------------------------------------

interface BitmapImage extends DecodedImage {
  bitmap: ImageBitmap
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

function canvasOf(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function draw(bitmap: ImageBitmap, width: number, height: number): AnyCanvas {
  const canvas = canvasOf(width, height)
  const context = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!context) throw new Error('no 2d context')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function toBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas)
    return canvas.convertToBlob(quality === undefined ? { type } : { type, quality })
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      type,
      quality,
    ),
  )
}

/** Any pixel not fully opaque, checked on a copy at most 512 px on its longest side. */
function bitmapHasAlpha(bitmap: ImageBitmap): boolean {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, 512)
  const canvas = draw(bitmap, w, h)
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | null
  const pixels = context?.getImageData(0, 0, w, h).data
  if (!pixels) return false
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) return true
  return false
}

export const browserCodec: ImageCodec<BitmapImage> = {
  async decode(blob) {
    const bitmap = await createImageBitmap(blob)
    let alpha: boolean | undefined
    return {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      hasAlpha: () => (alpha ??= bitmapHasAlpha(bitmap)),
      close: () => bitmap.close(),
    }
  },
  encode(image, width, height, type, quality) {
    return toBlob(draw(image.bitmap, width, height), type, quality)
  },
}
