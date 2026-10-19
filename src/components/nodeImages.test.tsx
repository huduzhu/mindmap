import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { setImageCodec } from '../assets/attach'
import { clearThumbCache } from '../assets/store'
import type { DecodedImage, ImageCodec } from '../assets/process'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { useUi } from '../store/ui'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'

const codec: ImageCodec<DecodedImage> = {
  async decode() {
    return { width: 640, height: 480, hasAlpha: () => false, close: () => undefined }
  },
  async encode(_image, width, height, type) {
    return new Blob([new Uint8Array([width % 256, height % 256])], { type })
  },
}

const realCreate = URL.createObjectURL
const realRevoke = URL.revokeObjectURL

function clipboard(files: File[], text = '') {
  return {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: [...(text ? ['text/plain'] : []), ...(files.length ? ['Files'] : [])],
    getData: (type: string) => (type === 'text/plain' ? text : ''),
    setData: () => undefined,
  }
}

function paste(data: ReturnType<typeof clipboard>) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: data })
  document.body.dispatchEvent(event)
  return event
}

const png = (name = 'shot.png') =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
const node = (id: string) => findNode(useProjects.getState().current!.map, id)?.node

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  useEditor.getState().reset()
  await resetDatabase()
  clearThumbCache()
  setImageCodec(codec)
  URL.createObjectURL = () => 'blob:thumb'
  URL.revokeObjectURL = () => undefined
})

afterEach(() => {
  setImageCodec(null)
  URL.createObjectURL = realCreate
  URL.revokeObjectURL = realRevoke
})

async function openProject() {
  const view = render(<App />)
  await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
  await act(async () => {
    await useProjects.getState().createProject('Kitchen')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      map: makeTree('m', 'Job', [
        makeTree('a', 'North wall'),
        makeTree('b', 'Sink', [makeTree('b1', 'Tap')]),
      ]),
    }))
  })
  act(() => useEditor.getState().setView('map'))
  await screen.findByText('North wall')
  return view
}

describe('images on the map (#149)', () => {
  it('pastes a copied picture onto the selected node and shows its thumbnail', async () => {
    await openProject()
    act(() => useEditor.getState().select('a'))
    const event = paste(clipboard([png()]))
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(node('a')?.image).toMatchObject({ w: 640, h: 480 }))
    expect(useEditor.getState().past).toHaveLength(1)
    const thumb = await screen.findByTestId('node-image-a')
    await waitFor(() => expect(thumb.querySelector('img')).not.toBeNull())
    expect(thumb.querySelector('img')!.getAttribute('src')).toBe('blob:thumb')

    // Text keeps pasting as nodes, even with a picture of it alongside.
    act(() => useEditor.getState().select('b1'))
    const text = paste(clipboard([png()], 'Order tiles'))
    expect(text.defaultPrevented).toBe(true)
    await waitFor(() => expect(node('b1')?.children?.[0]?.title).toBe('Order tiles'))
    expect(node('b1')).not.toHaveProperty('image')
  })

  it('puts a pasted picture on a new node when nothing is selected', async () => {
    await openProject()
    act(() => useEditor.getState().select(null))
    paste(clipboard([png('image.png')]))
    await waitFor(() => expect(useProjects.getState().current!.map.children).toHaveLength(3))
    const made = useProjects.getState().current!.map.children![2]
    expect(made.title).toBe('Image')
    expect(made.image).toBeDefined()
  })

  it('drops a picture on a node, and on empty canvas makes a new node', async () => {
    const { container } = await openProject()
    const dropOn = (target: Element, file: File) => {
      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: clipboard([file]) })
      target.dispatchEvent(event)
    }
    dropOn(container.querySelector('.react-flow__node[data-id="b"] .map-node-title')!, png())
    await waitFor(() => expect(node('b')?.image).toBeDefined())
    dropOn(container.querySelector('.react-flow__pane') ?? document.body, png('Pantry.png'))
    await waitFor(() =>
      expect(useProjects.getState().current!.map.children!.at(-1)!.title).toBe('Pantry'),
    )
  })

  it('drops a picture on a Brainstorm idea (the row does not take it as a move)', async () => {
    Element.prototype.scrollIntoView ??= () => undefined
    const { container } = await openProject()
    act(() => {
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        brainstorm: makeTree('i', 'Ideas', [makeTree('i1', 'Open shelves')]),
      }))
      useEditor.getState().setView('brainstorm')
    })
    await screen.findByText('Open shelves')
    const row = container.querySelector('[data-node-section="brainstorm"][data-node-id="i1"]')!
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: clipboard([png()]) })
    row.dispatchEvent(event)
    await waitFor(() =>
      expect(findNode(useProjects.getState().current!.brainstorm, 'i1')?.node.image).toBeDefined(),
    )
  })

  it('opens the lightbox with Space (Shift+Space on a node with children) and edits the alt text', async () => {
    await openProject()
    act(() => useEditor.getState().select('a'))
    paste(clipboard([png()]))
    await waitFor(() => expect(node('a')?.image).toBeDefined())
    fireEvent.keyDown(document.body, { key: ' ' })
    const dialog = await screen.findByTestId('image-lightbox')
    expect(useUi.getState().imageViewer).toEqual({ section: 'map', id: 'a' })
    expect(dialog).toHaveTextContent('Image of “North wall”')
    // Zoom keys stay inside the lightbox.
    fireEvent.keyDown(screen.getByTestId('lightbox-stage'), { key: '+' })
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('125%')
    fireEvent.keyDown(screen.getByTestId('lightbox-stage'), { key: '0' })
    expect(screen.getByTestId('lightbox-zoom')).toHaveTextContent('100%')
    fireEvent.keyDown(screen.getByTestId('lightbox-stage'), { key: 'Delete' })
    expect(node('a')).toBeDefined()

    const alt = screen.getByTestId('lightbox-alt')
    fireEvent.change(alt, { target: { value: 'Window and socket' } })
    fireEvent.blur(alt)
    expect(node('a')!.image!.alt).toBe('Window and socket')
    expect(useEditor.getState().past).toHaveLength(2)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('image-lightbox')).toBeNull())
    expect(useEditor.getState().past).toHaveLength(2)

    // A node with children folds with Space; Shift+Space opens its picture.
    act(() => useEditor.getState().select('b'))
    paste(clipboard([png('b.png')]))
    await waitFor(() => expect(node('b')?.image).toBeDefined())
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(node('b')!.collapsed).toBe(true)
    fireEvent.keyDown(document.body, { key: ' ', shiftKey: true })
    expect(await screen.findByTestId('image-lightbox')).toBeInTheDocument()
  })

  it('shows the picture in the details panel with View, Remove and its description', async () => {
    await openProject()
    act(() => useEditor.getState().select('a'))
    paste(clipboard([png()]))
    await waitFor(() => expect(node('a')?.image).toBeDefined())
    act(() => useUi.getState().setDetailsPanel('shown'))
    const field = await screen.findByTestId('node-details-image')
    expect(await screen.findByTestId('node-details-thumb')).toBeTruthy()
    const alt = screen.getByTestId('node-details-image-alt') as HTMLInputElement
    fireEvent.change(alt, { target: { value: 'Window frame' } })
    fireEvent.blur(alt)
    await waitFor(() => expect(node('a')?.image?.alt).toBe('Window frame'))
    fireEvent.click(screen.getByTestId('node-details-image-view'))
    expect(useUi.getState().imageViewer).toEqual({ section: 'map', id: 'a' })
    act(() => useUi.getState().setImageViewer(null))
    fireEvent.click(screen.getByTestId('node-details-image-remove'))
    await waitFor(() => expect(node('a')?.image).toBeUndefined())
    expect(field.isConnected).toBe(false)
  })
})
