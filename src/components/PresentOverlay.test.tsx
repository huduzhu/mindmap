import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { flushAnnouncement, useAnnouncer } from '../a11y/announcer'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import * as syncStore from '../sync/store'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'

const key = (name: string, options: Partial<KeyboardEventInit> = {}) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: name, ...options })
  })

const stage = () => screen.getByTestId('present-stage')

async function openProject() {
  render(<App />)
  await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
  await act(async () => {
    await useProjects.getState().createProject('Show')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('r', 'Plan', [
        makeTree('a', 'Launch', [makeTree('p', 'Pricing', [], { notes: 'Three tiers' })]),
        makeTree('b', 'Hiring', [makeTree('b1', 'Roles')], { collapsed: true }),
      ]),
    }))
    await useProjects.getState().saveCurrent()
  })
  act(() => useEditor.getState().setView('map'))
  act(() => useEditor.getState().select('a'))
}

describe('presentation mode (#152)', () => {
  beforeEach(async () => {
    useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
    useEditor.getState().reset()
    useUi.setState({ presenting: null })
    await resetDatabase()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    syncStore.useSync.setState({ status: 'off' })
  })

  it('presents read-only: no undo step, no save, no sync, the same project object', async () => {
    await openProject()
    syncStore.useSync.setState({ status: 'idle' })
    const sync = vi.spyOn(syncStore, 'requestSync')
    const before = useProjects.getState().current
    const changes = vi.fn()
    const unsubscribe = useProjects.subscribe(changes)

    key('F5')
    expect(useUi.getState().presenting).toEqual({ from: null })
    await screen.findByTestId('present-stage', {}, { timeout: 5000 })
    expect(stage()).toHaveAttribute('role', 'dialog')
    expect(stage()).toHaveAttribute('data-current', 'r')
    key('ArrowRight')
    key(' ')
    key('PageDown')
    expect(stage()).toHaveAttribute('data-step', '4')
    // Steps: Plan, Launch, Hiring, then Launch's child Pricing.
    expect(stage()).toHaveAttribute('data-current', 'p')
    // Keys that edit the map do nothing while presenting.
    key('Delete')
    key('Tab')
    key('z', { ctrlKey: true })
    key('Escape')
    await waitFor(() => expect(screen.queryByTestId('present-stage')).toBeNull(), {
      timeout: 5000,
    })

    unsubscribe()
    expect(changes).not.toHaveBeenCalled()
    expect(useProjects.getState().current).toBe(before)
    expect(useProjects.getState().hasUnsavedChanges()).toBe(false)
    expect(useEditor.getState().past).toHaveLength(0)
    expect(useEditor.getState().future).toHaveLength(0)
    expect(sync).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('unfolds a folded branch for the show only, and leaves selection and focus as they were', async () => {
    await openProject()
    act(() => useEditor.getState().setFocus('map', null))
    act(() => useEditor.getState().select('b'))
    act(() => useUi.getState().setPresenting({ from: 'b' }))
    await screen.findByTestId('present-stage')
    expect(stage()).toHaveAttribute('data-current', 'b')
    key('End')
    expect(stage()).toHaveAttribute('data-current', 'b1')
    key('Home')
    expect(stage()).toHaveAttribute('data-current', 'r')
    key('3')
    expect(screen.getByTestId('present-counter')).toHaveTextContent('Go to 3')
    key('Enter')
    expect(stage()).toHaveAttribute('data-current', 'b')
    fireEvent.click(screen.getByTestId('present-exit'))
    await waitFor(() => expect(screen.queryByTestId('present-stage')).toBeNull())
    expect(useProjects.getState().current!.map.children![1].collapsed).toBe(true)
    expect(useEditor.getState().selection).toBe('b')
    expect(useEditor.getState().focus.map).toBeNull()
  })

  it('presents only the focused branch', async () => {
    await openProject()
    act(() => useEditor.getState().setFocus('map', 'a'))
    act(() => useUi.getState().setPresenting({ from: null }))
    await screen.findByTestId('present-stage')
    expect(stage()).toHaveAttribute('data-current', 'a')
    key('End')
    expect(stage()).toHaveAttribute('data-current', 'p')
    expect(screen.getByTestId('present-counter')).toHaveTextContent('2 / 2')
    key('Escape')
    await waitFor(() => expect(screen.queryByTestId('present-stage')).toBeNull())
    expect(useEditor.getState().focus.map).toBe('a')
  })

  it('announces each step, with the notes when captions are on', async () => {
    await openProject()
    act(() => useUi.getState().setPresenting({ from: 'p' }))
    await screen.findByTestId('present-stage')
    await waitFor(() => {
      flushAnnouncement()
      expect(useAnnouncer.getState().message).toBe('Step 4 of 5: Pricing, under Launch')
    })
    key('n')
    expect(screen.getByTestId('present-caption')).toHaveTextContent('Three tiers')
    await waitFor(() => {
      flushAnnouncement()
      expect(useAnnouncer.getState().message).toBe(
        'Step 4 of 5: Pricing, under Launch Notes: Three tiers',
      )
    })
    key('b')
    expect(screen.getByTestId('present-blank')).toBeInTheDocument()
    key('b')
    expect(screen.queryByTestId('present-blank')).toBeNull()
    key('Escape')
  })

  it('does not take F5 without a project', async () => {
    render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    const event = new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(useUi.getState().presenting).toBeNull()
  })
})
