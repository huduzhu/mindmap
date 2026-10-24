import type { Preset } from '../schema/types'

export function applyPresetTheme(preset: Preset): void {
  const root = document.documentElement
  const { palette, font } = preset
  root.style.setProperty('--mms-bg', palette.background)
  root.style.setProperty('--mms-text', palette.text)
  root.style.setProperty('--mms-muted', palette.mutedText)
  root.style.setProperty('--mms-node-fill', palette.nodeFill)
  root.style.setProperty('--mms-node-border', palette.nodeBorder)
  root.style.setProperty('--mms-edge', palette.edge)
  root.style.setProperty(
    '--mms-accent',
    // Presets have at least three branch colours (preset.schema.json).
    readableAccent(palette.branchColors[0] ?? palette.edge, palette.background),
  )
  root.style.setProperty('--mms-font', font.family)
  // Native controls (scrollbars, selects, date pickers) follow the palette too.
  const scheme = isDarkColor(palette.background) ? 'dark' : 'light'
  root.style.colorScheme = scheme
  root.dataset.scheme = scheme
}

/** WCAG relative luminance of `#rrggbb`, or null for anything else. */
function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const value = parseInt(match[1] ?? '', 16)
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

/** Relative luminance below the midpoint counts as a dark background. */
export function isDarkColor(hex: string): boolean {
  return (luminance(hex) ?? 1) < 0.18
}

/**
 * The accent, darkened (or lightened on a dark background) in 10% steps until
 * it reads at 4.5:1 against the background: it is drawn on the page and carries
 * background-coloured text on primary buttons and active tabs (#205).
 */
export function readableAccent(accent: string, background: string): string {
  const bg = luminance(background)
  let color = accent
  for (let step = 0; step < 20; step++) {
    const fg = luminance(color)
    if (fg === null || bg === null || (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) >= 4.5)
      break
    const value = parseInt(color.slice(1), 16)
    const [r = 0, g = 0, b = 0] = [16, 8, 0].map((shift) => {
      const c = (value >> shift) & 0xff
      return Math.round(c + ((bg < 0.18 ? 255 : 0) - c) * 0.1)
    })
    color = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
  }
  return color
}
