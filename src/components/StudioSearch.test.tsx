import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeNode } from '../store/treeOps'
import { resetDatabase } from '../test/resetDb'
import { StudioSearch } from './StudioSearch'

beforeEach(async () => {
  await resetDatabase()
  useEditor.getState().reset()
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await useProjects.getState().init()
  await useProjects.getState().createProject('Search test')
  const marketing = makeNode('Marketing')
  const landing = makeNode('Landing page')
  const engineering = makeNode('Engineering')
  const api = makeNode('API launch')
  marketing.children = [landing]
  engineering.children = [api]
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: { ...p.map, title: 'Product Launch', children: [marketing, engineering] },
  }))
  await useProjects.getState().saveCurrent()
  useEditor.getState().setView('map')
})

describe('StudioSearch', () => {
  it('selects the first title match as you type', () => {
    render(<StudioSearch />)
    const input = screen.getByTestId('studio-search')
    fireEvent.change(input, { target: { value: 'launch' } })
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 of 2')
    expect(useEditor.getState().selection).toBe(useProjects.getState().current!.map.id)
  })

  it('Enter cycles to the next match and Shift+Enter goes back', () => {
    render(<StudioSearch />)
    const input = screen.getByTestId('studio-search')
    fireEvent.change(input, { target: { value: 'launch' } })
    const rootId = useProjects.getState().current!.map.id
    const apiId = useProjects.getState().current!.map.children![1].children![0].id
    expect(useEditor.getState().selection).toBe(rootId)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useEditor.getState().selection).toBe(apiId)
    expect(screen.getByTestId('search-count')).toHaveTextContent('2 of 2')

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(useEditor.getState().selection).toBe(rootId)
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 of 2')
  })

  it('Escape clears the query', () => {
    render(<StudioSearch />)
    const input = screen.getByTestId('studio-search') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'launch' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
    expect(screen.queryByTestId('search-count')).toBeNull()
  })

  it('expands a collapsed ancestor so a deep match can be revealed', () => {
    const parent = useProjects.getState().current!.map.children![0]
    act(() => {
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: {
          ...p.map,
          children: p.map.children!.map((c) =>
            c.id === parent.id ? { ...c, collapsed: true } : c,
          ),
        },
      }))
    })
    expect(useProjects.getState().current!.map.children![0].collapsed).toBe(true)

    render(<StudioSearch />)
    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: 'Landing' } })
    const landingId = parent.children![0].id
    expect(useEditor.getState().selection).toBe(landingId)
    expect(useProjects.getState().current!.map.children![0].collapsed).toBe(false)
  })
})

describe('StudioSearch — Ctrl/Cmd+F (#147)', () => {
  function renderWithView() {
    return render(
      <>
        <div id="tab-panel">
          <div className="canvas-wrap" tabIndex={0} data-testid="view" />
        </div>
        <StudioSearch />
      </>,
    )
  }

  it('focuses the box and selects its text; pressed again it is the browser’s Find', () => {
    renderWithView()
    const input = screen.getByTestId('studio-search') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'launch' } })
    screen.getByTestId('view').focus()

    const first = fireEvent.keyDown(screen.getByTestId('view'), { key: 'f', ctrlKey: true })
    expect(first).toBe(false) // prevented: the app's search, not the browser's
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('launch'.length)

    const second = fireEvent.keyDown(input, { key: 'f', ctrlKey: true })
    expect(second).toBe(true) // let through to the browser
    // Cmd+F on a Mac, from the view again.
    screen.getByTestId('view').focus()
    expect(fireEvent.keyDown(screen.getByTestId('view'), { key: 'F', metaKey: true })).toBe(false)
    expect(input).toHaveFocus()
  })

  it('Esc returns focus to the view it came from', () => {
    renderWithView()
    const view = screen.getByTestId('view')
    view.focus()
    fireEvent.keyDown(view, { key: 'f', ctrlKey: true })
    const input = screen.getByTestId('studio-search')
    expect(input).toHaveFocus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(view).toHaveFocus()
  })

  it('shows the box when it is folded away before focusing it', () => {
    let revealed = 0
    render(<StudioSearch onRevealBox={() => (revealed += 1)} />)
    const input = screen.getByTestId('studio-search')
    // No layout in the test DOM: the box counts as folded away.
    fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true })
    expect(revealed).toBe(1)
    expect(input).toHaveFocus()
  })

  it('Enter on a single match shows it again', () => {
    render(<StudioSearch />)
    const input = screen.getByTestId('studio-search')
    fireEvent.change(input, { target: { value: 'Landing' } })
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 of 1')
    const nonce = useEditor.getState().revealNonce
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useEditor.getState().revealNonce).toBe(nonce + 1)
  })

  it('leaves a new node being named alone when it adds a match (#193)', () => {
    render(<StudioSearch />)
    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: 'launch' } })
    const map = useProjects.getState().current!.map
    expect(useEditor.getState().selection).toBe(map.id)
    const marketing = map.children![0].id
    const draft = makeNode('Launch party')
    act(() => {
      useEditor.getState().select(marketing)
      useEditor.getState().startDraft('map', draft, (tree) => ({
        ...tree,
        children: [draft, ...tree.children!],
      }))
    })
    expect(useEditor.getState().editing).toBe(draft.id)
    expect(useEditor.getState().selection).toBe(draft.id)
    // Committing the name changes the matches again: still no jump.
    act(() => useEditor.getState().commitRename(draft.id, 'Launch party plan'))
    expect(useEditor.getState().selection).toBe(draft.id)
  })

  it('does not jump to a match that appears later for the same query (#193)', () => {
    render(<StudioSearch />)
    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: 'pricing' } })
    expect(screen.getByTestId('search-count')).toHaveTextContent(/0/)
    const marketing = useProjects.getState().current!.map.children![0].id
    act(() => {
      useEditor.getState().select(marketing)
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: { ...p.map, children: [...p.map.children!, makeNode('Pricing')] },
      }))
    })
    expect(useEditor.getState().selection).toBe(marketing)
  })

  it('selects the match in the Brainstorm view too', () => {
    act(() => {
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        brainstorm: { ...p.brainstorm, children: [makeNode('Pricing idea'), makeNode('Other')] },
      }))
      useEditor.getState().setView('brainstorm')
    })
    render(<StudioSearch />)
    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: 'pricing' } })
    const id = useProjects.getState().current!.brainstorm.children![0].id
    expect(useEditor.getState().selection).toBe(id)
    expect(useEditor.getState().revealId).toBe(id)
  })
})
