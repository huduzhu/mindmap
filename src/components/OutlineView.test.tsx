import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { OutlineView } from './OutlineView'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.setState({ past: [], future: [], selection: null, editing: null, view: 'outline' })
  await resetDatabase()
})

async function setupProject() {
  await useProjects.getState().createProject('Outline test')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('root', 'Central', [makeTree('a', 'Idea A'), makeTree('b', 'Idea B')]),
  }))
  return render(<OutlineView />)
}

describe('OutlineView', () => {
  it('renders the map tree as indented rows', async () => {
    await setupProject()
    expect(screen.getByTestId('outline-row-root')).toBeInTheDocument()
    expect(screen.getByTestId('outline-row-a')).toBeInTheDocument()
    expect(screen.getByTestId('outline-row-b')).toBeInTheDocument()
  })

  it('keeps read-only outline rows non-draggable with no drag behavior', async () => {
    await setupProject()
    const rows = [
      screen.getByTestId('outline-row-root'),
      screen.getByTestId('outline-row-a'),
      screen.getByTestId('outline-row-b'),
    ]
    const before = useProjects.getState().current!.map

    for (const row of rows) {
      expect(row).not.toHaveAttribute('draggable', 'true')
      fireEvent.dragStart(row)
      fireEvent.dragOver(row)
      fireEvent.drop(row)
    }

    expect(useProjects.getState().current!.map).toEqual(before)
  })

  it('click-to-edit puts the row in editing mode and Enter commits the rename', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-a'))
    const input = screen.getByDisplayValue('Idea A')
    fireEvent.change(input, { target: { value: 'Renamed idea' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const map = useProjects.getState().current!.map
    expect(map.children![0].title).toBe('Renamed idea')
    expect(useEditor.getState().editing).toBeNull()
  })

  it('Escape in the input clears editing without committing the draft', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-b'))
    const input = screen.getByDisplayValue('Idea B')
    fireEvent.change(input, { target: { value: 'Throwing away' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(useEditor.getState().editing).toBeNull()
    expect(useProjects.getState().current!.map.children![1].title).toBe('Idea B')
  })

  it('clicking another row transfers editing to it', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-a'))
    expect(useEditor.getState().editing).toBe('a')
    fireEvent.click(screen.getByTestId('outline-row-b'))
    expect(useEditor.getState().editing).toBe('b')
  })

  it('empty drafts on commit are ignored but still clear editing', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-a'))
    const input = screen.getByDisplayValue('Idea A')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useProjects.getState().current!.map.children![0].title).toBe('Idea A')
    expect(useEditor.getState().editing).toBeNull()
  })

  it('renders a ✎ trigger per row that selects the node without entering edit mode', async () => {
    await setupProject()
    expect(screen.getByTestId('outline-note-trigger-root')).toBeInTheDocument()
    expect(screen.getByTestId('outline-note-trigger-a')).toBeInTheDocument()
    expect(screen.getByTestId('outline-note-trigger-b')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('outline-note-trigger-a'))
    expect(useEditor.getState().selection).toBe('a')
    expect(useEditor.getState().editing).toBeNull()
  })

  it('hides the ✎ trigger while a row is being edited', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-a'))
    expect(screen.queryByTestId('outline-note-trigger-a')).not.toBeInTheDocument()
    expect(screen.getByTestId('outline-note-trigger-b')).toBeInTheDocument()
  })

  it('shows the filled ✎ glyph on rows that already carry notes', async () => {
    await setupProject()
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('root', 'Central', [makeTree('a', 'Idea A', [], { notes: 'remember this' })]),
    }))
    await waitFor(() => expect(screen.getByTestId('outline-note-trigger-a').textContent).toBe('✎'))
  })

  it('adds a child from the Add idea button and selects it', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-add'))

    const map = useProjects.getState().current!.map
    expect(map.children).toHaveLength(3)
    const created = map.children![2]
    expect(created.title).toBe('New idea')
    expect(useEditor.getState().selection).toBe(created.id)
  })

  it('adds a sibling with Enter and indents or outdents with Tab', async () => {
    await setupProject()
    act(() => useEditor.getState().select('a'))
    fireEvent.keyDown(document, { key: 'Enter' })

    const afterSibling = useProjects.getState().current!.map
    const created = afterSibling.children![1]
    expect(created.title).toBe('New idea')
    expect(useEditor.getState().selection).toBe(created.id)

    act(() => {
      useEditor.getState().setEditing(null)
      useEditor.getState().select('b')
    })
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(
      useProjects.getState().current!.map.children![1].children?.map((node) => node.id),
    ).toContain('b')

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(useProjects.getState().current!.map.children?.map((node) => node.id)).toContain('b')
  })

  // The outline keydown switch shipped with Enter and Tab but no Delete, so the
  // key did nothing here while it worked on the canvas and in the brainstorm
  // outliner. Users reported it as "delete stopped working".
  it('Tab while renaming saves the text and indents the row, still renaming (#132)', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-b'))
    const input = screen.getByDisplayValue('Idea B')
    fireEvent.change(input, { target: { value: 'Under A' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.id)).toEqual(['a'])
    expect(map.children![0].children!.map((c) => c.title)).toEqual(['Under A'])
    expect(useEditor.getState().editing).toBe('b')
  })

  it('↑/↓ move between rows and F2 renames the selected row (#134)', async () => {
    await setupProject()
    const outline = screen.getByTestId('outline-view')
    fireEvent.keyDown(outline, { key: 'ArrowDown' })
    expect(useEditor.getState().selection).toBe('root')
    fireEvent.keyDown(outline, { key: 'ArrowDown' })
    fireEvent.keyDown(outline, { key: 'ArrowDown' })
    expect(useEditor.getState().selection).toBe('b')
    fireEvent.keyDown(outline, { key: 'ArrowDown' })
    expect(useEditor.getState().selection).toBe('b')
    fireEvent.keyDown(outline, { key: 'ArrowUp' })
    expect(useEditor.getState().selection).toBe('a')

    fireEvent.keyDown(outline, { key: 'F2' })
    expect(useEditor.getState().editing).toBe('a')
    expect(screen.getByDisplayValue('Idea A')).toHaveFocus()
  })

  it('is a tree whose active descendant follows the selection (#135)', async () => {
    await setupProject()
    const tree = screen.getByRole('tree', { name: 'Outline of the mind map' })
    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
    act(() => useEditor.getState().select('b'))
    const row = screen.getByTestId('outline-row-b')
    expect(tree).toHaveAttribute('aria-activedescendant', row.id)
    expect(row).toHaveAttribute('aria-level', '2')
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById(row.getAttribute('aria-labelledby')!)).toHaveTextContent(
      'Idea B',
    )
  })

  it('Escape clears the selection, like the brainstorm outliner (#65)', async () => {
    await setupProject()
    act(() => useEditor.getState().select('a'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useEditor.getState().selection).toBeNull()
  })

  it('returns focus to the outline after a rename commits (#65)', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-a'))
    const input = screen.getByDisplayValue('Idea A')
    fireEvent.change(input, { target: { value: 'Renamed A' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('outline-view')))
  })

  it('deletes the selected node with Delete and selects the previous row', async () => {
    await setupProject()
    act(() => useEditor.getState().select('b'))
    fireEvent.keyDown(document, { key: 'Delete' })

    expect(useProjects.getState().current!.map.children!.map((node) => node.id)).toEqual(['a'])
    expect(useEditor.getState().selection).toBe('a')
  })

  it('Backspace deletes the selected node too', async () => {
    await setupProject()
    act(() => useEditor.getState().select('a'))
    fireEvent.keyDown(document, { key: 'Backspace' })

    expect(useProjects.getState().current!.map.children!.map((node) => node.id)).toEqual(['b'])
  })

  it('falls back to the root when the first child is deleted', async () => {
    await setupProject()
    act(() => useEditor.getState().select('a'))
    fireEvent.keyDown(document, { key: 'Delete' })

    expect(useEditor.getState().selection).toBe('root')
  })

  it('never deletes the root — the document would vanish', async () => {
    await setupProject()
    act(() => useEditor.getState().select('root'))
    fireEvent.keyDown(document, { key: 'Delete' })

    const map = useProjects.getState().current!.map
    expect(map.id).toBe('root')
    expect(map.children).toHaveLength(2)
  })

  it('ignores Delete while a row is being renamed', async () => {
    await setupProject()
    fireEvent.click(screen.getByTestId('outline-row-a'))
    fireEvent.keyDown(document, { key: 'Delete' })

    expect(useProjects.getState().current!.map.children!.map((node) => node.id)).toEqual(['a', 'b'])
  })
})

describe('OutlineView folding (#145)', () => {
  async function setupNested() {
    await useProjects.getState().createProject('Fold test')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('root', 'Central', [
        makeTree('a', 'Idea A', [makeTree('a1', 'Deep', [makeTree('a1x', 'Deeper')])]),
        makeTree('b', 'Idea B'),
      ]),
    }))
    return render(<OutlineView />)
  }

  it('Space, ← and → fold rows like a tree, with aria-expanded and a hidden count', async () => {
    await setupNested()
    const row = screen.getByTestId('outline-row-a')
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('outline-row-b')).not.toHaveAttribute('aria-expanded')
    act(() => useEditor.getState().select('a'))
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(useProjects.getState().current!.map.children![0].collapsed).toBe(true)
    expect(screen.queryByTestId('outline-row-a1')).toBeNull()
    expect(screen.getByTestId('outline-row-a')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('row-hidden-a')).toHaveTextContent('+2')
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(screen.getByTestId('outline-row-a1')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(useEditor.getState().selection).toBe('a1')
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(useProjects.getState().current!.map.children![0].children![0].collapsed).toBe(true)
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(useEditor.getState().selection).toBe('a')
  })

  it('folding a branch that holds the selection selects the branch', async () => {
    await setupNested()
    act(() => useEditor.getState().select('a1x'))
    fireEvent.click(screen.getByTestId('row-fold-a'))
    expect(useEditor.getState().selection).toBe('a')
  })

  it('Alt+, collapses all and Alt+. expands all, one undo step each', async () => {
    await setupNested()
    act(() => useEditor.getState().select('a1x'))
    fireEvent.keyDown(document.body, { key: ',', code: 'Comma', altKey: true })
    expect(screen.queryByTestId('outline-row-a1')).toBeNull()
    expect(useEditor.getState().selection).toBe('a')
    expect(useEditor.getState().past).toHaveLength(1)
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', altKey: true })
    expect(screen.getByTestId('outline-row-a1')).toBeInTheDocument()
    expect(screen.queryByTestId('outline-row-a1x')).toBeNull()
    fireEvent.keyDown(document.body, { key: '.', code: 'Period', altKey: true })
    expect(screen.getByTestId('outline-row-a1x')).toBeInTheDocument()
    expect(useEditor.getState().past).toHaveLength(3)
  })

  it('Ctrl+Z undoes and Ctrl+Y / Ctrl+Shift+Z redo in the Outline (#194)', async () => {
    await setupProject()
    act(() => useEditor.getState().select('b'))
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(useProjects.getState().current!.map.children!.map((n) => n.id)).toEqual(['a'])
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(useProjects.getState().current!.map.children!.map((n) => n.id)).toEqual(['a', 'b'])
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true })
    expect(useProjects.getState().current!.map.children!.map((n) => n.id)).toEqual(['a'])
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(useProjects.getState().current!.map.children!.map((n) => n.id)).toEqual(['a'])
  })

  it('lets go of a selection it does not show and never acts on it (#195)', async () => {
    await useProjects.getState().createProject('Outline test')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('root', 'Central', [
        makeTree('a', 'Idea A', [makeTree('a1', 'A1'), makeTree('a2', 'A2')]),
        makeTree('c', 'Idea C'),
      ]),
    }))
    act(() => {
      useEditor.getState().setFocus('outline', 'a')
      // Picked on the map, outside the Outline's focus.
      useEditor.getState().select('c')
    })
    render(<OutlineView />)
    await waitFor(() => expect(useEditor.getState().selection).toBeNull())
    // A selection set behind its back is ignored by the keys as well.
    act(() => useEditor.setState({ selection: 'c', selectionSet: new Set(['c']) }))
    const before = useProjects.getState().current!.map
    fireEvent.keyDown(document.body, { key: 'Tab' })
    fireEvent.keyDown(document.body, { key: ']', code: 'BracketRight', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true })
    expect(useProjects.getState().current!.map).toEqual(before)
  })
})
