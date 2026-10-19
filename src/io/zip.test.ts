import { describe, expect, it } from 'vitest'
import { crc32, zipStore } from './zip'

describe('zipStore', () => {
  it('computes the canonical CRC-32 of "123456789"', () => {
    const data = new TextEncoder().encode('123456789')
    expect(crc32(data)).toBe(0xcbf43926)
  })

  it('produces a parseable archive with local entries, central directory, and EOCD', () => {
    const encoder = new TextEncoder()
    const fixed = new Date(2026, 8, 1, 12, 0, 0)
    const zip = zipStore(
      [
        { name: 'map.html', data: encoder.encode('<html></html>') },
        { name: 'readme.txt', data: encoder.encode('hello') },
      ],
      fixed,
    )

    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const u32 = (offset: number) => view.getUint32(offset, true)
    const u16 = (offset: number) => view.getUint16(offset, true)

    expect(u32(0)).toBe(0x04034b50)
    const firstCrc = u32(14)
    expect(firstCrc).toBe(crc32(encoder.encode('<html></html>')))
    const firstSize = u32(18)
    expect(firstSize).toBe(13)
    const firstNameLen = u16(26)
    expect(firstNameLen).toBe(8)

    const secondOffset = 30 + firstNameLen + firstSize
    expect(u32(secondOffset)).toBe(0x04034b50)

    let cursor = secondOffset
    const secondNameLen = u16(cursor + 26)
    const secondSize = u32(cursor + 18)
    cursor += 30 + secondNameLen + secondSize

    expect(u32(cursor)).toBe(0x02014b50)
    expect(u16(cursor + 10)).toBe(0) // compression method: store

    const eocd = zip.length - 22
    expect(u32(eocd)).toBe(0x06054b50)
    expect(u16(eocd + 10)).toBe(2)
    expect(u32(eocd + 12)).toBe(zip.length - 22 - cursor)
  })

  it('flags non-ASCII entry names as UTF-8 (general-purpose bit 11)', () => {
    const encoder = new TextEncoder()
    const zip = zipStore([{ name: '产品路线图.html', data: encoder.encode('x') }])
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800)
    const ascii = zipStore([{ name: 'map.html', data: encoder.encode('x') }])
    expect(new DataView(ascii.buffer).getUint16(6, true)).toBe(0)
  })
})
