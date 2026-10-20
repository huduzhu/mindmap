import { describe, expect, it } from 'vitest'
import { tabKeyTarget } from './tablistKeys'

describe('tablist keys (#213)', () => {
  it('moves with the arrows, wrapping, and jumps with Home and End', () => {
    expect(tabKeyTarget('ArrowRight', 0, 3)).toBe(1)
    expect(tabKeyTarget('ArrowRight', 2, 3)).toBe(0)
    expect(tabKeyTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(tabKeyTarget('Home', 2, 3)).toBe(0)
    expect(tabKeyTarget('End', 0, 3)).toBe(2)
  })

  it('skips disabled tabs and ignores other keys', () => {
    const disabled = (i: number) => i !== 2
    expect(tabKeyTarget('ArrowRight', 2, 3, disabled)).toBe(2)
    expect(tabKeyTarget('Home', 2, 3, disabled)).toBe(2)
    expect(tabKeyTarget('ArrowRight', 0, 3, (i) => i === 1)).toBe(2)
    expect(tabKeyTarget('Enter', 0, 3)).toBe(-1)
  })
})
