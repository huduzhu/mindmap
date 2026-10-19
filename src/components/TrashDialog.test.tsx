import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { isTrashAutoPurgeOn } from '../store/session'
import { getProject } from '../io/db'
import { useProjects } from '../store/projects'
import { resetDatabase } from '../test/resetDb'
import { TrashDialog } from './TrashDialog'

beforeEach(async () => {
  await resetDatabase()
  useProjects.setState({ records: [], trashed: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
})

async function trashProject(name: string) {
  const id = await useProjects.getState().createProject(name)
  await useProjects.getState().remove(id)
  useProjects.setState({ currentId: null, current: null })
  return id
}

describe('TrashDialog', () => {
  it('restores a project without opening it', async () => {
    const id = await trashProject('Restorable')
    render(<TrashDialog onClose={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() =>
      expect(useProjects.getState().records.map((record) => record.id)).toContain(id),
    )
    expect(useProjects.getState().trashed).toHaveLength(0)
    expect(useProjects.getState().currentId).toBeNull()
  })

  it('confirms and purges a project forever', async () => {
    const id = await trashProject('Gone forever')
    render(<TrashDialog onClose={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('This cannot be undone.')
    fireEvent.click(screen.getByTestId('confirm-dialog-accept'))

    await waitFor(async () => expect(await getProject(id)).toBeUndefined())
    expect(useProjects.getState().trashed).toHaveLength(0)
  })

  it('empties the whole trash after one confirmation (#83)', async () => {
    const first = await trashProject('Old one')
    const second = await trashProject('Older one')
    render(<TrashDialog onClose={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent(
      'Delete all 2 projects in the trash forever?',
    )
    fireEvent.click(screen.getByTestId('confirm-dialog-accept'))

    await waitFor(() => expect(useProjects.getState().trashed).toHaveLength(0))
    expect(await getProject(first)).toBeUndefined()
    expect(await getProject(second)).toBeUndefined()
    expect(screen.getByText('Trash is empty.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Empty trash' })).toBeNull()
  })

  it('switches the 30-day auto-delete off and on (#83)', async () => {
    await trashProject('Kept')
    render(<TrashDialog onClose={() => undefined} />)
    const toggle = screen.getByRole('checkbox', {
      name: 'Delete projects forever after 30 days in the trash',
    })
    expect(toggle).toBeChecked()
    expect(screen.getByText(/deleted forever in 30 days/)).toBeTruthy()

    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(isTrashAutoPurgeOn()).toBe(false)
    expect(screen.queryByText(/deleted forever in/)).toBeNull()

    fireEvent.click(toggle)
    expect(isTrashAutoPurgeOn()).toBe(true)
  })
})
