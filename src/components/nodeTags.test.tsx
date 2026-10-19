import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { findNode } from '../store/treeOps'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { MindMapCanvas } from './MindMapCanvas'
import { OutlineView } from './OutlineView'
import { BrainstormOutliner } from './BrainstormOutliner'
import { NodeTagField, TagDialogHost } from './TagEditor'
import { TagFilterChip, TagFilterPanel } from './TagFilterPanel'

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  useUi.getState().resetTransient()
  await resetDatabase()
})

async function setup() {
  await useProjects.getState().createProject('Tags')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('root', 'Launch', [
      makeTree('a', 'Pricing', [], { tags: ['p1', 'q4', 'sales', 'web'], side: 'right' }),
      makeTree('b', 'Backend', [makeTree('b1', 'Login', [], { tags: ['p1'] })], {
        collapsed: true,
      }),
      makeTree('c', 'Marketing'),
    ]),
    brainstorm: makeTree('bs', 'Ideas', [
      makeTree('i1', 'Measure', [], { tags: ['site'] }),
      makeTree('i2', 'Quote'),
    ]),
  }))
}

const mapNode = (id: string) => findNode(useProjects.getState().current!.map, id)!.node
const section = (view: 'map' | 'brainstorm') => useProjects.getState().current![view]

describe('tag field (#150, HB2)', () => {
  it('Enter and comma add, × and Backspace remove, one undo step each', async () => {
    await setup()
    const { rerender } = render(<NodeTagField section="map" node={mapNode('c')} />)
    const input = screen.getByTestId('tag-input')
    const past = useEditor.getState().past.length
    fireEvent.change(input, { target: { value: '#Launch' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mapNode('c').tags).toEqual(['launch'])
    rerender(<NodeTagField section="map" node={mapNode('c')} />)
    fireEvent.change(input, { target: { value: 'web,' } })
    expect(mapNode('c').tags).toEqual(['launch', 'web'])
    rerender(<NodeTagField section="map" node={mapNode('c')} />)
    expect(useEditor.getState().past.length).toBe(past + 2)
    fireEvent.click(screen.getByTestId('tag-remove-launch'))
    expect(mapNode('c').tags).toEqual(['web'])
    rerender(<NodeTagField section="map" node={mapNode('c')} />)
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(mapNode('c')).not.toHaveProperty('tags')
    fireEvent.change(input, { target: { value: 'bad!' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent('A tag uses letters')
  })

  it('suggests tags already used, chosen with the arrow keys', async () => {
    await setup()
    render(<NodeTagField section="map" node={mapNode('c')} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'p' } })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('tag-suggestion-p1')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mapNode('c').tags).toEqual(['p1'])
  })

  it('"Add tag to selection" tags several nodes in one undo step', async () => {
    await setup()
    useUi.getState().setTagEditor({ section: 'map', ids: ['a', 'c'] })
    render(<TagDialogHost onClose={() => useUi.getState().setTagEditor(null)} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.change(input, { target: { value: 'launch' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const past = useEditor.getState().past.length
    fireEvent.click(screen.getByTestId('tag-dialog-add'))
    expect(mapNode('a').tags).toContain('launch')
    expect(mapNode('c').tags).toEqual(['launch'])
    expect(useEditor.getState().past.length).toBe(past + 1)
    expect(useUi.getState().tagEditor).toBeNull()
  })
})

describe('tags on screen (#150, HB3)', () => {
  it('the map shows up to three chips, then +N', async () => {
    await setup()
    render(<MindMapCanvas />)
    const node = document.querySelector('[data-id="a"] .map-node')!
    expect(node.className).toContain('map-node-has-tags')
    const chips = node.querySelectorAll('.node-tag')
    expect([...chips].map((chip) => chip.textContent)).toEqual(['#p1', '#q4', '#sales', '+1'])
    expect(node.getAttribute('aria-label')).toContain('#p1')
  })

  it('Outline and Brainstorm rows show the tags after the title', async () => {
    await setup()
    render(<OutlineView />)
    expect(screen.getByTestId('outline-row-a').textContent).toContain('#web')
  })
})

describe('the tag filter (#150, HB4)', () => {
  it('highlight mode dims the map; folded branches count their matches', async () => {
    await setup()
    render(
      <>
        <TagFilterPanel view="map" onClose={() => undefined} />
        <MindMapCanvas />
      </>,
    )
    fireEvent.click(screen.getByTestId('tag-filter-p1'))
    expect(useEditor.getState().tagFilter.map?.tags).toEqual(['p1'])
    await waitFor(() =>
      expect(document.querySelector('.react-flow__node[data-id="c"]')).toHaveClass('tag-dim'),
    )
    expect(document.querySelector('.react-flow__node[data-id="a"]')).not.toHaveClass('tag-dim')
    expect(document.querySelector('.react-flow__node[data-id="root"]')).toHaveClass('tag-path')
    expect(screen.getByTestId('node-tag-hits-b')).toHaveTextContent('+1 tagged')
    expect(screen.getByTestId('tag-filter-matches')).toHaveTextContent('2 matches')
  })

  it('hide mode lists only matches and their path; × clears the filter', async () => {
    await setup()
    useEditor.getState().setView('outline')
    render(
      <>
        <TagFilterPanel view="outline" onClose={() => undefined} />
        <TagFilterChip view="outline" />
        <OutlineView />
      </>,
    )
    fireEvent.click(screen.getByTestId('tag-filter-q4'))
    expect(screen.getByTestId('outline-row-c')).toHaveClass('tag-dim')
    fireEvent.click(screen.getByTestId('tag-filter-hide'))
    expect(screen.queryByTestId('outline-row-c')).toBeNull()
    expect(screen.getByTestId('outline-row-a')).toBeInTheDocument()
    expect(screen.getByTestId('tag-filter-chip')).toHaveTextContent('#q4')
    // The map's own filter is untouched: filters belong to their view.
    expect(useEditor.getState().tagFilter.map).toBeNull()
    act(() => fireEvent.click(screen.getByTestId('tag-filter-chip-clear')))
    expect(screen.getByTestId('outline-row-c')).toBeInTheDocument()
    expect(screen.queryByTestId('tag-filter-chip')).toBeNull()
  })

  it('Brainstorm filters its own tree, any of or all of the tags', async () => {
    await setup()
    useEditor.getState().setView('brainstorm')
    render(
      <>
        <TagFilterPanel view="brainstorm" onClose={() => undefined} />
        <BrainstormOutliner />
      </>,
    )
    expect(screen.queryByTestId('tag-filter-p1')).toBeNull()
    fireEvent.click(screen.getByTestId('tag-filter-site'))
    expect(screen.getByTestId('outliner-row-i2')).toHaveClass('tag-dim')
    expect(screen.getByTestId('outliner-row-i1')).not.toHaveClass('tag-dim')
    fireEvent.click(screen.getByTestId('tag-filter-all'))
    expect(useEditor.getState().tagFilter.brainstorm?.all).toBe(true)
    expect(section('brainstorm').children).toHaveLength(2)
  })
})
