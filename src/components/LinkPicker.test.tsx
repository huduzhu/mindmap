import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { makeTree as t } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { LinkPickerHost } from './LinkPicker'
import { NodeDetailsDialog } from './NodeDetailsDialog'

beforeEach(async () => {
  await resetDatabase()
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await useProjects.getState().createProject('Plan')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: t('m', 'Plan', [t('a', 'Alpha', [t('a1', 'Deep one')]), t('b', 'Beta'), t('c', 'Gamma')]),
  }))
  useEditor.getState().setView('map')
  useEditor.getState().select('a')
})

function renderPanel() {
  return render(
    <>
      <NodeDetailsDialog />
      <LinkPickerHost />
    </>,
  )
}

describe('cross-links from the details panel (#90)', () => {
  it('"Link to…" picks the other node by typing, then lists and removes the link', () => {
    renderPanel()
    expect(screen.getByText(/None\. A cross-link draws/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Link to…' }))

    const picker = screen.getByRole('dialog', { name: 'Link “Alpha” to…' })
    const input = within(picker).getByRole('combobox', { name: 'Find the node to link to' })
    expect(input).toHaveFocus()
    // Itself is not offered.
    expect(within(picker).queryByRole('option', { name: /^Alpha/ })).toBeNull()
    fireEvent.change(input, { target: { value: 'gam' } })
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Gammain Plan'])
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByTestId('link-picker')).toBeNull()
    expect(useProjects.getState().current!.links).toEqual([{ from: 'a', to: 'c' }])
    const list = screen.getByTestId('node-links')
    expect(list).toHaveTextContent('↔ Gamma')

    fireEvent.click(screen.getByRole('button', { name: 'Remove link to Gamma' }))
    expect(useProjects.getState().current!.links).toBeUndefined()
    act(() => useEditor.getState().undo())
    expect(useProjects.getState().current!.links).toEqual([{ from: 'a', to: 'c' }])
  })

  it('does not offer nodes that are already linked, and Escape cancels', () => {
    useEditor.getState().applyLinks(() => [{ from: 'b', to: 'a' }])
    renderPanel()
    act(() => useUi.getState().setLinkPickFrom('a'))
    const picker = screen.getByTestId('link-picker')
    const titles = within(picker)
      .getAllByRole('option')
      .map((o) => o.querySelector('.command-item-title')?.textContent)
    expect(titles).toEqual(['Plan', 'Deep one', 'Gamma'])
    fireEvent.keyDown(picker, { key: 'Escape' })
    expect(screen.queryByTestId('link-picker')).toBeNull()
    expect(useProjects.getState().current!.links).toEqual([{ from: 'b', to: 'a' }])
  })

  it('selecting a listed link jumps to that node', () => {
    useEditor.getState().applyLinks(() => [{ from: 'a', to: 'b' }])
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '↔ Beta' }))
    expect(useEditor.getState().selection).toBe('b')
  })
})
