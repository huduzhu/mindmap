import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChoiceHost } from './ChoiceDialog'
import { askExpandAction } from './importFile'

describe('expand import preview (#84)', () => {
  it('shows what changes and defaults to merging into the source', async () => {
    render(<ChoiceHost />)
    let answer!: Promise<string | null>
    act(() => {
      answer = askExpandAction({ sourceName: 'Launch', added: 4, changed: 0, removed: 0, moved: 0 })
    })
    const dialog = screen.getByRole('dialog', { name: 'Import an expanded brainstorm' })
    expect(dialog).toHaveTextContent('This file expands the brainstorm of “Launch”.')
    expect(dialog).toHaveTextContent('4 new bullets added')
    expect(screen.getByTestId('choice-merge')).toHaveFocus()
    expect(screen.getByTestId('choice-merge')).toHaveTextContent('Merge into “Launch”')
    fireEvent.click(screen.getByTestId('choice-new'))
    expect(await answer).toBe('new')
  })

  it('warns when the file changes existing bullets', async () => {
    render(<ChoiceHost />)
    let answer!: Promise<string | null>
    act(() => {
      answer = askExpandAction({ sourceName: 'Launch', added: 1, changed: 2, removed: 1, moved: 0 })
    })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('should not do')
    expect(dialog).toHaveTextContent('2 bullets reworded')
    expect(dialog).toHaveTextContent('1 bullet missing')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(await answer).toBeNull()
  })
})

describe('AI convert / improve preview', () => {
  it('offers to put the map into the source project by default', async () => {
    const { askApplyAction } = await import('./importFile')
    render(<ChoiceHost />)
    let answer!: Promise<string | null>
    act(() => {
      answer = askApplyAction({
        intent: 'convert',
        sourceName: 'Launch',
        mapNodes: 12,
        currentMapNodes: 0,
      })
    })
    const dialog = screen.getByRole('dialog', { name: 'Import an AI mind map' })
    expect(dialog).toHaveTextContent('12 nodes in the new map')
    expect(dialog).toHaveTextContent('The current map is empty')
    expect(screen.getByTestId('choice-apply')).toHaveFocus()
    expect(screen.getByTestId('choice-apply')).toHaveTextContent('Put the map into “Launch”')
    fireEvent.click(screen.getByTestId('choice-apply'))
    expect(await answer).toBe('apply')
  })
})
