import { crc32, type ZipEntry } from './zip'
import { t } from '../i18n'
import '../i18n/en/files'

/**
 * Minimal ZIP reader, the inverse of `zipStore` (#82). Reads the central
 * directory, supports stored entries and — where the browser has
 * DecompressionStream — deflated ones, so a backup the user re-zipped with
 * their OS still restores. Every entry's CRC is checked.
 */

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_MIN_SIZE = 22
const MAX_COMMENT = 0xffff

/** Largest single entry restored (inflated), and the largest total. */
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024
export const MAX_TOTAL_BYTES = 512 * 1024 * 1024

/**
 * Inflates into a buffer of the entry's declared size and stops as soon as the
 * output would exceed it, so a ZIP bomb (a tiny entry that inflates to
 * gigabytes) is rejected after at most `size` bytes instead of exhausting
 * memory. The caller has already checked `size` against the caps.
 */
async function inflateRaw(data: Uint8Array, size: number, name: string): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError(t('zip.noDeflate'))
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  }).pipeThrough(
    // lib.dom types the writable side as BufferSource; Uint8Array chunks are fine.
    new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>,
  )
  const out = new Uint8Array(size)
  let length = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (length + value.length > size) {
      await reader.cancel().catch(() => undefined)
      throw new ZipError(t('zip.checksum', { name }))
    }
    out.set(value, length)
    length += value.length
  }
  return length === size ? out : out.subarray(0, length)
}

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  )
}

export async function unzip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()

  // The end-of-central-directory record sits at the end, before a comment of
  // up to 64 KiB, so search backwards for its signature.
  let eocd = -1
  const stop = Math.max(0, bytes.length - EOCD_MIN_SIZE - MAX_COMMENT)
  for (let i = bytes.length - EOCD_MIN_SIZE; i >= stop; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ZipError(t('zip.notZip'))

  const count = view.getUint16(eocd + 10, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || centralOffset === 0xffffffff) {
    throw new ZipError(t('zip.zip64'))
  }

  // First pass: read the central directory and check the declared sizes, so an
  // oversized archive is refused before anything is inflated. inflateRaw never
  // produces more than an entry's declared size, so the caps hold afterwards.
  const headers: {
    name: string
    method: number
    crc: number
    compressedSize: number
    size: number
    localOffset: number
  }[] = []
  let total = 0
  let cursor = centralOffset
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new ZipError(t('zip.badDirectory'))
    }
    const method = view.getUint16(cursor + 10, true)
    const crc = view.getUint32(cursor + 16, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue // directory entry
    total += size
    if (size > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
      throw new ZipError(t('zip.tooLarge', { name }))
    }
    headers.push({ name, method, crc, compressedSize, size, localOffset })
  }

  const entries: ZipEntry[] = []
  for (const { name, method, crc, compressedSize, size, localOffset } of headers) {
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new ZipError(t('zip.noLocal', { name }))
    }
    const localName = view.getUint16(localOffset + 26, true)
    const localExtra = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localName + localExtra
    if (start + compressedSize > bytes.length) {
      throw new ZipError(t('zip.truncated', { name }))
    }
    const raw = bytes.subarray(start, start + compressedSize)
    let data: Uint8Array
    if (method === 0) data = raw.slice()
    else if (method === 8) data = await inflateRaw(raw, size, name)
    else throw new ZipError(t('zip.method', { name, method }))
    if (data.length !== size || crc32(data) !== crc) {
      throw new ZipError(t('zip.checksum', { name }))
    }
    entries.push({ name, data })
  }
  return entries
}
