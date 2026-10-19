import { describe, expect, it } from 'vitest'
import { viewerLocale, viewerText } from './strings'

describe('viewer strings (#99)', () => {
  it('follows the exported language, English otherwise', () => {
    expect(viewerLocale('zh-CN')).toBe('zh-CN')
    expect(viewerLocale('zh-TW')).toBe('zh-CN')
    expect(viewerLocale('en')).toBe('en')
    expect(viewerLocale(undefined)).toBe('en')
    expect(viewerLocale('fr')).toBe('en')
  })

  it('fills parameters in both languages', () => {
    expect(viewerText('en', 'expand', { count: 3 })).toBe('Expand 3 hidden')
    expect(viewerText('zh-CN', 'expand', { count: 3 })).toBe('展开 3 个隐藏节点')
    expect(viewerText('zh-CN', 'search')).toBe('搜索节点…')
  })
})
