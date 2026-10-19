import { afterEach, describe, expect, it } from 'vitest'
import { formatDateTime } from './dates'
import { setLocale } from './index'

const when = new Date(2026, 9, 10, 14, 5)

afterEach(async () => {
  await setLocale('en')
})

describe('formatDateTime (#137)', () => {
  it('follows the interface language', async () => {
    expect(formatDateTime(when)).toBe(
      when.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }),
    )
    expect(formatDateTime(when)).toMatch(/Oct/)
    await setLocale('zh-CN')
    expect(formatDateTime(when)).toMatch(/2026年10月10日/)
    expect(formatDateTime(when)).not.toMatch(/Oct/)
  })

  it('takes ISO strings and an explicit locale', () => {
    expect(formatDateTime(when.toISOString(), 'zh-CN')).toMatch(/2026年10月10日/)
  })

  it('is empty for a missing or unreadable date', () => {
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('not a date')).toBe('')
  })
})
