// @vitest-environment node

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Preset } from '../schema/types'
import { useProjects } from '../store/projects'
import { makeProject } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import {
  BACKUP_KIND,
  backupFilename,
  buildLibraryBackup,
  describeRestore,
  openZipFile,
  restoreLibraryBackup,
  type BackupManifest,
} from './backup'
import * as db from './db'
import { seedBuiltInPresets } from './seed'
import { unzip } from './unzip'
import { zipStore } from './zip'
import { setImageCodec } from '../assets/codec'
import { blobBytes, getAsset, hasAsset } from '../assets/store'
import { simpleCodec, storeTestImage } from '../test/fakeCodec'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

beforeEach(async () => {
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await resetDatabase()
  await seedBuiltInPresets()
})

async function addProject(name: string, deletedAt?: string): Promise<string> {
  const id = `id-${name.toLowerCase().replace(/\W+/g, '-')}`
  const updatedAt = '2026-09-01T10:00:00.000Z'
  await db.putProject({ id, project: makeProject(name), updatedAt, deletedAt })
  return id
}

async function customPreset(name: string): Promise<Preset> {
  const base = (await db.getPreset('default'))!
  const preset = { ...structuredClone(base), name }
  await db.putPreset(preset)
  return preset
}

async function manifestOf(bytes: Uint8Array): Promise<BackupManifest> {
  const entries = await unzip(bytes)
  const manifest = entries.find((entry) => entry.name === 'manifest.json')!
  return JSON.parse(decoder.decode(manifest.data)) as BackupManifest
}

describe('library backup (#82)', () => {
  it('contains live projects, their snapshots and custom presets — not the trash', async () => {
    const alpha = await addProject('Alpha')
    await addProject('Beta')
    await addProject('Binned', '2026-09-02T00:00:00.000Z')
    await db.putSnapshot({
      projectId: alpha,
      name: 'Before edits',
      createdAt: '2026-09-03T00:00:00.000Z',
      project: makeProject('Alpha old'),
    })
    await customPreset('my-theme')

    const { bytes, manifest } = await buildLibraryBackup()
    expect(manifest.kind).toBe(BACKUP_KIND)
    expect(manifest.projects.map((entry) => entry.name).sort()).toEqual(['Alpha', 'Beta'])
    expect(manifest.snapshots).toEqual([
      expect.objectContaining({ projectId: alpha, name: 'Before edits' }),
    ])
    // Unchanged built-ins are reseeded on every start, so they stay out.
    expect(manifest.presets.map((entry) => entry.name)).toEqual(['my-theme'])

    const names = (await unzip(bytes)).map((entry) => entry.name)
    expect(names[0]).toBe('manifest.json')
    expect(names).toContain(`projects/alpha-${alpha}.json`)
    expect(names.some((name) => name.startsWith(`snapshots/${alpha}/before-edits`))).toBe(true)
    expect(await manifestOf(bytes)).toEqual(manifest)
  })

  it('uses the in-memory copy of the open project, so unsaved edits are included', async () => {
    const alpha = await addProject('Alpha')
    const edited = { ...makeProject('Alpha'), name: 'Alpha (unsaved)' }
    const { manifest, bytes } = await buildLibraryBackup({
      current: { id: alpha, project: edited },
    })
    expect(manifest.projects).toEqual([
      expect.objectContaining({ id: alpha, name: 'Alpha (unsaved)' }),
    ])
    const entry = (await unzip(bytes)).find((item) => item.name === manifest.projects[0].file)!
    expect(JSON.parse(decoder.decode(entry.data)).name).toBe('Alpha (unsaved)')
  })

  it('names the file by date', () => {
    expect(backupFilename(new Date(2026, 8, 7))).toBe('mindmap-backup-2026-09-07.zip')
  })

  it('restores into another browser: projects, snapshots under the new ids, presets', async () => {
    const alpha = await addProject('Alpha')
    await addProject('Beta')
    await db.putSnapshot({
      projectId: alpha,
      name: 'Before edits',
      createdAt: '2026-09-03T00:00:00.000Z',
      project: makeProject('Alpha old'),
    })
    await customPreset('my-theme')
    const { bytes } = await buildLibraryBackup()

    // A fresh browser: empty library, built-ins only.
    await resetDatabase()
    await seedBuiltInPresets()
    useProjects.setState({ records: [] })

    const result = await restoreLibraryBackup(bytes)
    expect(result).toMatchObject({ ok: true, projects: 2, snapshots: 1, presets: 1 })
    if (!result.ok) return
    expect(describeRestore(result)).toBe(
      'Restored 2 projects, 1 snapshot, 1 preset from the backup.',
    )

    const stored = await db.listProjects()
    expect(stored.map((record) => record.project.name).sort()).toEqual(['Alpha', 'Beta'])
    const newAlpha = stored.find((record) => record.project.name === 'Alpha')!
    expect(newAlpha.id).not.toBe(alpha)
    expect((await db.listSnapshots(newAlpha.id)).map((s) => s.name)).toEqual(['Before edits'])
    expect(await db.getPreset('my-theme')).toBeDefined()
    // Listed on the start screen, and nothing was opened.
    expect(useProjects.getState().records).toHaveLength(2)
    expect(useProjects.getState().currentId).toBeNull()
  })

  it('adds next to existing projects and keeps an existing preset of the same name', async () => {
    await addProject('Alpha')
    const mine = await customPreset('my-theme')
    const { bytes } = await buildLibraryBackup()
    await db.putPreset({ ...mine, font: { ...mine.font, baseSize: mine.font.baseSize + 1 } })

    const result = await restoreLibraryBackup(bytes)
    expect(result).toMatchObject({ ok: true, projects: 1, presets: 0 })
    if (!result.ok) return
    expect(result.notes.join(' ')).toMatch(/Kept this browser's version of 1 preset .*my-theme/)
    expect((await db.listProjects()).filter((r) => r.project.name === 'Alpha')).toHaveLength(2)
    expect((await db.getPreset('my-theme'))!.font.baseSize).toBe(mine.font.baseSize + 1)
  })

  it('skips an invalid project and reports it', async () => {
    const manifest: BackupManifest = {
      kind: BACKUP_KIND,
      version: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      projects: [
        { file: 'projects/good.json', id: 'g', name: 'Good' },
        { file: 'projects/bad.json', id: 'b', name: 'Bad' },
        { file: 'projects/missing.json', id: 'm', name: 'Missing' },
      ],
      snapshots: [],
      presets: [],
    }
    const bytes = zipStore([
      { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest)) },
      { name: 'projects/good.json', data: encoder.encode(JSON.stringify(makeProject('Good'))) },
      { name: 'projects/bad.json', data: encoder.encode('{"kind":"project"}') },
    ])
    const result = await restoreLibraryBackup(bytes)
    expect(result).toMatchObject({ ok: true, projects: 1 })
    if (!result.ok) return
    expect(result.notes.join(' ')).toContain(
      'Skipped 2 unreadable items: project "Bad", project "Missing".',
    )
  })

  it('refuses a ZIP that is not a backup, and a backup from a newer app', async () => {
    const other = zipStore([{ name: 'map.html', data: encoder.encode('<html></html>') }])
    expect(await restoreLibraryBackup(other)).toEqual({
      ok: false,
      error: expect.stringMatching(/not a Mind Map Studio backup/),
    })
    const newer = zipStore([
      {
        name: 'manifest.json',
        data: encoder.encode(JSON.stringify({ kind: BACKUP_KIND, version: 99, projects: [] })),
      },
    ])
    expect(await restoreLibraryBackup(newer)).toEqual({
      ok: false,
      error: expect.stringMatching(/newer version/),
    })
    expect(await restoreLibraryBackup(encoder.encode('nope'))).toMatchObject({ ok: false })
  })
})

describe('images in backups (#149)', () => {
  const imageProject = (name: string, asset: string) => {
    const project = makeProject(name)
    return {
      ...project,
      map: {
        ...project.map,
        children: [
          { id: `${name}-p`, title: 'Photo', image: { asset, w: 100, h: 50, alt: 'Bench' } },
        ],
      },
    }
  }

  beforeEach(() => setImageCodec(simpleCodec()))
  afterEach(() => setImageCodec(null))

  it('carries the images projects and snapshots use, and restore brings them back', async () => {
    const used = await storeTestImage('used')
    const snap = await storeTestImage('snapshot', 'image/png')
    const unused = await storeTestImage('unused')
    await db.putProject({
      id: 'id-photo',
      project: imageProject('Photo', used.hash),
      updatedAt: '2026-09-01T10:00:00.000Z',
    })
    await db.putSnapshot({
      projectId: 'id-photo',
      name: 'Earlier',
      createdAt: '2026-09-02T00:00:00.000Z',
      project: imageProject('Photo', snap.hash),
    })
    const original = Array.from(new Uint8Array(await blobBytes((await getAsset(used.hash))!)))
    const backup = await buildLibraryBackup()
    const names = (await unzip(backup.bytes)).map((entry) => entry.name)
    expect(names).toContain(`assets/${used.hash}.webp`)
    expect(names).toContain(`assets/${snap.hash}.png`)
    expect(names).not.toContain(`assets/${unused.hash}.webp`)
    expect(backup.manifest.assets).toHaveLength(2)

    // Another browser: empty.
    await resetDatabase()
    await seedBuiltInPresets()
    const result = await restoreLibraryBackup(backup.bytes)
    expect(result).toMatchObject({ ok: true, projects: 1, snapshots: 1 })
    expect(Array.from(new Uint8Array(await blobBytes((await getAsset(used.hash))!)))).toEqual(
      original,
    )
    expect(await hasAsset(snap.hash)).toBe(true)
    expect(await hasAsset(unused.hash)).toBe(false)
    const restored = (await db.listProjects()).find((record) => record.project.name === 'Photo')
    expect(restored?.project.map.children?.[0].image).toEqual({
      asset: used.hash,
      w: 100,
      h: 50,
      alt: 'Bench',
    })
  })

  it('leaves out a damaged image and says so', async () => {
    const used = await storeTestImage('used')
    await db.putProject({
      id: 'id-photo',
      project: imageProject('Photo', used.hash),
      updatedAt: '2026-09-01T10:00:00.000Z',
    })
    const backup = await buildLibraryBackup()
    const entries = (await unzip(backup.bytes)).map((entry) =>
      entry.name.startsWith('assets/')
        ? { ...entry, data: encoder.encode('image:tampered') }
        : entry,
    )
    await resetDatabase()
    await seedBuiltInPresets()
    const result = await restoreLibraryBackup(zipStore(entries))
    expect(result.ok).toBe(true)
    expect(await hasAsset(used.hash)).toBe(false)
    expect(result.ok && result.notes.join(' ')).toContain('1 image in the backup was damaged')
  })

  it('restores an older backup without images as before', async () => {
    await addProject('Old')
    const backup = await buildLibraryBackup()
    expect(backup.manifest.assets).toBeUndefined()
    expect((await unzip(backup.bytes)).some((entry) => entry.name.startsWith('assets/'))).toBe(
      false,
    )
    await resetDatabase()
    await seedBuiltInPresets()
    expect(await restoreLibraryBackup(backup.bytes)).toMatchObject({ ok: true, projects: 1 })
  })

  it('opens a project exported with its images: the images are taken in and the project text returned', async () => {
    const used = await storeTestImage('zip')
    const bytes = new Uint8Array(await blobBytes((await getAsset(used.hash))!))
    const text = JSON.stringify(imageProject('Zipped', used.hash))
    await resetDatabase()
    const archive = zipStore([
      { name: 'zipped.mindmap.json', data: encoder.encode(text) },
      { name: `assets/${used.hash}.webp`, data: bytes },
    ])
    const opened = await openZipFile(archive)
    expect(opened).toEqual({ kind: 'project', name: 'zipped.mindmap.json', text })
    expect(await hasAsset(used.hash)).toBe(true)
  })
})

describe('backups the app can always restore (#157, #158)', () => {
  it('says when storage could not be read in full', async () => {
    const { vi } = await import('vitest')
    const spy = vi.spyOn(db, 'listProjects').mockRejectedValueOnce(new Error('broken'))
    const backup = await buildLibraryBackup({
      current: { id: 'p1', project: makeProject('Open one') },
    })
    expect(backup.manifest.partial).toBe(true)
    expect(backup.manifest.projects.map((p) => p.name)).toEqual(['Open one'])
    spy.mockRestore()
    expect((await buildLibraryBackup()).manifest.partial).toBeUndefined()
  })

  it('refuses to write a backup larger than restore accepts', async () => {
    const { BackupTooLargeError, checkBackupSize } = await import('./backup')
    const entry = (size: number) => ({ name: 'x', data: new Uint8Array(size) })
    const limits = { entry: 1000, total: 2500 }
    expect(() => checkBackupSize([entry(1000), entry(1000)], limits)).not.toThrow()
    expect(() => checkBackupSize([entry(1001)], limits)).toThrow(BackupTooLargeError)
    expect(() => checkBackupSize([entry(900), entry(900), entry(900)], limits)).toThrow(
      BackupTooLargeError,
    )
  })
})

describe('backups that say what they lack (#187, #189, #191)', () => {
  it('marks the backup partial when the presets could not be read', async () => {
    const { vi } = await import('vitest')
    const spy = vi.spyOn(db, 'listPresets').mockRejectedValueOnce(new Error('broken'))
    await addProject('Alpha')
    const backup = await buildLibraryBackup()
    expect(backup.manifest.partial).toBe(true)
    spy.mockRestore()
  })

  it('marks the backup partial and counts the pictures this browser does not have', async () => {
    const { partialBackupNote } = await import('./backup')
    const project = makeProject('Photo')
    const missing = `sha256-${'d'.repeat(64)}`
    await db.putProject({
      id: 'id-photo',
      project: {
        ...project,
        map: {
          ...project.map,
          children: [{ id: 'p', title: 'Photo', image: { asset: missing, w: 10, h: 10 } }],
        },
      },
      updatedAt: '2026-09-01T10:00:00.000Z',
    })
    const backup = await buildLibraryBackup()
    expect(backup.manifest).toMatchObject({ partial: true, missingAssets: 1 })
    expect(partialBackupNote(backup.manifest)).toContain('1 picture the projects use is not in it.')
    expect(partialBackupNote()).not.toContain('picture')
  })

  it('refuses a backup with more files than a ZIP can count', async () => {
    const { BackupTooLargeError, checkBackupSize } = await import('./backup')
    const entries = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(0) }))
    expect(() => checkBackupSize(entries(0xfffe))).not.toThrow()
    expect(() => checkBackupSize(entries(0xffff))).toThrow(BackupTooLargeError)
    expect(() => zipStore(entries(0xffff))).toThrow(RangeError)
  })

  it('skips snapshot entries whose name or date cannot be stored, and still lists the rest', async () => {
    const alpha = await addProject('Alpha')
    await db.putSnapshot({
      projectId: alpha,
      name: 'Good',
      createdAt: '2026-09-03T00:00:00.000Z',
      project: makeProject('Alpha old'),
    })
    const entries = await unzip((await buildLibraryBackup()).bytes)
    const manifestEntry = entries.find((entry) => entry.name === 'manifest.json')!
    const manifest = JSON.parse(decoder.decode(manifestEntry.data)) as BackupManifest
    const good = manifest.snapshots[0]
    const crafted = {
      ...manifest,
      snapshots: [
        good,
        { ...good, name: 'Numeric date', createdAt: 12345 },
        { ...good, name: 'Bad date', createdAt: 'not a date' },
        { ...good, name: 'x'.repeat(201) },
        { ...good, name: 7 },
      ],
    }
    const bytes = zipStore(
      entries.map((entry) =>
        entry.name === 'manifest.json'
          ? { name: entry.name, data: encoder.encode(JSON.stringify(crafted)) }
          : entry,
      ),
    )
    await resetDatabase()
    await seedBuiltInPresets()
    useProjects.setState({ records: [] })
    const result = await restoreLibraryBackup(bytes)
    expect(result).toMatchObject({ ok: true, projects: 1, snapshots: 1 })
    if (!result.ok) return
    expect(result.notes.join(' ')).toContain('Skipped 4 unreadable items')
    const restored = (await db.listProjects())[0]
    expect((await db.listSnapshots(restored.id)).map((s) => s.name)).toEqual(['Good'])
  })

  it('lists snapshots even when a stored date is not a string (#191)', async () => {
    const alpha = await addProject('Alpha')
    await db.putSnapshot({
      projectId: alpha,
      name: 'Odd',
      createdAt: 12345 as unknown as string,
      project: makeProject('Alpha old'),
    })
    await db.putSnapshot({
      projectId: alpha,
      name: 'Normal',
      createdAt: '2026-09-03T00:00:00.000Z',
      project: makeProject('Alpha old'),
    })
    expect((await db.listSnapshots(alpha)).map((s) => s.name).sort()).toEqual(['Normal', 'Odd'])
  })
})
