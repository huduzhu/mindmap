import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { makeTree as t } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { copyBrainstormToMap } from './brainstormToMap'
import { ChoiceHost } from './ChoiceDialog'
import { useToast } from './toastStore'

beforeEach(async () => {
  await resetDatabase()
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await useProjects.getState().createProject('Plan')
  useProjects.getState().updateCurrent((p) => ({
    ...p,
    brainstorm: t('b', 'Ideas', [t('b1', 'One'), t('b2', 'Two'), t('b3', 'Three')]),
    map: t('m', 'Plan', [t('m1', 'Existing')]),
  }))
  useEditor.getState().setView('brainstorm')
})

const mapTitles = () => useProjects.getState().current!.map.children?.map((c) => c.title)

async function choose(value: 'append' | 'replace' | null) {
  render(<ChoiceHost />)
  let done!: Promise<boolean>
  act(() => {
    done = copyBrainstormToMap()
  })
  expect(screen.getByRole('dialog', { name: 'Copy brainstorm to map' })).toBeInTheDocument()
  expect(screen.getByTestId('choice-append')).toHaveFocus()
  await act(async () => {
    if (value) fireEvent.click(screen.getByTestId(`choice-${value}`))
    else fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await done
  })
  return done
}

describe('Copy brainstorm to map (#87)', () => {
  it('adds the bullets under the root, shows the map, and undoes in one step', async () => {
    expect(await choose('append')).toBe(true)
    expect(mapTitles()).toEqual(['Existing', 'One', 'Two', 'Three'])
    expect(useEditor.getState().view).toBe('map')
    expect(useToast.getState().message).toMatch(/Copied 3 ideas/)
    act(() => useEditor.getState().undo())
    expect(mapTitles()).toEqual(['Existing'])
  })

  it('replaces the branches when asked', async () => {
    await choose('replace')
    expect(mapTitles()).toEqual(['One', 'Two', 'Three'])
    expect(useProjects.getState().current!.map.id).toBe('m')
  })

  it('cancel changes nothing', async () => {
    expect(await choose(null)).toBe(false)
    expect(mapTitles()).toEqual(['Existing'])
  })

  it('refuses an empty brainstorm with a message', async () => {
    useProjects.getState().updateCurrent((p) => ({ ...p, brainstorm: t('b', 'Ideas') }))
    expect(await copyBrainstormToMap()).toBe(false)
    expect(useToast.getState().message).toMatch(/brainstorm is empty/)
  })
})
