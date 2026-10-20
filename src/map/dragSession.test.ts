import { describe, expect, it } from 'vitest'
import { createDragSession } from './dragSession'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('drag session (#196)', () => {
  it('applies a normal drop: the end report is followed by stop in the same task', async () => {
    let abandoned = 0
    const session = createDragSession(() => (abandoned += 1))
    session.begin('a')
    session.ended()
    expect(session.stop('a')).toBe(true)
    await tick()
    expect(abandoned).toBe(0)
  })

  it('forgets a drag a second finger abandoned, so the next stop moves nothing', async () => {
    let abandoned = 0
    const session = createDragSession(() => (abandoned += 1))
    session.begin('a')
    session.ended() // aborted: React Flow calls no stop
    await tick()
    expect(abandoned).toBe(1)
    // The next gesture: React Flow skips the start and calls only stop.
    expect(session.stop('a')).toBe(false)
  })

  it('never applies a stop for another node or without a start', () => {
    const session = createDragSession(() => {})
    expect(session.stop('a')).toBe(false)
    session.begin('a')
    expect(session.stop('b')).toBe(false)
    expect(session.stop('a')).toBe(false)
  })
})
