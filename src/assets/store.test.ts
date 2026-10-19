import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../test/resetDb'
import { makeTree } from '../test/fixtures'
import {
  assetBytesTotal,
  assetFileName,
  blobBytes,
  clearThumbCache,
  collectAssetRefs,
  deleteAsset,
  getAsset,
  getAssetMeta,
  getThumb,
  hasAsset,
  hashBytes,
  listAssetHashes,
  loadThumbUrl,
  peekThumbUrl,
  putAsset,
  refreshAsset,
  typeForFileName,
  watchThumb,
} from './store'

const png = (bytes: number[], type = 'image/png') => new Blob([new Uint8Array(bytes)], { type })
const read = async (blob: Blob | null) =>
  blob ? Array.from(new Uint8Array(await blobBytes(blob))) : null

const realCreate = URL.createObjectURL
const realRevoke = URL.revokeObjectURL
let made = 0
const revoked: string[] = []

beforeEach(async () => {
  await resetDatabase()
  clearThumbCache()
  made = 0
  revoked.length = 0
  URL.createObjectURL = () => `blob:test/${(made += 1)}`
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url)
  }
})

afterEach(() => {
  URL.createObjectURL = realCreate
  URL.revokeObjectURL = realRevoke
})

describe('asset store (#149, HC2)', () => {
  it('hashes bytes as sha256-<hex>', async () => {
    const data = new TextEncoder().encode('test').buffer as ArrayBuffer
    expect(await hashBytes(data)).toBe(
      'sha256-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    )
  })

  it('keeps the same bytes once and reads them back', async () => {
    const first = await putAsset(
      png([1, 2, 3, 4]),
      { w: 30, h: 20, thumb: png([9]) },
      new Date('2026-10-01T00:00:00Z'),
    )
    expect(first).toMatchObject({ type: 'image/png', w: 30, h: 20, bytes: 5 })
    expect(first.hash).toMatch(/^sha256-[0-9a-f]{64}$/)
    const again = await putAsset(
      png([1, 2, 3, 4]),
      { w: 30, h: 20, thumb: png([9]) },
      new Date('2026-10-05T00:00:00Z'),
    )
    expect(again.hash).toBe(first.hash)
    expect(again.createdAt).toBe('2026-10-01T00:00:00.000Z')
    expect(again.lastUsedAt).toBe('2026-10-05T00:00:00.000Z')
    expect(await listAssetHashes()).toEqual([first.hash])
    expect(await read(await getAsset(first.hash))).toEqual([1, 2, 3, 4])
    expect((await getAsset(first.hash))!.type).toBe('image/png')
    expect(await read(await getThumb(first.hash))).toEqual([9])
    expect(await hasAsset(first.hash)).toBe(true)
    expect(await getAssetMeta(first.hash)).toMatchObject({ w: 30, h: 20 })

    const other = await putAsset(png([5, 6], 'image/webp'), { w: 2, h: 2, thumb: png([7, 7]) })
    expect(await assetBytesTotal()).toBe(5 + 4)
    await deleteAsset(other.hash)
    expect(await hasAsset(other.hash)).toBe(false)
    expect(await getAsset(other.hash)).toBeNull()
    expect(await getThumb(other.hash)).toBeNull()
    expect(await assetBytesTotal()).toBe(5)
  })

  it('names asset files by hash and type', () => {
    expect(assetFileName('sha256-ab', 'image/webp')).toBe('sha256-ab.webp')
    expect(assetFileName('sha256-ab', 'image/jpeg')).toBe('sha256-ab.jpg')
    expect(typeForFileName('sha256-ab.PNG')).toBe('image/png')
    expect(typeForFileName('notes.txt')).toBeNull()
  })

  it('collects the assets trees refer to', () => {
    const image = (asset: string) => ({ asset, w: 1, h: 1 })
    const refs = collectAssetRefs([
      makeTree('r', 'R', [makeTree('a', 'A', [], { image: image('sha256-1') })]),
      undefined,
      makeTree('s', 'S', [], { image: image('sha256-2') }),
    ])
    expect([...refs].sort()).toEqual(['sha256-1', 'sha256-2'])
  })
})

describe('thumbnail URLs (#149, HC5)', () => {
  it('loads a thumbnail once, reports a missing one, and retries when it arrives', async () => {
    const meta = await putAsset(png([1]), { w: 1, h: 1, thumb: png([2]) })
    expect(peekThumbUrl(meta.hash)).toBeUndefined()
    const url = await loadThumbUrl(meta.hash)
    expect(url).toBe('blob:test/1')
    expect(await loadThumbUrl(meta.hash)).toBe(url)
    expect(made).toBe(1)

    const missing = `sha256-${'0'.repeat(64)}`
    let calls = 0
    const stop = watchThumb(missing, () => (calls += 1))
    expect(await loadThumbUrl(missing)).toBeNull()
    expect(peekThumbUrl(missing)).toBeNull()
    expect(calls).toBe(1)
    refreshAsset(missing)
    expect(peekThumbUrl(missing)).toBeUndefined()
    expect(calls).toBe(2)
    stop()
  })

  it('revokes URLs of thumbnails nobody shows, never a shown one', async () => {
    const hashes: string[] = []
    for (let i = 0; i < 203; i += 1) {
      hashes.push((await putAsset(png([i % 256, i >> 8]), { w: 1, h: 1, thumb: png([i]) })).hash)
    }
    const stop = watchThumb(hashes[0], () => undefined)
    for (const hash of hashes) await loadThumbUrl(hash)
    // 202 unwatched thumbnails, 200 kept: the two oldest unwatched ones go.
    expect(revoked).toHaveLength(2)
    expect(peekThumbUrl(hashes[0])).toBe('blob:test/1')
    expect(peekThumbUrl(hashes[1])).toBeUndefined()
    stop()
  })
})
