import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../io/db'
import { getProject } from '../io/db'
import { addChild, makeNode, renameNode, setNotes } from './treeOps'
import { useEditor } from './editor'
import { registerPendingEdit } from './pendingEdits'
import {
  expiredTrash,
  filterProjectRecords,
  saveErrorMessage,
  sortProjectRecords,
  useProjects,
  withRenamedRoot,
} from './projects'
import { makeProject } from '../test/fixtures'
import { listAssetHashes, putAsset } from '../assets/store'
import { resetDatabase } from '../test/resetDb'

beforeEach(async () => {
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await resetDatabase()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('projects store', () => {
  it('init seeds built-in presets and marks loaded', async () => {
    await useProjects.getState().init()
    const state = useProjects.getState()
    expect(state.loaded).toBe(true)
    expect((await db.listPresets()).map((p) => p.name).sort()).toEqual([
      'colorblind-safe',
      'corporate',
      'dark',
      'default',
      'handdrawn',
    ])
  })

  it('createProject persists and sets the new project current', async () => {
    const id = await useProjects.getState().createProject('My project')
    const state = useProjects.getState()
    expect(state.currentId).toBe(id)
    expect(state.current?.name).toBe('My project')
    expect(state.records[0].id).toBe(id)
    expect((await db.getProject(id))?.project.name).toBe('My project')
    expect(state.current?.preset).toBe('system')
    expect(state.current?.map.title).toBe('My project')
  })

  it('create -> edit -> reload round-trip', async () => {
    const store = useProjects.getState()
    const id = await store.createProject('Round trip')

    useProjects.getState().updateCurrent((project) => ({
      ...project,
      name: 'Round trip v2',
      map: addChild(renameNode(project.map, project.map.id, 'Central topic'), project.map.id),
    }))
    await useProjects.getState().saveCurrent()

    useProjects.setState({ currentId: null, current: null })
    await useProjects.getState().loadProject(id)

    const reloaded = useProjects.getState().current
    expect(reloaded?.name).toBe('Round trip v2')
    expect(reloaded?.map.title).toBe('Central topic')
    expect(reloaded?.map.children).toHaveLength(1)
    expect(reloaded?.updatedAt).toBeDefined()
  })

  it('autosaves edits without an explicit saveCurrent', async () => {
    const id = await useProjects.getState().createProject('Autosaved')
    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Autosaved later' }))
    await useProjects.getState().saveCurrent()
    expect((await db.getProject(id))?.project.name).toBe('Autosaved later')
  })

  it('lists a nonempty snapshot collection and deletes one snapshot', async () => {
    await useProjects.getState().createProject('Snapshots')
    await useProjects.getState().createSnapshot('Keep')
    await useProjects.getState().createSnapshot('Remove')

    expect((await useProjects.getState().listSnapshots()).map((snapshot) => snapshot.name)).toEqual(
      expect.arrayContaining(['Keep', 'Remove']),
    )
    expect(await useProjects.getState().deleteSnapshot('Remove')).toBe(true)
    expect((await useProjects.getState().listSnapshots()).map((snapshot) => snapshot.name)).toEqual(
      ['Keep'],
    )
    expect(useProjects.getState().snapshots.map((snapshot) => snapshot.name)).toEqual(['Keep'])
  })

  it('renames a snapshot, keeping its content and making the name unique (#98)', async () => {
    await useProjects.getState().createProject('Renames')
    const first = await useProjects.getState().createSnapshot('draft')
    await useProjects.getState().createSnapshot('final')
    expect(await useProjects.getState().renameSnapshot('draft', '  first pass ')).toBe('first pass')
    expect(await useProjects.getState().renameSnapshot('first pass', 'final')).toBe('final (2)')
    const names = useProjects.getState().snapshots.map((snapshot) => snapshot.name)
    expect(names).toEqual(expect.arrayContaining(['final', 'final (2)']))
    expect(names).toHaveLength(2)
    const renamed = await db.getSnapshot(useProjects.getState().currentId!, 'final (2)')
    expect(renamed?.createdAt).toBe(first?.createdAt)
    expect(await useProjects.getState().renameSnapshot('missing', 'x')).toBeNull()
    expect(await useProjects.getState().renameSnapshot('final', '   ')).toBeNull()
  })

  it('never overwrites an existing snapshot when a name is reused (#43)', async () => {
    await useProjects.getState().createProject('Collisions')
    const first = await useProjects.getState().createSnapshot('checkpoint')
    useProjects
      .getState()
      .updateCurrent((project) => ({ ...project, map: { ...project.map, title: 'Changed' } }))
    const second = await useProjects.getState().createSnapshot('checkpoint')
    const third = await useProjects.getState().createSnapshot('  checkpoint ')

    expect(first?.name).toBe('checkpoint')
    expect(second?.name).toBe('checkpoint (2)')
    expect(third?.name).toBe('checkpoint (3)')
    const names = (await useProjects.getState().listSnapshots()).map((snapshot) => snapshot.name)
    expect(names).toHaveLength(3)
    expect(
      (await db.getSnapshot(useProjects.getState().currentId!, 'checkpoint'))?.project.map.title,
    ).toBe('Collisions')
  })

  it('rejects snapshot names longer than the project name limit', async () => {
    await useProjects.getState().createProject('Long names')
    expect(await useProjects.getState().createSnapshot('x'.repeat(201))).toBeNull()
    const base = 'y'.repeat(200)
    await useProjects.getState().createSnapshot(base)
    const suffixed = await useProjects.getState().createSnapshot(base)
    expect(suffixed?.name.length).toBeLessThanOrEqual(200)
    expect(suffixed?.name.endsWith(' (2)')).toBe(true)
  })

  it('does not restore a snapshot after switching projects while it loads', async () => {
    const firstId = await useProjects.getState().createProject('First')
    await useProjects.getState().createSnapshot('Before switch')
    const secondId = await useProjects.getState().createProject('Second')
    await useProjects.getState().loadProject(firstId)

    let releaseSnapshotLoad!: () => void
    let snapshotLoadStarted!: () => void
    const snapshotLoad = new Promise<void>((resolve) => {
      releaseSnapshotLoad = resolve
    })
    const snapshotLoadStartedPromise = new Promise<void>((resolve) => {
      snapshotLoadStarted = resolve
    })
    const originalGetSnapshot = db.getSnapshot
    vi.spyOn(db, 'getSnapshot').mockImplementation(async (projectId, name) => {
      snapshotLoadStarted()
      await snapshotLoad
      return originalGetSnapshot(projectId, name)
    })

    const restoring = useProjects.getState().restoreSnapshot('Before switch')
    await snapshotLoadStartedPromise
    await useProjects.getState().loadProject(secondId)
    releaseSnapshotLoad()

    expect(await restoring).toBe(false)
    expect(useProjects.getState().currentId).toBe(secondId)
    expect(useProjects.getState().current?.map.title).toBe('Second')
  })

  it('an overlapping loadProject never installs the wrong history (#50)', async () => {
    const aId = await useProjects.getState().createProject('A')
    await db.putHistory({
      projectId: aId,
      past: [{ section: 'links', links: [{ from: 'a1', to: 'a2' }] }],
      future: [],
    })
    const bId = await useProjects.getState().createProject('B')
    await db.putHistory({ projectId: bId, past: [], future: [] })

    let releaseA!: () => void
    let aStarted!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const started = new Promise<void>((resolve) => {
      aStarted = resolve
    })
    const originalGetHistory = db.getHistory
    const spy = vi.spyOn(db, 'getHistory').mockImplementation(async (projectId) => {
      if (projectId === aId) {
        aStarted()
        await gate
      }
      return originalGetHistory(projectId)
    })

    const loadingA = useProjects.getState().loadProject(aId)
    await started
    await useProjects.getState().loadProject(bId)
    releaseA()
    await loadingA

    expect(useProjects.getState().currentId).toBe(bId)
    expect(useProjects.getState().current?.name).toBe('B')
    const { useEditor } = await import('./editor')
    expect(useEditor.getState().past).toEqual([])
    spy.mockRestore()
  })

  it('opens a schema-invalid stored record repaired in memory (#54)', async () => {
    const id = await useProjects.getState().createProject('Too long')
    const record = (await db.getProject(id))!
    const longTitle = 't'.repeat(700)
    await db.putProject({
      ...record,
      project: { ...record.project, map: { ...record.project.map, title: longTitle } },
    })
    useProjects.setState({ currentId: null, current: null })

    await useProjects.getState().loadProject(id)
    expect(useProjects.getState().currentId).toBe(id)
    expect(useProjects.getState().current!.map.title.length).toBe(500)
    expect(useProjects.getState().openNotes.join(' ')).toMatch(/Shortened 1 title/)
    expect(useProjects.getState().openError).toBeNull()
  })

  it('refuses to open a record that cannot be repaired, and keeps it (#54)', async () => {
    const id = await useProjects.getState().createProject('Broken')
    const record = (await db.getProject(id))!
    const broken = { ...record.project, preset: 'NOT A VALID NAME' }
    await db.putProject({ ...record, project: broken })
    useProjects.setState({ currentId: null, current: null })

    await useProjects.getState().loadProject(id)
    expect(useProjects.getState().currentId).toBeNull()
    expect(useProjects.getState().openError).toMatchObject({ id, name: 'Broken' })
    expect(await db.getProject(id)).toBeDefined()
  })

  it('hasUnsavedChanges reflects the autosave debounce window', async () => {
    await useProjects.getState().createProject('Pending')
    expect(useProjects.getState().hasUnsavedChanges()).toBe(false)

    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Pending v2' }))
    expect(useProjects.getState().hasUnsavedChanges()).toBe(true)

    await useProjects.getState().saveCurrent()
    expect(useProjects.getState().hasUnsavedChanges()).toBe(false)
  })

  it('saveStatus is saved after create, pending after edit, saved after flush', async () => {
    await useProjects.getState().createProject('Status')
    expect(useProjects.getState().saveStatus).toBe('saved')
    expect(useProjects.getState().saveError).toBeNull()

    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Status v2' }))
    expect(useProjects.getState().saveStatus).toBe('pending')

    await useProjects.getState().saveCurrent()
    expect(useProjects.getState().saveStatus).toBe('saved')
    expect(useProjects.getState().saveError).toBeNull()
  })

  it('saveStatus is error and keeps the pending write when putProject rejects', async () => {
    await useProjects.getState().createProject('Quota')
    const spy = vi
      .spyOn(db, 'putProjectIfUnchanged')
      .mockRejectedValueOnce(
        Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }),
      )
    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Quota v2' }))
    await useProjects.getState().saveCurrent()
    expect(useProjects.getState().saveStatus).toBe('error')
    expect(useProjects.getState().saveError).toBe('storage quota exceeded')
    expect(useProjects.getState().hasUnsavedChanges()).toBe(true)
    spy.mockRestore()
    // A quota error also starts the recovery ladder (#48); let it finish here.
    await useProjects.getState().recoverStorage()
  })

  it('saveErrorMessage maps quota errors and empty errors', () => {
    expect(saveErrorMessage(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe(
      'storage quota exceeded',
    )
    expect(saveErrorMessage(new Error('disk full'))).toBe('disk full')
    expect(saveErrorMessage('nope')).toBe('could not write to storage')
  })

  it('duplicate copies the project under a new id', async () => {
    const id = await useProjects.getState().createProject('Original')
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: addChild(project.map, project.map.id),
    }))
    await useProjects.getState().saveCurrent()

    const copyId = await useProjects.getState().duplicate(id)
    expect(copyId).not.toBe(id)

    const copy = await db.getProject(copyId)
    expect(copy?.project.name).toBe('Original (copy)')
    expect(copy?.project.map.children).toHaveLength(1)

    const original = await db.getProject(id)
    expect(original?.project.name).toBe('Original')

    copy!.project.map.children![0].title = 'mutated'
    expect((await db.getProject(id))?.project.map.children![0].title).toBe('New idea')
  })

  it('saves the current project as a named fork and switches to it', async () => {
    const sourceId = await useProjects.getState().createProject('Original')
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: addChild(project.map, project.map.id),
    }))

    const forkId = await useProjects.getState().saveAs('  Forked  ')
    expect(forkId).not.toBeNull()
    expect(forkId).not.toBe(sourceId)
    expect(useProjects.getState().currentId).toBe(forkId)
    expect(useProjects.getState().current?.name).toBe('Forked')
    expect(useProjects.getState().records[0].id).toBe(forkId)

    const source = await db.getProject(sourceId)
    const fork = await db.getProject(forkId as string)
    expect(source?.project.name).toBe('Original')
    expect(source?.project.map.children).toHaveLength(1)
    expect(fork?.project.name).toBe('Forked')
    expect(fork?.project.map.children).toHaveLength(1)

    fork!.project.map.children![0].title = 'mutated'
    expect((await db.getProject(sourceId))?.project.map.children![0].title).toBe('New idea')
  })

  it('rejects empty and overlong Save As names without creating a project', async () => {
    await useProjects.getState().createProject('Original')
    const before = useProjects.getState().records.length
    expect(await useProjects.getState().saveAs('   ')).toBeNull()
    expect(await useProjects.getState().saveAs('x'.repeat(201))).toBeNull()
    expect(useProjects.getState().records).toHaveLength(before)
    expect(useProjects.getState().current?.name).toBe('Original')
  })

  it('remove moves the project to trash and keeps it in db', async () => {
    const id = await useProjects.getState().createProject('Doomed')
    await useProjects.getState().remove(id)
    expect(useProjects.getState().records).toHaveLength(0)
    expect(useProjects.getState().trashed.map((record) => record.id)).toEqual([id])
    expect(useProjects.getState().currentId).toBeNull()
    expect(useProjects.getState().current).toBeNull()
    expect((await db.getProject(id))?.deletedAt).toBeDefined()
  })

  it('remove of a non-current project keeps the current one', async () => {
    const keepId = await useProjects.getState().createProject('Keeper')
    const dropId = await useProjects.getState().createProject('Drop me')
    await useProjects.getState().loadProject(keepId)
    await useProjects.getState().remove(dropId)
    expect(useProjects.getState().currentId).toBe(keepId)
    expect(useProjects.getState().records.map((r) => r.id)).toEqual([keepId])
  })

  it('restores a trashed project without opening it', async () => {
    const id = await useProjects.getState().createProject('Restorable')
    await useProjects.getState().remove(id)
    useProjects.setState({ currentId: null, current: null })

    await useProjects.getState().restore(id)

    expect(useProjects.getState().records.map((record) => record.id)).toContain(id)
    expect(useProjects.getState().trashed).toHaveLength(0)
    expect(useProjects.getState().currentId).toBeNull()
    expect((await db.getProject(id))?.deletedAt).toBeUndefined()
  })

  it('purges a trashed project from the db', async () => {
    const id = await useProjects.getState().createProject('Purge me')
    await useProjects.getState().remove(id)
    await useProjects.getState().purge(id)

    expect(useProjects.getState().trashed).toHaveLength(0)
    expect(await db.getProject(id)).toBeUndefined()
  })

  it('purge also deletes the undo history and every snapshot (#46)', async () => {
    const id = await useProjects.getState().createProject('Purge cascade')
    const keepId = await useProjects.getState().createProject('Keep cascade')
    await useProjects.getState().createSnapshot('keep')
    await useProjects.getState().loadProject(id)
    await useProjects.getState().createSnapshot('one')
    await useProjects.getState().createSnapshot('two')
    await db.putHistory({ projectId: id, past: [{ section: 'links', links: [] }], future: [] })
    await useProjects.getState().remove(id)
    await useProjects.getState().purge(id)

    expect(await db.getProject(id)).toBeUndefined()
    expect(await db.getHistory(id)).toBeUndefined()
    expect(await db.listSnapshots(id)).toEqual([])
    expect((await db.listSnapshots(keepId)).map((snapshot) => snapshot.name)).toEqual(['keep'])
  })

  it('does not load trashed projects', async () => {
    const id = await useProjects.getState().createProject('Hidden')
    await useProjects.getState().remove(id)
    useProjects.setState({ currentId: null, current: null })

    await useProjects.getState().loadProject(id)

    expect(useProjects.getState().currentId).toBeNull()
    expect(useProjects.getState().current).toBeNull()
  })

  it('splits active and trashed records during init', async () => {
    const active = await useProjects.getState().createProject('Active')
    const trashed = await useProjects.getState().createProject('Trashed')
    await useProjects.getState().remove(trashed)
    useProjects.setState({
      records: [],
      trashed: [],
      currentId: null,
      current: null,
      loaded: false,
    })

    await useProjects.getState().init()

    expect(useProjects.getState().records.map((record) => record.id)).toEqual([active])
    expect(useProjects.getState().trashed.map((record) => record.id)).toEqual([trashed])
  })

  describe('rename', () => {
    it('renames the open project: persists, updates records + current, follows the root', async () => {
      const id = await useProjects.getState().createProject('Original')
      const ok = await useProjects.getState().rename(id, '  Renamed  ')
      expect(ok).toBe(true)
      const state = useProjects.getState()
      expect(state.current?.name).toBe('Renamed')
      expect(state.records.find((r) => r.id === id)?.project.name).toBe('Renamed')
      expect(state.current?.map.title).toBe('Renamed')
      expect((await db.getProject(id))?.project.name).toBe('Renamed')
    })

    it('renames a non-open project without opening it or touching its subtree', async () => {
      const otherId = await useProjects.getState().createProject('Other')
      useProjects.getState().updateCurrent((p) => ({ ...p, map: addChild(p.map, p.map.id) }))
      await useProjects.getState().saveCurrent()
      const keepId = await useProjects.getState().createProject('Keeper')

      const ok = await useProjects.getState().rename(otherId, 'Other renamed')
      expect(ok).toBe(true)
      const state = useProjects.getState()
      expect(state.currentId).toBe(keepId)
      expect(state.current?.name).toBe('Keeper')
      expect(state.records.find((r) => r.id === otherId)?.project.name).toBe('Other renamed')

      const renamed = await db.getProject(otherId)
      expect(renamed?.project.name).toBe('Other renamed')
      expect(renamed?.project.map.title).toBe('Other renamed')
      expect(renamed?.project.map.children).toHaveLength(1)
    })

    it('rejects empty and whitespace-only names without mutating', async () => {
      const id = await useProjects.getState().createProject('Keep my name')
      expect(await useProjects.getState().rename(id, '')).toBe(false)
      expect(await useProjects.getState().rename(id, '    ')).toBe(false)
      expect(useProjects.getState().current?.name).toBe('Keep my name')
      expect(useProjects.getState().records[0].project.name).toBe('Keep my name')
      expect((await db.getProject(id))?.project.name).toBe('Keep my name')
    })

    it('rejects names longer than the schema allows', async () => {
      const id = await useProjects.getState().createProject('Short')
      expect(await useProjects.getState().rename(id, 'x'.repeat(201))).toBe(false)
      expect((await db.getProject(id))?.project.name).toBe('Short')
      expect(await useProjects.getState().rename(id, 'x'.repeat(200))).toBe(true)
    })

    it('follows a second rename while the root kept up', async () => {
      const id = await useProjects.getState().createProject('First')
      await useProjects.getState().rename(id, 'Second')
      await useProjects.getState().rename(id, 'Third')
      expect(useProjects.getState().current?.name).toBe('Third')
      expect(useProjects.getState().current?.map.title).toBe('Third')
    })

    it('leaves the root alone once it diverged from the name', async () => {
      const id = await useProjects.getState().createProject('Original')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: renameNode(p.map, p.map.id, 'Central topic'),
      }))
      await useProjects.getState().saveCurrent()

      await useProjects.getState().rename(id, 'Renamed')
      const reloaded = await db.getProject(id)
      expect(reloaded?.project.name).toBe('Renamed')
      expect(reloaded?.project.map.title).toBe('Central topic')
    })

    it('returns false for a project that does not exist', async () => {
      expect(await useProjects.getState().rename('missing', 'Anything')).toBe(false)
    })
  })
})

describe('withRenamedRoot', () => {
  it('rewrites the root title while it still equals the old name', () => {
    const map = makeNode('Original')
    const next = withRenamedRoot(map, 'Original', 'Renamed')
    expect(next.title).toBe('Renamed')
    expect(next.id).toBe(map.id)
    expect(next).not.toBe(map)
  })

  it('keeps the same reference when the root diverged', () => {
    const map = makeNode('Diverged theme')
    expect(withRenamedRoot(map, 'Old name', 'New name')).toBe(map)
  })
})

describe('project organization', () => {
  it('sorts pinned records before newer unpinned records, then by recency', () => {
    const records = [
      {
        id: 'old-pinned',
        project: { ...makeProject('Old pinned'), pinned: true },
        updatedAt: '2026-01-01',
      },
      { id: 'new', project: makeProject('New'), updatedAt: '2026-06-01' },
      {
        id: 'new-pinned',
        project: { ...makeProject('New pinned'), pinned: true },
        updatedAt: '2026-07-01',
      },
    ]
    expect(sortProjectRecords(records).map((record) => record.id)).toEqual([
      'new-pinned',
      'old-pinned',
      'new',
    ])
    expect(filterProjectRecords(records, 'missing')).toEqual([])
  })

  it('pins and tags a non-open project, persists them, and restores pinned-first order', async () => {
    const firstId = await useProjects.getState().createProject('First')
    const secondId = await useProjects.getState().createProject('Second')
    expect(await useProjects.getState().setPinned(firstId, true)).toBe(true)
    expect(await useProjects.getState().addTag(firstId, '  Plans  ')).toBe(true)
    expect(await useProjects.getState().addTag(firstId, 'pLaNs')).toBe(true)
    expect((await getProject(firstId))?.project).toMatchObject({ pinned: true, tags: ['Plans'] })
    expect(useProjects.getState().records.map((record) => record.id)).toEqual([firstId, secondId])

    useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
    await useProjects.getState().init()
    expect(useProjects.getState().records.map((record) => record.id)).toEqual([firstId, secondId])
    expect(await useProjects.getState().removeTag(firstId, 'plans')).toBe(true)
    expect((await getProject(firstId))?.project.tags).toBeUndefined()
  })

  it('rejects empty and overlong tags', async () => {
    const id = await useProjects.getState().createProject('Tagged')
    expect(await useProjects.getState().addTag(id, '   ')).toBe(false)
    expect(await useProjects.getState().addTag(id, 'x'.repeat(41))).toBe(false)
    expect((await getProject(id))?.project.tags).toBeUndefined()
  })
})

describe('storage-full recovery (#48)', () => {
  it("frees other projects' history, shrinks this one, and retries the save", async () => {
    const otherId = await useProjects.getState().createProject('Other')
    await db.putHistory({ projectId: otherId, past: [{ section: 'links', links: [] }], future: [] })
    const id = await useProjects.getState().createProject('Full')
    const quota = new DOMException('full', 'QuotaExceededError')
    const spy = vi.spyOn(db, 'putProjectIfUnchanged').mockRejectedValueOnce(quota)

    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Full v2' }))
    await useProjects.getState().saveCurrent()
    const recovered = await useProjects.getState().recoverStorage()

    expect(recovered).toBe(true)
    expect(useProjects.getState().storageFull).toBe(false)
    expect(useProjects.getState().saveStatus).toBe('saved')
    expect((await db.getProject(id))?.project.name).toBe('Full v2')
    expect(await db.getHistory(otherId)).toBeUndefined()
    spy.mockRestore()
  })

  it('never deletes images, which projects, snapshots or undo steps may still use (#149)', async () => {
    const otherId = await useProjects.getState().createProject('Pictured')
    await db.putHistory({ projectId: otherId, past: [{ section: 'links', links: [] }], future: [] })
    const meta = await putAsset(new Blob([new Uint8Array([1, 2])], { type: 'image/png' }), {
      w: 1,
      h: 1,
      thumb: new Blob([new Uint8Array([3])], { type: 'image/png' }),
    })
    await useProjects.getState().createProject('Full')
    const spy = vi
      .spyOn(db, 'putProjectIfUnchanged')
      .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Full v2' }))
    await useProjects.getState().saveCurrent()
    await useProjects.getState().recoverStorage()
    expect(await db.getHistory(otherId)).toBeUndefined()
    expect(await listAssetHashes()).toEqual([meta.hash])
    spy.mockRestore()
  })

  it('flags storageFull when the retry still fails', async () => {
    await useProjects.getState().createProject('Still full')
    const quota = new DOMException('full', 'QuotaExceededError')
    const spy = vi.spyOn(db, 'putProjectIfUnchanged').mockRejectedValue(quota)

    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Still full v2' }))
    await useProjects.getState().saveCurrent()
    await useProjects.getState().recoverStorage()

    expect(useProjects.getState().storageFull).toBe(true)
    expect(useProjects.getState().saveStatus).toBe('error')
    spy.mockRestore()
    await useProjects.getState().saveCurrent()
    expect(useProjects.getState().storageFull).toBe(false)
  })
})

describe('a failed save survives an import or Save as (#156)', () => {
  it('keeps the open project and its unsaved edit when an import arrives', async () => {
    const id = await useProjects.getState().createProject('A')
    const spy = vi
      .spyOn(db, 'putProjectIfUnchanged')
      .mockRejectedValue(new DOMException('cannot clone', 'DataCloneError'))
    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'A edited' }))
    await useProjects.getState().saveCurrent()
    expect(useProjects.getState().saveStatus).toBe('error')

    const imported = await useProjects
      .getState()
      .importProject({ ...useProjects.getState().current!, name: 'B' })
    // B is stored, but A stays open with its edit still waiting to be saved.
    expect(await db.getProject(imported)).toBeDefined()
    expect(useProjects.getState().currentId).toBe(id)
    expect(useProjects.getState().current!.name).toBe('A edited')
    expect(await useProjects.getState().saveAs('A copy')).toBeNull()

    spy.mockRestore()
    await useProjects.getState().saveCurrent()
    expect((await db.getProject(id))!.project.name).toBe('A edited')
  })
})

describe('cross-tab writes (#53)', () => {
  it('never overwrites a newer write from another tab; keeps ours as a conflict copy', async () => {
    const id = await useProjects.getState().createProject('Shared')
    // Another tab saves a newer version.
    const stored = (await db.getProject(id))!
    const later = new Date(Date.now() + 60_000).toISOString()
    await db.putProject({
      ...stored,
      project: {
        ...stored.project,
        map: { ...stored.project.map, title: 'Theirs' },
        updatedAt: later,
      },
      updatedAt: later,
    })

    // This tab, still on the old version, makes an edit and autosaves.
    useProjects
      .getState()
      .updateCurrent((project) => ({ ...project, map: { ...project.map, title: 'Ours' } }))
    await useProjects.getState().saveCurrent()

    expect((await db.getProject(id))?.project.map.title).toBe('Theirs')
    expect(useProjects.getState().current?.map.title).toBe('Theirs')
    const copy = (await db.listProjects()).find(
      (record) => record.project.name === 'Shared (conflict copy)',
    )
    expect(copy?.project.map.title).toBe('Ours')
    expect(useProjects.getState().syncNotice).toMatch(/conflict copy/)
  })

  it('keeps saving normally when nobody else wrote', async () => {
    const id = await useProjects.getState().createProject('Solo')
    for (const title of ['one', 'two', 'three']) {
      useProjects
        .getState()
        .updateCurrent((project) => ({ ...project, map: { ...project.map, title } }))
      await useProjects.getState().saveCurrent()
    }
    expect((await db.getProject(id))?.project.map.title).toBe('three')
    expect(
      (await db.listProjects()).some((record) => record.project.name.includes('conflict')),
    ).toBe(false)
  })

  it('does not resurrect a project another tab moved to the trash', async () => {
    const id = await useProjects.getState().createProject('Trashed elsewhere')
    const stored = (await db.getProject(id))!
    await db.putProject({ ...stored, deletedAt: new Date().toISOString() })
    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Edited after trash' }))
    await useProjects.getState().saveCurrent()

    expect((await db.getProject(id))?.deletedAt).toBeDefined()
    expect(useProjects.getState().current?.name).toBe('Edited after trash (conflict copy)')
    expect(useProjects.getState().currentId).not.toBe(id)
  })
})

describe('a freshly opened project has its root selected (#71)', () => {
  it('createProject, importProject and saveAs select the map root', async () => {
    const { useEditor } = await import('./editor')
    useEditor.getState().setView('map')

    await useProjects.getState().createProject('Fresh')
    expect(useEditor.getState().selection).toBe(useProjects.getState().current!.map.id)

    await useProjects.getState().importProject(makeProject('Imported'))
    expect(useEditor.getState().selection).toBe('m-root')

    await useProjects.getState().saveAs('Forked')
    expect(useEditor.getState().selection).toBe(useProjects.getState().current!.map.id)
  })

  it('selects the brainstorm root when the Brainstorm tab is showing', async () => {
    const { useEditor } = await import('./editor')
    useEditor.getState().setView('brainstorm')
    await useProjects.getState().createProject('Fresh brainstorm')
    expect(useEditor.getState().selection).toBe(useProjects.getState().current!.brainstorm.id)
    useEditor.getState().setView('map')
  })

  it('selects nothing after the open project is deleted', async () => {
    const { useEditor } = await import('./editor')
    const id = await useProjects.getState().createProject('Doomed')
    await useProjects.getState().remove(id)
    expect(useEditor.getState().selection).toBeNull()
  })
})

describe('reopen the last project on reload (#75)', () => {
  // A fresh page load: in-memory state is gone, localStorage survives. (Resetting
  // the store would otherwise count as "closing" the project and clear it.)
  async function reload() {
    const { getLastProjectId, setLastProjectId } = await import('./session')
    await useProjects.getState().saveCurrent()
    const remembered = getLastProjectId()
    useProjects.setState({
      records: [],
      trashed: [],
      currentId: null,
      current: null,
      loaded: false,
    })
    setLastProjectId(remembered)
    await useProjects.getState().init()
  }

  it('reopens the project that was open', async () => {
    const id = await useProjects.getState().createProject('Keep me open')
    await useProjects.getState().saveCurrent()
    await reload()
    expect(useProjects.getState().loaded).toBe(true)
    expect(useProjects.getState().currentId).toBe(id)
  })

  it('shows the start screen after Home, and remembers that', async () => {
    await useProjects.getState().createProject('Closed')
    await useProjects.getState().goHome()
    expect(useProjects.getState().currentId).toBeNull()
    await reload()
    expect(useProjects.getState().currentId).toBeNull()
  })

  it('does not reopen a project that was moved to the trash', async () => {
    const id = await useProjects.getState().createProject('Trashed')
    const record = (await db.getProject(id))!
    await db.putProject({ ...record, deletedAt: new Date().toISOString() })
    await reload()
    expect(useProjects.getState().currentId).toBeNull()
  })

  it('stays on the start screen when the stored record cannot be opened', async () => {
    const id = await useProjects.getState().createProject('Broken')
    const record = (await db.getProject(id))!
    await db.putProject({ ...record, project: { ...record.project, preset: 'NOT VALID' } })
    await reload()
    expect(useProjects.getState().currentId).toBeNull()
    expect(useProjects.getState().openError?.id).toBe(id)
  })
})

describe('trash auto-purge (#83)', () => {
  it('expiredTrash picks only records trashed more than 30 days ago', () => {
    const now = Date.parse('2026-09-30T00:00:00Z')
    const project = makeProject('x')
    const records = [
      { id: 'old', project, updatedAt: '', deletedAt: '2026-08-30T00:00:00Z' },
      { id: 'recent', project, updatedAt: '', deletedAt: '2026-09-15T00:00:00Z' },
      { id: 'live', project, updatedAt: '' },
    ]
    expect(expiredTrash(records, now).map((r) => r.id)).toEqual(['old'])
  })

  it('init purges expired trash unless auto-purge is switched off', async () => {
    const { setTrashAutoPurge } = await import('./session')
    const project = makeProject('Old trash')
    const long = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    await db.putProject({ id: 'keep', project, updatedAt: long, deletedAt: long })
    setTrashAutoPurge(false)
    await useProjects.getState().init()
    expect(await db.getProject('keep')).toBeDefined()

    setTrashAutoPurge(true)
    await useProjects.getState().init()
    expect(await db.getProject('keep')).toBeUndefined()
    expect(useProjects.getState().trashed).toEqual([])
  })
})

describe('persistent storage (#143)', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'storage')
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'storage', original)
    else delete (navigator as { storage?: unknown }).storage
    localStorage.removeItem('mms.persistAsked')
  })

  it('asks once, after the first project is created or imported', async () => {
    localStorage.removeItem('mms.persistAsked')
    const persist = vi.fn(async () => {
      throw new Error('denied')
    })
    Object.defineProperty(navigator, 'storage', {
      value: { persist, persisted: async () => false },
      configurable: true,
    })
    await useProjects.getState().createProject('First')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(persist).toHaveBeenCalledTimes(1)
    await useProjects.getState().createProject('Second')
    await useProjects.getState().importProject(makeProject('Imported'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(persist).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('mms.persistAsked')).toBe('1')
  })
})

describe('a draft still in the notes box (#92)', () => {
  let unregister: (() => void) | null = null
  afterEach(() => {
    unregister?.()
    unregister = null
  })

  /** Like the details panel: a notes draft on the map root, committed through the editor. */
  function typeDraft(text: string) {
    let dirty = true
    unregister = registerPendingEdit({
      isDirty: () => dirty,
      flush: () => {
        dirty = false
        useEditor.getState().applyTree('map', (tree) => setNotes(tree, tree.id, text))
      },
    })
  }

  it('goes into a snapshot taken meanwhile', async () => {
    await useProjects.getState().createProject('Snap')
    typeDraft('typed before the snapshot')
    const snapshot = await useProjects.getState().createSnapshot('Before')
    expect(snapshot?.project.map.notes).toBe('typed before the snapshot')
  })

  it('is kept in the undo history when a snapshot is restored', async () => {
    await useProjects.getState().createProject('Restore')
    await useProjects.getState().createSnapshot('Empty')
    typeDraft('typed before the restore')
    expect(await useProjects.getState().restoreSnapshot('Empty')).toBe(true)
    expect(useProjects.getState().current?.map.notes).toBeUndefined()
    useEditor.getState().undo()
    expect(useProjects.getState().current?.map.notes).toBe('typed before the restore')
  })

  it('is saved with the project being left, never with the one being opened', async () => {
    const first = await useProjects.getState().createProject('First')
    const second = await useProjects.getState().createProject('Second')
    await useProjects.getState().loadProject(first)
    typeDraft('typed in First')
    await useProjects.getState().loadProject(second)
    expect(useProjects.getState().currentId).toBe(second)
    expect((await db.getProject(first))?.project.map.notes).toBe('typed in First')
    expect((await db.getProject(second))?.project.map.notes).toBeUndefined()
  })

  it('goes into a duplicate and into the trashed copy of the open project', async () => {
    const id = await useProjects.getState().createProject('Copied')
    typeDraft('typed before duplicating')
    const copyId = await useProjects.getState().duplicate(id)
    expect((await db.getProject(copyId))?.project.map.notes).toBe('typed before duplicating')

    unregister?.()
    typeDraft('typed before deleting')
    await useProjects.getState().remove(id)
    const trashed = await db.getProject(id)
    expect(trashed?.deletedAt).toBeDefined()
    expect(trashed?.project.map.notes).toBe('typed before deleting')
  })
})

describe('changes to a trashed project (#83)', () => {
  it('rename, pin and tags refuse it and leave it in the trash', async () => {
    const id = await useProjects.getState().createProject('Binned')
    await useProjects.getState().createProject('Open')
    await useProjects.getState().remove(id)
    expect(await useProjects.getState().rename(id, 'Renamed')).toBe(false)
    expect(await useProjects.getState().setPinned(id, true)).toBe(false)
    expect(await useProjects.getState().addTag(id, 'plans')).toBe(false)
    expect(await useProjects.getState().removeTag(id, 'plans')).toBe(false)
    const stored = await db.getProject(id)
    expect(stored?.deletedAt).toBeDefined()
    expect(stored?.project).toMatchObject({ name: 'Binned' })
    expect(stored?.project.pinned).toBeUndefined()
    expect(stored?.project.tags).toBeUndefined()
  })

  it('purging the open project closes it and drops its pending save', async () => {
    const id = await useProjects.getState().createProject('Gone')
    useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Edited' }))
    await useProjects.getState().purge(id)
    expect(useProjects.getState().currentId).toBeNull()
    expect(useProjects.getState().current).toBeNull()
    await useProjects.getState().saveCurrent()
    expect(await db.listProjects()).toEqual([])
  })
})

describe('other tabs (#53)', () => {
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
  }
  const settle = () => new Promise((r) => setTimeout(r, 100))
  let channel: BroadcastChannel
  beforeEach(() => {
    channel = new BroadcastChannel('mindmap-studio')
  })
  afterEach(() => channel.close())

  /** Another tab stores a newer version of `id` and says so. */
  async function saveElsewhere(id: string, change: (record: ProjectRecordLike) => void) {
    const stored = (await db.getProject(id))!
    const updatedAt = new Date(Date.now() + 60_000).toISOString()
    const record = structuredClone({ ...stored, updatedAt })
    record.project.updatedAt = updatedAt
    change(record)
    await db.putProject(record)
    channel.postMessage({ type: 'project-saved', id, updatedAt })
  }
  type ProjectRecordLike = NonNullable<Awaited<ReturnType<typeof db.getProject>>>

  it('tells other tabs when a project that is not open is pinned', async () => {
    const id = await useProjects.getState().createProject('Pin me')
    await useProjects.getState().createProject('Open')
    const heard: unknown[] = []
    channel.onmessage = (event) => heard.push(event.data)
    expect(await useProjects.getState().setPinned(id, true)).toBe(true)
    await until(() => heard.some((message) => (message as { id?: string }).id === id))
    expect(heard).toContainEqual(expect.objectContaining({ type: 'project-saved', id }))
  })

  it('takes over a newer version when nothing is unsaved here', async () => {
    const id = await useProjects.getState().createProject('Shared')
    await saveElsewhere(id, (record) => {
      record.project.map.title = 'Theirs'
    })
    await until(() => useProjects.getState().current?.map.title === 'Theirs')
    expect(useProjects.getState().current?.map.title).toBe('Theirs')
  })

  it('keeps a draft still in the notes box instead of taking over', async () => {
    const id = await useProjects.getState().createProject('Shared')
    const unregister = registerPendingEdit({ isDirty: () => true, flush: () => undefined })
    try {
      await saveElsewhere(id, (record) => {
        record.project.map.title = 'Theirs'
      })
      await settle()
      expect(useProjects.getState().current?.map.title).toBe('Shared')
    } finally {
      unregister()
    }
  })

  it('keeps the open version when the newer one cannot be opened', async () => {
    const id = await useProjects.getState().createProject('Shared')
    await saveElsewhere(id, (record) => {
      record.project.preset = 'NOT A VALID NAME'
      record.project.map.title = 'Broken'
    })
    await settle()
    expect(useProjects.getState().current?.map.title).toBe('Shared')
  })
})
