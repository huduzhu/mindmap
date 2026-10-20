import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { NodeDetailsDialog, NOTES_COMMIT_DELAY_MS } from './NodeDetailsDialog'
import { hasPendingEdits } from '../store/pendingEdits'
import { useUi } from '../store/ui'
import { openNotes, toggleDetailsPanel } from './detailsPanel'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.setState({
    past: [],
    future: [],
    selection: null,
    editing: null,
    view: 'map',
    capturing: false,
    focusNotes: false,
  })
  useUi.getState().setDetailsPanel('shown')
  await resetDatabase()
})

async function setupMap() {
  await useProjects.getState().createProject('Dialog test')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m-root', 'Central', [
      makeTree('a', 'Idea A', [], { side: 'right' }),
      makeTree('b', 'Idea B', [], { side: 'left', notes: 'pre-existing notes' }),
      makeTree('c', 'Idea C', [makeTree('c1', 'Grandchild', [], { side: 'right' })]),
    ]),
  }))
  return render(<NodeDetailsDialog />)
}

async function setupBrainstorm() {
  await useProjects.getState().createProject('Brainstorm dialog test')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    brainstorm: makeTree('b-root', 'Ideas', [makeTree('idea-1', 'Idea one')]),
  }))
  useEditor.getState().setView('brainstorm')
  return render(<NodeDetailsDialog />)
}

async function setupOutline() {
  await useProjects.getState().createProject('Outline dialog test')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m-root', 'Central', [makeTree('a', 'Idea A')]),
  }))
  useEditor.getState().setView('outline')
  return render(<NodeDetailsDialog />)
}

function getProjectMap() {
  const project = useProjects.getState().current
  if (!project) throw new Error('no project')
  return project.map
}

function getProjectBrainstorm() {
  const project = useProjects.getState().current
  if (!project) throw new Error('no project')
  return project.brainstorm
}

describe('NodeDetailsDialog', () => {
  it('renders nothing when there is no selection', async () => {
    await setupMap()
    expect(screen.queryByTestId('node-details')).not.toBeInTheDocument()
  })

  it('stays in place, dimmed and inert, while the selected node is renamed (#144)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const panel = screen.getByTestId('node-details')
    act(() => useEditor.getState().setEditing('a'))
    // The same element: not unmounted and remounted around the rename.
    expect(screen.getByTestId('node-details')).toBe(panel)
    expect(panel).toHaveClass('node-details-inactive')
    expect(panel).toHaveAttribute('inert')
    act(() => useEditor.getState().setEditing(null))
    expect(panel).not.toHaveClass('node-details-inactive')
    expect(panel).not.toHaveAttribute('inert')
  })

  it('commits a typed note when a rename moves the selection to a new node (#92, #144)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    fireEvent.change(screen.getByTestId('node-details-notes'), { target: { value: 'draft on A' } })
    // Tab/Enter select the new node and start naming it in one go.
    act(() => {
      useEditor.getState().select('b')
      useEditor.getState().setEditing('b')
    })
    expect(getProjectMap().children![0].notes).toBe('draft on A')
    expect(screen.getByTestId('node-details-title').textContent).toBe('Idea B')
    expect(screen.getByTestId('node-details')).toHaveAttribute('inert')
    expect(hasPendingEdits()).toBe(false)
  })

  it('renders nothing while the panel is hidden, and remembers it (#144)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    act(() => toggleDetailsPanel())
    expect(screen.queryByTestId('node-details')).not.toBeInTheDocument()
    expect(useUi.getState().detailsPanel).toBe('hidden')
    expect(localStorage.getItem('mms.detailsPanel')).toBe('hidden')
    act(() => toggleDetailsPanel())
    expect(screen.getByTestId('node-details')).toBeInTheDocument()
    expect(localStorage.getItem('mms.detailsPanel')).toBe('shown')
  })

  it('opening the notes shows a hidden panel and focuses the notes box (#144)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    act(() => useUi.getState().setDetailsPanel('hidden'))
    expect(screen.queryByTestId('node-details')).not.toBeInTheDocument()
    act(() => openNotes())
    expect(useUi.getState().detailsPanel).toBe('shown')
    expect(screen.getByTestId('node-details-notes')).toHaveFocus()
    expect(useEditor.getState().focusNotes).toBe(false)
  })

  it('renders the section label, title, and notes textarea when a map node is selected', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    expect(screen.getByTestId('node-details')).toBeInTheDocument()
    expect(screen.getByTestId('node-details-title').textContent).toBe('Idea A')
    expect(screen.getByTestId('node-details-notes')).toBeInTheDocument()
    expect(screen.getByTestId('node-details-role')).toBeInTheDocument()
    expect(screen.getByTestId('node-details-side')).toBeInTheDocument()
  })

  it('hydrates the notes textarea from the existing notes value', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    expect(textarea.value).toBe('pre-existing notes')
  })

  it('saves notes through applyTree on textarea blur', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'remember to follow up' } })
    fireEvent.blur(textarea)

    expect(getProjectMap().children![0].notes).toBe('remember to follow up')
    // applyTree records one undo entry per save
    expect(useEditor.getState().past).toHaveLength(1)
  })

  it("caps typed or pasted notes at the schema's 20,000 characters", async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    expect(textarea.maxLength).toBe(20000)
    fireEvent.change(textarea, { target: { value: 'n'.repeat(25000) } })
    fireEvent.blur(textarea)
    expect(getProjectMap().children![0].notes).toHaveLength(20000)
  })

  it('saves notes after a pause in typing, without leaving the box (#92)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'typed and left alone' } })
    expect(getProjectMap().children![0].notes).toBeUndefined()
    expect(useProjects.getState().hasUnsavedChanges()).toBe(true)

    await act(() => new Promise((resolve) => setTimeout(resolve, NOTES_COMMIT_DELAY_MS + 100)))
    expect(getProjectMap().children![0].notes).toBe('typed and left alone')
    expect(useEditor.getState().past).toHaveLength(1)
    expect(hasPendingEdits()).toBe(false)
  })

  it('commits a typed note when the page is left before the pause (#92)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'closing the tab now' } })
    expect(hasPendingEdits()).toBe(true)

    await act(() => useProjects.getState().saveCurrent())
    expect(getProjectMap().children![0].notes).toBe('closing the tab now')
    expect(hasPendingEdits()).toBe(false)
    expect(useProjects.getState().hasUnsavedChanges()).toBe(false)
  })

  it('clears notes when the textarea is emptied', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '' } })
    fireEvent.blur(textarea)

    expect(getProjectMap().children![1].notes).toBeUndefined()
  })

  it('commits a half-typed draft when the selection changes to another node', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'mid-edit on A' } })

    // Switch selection without blurring the textarea — map nodes are not focusable, so blur
    // would not fire on its own. The useEffect cleanup has to capture the draft.
    act(() => useEditor.getState().select('b'))

    expect(getProjectMap().children![0].notes).toBe('mid-edit on A')
    // The new selection's notes textarea should now show B's notes, not the stale draft.
    expect((screen.getByTestId('node-details-notes') as HTMLTextAreaElement).value).toBe(
      'pre-existing notes',
    )
  })

  it('blur then selection change records exactly one undo entry (#45)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'once' } })
    fireEvent.blur(textarea)
    act(() => useEditor.getState().select('b'))

    expect(useEditor.getState().past).toHaveLength(1)
    act(() => useEditor.getState().undo())
    expect(getProjectMap().children![0].notes).toBeUndefined()
  })

  it('undo on the same node updates the textarea and is not re-committed (#45)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'edited' } })
    fireEvent.blur(textarea)
    expect(getProjectMap().children![1].notes).toBe('edited')

    act(() => useEditor.getState().undo())
    expect(textarea.value).toBe('pre-existing notes')
    fireEvent.blur(textarea)
    act(() => useEditor.getState().select('a'))
    expect(getProjectMap().children![1].notes).toBe('pre-existing notes')
    expect(useEditor.getState().future).toHaveLength(1)
  })

  it('× hides the panel, keeps the selection and saves the draft (#144)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'saving on close' } })

    // × hides the panel; the unmount cleanup commits the draft.
    fireEvent.click(screen.getByRole('button', { name: /close details/i }))

    expect(getProjectMap().children![0].notes).toBe('saving on close')
    expect(screen.queryByTestId('node-details')).not.toBeInTheDocument()
    expect(useEditor.getState().selection).toBe('a')
    expect(useUi.getState().detailsPanel).toBe('hidden')
  })

  it('does not commit when the draft is identical to the existing notes', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    // Touch the draft to a different value, then back to the original — no commit on the return.
    fireEvent.change(textarea, { target: { value: 'temp' } })
    fireEvent.change(textarea, { target: { value: 'pre-existing notes' } })
    fireEvent.blur(textarea)

    expect(useEditor.getState().past).toHaveLength(0)
    expect(getProjectMap().children![1].notes).toBe('pre-existing notes')
  })

  it('role select is disabled for the root node', async () => {
    await setupMap()
    act(() => useEditor.getState().select('m-root'))
    const role = screen.getByTestId('node-details-role') as HTMLSelectElement
    expect(role.disabled).toBe(true)
  })

  it('groups the roles into structure and kinds of idea (live test, item 1)', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const role = screen.getByTestId('node-details-role') as HTMLSelectElement
    const groups = [...role.querySelectorAll('optgroup')].map((group) => [
      group.label,
      [...group.querySelectorAll('option')].map((option) => option.value),
    ])
    expect(groups).toEqual([
      ['Structure', ['theme', 'main-branch', 'branch', 'leaf']],
      ['Kind of idea', ['task', 'idea', 'question', 'risk']],
    ])
  })

  it('role change writes through applyTree and produces an undo entry', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const role = screen.getByTestId('node-details-role') as HTMLSelectElement
    fireEvent.change(role, { target: { value: 'leaf' } })

    expect(getProjectMap().children![0].role).toBe('leaf')
    expect(useEditor.getState().past).toHaveLength(1)
  })

  it('role change to None clears the role', async () => {
    await setupMap()
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('m-root', 'Central', [
        makeTree('a', 'Idea A', [], { side: 'right', role: 'task' }),
      ]),
    }))
    act(() => useEditor.getState().select('a'))
    const role = screen.getByTestId('node-details-role') as HTMLSelectElement
    fireEvent.change(role, { target: { value: '__none__' } })

    expect(getProjectMap().children![0].role).toBeUndefined()
  })

  it('side select is disabled for non-depth-1 map nodes', async () => {
    await setupMap()
    act(() => useEditor.getState().select('c1')) // grandchild, not depth-1
    const side = screen.getByTestId('node-details-side') as HTMLSelectElement
    expect(side.disabled).toBe(true)
  })

  it('side change writes through applyTree', async () => {
    await setupMap()
    act(() => useEditor.getState().select('a'))
    const side = screen.getByTestId('node-details-side') as HTMLSelectElement
    fireEvent.change(side, { target: { value: 'left' } })

    expect(getProjectMap().children![0].side).toBe('left')
    expect(useEditor.getState().past).toHaveLength(1)
  })

  it('side change to Auto clears the explicit side', async () => {
    await setupMap()
    act(() => useEditor.getState().select('b')) // already side: 'left'
    const side = screen.getByTestId('node-details-side') as HTMLSelectElement
    expect(side.value).toBe('left')
    fireEvent.change(side, { target: { value: '__auto__' } })

    expect(getProjectMap().children![1].side).toBeUndefined()
  })

  it('undo restores the previous role after a role change', async () => {
    await setupMap()
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('m-root', 'Central', [
        makeTree('a', 'Idea A', [], { side: 'right', role: 'task' }),
      ]),
    }))
    act(() => useEditor.getState().select('a'))
    const role = screen.getByTestId('node-details-role') as HTMLSelectElement
    fireEvent.change(role, { target: { value: 'leaf' } })
    expect(getProjectMap().children![0].role).toBe('leaf')

    act(() => useEditor.getState().undo())
    expect(getProjectMap().children![0].role).toBe('task')
  })

  it('hides role and side for the brainstorm section', async () => {
    await setupBrainstorm()
    act(() => useEditor.getState().select('idea-1'))
    expect(screen.getByTestId('node-details')).toBeInTheDocument()
    expect(screen.queryByTestId('node-details-role')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-details-side')).not.toBeInTheDocument()
    expect(screen.getByText(/Roles and sides are mind-map only/i)).toBeInTheDocument()
  })

  it('saves brainstorm notes through applyTree on blur', async () => {
    await setupBrainstorm()
    act(() => useEditor.getState().select('idea-1'))
    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'remember to test' } })
    fireEvent.blur(textarea)

    expect(getProjectBrainstorm().children![0].notes).toBe('remember to test')
  })

  it('locates Outline selections in project.map and focuses and saves their notes', async () => {
    await setupOutline()
    act(() => {
      useEditor.getState().select('a')
      useEditor.getState().setFocusNotes(true)
    })

    const textarea = screen.getByTestId('node-details-notes') as HTMLTextAreaElement
    expect(textarea).toHaveFocus()
    fireEvent.change(textarea, { target: { value: 'outline note' } })
    fireEvent.blur(textarea)

    expect(getProjectMap().children![0].notes).toBe('outline note')
  })

  it('uses role=region with aria-labelledby pointing at the title h3', async () => {
    await setupMap()
    act(() => {
      useEditor.getState().reset()
      useEditor.getState().select('a')
    })
    const panel = screen.getByTestId('node-details')
    expect(panel).toHaveAttribute('role', 'region')
    const labelledBy = panel.getAttribute('aria-labelledby')
    expect(labelledBy).not.toBeNull()
    const title = document.getElementById(labelledBy as string)
    expect(title?.tagName).toBe('H3')
    expect(title?.textContent).toBe('Idea A')
  })

  it('does not autofocus the notes textarea on plain selection (Batch 16, #5)', async () => {
    await setupMap()
    act(() => {
      useEditor.getState().reset()
      useEditor.getState().select('a')
    })
    // The old autoFocus remounted on every selection change and stole keys that should
    // have been canvas shortcuts; the panel now opens without taking focus.
    expect(screen.getByTestId('node-details-notes')).not.toHaveFocus()
  })

  it('focuses the notes textarea only when opened through the explicit notes affordance', async () => {
    await setupMap()
    act(() => {
      useEditor.getState().reset()
      useEditor.getState().select('a')
      useEditor.getState().setFocusNotes(true)
    })
    expect(screen.getByTestId('node-details-notes')).toHaveFocus()
    // The flag is consumed once — a later plain selection does not refocus the textarea.
    expect(useEditor.getState().focusNotes).toBe(false)
  })
})
