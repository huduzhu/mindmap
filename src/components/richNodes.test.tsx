import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
import { NodeDetailsDialog } from './NodeDetailsDialog'
import { MarkerPickerHost } from './MarkerPicker'
import { PromptHost } from './PromptDialog'
import { LinkEdge } from './LinkEdge'
import { editLinkLabel } from './linkActions'
import { Position } from '@xyflow/react'
import type { ComponentProps } from 'react'

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
  useUi.getState().setDetailsPanel('shown')
  await resetDatabase()
})

async function setup() {
  await useProjects.getState().createProject('Rich nodes')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('root', 'Kitchen', [
      makeTree(
        'p',
        'Order',
        [
          makeTree('t1', 'Tiles', [], { role: 'task', done: true }),
          makeTree('t2', 'Taps', [], { role: 'task' }),
        ],
        { side: 'right' },
      ),
    ]),
    brainstorm: makeTree('b', 'Ideas', [makeTree('i1', 'Measure')]),
  }))
}

const mapNode = (id: string) => findNode(useProjects.getState().current!.map, id)!.node

describe('task done state on screen (#148a)', () => {
  it('Ctrl+Enter on the map toggles the selected task, one undo step each', async () => {
    await setup()
    useEditor.getState().select('t2')
    render(<MindMapCanvas />)
    expect(screen.getByTestId('node-progress-p')).toHaveTextContent('1/2')
    const canvas = screen.getByTestId('map-canvas')
    const pastBefore = useEditor.getState().past.length
    act(() => {
      fireEvent.keyDown(canvas, { key: 'Enter', ctrlKey: true })
    })
    expect(mapNode('t2').done).toBe(true)
    // Plain Enter still adds a sibling; Ctrl+Enter did not.
    expect(mapNode('p').children).toHaveLength(2)
    expect(useEditor.getState().past.length).toBe(pastBefore + 1)
    expect(screen.getByTestId('node-progress-p')).toHaveTextContent('2/2')
    expect(screen.getByTestId('node-check-t2')).toHaveAttribute('aria-checked', 'true')
    act(() => useEditor.getState().undo())
    expect(mapNode('t2')).not.toHaveProperty('done')
  })

  it('the checkbox on a map node toggles it; Ctrl+Enter makes another node a task', async () => {
    await setup()
    useEditor.getState().select('p')
    render(<MindMapCanvas />)
    fireEvent.click(screen.getByTestId('node-check-t1'))
    expect(mapNode('t1')).not.toHaveProperty('done')
    act(() => {
      fireEvent.keyDown(screen.getByTestId('map-canvas'), { key: 'Enter', metaKey: true })
    })
    expect(mapNode('p').role).toBe('task')
    // The central topic is never a task.
    act(() => useEditor.getState().select('root'))
    act(() => {
      fireEvent.keyDown(screen.getByTestId('map-canvas'), { key: 'Enter', ctrlKey: true })
    })
    expect(mapNode('root')).not.toHaveProperty('role')
  })

  it('Outline rows show the checkbox and progress; Ctrl+Enter toggles', async () => {
    await setup()
    useEditor.setState({ view: 'outline' })
    render(<OutlineView />)
    expect(screen.getByTestId('row-progress-p')).toHaveTextContent('1/2')
    expect(screen.getByTestId('outline-row-t1')).toHaveClass('outliner-row-done')
    fireEvent.click(screen.getByTestId('row-check-t2'))
    expect(mapNode('t2').done).toBe(true)
    // The click did not start a rename.
    expect(useEditor.getState().editing).toBeNull()
    act(() => useEditor.getState().select('t1'))
    act(() => {
      fireEvent.keyDown(screen.getByTestId('outline-view'), { key: 'Enter', ctrlKey: true })
    })
    expect(mapNode('t1')).not.toHaveProperty('done')
  })

  it('Ctrl+Enter while renaming saves the title and toggles the task', async () => {
    await setup()
    useEditor.setState({ view: 'brainstorm' })
    render(<BrainstormOutliner />)
    act(() => {
      useEditor.getState().select('i1')
      useEditor.getState().setEditing('i1')
    })
    const input = screen.getByDisplayValue('Measure')
    fireEvent.change(input, { target: { value: 'Measure walls' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    const idea = findNode(useProjects.getState().current!.brainstorm, 'i1')!.node
    expect(idea).toMatchObject({ title: 'Measure walls', role: 'task' })
    // No new bullet was added, unlike plain Enter.
    expect(useProjects.getState().current!.brainstorm.children).toHaveLength(1)
    expect(screen.getByTestId('row-check-i1')).toHaveAttribute('aria-checked', 'false')
  })

  it('the details panel has a Done checkbox for tasks and shows progress', async () => {
    await setup()
    useEditor.setState({ view: 'map' })
    useEditor.getState().select('t2')
    const { rerender } = render(<NodeDetailsDialog />)
    const box = screen.getByTestId('node-details-done') as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(mapNode('t2').done).toBe(true)
    act(() => useEditor.getState().select('p'))
    rerender(<NodeDetailsDialog />)
    expect(screen.queryByTestId('node-details-done')).toBeNull()
    expect(screen.getByTestId('node-details-progress')).toHaveTextContent('2 of 2 tasks done')
  })
})

describe('colour and emoji markers on screen (#148b)', () => {
  it('the node menu opens the colour picker; a swatch sets the colour, one undo step', async () => {
    await setup()
    useEditor.getState().select('t2')
    const { container } = render(<MindMapCanvas />)
    fireEvent.contextMenu(container.querySelector('.react-flow__node[data-id="t2"]')!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colour…' }))
    expect(useUi.getState().markerPicker).toEqual({ section: 'map', id: 't2', kind: 'color' })

    const onClose = vi.fn(() => useUi.getState().setMarkerPicker(null))
    const picker = render(<MarkerPickerHost onClose={onClose} />)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Colour for “Taps”')
    // "No colour" is current, so it has focus; arrows move between swatches.
    const none = screen.getByTestId('marker-option-none')
    expect(none).toHaveFocus()
    expect(none).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(none, { key: 'ArrowRight' })
    expect(screen.getByTestId('marker-option-color-1')).toHaveFocus()
    const pastBefore = useEditor.getState().past.length
    fireEvent.click(screen.getByTestId('marker-option-color-2'))
    expect(mapNode('t2').color).toBe(2)
    expect(useEditor.getState().past.length).toBe(pastBefore + 1)
    expect(onClose).toHaveBeenCalled()
    picker.unmount()
    expect(container.querySelector('.react-flow__node[data-id="t2"] .map-node')).toHaveAttribute(
      'data-color',
      '2',
    )
  })

  it('the marker picker sets a curated or typed emoji and shows it everywhere', async () => {
    await setup()
    useEditor.setState({ view: 'outline' })
    act(() => useUi.getState().setMarkerPicker({ section: 'map', id: 'p', kind: 'icon' }))
    const onClose = () => useUi.getState().setMarkerPicker(null)
    const first = render(<MarkerPickerHost onClose={onClose} />)
    fireEvent.click(screen.getByRole('radio', { name: '🔥' }))
    expect(mapNode('p').icon).toBe('🔥')
    first.unmount()

    act(() => useUi.getState().setMarkerPicker({ section: 'map', id: 't1', kind: 'icon' }))
    const second = render(<MarkerPickerHost onClose={onClose} />)
    const input = screen.getByTestId('marker-custom')
    fireEvent.change(input, { target: { value: 'tiles' } })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent('Type one emoji')
    expect(mapNode('t1')).not.toHaveProperty('icon')
    fireEvent.change(input, { target: { value: '🧱 bricks' } })
    fireEvent.submit(input.closest('form')!)
    expect(mapNode('t1').icon).toBe('🧱')
    second.unmount()

    act(() => useUi.getState().setMarkerPicker(null))
    render(<OutlineView />)
    expect(screen.getByTestId('outline-row-p')).toHaveTextContent('🔥Order')
    useEditor.getState().select('p')
    render(<NodeDetailsDialog />)
    expect(screen.getByTestId('node-details-icon')).toHaveTextContent('🔥')
    expect(screen.getByTestId('node-details-title')).toHaveTextContent('🔥 Order')
  })
})

describe('labels on cross-links (#148c)', () => {
  async function setupLinked(label?: string) {
    await setup()
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      links: [label ? { from: 't1', to: 't2', label } : { from: 't1', to: 't2' }],
    }))
  }

  it('asks for a label (as a double-click does); one undo step', async () => {
    await setupLinked()
    render(<PromptHost />)
    void editLinkLabel('t2', 't1')
    const input = await screen.findByLabelText(/Label for the link between “Tiles” and “Taps”/)
    fireEvent.change(input, { target: { value: '  same   supplier ' } })
    const pastBefore = useEditor.getState().past.length
    await act(async () => {
      fireEvent.click(screen.getByTestId('prompt-dialog-accept'))
    })
    expect(useProjects.getState().current!.links).toEqual([
      { from: 't1', to: 't2', label: 'same supplier' },
    ])
    expect(useEditor.getState().past.length).toBe(pastBefore + 1)
    act(() => useEditor.getState().undo())
    expect(useProjects.getState().current!.links).toEqual([{ from: 't1', to: 't2' }])
  })

  it('draws the label as a pill in the middle of the link, in the preset colours', () => {
    const props = {
      id: 'link:a->b',
      source: 'a',
      target: 'b',
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 100,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      label: 'depends on',
      data: {
        from: 'a',
        to: 'b',
        labelText: '#111111',
        labelFill: '#fafafa',
        labelBorder: '#999999',
      },
    } as unknown as ComponentProps<typeof LinkEdge>
    // jsdom has no SVG layout; the pill is sized from the text's box.
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      value: () => ({ x: 0, y: 0, width: 60, height: 14 }),
      configurable: true,
    })
    const { container } = render(
      <svg>
        <LinkEdge {...props} />
      </svg>,
    )
    const text = container.querySelector('.react-flow__edge-text')!
    expect(text).toHaveTextContent('depends on')
    expect(text.closest('g')!.getAttribute('transform')).toContain('translate(')
    expect(container.querySelector('.react-flow__edge-textbg')).toHaveAttribute('rx', '9')
    delete (SVGElement.prototype as { getBBox?: unknown }).getBBox
  })

  it('the details panel lists the label and edits or clears it', async () => {
    await setupLinked('same supplier')
    useEditor.setState({ view: 'map' })
    useEditor.getState().select('t2')
    render(
      <>
        <NodeDetailsDialog />
        <PromptHost />
      </>,
    )
    expect(screen.getByTestId('node-link-label-t1')).toHaveTextContent('same supplier')
    fireEvent.click(screen.getByRole('button', { name: 'Label the link to Tiles' }))
    const input = await screen.findByDisplayValue('same supplier')
    fireEvent.change(input, { target: { value: 'x'.repeat(81) } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('prompt-dialog-accept'))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Keep it to 80 characters (81 now).')
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('prompt-dialog-accept'))
    })
    expect(useProjects.getState().current!.links).toEqual([{ from: 't1', to: 't2' }])
    expect(screen.queryByTestId('node-link-label-t1')).toBeNull()
  })
})
