import { describe, expect, it } from 'vitest'
import type { ProjectRecord, SyncRecord } from '../io/db'
import type { Project } from '../schema/types'
import { CaseInsensitiveDirectory, FakeDirectory } from '../test/fakeDirectory'
import { makeProject, makeTree } from '../test/fixtures'
import { CONFLICT_TAG, reconcile, projectFileText, type EngineDeps } from './engine'
import { wrapHandle } from './folder'
import { fileNameFor, projectHash } from './names'

const ID_A = 'AAAAAAAAAA'
const ID_B = 'BBBBBBBBBB'
const ID_C = 'CCCCCCCCCC'

function project(name: string, ideas: string[] = []): Project {
  return makeProject(
    name,
    undefined,
    makeTree(
      'm',
      name,
      ideas.map((idea, i) => makeTree(`n${i}`, idea)),
    ),
  )
}

function record(id: string, p: Project, updatedAt = '2026-10-01T00:00:00.000Z'): ProjectRecord {
  return { id, project: { ...p, updatedAt }, updatedAt }
}

/** A browser library in memory, wired to the engine like the real controller. */
function library(initial: ProjectRecord[] = []) {
  const records = new Map(initial.map((r) => [r.id, r]))
  const sync = new Map<string, SyncRecord>()
  const copies: Project[] = []
  const busy = new Set<string>()
  const open = new Set<string>()
  let copyCount = 0
  const deps = (dir: FakeDirectory, allowMassDelete = false): EngineDeps => ({
    folder: wrapHandle(dir, [0, 0]),
    listRecords: async () => [...records.values()],
    listSync: async () => [...sync.values()],
    putSync: async (r) => void sync.set(r.projectId, r),
    deleteSync: async (id) => void sync.delete(id),
    adopt: async (id, p) => {
      if (busy.has(id)) return 'busy'
      const updatedAt = p.updatedAt ?? '2026-10-02T00:00:00.000Z'
      records.set(id, { id, project: { ...p, updatedAt }, updatedAt })
      return 'applied'
    },
    addCopies: async (ps) => {
      for (const p of ps) {
        copies.push(p)
        const id = `COPY${String(++copyCount).padStart(6, '0')}`
        records.set(id, { id, project: p, updatedAt: '2026-10-03T00:00:00.000Z' })
      }
    },
    trash: async (id) => {
      if (open.has(id)) return 'open'
      const r = records.get(id)
      if (r) records.set(id, { ...r, deletedAt: '2026-10-04T00:00:00.000Z' })
      return 'trashed'
    },
    allowMassDelete,
    conflictLabel: () => 'conflict copy',
  })
  return { records, sync, copies, busy, open, deps }
}

const edit = (r: ProjectRecord, ideas: string[], updatedAt: string): ProjectRecord =>
  record(
    r.id,
    {
      ...r.project,
      map: makeTree(
        'm',
        r.project.name,
        ideas.map((t, i) => makeTree(`e${i}`, t)),
      ),
    },
    updatedAt,
  )

describe('folder sync: writing (#108)', () => {
  it('writes every project as a readable project file', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([
      record(ID_A, project('Kitchen: Smith/Jones')),
      record(ID_B, project('厨房')),
    ])
    const report = await reconcile(lib.deps(dir))
    expect(report.written).toBe(2)
    const name = fileNameFor('Kitchen: Smith/Jones', ID_A)
    expect(name).toBe('Kitchen- Smith-Jones (AAAAAAAAAA).mindmap.json')
    expect(dir.json(name)).toMatchObject({ kind: 'project', name: 'Kitchen: Smith/Jones' })
    expect(dir.files.has(`厨房 (${ID_B}).mindmap.json`)).toBe(true)
    // A second pass with nothing changed writes nothing.
    expect((await reconcile(lib.deps(dir))).written).toBe(0)
  })

  it('rewrites only what changed, and renames the file with the project', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Old name')), record(ID_B, project('Other'))])
    await reconcile(lib.deps(dir))
    const renamed = record(
      ID_A,
      { ...lib.records.get(ID_A)!.project, name: 'New name' },
      '2026-10-05T00:00:00.000Z',
    )
    lib.records.set(ID_A, renamed)
    const report = await reconcile(lib.deps(dir))
    expect(report.written).toBe(1)
    expect(dir.files.has(`New name (${ID_A}).mindmap.json`)).toBe(true)
    expect(dir.files.has(`Old name (${ID_A}).mindmap.json`)).toBe(false)
    expect(dir.dirs.get('_trash')!.files.has(`Old name (${ID_A}).mindmap.json`)).toBe(true)
  })

  it('keeps the file when a rename changes only letter case or normalisation (#153)', async () => {
    for (const [from, to] of [
      ['plan', 'Plan'],
      ['Cafe\u0301', 'Caf\u00e9'],
    ]) {
      const dir = new CaseInsensitiveDirectory('MindMaps')
      const lib = library([record(ID_A, project(from))])
      await reconcile(lib.deps(dir))
      lib.records.set(
        ID_A,
        record(ID_A, { ...lib.records.get(ID_A)!.project, name: to }, '2026-10-05T00:00:00.000Z'),
      )
      await reconcile(lib.deps(dir))
      // The project still has its file, holding the new name, and is not trashed later.
      expect(dir.files.size).toBe(1)
      expect([...dir.files.values()][0].text).toContain(`"name": "${to}"`)
      await reconcile(lib.deps(dir))
      await reconcile(lib.deps(dir))
      expect(lib.records.get(ID_A)!.deletedAt).toBeUndefined()
      expect(dir.dirs.get('_trash')?.files.size ?? 0).toBe(0)
    }
  })

  it('still moves the old file away on a case-sensitive disk (#153)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('plan'))])
    await reconcile(lib.deps(dir))
    lib.records.set(
      ID_A,
      record(ID_A, { ...lib.records.get(ID_A)!.project, name: 'Plan' }, '2026-10-05T00:00:00.000Z'),
    )
    await reconcile(lib.deps(dir))
    expect([...dir.files.keys()]).toEqual([`Plan (${ID_A}).mindmap.json`])
  })

  it('retries a file OneDrive holds, then reports it busy without failing the pass', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('A'))])
    dir.busy = 1
    expect((await reconcile(lib.deps(dir))).written).toBe(1)
    lib.records.set(ID_A, edit(lib.records.get(ID_A)!, ['x'], '2026-10-06T00:00:00.000Z'))
    dir.busy = 10
    const report = await reconcile(lib.deps(dir))
    expect(report.skipped).toEqual([expect.objectContaining({ reason: 'busy' })])
  })
})

describe('folder sync: reading back (#110)', () => {
  it('takes a newer file from another PC when nothing changed here', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Plan'))])
    await reconcile(lib.deps(dir))
    const other = edit(lib.records.get(ID_A)!, ['from the laptop'], '2026-10-07T00:00:00.000Z')
    dir.put(fileNameFor('Plan', ID_A), projectFileText(other))
    const report = await reconcile(lib.deps(dir))
    expect(report.taken).toBe(1)
    expect(lib.records.get(ID_A)!.project.map.children![0].title).toBe('from the laptop')
    expect((await reconcile(lib.deps(dir))).taken).toBe(0)
  })

  it('creates projects made on another PC with the same id', async () => {
    const dir = new FakeDirectory('MindMaps')
    dir.put(fileNameFor('Laptop idea', ID_C), projectFileText(record(ID_C, project('Laptop idea'))))
    const lib = library()
    const report = await reconcile(lib.deps(dir))
    expect(report.created).toBe(1)
    expect(lib.records.get(ID_C)!.project.name).toBe('Laptop idea')
    expect((await reconcile(lib.deps(dir))).written).toBe(0)
  })

  it('leaves the open project alone while it has unsaved edits (W3)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Open'))])
    await reconcile(lib.deps(dir))
    dir.put(
      fileNameFor('Open', ID_A),
      projectFileText(edit(lib.records.get(ID_A)!, ['x'], '2026-10-08T00:00:00.000Z')),
    )
    lib.busy.add(ID_A)
    const report = await reconcile(lib.deps(dir))
    expect(report.skipped).toEqual([expect.objectContaining({ reason: 'open-unsaved' })])
    lib.busy.clear()
    expect((await reconcile(lib.deps(dir))).taken).toBe(1)
  })

  it('treats an unreadable (cloud-only, offline) file as "later", not invalid (§0a-3)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const name = fileNameFor('Cloud', ID_C)
    dir.put(name, projectFileText(record(ID_C, project('Cloud'))))
    dir.unreadable.add(name)
    const lib = library()
    expect((await reconcile(lib.deps(dir))).skipped).toEqual([
      { file: name, reason: 'unavailable' },
    ])
    dir.unreadable.clear()
    expect((await reconcile(lib.deps(dir))).created).toBe(1)
  })

  it('skips an invalid file and says why', async () => {
    const dir = new FakeDirectory('MindMaps')
    dir.put(`Broken (${ID_C}).mindmap.json`, '{ not json')
    const report = await reconcile(library().deps(dir))
    expect(report.skipped[0]).toMatchObject({ reason: 'invalid' })
  })
})

describe('folder sync: conflicts and deletes (#111)', () => {
  it('keeps the newer side and the other as a conflict copy (W-D1)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Shared'))])
    await reconcile(lib.deps(dir))
    lib.records.set(
      ID_A,
      edit(lib.records.get(ID_A)!, ['desktop edit'], '2026-10-09T00:00:00.000Z'),
    )
    dir.put(
      fileNameFor('Shared', ID_A),
      projectFileText(edit(lib.records.get(ID_A)!, ['laptop edit'], '2026-10-10T00:00:00.000Z')),
    )
    const report = await reconcile(lib.deps(dir))
    expect(report.conflicts).toEqual(['Shared'])
    expect(lib.records.get(ID_A)!.project.map.children![0].title).toBe('laptop edit')
    expect(lib.copies[0].name).toBe('Shared (conflict copy)')
    expect(lib.copies[0].tags).toEqual([CONFLICT_TAG])
    expect(lib.copies[0].map.children![0].title).toBe('desktop edit')
  })

  it('turns OneDrive’s own conflict files into conflict copies and moves them aside (§0a-6)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Roadmap'))])
    await reconcile(lib.deps(dir))
    const dup = `Roadmap (${ID_A}).mindmap-LAPTOP.json`
    dir.put(
      dup,
      projectFileText(edit(lib.records.get(ID_A)!, ['laptop'], '2026-10-11T00:00:00.000Z')),
    )
    const report = await reconcile(lib.deps(dir))
    expect(lib.copies.map((p) => p.name)).toEqual(['Roadmap (conflict copy)'])
    expect(dir.files.has(dup)).toBe(false)
    expect(dir.dirs.get('_trash')!.files.has(dup)).toBe(true)
    expect(report.trashedInFolder).toBe(1)
  })

  it('moves the file of a project trashed here to _trash (W-D2)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Gone'))])
    await reconcile(lib.deps(dir))
    lib.records.set(ID_A, { ...lib.records.get(ID_A)!, deletedAt: '2026-10-12T00:00:00.000Z' })
    await reconcile(lib.deps(dir))
    expect(dir.files.size).toBe(0)
    expect(dir.dirs.get('_trash')!.files.has(`Gone (${ID_A}).mindmap.json`)).toBe(true)
    expect(lib.sync.get(ID_A)?.trashed).toBe(true)
  })

  it('trashes a project whose file was removed on another PC, unless edited here since', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('A')), record(ID_B, project('B'))])
    await reconcile(lib.deps(dir))
    dir.files.delete(fileNameFor('A', ID_A))
    dir.files.delete(fileNameFor('B', ID_B))
    lib.records.set(ID_B, edit(lib.records.get(ID_B)!, ['kept'], '2026-10-13T00:00:00.000Z'))
    // Two of two missing would trip the guard; allow it as the user would.
    const report = await reconcile(lib.deps(dir, true))
    expect(report.trashedHere).toBe(1)
    expect(lib.records.get(ID_A)!.deletedAt).toBeDefined()
    expect(lib.records.get(ID_B)!.deletedAt).toBeUndefined()
    expect(dir.files.has(fileNameFor('B', ID_B))).toBe(true)
  })

  it('pauses instead of trashing when most files vanish at once (§0a-5)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const ids = ['P000000001', 'P000000002', 'P000000003', 'P000000004']
    const lib = library(ids.map((id, i) => record(id, project(`P${i}`))))
    await reconcile(lib.deps(dir))
    for (const [name] of [...dir.files].slice(0, 3)) dir.files.delete(name)
    const report = await reconcile(lib.deps(dir))
    expect(report.paused).toEqual({ missing: 3, known: 4 })
    expect([...lib.records.values()].every((r) => !r.deletedAt)).toBe(true)
    const confirmed = await reconcile(lib.deps(dir, true))
    expect(confirmed.trashedHere).toBe(3)
  })

  it('pauses when a linked folder turns up empty', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('A')), record(ID_B, project('B'))])
    await reconcile(lib.deps(dir))
    dir.files.clear()
    expect((await reconcile(lib.deps(dir))).paused).toEqual({ missing: 2, known: 2 })
  })

  it('a project whose hash matches the file just records the agreement', async () => {
    const dir = new FakeDirectory('MindMaps')
    const p = project('Same')
    dir.put(fileNameFor('Same', ID_A), projectFileText(record(ID_A, p, '2026-01-01T00:00:00.000Z')))
    const lib = library([record(ID_A, p)])
    const report = await reconcile(lib.deps(dir))
    expect(report).toMatchObject({ written: 0, taken: 0, conflicts: [] })
    expect(lib.sync.get(ID_A)!.hash).toBe(projectHash(lib.records.get(ID_A)!.project))
  })
})

describe('folder sync: review fixes (#113–#120)', () => {
  it('a file that vanishes mid-pass is skipped, not a missing folder (#113)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('A')), record(ID_B, project('B'))])
    await reconcile(lib.deps(dir))
    lib.records.set(ID_A, { ...lib.records.get(ID_A)!, deletedAt: '2026-10-12T00:00:00.000Z' })
    lib.records.set(ID_B, edit(lib.records.get(ID_B)!, ['new'], '2026-10-12T00:00:00.000Z'))
    dir.lost.add(fileNameFor('A', ID_A))
    const report = await reconcile(lib.deps(dir))
    expect(report.skipped).toEqual([{ file: fileNameFor('A', ID_A), reason: 'unavailable' }])
    expect(report.written).toBe(1)
    dir.lost.clear()
    expect((await reconcile(lib.deps(dir))).trashedInFolder).toBe(1)
  })

  it('a project restored from the Trash on one PC comes back on the other (#114)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const desktop = library([record(ID_A, project('Plan')), record(ID_B, project('Keep'))])
    await reconcile(desktop.deps(dir))
    const laptop = library()
    await reconcile(laptop.deps(dir))
    expect(laptop.records.get(ID_A)).toBeDefined()

    // Trashed on the desktop: its file goes to _trash, so the laptop trashes it too.
    desktop.records.set(ID_A, {
      ...desktop.records.get(ID_A)!,
      deletedAt: '2026-10-12T00:00:00.000Z',
    })
    await reconcile(desktop.deps(dir))
    expect((await reconcile(laptop.deps(dir))).trashedHere).toBe(1)

    // Restored on the laptop: written again, and the desktop takes it back.
    const { deletedAt: _gone, ...restored } = laptop.records.get(ID_A)!
    laptop.records.set(ID_A, restored)
    expect((await reconcile(laptop.deps(dir))).written).toBe(1)
    const report = await reconcile(desktop.deps(dir))
    expect(report.restored).toBe(1)
    expect(desktop.records.get(ID_A)!.deletedAt).toBeUndefined()
    expect(dir.files.has(fileNameFor('Plan', ID_A))).toBe(true)
    // Settled: nothing more happens on either side.
    expect(await reconcile(desktop.deps(dir))).toMatchObject({ written: 0, restored: 0 })
    expect(await reconcile(laptop.deps(dir))).toMatchObject({ written: 0, trashedHere: 0 })
  })

  it('a project restored from the Trash here is written again (#114)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Back'))])
    await reconcile(lib.deps(dir))
    lib.records.set(ID_A, { ...lib.records.get(ID_A)!, deletedAt: '2026-10-12T00:00:00.000Z' })
    await reconcile(lib.deps(dir))
    const { deletedAt: _gone, ...restored } = lib.records.get(ID_A)!
    lib.records.set(ID_A, restored)
    const report = await reconcile(lib.deps(dir))
    expect(report).toMatchObject({ written: 1, trashedHere: 0 })
    expect(lib.records.get(ID_A)!.deletedAt).toBeUndefined()
  })

  it('a file whose details cannot be read is skipped, never treated as removed (#116)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('A'))])
    await reconcile(lib.deps(dir))
    dir.put(fileNameFor('New', ID_C), projectFileText(record(ID_C, project('New'))))
    dir.statFails.add(fileNameFor('A', ID_A))
    const report = await reconcile(lib.deps(dir))
    expect(report.created).toBe(1)
    expect(report.trashedHere).toBe(0)
    expect(report.skipped).toEqual([{ file: fileNameFor('A', ID_A), reason: 'unavailable' }])
    expect(lib.records.get(ID_A)!.deletedAt).toBeUndefined()
  })

  it('leaves the open project alone when its file was removed elsewhere (#119)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Open')), record(ID_B, project('B'))])
    await reconcile(lib.deps(dir))
    dir.files.delete(fileNameFor('Open', ID_A))
    lib.open.add(ID_A)
    const report = await reconcile(lib.deps(dir))
    expect(report.skipped).toEqual([{ file: 'Open', reason: 'open-removed' }])
    expect(lib.records.get(ID_A)!.deletedAt).toBeUndefined()
    lib.open.clear()
    expect((await reconcile(lib.deps(dir))).trashedHere).toBe(1)
  })

  it('keeps an unreadable file in _trash before writing the edited project over it', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Mine'))])
    await reconcile(lib.deps(dir))
    dir.put(fileNameFor('Mine', ID_A), '{ broken')
    lib.records.set(ID_A, edit(lib.records.get(ID_A)!, ['edit'], '2026-10-12T00:00:00.000Z'))
    const report = await reconcile(lib.deps(dir))
    expect(report.skipped[0]).toMatchObject({ reason: 'invalid' })
    expect(dir.dirs.get('_trash')!.files.get(fileNameFor('Mine', ID_A))!.text).toBe('{ broken')
    expect(dir.json(fileNameFor('Mine', ID_A))).toMatchObject({ name: 'Mine' })
  })
})

describe('folder sync: second review (#124, #130)', () => {
  it('keeps this PC’s version before taking the newer file, so a failed copy loses nothing (#124)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Shared'))])
    const deps = lib.deps(dir)
    await reconcile(deps)
    lib.records.set(ID_A, edit(lib.records.get(ID_A)!, ['local edit'], '2026-10-09T00:00:00.000Z'))
    dir.put(
      fileNameFor('Shared', ID_A),
      projectFileText(edit(lib.records.get(ID_A)!, ['remote edit'], '2026-10-10T00:00:00.000Z')),
    )
    const failing: EngineDeps = {
      ...deps,
      addCopies: async () => {
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
      },
    }
    await expect(reconcile(failing)).rejects.toThrow('quota')
    expect(lib.records.get(ID_A)!.project.map.children![0].title).toBe('local edit')
  })

  it('takes a rename made on another PC while OneDrive still has the old file (#130)', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Old'))])
    await reconcile(lib.deps(dir))
    const renamed = record(
      ID_A,
      { ...lib.records.get(ID_A)!.project, name: 'New' },
      '2026-10-10T00:00:00.000Z',
    )
    dir.put(fileNameFor('New', ID_A), projectFileText(renamed))
    const report = await reconcile(lib.deps(dir))
    expect(report.conflicts).toEqual([])
    expect(lib.copies).toEqual([])
    expect(lib.records.get(ID_A)!.project.name).toBe('New')
    expect(dir.files.has(fileNameFor('New', ID_A))).toBe(true)
    expect(dir.files.has(fileNameFor('Old', ID_A))).toBe(false)
  })
})

describe('folder sync: files from a newer app version (GE0a)', () => {
  const newerText = (r: ProjectRecord) => {
    const doc = JSON.parse(projectFileText(r))
    doc.map.progressRing = true // a field this version does not know
    return `${JSON.stringify(doc, null, 2)}\n`
  }

  it('never moves or overwrites it, even when the project changed here', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Plan'))])
    await reconcile(lib.deps(dir))
    const name = fileNameFor('Plan', ID_A)
    const text = newerText(edit(lib.records.get(ID_A)!, ['laptop'], '2026-10-12T00:00:00.000Z'))
    dir.put(name, text)
    lib.records.set(ID_A, edit(lib.records.get(ID_A)!, ['here'], '2026-10-12T01:00:00.000Z'))
    const report = await reconcile(lib.deps(dir))
    expect(report.skipped).toEqual([expect.objectContaining({ file: name, reason: 'newer' })])
    expect(dir.files.get(name)!.text).toBe(text)
    expect(dir.dirs.get('_trash')?.files.size ?? 0).toBe(0)
    expect(lib.records.get(ID_A)!.project.map.children![0].title).toBe('here')
  })

  it('leaves a duplicate made by a newer app where it is', async () => {
    const dir = new FakeDirectory('MindMaps')
    const lib = library([record(ID_A, project('Plan'))])
    await reconcile(lib.deps(dir))
    const dup = `Plan (${ID_A}).mindmap-LAPTOP.json`
    dir.put(dup, newerText(lib.records.get(ID_A)!))
    const report = await reconcile(lib.deps(dir))
    expect(report.skipped).toEqual([expect.objectContaining({ file: dup, reason: 'newer' })])
    expect(dir.files.has(dup)).toBe(true)
    expect(lib.copies).toEqual([])
  })

  it('a file that declares a newer format is not taken', async () => {
    const dir = new FakeDirectory('MindMaps')
    const doc = JSON.parse(projectFileText(record(ID_C, project('Future'))))
    dir.put(fileNameFor('Future', ID_C), JSON.stringify({ ...doc, app: { minVersion: 99 } }))
    const lib = library()
    const report = await reconcile(lib.deps(dir))
    expect(report.created).toBe(0)
    expect(report.skipped).toEqual([expect.objectContaining({ reason: 'newer' })])
  })
})

describe('folder sync: format 2 fields (#148)', () => {
  const withTask = (name: string, done: boolean): Project =>
    makeProject(
      name,
      undefined,
      makeTree('m', name, [
        makeTree('t', 'Order tiles', [], done ? { role: 'task', done: true } : { role: 'task' }),
      ]),
    )

  it('writes no app block for a project without the new fields', () => {
    const text = projectFileText(record(ID_A, project('Plain', ['a'])))
    expect(JSON.parse(text)).not.toHaveProperty('app')
    expect(text).not.toContain('minVersion')
  })

  it('marks a file that uses them with the format it needs', () => {
    const doc = JSON.parse(projectFileText(record(ID_A, withTask('Tasks', true))))
    expect(doc.app).toEqual({ minVersion: 2 })
  })

  it('carries them from one PC to another through the folder', async () => {
    const dir = new FakeDirectory('MindMaps')
    const laptop = library([record(ID_A, withTask('Tasks', false))])
    await reconcile(laptop.deps(dir))
    const desktop = library()
    expect((await reconcile(desktop.deps(dir))).created).toBe(1)
    expect(desktop.records.get(ID_A)!.project.map.children![0]).toMatchObject({ role: 'task' })
    expect(desktop.records.get(ID_A)!.project).not.toHaveProperty('app')

    // Done on the desktop, then back on the laptop.
    desktop.records.set(ID_A, record(ID_A, withTask('Tasks', true), '2026-10-12T00:00:00.000Z'))
    expect((await reconcile(desktop.deps(dir))).written).toBe(1)
    const report = await reconcile(laptop.deps(dir))
    expect(report.taken).toBe(1)
    expect(report.skipped).toEqual([])
    expect(laptop.records.get(ID_A)!.project.map.children![0]).toMatchObject({ done: true })
    // Nothing changed since: the next passes write nothing.
    expect((await reconcile(laptop.deps(dir))).written).toBe(0)
    expect((await reconcile(desktop.deps(dir))).written).toBe(0)
  })

  it('carries a link label and its change', async () => {
    const base = project('Linked', ['a', 'b'])
    const linked = (label: string): Project => ({
      ...base,
      links: [{ from: 'n0', to: 'n1', label }],
    })
    const dir = new FakeDirectory('MindMaps')
    const laptop = library([record(ID_B, linked('blocks'))])
    await reconcile(laptop.deps(dir))
    expect(dir.json(fileNameFor('Linked', ID_B))).toMatchObject({ app: { minVersion: 2 } })
    const desktop = library()
    await reconcile(desktop.deps(dir))
    expect(desktop.records.get(ID_B)!.project.links).toEqual([
      { from: 'n0', to: 'n1', label: 'blocks' },
    ])
    desktop.records.set(ID_B, record(ID_B, linked('needs'), '2026-10-12T00:00:00.000Z'))
    await reconcile(desktop.deps(dir))
    expect((await reconcile(laptop.deps(dir))).taken).toBe(1)
    expect(laptop.records.get(ID_B)!.project.links![0].label).toBe('needs')
  })
})

describe('folder sync: node tags, format 3 (#150)', () => {
  const tagged = (name: string, tags: string[]): Project =>
    makeProject(name, undefined, makeTree('m', name, [makeTree('t', 'Login', [], { tags })]))

  it('marks the file with app.minVersion 3 and carries tag edits between PCs', async () => {
    const dir = new FakeDirectory('MindMaps')
    const laptop = library([record(ID_A, tagged('Tagged', ['p1']))])
    await reconcile(laptop.deps(dir))
    const doc = dir.json(fileNameFor('Tagged', ID_A)) as { app?: unknown }
    expect(doc.app).toEqual({ minVersion: 3 })
    const desktop = library()
    expect((await reconcile(desktop.deps(dir))).created).toBe(1)
    expect(desktop.records.get(ID_A)!.project.map.children![0].tags).toEqual(['p1'])
    expect(desktop.records.get(ID_A)!.project).not.toHaveProperty('app')

    desktop.records.set(
      ID_A,
      record(ID_A, tagged('Tagged', ['p1', 'backend']), '2026-10-12T00:00:00.000Z'),
    )
    expect((await reconcile(desktop.deps(dir))).written).toBe(1)
    const report = await reconcile(laptop.deps(dir))
    expect(report.taken).toBe(1)
    expect(report.skipped).toEqual([])
    expect(laptop.records.get(ID_A)!.project.map.children![0].tags).toEqual(['p1', 'backend'])
    expect((await reconcile(laptop.deps(dir))).written).toBe(0)
    expect((await reconcile(desktop.deps(dir))).written).toBe(0)
  })

  it('an older app (format 2) would report the file, so it declares format 3', () => {
    const text = projectFileText(record(ID_B, tagged('T', ['q4'])))
    expect(JSON.parse(text).app).toEqual({ minVersion: 3 })
    const plain = projectFileText(record(ID_B, project('Plain', ['a'])))
    expect(plain).not.toContain('minVersion')
  })
})

describe('reading sync files (#179)', () => {
  it('reports a tree deeper than the limit as invalid instead of crashing', async () => {
    const { parseProjectFile } = await import('./engine')
    const deepJson = (levels: number) => {
      const open = Array.from(
        { length: levels - 1 },
        (_, i) => `{"id":"n${i}","title":"x","children":[`,
      ).join('')
      const map = `${open}{"id":"leaf","title":"x"}${']}'.repeat(levels - 1)}`
      const base = project('Deep')
      return JSON.stringify(base).replace(/"map":\{[^}]+\}/, `"map":${map}`)
    }
    for (const levels of [1500, 20000]) {
      const file = deepJson(levels)
      const parsed = parseProjectFile(file)
      expect(parsed.ok).toBe(false)
      expect(!parsed.ok && parsed.detail).toContain('deeper than')
    }
  })
})
