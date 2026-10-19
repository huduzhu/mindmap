import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ToastHost } from './Toast'
import { dismissToast, RESUME_MIN_MS, showToast, useToast } from './toastStore'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

afterEach(() => {
  act(() => dismissToast())
})

describe('toasts (#136)', () => {
  it('info toasts are polite and hide by themselves', async () => {
    render(<ToastHost />)
    act(() => showToast('Saved', 'info', 30))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    await act(() => wait(80))
    expect(useToast.getState().message).toBeNull()
  })

  it('error toasts are alerts and stay until closed', async () => {
    render(<ToastHost />)
    act(() => showToast('Import failed', 'error', 30))
    expect(screen.getByRole('alert')).toHaveTextContent('Import failed')
    await act(() => wait(80))
    expect(screen.getByRole('alert')).toHaveTextContent('Import failed')
    fireEvent.click(screen.getByRole('button', { name: 'Close the message' }))
    expect(useToast.getState().message).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('an info toast waits while hovered and hides after the pointer leaves', async () => {
    render(<ToastHost />)
    act(() => showToast('Copied', 'info', 40))
    const toast = screen.getByRole('status').parentElement!
    fireEvent.mouseEnter(toast)
    await act(() => wait(100))
    expect(useToast.getState().message).toBe('Copied')
    fireEvent.mouseLeave(toast)
    await act(() => wait(RESUME_MIN_MS + 100))
    expect(useToast.getState().message).toBeNull()
  })

  it('focus on the close button holds the toast too', async () => {
    render(<ToastHost />)
    act(() => showToast('Copied', 'info', 40))
    fireEvent.focus(screen.getByRole('button', { name: 'Close the message' }))
    await act(() => wait(100))
    expect(useToast.getState().message).toBe('Copied')
  })
})
