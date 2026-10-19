import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { flushAnnouncement, resetAnnouncer, useAnnouncer } from '../a11y/announcer'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { revealNode } from '../search/reveal'
import { focusOn, focusUp } from './focusActions'
import { OutlineView } from './OutlineView'
import { BrainstormOutliner } from './BrainstormOutliner'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  useEditor.setState({ view: 'outline', activeSection: 'map' })
  resetAnnouncer()
  await resetDatabase()
  await useProjects.getState().createProject('Focus')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('r', 'Project', [
      makeTree('a', 'Launch', [makeTree('p', 'Pricing', [makeTree('t', 'Tiers')])]),
      makeTree('b', 'Hiring', [makeTree('b1', 'Launch party')]),
    ]),
    brainstorm: makeTree('br', 'Ideas', [makeTree('i', 'Idea', [makeTree('i1', 'Inner')])]),
  }))
})

const spoken = () => {
  flushAnnouncement()
  return useAnnouncer.getState().message
}

describe('focus state (#146)', () => {
  it('is per view, says what shows, and goes up one level at a time', () => {
    focusOn('outline', 'p')
    expect(useEditor.getState().focus).toEqual({ map: null, outline: 'p', brainstorm: null })
    expect(spoken()).toBe('Showing only “Pricing”')
    expect(focusUp('outline')).toBe(true)
    expect(useEditor.getState().focus.outline).toBe('a')
    expect(useEditor.getState().selection).toBe('p')
    expect(focusUp('outline')).toBe(true)
    expect(useEditor.getState().focus.outline).toBeNull()
    expect(spoken()).toBe('Showing everything')
    expect(focusUp('outline')).toBe(false)
  })

  it('treats focusing the root as no focus, and is never saved with the project', () => {
    useEditor.getState().setFocus('map', 'r')
    expect(useEditor.getState().focus.map).toBeNull()
    focusOn('map', 'a')
    expect(JSON.stringify(useProjects.getState().current)).not.toContain('focus')
  })

  it('leaves focus when the focused branch is deleted or undone away', () => {
    focusOn('map', 'p')
    useEditor.getState().applyTree('map', (tree) => ({
      ...tree,
      children: tree.children!.filter((c) => c.id !== 'a'),
    }))
    expect(useEditor.getState().focus.map).toBeNull()
    useEditor.getState().undo()
    expect(useEditor.getState().focus.map).toBeNull()
  })

  it('a search hit outside the branch leaves focus', () => {
    focusOn('outline', 'a')
    revealNode('t')
    expect(useEditor.getState().focus.outline).toBe('a')
    revealNode('b1')
    expect(useEditor.getState().focus.outline).toBeNull()
    expect(useEditor.getState().selection).toBe('b1')
  })
})

describe('focused Outline (#146)', () => {
  it('shows the branch as the root with a breadcrumb bar back to every level', async () => {
    render(<OutlineView />)
    act(() => focusOn('outline', 'p'))
    expect(screen.queryByTestId('outline-row-a')).toBeNull()
    expect(screen.queryByTestId('outline-row-b')).toBeNull()
    expect(screen.getByTestId('outline-row-p')).toHaveAttribute('aria-level', '1')
    const bar = await screen.findByTestId('focus-bar-outline')
    expect(bar).toHaveTextContent('ProjectLaunchPricing')
    expect(within(bar).getByText('Pricing')).toHaveAttribute('aria-current', 'location')
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }))
    expect(useEditor.getState().focus.outline).toBe('a')
    expect(screen.getByTestId('outline-row-a')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    expect(useEditor.getState().focus.outline).toBeNull()
    await waitFor(() => expect(screen.queryByTestId('focus-bar-outline')).toBeNull())
  })

  it('Enter on the focused node adds a child, Shift+Tab cannot leave the branch, Esc goes up', () => {
    render(<OutlineView />)
    act(() => focusOn('outline', 'p'))
    fireEvent.keyDown(document.body, { key: 'Enter' })
    const draft = useEditor.getState().editing!
    expect(useProjects.getState().current!.map.children![0].children![0].children!.at(-1)!.id).toBe(
      draft,
    )
    act(() => useEditor.getState().setEditing(null))
    act(() => useEditor.getState().select('t'))
    fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true })
    fireEvent.keyDown(document.body, { key: '[', ctrlKey: true })
    expect(useProjects.getState().current!.map.children![0].children![0].children![0].id).toBe('t')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(useEditor.getState().focus.outline).toBe('a')
  })

  it('Alt+→ focuses on the selection, Alt+← goes back, and Delete on the focused node leaves focus', () => {
    render(<OutlineView />)
    act(() => useEditor.getState().select('a'))
    fireEvent.keyDown(document.body, { key: 'ArrowRight', altKey: true })
    expect(useEditor.getState().focus.outline).toBe('a')
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true })
    expect(useEditor.getState().focus.outline).toBeNull()
    act(() => focusOn('outline', 'p'))
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(useEditor.getState().focus.outline).toBeNull()
    expect(useProjects.getState().current!.map.children![0].children).toEqual([])
    expect(useEditor.getState().selection).toBe('a')
  })

  it('collapse all folds only inside the focused branch', () => {
    render(<OutlineView />)
    act(() => focusOn('outline', 'a'))
    fireEvent.keyDown(document.body, { key: ',', code: 'Comma', altKey: true })
    const map = useProjects.getState().current!.map
    expect(map.children![0].collapsed).toBeFalsy()
    expect(map.children![0].children![0].collapsed).toBe(true)
    expect(map.children![1].collapsed).toBeFalsy()
  })
})

describe('focused Brainstorm (#146)', () => {
  it('lists only the branch and keeps its own focus', () => {
    act(() => useEditor.getState().setView('brainstorm'))
    render(<BrainstormOutliner />)
    act(() => focusOn('brainstorm', 'i'))
    expect(screen.queryByTestId('outliner-row-br')).toBeNull()
    expect(screen.getByTestId('outliner-row-i')).toBeInTheDocument()
    expect(useEditor.getState().focus.outline).toBeNull()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    const draft = useEditor.getState().editing!
    expect(useProjects.getState().current!.brainstorm.children![0].children!.at(-1)!.id).toBe(draft)
  })
})
