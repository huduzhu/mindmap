import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../io/db'
import { makeProject, makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { useProjects } from './projects'

beforeEach(async () => {
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await resetDatabase()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saving around project switches (#126, #127)', () => {
  it('an edit made while another project opens is saved to its own project', async () => {
    const a = await useProjects.getState().createProject('A')
    const b = await useProjects.getState().createProject('B')
    const loading = useProjects.getState().loadProject(a)
    useProjects.getState().updateCurrent((p) => ({ ...p, name: 'B edited' }))
    await loading
    expect(useProjects.getState().currentId).toBe(a)
    await useProjects.getState().saveCurrent()
    expect((await db.getProject(b))!.project.name).toBe('B edited')
    expect((await db.getProject(a))!.project.name).toBe('A')
  })

  it('a failed save keeps the project open instead of dropping the edit', async () => {
    const id = await useProjects.getState().createProject('P')
    const spy = vi
      .spyOn(db, 'putProjectIfUnchanged')
      .mockRejectedValue(Object.assign(new Error('Transaction aborted'), { name: 'UnknownError' }))
    useProjects.getState().updateCurrent((p) => ({ ...p, name: 'P edited' }))
    await useProjects.getState().saveCurrent()
    expect(useProjects.getState().saveStatus).toBe('error')

    await useProjects.getState().goHome()
    expect(useProjects.getState().currentId).toBe(id)
    expect(useProjects.getState().syncNotice).toMatch(/could not be saved/)

    spy.mockRestore()
    await useProjects.getState().goHome()
    expect(useProjects.getState().currentId).toBeNull()
    expect((await db.getProject(id))!.project.name).toBe('P edited')
  })
})

describe('taking a change from the sync folder (#125, #129)', () => {
  it('never overwrites a copy saved after the pass read it', async () => {
    const id = 'AAAAAAAAAA'
    const p = makeProject('Shared', undefined, makeTree('m', 'Shared'))
    await db.putProject({ id, project: { ...p, updatedAt: 'T1' }, updatedAt: 'T1' })
    await db.putProject({
      id,
      project: { ...p, name: 'Saved since', updatedAt: 'T2' },
      updatedAt: 'T2',
    })
    const result = await useProjects
      .getState()
      .adoptSynced(id, { ...p, name: 'From laptop', updatedAt: 'T3' }, 'T1')
    expect(result).toBe('busy')
    expect((await db.getProject(id))!.project.name).toBe('Saved since')
  })

  it('drops the undo history of a project whose content it replaced', async () => {
    const id = 'BBBBBBBBBB'
    const p = makeProject('Shared', undefined, makeTree('m', 'Shared'))
    await db.putProject({ id, project: { ...p, updatedAt: 'T1' }, updatedAt: 'T1' })
    await db.putHistory({ projectId: id, past: [], future: [] })
    expect(
      await useProjects.getState().adoptSynced(id, { ...p, name: 'New', updatedAt: 'T2' }, 'T1'),
    ).toBe('applied')
    expect(await db.getHistory(id)).toBeUndefined()
    expect((await db.getProject(id))!.project.name).toBe('New')
  })
})
