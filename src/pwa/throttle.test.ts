import { describe, expect, it, vi } from 'vitest'
import { throttled } from './throttle'

describe('throttled (#143)', () => {
  it('runs at most once per gap, starting after the first gap', () => {
    let clock = 1_000
    const run = vi.fn()
    const check = throttled(run, 600_000, () => clock)
    check()
    expect(run).not.toHaveBeenCalled()
    clock += 600_000
    check()
    check()
    expect(run).toHaveBeenCalledTimes(1)
    clock += 599_999
    check()
    expect(run).toHaveBeenCalledTimes(1)
    clock += 1
    check()
    expect(run).toHaveBeenCalledTimes(2)
  })
})
