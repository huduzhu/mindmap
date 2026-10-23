import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../io/db'
import { flushHistory, useEditor } from './editor'
import { useProjects } from './projects'
import { addChild, makeNode, moveNode, renameNode, toggleCollapse } from './treeOps'
import { resetDatabase } from '../test/resetDb'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
})

async function setupProject() {
  const id = await useProjects.getState().createProject('Editor test')
  useEditor.getState().select(useProjects.getState().current!.map.id)
  return id
}

describe('editor store', () => {
  it('applyTree mutates the current project map', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'Renamed'))
    expect(useProjects.getState().current!.map.title).toBe('Renamed')
    expect(useEditor.getState().past).toHaveLength(1)
  })

  it('undo restores the previous tree and redo reapplies', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'V2'))
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'V3'))

    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.title).toBe('V2')
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.title).toBe('Editor test')
    expect(useEditor.getState().past).toHaveLength(0)

    useEditor.getState().redo()
    expect(useProjects.getState().current!.map.title).toBe('V2')
    useEditor.getState().redo()
    expect(useProjects.getState().current!.map.title).toBe('V3')
  })

  it('undo restores a move applied through the editor history', async () => {
    await setupProject()
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: { ...project.map, children: [makeNode('A', { id: 'a' }), makeNode('B', { id: 'b' })] },
    }))

    useEditor.getState().applyTree('map', (tree) => moveNode(tree, 'a', tree.id, 1))
    expect(useProjects.getState().current!.map.children!.map((child) => child.id)).toEqual([
      'b',
      'a',
    ])
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.children!.map((child) => child.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('a new edit clears the redo stack', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'A'))
    useEditor.getState().undo()
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'B'))
    expect(useEditor.getState().future).toHaveLength(0)
  })

  it('undo is section-aware: brainstorm edits restore the brainstorm tree', async () => {
    await setupProject()
    const brainstormId = useProjects.getState().current!.brainstorm.id
    const mapTitle = useProjects.getState().current!.map.title
    useEditor.getState().applyTree('brainstorm', (tree) => addChild(tree, brainstormId))
    expect(useProjects.getState().current!.brainstorm.children).toHaveLength(1)

    useEditor.getState().undo()
    expect(useProjects.getState().current!.brainstorm.children).toHaveLength(0)
    expect(useProjects.getState().current!.map.title).toBe(mapTitle)
  })

  it('commitRename trims and ignores empty drafts', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().setEditing(rootId)
    useEditor.getState().commitRename(rootId, '   ')
    expect(useProjects.getState().current!.map.title).toBe('Editor test')
    expect(useEditor.getState().past).toHaveLength(0)

    useEditor.getState().setEditing(rootId)
    useEditor.getState().commitRename(rootId, '  Nice title  ')
    expect(useProjects.getState().current!.map.title).toBe('Nice title')
    expect(useEditor.getState().editing).toBeNull()
  })

  it('commitRename from the outline view lands on the map tree', async () => {
    await setupProject()
    useEditor.getState().setView('outline')
    const rootId = useProjects.getState().current!.map.id

    useEditor.getState().setEditing(rootId)
    useEditor.getState().commitRename(rootId, 'Outline rename')

    expect(useProjects.getState().current!.map.title).toBe('Outline rename')
    expect(useProjects.getState().current!.brainstorm.title).toBe('Brainstorm')
    expect(useEditor.getState().past).toHaveLength(1)
  })

  it('commitRename turns trailing #tags into node tags in one undo step (#150)', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().setEditing(rootId)
    useEditor.getState().commitRename(rootId, 'Fix login #P1 #backend')
    expect(useProjects.getState().current!.map).toMatchObject({
      title: 'Fix login',
      tags: ['p1', 'backend'],
    })
    expect(useEditor.getState().past).toHaveLength(1)
    useEditor.getState().commitRename(rootId, '#only')
    expect(useProjects.getState().current!.map.title).toBe('#only')
    useEditor.getState().undo()
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map).not.toHaveProperty('tags')
  })

  it('keeps a tag filter per view for the session only (#150)', async () => {
    await setupProject()
    const filter = { tags: ['p1'], all: false, hide: true }
    useEditor.getState().setTagFilter('outline', filter)
    expect(useEditor.getState().tagFilter).toEqual({ map: null, outline: filter, brainstorm: null })
    useEditor.getState().resetTransient()
    expect(useEditor.getState().tagFilter.outline).toBeNull()
  })

  it('no-op mutators do not push history', async () => {
    await setupProject()
    useEditor.getState().applyTree('map', (tree) => tree)
    expect(useEditor.getState().past).toHaveLength(0)
  })

  it('adds and removes links through undoable editor history', async () => {
    await setupProject()
    const root = useProjects.getState().current!.map.id
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: { ...project.map, children: [makeNode('a', { id: 'a' }), makeNode('b', { id: 'b' })] },
    }))
    useEditor.getState().applyLinks(() => [{ from: 'a', to: 'b' }])
    expect(useProjects.getState().current!.links).toEqual([{ from: 'a', to: 'b' }])
    useEditor.getState().undo()
    expect(useProjects.getState().current!.links).toBeUndefined()
    useEditor.getState().redo()
    expect(useProjects.getState().current!.links).toEqual([{ from: 'a', to: 'b' }])
    useEditor.getState().applyLinks((links) => links.filter((link) => link.from !== 'a'))
    expect(useProjects.getState().current!.links).toBeUndefined()
    useEditor.getState().undo()
    expect(useProjects.getState().current!.links).toEqual([{ from: 'a', to: 'b' }])
    expect(root).toBe(useProjects.getState().current!.map.id)
  })

  it('setView switches section, ends editing and selects the section root (#96)', async () => {
    await setupProject()
    const project = useProjects.getState().current!
    useEditor.getState().select(project.map.id)
    useEditor.getState().setEditing(project.map.id)
    useEditor.getState().setView('brainstorm')
    expect(useEditor.getState().view).toBe('brainstorm')
    expect(useEditor.getState().selection).toBe(project.brainstorm.id)
    expect(useEditor.getState().selectionSet).toEqual(new Set([project.brainstorm.id]))
    expect(useEditor.getState().editing).toBeNull()
  })

  it('setView restores the node last selected in each section (#96)', async () => {
    await setupProject()
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: { ...project.map, children: [makeNode('Map child', { id: 'm1' })] },
      brainstorm: { ...project.brainstorm, children: [makeNode('Idea', { id: 'b1' })] },
    }))
    useEditor.getState().setView('map')
    useEditor.getState().select('m1')
    useEditor.getState().setView('brainstorm')
    useEditor.getState().select('b1')
    useEditor.getState().setView('outline')
    expect(useEditor.getState().selection).toBe('m1')
    useEditor.getState().setView('brainstorm')
    expect(useEditor.getState().selection).toBe('b1')
    useEditor.getState().setView('split')
    expect(useEditor.getState().activeSection).toBe('brainstorm')
    expect(useEditor.getState().selection).toBe('b1')
  })

  it('setView falls back to the root when the remembered node is gone (#96)', async () => {
    await setupProject()
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: { ...project.map, children: [makeNode('Map child', { id: 'm1' })] },
    }))
    useEditor.getState().setView('map')
    useEditor.getState().select('m1')
    useEditor.getState().setView('brainstorm')
    useProjects.getState().updateCurrent((project) => ({
      ...project,
      map: { ...project.map, children: [] },
    }))
    useEditor.getState().setView('map')
    expect(useEditor.getState().selection).toBe(useProjects.getState().current!.map.id)
  })

  it('forgets remembered selections when the project changes (#96)', async () => {
    await setupProject()
    useEditor.getState().select('somewhere')
    useEditor.getState().resetTransient()
    expect(useEditor.getState().lastSelection).toEqual({ map: null, brainstorm: null })
  })

  it('keeps a primary selection while additive selection toggles secondary nodes', async () => {
    await setupProject()
    useEditor.getState().select('first')
    useEditor.getState().select('second', true)
    expect(useEditor.getState().selection).toBe('first')
    expect(useEditor.getState().selectionSet).toEqual(new Set(['first', 'second']))

    useEditor.getState().toggleSelection('second')
    expect(useEditor.getState().selection).toBe('first')
    expect(useEditor.getState().selectionSet).toEqual(new Set(['first']))
  })

  it('persists history across a simulated reload', async () => {
    const id = await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'After reload'))
    await useProjects.getState().saveCurrent()

    useProjects.setState({ currentId: null, current: null })
    useEditor.getState().reset()
    await useProjects.getState().loadProject(id)

    expect(useEditor.getState().past).toHaveLength(1)
    useEditor.getState().undo()
    expect(useProjects.getState().current?.map.title).toBe('Editor test')
  })

  it('restores named snapshots and makes the restore a single undo step', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    const brainstormId = useProjects.getState().current!.brainstorm.id
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'Snapshot version'))
    const brainstormTitle = useProjects.getState().current!.brainstorm.title
    expect(await useProjects.getState().createSnapshot('safe point')).not.toBeNull()

    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'Experiment'))
    useEditor
      .getState()
      .applyTree('brainstorm', (tree) => renameNode(tree, brainstormId, 'Experiment notes'))
    expect(await useProjects.getState().restoreSnapshot('safe point')).toBe(true)
    expect(useProjects.getState().current?.map.title).toBe('Snapshot version')
    expect(useProjects.getState().current?.brainstorm.title).toBe(brainstormTitle)

    useEditor.getState().undo()
    expect(useProjects.getState().current?.map.title).toBe('Experiment')
    expect(useProjects.getState().current?.brainstorm.title).toBe('Experiment notes')
  })

  it('rejects blank snapshot names and isolates history when switching projects', async () => {
    const firstId = await setupProject()
    const firstRoot = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, firstRoot, 'First edit'))
    expect(await useProjects.getState().createSnapshot('   ')).toBeNull()

    const secondId = await useProjects.getState().createProject('Second project')
    const secondRoot = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, secondRoot, 'Second edit'))
    await useProjects.getState().loadProject(firstId)
    expect(useEditor.getState().past).toHaveLength(1)
    expect((await useProjects.getState().listSnapshots()).map((snapshot) => snapshot.name)).toEqual(
      [],
    )
    await useProjects.getState().loadProject(secondId)
    expect(useEditor.getState().past).toHaveLength(1)
  })
})

describe('replaceTrees', () => {
  it('applies links that differ only in their labels (a restored snapshot)', async () => {
    await setupProject()
    useEditor.getState().applyTree('map', (tree) => addChild(addChild(tree, tree.id), tree.id))
    const project = useProjects.getState().current!
    const [a, b] = project.map.children!.map((child) => child.id)
    useProjects
      .getState()
      .updateCurrent((p) => ({ ...p, links: [{ from: a, to: b, label: 'old' }] }))

    const restored = useEditor
      .getState()
      .replaceTrees(project.map, project.brainstorm, [{ from: a, to: b, label: 'new' }])
    expect(restored).toBe(true)
    expect(useProjects.getState().current!.links).toEqual([{ from: a, to: b, label: 'new' }])
  })
})

describe('editor store — ensureVisible', () => {
  // The canvas creates a node from a shortcut, selects it, opens its rename input,
  // and then needs it panned into view. It cannot use `reveal` for that: `reveal`
  // clears `editing`, which would cancel the rename the user just started, and its
  // transient selection-before-layout state trips MindMapCanvas's stale-selection
  // guard. Hence a narrower action.
  it('bumps the reveal nonce without disturbing selection or editing', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    const child = makeNode('New idea')
    useEditor.getState().applyTree('map', (tree) => addChild(tree, rootId, child))
    useEditor.getState().select(child.id)
    useEditor.getState().setEditing(child.id)

    const nonce = useEditor.getState().revealNonce
    useEditor.getState().ensureVisible(child.id)

    const state = useEditor.getState()
    expect(state.revealId).toBe(child.id)
    expect(state.revealNonce).toBe(nonce + 1)
    expect(state.editing).toBe(child.id)
    expect(state.selection).toBe(child.id)
  })

  it('leaves the tree untouched', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    const before = useProjects.getState().current!.map

    useEditor.getState().ensureVisible(rootId)

    expect(useProjects.getState().current!.map).toBe(before)
    expect(useEditor.getState().past).toHaveLength(0)
  })

  it('reveal still clears editing — the difference that motivated the split', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().setEditing(rootId)

    useEditor.getState().reveal(rootId)

    expect(useEditor.getState().editing).toBeNull()
    expect(useEditor.getState().selection).toBe(rootId)
  })
})

describe('history write failure (#42)', () => {
  it('one failed putHistory does not poison later store calls', async () => {
    const id = await setupProject()
    const rootId = useProjects.getState().current!.map.id
    const spy = vi
      .spyOn(db, 'putHistory')
      .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'Fails'))
    await flushHistory()
    expect(useEditor.getState().historyError).toBe('storage quota exceeded')

    useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, 'Works'))
    await useProjects.getState().saveCurrent()
    expect(useEditor.getState().historyError).toBeNull()
    await expect(useProjects.getState().loadProject(id)).resolves.toBeUndefined()
    await expect(useProjects.getState().createProject('After failure')).resolves.toEqual(
      expect.any(String),
    )
    spy.mockRestore()
    await useProjects.getState().recoverStorage()
  })
})

describe('history size (#47)', () => {
  it('evicts the oldest entries once the stack exceeds the character budget', async () => {
    const { HISTORY_CHAR_BUDGET, historyStackSize } = await import('./editor')
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    const big = 'x'.repeat(Math.ceil(HISTORY_CHAR_BUDGET / 3))
    for (let i = 0; i < 6; i += 1) {
      useEditor
        .getState()
        .applyTree('map', (tree) => ({ ...renameNode(tree, rootId, `v${i}`), notes: `${i}${big}` }))
    }
    const past = useEditor.getState().past
    expect(past.length).toBeLessThan(6)
    expect(past.length).toBeGreaterThanOrEqual(1)
    expect(historyStackSize(past)).toBeLessThanOrEqual(HISTORY_CHAR_BUDGET)
    // The newest entry is the tree just before the last edit.
    expect(past[past.length - 1].tree!.title).toBe('v4')
  })

  it('counts subtrees shared between steps once, so a big map keeps 100 small edits (#142)', async () => {
    const { HISTORY_CHAR_BUDGET, historyStackSize } = await import('./editor')
    await setupProject()
    const notes = 'n'.repeat(300)
    let count = 0
    const leaf = () => ({ ...makeNode(`Idea ${count++}`), notes })
    const map = {
      ...makeNode('Big map'),
      children: Array.from({ length: 10 }, () => ({
        ...makeNode(`Branch ${count++}`),
        children: Array.from({ length: 12 }, () => ({
          ...makeNode(`Topic ${count++}`),
          children: Array.from({ length: 12 }, leaf),
        })),
      })),
    }
    useProjects.getState().updateCurrent((p) => ({ ...p, map }))
    // ~1,571 nodes with notes: one full copy is far more than 1/100 of the budget.
    expect(JSON.stringify(map).length * 100).toBeGreaterThan(HISTORY_CHAR_BUDGET)
    for (let i = 0; i < 120; i += 1) {
      const target = map.children[i % 10].children[i % 12].children[(i * 5) % 12]
      useEditor.getState().applyTree('map', (tree) => renameNode(tree, target.id, `Edit ${i}`))
    }
    const past = useEditor.getState().past
    expect(past).toHaveLength(100)
    expect(historyStackSize(past)).toBeLessThanOrEqual(HISTORY_CHAR_BUDGET)
    // Undo still walks back through them.
    useEditor.getState().undo()
    expect(useEditor.getState().past).toHaveLength(99)
  })

  it('coalesces a burst of edits into few history writes, persisting the latest', async () => {
    const id = await setupProject()
    await useProjects.getState().saveCurrent()
    const rootId = useProjects.getState().current!.map.id
    const spy = vi.spyOn(db, 'putHistory')
    for (let i = 0; i < 10; i += 1) {
      useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, `burst ${i}`))
    }
    await flushHistory()
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2)
    expect((await db.getHistory(id))?.past).toHaveLength(10)
    spy.mockRestore()
  })
})

describe('UNDO_LIMIT (#66)', () => {
  it('keeps only the newest 100 undo entries', async () => {
    await setupProject()
    const rootId = useProjects.getState().current!.map.id
    for (let i = 0; i < 105; i += 1) {
      useEditor.getState().applyTree('map', (tree) => renameNode(tree, rootId, `t${i}`))
    }
    const past = useEditor.getState().past
    expect(past).toHaveLength(100)
    expect(past[0].tree!.title).toBe('t4')
    expect(past[99].tree!.title).toBe('t103')
  })
})

describe('applyView (B2)', () => {
  it('saves a collapse with the project but adds no undo entry', async () => {
    const id = await setupProject()
    const rootId = useProjects.getState().current!.map.id
    useEditor.getState().applyTree('map', (tree) => addChild(tree, rootId))
    const childId = useProjects.getState().current!.map.children![0].id
    useEditor.getState().applyTree('map', (tree) => addChild(tree, childId))
    const pastBefore = useEditor.getState().past.length

    useEditor.getState().applyView('map', (tree) => toggleCollapse(tree, childId))
    expect(useProjects.getState().current!.map.children![0].collapsed).toBe(true)
    expect(useEditor.getState().past).toHaveLength(pastBefore)
    expect(useEditor.getState().future).toHaveLength(0)

    await useProjects.getState().saveCurrent()
    expect((await db.getProject(id))?.project.map.children![0].collapsed).toBe(true)
  })

  it('is a no-op when the mutator returns the same tree', async () => {
    await setupProject()
    const before = useProjects.getState().current
    useEditor.getState().applyView('map', (tree) => tree)
    expect(useProjects.getState().current).toBe(before)
  })
})

describe('draft nodes (follow-up: Escape discards an unnamed new node)', () => {
  it('startDraft inserts, selects and names; discardDraft takes it back without a redo', async () => {
    await useProjects.getState().createProject('Drafts')
    const root = useProjects.getState().current!.map.id
    const node = makeNode('New idea')
    useEditor.getState().startDraft('map', node, (tree) => addChild(tree, root, node), root)
    expect(useEditor.getState().editing).toBe(node.id)
    expect(useEditor.getState().draft?.id).toBe(node.id)
    expect(useProjects.getState().current!.map.children).toHaveLength(1)

    expect(useEditor.getState().discardDraft(node.id)).toBe(true)
    expect(useProjects.getState().current!.map.children ?? []).toHaveLength(0)
    expect(useEditor.getState().selection).toBe(root)
    expect(useEditor.getState().past).toHaveLength(0)
    expect(useEditor.getState().future).toHaveLength(0)
  })

  it('a committed name ends the draft, so Escape later cannot discard the node', async () => {
    await useProjects.getState().createProject('Named')
    useEditor.getState().setView('map')
    const root = useProjects.getState().current!.map.id
    const node = makeNode('New idea')
    useEditor.getState().startDraft('map', node, (tree) => addChild(tree, root, node), root)
    useEditor.getState().commitRename(node.id, 'Kept')
    expect(useEditor.getState().draft).toBeNull()
    expect(useEditor.getState().discardDraft(node.id)).toBe(false)
    expect(useProjects.getState().current!.map.children?.[0].title).toBe('Kept')
  })
})

describe('a node at the children limit (#186)', () => {
  it('leaves the tree alone and says why', async () => {
    await setupProject()
    const { MAX_CHILDREN } = await import('./treeOps')
    const { useToast } = await import('../components/toastStore')
    const rootId = useProjects.getState().current!.map.id
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: {
        ...p.map,
        children: Array.from({ length: MAX_CHILDREN }, (_, i) => ({ id: `c${i}`, title: `C${i}` })),
      },
    }))
    useToast.getState().clear()
    const before = useProjects.getState().current!.map
    useEditor.getState().applyTree('map', (tree) => addChild(tree, rootId, makeNode('One more')))
    expect(useProjects.getState().current!.map).toBe(before)
    expect(useToast.getState().message).toMatch(/at most 1,000 children/)
    // An ordinary no-op says nothing.
    useToast.getState().clear()
    useEditor.getState().applyTree('map', (tree) => tree)
    expect(useToast.getState().message).toBeNull()
  })
})
