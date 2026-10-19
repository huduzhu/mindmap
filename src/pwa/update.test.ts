import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isChunkLoadError,
  lazyImport,
  notifyChunkFailed,
  notifyUpdateReady,
  reloadApp,
  resetUpdate,
  setSaveBeforeReload,
  useUpdate,
} from './update'

const chunkError = () =>
  new TypeError('Failed to fetch dynamically imported module: https://x/assets/a-123.js')

afterEach(() => resetUpdate())

describe('isChunkLoadError', () => {
  it('recognises the browsers’ chunk-load messages', () => {
    expect(isChunkLoadError(chunkError())).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
  })

  it('leaves other errors alone', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('lazyImport', () => {
  it('returns the module on success, without a banner', async () => {
    await expect(lazyImport(async () => ({ ok: 1 }))).resolves.toEqual({ ok: 1 })
    expect(useUpdate.getState().reason).toBeNull()
  })

  it('shows the banner and rethrows when a chunk fails, without a pointless retry (#143)', async () => {
    const loader = vi.fn<() => Promise<string>>().mockRejectedValue(chunkError())
    await expect(lazyImport(loader)).rejects.toThrow(/dynamically imported module/)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(useUpdate.getState().reason).toBe('chunk')
  })

  it('rethrows other errors without a banner', async () => {
    const loader = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('bug'))
    await expect(lazyImport(loader)).rejects.toThrow('bug')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(useUpdate.getState().reason).toBeNull()
  })
})

describe('update banner state', () => {
  it('a waiting service worker shows the banner; Later hides it', () => {
    notifyUpdateReady(async () => {})
    expect(useUpdate.getState()).toMatchObject({ reason: 'update', dismissed: false })
    useUpdate.getState().dismiss()
    expect(useUpdate.getState().dismissed).toBe(true)
    // A failed chunk afterwards shows it again.
    notifyChunkFailed()
    expect(useUpdate.getState()).toMatchObject({ reason: 'chunk', dismissed: false })
  })

  it('never downgrades a failed-chunk message to "new version"', () => {
    notifyChunkFailed()
    notifyUpdateReady(async () => {})
    expect(useUpdate.getState().reason).toBe('chunk')
  })

  it('Reload saves first, then activates the waiting version', async () => {
    const calls: string[] = []
    setSaveBeforeReload(async () => {
      calls.push('save')
    })
    notifyUpdateReady(async (reloadPage) => {
      calls.push(`apply:${reloadPage}`)
    })
    await reloadApp()
    expect(calls).toEqual(['save', 'apply:true'])
  })

  it('Reload still activates the update when saving fails', async () => {
    const apply = vi.fn(async () => {})
    setSaveBeforeReload(async () => {
      throw new Error('quota')
    })
    notifyUpdateReady(apply)
    await reloadApp()
    expect(apply).toHaveBeenCalledWith(true)
  })
})
