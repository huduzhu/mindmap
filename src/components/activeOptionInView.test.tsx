import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { CommandPalette } from './CommandPalette'
import { LinkPickerHost } from './LinkPicker'
import { NodeTagField } from './TagEditor'

// jsdom has no scrollIntoView: record which elements were asked to scroll.
const scrolled: { id: string; options: unknown }[] = []
const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')

beforeEach(async () => {
  scrolled.length = 0
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value(this: Element, options: unknown) {
      scrolled.push({ id: this.id, options })
    },
  })
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  useUi.getState().resetTransient()
  useUi.getState().setPaletteOpen(false)
  await resetDatabase()
  await useProjects.getState().createProject('Plan')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m', 'Plan', [
      makeTree('a', 'Alpha', [], { tags: ['p1', 'p2'] }),
      makeTree('b', 'Beta', [], { tags: ['p3'] }),
      makeTree('c', 'Gamma'),
    ]),
  }))
  useEditor.getState().setView('map')
})

afterEach(() => {
  if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original)
  else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

const lastScrolled = () => scrolled[scrolled.length - 1]

describe('the active option stays in view', () => {
  it('command palette scrolls the option ArrowDown moves to', () => {
    act(() => useUi.getState().setPaletteOpen(true))
    render(<CommandPalette />)
    const input = within(screen.getByTestId('command-palette')).getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const active = input.getAttribute('aria-activedescendant')
    expect(active).toBeTruthy()
    expect(document.getElementById(active!)).toHaveAttribute('aria-selected', 'true')
    expect(lastScrolled()).toEqual({ id: active, options: { block: 'nearest' } })
  })

  it('link picker scrolls the option ArrowDown moves to', () => {
    render(<LinkPickerHost />)
    act(() => useUi.getState().setLinkPickFrom('a'))
    const input = within(screen.getByTestId('link-picker')).getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const active = input.getAttribute('aria-activedescendant')
    expect(document.getElementById(active!)).toHaveAttribute('aria-selected', 'true')
    expect(active).toMatch(/-1$/)
    expect(lastScrolled()).toEqual({ id: active, options: { block: 'nearest' } })
  })

  it('tag suggestions scroll the option ArrowDown moves to', () => {
    const node = useProjects.getState().current!.map.children![2]
    render(<NodeTagField section="map" node={node} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'p' } })
    expect(scrolled).toHaveLength(0)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const active = input.getAttribute('aria-activedescendant')
    expect(active).toMatch(/-1$/)
    expect(lastScrolled()).toEqual({ id: active, options: { block: 'nearest' } })
  })

  it('tag field ignores Enter while an input method is composing', () => {
    const node = useProjects.getState().current!.map.children![2]
    render(<NodeTagField section="map" node={node} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.change(input, { target: { value: 'pinyin' } })
    // Safari reports composition only through keyCode 229.
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(useProjects.getState().current!.map.children![2]).not.toHaveProperty('tags')
  })
})
