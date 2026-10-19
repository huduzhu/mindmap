import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickFile, slugify } from './files'

function pendingInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]')!
}

describe('pickFile', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('resolves the picked file when change fires', async () => {
    const promise = pickFile('.json,.md')
    const input = pendingInput()
    expect(input.accept).toBe('.json,.md')

    window.dispatchEvent(new Event('blur'))
    const file = new File(['{}'], 'a.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))

    await expect(promise).resolves.toBe(file)
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('resolves null when the dialog closes without a selection', async () => {
    const promise = pickFile('.json')
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(400)

    await expect(promise).resolves.toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('ignores focus events until the window has actually blurred', async () => {
    const promise = pickFile('.json')
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(1000)

    expect(document.querySelector('input[type="file"]')).not.toBeNull()

    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(400)
    await expect(promise).resolves.toBeNull()
  })

  it('cannot leak: the hard timeout settles the promise', async () => {
    const promise = pickFile('.json')
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    await expect(promise).resolves.toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})

describe('slugify (#51)', () => {
  it('keeps ASCII behaviour', () => {
    expect(slugify('Roadmap 2026')).toBe('roadmap-2026')
    expect(slugify('  Q3: Plan / Draft  ')).toBe('q3-plan-draft')
  })

  it('keeps CJK and other non-Latin names distinct', () => {
    expect(slugify('产品路线图')).toBe('产品路线图')
    expect(slugify('项目计划')).toBe('项目计划')
    expect(slugify('会議メモ')).toBe('会議メモ')
    expect(slugify('로드맵')).toBe('로드맵')
    expect(slugify('Café déjà vu')).toBe('café-déjà-vu')
    expect(slugify('产品 路线图 v2')).toBe('产品-路线图-v2')
  })

  it('strips path-unsafe characters', () => {
    expect(slugify('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('caps the length without splitting a character', () => {
    const slug = slugify('😀'.repeat(10) + '字'.repeat(200))
    expect(Array.from(slug).length).toBeLessThanOrEqual(80)
  })

  it('falls back to a timestamp when nothing usable remains', () => {
    expect(slugify('!!!', new Date(2026, 8, 26, 9, 5))).toBe('mindmap-20260926-0905')
  })
})
