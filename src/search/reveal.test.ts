import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { revealNode } from './reveal'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.setState({
    past: [],
    future: [],
    selection: null,
    editing: null,
    view: 'map',
    activeSection: 'map',
  })
  await resetDatabase()
})

describe('revealNode (#66)', () => {
  it('expands collapsed ancestors in the active section and selects the node', async () => {
    await useProjects.getState().createProject('Reveal')
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: makeTree('r', 'Root', [
        makeTree('a', 'A', [makeTree('a1', 'Deep')], { collapsed: true }),
      ]),
    }))
    const nonce = useEditor.getState().revealNonce
    revealNode('a1')
    expect(useProjects.getState().current!.map.children![0].collapsed).toBeFalsy()
    expect(useEditor.getState().selection).toBe('a1')
    expect(useEditor.getState().revealId).toBe('a1')
    expect(useEditor.getState().revealNonce).toBe(nonce + 1)
  })

  it('works in the brainstorm section without touching the map', async () => {
    await useProjects.getState().createProject('Reveal brainstorm')
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      brainstorm: makeTree('b', 'Ideas', [
        makeTree('x', 'X', [makeTree('x1', 'X1')], { collapsed: true }),
      ]),
    }))
    useEditor.getState().setView('brainstorm')
    const mapBefore = useProjects.getState().current!.map
    revealNode('x1')
    expect(useProjects.getState().current!.brainstorm.children![0].collapsed).toBeFalsy()
    expect(useProjects.getState().current!.map).toBe(mapBefore)
  })
})
