import { afterEach, describe, expect, it, vi } from 'vitest'
import { importAndAnnounce } from './importFile'
import { useToast } from './toastStore'

describe('importAndAnnounce', () => {
  afterEach(() => {
    useToast.getState().clear()
    vi.unstubAllGlobals()
  })

  it('turns a file read failure into an error toast instead of rejecting', async () => {
    const failing = {
      name: 'broken.json',
      text: () => Promise.reject(new Error('disk read failed')),
    } as unknown as File

    await expect(importAndAnnounce(failing)).resolves.toBeUndefined()
    expect(useToast.getState().tone).toBe('error')
    expect(useToast.getState().message).toContain('disk read failed')
  })

  it('stringifies non-Error throws in the toast', async () => {
    const failing = {
      name: 'broken.md',
      text: () => Promise.reject('plain string failure'),
    } as unknown as File

    await expect(importAndAnnounce(failing)).resolves.toBeUndefined()
    expect(useToast.getState().message).toContain('plain string failure')
  })

  it('refuses an oversized file without reading it (#65)', async () => {
    const text = vi.fn()
    const huge = { name: 'huge.json', size: 3 * 1024 * 1024 * 1024, text } as unknown as File
    await importAndAnnounce(huge)
    expect(text).not.toHaveBeenCalled()
    expect(useToast.getState().tone).toBe('error')
    expect(useToast.getState().message).toMatch(/huge\.json.*limit is 64 MB/)
  })
})
