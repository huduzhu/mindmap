import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import type { TreeNode } from '../schema/types'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { BrainstormOutliner } from './BrainstormOutliner'
import { useToast } from './toastStore'
import { resetDatabase } from '../test/resetDb'
import { makeTree } from '../test/fixtures'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.setState({
    past: [],
    future: [],
    selection: null,
    editing: null,
    view: 'map',
    focusNotes: false,
  })
  await resetDatabase()
})

function seedBrainstorm(tree: TreeNode) {
  useProjects.getState().updateCurrent((project) => ({ ...project, brainstorm: tree }))
}

function sampleBrainstorm(): TreeNode {
  return makeTree('root', 'Topic', [makeTree('a', 'A'), makeTree('b', 'B')])
}

function nestedBrainstorm(): TreeNode {
  return makeTree('root', 'Topic', [
    makeTree('a', 'A', [makeTree('a1', 'Deep A')]),
    makeTree('b', 'B'),
  ])
}

function dragTransfer() {
  let value = ''
  return {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: (_type: string, data: string) => {
      value = data
    },
    getData: () => value,
  }
}

async function setupOutliner(tree = sampleBrainstorm()) {
  await useProjects.getState().createProject('Outliner test')
  seedBrainstorm(tree)
  useEditor.getState().setView('brainstorm')
  return render(<BrainstormOutliner />)
}

describe('BrainstormOutliner', () => {
  it('renders every node as an indented row', async () => {
    await setupOutliner()
    expect(screen.getByTestId('outliner-row-root')).toBeInTheDocument()
    expect(screen.getByTestId('outliner-row-a')).toBeInTheDocument()
    expect(screen.getByTestId('outliner-row-b')).toBeInTheDocument()
    expect(screen.getByText('Topic')).toBeInTheDocument()
  })

  it('shows the add-idea affordance and hint for a bare root', async () => {
    await setupOutliner({ id: 'root', title: 'Brainstorm', children: [] })
    expect(screen.getByRole('button', { name: /add idea/i })).toBeInTheDocument()
    expect(screen.getByText(/Click a row to rename it/i)).toBeInTheDocument()
  })

  it('click-to-edit renames a row', async () => {
    await setupOutliner()
    const row = screen.getByTestId('outliner-row-a')
    fireEvent.click(row)
    const input = within(row).getByDisplayValue('A')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children![0].title).toBe('Renamed')
  })

  it('renames a depth-2 child on click-away and through undo', async () => {
    await setupOutliner(nestedBrainstorm())
    const row = screen.getByTestId('outliner-row-a1')
    fireEvent.click(row)
    const input = within(row).getByDisplayValue('Deep A')
    fireEvent.change(input, { target: { value: 'Deep renamed' } })
    fireEvent.blur(input)

    expect(useProjects.getState().current!.brainstorm.children![0].children![0].title).toBe(
      'Deep renamed',
    )
    expect(useEditor.getState().past).toHaveLength(1)

    act(() => useEditor.getState().undo())
    expect(useProjects.getState().current!.brainstorm.children![0].children![0].title).toBe(
      'Deep A',
    )
  })

  it('F2 starts editing a selected depth-2 child', async () => {
    await setupOutliner(nestedBrainstorm())
    act(() => useEditor.getState().select('a1'))
    fireEvent.keyDown(screen.getByTestId('brainstorm-outliner'), { key: 'F2' })

    const input = await screen.findByDisplayValue('Deep A')
    fireEvent.change(input, { target: { value: 'F2 renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useProjects.getState().current!.brainstorm.children![0].children![0].title).toBe(
      'F2 renamed',
    )
  })

  it('Enter inside a row commits and creates the next bullet', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-a'))
    const input = screen.getByDisplayValue('A')
    fireEvent.change(input, { target: { value: 'First' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.title)).toEqual(['First', 'New idea', 'B'])
    expect(useEditor.getState().editing).toBe(brainstorm.children![1].id)
  })

  it('Enter on the wrapper adds a sibling after the selection', async () => {
    await setupOutliner()
    act(() => useEditor.getState().select('b'))
    fireEvent.keyDown(screen.getByTestId('brainstorm-outliner'), { key: 'Enter' })
    const brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.title)).toEqual(['A', 'B', 'New idea'])
  })

  it('Tab indents and Shift+Tab outdents the selection', async () => {
    await setupOutliner()
    act(() => useEditor.getState().select('b'))
    const outliner = screen.getByTestId('brainstorm-outliner')
    fireEvent.keyDown(outliner, { key: 'Tab' })
    let brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.id)).toEqual(['a'])
    expect(brainstorm.children![0].children!.map((c) => c.id)).toEqual(['b'])

    fireEvent.keyDown(outliner, { key: 'Tab', shiftKey: true })
    brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('Tab while renaming saves the text, indents the row and keeps renaming (#132)', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-b'))
    const input = screen.getByDisplayValue('B')
    fireEvent.change(input, { target: { value: 'Nested B' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    let brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.id)).toEqual(['a'])
    expect(brainstorm.children![0].children!.map((c) => c.title)).toEqual(['Nested B'])
    expect(useEditor.getState().editing).toBe('b')
    expect(document.activeElement).toBe(screen.getByDisplayValue('Nested B'))

    fireEvent.keyDown(screen.getByDisplayValue('Nested B'), { key: 'Tab', shiftKey: true })
    brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.id)).toEqual(['a', 'b'])
    expect(useEditor.getState().editing).toBe('b')

    // Enter afterwards adds no empty rename step: rename, indent, outdent, new bullet.
    fireEvent.keyDown(screen.getByDisplayValue('Nested B'), { key: 'Enter' })
    expect(useEditor.getState().past).toHaveLength(4)
  })

  it('Tab on a new blank bullet indents it and leaves it open (#132)', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-b'))
    fireEvent.keyDown(screen.getByDisplayValue('B'), { key: 'Enter' })
    const created = useEditor.getState().editing!
    const input = screen.getByDisplayValue('New idea')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    const brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.id)).toEqual(['a', 'b'])
    expect(brainstorm.children![1].children!.map((c) => c.id)).toEqual([created])
    expect(useEditor.getState().editing).toBe(created)
    expect((document.activeElement as HTMLInputElement).value).toBe('')
  })

  it('arrow keys move the selection between rows', async () => {
    await setupOutliner()
    act(() => useEditor.getState().select('a'))
    const outliner = screen.getByTestId('brainstorm-outliner')
    fireEvent.keyDown(outliner, { key: 'ArrowDown' })
    expect(useEditor.getState().selection).toBe('b')
    fireEvent.keyDown(outliner, { key: 'ArrowUp' })
    expect(useEditor.getState().selection).toBe('a')
    fireEvent.keyDown(outliner, { key: 'ArrowUp' })
    expect(useEditor.getState().selection).toBe('root')
  })

  it('is a tree whose active descendant follows the selection (#135)', async () => {
    await setupOutliner(nestedBrainstorm())
    const tree = screen.getByRole('tree', { name: 'Brainstorm ideas' })
    expect(tree).toBe(screen.getByTestId('brainstorm-outliner'))
    const items = within(tree).getAllByRole('treeitem')
    expect(items.map((item) => item.getAttribute('aria-level'))).toEqual(['1', '2', '3', '2'])
    // Switching to Brainstorm selects its root (#96).
    expect(tree).toHaveAttribute(
      'aria-activedescendant',
      screen.getByTestId('outliner-row-root').id,
    )

    act(() => useEditor.getState().select('a1'))
    const row = screen.getByTestId('outliner-row-a1')
    expect(tree).toHaveAttribute('aria-activedescendant', row.id)
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById(row.getAttribute('aria-labelledby')!)).toHaveTextContent(
      'Deep A',
    )
    expect(screen.getByTestId('outliner-row-a')).toHaveAttribute('aria-selected', 'false')

    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(tree).toHaveAttribute('aria-activedescendant', screen.getByTestId('outliner-row-b').id)
  })

  it('Delete removes the selected row but never the root', async () => {
    await setupOutliner()
    act(() => useEditor.getState().select('a'))
    const outliner = screen.getByTestId('brainstorm-outliner')
    fireEvent.keyDown(outliner, { key: 'Delete' })
    let brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.id)).toEqual(['b'])
    expect(useEditor.getState().selection).toBe('root')

    act(() => useEditor.getState().select('root'))
    fireEvent.keyDown(outliner, { key: 'Delete' })
    brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.id).toBe('root')
  })

  it('renders a ✎ trigger per row that selects without entering rename mode', async () => {
    await setupOutliner()
    expect(screen.getByTestId('brainstorm-note-trigger-root')).toBeInTheDocument()
    expect(screen.getByTestId('brainstorm-note-trigger-a')).toBeInTheDocument()
    expect(screen.getByTestId('brainstorm-note-trigger-b')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('brainstorm-note-trigger-a'))
    expect(useEditor.getState().selection).toBe('a')
    expect(useEditor.getState().editing).toBeNull()
  })

  it('hides the ✎ trigger while a row is being renamed', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-a'))
    expect(screen.queryByTestId('brainstorm-note-trigger-a')).not.toBeInTheDocument()
    expect(screen.getByTestId('brainstorm-note-trigger-b')).toBeInTheDocument()
  })

  it('drag-reorders siblings and undo restores their order', async () => {
    await setupOutliner()
    const transfer = dragTransfer()
    const a = screen.getByTestId('outliner-row-a')
    const b = screen.getByTestId('outliner-row-b')
    expect(a).toHaveAttribute('draggable', 'true')
    expect(b).toHaveAttribute('draggable', 'true')
    expect(screen.getByTestId('outliner-row-root')).toHaveAttribute('draggable', 'false')
    fireEvent.dragStart(b, { dataTransfer: transfer })
    fireEvent.dragOver(a, { dataTransfer: transfer, clientX: 200, clientY: 0 })
    fireEvent.drop(a, { dataTransfer: transfer, clientX: 200, clientY: 0 })
    expect(useProjects.getState().current!.brainstorm.children!.map((node) => node.id)).toEqual([
      'b',
      'a',
    ])

    act(() => useEditor.getState().undo())
    expect(useProjects.getState().current!.brainstorm.children!.map((node) => node.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('drops onto a row as the last child, outdents from the gutter, and promotes from the top zone', async () => {
    await setupOutliner(
      makeTree('root', 'Topic', [
        makeTree('a', 'A', [makeTree('a1', 'A1')]),
        makeTree('b', 'B', [makeTree('b1', 'B1')]),
      ]),
    )
    const transfer = dragTransfer()
    const a = screen.getByTestId('outliner-row-a')
    const b = screen.getByTestId('outliner-row-b')
    fireEvent.dragStart(a, { dataTransfer: transfer })
    fireEvent.drop(b, { dataTransfer: transfer, clientX: 200, clientY: 16 })
    expect(useProjects.getState().current!.brainstorm.children!.map((node) => node.id)).toEqual([
      'b',
    ])
    expect(
      useProjects.getState().current!.brainstorm.children![0].children!.map((node) => node.id),
    ).toEqual(['b1', 'a'])

    const a1 = screen.getByTestId('outliner-row-a1')
    fireEvent.dragStart(a1, { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId('outliner-row-b'), {
      dataTransfer: transfer,
      clientX: 1,
      clientY: 16,
    })
    expect(
      useProjects.getState().current!.brainstorm.children![0].children!.map((node) => node.id),
    ).toEqual(['b1', 'a', 'a1'])

    const promoted = screen.getByTestId('outliner-row-a1')
    fireEvent.dragStart(promoted, { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId('outliner-top-drop-zone'), { dataTransfer: transfer })
    expect(useProjects.getState().current!.brainstorm.children!.map((node) => node.id)).toEqual([
      'a1',
      'b',
    ])
  })

  it('rejects a cycle drop with a toast and leaves the tree unchanged', async () => {
    await setupOutliner(makeTree('root', 'Topic', [makeTree('a', 'A', [makeTree('a1', 'A1')])]))
    const transfer = dragTransfer()
    fireEvent.dragStart(screen.getByTestId('outliner-row-a'), { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId('outliner-row-a1'), {
      dataTransfer: transfer,
      clientX: 200,
      clientY: 16,
    })
    expect(useProjects.getState().current!.brainstorm.children!.map((node) => node.id)).toEqual([
      'a',
    ])
    expect(
      useProjects.getState().current!.brainstorm.children![0].children!.map((node) => node.id),
    ).toEqual(['a1'])
    expect(useToast.getState().message).toMatch(/own descendant/i)
  })
})

describe('section switching', () => {
  it('both sections live behind the tabs and share one project', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /start a new project/i }))
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: 'Brainstorm' }))
    await waitFor(() => expect(screen.getByTestId('brainstorm-outliner')).toBeInTheDocument())
    expect(screen.queryByTestId('map-canvas')).not.toBeInTheDocument()

    const outlineTab = screen.getByRole('tab', { name: 'Outline' })
    expect(outlineTab).not.toBeDisabled()
    fireEvent.click(outlineTab)
    await waitFor(() => expect(screen.getByTestId('outline-view')).toBeInTheDocument())
    expect(screen.queryByTestId('brainstorm-outliner')).not.toBeInTheDocument()
    const outlineRows = screen
      .getByTestId('outline-view')
      .querySelectorAll('[data-testid^="outline-row-"]')
    expect(outlineRows.length).toBeGreaterThan(0)
    for (const row of outlineRows) {
      expect(row).not.toHaveAttribute('draggable', 'true')
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Mind Map' }))
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument())
  })
})

describe('BrainstormOutliner — focus ownership (#5, Batch 16)', () => {
  it('Enter-commit carries focus into the next bullet instead of dropping to <body>', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-a'))
    const input = screen.getByDisplayValue('A')
    expect(input).toHaveFocus()

    fireEvent.change(input, { target: { value: 'First' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const nextInput = await screen.findByDisplayValue('New idea')
    expect(nextInput).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('Escape during rename returns focus to the outliner wrapper (tripwire a)', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-a'))
    const input = screen.getByDisplayValue('A')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(useEditor.getState().editing).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('brainstorm-outliner'))
  })

  it('blur-committing a rename returns focus to the outliner wrapper', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-a'))
    const input = screen.getByDisplayValue('A')

    fireEvent.change(input, { target: { value: 'Blurred' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(useProjects.getState().current!.brainstorm.children![0].title).toBe('Blurred')
    })
    expect(document.activeElement).toBe(screen.getByTestId('brainstorm-outliner'))
  })

  it('clicking blank space (the hint) refocuses the wrapper', async () => {
    await setupOutliner()
    const hint = screen.getByText(/Click a row to rename it/i)
    fireEvent.click(hint)
    expect(document.activeElement).toBe(screen.getByTestId('brainstorm-outliner'))
  })

  it('shortcuts fire from <body> — the strict target guard is gone', async () => {
    await setupOutliner()
    act(() => useEditor.getState().select('b'))
    ;(document.activeElement as HTMLElement | null)?.blur?.()

    fireEvent.keyDown(document.body, { key: 'Enter' })

    const brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.children!.map((c) => c.title)).toEqual(['A', 'B', 'New idea'])
  })
})

describe('BrainstormOutliner — Escape discards an unnamed new bullet (follow-up)', () => {
  const titles = () =>
    (useProjects.getState().current!.brainstorm.children ?? []).map((node) => node.title)

  it('Enter then Escape leaves no "New idea" behind, and no extra undo step', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-a'))
    const input = screen.getByDisplayValue('A')
    fireEvent.change(input, { target: { value: 'A2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const draft = await screen.findByDisplayValue('New idea')
    expect(titles()).toEqual(['A2', 'New idea', 'B'])
    const undoSteps = useEditor.getState().past.length

    fireEvent.keyDown(draft, { key: 'Escape' })
    expect(titles()).toEqual(['A2', 'B'])
    expect(useEditor.getState().editing).toBeNull()
    expect(useEditor.getState().selection).toBe('a')
    expect(useEditor.getState().past.length).toBe(undoSteps - 1)
    expect(useEditor.getState().future).toHaveLength(0)
    // The rename of A is still one undo away.
    act(() => useEditor.getState().undo())
    expect(titles()).toEqual(['A', 'B'])
  })

  it('"+ Add idea" then Escape removes the new bullet too', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('brainstorm-add'))
    const draft = await screen.findByDisplayValue('New idea')
    fireEvent.keyDown(draft, { key: 'Escape' })
    expect(titles()).toEqual(['A', 'B'])
  })

  it('Escape on an existing bullet still only cancels the rename', async () => {
    await setupOutliner()
    fireEvent.click(screen.getByTestId('outliner-row-b'))
    fireEvent.keyDown(screen.getByDisplayValue('B'), { key: 'Escape' })
    expect(titles()).toEqual(['A', 'B'])
  })
})

describe('BrainstormOutliner folding (#145)', () => {
  it('Space folds the selected idea in the Brainstorm tree only, and the triangle unfolds it', async () => {
    await setupOutliner(nestedBrainstorm())
    const map = useProjects.getState().current!.map
    act(() => useEditor.getState().select('a'))
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(useProjects.getState().current!.brainstorm.children![0].collapsed).toBe(true)
    expect(useProjects.getState().current!.map).toBe(map)
    expect(screen.queryByTestId('outliner-row-a1')).toBeNull()
    expect(screen.getByTestId('outliner-row-a')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('row-hidden-a')).toHaveTextContent('+1')
    // A fold is a view change, not an undo step (decision B2).
    expect(useEditor.getState().past).toHaveLength(0)
    fireEvent.click(screen.getByTestId('row-fold-a'))
    expect(screen.getByTestId('outliner-row-a1')).toBeInTheDocument()
    expect(useEditor.getState().editing).toBeNull()
  })
})
