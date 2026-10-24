import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../test/resetDb'
import { imageHeader, testImageBytes } from '../test/fakeCodec'
import { imageHeaderSize, MAX_IMPORT_SIDE } from './dimensions'
import {
  fitWithin,
  ImageError,
  importAssetBlob,
  MAX_INPUT_BYTES,
  processImage,
  storeImage,
  type DecodedImage,
  type ImageCodec,
} from './process'
import { getThumb, hasAsset, listAssetHashes } from './store'

interface FakeImage extends DecodedImage {
  alpha: boolean
}

interface EncodeCall {
  width: number
  height: number
  type: string
  quality?: number | undefined
}

/**
 * A codec without a canvas: decoding reports a fixed size, encoding returns a
 * blob of a chosen size per type (`sizes`), so the rules can be checked.
 */
function fakeCodec(
  options: {
    width?: number
    height?: number
    alpha?: boolean
    sizes?: Partial<Record<string, (w: number, h: number) => number>>
    failDecode?: boolean
    noWebp?: boolean
  } = {},
) {
  const calls: EncodeCall[] = []
  let closed = 0
  const codec: ImageCodec<FakeImage> = {
    async decode() {
      if (options.failDecode) throw new Error('bad')
      const alpha = options.alpha ?? false
      const image: FakeImage = {
        width: options.width ?? 3200,
        height: options.height ?? 1600,
        alpha,
        hasAlpha: () => alpha,
        close: () => {
          closed += 1
        },
      }
      return image
    },
    async encode(_image, width, height, type, quality) {
      calls.push({ width, height, type, quality })
      const actual = options.noWebp && type === 'image/webp' ? 'image/png' : type
      const size = options.sizes?.[actual]?.(width, height) ?? 1000
      return new Blob([new Uint8Array(size).fill(width % 251)], { type: actual })
    },
  }
  return { codec, calls, closed: () => closed }
}

const input = (bytes = 5000, type = 'image/png') =>
  new Blob([new Uint8Array(bytes)], { type }) as Blob

beforeEach(async () => {
  await resetDatabase()
})

describe('image processing (#149, HC4)', () => {
  it('scales the longest side to 1600 px and encodes WebP at 0.85, with a 256 px thumbnail', async () => {
    const { codec, calls, closed } = fakeCodec()
    const result = await processImage(input(), codec)
    expect(result).toMatchObject({ w: 1600, h: 800 })
    expect(result.blob.type).toBe('image/webp')
    expect(calls[0]).toEqual({ width: 1600, height: 800, type: 'image/webp', quality: 0.85 })
    expect(calls.at(-1)).toMatchObject({ width: 256, height: 128, type: 'image/webp' })
    expect(closed()).toBe(1)
  })

  it('never scales up, and a small picture is its own thumbnail', async () => {
    const { codec, calls } = fakeCodec({ width: 200, height: 100 })
    const result = await processImage(input(), codec)
    expect(result).toMatchObject({ w: 200, h: 100 })
    expect(result.thumb).toBe(result.blob)
    expect(calls).toHaveLength(1)
    expect(fitWithin(10, 4000, 1600)).toEqual({ w: 4, h: 1600 })
  })

  it('keeps PNG for a transparent picture when the PNG is no bigger or small', async () => {
    // PNG bigger than WebP but small (≤ 256 KB): PNG.
    let { codec } = fakeCodec({ alpha: true, sizes: { 'image/png': () => 2000 } })
    expect((await processImage(input(), codec)).blob.type).toBe('image/png')
    // PNG big and bigger than WebP: WebP.
    ;({ codec } = fakeCodec({
      alpha: true,
      sizes: { 'image/png': () => 900_000, 'image/webp': () => 300_000 },
    }))
    expect((await processImage(input(), codec)).blob.type).toBe('image/webp')
    // PNG big but no bigger than WebP: PNG.
    ;({ codec } = fakeCodec({
      alpha: true,
      sizes: { 'image/png': () => 400_000, 'image/webp': () => 500_000 },
    }))
    expect((await processImage(input(), codec)).blob.type).toBe('image/png')
    // Opaque: WebP, and the PNG is never made.
    const opaque = fakeCodec({ sizes: { 'image/png': () => 10 } })
    expect((await processImage(input(), opaque.codec)).blob.type).toBe('image/webp')
    expect(opaque.calls.some((call) => call.type === 'image/png')).toBe(false)
    // A JPEG is not checked for transparency at all.
    const jpeg = fakeCodec({ alpha: true })
    expect((await processImage(input(5000, 'image/jpeg'), jpeg.codec)).blob.type).toBe('image/webp')
  })

  it('takes PNG from a browser that cannot write WebP', async () => {
    const { codec } = fakeCodec({ noWebp: true, alpha: true })
    expect((await processImage(input(), codec)).blob.type).toBe('image/png')
  })

  it('refuses inputs over 8 MB and results over 2 MB with translated messages', async () => {
    const { codec } = fakeCodec()
    const huge = { size: MAX_INPUT_BYTES + 1, type: 'image/png' } as Blob
    await expect(processImage(huge, codec)).rejects.toMatchObject({
      code: 'tooLarge',
      message: 'This picture is 8.0 MB; pictures up to 8 MB can be added.',
    })
    const big = fakeCodec({ sizes: { 'image/webp': () => 2 * 1024 * 1024 + 1 } })
    const error = await processImage(input(), big.codec).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImageError)
    expect((error as ImageError).code).toBe('tooLargeAfter')
    expect(big.closed()).toBe(1)
    await expect(processImage(input(10, 'text/plain'), codec)).rejects.toMatchObject({
      code: 'notImage',
    })
    await expect(processImage(input(10, 'image/svg+xml'), codec)).rejects.toMatchObject({
      code: 'notImage',
    })
    await expect(
      processImage(input(), fakeCodec({ failDecode: true }).codec),
    ).rejects.toMatchObject({ code: 'unreadable', message: 'This picture could not be read.' })
  })

  it('stores the processed picture once, with its thumbnail', async () => {
    const { codec } = fakeCodec()
    const meta = await storeImage(input(), codec)
    expect(meta).toMatchObject({ w: 1600, h: 800, type: 'image/webp' })
    expect(await hasAsset(meta.hash)).toBe(true)
    expect((await getThumb(meta.hash))!.size).toBe(1000)
    expect((await storeImage(input(), codec)).hash).toBe(meta.hash)
  })

  it('imports given bytes unchanged, checking the expected hash', async () => {
    const { codec, calls } = fakeCodec({ width: 100, height: 50 })
    const blob = new Blob([testImageBytes('given')], { type: 'image/webp' })
    const meta = await importAssetBlob(blob, codec)
    expect(meta).toMatchObject({ w: 100, h: 50, bytes: blob.size * 2 })
    expect(calls).toHaveLength(0)
    expect(await importAssetBlob(blob, codec, meta!.hash)).not.toBeNull()
    const other = new Blob([new Uint8Array([9])], { type: 'image/png' })
    expect(await importAssetBlob(other, codec, `sha256-${'0'.repeat(64)}`)).toBeNull()
    expect(await listAssetHashes()).toEqual([meta!.hash])
    expect(await importAssetBlob(blob, fakeCodec({ failDecode: true }).codec)).toBeNull()
  })

  it('refuses imported files over 8 MB, without a known header, or claiming huge sizes', async () => {
    const { codec, calls } = fakeCodec({ width: 100, height: 50 })
    const blobOf = (bytes: Uint8Array<ArrayBuffer>, type = 'image/png') =>
      new Blob([bytes], { type })
    expect(await importAssetBlob(blobOf(new Uint8Array([1, 2, 3])), codec)).toBeNull()
    const huge = imageHeader('image/png', MAX_IMPORT_SIDE + 1, 10)
    expect(await importAssetBlob(blobOf(huge), codec)).toBeNull()
    const tall = imageHeader('image/webp', 10, MAX_IMPORT_SIDE + 1)
    expect(await importAssetBlob(blobOf(tall, 'image/webp'), codec)).toBeNull()
    const empty = imageHeader('image/jpeg', 0, 10)
    expect(await importAssetBlob(blobOf(empty, 'image/jpeg'), codec)).toBeNull()
    const big = new Uint8Array(MAX_INPUT_BYTES + 1)
    big.set(imageHeader('image/png', 10, 10))
    expect(await importAssetBlob(blobOf(big), codec)).toBeNull()
    expect(calls).toHaveLength(0)
    expect(await listAssetHashes()).toEqual([])
    const edge = imageHeader('image/jpeg', MAX_IMPORT_SIDE, MAX_IMPORT_SIDE)
    expect(await importAssetBlob(blobOf(edge, 'image/jpeg'), codec)).not.toBeNull()
  })
})

describe('image header sizes', () => {
  it('reads PNG, WebP (VP8X, VP8, VP8L) and JPEG headers', () => {
    expect(imageHeaderSize(imageHeader('image/png', 640, 480))).toEqual({
      type: 'image/png',
      width: 640,
      height: 480,
    })
    expect(imageHeaderSize(imageHeader('image/webp', 16383, 2))).toMatchObject({
      width: 16383,
      height: 2,
    })
    expect(imageHeaderSize(imageHeader('image/jpeg', 1200, 900))).toMatchObject({
      type: 'image/jpeg',
      width: 1200,
      height: 900,
    })

    const riff = (chunk: string, body: number[]) =>
      new Uint8Array([...new TextEncoder().encode(`RIFF\0\0\0\0WEBP${chunk}\0\0\0\0`), ...body])
    // Lossy: frame tag, start code 9d 01 2a, 14-bit width and height (little-endian).
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02])
    expect(imageHeaderSize(lossy)).toMatchObject({ width: 800, height: 600 })
    // Lossless: 0x2f, then (width-1) and (height-1) in 14 bits each.
    const bits = 799 | (599 << 14)
    const lossless = riff('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, 0])
    expect(imageHeaderSize(lossless)).toMatchObject({ width: 800, height: 600 })
  })

  it('finds the JPEG frame after other segments, and gives null for damaged headers', () => {
    const app0 = [0xff, 0xe0, 0, 6, 1, 2, 3, 4]
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      ...app0,
      ...imageHeader('image/jpeg', 30, 20).slice(2),
    ])
    expect(imageHeaderSize(jpeg)).toMatchObject({ width: 30, height: 20 })
    expect(imageHeaderSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull()
    expect(imageHeaderSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]))).toBeNull()
    expect(imageHeaderSize(imageHeader('image/png', 5, 5).slice(0, 20))).toBeNull()
    expect(imageHeaderSize(new TextEncoder().encode('GIF89a......'))).toBeNull()
    expect(imageHeaderSize(new Uint8Array())).toBeNull()
  })
})
