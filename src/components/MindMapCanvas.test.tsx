import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { findNode } from '../store/treeOps'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { MINIMAP_NODE_LIMIT } from '../store/session'
import { MindMapCanvas } from './MindMapCanvas'
import { NodeDetailsDialog } from './NodeDetailsDialog'

// React Flow asks for prefers-color-scheme; jsdom does not ship matchMedia.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function setupMap() {
  await useProjects.getState().createProject('Map test')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m-root', 'Central', [
      makeTree('a', 'Idea A', [], { side: 'right' }),
      makeTree('b', 'Idea B', [], { side: 'left' }),
    ]),
  }))
  useEditor.getState().select('m-root')
  return render(<MindMapCanvas />)
}

async function setupNestedMap() {
  await useProjects.getState().createProject('Nested map test')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m-root', 'Central', [
      makeTree('a', 'Idea A', [makeTree('a1', 'Deep idea')], { side: 'right' }),
      makeTree('b', 'Idea B', [], { side: 'left' }),
    ]),
  }))
  useEditor.getState().select('m-root')
  return render(<MindMapCanvas />)
}

describe('MindMapCanvas', () => {
  it('renders the canvas wrapper with a single tab stop', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    expect(canvas).toHaveAttribute('tabIndex', '0')
  })

  it('renders zoom controls and a minimap', async () => {
    await setupMap()
    expect(document.querySelector('.react-flow__controls')).toBeInTheDocument()
    expect(document.querySelector('.react-flow__minimap')).toBeInTheDocument()
  })

  it('renders the shortcut legend', async () => {
    await setupMap()
    // The .canvas-hint paragraph lists the shortcuts; multiple <kbd> elements contain "Tab"
    // so we test for the hint element + the full shortcut list via getAllByText.
    const hint = document.querySelector('.canvas-hint')
    expect(hint).toBeInTheDocument()
    expect(hint?.textContent).toMatch(/Tab/)
    expect(hint?.textContent).toMatch(/Enter/)
    expect(hint?.textContent).toMatch(/F2/)
    // Ctrl+] / Ctrl+[ replace Alt+Tab, which Windows keeps for itself (#131).
    expect(hint?.textContent).toMatch(/Ctrl\+\]/)
    expect(hint?.textContent).toMatch(/Ctrl\+\[/)
    expect(hint?.textContent).not.toMatch(/Alt\+Tab/)
    expect(hint?.textContent).toMatch(/Ctrl\+Z/)
  })

  it('Escape clears the selection, after which Tab adds nothing (#74)', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Escape' })
    expect(useEditor.getState().selection).toBeNull()
    expect(document.activeElement).toBe(canvas)

    const tab = fireEvent.keyDown(canvas, { key: 'Tab' })
    // Not prevented: the browser moves focus on, out of the canvas.
    expect(tab).toBe(true)
    expect(useProjects.getState().current!.map.children).toHaveLength(2)
    expect(screen.getByText(/Esc/)).toBeInTheDocument()
  })

  it('Tab on the root creates a child and enters edit mode', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Tab' })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'Idea B', 'New idea'])
    const newId = map.children![2].id
    expect(useEditor.getState().editing).toBe(newId)
    expect(useEditor.getState().selection).toBe(newId)
  })

  it('N7 fix: keyboard-created child mounts its RenameInput and rename commits', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Tab' })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'Idea B', 'New idea'])
    expect(map.children![2].title).toBe('New idea')

    const input = await screen.findByDisplayValue('New idea')
    fireEvent.change(input, { target: { value: 'First child' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useProjects.getState().current!.map.children![2].title).toBe('First child')
    expect(useEditor.getState().editing).toBeNull()
  })

  it('double-click renames a depth-2 child and Ctrl+Z undoes it', async () => {
    await setupNestedMap()
    const deepTitle = await screen.findByText('Deep idea')
    fireEvent.doubleClick(deepTitle)

    const input = await screen.findByDisplayValue('Deep idea')
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Deep renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(findNode(useProjects.getState().current!.map, 'a1')?.node.title).toBe('Deep renamed')
    expect(useEditor.getState().past).toHaveLength(1)

    fireEvent.keyDown(screen.getByTestId('map-canvas'), { key: 'z', ctrlKey: true })
    expect(findNode(useProjects.getState().current!.map, 'a1')?.node.title).toBe('Deep idea')
  })

  it('F2 renames a selected depth-2 child', async () => {
    await setupNestedMap()
    act(() => useEditor.getState().select('a1'))
    fireEvent.keyDown(document.body, { key: 'F2' })

    const input = await screen.findByDisplayValue('Deep idea')
    fireEvent.change(input, { target: { value: 'F2 deep rename' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(findNode(useProjects.getState().current!.map, 'a1')?.node.title).toBe('F2 deep rename')
  })

  it('Enter on the root creates a child (it has no parent so addChild fires)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('m-root'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'Idea B', 'New idea'])
  })

  it('Enter on a non-root creates a sibling', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'New idea', 'Idea B'])
  })

  it('Delete removes the selected non-root node', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Delete' })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.id)).toEqual(['b'])
    expect(useEditor.getState().selection).toBe('m-root')
  })

  it('Delete on the root is a no-op', async () => {
    await setupMap()
    act(() => useEditor.getState().select('m-root'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Delete' })

    expect(useProjects.getState().current!.map.id).toBe('m-root')
  })

  it('Shift-click adds nodes to the selection and bulk delete is one undoable edit', async () => {
    await setupMap()
    fireEvent.click(screen.getByText('Idea A'))
    fireEvent.click(screen.getByText('Idea B'), { shiftKey: true })

    expect(useEditor.getState().selection).toBe('a')
    expect(useEditor.getState().selectionSet).toEqual(new Set(['a', 'b']))

    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Delete' })
    expect(useProjects.getState().current!.map.children).toHaveLength(0)
    expect(useEditor.getState().selection).toBe('m-root')
    expect(useEditor.getState().past).toHaveLength(1)

    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.children!.map((child) => child.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('bulk delete excludes the root even when it is selected', async () => {
    await setupMap()
    act(() => useEditor.getState().select('m-root'))
    fireEvent.click(screen.getByText('Idea A'), { shiftKey: true })
    fireEvent.click(screen.getByText('Idea B'), { shiftKey: true })

    fireEvent.keyDown(screen.getByTestId('map-canvas'), { key: 'Backspace' })
    expect(useProjects.getState().current!.map.id).toBe('m-root')
    expect(useProjects.getState().current!.map.children).toHaveLength(0)
  })

  it('arrow keys are side-aware: ← and → from the centre, ↑/↓ on one side (#133)', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')

    // a is on the right, b on the left.
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' })
    expect(useEditor.getState().selection).toBe('b')
    fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    expect(useEditor.getState().selection).toBe('m-root')
    fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    expect(useEditor.getState().selection).toBe('a')
    // ↓ from the only right-hand branch no longer jumps to the left-hand one.
    fireEvent.keyDown(canvas, { key: 'ArrowDown' })
    expect(useEditor.getState().selection).toBe('a')
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' })
    expect(useEditor.getState().selection).toBe('m-root')
  })

  it('↑/↓ move between siblings on the same side', async () => {
    await useProjects.getState().createProject('Map test')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('m-root', 'Central', [
        makeTree('a', 'Idea A', [], { side: 'right' }),
        makeTree('b', 'Idea B', [], { side: 'right' }),
      ]),
    }))
    useEditor.getState().select('a')
    render(<MindMapCanvas />)
    const canvas = screen.getByTestId('map-canvas')

    fireEvent.keyDown(canvas, { key: 'ArrowDown' })
    expect(useEditor.getState().selection).toBe('b')
    fireEvent.keyDown(canvas, { key: 'ArrowUp' })
    expect(useEditor.getState().selection).toBe('a')
    fireEvent.keyDown(canvas, { key: 'ArrowUp' })
    // ArrowUp on the first sibling is a no-op; selection stays.
    expect(useEditor.getState().selection).toBe('a')
  })

  it('Ctrl+Z undoes the last edit', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Enter' })
    expect(useProjects.getState().current!.map.children).toHaveLength(3)
    expect(useEditor.getState().past).toHaveLength(1)

    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true })

    expect(useProjects.getState().current!.map.children).toHaveLength(2)
    expect(useEditor.getState().past).toHaveLength(0)
  })

  it('Ctrl+Shift+Z redoes an undone edit', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Enter' })
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true })
    expect(useProjects.getState().current!.map.children).toHaveLength(2)

    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(useProjects.getState().current!.map.children).toHaveLength(3)
  })

  it('Alt+Tab indents the selected node into its previous sibling', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Tab', altKey: true })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.id)).toEqual(['a'])
    expect(map.children![0].children!.map((c) => c.id)).toEqual(['b'])
  })

  it('Alt+Shift+Tab outdents the selected node back to the parent level', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Tab', altKey: true })
    fireEvent.keyDown(canvas, { key: 'Tab', altKey: true, shiftKey: true })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('Alt+Shift+F flips a main branch; Alt+Shift+S no longer does (live test, item 5)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'S', code: 'KeyS', altKey: true, shiftKey: true })
    expect(useProjects.getState().current!.map.children![0].side).toBe('right')

    // On a Mac, Option+Shift+F types "Ï": the physical key is what counts.
    fireEvent.keyDown(canvas, { key: 'Ï', code: 'KeyF', altKey: true, shiftKey: true })
    expect(useProjects.getState().current!.map.children![0].side).toBe('left')
    fireEvent.keyDown(canvas, { key: 'F', code: 'KeyF', altKey: true, shiftKey: true })
    expect(useProjects.getState().current!.map.children![0].side).toBe('right')
  })

  it('ignores map shortcuts while a dialog is open (#166)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    try {
      fireEvent.keyDown(document.body, { key: 'Delete' })
      fireEvent.keyDown(document.body, { key: '1', code: 'Digit1', altKey: true })
      fireEvent.keyDown(document.body, { key: 'Enter' })
      const map = useProjects.getState().current!.map
      expect(map.children!.map((c) => c.id)).toEqual(['a', 'b'])
    } finally {
      dialog.remove()
    }
    // Closed again, Delete works as before.
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(useProjects.getState().current!.map.children!.map((c) => c.id)).toEqual(['b'])
  })

  it('leaves the notes text out of the marker while an image is captured (#178)', async () => {
    await useProjects.getState().createProject('Notes')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('m-root', 'Central', [
        makeTree('a', 'Idea A', [], { notes: 'Private detail' }),
      ]),
    }))
    const { container } = render(<MindMapCanvas />)
    const marker = await waitFor(() => {
      const found = container.querySelector('.map-node-notes')
      if (!found) throw new Error('no marker yet')
      return found
    })
    expect(marker.getAttribute('title')).toBe('Private detail')
    act(() => useEditor.getState().setCapturing(true))
    expect(container.querySelector('.map-node-notes')!.getAttribute('title')).toBeNull()
    act(() => useEditor.getState().setCapturing(false))
  })

  it('Ctrl+] indents and Ctrl+[ outdents the selected node (#131)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: ']', code: 'BracketRight', ctrlKey: true })
    let map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.id)).toEqual(['a'])
    expect(map.children![0].children!.map((c) => c.id)).toEqual(['b'])

    fireEvent.keyDown(canvas, { key: '[', code: 'BracketLeft', metaKey: true })
    map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('canvas keydown ignores interactive descendants (RenameInput owns its keys)', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Tab' })

    // Find the rename input mounted for the new child; press Enter on it.
    const input = await screen.findByDisplayValue('New idea')
    const beforeChildren = useProjects.getState().current!.map.children!.length
    fireEvent.keyDown(input, { key: 'Enter' })

    // Enter on the input commits the rename; it must NOT bubble to the canvas (which would
    // create yet another sibling because the canvas is focused via React Flow's focus chain).
    expect(useEditor.getState().editing).toBeNull()
    const afterChildren = useProjects.getState().current!.map.children!.length
    expect(afterChildren).toBe(beforeChildren)
  })

  it('Space collapses a branch without adding an undo step (B2)', async () => {
    await setupNestedMap()
    await screen.findByText('Deep idea')
    act(() => useEditor.getState().select('a'))
    const pastBefore = useEditor.getState().past.length
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(useProjects.getState().current!.map.children![0].collapsed).toBe(true)
    expect(useEditor.getState().past).toHaveLength(pastBefore)
  })

  it('MapNode toggle button owns its Enter key (does not bubble to canvas)', async () => {
    await setupMap()
    // Render the React Flow tree, then find the root's toggle (the root has children).
    const toggle = await screen.findByTitle('Collapse branch')
    expect(toggle).toBeInTheDocument()

    const beforeChildren = useProjects.getState().current!.map.children!.length
    // Enter on the toggle must not create a sibling. Two independent layers prevent that — the
    // toggle's own stopPropagation and the canvas's closest('button, …') guard — so this case does
    // NOT discriminate which one is carrying it (measured: deleting either alone still passes).
    fireEvent.keyDown(toggle, { key: 'Enter' })
    const afterChildren = useProjects.getState().current!.map.children!.length
    expect(afterChildren).toBe(beforeChildren)
  })

  it('shortcut survives focus on a non-interactive descendant (Retraction §1)', async () => {
    await setupMap()
    // React Flow routes focus through node internals, so a real keypress can arrive with e.target
    // set to a plain descendant (the title span) rather than .canvas-wrap itself. The shipped
    // closest('button, input, …') guard lets those through; the retracted strict
    // e.target !== wrapperRef.current check would swallow every map shortcut here.
    const title = await screen.findByText('Central')
    expect(title.classList.contains('map-node-title')).toBe(true)

    fireEvent.keyDown(title, { key: 'Tab' })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'Idea B', 'New idea'])
  })

  it('opens a node context menu and hides delete for the root', async () => {
    await setupMap()
    fireEvent.contextMenu(screen.getByText('Idea A'), { clientX: 40, clientY: 50 })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByText('Central'), { clientX: 40, clientY: 50 })
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('context menu rename and add child use the editor paths', async () => {
    await setupMap()
    fireEvent.contextMenu(screen.getByText('Idea A'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const renameInput = await screen.findByDisplayValue('Idea A')
    expect(renameInput).toHaveFocus()
    fireEvent.change(renameInput, { target: { value: 'Renamed A' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })
    expect(findNode(useProjects.getState().current!.map, 'a')?.node.title).toBe('Renamed A')

    fireEvent.contextMenu(screen.getByText('Renamed A'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add child' }))
    expect(findNode(useProjects.getState().current!.map, 'a')?.node.children).toHaveLength(1)
    expect(useEditor.getState().editing).toBe(
      useProjects.getState().current!.map.children![0].children![0].id,
    )
  })

  it('context menu delete is bulk-aware and Escape restores canvas focus', async () => {
    await setupMap()
    fireEvent.click(screen.getByText('Idea A'))
    fireEvent.click(screen.getByText('Idea B'), { shiftKey: true })
    fireEvent.contextMenu(screen.getByText('Idea A'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(useProjects.getState().current!.map.children).toHaveLength(0)

    // Recreate a node and verify the menu's Escape path separately.
    act(() =>
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: makeTree('m-root', 'Central', [makeTree('c', 'Child', [], { side: 'right' })]),
      })),
    )
    useEditor.getState().select('c')
    fireEvent.contextMenu(screen.getByText('Child'))
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Rename' }), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByTestId('map-canvas'))
  })
})

describe('MindMapCanvas — focus ownership (#5, Batch 16)', () => {
  it('rename commit returns focus to the canvas wrapper, not <body> (tripwire a)', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Tab' })
    const input = await screen.findByDisplayValue('New idea')
    expect(input).toHaveFocus()

    fireEvent.change(input, { target: { value: 'Named child' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useEditor.getState().editing).toBeNull()
    expect(document.activeElement).toBe(canvas)
  })

  it('Escape during rename also returns focus to the canvas wrapper', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    fireEvent.keyDown(canvas, { key: 'Tab' })
    const input = await screen.findByDisplayValue('New idea')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(useEditor.getState().editing).toBeNull()
    expect(document.activeElement).toBe(canvas)
  })

  it('shortcuts fire from <body> — focus loss is no longer fatal (tripwire: document level)', async () => {
    await setupMap()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    expect(document.activeElement).toBe(document.body)

    fireEvent.keyDown(document.body, { key: 'Enter' })

    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'Idea B', 'New idea'])
  })

  it('ArrowDown/Enter bootstrap a null selection to the root (mirrors the outliner)', async () => {
    await setupMap()
    act(() => useEditor.getState().select(null))

    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(useEditor.getState().selection).toBe('m-root')

    act(() => useEditor.getState().select(null))
    fireEvent.keyDown(document.body, { key: 'Enter' })
    const map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'Idea B', 'New idea'])
    expect(useEditor.getState().editing).toBe(map.children![2].id)
  })

  it('F2/Tab/Delete stay no-ops when there is no selection to act on', async () => {
    await setupMap()
    act(() => useEditor.getState().select(null))
    const before = useProjects.getState().current!.map

    fireEvent.keyDown(document.body, { key: 'F2' })
    fireEvent.keyDown(document.body, { key: 'Delete' })
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })

    expect(useProjects.getState().current!.map).toBe(before)
    expect(useEditor.getState().selection).toBeNull()
    expect(useEditor.getState().editing).toBeNull()
  })

  it('with details open, Enter/Delete do the tree op and never touch notes (tripwire b)', async () => {
    await useProjects.getState().createProject('Map test')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('m-root', 'Central', [
        makeTree('a', 'Idea A', [], { side: 'right', notes: 'keep me' }),
        makeTree('b', 'Idea B', [], { side: 'left' }),
      ]),
    }))
    useEditor.getState().select('a')
    render(
      <>
        <MindMapCanvas />
        <NodeDetailsDialog />
      </>,
    )
    expect(screen.getByTestId('node-details-notes')).not.toHaveFocus()

    // Enter adds a sibling of the selection; commit its rename; Delete removes it again.
    // Notes survive the whole chain.
    fireEvent.keyDown(document.body, { key: 'Enter' })
    let map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'New idea', 'Idea B'])
    const renameInput = await screen.findByDisplayValue('New idea')
    fireEvent.keyDown(renameInput, { key: 'Enter' })
    expect(useEditor.getState().editing).toBeNull()

    fireEvent.keyDown(document.body, { key: 'Delete' })
    map = useProjects.getState().current!.map
    expect(map.children!.map((c) => c.title)).toEqual(['Idea A', 'Idea B'])

    expect(findNode(map, 'a')?.node.notes).toBe('keep me')
    // Delete's fallback is the removed node's parent — the created sibling of 'a' lived
    // under the root, so the selection lands on m-root.
    expect(useEditor.getState().selection).toBe('m-root')
  })
})

describe('MindMapCanvas — map overview and shortcuts (#80)', () => {
  it('hides and shows the minimap, and remembers the choice', async () => {
    await setupMap()
    expect(screen.getByLabelText('Map overview')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide map overview' }))
    expect(screen.queryByLabelText('Map overview')).toBeNull()
    expect(localStorage.getItem('mms.minimap')).toBe('off')

    const toggle = screen.getByRole('button', { name: 'Show map overview' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Map overview')).toBeInTheDocument()
    expect(localStorage.getItem('mms.minimap')).toBe('on')
  })

  it('starts hidden on a big map and shows it on request without saving that (#139)', async () => {
    await useProjects.getState().createProject('Big map test')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree(
        'm-root',
        'Central',
        Array.from({ length: MINIMAP_NODE_LIMIT + 1 }, (_, i) => makeTree(`n${i}`, `Idea ${i}`)),
      ),
    }))
    useEditor.getState().select('m-root')
    render(<MindMapCanvas />)
    expect(screen.queryByLabelText('Map overview')).toBeNull()
    const toggle = screen.getByRole('button', { name: /Map overview is off for maps over 500/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Map overview')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide map overview' }))
    expect(screen.queryByLabelText('Map overview')).toBeNull()
    // Small maps keep showing it.
    expect(localStorage.getItem('mms.minimap')).toBe('on')
  })

  it('starts hidden when the user hid it last time', async () => {
    localStorage.setItem('mms.minimap', 'off')
    await setupMap()
    expect(screen.queryByLabelText('Map overview')).toBeNull()
  })

  it('the hint bar "?" opens the shortcuts dialog', async () => {
    await setupMap()
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(useUi.getState().shortcutsOpen).toBe(true)
  })
})

describe('MindMapCanvas — screen readers (#85)', () => {
  it('names every node and marks the selected one', async () => {
    await setupMap()
    const root = screen.getByRole('group', { name: 'Central, central topic, 2 children' })
    expect(root).toHaveAttribute('aria-current', 'true')
    const idea = screen.getByRole('group', { name: 'Idea A, level 1' })
    expect(idea).not.toHaveAttribute('aria-current')
    act(() => useEditor.getState().select('a'))
    expect(screen.getByRole('group', { name: 'Idea A, level 1' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('the canvas is a labelled application region described by the key hints', async () => {
    await setupMap()
    const canvas = screen.getByTestId('map-canvas')
    expect(canvas).toHaveAttribute('role', 'application')
    expect(canvas).toHaveAccessibleName('Mind map: Central')
    expect(canvas).toHaveAccessibleDescription(/Tab child/)
  })
})

describe('MindMapCanvas — Link to… (#90)', () => {
  it('the node menu offers "Link to…", which opens the picker for that node', async () => {
    await setupMap()
    fireEvent.contextMenu(screen.getByRole('group', { name: /^Idea A, level 1/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Link to…' }))
    expect(useUi.getState().linkPickFrom).toBe('a')
  })
})

describe('MindMapCanvas — Escape discards an unnamed new node (follow-up)', () => {
  it('Tab then Escape leaves the map as it was', async () => {
    await setupMap()
    const before = useProjects.getState().current!.map
    fireEvent.keyDown(screen.getByTestId('map-canvas'), { key: 'Tab' })
    const input = document.querySelector<HTMLInputElement>('input.map-node-input')!
    expect(input.value).toBe('New idea')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useProjects.getState().current!.map).toEqual(before)
    expect(useEditor.getState().selection).toBe('m-root')
  })
})

describe('MindMapCanvas — details panel you can hide (#144)', () => {
  beforeEach(() => {
    useUi.getState().setDetailsPanel('shown')
  })

  afterEach(() => {
    localStorage.removeItem('mms.detailsPanel')
  })

  async function setupWithPanel() {
    await useProjects.getState().createProject('Panel test')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('m-root', 'Central', [makeTree('a', 'Idea A', [], { side: 'right' })]),
    }))
    useEditor.getState().select('a')
    return render(
      <>
        <MindMapCanvas />
        <NodeDetailsDialog />
      </>,
    )
  }

  it('× keeps the selection, so Tab still adds a child', async () => {
    await setupWithPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(screen.queryByTestId('node-details')).not.toBeInTheDocument()
    expect(useEditor.getState().selection).toBe('a')

    fireEvent.keyDown(screen.getByTestId('map-canvas'), { key: 'Tab' })
    const a = findNode(useProjects.getState().current!.map, 'a')!.node
    expect(a.children).toHaveLength(1)
    expect(useEditor.getState().editing).toBe(a.children![0].id)
    // Still hidden: naming the new node does not bring the panel back.
    expect(screen.queryByTestId('node-details')).not.toBeInTheDocument()
  })

  it('the node menu’s "Notes…" opens a hidden panel on the notes box', async () => {
    await setupWithPanel()
    act(() => useUi.getState().setDetailsPanel('hidden'))
    fireEvent.contextMenu(screen.getByText('Idea A'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Notes…' }))
    expect(useUi.getState().detailsPanel).toBe('shown')
    expect(screen.getByTestId('node-details-notes')).toHaveFocus()
    expect(useEditor.getState().selection).toBe('a')
  })
})
