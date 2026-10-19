import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { flushAnnouncement, resetAnnouncer, useAnnouncer } from '../a11y/announcer'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { foldBranch, foldView } from './foldActions'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.setState({ past: [], future: [], selection: null, editing: null, view: 'map' })
  resetAnnouncer()
  await resetDatabase()
  await useProjects.getState().createProject('Fold')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('r', 'Root', [
      makeTree('a', 'A', [makeTree('a1', 'A1', [makeTree('a1x', 'A1x')]), makeTree('a2', 'A2')]),
      makeTree('b', 'B'),
    ]),
    brainstorm: makeTree('br', 'Ideas', [makeTree('i', 'I', [makeTree('i1', 'I1')])]),
  }))
})

const spoken = () => {
  flushAnnouncement()
  return useAnnouncer.getState().message
}

describe('foldView (#145)', () => {
  it('shows levels as one undo step and says how much is showing', () => {
    foldView({ kind: 'levels', levels: 2 })
    expect(spoken()).toBe('Showing 2 levels, 5 of 6 topics')
    expect(useEditor.getState().past).toHaveLength(1)
    foldView({ kind: 'collapse' })
    expect(spoken()).toBe('Showing 1 level, 3 of 6 topics')
    foldView({ kind: 'expand' })
    expect(spoken()).toBe('Showing all 6 topics')
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.children![0].collapsed).toBe(true)
  })

  it('folds the Brainstorm tree on its own (decision GB-D1)', () => {
    useEditor.getState().setView('brainstorm')
    const map = useProjects.getState().current!.map
    foldView({ kind: 'collapse' })
    expect(useProjects.getState().current!.brainstorm.children![0].collapsed).toBe(true)
    expect(useProjects.getState().current!.map).toBe(map)
  })

  it('moves a hidden selection to the folded branch', () => {
    useEditor.getState().select('a1x')
    foldBranch('map', 'a', false)
    expect(useEditor.getState().selection).toBe('a')
    foldBranch('map', 'a', true)
    expect(useProjects.getState().current!.map.children![0].children![0].collapsed).toBeFalsy()
  })
})
