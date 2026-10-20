import { describe, expect, it } from 'vitest'
import { isFramed } from './framed'
import { renderFramedNotice } from './framedNotice'

describe('running inside another page (#180)', () => {
  it('tells a frame from a top-level window', () => {
    const top = {} as Window
    expect(isFramed({ top, self: top } as unknown as Window)).toBe(false)
    expect(isFramed({ top: {}, self: {} } as unknown as Window)).toBe(true)
    const throwing = {
      get top(): Window {
        throw new Error('cross-origin')
      },
    } as unknown as Window
    expect(isFramed(throwing)).toBe(true)
  })

  it('replaces the page with a link that opens the app in its own tab', () => {
    const root = document.createElement('div')
    root.textContent = 'app'
    renderFramedNotice(root, 'https://example.test/mindmap/')
    const link = root.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.test/mindmap/')
    expect(link.target).toBe('_top')
    expect(root.textContent).not.toContain('app ')
  })
})
