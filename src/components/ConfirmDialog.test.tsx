import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('focuses Cancel and wires aria-modal', () => {
    render(
      <ConfirmDialog
        title="Delete project"
        message="This cannot be undone."
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    )
    const dialog = screen.getByTestId('confirm-dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('Cancel and backdrop dismiss without confirming', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const { container } = render(
      <ConfirmDialog
        title="Delete project"
        message="Gone."
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    onClose.mockClear()
    fireEvent.click(container.querySelector('.dialog-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('the danger button confirms', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Delete project"
        message="Gone."
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    )
    fireEvent.click(screen.getByTestId('confirm-dialog-accept'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('Escape closes', () => {
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        title="Delete project"
        message="Gone."
        onConfirm={() => undefined}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(screen.getByTestId('confirm-dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
