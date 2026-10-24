/**
 * Image size from the file header, read without decoding (#149 hardening).
 * Asset files that arrive from the sync folder, backups, ZIP imports and
 * GitHub milestones are checked with this before the browser decodes them, so
 * a small file that claims huge dimensions (a decompression bomb) is refused
 * instead of allocating gigabytes of pixels.
 *
 * Covers the formats the app stores: PNG (IHDR), WebP (VP8, VP8L, VP8X) and
 * JPEG (the first SOF marker). Anything else, or a damaged header, gives null.
 */

/** Longest side accepted for an imported asset file. Stored images are ≤ 1600 px. */
export const MAX_IMPORT_SIDE = 8000

export interface HeaderSize {
  type: 'image/png' | 'image/webp' | 'image/jpeg'
  width: number
  height: number
}

/**
 * One byte, or 0 past the end. Every caller combines bytes with bitwise
 * operators, which already read a missing byte (undefined) as 0.
 */
const byteAt = (b: Uint8Array, i: number): number => b[i] ?? 0
const u16be = (b: Uint8Array, i: number) => (byteAt(b, i) << 8) | byteAt(b, i + 1)
const u16le = (b: Uint8Array, i: number) => byteAt(b, i) | (byteAt(b, i + 1) << 8)
const u24le = (b: Uint8Array, i: number) =>
  byteAt(b, i) | (byteAt(b, i + 1) << 8) | (byteAt(b, i + 2) << 16)
const u32be = (b: Uint8Array, i: number) =>
  ((byteAt(b, i) << 24) | (byteAt(b, i + 1) << 16) | (byteAt(b, i + 2) << 8) | byteAt(b, i + 3)) >>>
  0
const ascii = (b: Uint8Array, i: number, text: string) => {
  for (let k = 0; k < text.length; k++) if (b[i + k] !== text.charCodeAt(k)) return false
  return true
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngSize(b: Uint8Array): HeaderSize | null {
  if (b.length < 24 || !PNG_SIGNATURE.every((byte, i) => b[i] === byte)) return null
  if (u32be(b, 8) !== 13 || !ascii(b, 12, 'IHDR')) return null
  return { type: 'image/png', width: u32be(b, 16), height: u32be(b, 20) }
}

function webpSize(b: Uint8Array): HeaderSize | null {
  if (b.length < 16 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null
  if (ascii(b, 12, 'VP8 ')) {
    // Lossy: a 3-byte frame tag, the start code 9d 01 2a, then 14-bit sizes.
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { type: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
  }
  if (ascii(b, 12, 'VP8L')) {
    // Lossless: signature 0x2f, then width-1 and height-1 in 14 bits each.
    if (b.length < 25 || b[20] !== 0x2f) return null
    const bits = (u24le(b, 21) | (byteAt(b, 24) << 24)) >>> 0
    return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (ascii(b, 12, 'VP8X')) {
    // Extended: canvas width-1 and height-1, 24 bits each.
    if (b.length < 30) return null
    return { type: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  }
  return null
}

function jpegSize(b: Uint8Array): HeaderSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    // In range: the loop condition leaves at least four bytes from i.
    const marker = byteAt(b, i + 1)
    if (marker === 0xff) {
      i += 1 // fill byte
      continue
    }
    // Markers without a length: TEM and RST0–7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null // end of image / scan before any frame
    const length = u16be(b, i + 2)
    if (length < 2) return null
    // SOF0–SOF15, except DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return null
      return { type: 'image/jpeg', width: u16be(b, i + 7), height: u16be(b, i + 5) }
    }
    i += 2 + length
  }
  return null
}

/** The type and size a PNG, WebP or JPEG header declares, or null. */
export function imageHeaderSize(bytes: Uint8Array): HeaderSize | null {
  return pngSize(bytes) ?? webpSize(bytes) ?? jpegSize(bytes)
}

/** Whether the header is readable and declares a size this app will decode. */
export function isAcceptableImageHeader(bytes: Uint8Array): boolean {
  const size = imageHeaderSize(bytes)
  return (
    size !== null &&
    size.width > 0 &&
    size.height > 0 &&
    size.width <= MAX_IMPORT_SIDE &&
    size.height <= MAX_IMPORT_SIDE
  )
}
