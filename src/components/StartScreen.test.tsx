import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjects } from '../store/projects'
import { resetDatabase } from '../test/resetDb'
import { StartScreen } from './StartScreen'

beforeEach(async () => {
  await resetDatabase()
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await useProjects.getState().createProject('First project')
  await useProjects.getState().createProject('Second project')
  useProjects.setState({ currentId: null, current: null })
})

describe('StartScreen — per-row rename', () => {
  function renameInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>('input.project-rename-input')
    expect(input).not.toBeNull()
    return input!
  }

  it('every row has an open button and a labelled rename trigger', () => {
    render(<StartScreen />)
    expect(screen.getByRole('button', { name: 'First project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Second project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename First project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename Second project' })).toBeTruthy()
  })

  it('renames a project from the home list without opening it', async () => {
    render(<StartScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename First project' }))
    const input = renameInput()
    expect(input.value).toBe('First project')
    fireEvent.change(input, { target: { value: 'First renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      const names = useProjects
        .getState()
        .records.map((r) => r.project.name)
        .sort()
      expect(names).toEqual(['First renamed', 'Second project'])
    })
    expect(useProjects.getState().currentId).toBeNull()
    expect(useProjects.getState().current).toBeNull()
  })

  it('Escape cancels the rename and keeps the row', () => {
    render(<StartScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename Second project' }))
    const input = renameInput()
    fireEvent.change(input, { target: { value: 'Never saved' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.querySelector('input.project-rename-input')).toBeNull()
    expect(screen.getByRole('button', { name: 'Second project' })).toBeTruthy()
    expect(useProjects.getState().records.map((r) => r.project.name)).toContain('Second project')
  })

  it('clicking the row name still opens the project', async () => {
    render(<StartScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Second project' }))
    await waitFor(() => {
      expect(useProjects.getState().currentId).not.toBeNull()
    })
    expect(useProjects.getState().current?.name).toBe('Second project')
  })

  it('pins a row and keeps it first in the home list', async () => {
    render(<StartScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Pin First project' }))
    await waitFor(() => {
      expect(useProjects.getState().records[0].project.name).toBe('First project')
      expect(screen.getByRole('button', { name: 'Unpin First project' })).toBeTruthy()
    })
  })

  it('adds, filters, and removes a tag without opening the project', async () => {
    render(<StartScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Add tag to First project' }))
    const input = screen.getByRole('textbox', { name: 'New tag for First project' })
    fireEvent.change(input, { target: { value: 'Planning' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Filter by tag Planning' })).toHaveLength(2),
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Filter by tag Planning' })[0])
    expect(screen.getByRole('button', { name: 'First project' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Second project' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Planning from First project' }))
    await waitFor(() =>
      expect(
        useProjects.getState().records.find((r) => r.project.name === 'First project')?.project
          .tags,
      ).toBeUndefined(),
    )
    expect(useProjects.getState().currentId).toBeNull()
  })

  it('shows trash and restores a project to Recent projects', async () => {
    const firstId = useProjects
      .getState()
      .records.find((record) => record.project.name === 'First project')!.id
    await useProjects.getState().remove(firstId)

    render(<StartScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Trash (1)' }))
    // The Trash dialog is a lazily loaded chunk (#88).
    expect(await screen.findByTestId('trash-dialog')).toHaveTextContent('First project')
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First project' })).toBeInTheDocument()
    })
    expect(useProjects.getState().trashed).toHaveLength(0)
  })
})

function idOf(name: string): string {
  return useProjects.getState().records.find((record) => record.project.name === name)!.id
}

describe('StartScreen — actions and guide (#78)', () => {
  it('offers new, import and the guide, and says files can be dropped', () => {
    render(<StartScreen />)
    expect(screen.getByRole('button', { name: 'Start a new project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import or restore…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try the guide · 入门指南' })).toBeInTheDocument()
    expect(screen.getByText(/drop a project \(\.json\)/)).toBeInTheDocument()
    expect(screen.queryByTestId('start-empty')).toBeNull()
  })

  it('explains the empty library', async () => {
    await useProjects.getState().remove(idOf('First project'))
    await useProjects.getState().remove(idOf('Second project'))
    render(<StartScreen />)
    expect(screen.getByTestId('start-empty')).toHaveTextContent('No projects yet.')
    expect(screen.queryByRole('heading', { name: 'Recent projects' })).toBeNull()
  })

  it('"Try the guide" opens the bilingual guide as a new project', async () => {
    render(<StartScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Try the guide · 入门指南' }))
    await waitFor(() =>
      expect(useProjects.getState().current?.name).toBe('Getting started · 入门指南'),
    )
    const map = useProjects.getState().current!.map
    expect(map.children?.map((child) => child.title)).toContain('Build the map · 编辑导图')
    expect(useProjects.getState().records).toHaveLength(3)
  })
})

describe('StartScreen — per-project menu (#78)', () => {
  const openMenu = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: `More actions for ${name}` }))
    return screen.getByRole('menu', { name: `Actions for ${name}` })
  }

  it('lists the actions, moves with the arrow keys and closes on Escape', () => {
    render(<StartScreen />)
    const trigger = screen.getByRole('button', { name: 'More actions for First project' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    const menu = openMenu('First project')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual(['Open', 'Rename', 'Duplicate', 'Export JSON', 'Move to trash'])
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Move to trash' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('Open opens the project', async () => {
    render(<StartScreen />)
    openMenu('Second project')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }))
    await waitFor(() => expect(useProjects.getState().current?.name).toBe('Second project'))
  })

  it('Rename starts the inline rename', () => {
    render(<StartScreen />)
    openMenu('First project')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(document.querySelector<HTMLInputElement>('input.project-rename-input')?.value).toBe(
      'First project',
    )
  })

  it('Duplicate adds a copy without opening it', async () => {
    render(<StartScreen />)
    openMenu('First project')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(await screen.findByRole('button', { name: 'First project (copy)' })).toBeInTheDocument()
    expect(useProjects.getState().currentId).toBeNull()
  })

  it('Move to trash asks first, then moves it', async () => {
    const id = idOf('First project')
    render(<StartScreen />)
    openMenu('First project')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }))
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent(
      'Move "First project" to the trash? You can restore it from Trash for 30 days.',
    )
    fireEvent.click(screen.getByTestId('confirm-dialog-accept'))
    await waitFor(() =>
      expect(useProjects.getState().trashed.map((record) => record.id)).toEqual([id]),
    )
    expect(screen.queryByRole('button', { name: 'First project' })).toBeNull()
  })
})

describe('StartScreen — language (#89)', () => {
  it('switches the interface to Simplified Chinese and back', async () => {
    const { useLocale } = await import('../i18n')
    render(<StartScreen />)
    fireEvent.change(screen.getByRole('combobox', { name: /Language/ }), {
      target: { value: 'zh-CN' },
    })
    expect(await screen.findByRole('button', { name: '新建项目' })).toBeInTheDocument()
    expect(useLocale.getState().locale).toBe('zh-CN')
    expect(screen.getByRole('heading', { name: '最近的项目' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: /语言/ }), { target: { value: 'en' } })
    expect(await screen.findByRole('button', { name: 'Start a new project' })).toBeInTheDocument()
  })
})

describe('StartScreen — search (#103)', () => {
  it('filters the list, says when nothing matches, and clears', async () => {
    render(<StartScreen />)
    const search = screen.getByRole('searchbox', { name: 'Search projects' })
    fireEvent.change(search, { target: { value: 'second' } })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'First project' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Second project' })).toBeTruthy()

    fireEvent.change(search, { target: { value: 'zebra' } })
    expect(await screen.findByTestId('project-search-empty')).toHaveTextContent('“zebra”')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'First project' })).toBeTruthy())
  })

  it('"/" focuses the search box and Escape clears it', () => {
    render(<StartScreen />)
    fireEvent.keyDown(document.body, { key: '/' })
    const search = screen.getByRole('searchbox', { name: 'Search projects' })
    expect(search).toHaveFocus()
    fireEvent.change(search, { target: { value: 'x' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveValue('')
  })
})
