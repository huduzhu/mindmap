import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  notifyChunkFailed,
  notifyUpdateReady,
  resetUpdate,
  setSaveBeforeReload,
} from '../pwa/update'
import { UpdateBanner } from './UpdateBanner'

afterEach(() => resetUpdate())

describe('UpdateBanner', () => {
  it('stays hidden until there is an update', () => {
    render(<UpdateBanner />)
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
  })

  it('offers Reload for a new version, which saves and then applies it', async () => {
    const save = vi.fn(async () => {})
    const apply = vi.fn(async () => {})
    setSaveBeforeReload(save)
    render(<UpdateBanner />)
    act(() => notifyUpdateReady(apply))
    expect(screen.getByTestId('update-banner')).toHaveTextContent('A new version')
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-reload'))
    })
    expect(save).toHaveBeenCalled()
    expect(apply).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('update-reload')).toBeDisabled()
  })

  it('explains a failed chunk, and Later hides the banner', () => {
    render(<UpdateBanner />)
    act(() => notifyChunkFailed())
    expect(screen.getByTestId('update-banner')).toHaveTextContent(
      'This part of the app was updated',
    )
    fireEvent.click(screen.getByTestId('update-later'))
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
  })
})
