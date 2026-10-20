import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../io/db'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useToast } from '../components/toastStore'
import { FakeDirectory } from '../test/fakeDirectory'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import {
  confirmDeletes,
  linkFolder,
  reconnect,
  resetController,
  runSync,
  unlinkFolder,
} from './controller'
import { projectFileText } from './engine'
import { fileNameFor } from './names'
import { useSync } from './store'

let dir: FakeDirectory
const pickerWindow = window as unknown as { showDirectoryPicker?: () => Promise<FakeDirectory> }

beforeEach(async () => {
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
  await useProjects.getState().init()
  dir = new FakeDirectory('MindMaps')
  pickerWindow.showDirectoryPicker = async () => dir
  useSync.setState({ status: 'off', folderName: null, paused: null, skipped: [], error: null })
})

afterEach(() => {
  resetController()
  delete pickerWindow.showDirectoryPicker
})

const onlyFile = () => [...dir.files.keys()].find((name) => name.endsWith('.mindmap.json'))!

describe('folder sync controller (#107–#111)', () => {
  it('links a folder, writes projects and reports the status', async () => {
    const id = await useProjects.getState().createProject('Kitchen plan')
    expect(await linkFolder()).toBe(true)
    expect(useSync.getState()).toMatchObject({ status: 'idle', folderName: 'MindMaps' })
    expect(onlyFile()).toBe(fileNameFor('Kitchen plan', id))
    expect(dir.json(onlyFile())).toMatchObject({ kind: 'project', name: 'Kitchen plan' })
    expect(await db.getSetting('syncFolder')).toBeDefined()
  })

  it('takes a change from another computer into the open project, as one undo step', async () => {
    const id = await useProjects.getState().createProject('Shared')
    await linkFolder()
    const record = (await db.getProject(id))!
    const changed = {
      ...record,
      project: {
        ...record.project,
        map: makeTree(record.project.map.id, 'Shared', [makeTree('x1', 'From the laptop')]),
      },
      updatedAt: '2099-01-01T00:00:00.000Z',
    }
    dir.put(onlyFile(), projectFileText(changed))
    await runSync()
    expect(useProjects.getState().current!.map.children![0].title).toBe('From the laptop')
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.children ?? []).toHaveLength(0)
  })

  it('asks to reconnect when the permission lapses, and resumes after it', async () => {
    await useProjects.getState().createProject('P')
    await linkFolder()
    dir.permission = 'prompt'
    await runSync()
    expect(useSync.getState().status).toBe('reconnect')
    await reconnect()
    expect(useSync.getState().status).toBe('idle')
  })

  it('says when the folder is gone', async () => {
    await useProjects.getState().createProject('P')
    await linkFolder()
    dir.missing = true
    await runSync()
    expect(useSync.getState().status).toBe('missing')
  })

  it('pauses on mass disappearance and trashes only after confirmation', async () => {
    for (const name of ['A', 'B', 'C']) await useProjects.getState().createProject(name)
    await useProjects.getState().goHome()
    await linkFolder()
    expect(dir.files.size).toBe(3)
    dir.files.clear()
    await runSync()
    expect(useSync.getState().status).toBe('paused')
    expect(useProjects.getState().records).toHaveLength(3)
    await confirmDeletes()
    expect(useProjects.getState().records).toHaveLength(0)
    expect(useProjects.getState().trashed).toHaveLength(3)
  })

  it('unlinking forgets the folder and keeps the files', async () => {
    await useProjects.getState().createProject('Keep')
    await linkFolder()
    await unlinkFolder()
    expect(useSync.getState().status).toBe('off')
    expect(await db.getSetting('syncFolder')).toBeUndefined()
    expect(dir.files.size).toBe(1)
  })

  it('a cancelled picker links nothing', async () => {
    pickerWindow.showDirectoryPicker = async () => {
      throw Object.assign(new Error('cancel'), { name: 'AbortError' })
    }
    expect(await linkFolder()).toBe(false)
    expect(useSync.getState().status).toBe('off')
  })

  it('keeps the open project open when its file is deleted elsewhere, then trashes it (#119)', async () => {
    const keep = await useProjects.getState().createProject('Keep')
    const id = await useProjects.getState().createProject('Open one')
    await linkFolder()
    dir.files.delete(fileNameFor('Open one', id))
    const messages: string[] = []
    const stop = useToast.subscribe((state) => void (state.message && messages.push(state.message)))
    await runSync()
    stop()
    expect(useProjects.getState().currentId).toBe(id)
    expect(useProjects.getState().trashed).toHaveLength(0)
    expect(useSync.getState().skipped).toEqual([{ file: 'Open one', reason: 'open-removed' }])
    expect(messages.some((message) => message.includes('“Open one” was deleted'))).toBe(true)
    await useProjects.getState().goHome()
    await runSync()
    expect(useProjects.getState().trashed.map((r) => r.id)).toEqual([id])
    expect(useProjects.getState().records.map((r) => r.id)).toEqual([keep])
  })

  it('runs one pass at a time across tabs with Web Locks (#117)', async () => {
    const names: string[] = []
    const nav = navigator as unknown as { locks?: unknown }
    const before = nav.locks
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name: string, callback: () => Promise<unknown>) => {
          names.push(name)
          return callback()
        },
      },
    })
    try {
      await useProjects.getState().createProject('P')
      await linkFolder()
      expect(names).toEqual(['mindmap-sync'])
      expect(dir.files.size).toBe(1)
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: before })
    }
  })

  it('tags conflict copies so the tag filter finds them (#120)', async () => {
    const id = await useProjects.getState().createProject('Shared')
    await linkFolder()
    await useProjects.getState().goHome()
    const record = (await db.getProject(id))!
    await db.putProject({
      ...record,
      project: { ...record.project, map: makeTree(record.project.map.id, 'Here', []) },
      updatedAt: '2099-01-01T00:00:00.000Z',
    })
    await useProjects.getState().init()
    dir.put(
      onlyFile(),
      projectFileText({
        ...record,
        project: { ...record.project, map: makeTree(record.project.map.id, 'There', []) },
        updatedAt: '2098-01-01T00:00:00.000Z',
      }),
    )
    await runSync()
    const copy = useProjects.getState().records.find((r) => r.id !== id)!
    expect(copy.project.tags).toEqual(['conflict'])
    expect(copy.project.map.title).toBe('There')
  })

  it('linking another folder starts presets from a clean slate (#123)', async () => {
    const base = (await db.listPresets())[0]
    await db.putPreset({ ...base, name: 'ocean' })
    await linkFolder()
    expect(dir.dirs.get('_presets')!.files.has('ocean.json')).toBe(true)
    dir = new FakeDirectory('Other')
    await linkFolder()
    expect(await db.getPreset('ocean')).toBeDefined()
    expect(dir.dirs.get('_presets')!.files.has('ocean.json')).toBe(true)
  })
})
