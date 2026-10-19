import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { useEditor } from './store/editor'
import { useProjects } from './store/projects'
import { useUi } from './store/ui'
import { getProject } from './io/db'
import { resetDatabase } from './test/resetDb'

async function setupProject() {
  const id = await useProjects.getState().createProject('Unload test')
  await useProjects.getState().saveCurrent()
  return id
}

async function renderApp() {
  const view = render(<App />)
  await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
  return view
}

describe('App unload listeners', () => {
  beforeEach(async () => {
    useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
    useEditor.setState({ past: [], future: [], selection: null, editing: null, view: 'map' })
    await resetDatabase()
  })

  afterEach(() => {
    // jsdom defaults to visible; restore so a failed test does not bleed into the next.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('visibilitychange to hidden flushes a pending autosave', async () => {
    await setupProject()
    await renderApp()
    useProjects.getState().updateCurrent((p) => ({ ...p, name: 'Unload edit' }))
    expect(useProjects.getState().hasUnsavedChanges()).toBe(true)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => expect(useProjects.getState().hasUnsavedChanges()).toBe(false))
  })

  it('pagehide flushes a pending autosave', async () => {
    const id = await setupProject()
    await renderApp()
    useProjects.getState().updateCurrent((p) => ({ ...p, name: 'Page-hide edit' }))
    expect(useProjects.getState().hasUnsavedChanges()).toBe(true)

    fireEvent(window, new Event('pagehide'))

    await waitFor(() => expect(useProjects.getState().hasUnsavedChanges()).toBe(false))
    expect((await getProject(id))?.project.name).toBe('Page-hide edit')
  })

  it('beforeunload only calls preventDefault when there are unsaved changes', async () => {
    const id = await setupProject()
    await renderApp()
    // First event: nothing pending → must NOT prompt.
    let firstEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, firstEvent)
    expect(firstEvent.defaultPrevented).toBe(false)

    // Now schedule a pending edit and fire again → must prompt.
    act(() => {
      useProjects.getState().updateCurrent((p) => ({ ...p, name: 'Unload prompt' }))
    })
    expect(useProjects.getState().hasUnsavedChanges()).toBe(true)

    const secondEvent = new Event('beforeunload', { cancelable: true })
    fireEvent(window, secondEvent)
    expect(secondEvent.defaultPrevented).toBe(true)

    // Flush so the test leaves a clean store.
    await useProjects.getState().saveCurrent()
    expect((await getProject(id))?.project.name).toBe('Unload prompt')
  })
})

describe('details panel shortcut (#144)', () => {
  beforeEach(async () => {
    useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
    useEditor.setState({ past: [], future: [], selection: null, editing: null, view: 'map' })
    useUi.getState().setDetailsPanel('shown')
    await resetDatabase()
  })

  afterEach(() => {
    localStorage.removeItem('mms.detailsPanel')
  })

  it('Ctrl/Cmd+I toggles it, but not while typing in a text field', async () => {
    await setupProject()
    await renderApp()
    await screen.findByTestId('details-toggle')
    act(() => useEditor.getState().select(useProjects.getState().current!.map.id))
    await screen.findByTestId('node-details')

    const ctrlI = fireEvent.keyDown(document.body, { key: 'i', ctrlKey: true })
    expect(ctrlI).toBe(false) // prevented
    expect(useUi.getState().detailsPanel).toBe('hidden')
    expect(screen.queryByTestId('node-details')).not.toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'I', metaKey: true })
    expect(useUi.getState().detailsPanel).toBe('shown')

    const notes = await screen.findByTestId('node-details-notes')
    expect(fireEvent.keyDown(notes, { key: 'i', ctrlKey: true })).toBe(true)
    expect(useUi.getState().detailsPanel).toBe('shown')
    // Ctrl+Shift+I stays the browser's developer tools.
    fireEvent.keyDown(document.body, { key: 'I', ctrlKey: true, shiftKey: true })
    expect(useUi.getState().detailsPanel).toBe('shown')
  })
})
