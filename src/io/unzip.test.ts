// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isZip, MAX_ENTRY_BYTES, unzip, ZipError } from './unzip'
import { crc32, zipStore } from './zip'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** A one-entry archive whose entry is deflated, as OS "compress" tools make. */
async function deflatedZip(name: string, text: string): Promise<Uint8Array> {
  return deflatedZipOf(name, encoder.encode(text))
}

/**
 * Like deflatedZip, but `declaredSize` (default: the real size) is what the
 * headers claim, as in a ZIP bomb.
 */
async function deflatedZipOf(
  name: string,
  data: Uint8Array,
  declaredSize = data.length,
): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  }).pipeThrough(
    // lib.dom types the writable side as BufferSource; Uint8Array chunks are fine.
    new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>,
  )
  const packed = new Uint8Array(await new Response(stream).arrayBuffer())
  const stored = zipStore([{ name, data: packed }])
  const view = new DataView(stored.buffer)
  // Patch method (8), CRC and uncompressed size in the local and central headers.
  const central = view.getUint32(stored.length - 22 + 16, true)
  for (const [header, method, crc, size] of [
    [0, 8, 14, 22],
    [central, 10, 16, 24],
  ]) {
    view.setUint16(header + method, 8, true)
    view.setUint32(header + crc, crc32(data), true)
    view.setUint32(header + size, declaredSize, true)
  }
  return stored
}

describe('unzip (#82)', () => {
  it('reads back what zipStore wrote, names included', async () => {
    const zip = zipStore([
      { name: 'manifest.json', data: encoder.encode('{"a":1}') },
      { name: 'projects/思维导图-1.json', data: encoder.encode('{"b":2}') },
      { name: 'empty.txt', data: new Uint8Array() },
    ])
    expect(isZip(zip)).toBe(true)
    const entries = await unzip(zip)
    expect(entries.map((entry) => entry.name)).toEqual([
      'manifest.json',
      'projects/思维导图-1.json',
      'empty.txt',
    ])
    expect(decoder.decode(entries[1].data)).toBe('{"b":2}')
    expect(entries[2].data).toHaveLength(0)
  })

  it('reads an empty archive', async () => {
    expect(await unzip(zipStore([]))).toEqual([])
  })

  it('refuses a file that is not a ZIP', async () => {
    const bytes = encoder.encode('{"kind":"project"}')
    expect(isZip(bytes)).toBe(false)
    await expect(unzip(bytes)).rejects.toBeInstanceOf(ZipError)
  })

  it('refuses an entry whose checksum does not match', async () => {
    const zip = zipStore([{ name: 'a.json', data: encoder.encode('hello') }])
    zip[30 + 'a.json'.length] ^= 0xff // flip a data byte in the first entry
    await expect(unzip(zip)).rejects.toThrow(/checksum/)
  })

  it('refuses a truncated archive', async () => {
    const zip = zipStore([{ name: 'a.json', data: encoder.encode('hello world') }])
    await expect(unzip(zip.subarray(0, zip.length - 30))).rejects.toBeInstanceOf(ZipError)
  })

  it.skipIf(typeof CompressionStream === 'undefined')(
    'reads deflated entries too (a backup re-zipped by the OS)',
    async () => {
      const text = 'mind map '.repeat(200)
      const [entry] = await unzip(await deflatedZip('notes.txt', text))
      expect(entry.name).toBe('notes.txt')
      expect(decoder.decode(entry.data)).toBe(text)
    },
  )

  it.skipIf(typeof DecompressionStream === 'undefined')(
    'reports a corrupt deflate stream as a damaged entry, not a blank error',
    async () => {
      // 0xff starts a block of the reserved type 3, which no inflater accepts.
      const zip = zipStore([{ name: 'bad.json', data: new Uint8Array([0xff, 0xff, 0xff, 0xff]) }])
      const view = new DataView(zip.buffer)
      const central = view.getUint32(zip.length - 22 + 16, true)
      view.setUint16(8, 8, true)
      view.setUint16(central + 10, 8, true)
      const error = await unzip(zip).then(
        () => null,
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(ZipError)
      expect((error as ZipError).message).toMatch(/checksum/)
      expect((error as ZipError).message).toContain('bad.json')
    },
  )

  it('refuses a directory entry whose name runs past the end of the file', async () => {
    const zip = zipStore([{ name: 'a.json', data: encoder.encode('hello') }])
    const view = new DataView(zip.buffer)
    const central = view.getUint32(zip.length - 22 + 16, true)
    // Claim a longer name than the bytes left; today it is silently cut short.
    view.setUint16(central + 28, zip.length - central, true)
    await expect(unzip(zip)).rejects.toThrow(/central directory/)
  })

  it('refuses an entry whose declared size is over the cap, before reading it', async () => {
    const zip = zipStore([{ name: 'big.bin', data: encoder.encode('x') }])
    const view = new DataView(zip.buffer)
    const central = view.getUint32(zip.length - 22 + 16, true)
    view.setUint32(central + 24, MAX_ENTRY_BYTES + 1, true)
    await expect(unzip(zip)).rejects.toThrow(/too large/)
  })

  it('refuses archives whose entries together exceed the total cap', async () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({
      name: `e${i}`,
      data: new Uint8Array(1),
    }))
    const zip = zipStore(entries)
    const view = new DataView(zip.buffer)
    let cursor = view.getUint32(zip.length - 22 + 16, true)
    for (let i = 0; i < entries.length; i++) {
      view.setUint32(cursor + 24, MAX_ENTRY_BYTES, true) // 9 × 256 MB > 1 GB
      cursor += 46 + view.getUint16(cursor + 28, true)
    }
    await expect(unzip(zip)).rejects.toThrow(/too large/)
  })

  it.skipIf(typeof CompressionStream === 'undefined')(
    'stops inflating a ZIP bomb once it passes the declared size',
    async () => {
      // 32 MB of zeros deflates to ~32 KB; the headers claim 1 KB.
      const bomb = await deflatedZipOf('bomb.bin', new Uint8Array(32 * 1024 * 1024), 1024)
      expect(bomb.length).toBeLessThan(100_000)
      const started = performance.now()
      await expect(unzip(bomb)).rejects.toBeInstanceOf(ZipError)
      expect(performance.now() - started).toBeLessThan(2000)
    },
  )
})
