import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { useEditor } from './store/editor'
import { useProjects } from './store/projects'
import { resetDatabase } from './test/resetDb'
import { loadBrainstormOutliner, loadOutlineView } from './components/lazyParts'

// Both views are lazily loaded chunks (#141).
beforeAll(async () => {
  await Promise.all([loadBrainstormOutliner(), loadOutlineView()])
})

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  useEditor.getState().reset()
  await resetDatabase()
})

describe('split view', () => {
  it('renders Brainstorm and Outline in independent panes', async () => {
    await useProjects.getState().createProject('Split test')
    render(<App />)

    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Split view' }))

    expect(screen.getByTestId('split-view')).toBeInTheDocument()
    expect(screen.getByTestId('split-brainstorm-pane')).toContainElement(
      await screen.findByTestId('brainstorm-outliner'),
    )
    expect(screen.getByTestId('split-outline-pane')).toContainElement(
      screen.getByTestId('outline-view'),
    )
    expect(screen.getByTestId('split-brainstorm-pane')).toHaveClass('split-pane')
    expect(screen.getByTestId('split-outline-pane')).toHaveClass('split-pane')
  })

  it('routes edits from each pane to its own tree', async () => {
    await useProjects.getState().createProject('Split test')
    render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Split view' }))
    await screen.findByTestId('brainstorm-outliner')
    await screen.findByTestId('outline-view')

    fireEvent.click(withinTestId('brainstorm-outliner', 'brainstorm-add'))
    fireEvent.click(withinTestId('outline-view', 'outline-add'))

    const project = useProjects.getState().current!
    expect(project.brainstorm.children?.map((node) => node.title)).toEqual(['New idea'])
    expect(project.map.children?.map((node) => node.title)).toEqual(['New idea'])
    expect(useEditor.getState().activeSection).toBe('map')
  })
})

function withinTestId(parentTestId: string, childTestId: string) {
  return screen
    .getByTestId(parentTestId)
    .querySelector(`[data-testid="${childTestId}"]`) as HTMLElement
}
