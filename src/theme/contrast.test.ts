import { describe, expect, it } from 'vitest'
import { BUILT_IN_PRESETS } from '../io/seed'
import { contrastRatio, paletteContrastProblems, relativeLuminance } from './contrast'

describe('contrast (#138)', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#fff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#8a8577', '#fdf6e3')).toBeCloseTo(3.41, 2)
  })

  it('ignores colours it cannot read', () => {
    expect(relativeLuminance('red')).toBeNull()
    expect(contrastRatio('#12345', '#ffffff')).toBeNull()
  })

  it('lists text colours below 4.5:1 on the background or node fill', () => {
    expect(
      paletteContrastProblems({
        text: '#111111',
        mutedText: '#8a8577',
        background: '#fdf6e3',
        nodeFill: '#ffffff',
      }),
    ).toEqual([
      { text: 'mutedText', surface: 'background', ratio: 3.41 },
      { text: 'mutedText', surface: 'nodeFill', ratio: 3.68 },
    ])
  })

  for (const preset of BUILT_IN_PRESETS) {
    it(`built-in preset "${preset.name}" passes`, () => {
      expect(paletteContrastProblems(preset.palette)).toEqual([])
    })
  }

  // Node text on every role's fill, not just the palette (#168).
  for (const preset of BUILT_IN_PRESETS) {
    it(`built-in preset "${preset.name}" has readable text on every role`, () => {
      const problems = Object.entries(preset.roles).flatMap(([role, style]) => {
        const fill = style?.fill ?? preset.palette.nodeFill
        const text = style?.text ?? preset.palette.text
        const ratio = contrastRatio(text, fill) ?? 0
        return ratio < 4.5 ? [`${role}: ${ratio.toFixed(2)}`] : []
      })
      expect(problems).toEqual([])
    })
  }
})
