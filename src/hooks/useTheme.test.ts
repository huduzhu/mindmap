import { describe, expect, it } from 'vitest'
import { BUILT_IN_PRESETS } from '../io/seed'
import { contrastRatio, MIN_TEXT_CONTRAST } from '../theme/contrast'
import { applyPresetTheme, readableAccent } from './useTheme'

describe('readable accent (#205)', () => {
  for (const preset of BUILT_IN_PRESETS) {
    it(`built-in preset "${preset.name}": primary text and accent-on-background reach 4.5:1`, () => {
      const { background, branchColors } = preset.palette
      const accent = readableAccent(branchColors[0], background)
      // Primary buttons and active tabs draw background-coloured text on the accent…
      expect(contrastRatio(background, accent)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      // …and the accent is drawn on the page background.
      expect(contrastRatio(accent, background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    })
  }

  it('keeps an accent that already reads well', () => {
    expect(readableAccent('#1d4ed8', '#ffffff')).toBe('#1d4ed8')
    expect(readableAccent('#60a5fa', '#0f172a')).toBe('#60a5fa')
  })

  it('darkens on light backgrounds and lightens on dark ones', () => {
    const darker = readableAccent('#3b82f6', '#f8fafc')
    expect(darker).not.toBe('#3b82f6')
    expect(contrastRatio(darker, '#f8fafc')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    const lighter = readableAccent('#1e3a8a', '#0f172a')
    expect(contrastRatio(lighter, '#0f172a')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
  })

  it('sets --mms-accent to the readable accent', () => {
    const preset = BUILT_IN_PRESETS.find((candidate) => candidate.name === 'default')!
    applyPresetTheme(preset)
    expect(document.documentElement.style.getPropertyValue('--mms-accent')).toBe(
      readableAccent(preset.palette.branchColors[0], preset.palette.background),
    )
  })
})
