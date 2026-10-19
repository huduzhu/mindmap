import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUi } from '../store/ui'
import { ShortcutsHost } from './ShortcutsDialog'

describe('Keyboard shortcuts dialog (#80)', () => {
  it('lists the shortcuts by area and closes on Escape', () => {
    render(<ShortcutsHost />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => useUi.getState().setShortcutsOpen(true))
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(screen.getByRole('heading', { name: 'Mind map' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Brainstorm' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Command palette')
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useUi.getState().shortcutsOpen).toBe(false)
  })
})
