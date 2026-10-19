import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosave } from './autosave'

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces rapid schedules into one save with the latest value', async () => {
    const save = vi.fn(async (_value: string) => {})
    const autosave = createAutosave(save, 800)
    autosave.schedule('first')
    autosave.schedule('second')
    autosave.schedule('third')
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('third')
  })

  it('resets the delay when scheduled again', async () => {
    const save = vi.fn(async (_value: string) => {})
    const autosave = createAutosave(save, 800)
    autosave.schedule('a')
    await vi.advanceTimersByTimeAsync(700)
    autosave.schedule('b')
    await vi.advanceTimersByTimeAsync(700)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(save).toHaveBeenCalledWith('b')
  })

  it('flush saves the pending value immediately', async () => {
    const save = vi.fn(async (_value: string) => {})
    const autosave = createAutosave(save, 800)
    autosave.schedule('pending')
    await autosave.flush()
    expect(save).toHaveBeenCalledWith('pending')
  })

  it('flush is a no-op when nothing is pending', async () => {
    const save = vi.fn(async (_value: string) => {})
    const autosave = createAutosave(save, 800)
    await autosave.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('cancel drops the pending save', async () => {
    const save = vi.fn(async (_value: string) => {})
    const autosave = createAutosave(save, 800)
    autosave.schedule('dropped')
    autosave.cancel()
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
  })

  it('runs a save scheduled during an in-flight save', async () => {
    let resolveFirst: () => void = () => {}
    const firstBlocked = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const save = vi.fn(async (value: string) => {
      if (value === 'first') await firstBlocked
    })
    const autosave = createAutosave(save, 10)
    autosave.schedule('first')
    await vi.advanceTimersByTimeAsync(10)
    autosave.schedule('second')
    resolveFirst()
    await autosave.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('second')
  })

  it('hasPending is false on a fresh autosave', () => {
    const save = vi.fn(async (_value: string) => {})
    const autosave = createAutosave(save, 800)
    expect(autosave.hasPending()).toBe(false)
  })

  it('hasPending tracks the debounce window and clears after the save lands', async () => {
    const save = vi.fn(async (_value: string) => {})
    const autosave = createAutosave(save, 800)
    expect(autosave.hasPending()).toBe(false)

    autosave.schedule('a')
    expect(autosave.hasPending()).toBe(true)

    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(autosave.hasPending()).toBe(false)
  })

  it('rejected save restores the pending value, reports error, and does not auto-retry', async () => {
    const save = vi.fn(async () => {
      throw new Error('QuotaExceededError')
    })
    const onStatus = vi.fn()
    const autosave = createAutosave(save, 10, onStatus)
    autosave.schedule('keep-me')
    await vi.advanceTimersByTimeAsync(10)
    await Promise.resolve()
    await Promise.resolve()

    expect(save).toHaveBeenCalledTimes(1)
    expect(autosave.hasPending()).toBe(true)
    expect(autosave.status()).toBe('error')
    expect((autosave.lastError() as Error).message).toBe('QuotaExceededError')
    expect(onStatus).toHaveBeenCalledWith('error', expect.any(Error))

    await vi.advanceTimersByTimeAsync(50)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush after an error retries the restored value', async () => {
    let failOnce = true
    const save = vi.fn(async (value: string) => {
      if (failOnce) {
        failOnce = false
        throw new Error('full')
      }
      void value
    })
    const autosave = createAutosave(save, 10)
    autosave.schedule('retry-me')
    await vi.advanceTimersByTimeAsync(10)
    await Promise.resolve()
    await Promise.resolve()
    expect(autosave.status()).toBe('error')

    await autosave.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('retry-me')
    expect(autosave.status()).toBe('idle')
    expect(autosave.hasPending()).toBe(false)
  })

  it('schedule after an error returns to pending and clears the last error', async () => {
    const save = vi.fn(async () => {
      throw new Error('full')
    })
    const autosave = createAutosave(save, 800)
    autosave.schedule('old')
    await vi.advanceTimersByTimeAsync(800)
    await Promise.resolve()
    await Promise.resolve()
    expect(autosave.status()).toBe('error')

    autosave.schedule('new')
    expect(autosave.status()).toBe('pending')
    expect(autosave.lastError()).toBeUndefined()
    expect(autosave.hasPending()).toBe(true)
  })

  it('hasPending stays true across a chained save scheduled while one is in flight', async () => {
    let resolveFirst: () => void = () => {}
    const firstBlocked = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const save = vi.fn(async (value: string) => {
      if (value === 'first') await firstBlocked
    })
    const autosave = createAutosave(save, 10)
    autosave.schedule('first')
    await vi.advanceTimersByTimeAsync(10)
    autosave.schedule('second')
    expect(autosave.hasPending()).toBe(true)

    resolveFirst()
    await autosave.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(autosave.hasPending()).toBe(false)
  })
})
