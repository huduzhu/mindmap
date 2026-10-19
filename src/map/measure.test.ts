import { describe, expect, it } from 'vitest'
import { estimateTextWidth, wrapLines, type MeasureText } from './measure'

// A deterministic measurer: 10 px per Latin character, 20 px per CJK character.
const fixed: MeasureText = (text) => {
  let width = 0
  for (const ch of text) width += /[一-鿿]/.test(ch) ? 20 : 10
  return width
}

describe('estimateTextWidth (#72)', () => {
  it('weights CJK and wide capitals more than the old 0.55 em guess', () => {
    const font = 'normal 14px system-ui'
    expect(estimateTextWidth('产品路线图', font)).toBeCloseTo(5 * 14, 5)
    expect(estimateTextWidth('WWWW', font)).toBeGreaterThan(4 * 14 * 0.55)
    expect(estimateTextWidth('iiii', font)).toBeLessThan(4 * 14 * 0.55)
  })

  it('makes bold text wider', () => {
    expect(estimateTextWidth('Central', 'bold 21px x')).toBeGreaterThan(
      estimateTextWidth('Central', 'normal 21px x'),
    )
  })
})

describe('wrapLines (#72)', () => {
  it('never splits a word that fits on a line', () => {
    expect(wrapLines('Research', 80, 'f', fixed)).toEqual(['Research'])
    expect(wrapLines('Design plan', 60, 'f', fixed)).toEqual(['Design', 'plan'])
  })

  it('breaks between CJK characters', () => {
    expect(wrapLines('产品路线图与季度', 60, 'f', fixed)).toEqual(['产品路', '线图与', '季度'])
  })

  it('breaks inside a word only when the word alone is too wide', () => {
    expect(wrapLines('abcdefghij', 40, 'f', fixed)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('collapses whitespace and handles empty titles', () => {
    expect(wrapLines('  a \n b  ', 100, 'f', fixed)).toEqual(['a b'])
    expect(wrapLines('', 100, 'f', fixed)).toEqual([''])
  })

  it('mixes Latin words and CJK', () => {
    expect(wrapLines('Q3 产品 plan', 50, 'f', fixed)).toEqual(['Q3 产', '品', 'plan'])
  })
})
