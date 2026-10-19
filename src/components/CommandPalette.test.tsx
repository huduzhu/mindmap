import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { resetDatabase } from '../test/resetDb'
import { loadCommandPalette } from './lazyParts'

// The palette is its own chunk (#141): load it once up front so the first
// test's wait measures the palette, not the first-time module load.
beforeAll(async () => {
  await loadCommandPalette()
})

async function setupProject() {
  await resetDatabase()
  useEditor.getState().reset()
  useUi.getState().closeAll()
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await useProjects.getState().init()
  await useProjects.getState().createProject('Palette test')
  useProjects.setState({ loaded: true })
}

function pressHotkey() {
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
}

async function openPalette() {
  pressHotkey()
  // A lazily loaded chunk (#141): allow for a slow first load on a busy machine.
  return screen.findByTestId('command-palette', {}, { timeout: 4000 })
}

// Scoped to the listbox: the toolbar's Open <select> also exposes native options.
function options() {
  return within(screen.getByTestId('command-list')).getAllByRole('option')
}

describe('Command palette — hotkey', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('Ctrl+K opens the palette with the search input focused', async () => {
    render(<App />)
    const palette = await openPalette()
    expect(palette).toHaveAttribute('role', 'dialog')
    expect(screen.getByTestId('command-palette-input')).toHaveFocus()
  })

  it('Ctrl+K again closes it, and Escape closes it too', async () => {
    render(<App />)
    await openPalette()
    pressHotkey()
    await waitFor(() => {
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })

    await openPalette()
    fireEvent.keyDown(screen.getByTestId('command-palette'), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })
  })

  it('is reachable from the start screen, where no toolbar is mounted', async () => {
    useProjects.setState({ currentId: null, current: null, loaded: true })
    render(<App />)
    await openPalette()
    expect(screen.getByTestId('command-item-project.new')).toBeInTheDocument()
  })
})

describe('Command palette — filtering and running', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('filters the list as you type', async () => {
    render(<App />)
    await openPalette()
    fireEvent.change(screen.getByTestId('command-palette-input'), {
      target: { value: 'Go to Outline' },
    })
    expect(screen.getByTestId('command-item-view.outline')).toBeInTheDocument()
    expect(screen.queryByTestId('command-item-export.png')).not.toBeInTheDocument()
  })

  it('Enter on the input runs the active command and closes the palette', async () => {
    render(<App />)
    await openPalette()
    const input = screen.getByTestId('command-palette-input')
    fireEvent.change(input, { target: { value: 'Go to Outline' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(useEditor.getState().view).toBe('outline')
    })
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
  })

  it('ArrowDown moves the active option and keeps it in aria-activedescendant', async () => {
    render(<App />)
    await openPalette()
    const input = screen.getByTestId('command-palette-input')
    const items = options()
    expect(items[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(items[1]).toHaveAttribute('aria-selected', 'true')
    })
    expect(items[0]).toHaveAttribute('aria-selected', 'false')
    expect(input.getAttribute('aria-activedescendant')).toBe(items[1].id)
  })

  it('options stay out of the tab order so a long list cannot flood it', async () => {
    render(<App />)
    await openPalette()
    const items = options()
    expect(items.length).toBeGreaterThan(10)
    expect(items.every((item) => !item.hasAttribute('tabindex'))).toBe(true)
  })

  it('disabled commands are marked and do not run', async () => {
    render(<App />)
    await openPalette()
    const input = screen.getByTestId('command-palette-input')
    fireEvent.change(input, { target: { value: 'Undo' } })
    const item = screen.getByTestId('command-item-edit.undo')
    expect(item).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
  })

  it('shows an empty state instead of an empty list', async () => {
    render(<App />)
    await openPalette()
    fireEvent.change(screen.getByTestId('command-palette-input'), {
      target: { value: 'zzzzz' },
    })
    expect(screen.getByTestId('command-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('command-list')).not.toBeInTheDocument()
  })
})

describe('Command palette — rows (#81)', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('names the group once as a heading, not on every row, and shows shortcuts', async () => {
    render(<App />)
    await openPalette()
    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: 'undo' } })
    const row = screen.getByTestId('command-item-edit.undo')
    expect(row).not.toHaveTextContent('Edit')
    expect(row.querySelector('kbd')).toHaveTextContent('Ctrl+Z')
    expect(within(screen.getByTestId('command-list')).getByText('Edit')).toHaveClass(
      'command-group',
    )
  })

  it('opens with a query when asked (Project ▾ → Open…)', async () => {
    await useProjects.getState().createProject('Second one')
    render(<App />)
    act(() => useUi.getState().setPaletteOpen(true, 'Open “'))
    expect(await screen.findByTestId('command-palette-input')).toHaveValue('Open “')
    expect(options().map((option) => option.textContent)).toEqual(['Open “Palette test”'])
  })
})
