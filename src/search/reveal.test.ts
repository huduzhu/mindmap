import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { revealNode } from './reveal'
// The filter maths registers itself with the map when loaded, as the filter bar does.
import '../map/tagFilter'

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

  it('leaves a focused branch that does not contain the node', async () => {
    await useProjects.getState().createProject('Reveal focus')
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: makeTree('r', 'Root', [makeTree('a', 'A', [makeTree('a1', 'A1')]), makeTree('b', 'B')]),
    }))
    useEditor.getState().setFocus('map', 'a')
    revealNode('b')
    expect(useEditor.getState().focus.map).toBeNull()
    expect(useEditor.getState().selection).toBe('b')
  })

  describe('tag filter in hide mode', () => {
    const setup = async () => {
      await useProjects.getState().createProject('Reveal tags')
      useProjects.getState().updateCurrent((project) => ({
        ...project,
        map: makeTree('r', 'Root', [
          makeTree('a', 'A', [makeTree('a1', 'Tagged', [], { tags: ['web'] })], {
            collapsed: true,
          }),
          makeTree('b', 'Untagged'),
        ]),
      }))
    }

    it('switches to highlight when the node would be hidden, keeping the tags', async () => {
      await setup()
      useEditor.getState().setTagFilter('map', { tags: ['web'], all: false, hide: true })
      revealNode('b')
      expect(useEditor.getState().tagFilter.map).toEqual({ tags: ['web'], all: false, hide: false })
      expect(useEditor.getState().selection).toBe('b')
    })

    it('keeps hide mode when the node is shown anyway, and unfolds it', async () => {
      await setup()
      useEditor.getState().setTagFilter('map', { tags: ['web'], all: false, hide: true })
      revealNode('a1')
      expect(useEditor.getState().tagFilter.map?.hide).toBe(true)
      expect(useProjects.getState().current!.map.children![0].collapsed).toBeFalsy()
      expect(useEditor.getState().selection).toBe('a1')
    })

    it('only touches the filter of the view the node is revealed in', async () => {
      await setup()
      useEditor.getState().setTagFilter('outline', { tags: ['web'], all: false, hide: true })
      revealNode('b')
      expect(useEditor.getState().tagFilter.outline?.hide).toBe(true)
      useEditor.getState().setView('outline')
      revealNode('b')
      expect(useEditor.getState().tagFilter.outline?.hide).toBe(false)
    })
  })
})
