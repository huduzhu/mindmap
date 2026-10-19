import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDB, openDB } from 'idb'
import {
  DB_NAME,
  DB_VERSION,
  deleteHistory,
  deleteProject,
  deleteSnapshot,
  getDB,
  getHistory,
  getPreset,
  getProject,
  getSnapshot,
  listPresets,
  listProjects,
  listSnapshots,
  onDBIssue,
  purgeProject,
  putHistory,
  putProject,
  putPreset,
  putSnapshot,
  resetDBConnection,
  type ProjectRecord,
} from './db'
import { BUILT_IN_PRESETS, seedBuiltInPresets } from './seed'
import { resetDatabase } from '../test/resetDb'
import { makeProject } from '../test/fixtures'

beforeEach(async () => {
  await resetDatabase()
})

describe('project round-trip', () => {
  it('creates, edits, and reloads a project', async () => {
    const record: ProjectRecord = {
      id: 'p1',
      project: makeProject('Launch plan'),
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    await putProject(record)

    const edited: ProjectRecord = {
      ...record,
      project: { ...record.project, name: 'Launch plan v2' },
      updatedAt: '2026-09-01T01:00:00.000Z',
    }
    await putProject(edited)

    const reloaded = await getProject('p1')
    expect(reloaded?.project.name).toBe('Launch plan v2')
    expect(reloaded?.updatedAt).toBe('2026-09-01T01:00:00.000Z')
  })

  it('round-trips a deletedAt timestamp', async () => {
    const record: ProjectRecord = {
      id: 'trash-1',
      project: makeProject('Trashed'),
      updatedAt: '2026-09-01T00:00:00.000Z',
      deletedAt: '2026-09-02T00:00:00.000Z',
    }
    await putProject(record)

    expect(await getProject(record.id)).toEqual(record)
    expect((await listProjects()).map((project) => project.id)).toEqual(['trash-1'])
  })

  it('lists projects newest-first by updatedAt', async () => {
    await putProject({
      id: 'old',
      project: makeProject('Old'),
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await putProject({
      id: 'new',
      project: makeProject('New'),
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
    const records = await listProjects()
    expect(records.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('deletes a project', async () => {
    await putProject({
      id: 'gone',
      project: makeProject('Gone'),
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await deleteProject('gone')
    expect(await getProject('gone')).toBeUndefined()
  })
})

describe('presets', () => {
  it('seeds exactly the built-in presets on first run', async () => {
    await seedBuiltInPresets()
    const presets = await listPresets()
    expect(presets.map((p) => p.name).sort()).toEqual([
      'colorblind-safe',
      'corporate',
      'dark',
      'default',
      'handdrawn',
    ])
  })

  it('does not overwrite custom presets on reseed', async () => {
    await seedBuiltInPresets()
    const tweaked = { ...BUILT_IN_PRESETS[0], font: { ...BUILT_IN_PRESETS[0].font, baseSize: 18 } }
    await putPreset(tweaked)
    await seedBuiltInPresets()
    expect((await getPreset('default'))?.font.baseSize).toBe(18)
  })
})

describe('schema upgrade (real getDB path, #60)', () => {
  async function closeAndDelete() {
    resetDBConnection()
    await deleteDB(DB_NAME)
  }

  it('migrates a genuine v1 database to v2 without losing projects', async () => {
    await closeAndDelete()
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-updated', 'updatedAt')
        db.createObjectStore('presets', { keyPath: 'name' })
      },
    })
    await v1.put('projects', {
      id: 'legacy',
      project: makeProject('Legacy'),
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    v1.close()

    expect((await listProjects()).map((record) => record.id)).toEqual(['legacy'])
    const db = await getDB()
    expect(db.version).toBe(DB_VERSION)
    expect(Array.from(db.objectStoreNames).sort()).toEqual([
      'assets',
      'history',
      'presets',
      'projects',
      'settings',
      'snapshots',
      'sync',
    ])
    expect(Array.from(db.transaction('snapshots').store.indexNames)).toEqual(['by-project'])
  })

  it('upgrades a v3 database to v4 with an assets store, leaving the data alone (#149)', async () => {
    await closeAndDelete()
    const v3 = await openDB(DB_NAME, 3, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-updated', 'updatedAt')
        db.createObjectStore('presets', { keyPath: 'name' })
        db.createObjectStore('history', { keyPath: 'projectId' })
        const snapshots = db.createObjectStore('snapshots', { keyPath: ['projectId', 'name'] })
        snapshots.createIndex('by-project', 'projectId')
        db.createObjectStore('sync', { keyPath: 'projectId' })
        db.createObjectStore('settings', { keyPath: 'key' })
      },
    })
    const record = {
      id: 'kept',
      project: makeProject('Kept'),
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
    await v3.put('projects', record)
    await v3.put('settings', { key: 'folder', value: 'x' })
    await v3.put('history', { projectId: 'kept', past: [], future: [] })
    v3.close()

    const db = await getDB()
    expect(DB_VERSION).toBe(4)
    expect(db.version).toBe(4)
    expect(db.objectStoreNames.contains('assets')).toBe(true)
    expect(Array.from(db.transaction('assets').store.indexNames)).toEqual(['by-bytes'])
    expect(await getProject('kept')).toEqual(record)
    expect(await db.get('settings', 'folder')).toEqual({ key: 'folder', value: 'x' })
    expect(await getHistory('kept')).toEqual({ projectId: 'kept', past: [], future: [] })
  })

  it('adds a missing index to an existing store (future v3-style migration)', async () => {
    await closeAndDelete()
    // A v1 database whose projects store lacks the by-updated index.
    const broken = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' })
      },
    })
    broken.close()
    const db = await getDB()
    expect(Array.from(db.transaction('projects').store.indexNames)).toEqual(['by-updated'])
  })

  it('does not cache a failed open: the next call retries (#49)', async () => {
    await closeAndDelete()
    const newer = await openDB(DB_NAME, DB_VERSION + 5)
    newer.close()
    await expect(getDB()).rejects.toThrow()
    await deleteDB(DB_NAME)
    await expect(getDB()).resolves.toBeDefined()
  })

  it('reports a blocked upgrade instead of hanging silently (#49)', async () => {
    await closeAndDelete()
    const issues: string[] = []
    const stop = onDBIssue((issue) => issues.push(issue))
    const old = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' })
      },
    })
    const opening = getDB()
    // Poll rather than sleep a fixed time: when `blocked` fires depends on the runner.
    for (let i = 0; i < 100 && !issues.includes('blocked'); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(issues).toContain('blocked')
    old.close()
    await expect(opening).resolves.toBeDefined()
    stop()
  })
})

describe('history and snapshot stores', () => {
  it('round-trips and deletes history records', async () => {
    const record = { projectId: 'p1', past: [{ section: 'links' as const, links: [] }], future: [] }
    await putHistory(record)
    expect(await getHistory('p1')).toEqual(record)
    await deleteHistory('p1')
    expect(await getHistory('p1')).toBeUndefined()
  })

  it('lists snapshots per project newest-first and deletes one', async () => {
    const project = makeProject('Snap')
    await putSnapshot({
      projectId: 'p1',
      name: 'a',
      createdAt: '2026-01-01T00:00:00.000Z',
      project,
    })
    await putSnapshot({
      projectId: 'p1',
      name: 'b',
      createdAt: '2026-02-01T00:00:00.000Z',
      project,
    })
    await putSnapshot({
      projectId: 'p2',
      name: 'a',
      createdAt: '2026-03-01T00:00:00.000Z',
      project,
    })
    expect((await listSnapshots('p1')).map((snapshot) => snapshot.name)).toEqual(['b', 'a'])
    expect((await getSnapshot('p2', 'a'))?.createdAt).toBe('2026-03-01T00:00:00.000Z')
    await deleteSnapshot('p1', 'a')
    expect((await listSnapshots('p1')).map((snapshot) => snapshot.name)).toEqual(['b'])
  })

  it('purgeProject removes the project, its history and all its snapshots only', async () => {
    const project = makeProject('Purge')
    await putProject({ id: 'p1', project, updatedAt: '2026-01-01T00:00:00.000Z' })
    await putProject({ id: 'p2', project, updatedAt: '2026-01-01T00:00:00.000Z' })
    await putHistory({ projectId: 'p1', past: [], future: [] })
    await putSnapshot({
      projectId: 'p1',
      name: 'a',
      createdAt: '2026-01-01T00:00:00.000Z',
      project,
    })
    await putSnapshot({
      projectId: 'p2',
      name: 'a',
      createdAt: '2026-01-01T00:00:00.000Z',
      project,
    })
    await purgeProject('p1')
    expect(await getProject('p1')).toBeUndefined()
    expect(await getHistory('p1')).toBeUndefined()
    expect(await listSnapshots('p1')).toEqual([])
    expect(await getProject('p2')).toBeDefined()
    expect(await listSnapshots('p2')).toHaveLength(1)
  })
})

describe('seedBuiltInPresets (#66)', () => {
  it('is idempotent and restores a deleted built-in', async () => {
    await seedBuiltInPresets()
    await seedBuiltInPresets()
    expect(await listPresets()).toHaveLength(BUILT_IN_PRESETS.length)
    const { deletePreset } = await import('./db')
    await deletePreset('dark')
    await seedBuiltInPresets()
    expect((await getPreset('dark'))?.name).toBe('dark')
  })

  it('brings an untouched older built-in up to date but keeps edited ones (#138)', async () => {
    const current = BUILT_IN_PRESETS.find((preset) => preset.name === 'handdrawn')!
    const shipped = { ...current, palette: { ...current.palette, mutedText: '#8a8577' } }
    await putPreset(shipped)
    await seedBuiltInPresets()
    expect((await getPreset('handdrawn'))?.palette.mutedText).toBe(current.palette.mutedText)

    const corporate = BUILT_IN_PRESETS.find((preset) => preset.name === 'corporate')!
    const edited = {
      ...corporate,
      palette: { ...corporate.palette, mutedText: '#64748b', text: '#000000' },
    }
    await putPreset(edited)
    await seedBuiltInPresets()
    expect(await getPreset('corporate')).toEqual(edited)
  })
})
