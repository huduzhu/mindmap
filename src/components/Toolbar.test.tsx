import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useEditor } from '../store/editor'
import { notifyPendingEdits, registerPendingEdit } from '../store/pendingEdits'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { resetDatabase } from '../test/resetDb'
import { PromptHost } from './PromptDialog'
import { Toolbar } from './Toolbar'
import { useToast } from './toastStore'

const EXPORT_TOGGLE = 'Export ▾'

// Real browsers target the focused element, and the shortcut handlers bail on
// inputs/buttons by inspecting e.target — so dispatch there, not on <body>.
function pressKey(key: string) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key })
}

async function setupProject() {
  await resetDatabase()
  useEditor.getState().reset()
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await useProjects.getState().init()
  await useProjects.getState().createProject('A11y test')
  useProjects.setState({ loaded: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  useToast.getState().clear()
})

describe('Toolbar a11y — tabs', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('renders the tablist with aria-controls pointing at the panel', () => {
    render(<Toolbar />)
    const tab = screen.getByRole('tab', { name: 'Mind Map' })
    expect(tab).toHaveAttribute('aria-controls', 'tab-panel')
    expect(tab).toHaveAttribute('id', 'tab-map-toggle')
    expect(screen.getByRole('tab', { name: 'Brainstorm' })).toHaveAttribute(
      'aria-controls',
      'tab-panel',
    )
  })

  it('only the selected tab is in the tab order (tabIndex=0; others -1)', () => {
    render(<Toolbar />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[2]).toHaveAttribute('tabindex', '-1')
  })

  it('ArrowRight on the active tab moves to the next tab and activates it', async () => {
    render(<Toolbar />)
    const mapTab = screen.getByRole('tab', { name: 'Mind Map' })
    mapTab.focus()
    fireEvent.keyDown(mapTab, { key: 'ArrowRight' })
    const brainstorm = screen.getByRole('tab', { name: 'Brainstorm' })
    await waitFor(() => {
      expect(brainstorm).toHaveAttribute('aria-selected', 'true')
    })
    expect(useEditor.getState().view).toBe('brainstorm')
    expect(brainstorm).toHaveFocus()
  })

  it('ArrowLeft on the first tab wraps to the last', async () => {
    render(<Toolbar />)
    const mapTab = screen.getByRole('tab', { name: 'Mind Map' })
    mapTab.focus()
    fireEvent.keyDown(mapTab, { key: 'ArrowLeft' })
    const outline = screen.getByRole('tab', { name: 'Outline' })
    await waitFor(() => {
      expect(outline).toHaveAttribute('aria-selected', 'true')
    })
    expect(useEditor.getState().view).toBe('outline')
    expect(outline).toHaveFocus()
  })

  it('Home and End jump to the first and last tab', async () => {
    render(<Toolbar />)
    const outlineTab = screen.getByRole('tab', { name: 'Outline' })
    outlineTab.focus()
    fireEvent.keyDown(outlineTab, { key: 'End' })
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true')
    })
    fireEvent.keyDown(outlineTab, { key: 'Home' })
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Mind Map' })).toHaveAttribute('aria-selected', 'true')
    })
  })
})

describe('Toolbar a11y — panel + tablist inside App', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('renders the panel as role=tabpanel with aria-labelledby pointing at the active tab', async () => {
    render(<App />)
    await waitFor(() => {
      expect(document.getElementById('tab-panel')).not.toBeNull()
    })
    const panel = document.getElementById('tab-panel')
    expect(panel).toHaveAttribute('role', 'tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-map-toggle')
  })

  it('updates aria-labelledby when the view switches', async () => {
    render(<App />)
    await waitFor(() => {
      expect(document.getElementById('tab-panel')).not.toBeNull()
    })
    const mapTab = screen.getByRole('tab', { name: 'Mind Map' })
    mapTab.focus()
    fireEvent.keyDown(mapTab, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(document.getElementById('tab-panel')).toHaveAttribute(
        'aria-labelledby',
        'tab-brainstorm-toggle',
      )
    })
  })
})

describe('Toolbar a11y — export menu', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('opens the export menu with the first menuitem focused', async () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: EXPORT_TOGGLE }))
    const items = screen.getAllByRole('menuitem')
    await waitFor(() => {
      expect(items[0]).toHaveFocus()
    })
    expect(screen.getByRole('menu')).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('aria-labelledby on the menu points at the toggle button', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: EXPORT_TOGGLE }))
    const menu = screen.getByRole('menu')
    const toggleId = menu.getAttribute('aria-labelledby')
    expect(toggleId).not.toBeNull()
    expect(document.getElementById(toggleId as string)).toBe(
      screen.getByRole('button', { name: EXPORT_TOGGLE }),
    )
  })

  it('ArrowDown moves focus to the next non-disabled menuitem, wrapping at the end', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: EXPORT_TOGGLE }))
    const items = screen.getAllByRole('menuitem')
    items[0].focus()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items[2]).toHaveFocus()
  })

  it('ArrowUp moves focus to the previous menuitem, wrapping at the start', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: EXPORT_TOGGLE }))
    const items = screen.getAllByRole('menuitem')
    items[1].focus()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(items[items.length - 1]).toHaveFocus()
  })

  it('Home and End jump to the first and last menuitem', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: EXPORT_TOGGLE }))
    const items = screen.getAllByRole('menuitem')
    items[2].focus()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(items[items.length - 1]).toHaveFocus()
  })

  it('Escape closes the export menu and restores focus to the toggle', async () => {
    render(<Toolbar />)
    const toggle = screen.getByRole('button', { name: EXPORT_TOGGLE })
    fireEvent.click(toggle)
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
    expect(toggle).toHaveFocus()
  })
})

describe('Toolbar a11y — dialogs', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('Escape on the Presets dialog closes it', async () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Presets' }))
    // The dialog is a lazy chunk; a busy test run can take over a second to load it.
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('Escape on the Export for AI dialog closes it', async () => {
    render(<Toolbar />)
    chooseMenuItem('Export', 'For AI…')
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('Presets dialog gets aria-modal=true and aria-labelledby pointing at its h2', async () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Presets' }))
    // The dialog is a lazy chunk; a busy test run can take over a second to load it.
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).not.toBeNull()
    expect(document.getElementById(labelledBy as string)?.tagName).toBe('H2')
  })

  it('Export for AI dialog gets aria-modal=true and aria-labelledby pointing at its h2', async () => {
    render(<Toolbar />)
    chooseMenuItem('Export', 'For AI…')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).not.toBeNull()
    expect(document.getElementById(labelledBy as string)?.tagName).toBe('H2')
  })
})

describe('Loading status', () => {
  beforeEach(async () => {
    await resetDatabase()
    useProjects.setState({
      records: [],
      trashed: [],
      currentId: null,
      current: null,
      loaded: false,
    })
    await useProjects.getState().saveCurrent()
  })

  it('the App loading text is a polite live region when projects are not loaded', () => {
    render(<App />)
    const status = document.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status).toHaveAttribute('aria-live', 'polite')
  })
})

describe('Toolbar — save status', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('shows Saved after create and Unsaved after an in-memory edit', () => {
    render(<Toolbar />)
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved')
    act(() => {
      useProjects.getState().updateCurrent((project) => ({ ...project, name: 'Dirty' }))
    })
    expect(screen.getByTestId('save-status')).toHaveTextContent('Unsaved')
  })

  it('shows Unsaved while a note is still being typed, though the project is saved (#92)', () => {
    render(<Toolbar />)
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved')
    let dirty = false
    let unregister = () => {}
    act(() => {
      unregister = registerPendingEdit({ isDirty: () => dirty, flush: () => (dirty = false) })
      dirty = true
      notifyPendingEdits()
    })
    expect(screen.getByTestId('save-status')).toHaveTextContent('Unsaved')
    act(() => unregister())
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved')
  })

  it('shows Save failed when saveStatus is error', () => {
    useProjects.setState({ saveStatus: 'error', saveError: 'storage quota exceeded' })
    render(<Toolbar />)
    const status = screen.getByTestId('save-status')
    expect(status).toHaveTextContent('Save failed')
    expect(status).toHaveClass('save-status-error')
  })
})

describe('Toolbar — connection status', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('updates the polite status badge for offline and online events', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
    render(<Toolbar />)
    const status = screen.getByTestId('connection-status')

    expect(status).toHaveTextContent('Online')
    expect(status).toHaveAttribute('role', 'status')
    expect(status).toHaveAttribute('aria-live', 'polite')

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(status).toHaveTextContent('Offline (changes stay on this device)')

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(status).toHaveTextContent('Online')
  })
})

describe('Toolbar — inline project rename', () => {
  beforeEach(async () => {
    await setupProject()
  })

  function nameInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>('input.toolbar-project-name-input')
    expect(input).not.toBeNull()
    return input!
  }

  it('shows the project name as a button that opens the rename input', () => {
    render(<Toolbar />)
    const nameButton = screen.getByRole('button', { name: 'A11y test' })
    fireEvent.click(nameButton)
    const input = nameInput()
    expect(input.value).toBe('A11y test')
    expect(input).toHaveFocus()
  })

  it('commits on Enter and persists the new name', async () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'A11y test' }))
    const input = nameInput()
    fireEvent.change(input, { target: { value: 'Renamed app' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(useProjects.getState().current?.name).toBe('Renamed app')
    })
    expect(screen.getByRole('button', { name: 'Renamed app' })).toBeTruthy()
    expect(useProjects.getState().current?.map.title).toBe('Renamed app')
  })

  it('commits on blur', async () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'A11y test' }))
    const input = nameInput()
    fireEvent.change(input, { target: { value: 'Blurred name' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(useProjects.getState().current?.name).toBe('Blurred name')
    })
  })

  it('Escape cancels without renaming', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'A11y test' }))
    const input = nameInput()
    fireEvent.change(input, { target: { value: 'Never saved' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.querySelector('input.toolbar-project-name-input')).toBeNull()
    expect(useProjects.getState().current?.name).toBe('A11y test')
  })
})

describe('Toolbar — snapshots', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('saves, lists, and deletes a named snapshot', async () => {
    render(<ToolbarWithPrompt />)

    chooseMenuItem('Project', 'Save snapshot…')
    answerPrompt('Toolbar snapshot')
    await waitFor(() => {
      expect(useProjects.getState().snapshots.map((snapshot) => snapshot.name)).toEqual([
        'Toolbar snapshot',
      ])
    })

    chooseMenuItem('Project', 'Snapshots (1)…')
    expect(await screen.findByText('Toolbar snapshot')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Toolbar snapshot' }))
    // Deleting asks first (#98).
    const confirm = await screen.findByRole('dialog', { name: 'Delete snapshot' })
    expect(useProjects.getState().snapshots).toHaveLength(1)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(useProjects.getState().snapshots).toEqual([])
    })
  })
})

describe('Toolbar — Save As', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('prefills the dialog, saves a named fork, switches to it, and announces it', async () => {
    render(<ToolbarWithPrompt />)

    chooseMenuItem('Project', 'Save As…')

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name for the copy' })
    expect(input.value).toBe('A11y test (Copy)')
    expect(input).toHaveFocus()
    answerPrompt('Forked project')
    await waitFor(() => {
      expect(useProjects.getState().current?.name).toBe('Forked project')
    })
    expect(useToast.getState().message).toBe('Saved as "Forked project"')
    expect(screen.queryByTestId('prompt-dialog')).toBeNull()
  })

  it('explains empty and overlong names in the dialog instead of saving (#77)', async () => {
    render(<ToolbarWithPrompt />)
    chooseMenuItem('Project', 'Save As…')
    const input = screen.getByRole('textbox', { name: 'Name for the copy' })

    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(screen.getByTestId('prompt-dialog-accept'))
    expect(screen.getByTestId('prompt-dialog')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'x'.repeat(201) } })
    expect(screen.getByRole('alert')).toHaveTextContent('Use at most 200 characters (now 201).')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('prompt-dialog')).toBeNull()
    expect(useProjects.getState().current?.name).toBe('A11y test')
    expect(useProjects.getState().records).toHaveLength(1)
  })
})

describe('Toolbar — transient dialog state', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('does not survive a project switch', async () => {
    render(<App />)
    await waitFor(() => expect(document.getElementById('tab-panel')).not.toBeNull())

    act(() => useUi.getState().setRenamingProject(true))
    await waitFor(() => {
      expect(document.querySelector('input.toolbar-project-name-input')).not.toBeNull()
    })

    const first = useProjects.getState().currentId
    await act(async () => {
      await useProjects.getState().createProject('Second project')
    })

    expect(useProjects.getState().currentId).not.toBe(first)
    expect(useUi.getState().renamingProject).toBe(false)
    await waitFor(() => {
      expect(document.querySelector('input.toolbar-project-name-input')).toBeNull()
    })
  })

  it('an open project-rename input blocks node shortcuts — the failure this guards', async () => {
    render(<App />)
    await act(async () => {
      useEditor.getState().setView('brainstorm')
    })
    await waitFor(() => expect(screen.getByTestId('brainstorm-outliner')).toBeTruthy())

    const rootId = useProjects.getState().current!.brainstorm.id
    act(() => useEditor.getState().select(rootId))

    // Baseline: F2 reaches the outliner when nothing is focused.
    pressKey('F2')
    expect(useEditor.getState().editing).toBe(rootId)
    act(() => useEditor.getState().setEditing(null))

    // With a rename input focused, every document-level handler bails on <input>.
    act(() => useUi.getState().setRenamingProject(true))
    await waitFor(() => {
      expect(document.querySelector('input.toolbar-project-name-input')).not.toBeNull()
    })
    pressKey('F2')
    expect(useEditor.getState().editing).toBeNull()
  })
})

describe('Toolbar — delete confirm', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('opens a themed dialog and cancel leaves the project', () => {
    render(<Toolbar />)
    chooseMenuItem('Project', 'Move to trash…')
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Delete "A11y test"?')
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('project moves to trash')
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('restored from the home screen')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    expect(useProjects.getState().current?.name).toBe('A11y test')
  })

  it('confirming removes the project', async () => {
    render(<Toolbar />)
    const id = useProjects.getState().currentId
    chooseMenuItem('Project', 'Move to trash…')
    fireEvent.click(screen.getByTestId('confirm-dialog-accept'))
    await waitFor(() => {
      expect(useProjects.getState().currentId).not.toBe(id)
    })
    expect(useProjects.getState().current).toBeNull()
    expect(useProjects.getState().trashed.map((record) => record.id)).toContain(id)
  })
})

function ToolbarWithPrompt() {
  return (
    <>
      <Toolbar />
      <PromptHost />
    </>
  )
}

function answerPrompt(value: string) {
  const dialog = screen.getByTestId('prompt-dialog')
  const input = dialog.querySelector('input')!
  fireEvent.change(input, { target: { value } })
  fireEvent.click(screen.getByTestId('prompt-dialog-accept'))
}

function chooseMenuItem(menu: 'Project' | 'Export', item: string) {
  fireEvent.click(screen.getByRole('button', { name: `${menu} ▾` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

describe('Toolbar — grouped menus (#76)', () => {
  beforeEach(async () => {
    await setupProject()
  })

  it('puts project actions in Project ▾, in order', () => {
    render(<Toolbar />)
    for (const gone of ['New', 'Save', 'Save As…', 'Save snapshot', 'Duplicate', 'Delete']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull()
    }
    expect(screen.queryByRole('combobox', { name: 'Open' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Project ▾' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'New project',
      'Open…',
      'Save',
      'Save As…',
      'Save snapshot…',
      'Snapshots (0)…',
      'Sync folder…',
      'Save milestone to GitHub…',
      'Duplicate',
      'Move to trash…',
    ])
  })

  it('Open… opens the command palette filtered to projects', () => {
    render(<Toolbar />)
    chooseMenuItem('Project', 'Open…')
    expect(useUi.getState().paletteOpen).toBe(true)
    expect(useUi.getState().paletteQuery).toBe('Open “')
  })

  it('Export ▾ ends with For AI…, replacing the separate button', () => {
    render(<Toolbar />)
    expect(screen.queryByRole('button', { name: /Export for ai/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }))
    const items = screen.getAllByRole('menuitem')
    expect(items[items.length - 1]).toHaveTextContent('For AI…')
  })

  it('the narrow-screen ⋯ button expands the collapsed actions', () => {
    const { container } = render(<Toolbar />)
    const more = screen.getByRole('button', { name: 'More actions' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    const controlled = document.getElementById(more.getAttribute('aria-controls')!)
    expect(controlled).toContainElement(screen.getByRole('button', { name: 'Project ▾' }))
    fireEvent.click(more)
    expect(screen.getByRole('button', { name: 'Fewer actions' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(container.querySelector('header')).toHaveClass('toolbar-more-open')
  })

  it('shows save state as a badge', () => {
    render(<Toolbar />)
    const badge = screen.getByTestId('save-status')
    expect(badge).toHaveClass('status-badge', 'save-status-saved')
    expect(badge).toHaveTextContent('Saved')
  })
})

describe('Toolbar — details panel toggle (#144)', () => {
  beforeEach(async () => {
    await setupProject()
    useUi.getState().setDetailsPanel('shown')
  })

  afterEach(() => {
    localStorage.removeItem('mms.detailsPanel')
  })

  it('the Details button toggles the panel and reports it with aria-pressed', () => {
    render(<Toolbar />)
    const toggle = screen.getByRole('button', { name: 'Details' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(useUi.getState().detailsPanel).toBe('hidden')
    fireEvent.click(toggle)
    expect(useUi.getState().detailsPanel).toBe('shown')
  })
})
