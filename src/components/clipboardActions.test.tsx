import 'fake-indexeddb/auto'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CLIPBOARD_MIME } from '../map/clipboard'
import type { TreeNode } from '../schema/types'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { resetClipboardMemory, useNodeClipboard } from './clipboardActions'

function fakeClipboard(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    get types() {
      return [...data.keys()]
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  }
}

function fire(type: 'copy' | 'cut' | 'paste', clipboard: ReturnType<typeof fakeClipboard>) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: clipboard })
  document.body.dispatchEvent(event)
  return event
}

const shape = (node: TreeNode): unknown =>
  node.children?.length ? { [node.title]: node.children.map(shape) } : node.title
const map = () => shape(useProjects.getState().current!.map)

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  useEditor.getState().setView('map')
  resetClipboardMemory()
  await resetDatabase()
  await useProjects.getState().createProject('Clipboard')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m', 'Central', [
      makeTree('a', 'Alpha', [makeTree('a1', 'Alpha one')]),
      makeTree('b', 'Beta'),
    ]),
    links: [{ from: 'a1', to: 'a' }],
  }))
  useEditor.getState().setView('map')
  renderHook(() => useNodeClipboard())
})

describe('Ctrl/Cmd+C, X, V on nodes (#101)', () => {
  it('copy puts an outline and the full data on the clipboard', () => {
    useEditor.getState().select('a')
    const clipboard = fakeClipboard()
    const event = fire('copy', clipboard)
    expect(event.defaultPrevented).toBe(true)
    expect(clipboard.getData('text/plain')).toBe('- Alpha\n  - Alpha one\n')
    expect(JSON.parse(clipboard.getData(CLIPBOARD_MIME)).links).toHaveLength(1)
  })

  it('paste adds the copy under the selected node as one undo step, with its links', () => {
    useEditor.getState().select('a')
    const clipboard = fakeClipboard()
    fire('copy', clipboard)
    useEditor.getState().select('b')
    const before = useEditor.getState().past.length
    fire('paste', clipboard)
    expect(map()).toEqual({
      Central: [{ Alpha: ['Alpha one'] }, { Beta: [{ Alpha: ['Alpha one'] }] }],
    })
    expect(useEditor.getState().past.length).toBe(before + 1)
    expect(useProjects.getState().current!.links).toHaveLength(2)
    const pasted = useProjects.getState().current!.map.children![1].children![0]
    expect(useEditor.getState().selection).toBe(pasted.id)

    useEditor.getState().undo()
    expect(map()).toEqual({ Central: [{ Alpha: ['Alpha one'] }, 'Beta'] })
    expect(useProjects.getState().current!.links).toHaveLength(1)
  })

  it('cut removes the selection (never the root) and paste puts it back elsewhere', () => {
    useEditor.getState().select('b')
    const clipboard = fakeClipboard()
    fire('cut', clipboard)
    expect(map()).toEqual({ Central: [{ Alpha: ['Alpha one'] }] })
    useEditor.getState().select('a1')
    fire('paste', clipboard)
    expect(map()).toEqual({ Central: [{ Alpha: [{ 'Alpha one': ['Beta'] }] }] })

    useEditor.getState().select('m')
    fire('cut', fakeClipboard())
    expect(useProjects.getState().current!.map.id).toBe('m')
  })

  it('Ctrl+Shift+V pastes as a sibling', () => {
    useEditor.getState().select('a1')
    const clipboard = fakeClipboard()
    fire('copy', clipboard)
    useEditor.getState().select('a')
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true }),
    )
    fire('paste', clipboard)
    expect(map()).toEqual({ Central: [{ Alpha: ['Alpha one'] }, 'Alpha one', 'Beta'] })
  })

  it('pastes plain text from elsewhere as an outline', () => {
    useEditor.getState().select('b')
    fire('paste', fakeClipboard({ 'text/plain': 'Milk\nEggs\n  free range' }))
    expect(map()).toEqual({
      Central: [{ Alpha: ['Alpha one'] }, { Beta: ['Milk', { Eggs: ['free range'] }] }],
    })
  })

  it('leaves text fields and renames alone', () => {
    useEditor.getState().select('a')
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: fakeClipboard() })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    input.remove()

    useEditor.getState().setEditing('a')
    expect(fire('paste', fakeClipboard({ 'text/plain': 'x' })).defaultPrevented).toBe(false)
  })

  it('works in Brainstorm too', () => {
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      brainstorm: makeTree('br', 'Ideas', [makeTree('i1', 'One')]),
    }))
    useEditor.getState().setView('brainstorm')
    useEditor.getState().select('i1')
    const clipboard = fakeClipboard()
    fire('copy', clipboard)
    fire('paste', clipboard)
    expect(shape(useProjects.getState().current!.brainstorm)).toEqual({ Ideas: [{ One: ['One'] }] })
  })
})
