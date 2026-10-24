import { describe, expect, it } from 'vitest'
import { MENU_MARGIN, clampMenuLeft } from './menuPosition'

describe('clampMenuLeft', () => {
  it('keeps a menu that fits where it was opened', () => {
    expect(clampMenuLeft(100, 200, 1000)).toBe(100)
  })

  it('moves a menu that would run off the right edge to the left', () => {
    expect(clampMenuLeft(900, 200, 1000)).toBe(1000 - 200 - MENU_MARGIN)
  })

  it('never moves it past the left edge, even when wider than the window', () => {
    expect(clampMenuLeft(300, 500, 400)).toBe(MENU_MARGIN)
    expect(clampMenuLeft(-20, 100, 400)).toBe(MENU_MARGIN)
  })

  it('leaves the position alone when the window has no width (tests, hidden frames)', () => {
    expect(clampMenuLeft(300, 200, 0)).toBe(300)
  })
})
