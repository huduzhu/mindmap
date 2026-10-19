import type { PresetPalette } from '../schema/types'

/** WCAG AA for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of `#rgb` or `#rrggbb`, or null for anything else. */
export function relativeLuminance(hex: string): number | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  const full = short
    ? `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!full) return null
  const value = parseInt(full, 16)
  return (
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff)
  )
}

/** WCAG contrast ratio (1–21) of two colours, or null if either is unreadable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la === null || lb === null) return null
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

export interface ContrastProblem {
  text: 'text' | 'mutedText'
  surface: 'background' | 'nodeFill'
  /** Rounded down to two decimals, so 4.499 never reads as "4.50". */
  ratio: number
}

/**
 * Text colours that are hard to read on the surfaces they are drawn on (#138):
 * text and muted text against the page background and the node fill.
 */
export function paletteContrastProblems(
  palette: Pick<PresetPalette, 'text' | 'mutedText' | 'background' | 'nodeFill'>,
): ContrastProblem[] {
  const problems: ContrastProblem[] = []
  for (const text of ['text', 'mutedText'] as const) {
    for (const surface of ['background', 'nodeFill'] as const) {
      const ratio = contrastRatio(palette[text], palette[surface])
      if (ratio !== null && ratio < MIN_TEXT_CONTRAST) {
        problems.push({ text, surface, ratio: Math.floor(ratio * 100) / 100 })
      }
    }
  }
  return problems
}
