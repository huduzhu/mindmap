import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRecord, SyncRecord } from '../io/db'
import type { Project } from '../schema/types'
import { setImageCodec } from '../assets/codec'
import { assetFileName, blobBytes, clearThumbCache, getAsset, hasAsset } from '../assets/store'
import { FakeDirectory } from '../test/fakeDirectory'
import { simpleCodec, storeTestImage } from '../test/fakeCodec'
import { makeProject, makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { ASSETS_DIR, assetSync, hashFromAssetName } from './assets'
import { projectFileText, reconcile, type EngineDeps } from './engine'
import { wrapHandle } from './folder'
import { fileNameFor } from './names'

const ID = 'PHOTOPROJ1'
const STAMP = '2026-10-01T00:00:00.000Z'

function withImage(asset: string, alt?: string): Project {
  const photo = {
    ...makeTree('p1', 'Photo'),
    image: { asset, w: 100, h: 50, ...(alt ? { alt } : {}) },
  }
  return makeProject('Kitchen', undefined, makeTree('m', 'Kitchen', [photo]))
}

/** One PC's browser library, wired to the engine like the controller does. */
function library(initial: ProjectRecord[] = []) {
  const records = new Map(initial.map((r) => [r.id, r]))
  const sync = new Map<string, SyncRecord>()
  const rejected = new Set<string>()
  const deps = (dir: FakeDirectory): EngineDeps => {
    const folder = wrapHandle(dir, [0, 0])
    return {
      folder,
      listRecords: async () => [...records.values()],
      listSync: async () => [...sync.values()],
      putSync: async (r) => void sync.set(r.projectId, r),
      deleteSync: async (id) => void sync.delete(id),
      adopt: async (id, p) => {
        const updatedAt = p.updatedAt ?? STAMP
        records.set(id, { id, project: { ...p, updatedAt }, updatedAt })
        return 'applied'
      },
      addCopies: async () => undefined,
      trash: async () => 'trashed',
      conflictLabel: () => 'copy',
      assets: assetSync(folder, rejected),
    }
  }
  return { records, sync, deps }
}

const bytesOf = async (blob: Blob | null) =>
  blob ? Array.from(new Uint8Array(await blobBytes(blob))) : null

beforeEach(async () => {
  await resetDatabase()
  clearThumbCache()
  setImageCodec(simpleCodec())
})

afterEach(() => setImageCodec(null))

describe('images in the sync folder (#149, HC8)', () => {
  it('names asset files by hash and reads the hash back', () => {
    const hash = `sha256-${'a'.repeat(64)}`
    expect(hashFromAssetName(`${hash}.webp`)).toBe(hash)
    expect(hashFromAssetName(`${hash}.png`)).toBe(hash)
    expect(hashFromAssetName(`${hash}-LAPTOP.webp`)).toBeNull()
    expect(hashFromAssetName(`${hash}.json`)).toBeNull()
    expect(hashFromAssetName('notes.webp')).toBeNull()
  })

  it('two PCs exchange a project with an image', async () => {
    const dir = new FakeDirectory('MindMaps')
    const meta = await storeTestImage('kitchen')
    const original = await bytesOf(await getAsset(meta.hash))
    const pcA = library([{ id: ID, project: withImage(meta.hash, 'Bench'), updatedAt: STAMP }])
    const reportA = await reconcile(pcA.deps(dir))
    expect(reportA.written).toBe(1)
    const assets = dir.dirs.get(ASSETS_DIR)!
    const file = assetFileName(meta.hash, 'image/webp')
    expect([...assets.files.keys()]).toEqual([file])
    expect(Array.from(assets.files.get(file)!.bytes!)).toEqual(original)
    // The images folder is not a project, and nothing was skipped or paused.
    expect(reportA.skipped).toEqual([])
    expect(reportA.images).toMatchObject({ pending: 0, rejected: 0 })

    // The other PC: an empty browser.
    await resetDatabase()
    const pcB = library()
    const reportB = await reconcile(pcB.deps(dir))
    expect(reportB.created).toBe(1)
    expect(reportB.images).toMatchObject({ imported: 1, pending: 0, rejected: 0 })
    expect(pcB.records.get(ID)?.project.map.children?.[0].image?.alt).toBe('Bench')
    expect(await bytesOf(await getAsset(meta.hash))).toEqual(original)
    // Nothing was written back: the asset file is written once.
    expect(assets.writes.get(file) ?? 0).toBe(1)
  })

  it('keeps a project whose image has not arrived yet and takes the image on a later pass', async () => {
    const dir = new FakeDirectory('MindMaps')
    const meta = await storeTestImage('late')
    const image = await getAsset(meta.hash)
    await resetDatabase()
    // Another PC wrote the project; OneDrive has not brought its image yet.
    dir.put(
      fileNameFor('Kitchen', ID),
      projectFileText({ id: ID, project: withImage(meta.hash), updatedAt: STAMP }),
    )
    const pc = library()
    const first = await reconcile(pc.deps(dir))
    expect(first.created).toBe(1)
    expect(first.images).toMatchObject({ pending: 1, imported: 0 })
    expect(await hasAsset(meta.hash)).toBe(false)

    // Listed but still downloading: still pending.
    const assets = await dir.getDirectoryHandle(ASSETS_DIR, { create: true })
    const file = assetFileName(meta.hash, 'image/webp')
    assets.putBytes(file, new Uint8Array(await blobBytes(image!)))
    assets.unreadable.add(file)
    expect((await reconcile(pc.deps(dir))).images).toMatchObject({ pending: 1 })

    assets.unreadable.delete(file)
    const third = await reconcile(pc.deps(dir))
    expect(third.images).toMatchObject({ pending: 0, imported: 1 })
    expect(await hasAsset(meta.hash)).toBe(true)
    expect(assets.writes.get(file) ?? 0).toBe(0)
  })

  it('refuses an image file whose bytes do not match its name, and does not read it again', async () => {
    const dir = new FakeDirectory('MindMaps')
    const hash = `sha256-${'b'.repeat(64)}`
    dir.put(
      fileNameFor('Kitchen', ID),
      projectFileText({ id: ID, project: withImage(hash), updatedAt: STAMP }),
    )
    const assets = await dir.getDirectoryHandle(ASSETS_DIR, { create: true })
    const file = `${hash}.webp`
    assets.putBytes(file, new TextEncoder().encode('image:something else'))
    const pc = library()
    expect((await reconcile(pc.deps(dir))).images).toMatchObject({ rejected: 1, imported: 0 })
    expect(await hasAsset(hash)).toBe(false)
    assets.unreadable.add(file) // a read now would fail the pass's import
    expect((await reconcile(pc.deps(dir))).images).toMatchObject({ rejected: 1, pending: 0 })
    // The project itself is kept, and the bad file is left alone.
    expect(pc.records.has(ID)).toBe(true)
    expect(assets.files.has(file)).toBe(true)
  })

  it('never rewrites an asset file, even when the project changes or the file came from elsewhere', async () => {
    const dir = new FakeDirectory('MindMaps')
    const one = await storeTestImage('one')
    const two = await storeTestImage('two', 'image/png')
    // The other PC already put image one there.
    const assets = await dir.getDirectoryHandle(ASSETS_DIR, { create: true })
    const fileOne = assetFileName(one.hash, 'image/webp')
    assets.putBytes(fileOne, new Uint8Array(await blobBytes((await getAsset(one.hash))!)))
    const pc = library([{ id: ID, project: withImage(one.hash), updatedAt: STAMP }])
    await reconcile(pc.deps(dir))
    expect(assets.writes.get(fileOne) ?? 0).toBe(0)

    // An edit adds a second picture: only that one is written.
    const edited = withImage(one.hash)
    edited.map.children!.push({
      ...makeTree('p2', 'Plan'),
      image: { asset: two.hash, w: 100, h: 50 },
    })
    pc.records.set(ID, { id: ID, project: edited, updatedAt: '2026-10-02T00:00:00.000Z' })
    await reconcile(pc.deps(dir))
    const fileTwo = assetFileName(two.hash, 'image/png')
    expect(assets.writes.get(fileTwo)).toBe(1)
    pc.records.set(ID, {
      id: ID,
      project: { ...edited, name: 'Kitchen 2' },
      updatedAt: '2026-10-03T00:00:00.000Z',
    })
    await reconcile(pc.deps(dir))
    expect(assets.writes.get(fileOne) ?? 0).toBe(0)
    expect(assets.writes.get(fileTwo)).toBe(1)
  })

  it('takes an image a cleanup on another PC moved to _assets/_trash', async () => {
    const dir = new FakeDirectory('MindMaps')
    const meta = await storeTestImage('moved')
    const bytes = new Uint8Array(await blobBytes((await getAsset(meta.hash))!))
    await resetDatabase()
    dir.put(
      fileNameFor('Kitchen', ID),
      projectFileText({ id: ID, project: withImage(meta.hash), updatedAt: STAMP }),
    )
    const assets = await dir.getDirectoryHandle(ASSETS_DIR, { create: true })
    const trash = await assets.getDirectoryHandle('_trash', { create: true })
    trash.putBytes(assetFileName(meta.hash, 'image/webp'), bytes)
    const report = await reconcile(library().deps(dir))
    expect(report.images).toMatchObject({ imported: 1, pending: 0 })
    expect(await hasAsset(meta.hash)).toBe(true)
  })
})
