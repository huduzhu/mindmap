import 'fake-indexeddb/auto'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Announcer } from '../components/Announcer'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { addChild, makeNode } from '../store/treeOps'
import { resetDatabase } from '../test/resetDb'
import { ANNOUNCE_DELAY_MS, announce, flushAnnouncement, useAnnouncer } from './announcer'

const region = () => screen.getByTestId('announcer')
const text = () => region().textContent?.replace(/ $/, '')

describe('announcer (#85)', () => {
  it('is a polite status region, empty until something happens', () => {
    render(<Announcer />)
    expect(region()).toHaveAttribute('aria-live', 'polite')
    expect(region()).toHaveAttribute('role', 'status')
    expect(text()).toBe('')
  })

  it('collapses a burst into its last message', () => {
    render(<Announcer />)
    announce('one')
    announce('two')
    announce('three')
    expect(text()).toBe('')
    act(() => flushAnnouncement())
    expect(text()).toBe('three')
  })

  it('appends a selection message to a pending edit instead of replacing it', () => {
    render(<Announcer />)
    announce('Deleted “X”')
    announce('Y, level 1', { append: true })
    act(() => flushAnnouncement())
    expect(text()).toBe('Deleted “X”. Y, level 1')
  })

  it('re-reads the same message by changing the text slightly', () => {
    render(<Announcer />)
    announce('Undone')
    act(() => flushAnnouncement())
    const first = region().textContent
    announce('Undone')
    act(() => flushAnnouncement())
    expect(region().textContent).not.toBe(first)
    expect(text()).toBe('Undone')
  })

  it('publishes by itself after a short pause', async () => {
    announce('later')
    await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_DELAY_MS + 50))
    expect(useAnnouncer.getState().message).toBe('later')
  })
})

describe('edits reach the live region (#85)', () => {
  beforeEach(async () => {
    await resetDatabase()
    useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
    await useProjects.getState().saveCurrent()
    useEditor.getState().reset()
    await useProjects.getState().createProject('Spoken')
  })

  it('announces an added node, and its undo', () => {
    render(<Announcer />)
    const root = useProjects.getState().current!.map
    act(() => {
      useEditor.getState().applyTree('map', (tree) => addChild(tree, root.id, makeNode('Heard')))
      flushAnnouncement()
    })
    expect(text()).toBe('Added “Heard” under “Spoken”')
    act(() => {
      useEditor.getState().undo()
      flushAnnouncement()
    })
    expect(text()).toBe('Undone: deleted “Heard”')
    act(() => {
      useEditor.getState().redo()
      flushAnnouncement()
    })
    expect(text()).toBe('Redone: added “Heard” under “Spoken”')
  })
})
