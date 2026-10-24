import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDialogA11y } from './useDialogA11y'

function Harness({
  isOpen,
  onClose,
  labelledBy,
  hasTrigger = false,
}: {
  isOpen: boolean
  onClose: () => void
  labelledBy?: string
  hasTrigger?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useDialogA11y(containerRef, {
    isOpen,
    onClose,
    ...(labelledBy === undefined ? {} : { labelledBy }),
    ...(hasTrigger ? { returnFocusRef: triggerRef } : {}),
  })
  return (
    <>
      {hasTrigger ? (
        <button ref={triggerRef} type="button" data-testid="trigger">
          Open
        </button>
      ) : null}
      {isOpen ? (
        <div ref={containerRef} data-testid="dialog" role="dialog">
          <h2 id={labelledBy ?? 'dialog-title'}>Title</h2>
          <button type="button" data-testid="first">
            First
          </button>
          <input data-testid="middle" />
          <button type="button" data-testid="last">
            Last
          </button>
        </div>
      ) : null}
    </>
  )
}

/** Lets the dialog's mutation observer run. */
const settle = () => new Promise((resolve) => setTimeout(resolve))

describe('useDialogA11y', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the first focusable child when the dialog opens', () => {
    render(<Harness isOpen onClose={() => undefined} labelledBy="dialog-title" />)
    expect(screen.getByTestId('first')).toHaveFocus()
  })

  it('sets aria-modal and aria-labelledby on the container', () => {
    render(<Harness isOpen onClose={() => undefined} labelledBy="dialog-title" />)
    const dialog = screen.getByTestId('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title')
  })

  it('calls onClose when Escape is pressed inside the dialog', () => {
    const onClose = vi.fn()
    render(<Harness isOpen onClose={onClose} labelledBy="dialog-title" />)
    fireEvent.keyDown(screen.getByTestId('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable back to the first', () => {
    render(<Harness isOpen onClose={() => undefined} labelledBy="dialog-title" />)
    const last = screen.getByTestId('last')
    last.focus()
    expect(last).toHaveFocus()
    fireEvent.keyDown(screen.getByTestId('dialog'), { key: 'Tab' })
    expect(screen.getByTestId('first')).toHaveFocus()
  })

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    render(<Harness isOpen onClose={() => undefined} labelledBy="dialog-title" />)
    const first = screen.getByTestId('first')
    first.focus()
    fireEvent.keyDown(screen.getByTestId('dialog'), { key: 'Tab', shiftKey: true })
    expect(screen.getByTestId('last')).toHaveFocus()
  })

  it('does not steal Tab when focus is on a middle element', () => {
    render(<Harness isOpen onClose={() => undefined} labelledBy="dialog-title" />)
    const middle = screen.getByTestId('middle')
    middle.focus()
    fireEvent.keyDown(screen.getByTestId('dialog'), { key: 'Tab' })
    expect(middle).toHaveFocus()
  })

  it('restores focus to the trigger element on close', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Harness isOpen={false} onClose={onClose} labelledBy="dialog-title" hasTrigger />,
    )
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    rerender(<Harness isOpen={true} onClose={onClose} labelledBy="dialog-title" hasTrigger />)
    expect(screen.getByTestId('first')).toHaveFocus()
    rerender(<Harness isOpen={false} onClose={onClose} labelledBy="dialog-title" hasTrigger />)
    expect(trigger).toHaveFocus()
  })

  it('does not run when the dialog is closed', () => {
    const onClose = vi.fn()
    render(<Harness isOpen={false} onClose={onClose} labelledBy="dialog-title" hasTrigger />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('answers Esc and Tab after the focused button was disabled (#208)', async () => {
    const onClose = vi.fn()
    render(<Harness isOpen onClose={onClose} labelledBy="dialog-title" />)
    const dialog = screen.getByTestId('dialog')
    const first = screen.getByTestId('first') as HTMLButtonElement
    first.focus()
    first.disabled = true
    await settle()
    expect(dialog).toHaveFocus()
    dialog.blur()
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(screen.getByTestId('middle')).toHaveFocus()
    // Removing the focused element hands focus back to the dialog as well.
    screen.getByTestId('middle').remove()
    await settle()
    expect(dialog).toHaveFocus()
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('only the topmost dialog reacts to keys from the page (#208)', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Harness isOpen onClose={outer} />
        <Harness isOpen onClose={inner} />
      </>,
    )
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })
})
