import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { MindMapCanvas } from './MindMapCanvas'
import { DOUBLE_TAP_MS, LONG_PRESS_MS } from './nodeGestures'

const original = window.matchMedia

function pointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('coarse') ? coarse : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
  await useProjects.getState().createProject('Touch')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m', 'Central', [makeTree('a', 'Idea A', [makeTree('a1', 'Deep')])]),
  }))
  useEditor.getState().select('a')
})

afterEach(() => {
  window.matchMedia = original
  vi.useRealTimers()
})

const node = (name: RegExp) => screen.getByRole('group', { name })
const map = () => useProjects.getState().current!.map

describe('touch editing (#91)', () => {
  it('shows no action bar for a mouse', () => {
    pointer(false)
    render(<MindMapCanvas />)
    expect(screen.queryByTestId('touch-bar')).toBeNull()
  })

  it('the action bar edits the selected node', () => {
    pointer(true)
    render(<MindMapCanvas />)
    const bar = screen.getByRole('toolbar', { name: 'Node actions' })
    expect(bar).toBeInTheDocument()

    fireEvent.click(within(bar).getByRole('button', { name: 'Collapse Idea A' }))
    expect(map().children![0].collapsed).toBe(true)
    fireEvent.click(
      within(screen.getByTestId('touch-bar')).getByRole('button', { name: 'Expand Idea A' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add a child to Idea A' }))
    expect(map().children![0].children).toHaveLength(2)
    expect(useEditor.getState().editing).toBe(useEditor.getState().selection)
    act(() => useEditor.getState().setEditing(null))
    act(() => useEditor.getState().select('a'))

    fireEvent.click(screen.getByRole('button', { name: 'Rename Idea A' }))
    expect(useEditor.getState().editing).toBe('a')
    act(() => useEditor.getState().setEditing(null))

    fireEvent.click(screen.getByRole('button', { name: 'Edit the notes of Idea A' }))
    expect(useEditor.getState().focusNotes).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Idea A' }))
    expect(map().children ?? []).toHaveLength(0)
  })

  it('offers neither sibling nor delete on the root', () => {
    pointer(true)
    act(() => useEditor.getState().select('m'))
    render(<MindMapCanvas />)
    expect(screen.queryByRole('button', { name: /Add a sibling/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a child to Central' })).toBeInTheDocument()
  })

  it('long-press opens the node menu', () => {
    pointer(true)
    vi.useFakeTimers()
    render(<MindMapCanvas />)
    fireEvent.pointerDown(node(/^Idea A/), { pointerType: 'touch', clientX: 50, clientY: 60 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    })
    fireEvent.pointerUp(node(/^Idea A/), { pointerType: 'touch' })
    expect(screen.getByRole('menu', { name: 'Node actions' })).toBeInTheDocument()
  })

  it('a finger that moves is a pan, not a long-press', () => {
    pointer(true)
    vi.useFakeTimers()
    render(<MindMapCanvas />)
    fireEvent.pointerDown(node(/^Idea A/), { pointerType: 'touch', clientX: 50, clientY: 60 })
    fireEvent.pointerMove(node(/^Idea A/), { pointerType: 'touch', clientX: 90, clientY: 60 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('double-tap renames', () => {
    pointer(true)
    render(<MindMapCanvas />)
    const target = node(/^Idea A/)
    const tap = (timeStamp: number) => {
      fireEvent.pointerDown(target, { pointerType: 'touch', timeStamp })
      fireEvent.pointerUp(target, { pointerType: 'touch', timeStamp })
    }
    tap(1000)
    tap(1000 + DOUBLE_TAP_MS / 2)
    expect(useEditor.getState().editing).toBe('a')
  })
})
