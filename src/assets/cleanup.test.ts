import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../io/db'
import type { Project, TreeNode } from '../schema/types'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { FakeDirectory } from '../test/fakeDirectory'
import { storeTestImage } from '../test/fakeCodec'
import { makeProject, makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { wrapHandle } from '../sync/folder'
import { ASSETS_DIR } from '../sync/assets'
import { cleanupAssets, cleanupDue, scanAssetReferences } from './cleanup'
import { assetFileName, blobBytes, clearThumbCache, getAsset, hasAsset } from './store'

const DAY = 24 * 60 * 60 * 1000
const START = Date.parse('2026-10-01T09:00:00.000Z')
const day = (n: number) => new Date(START + n * DAY)

const tree = (asset?: string): TreeNode => {
  const node = makeTree('p1', 'Photo')
  return makeTree('m', 'Map', [asset ? { ...node, image: { asset, w: 100, h: 50 } } : node])
}
const projectWith = (asset?: string): Project => makeProject('Kitchen', undefined, tree(asset))
const put = (id: string, project: Project, deletedAt?: string) =>
  db.putProject({
    id,
    project,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...(deletedAt ? { deletedAt } : {}),
  })

beforeEach(async () => {
  await resetDatabase()
  clearThumbCache()
  useProjects.setState({ current: null, currentId: null })
  useEditor.setState({ past: [], future: [] })
})

afterEach(() => {
  useEditor.setState({ past: [], future: [] })
})

describe('image cleanup (#149, HC10)', () => {
  it('deletes an image only after 30 days with nothing referring to it', async () => {
    const used = await storeTestImage('used')
    const unused = await storeTestImage('unused')
    await put('P1', projectWith(used.hash))

    const first = await cleanupAssets({ now: day(0) })
    expect(first).toMatchObject({ stamped: 1, deleted: [] })
    expect((await cleanupAssets({ now: day(29) })).deleted).toEqual([])
    expect(await hasAsset(unused.hash)).toBe(true)
    const last = await cleanupAssets({ now: day(30) })
    expect(last.deleted).toEqual([unused.hash])
    expect(await hasAsset(unused.hash)).toBe(false)
    expect(await hasAsset(used.hash)).toBe(true)
  })

  it('clears the stamp when an image is referred to again', async () => {
    const meta = await storeTestImage('back')
    await cleanupAssets({ now: day(0) })
    await put('P1', projectWith(meta.hash))
    expect(await cleanupAssets({ now: day(10) })).toMatchObject({ cleared: 1 })
    await db.deleteProject('P1')
    // The clock starts again from when it was last unreferenced.
    await cleanupAssets({ now: day(20) })
    expect((await cleanupAssets({ now: day(45) })).deleted).toEqual([])
    expect((await cleanupAssets({ now: day(50) })).deleted).toEqual([meta.hash])
  })

  it('counts the Trash, snapshots and stored undo history as references', async () => {
    const trashed = await storeTestImage('trashed')
    const snap = await storeTestImage('snapshot')
    const undo = await storeTestImage('undo')
    const redo = await storeTestImage('redo')
    await put('P1', projectWith(trashed.hash), '2026-09-01T00:00:00.000Z')
    await db.putSnapshot({
      projectId: 'P2',
      name: 'Before',
      createdAt: '2026-09-01T00:00:00.000Z',
      project: projectWith(snap.hash),
    })
    await db.putHistory({
      projectId: 'P3',
      past: [{ section: 'map', tree: tree(undo.hash) }],
      future: [{ section: 'snapshot', map: tree(redo.hash), brainstorm: makeTree('b', 'B') }],
    })
    const refs = await scanAssetReferences()
    expect([...refs].sort()).toEqual([trashed.hash, snap.hash, undo.hash, redo.hash].sort())
    expect((await cleanupAssets({ now: day(0) })).stamped).toBe(0)
    expect((await cleanupAssets({ now: day(90) })).deleted).toEqual([])
  })

  it('keeps an image an undo step in memory still needs, so undoing a removal finds its bytes', async () => {
    const meta = await storeTestImage('removed')
    // The image was removed from the open project; undo would put it back.
    useProjects.setState({ current: projectWith(), currentId: 'P1' })
    useEditor.setState({ past: [{ section: 'map', tree: tree(meta.hash) }], future: [] })
    await cleanupAssets({ now: day(0) })
    expect((await cleanupAssets({ now: day(40) })).deleted).toEqual([])
    expect(await getAsset(meta.hash)).not.toBeNull()
    // Within the grace period, after the undo history is gone, the bytes are still there.
    useEditor.setState({ past: [], future: [] })
    expect(await cleanupAssets({ now: day(41) })).toMatchObject({ stamped: 1, deleted: [] })
    expect(await hasAsset(meta.hash)).toBe(true)
  })

  it('moves the folder file of an expired image to _assets/_trash, and leaves others alone', async () => {
    const mine = await storeTestImage('mine')
    const dir = new FakeDirectory('MindMaps')
    const assets = await dir.getDirectoryHandle(ASSETS_DIR, { create: true })
    const file = assetFileName(mine.hash, 'image/webp')
    const bytes = new Uint8Array(await blobBytes((await getAsset(mine.hash))!))
    assets.putBytes(file, bytes)
    // A picture this PC never had: never touched here.
    const other = `sha256-${'c'.repeat(64)}.webp`
    assets.putBytes(other, new Uint8Array([1, 2, 3]))

    const folder = wrapHandle(dir, [0, 0])
    await cleanupAssets({ now: day(0), folder })
    expect((await cleanupAssets({ now: day(29), folder })).movedInFolder).toBe(0)
    const result = await cleanupAssets({ now: day(31), folder })
    expect(result).toMatchObject({ movedInFolder: 1, deleted: [mine.hash] })
    expect([...assets.files.keys()]).toEqual([other])
    expect(Array.from(assets.dirs.get('_trash')!.files.get(file)!.bytes!)).toEqual(
      Array.from(bytes),
    )
  })

  it('runs at most once a day', async () => {
    expect(await cleanupDue(day(0))).toBe(true)
    await cleanupAssets({ now: day(0) })
    expect(await cleanupDue(new Date(START + DAY / 2))).toBe(false)
    expect(await cleanupDue(day(1))).toBe(true)
  })
})
