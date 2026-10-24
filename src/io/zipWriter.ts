// The store-only ZIP writer. It imports nothing, so scripts/package-zip.mjs can
// load it straight from this TypeScript source under plain Node; the app uses
// zipStore from ./zip, which adds a translated message for too many entries.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  // Both reads are in range (i < length, index & 0xff < 256); the fallbacks never apply.
  for (let i = 0; i < data.length; i++)
    crc = (CRC_TABLE[(crc ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

/**
 * The end record counts entries in 16 bits, and 0xffff means ZIP64 (#189):
 * an archive must hold fewer than this many entries.
 */
export const MAX_ZIP_ENTRIES = 0xffff

export function zipStore(entries: ZipEntry[], timestamp = new Date()): Uint8Array<ArrayBuffer> {
  // More would wrap the count, and unzip would silently read fewer files.
  if (entries.length >= MAX_ZIP_ENTRIES) {
    throw new RangeError(`Too many files for one ZIP (${entries.length}).`)
  }
  const { time, date } = dosDateTime(timestamp)
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  const u16 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
  const u32 = (value: number) =>
    new Uint8Array([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ])

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    // General-purpose bit 11: the name is UTF-8. Required now that export
    // filenames keep non-ASCII letters (#51); otherwise unzip tools read it as CP437.
    const flags = nameBytes.length === entry.name.length ? 0 : 0x0800

    const localHeader = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(flags),
      ...u16(0),
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(entry.data.length),
      ...u32(entry.data.length),
      ...u16(nameBytes.length),
      ...u16(0),
    ])
    localParts.push(localHeader, nameBytes, entry.data)

    const centralHeader = new Uint8Array([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(flags),
      ...u16(0),
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(entry.data.length),
      ...u32(entry.data.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
    ])
    centralParts.push(centralHeader, nameBytes)

    offset += localHeader.length + nameBytes.length + entry.data.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),
  ])

  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of [...localParts, ...centralParts, end]) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}
