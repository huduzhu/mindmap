import type { DecodedImage, ImageCodec } from '../assets/process'
import { blobBytes, putAsset, type AssetMeta } from '../assets/store'

/**
 * A codec without a canvas (#149): every picture decodes as `width`×`height`
 * (bytes starting with "BAD" fail to decode) and encoding returns a few bytes
 * of the requested type.
 */
export function simpleCodec(width = 100, height = 50): ImageCodec<DecodedImage> {
  return {
    async decode(blob) {
      const head = new TextDecoder().decode(new Uint8Array(await blobBytes(blob)).slice(0, 3))
      if (head === 'BAD') throw new Error('not a picture')
      return { width, height, hasAlpha: () => false, close: () => undefined }
    },
    async encode(_image, w, h, type) {
      return new Blob([new Uint8Array([w % 256, h % 256, 7])], { type })
    },
  }
}

/** A stored picture made of `seed`'s bytes, as if pasted on this PC (on 1 Sep 2026). */
export async function storeTestImage(
  seed: string,
  type = 'image/webp',
  now = new Date('2026-09-01T00:00:00.000Z'),
): Promise<AssetMeta> {
  const blob = new Blob([testImageBytes(seed, type)], { type })
  return putAsset(blob, { w: 100, h: 50, thumb: new Blob([new Uint8Array([1])], { type }) }, now)
}

/**
 * Just the header of a `type` picture of width×height (PNG IHDR, WebP VP8X or
 * JPEG SOF0): enough for the size check that runs before decoding.
 */
export function imageHeader(type: string, width: number, height: number): Uint8Array<ArrayBuffer> {
  if (type === 'image/png') {
    const b = new Uint8Array(33)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    const view = new DataView(b.buffer)
    view.setUint32(16, width)
    view.setUint32(20, height)
    b.set([8, 6], 24)
    return b
  }
  if (type === 'image/jpeg') {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0])
    const view = new DataView(b.buffer)
    view.setUint16(7, height)
    view.setUint16(9, width)
    return b
  }
  const b = new Uint8Array(30)
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)))
  b.set(
    [...'WEBPVP8X'].map((c) => c.charCodeAt(0)),
    8,
  )
  const view = new DataView(b.buffer)
  view.setUint32(4, 22, true)
  view.setUint32(16, 10, true)
  for (const [at, value] of [
    [24, width - 1],
    [27, height - 1],
  ]) {
    b[at] = value & 0xff
    b[at + 1] = (value >> 8) & 0xff
    b[at + 2] = (value >> 16) & 0xff
  }
  return b
}

/** A test picture: a valid header for `type`, then `seed` so each one hashes apart. */
export function testImageBytes(seed: string, type = 'image/webp', width = 100, height = 50) {
  const header = imageHeader(type, width, height)
  const body = new TextEncoder().encode(`image:${seed}`)
  const bytes = new Uint8Array(header.length + body.length)
  bytes.set(header)
  bytes.set(body, header.length)
  return bytes
}
