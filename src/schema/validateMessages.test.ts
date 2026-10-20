import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../i18n'
import { formatValidationErrors, parseJson } from './validate'

afterEach(async () => {
  await setLocale('en')
})

describe('validation messages (#207)', () => {
  it('lists the first three problems and counts the rest', () => {
    const errors = Array.from({ length: 50 }, (_, i) => ({
      instancePath: `/map/children/${i}`,
      message: 'must have required property id',
    }))
    const text = formatValidationErrors(errors)
    expect(text.split('\n')).toHaveLength(4)
    expect(text).toContain('/map/children/2')
    expect(text).not.toContain('/map/children/3:')
    expect(text).toContain('and 47 more problems')
  })

  it('uses the singular for one more problem and lists short lists whole', () => {
    const error = { instancePath: '/a', message: 'bad' }
    expect(formatValidationErrors([error, error, error, error])).toContain('and 1 more problem')
    expect(formatValidationErrors([error])).toBe('- /a: bad')
  })

  it('translates the invalid-JSON sentence and keeps the parser detail', async () => {
    const english = parseJson('{oops')
    expect(english.ok).toBe(false)
    if (english.ok) return
    expect(english.error).toMatch(/^Invalid JSON: /)
    await setLocale('zh-CN')
    const chinese = parseJson('{oops')
    if (chinese.ok) return
    expect(chinese.error).toMatch(/^JSON 格式无效：/)
    expect(chinese.error.slice('JSON 格式无效：'.length)).toBe(
      english.error.slice('Invalid JSON: '.length),
    )
  })
})
