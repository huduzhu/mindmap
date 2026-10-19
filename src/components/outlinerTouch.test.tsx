import 'fake-indexeddb/auto'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TreeNode } from '../schema/types'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { BrainstormOutliner } from './BrainstormOutliner'
import { OutlineView } from './OutlineView'

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

const shape = (node: TreeNode): unknown =>
  node.children?.length ? { [node.title]: node.children.map(shape) } : node.title
const brainstorm = () => shape(useProjects.getState().current!.brainstorm)
const map = () => shape(useProjects.getState().current!.map)

beforeEach(async () => {
  // jsdom has no layout: "On map" reveals the row, which scrolls it into view.
  Element.prototype.scrollIntoView ??= () => undefined
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
  await useProjects.getState().createProject('Touch outliner')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    brainstorm: makeTree('b', 'Ideas', [
      makeTree('one', 'One'),
      makeTree('two', 'Two'),
      makeTree('three', 'Three'),
    ]),
    map: makeTree('m', 'Central', [makeTree('x', 'X'), makeTree('y', 'Y')]),
  }))
})

afterEach(() => {
  window.matchMedia = original
})

const bar = () => screen.getByRole('toolbar', { name: 'Idea actions' })

describe('Brainstorm on touch (#95)', () => {
  it('shows no row buttons for a mouse, and a click still renames', () => {
    pointer(false)
    useEditor.getState().setView('brainstorm')
    render(<BrainstormOutliner />)
    fireEvent.click(screen.getByText('Two'))
    expect(screen.queryByTestId('outliner-touch-bar')).toBeNull()
    expect(useEditor.getState().editing).toBe('two')
  })

  it('first tap selects and shows the buttons; a second tap renames', () => {
    pointer(true)
    useEditor.getState().setView('brainstorm')
    render(<BrainstormOutliner />)
    fireEvent.click(screen.getByText('Two'))
    expect(useEditor.getState().selection).toBe('two')
    expect(useEditor.getState().editing).toBeNull()
    expect(bar()).toBeInTheDocument()
    fireEvent.click(screen.getByText('Two'))
    expect(useEditor.getState().editing).toBe('two')
    expect(screen.queryByTestId('outliner-touch-bar')).toBeNull()
  })

  it('indents, outdents and reorders with the buttons, one undo step each', () => {
    pointer(true)
    useEditor.getState().setView('brainstorm')
    render(<BrainstormOutliner />)
    fireEvent.click(screen.getByText('Two'))

    fireEvent.click(within(bar()).getByRole('button', { name: 'Indent Two under the idea above' }))
    expect(brainstorm()).toEqual({ Ideas: [{ One: ['Two'] }, 'Three'] })
    fireEvent.click(within(bar()).getByRole('button', { name: 'Outdent Two' }))
    expect(brainstorm()).toEqual({ Ideas: ['One', 'Two', 'Three'] })

    fireEvent.click(within(bar()).getByRole('button', { name: 'Move Two up' }))
    expect(brainstorm()).toEqual({ Ideas: ['Two', 'One', 'Three'] })
    expect(within(bar()).getByRole('button', { name: 'Move Two up' })).toBeDisabled()
    expect(
      within(bar()).getByRole('button', { name: 'Indent Two under the idea above' }),
    ).toBeDisabled()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Move Two down' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Move Two down' }))
    expect(brainstorm()).toEqual({ Ideas: ['One', 'Three', 'Two'] })
    expect(within(bar()).getByRole('button', { name: 'Move Two down' })).toBeDisabled()

    useEditor.getState().undo()
    expect(brainstorm()).toEqual({ Ideas: ['One', 'Two', 'Three'] })
  })

  it('adds after the row and deletes it, selecting the row above', () => {
    pointer(true)
    useEditor.getState().setView('brainstorm')
    render(<BrainstormOutliner />)
    fireEvent.click(screen.getByText('Three'))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Delete Three' }))
    expect(brainstorm()).toEqual({ Ideas: ['One', 'Two'] })
    expect(useEditor.getState().selection).toBe('two')

    fireEvent.click(within(bar()).getByRole('button', { name: 'Add an idea after Two' }))
    expect(useEditor.getState().editing).not.toBeNull()
    expect(useProjects.getState().current!.brainstorm.children).toHaveLength(3)
  })

  it('the root row offers only Add and Rename', () => {
    pointer(true)
    useEditor.getState().setView('brainstorm')
    render(<BrainstormOutliner />)
    const buttons = within(bar()).getAllByRole('button')
    expect(buttons.map((b) => b.dataset.testid)).toEqual(['row-action-add', 'row-action-rename'])
  })

  it('Alt+↑/↓ reorders from the keyboard too', () => {
    pointer(false)
    useEditor.getState().setView('brainstorm')
    render(<BrainstormOutliner />)
    useEditor.getState().select('one')
    fireEvent.keyDown(document.body, { key: 'ArrowDown', altKey: true })
    expect(brainstorm()).toEqual({ Ideas: ['Two', 'One', 'Three'] })
    expect(useEditor.getState().selection).toBe('one')
  })
})

describe('Outline on touch (#95)', () => {
  it('restructures the map and shows a row on the map', () => {
    pointer(true)
    useEditor.getState().setView('outline')
    render(<OutlineView />)
    fireEvent.click(screen.getByText('Y'))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Indent Y under the idea above' }))
    expect(map()).toEqual({ Central: [{ X: ['Y'] }] })

    fireEvent.click(within(bar()).getByRole('button', { name: 'Show Y on the map' }))
    expect(useEditor.getState().view).toBe('map')
    expect(useEditor.getState().selection).toBe('y')
    expect(useEditor.getState().revealId).toBe('y')
  })
})
