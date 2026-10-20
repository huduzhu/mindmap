import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { PromptHost } from './PromptDialog'
import { SnapshotsDialog } from './SnapshotsDialog'

beforeEach(async () => {
  useProjects.setState({
    records: [],
    currentId: null,
    current: null,
    loaded: false,
    snapshots: [],
  })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
  await useProjects.getState().createProject('Snapshots dialog')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    map: makeTree('m', 'Central', [makeTree('a', 'A'), makeTree('b', 'B')]),
  }))
  await useProjects.getState().createSnapshot('Three nodes')
  useProjects.getState().updateCurrent((p) => ({ ...p, map: makeTree('m', 'Central') }))
})

function renderDialog() {
  let closed = false
  render(
    <>
      <SnapshotsDialog onClose={() => (closed = true)} />
      <PromptHost />
    </>,
  )
  return { closed: () => closed }
}

describe('SnapshotsDialog (#98)', () => {
  it('lists each snapshot with its date and size', async () => {
    renderDialog()
    const row = await screen.findByTestId('snapshot-row')
    expect(row).toHaveTextContent('Three nodes')
    expect(row).toHaveTextContent('3 nodes')
    expect(row).toHaveTextContent(String(new Date().getFullYear()))
  })

  it('restores only after confirming, as one undo step, and closes', async () => {
    const dialog = renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Three nodes' }))
    const confirm = screen.getByRole('dialog', { name: 'Restore snapshot' })
    expect(useProjects.getState().current!.map.children ?? []).toHaveLength(0)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(useProjects.getState().current!.map.children).toHaveLength(2))
    expect(dialog.closed()).toBe(true)
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.children ?? []).toHaveLength(0)
  })

  it('cancelling a delete keeps the snapshot', async () => {
    renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Three nodes' }))
    const confirm = screen.getByRole('dialog', { name: 'Delete snapshot' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Delete snapshot' })).toBeNull()
    expect(useProjects.getState().snapshots).toHaveLength(1)
  })

  it('renames a snapshot through the prompt', async () => {
    renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Three nodes' }))
    const input = (await screen.findByTestId('prompt-dialog')).querySelector('input')!
    expect(input.value).toBe('Three nodes')
    fireEvent.change(input, { target: { value: 'Before cleanup' } })
    fireEvent.click(screen.getByTestId('prompt-dialog-accept'))
    expect(await screen.findByText('Before cleanup')).toBeInTheDocument()
    expect(useProjects.getState().snapshots.map((s) => s.name)).toEqual(['Before cleanup'])
  })
})
