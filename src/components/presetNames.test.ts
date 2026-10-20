import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../i18n'
import { BUILT_IN_PRESETS } from '../io/seed'
import { presetLabel } from './presetNames'

afterEach(async () => {
  await setLocale('en')
})

describe('preset display names (#211)', () => {
  it('gives every built-in preset a display name instead of its id', () => {
    for (const preset of BUILT_IN_PRESETS) {
      const label = presetLabel(preset.name)
      expect(label).not.toBe(preset.name)
      expect(label).not.toMatch(/^presets\./)
    }
    expect(presetLabel('colorblind-safe')).toBe('Colour-blind safe')
    expect(presetLabel('system')).toBe('System')
  })

  it('keeps the names of the user’s own presets', () => {
    expect(presetLabel('my-ocean')).toBe('my-ocean')
  })

  it('translates built-in names', async () => {
    await setLocale('zh-CN')
    expect(presetLabel('dark')).toBe('深色')
    expect(presetLabel('handdrawn')).toBe('手绘')
    expect(presetLabel('my-ocean')).toBe('my-ocean')
  })
})
