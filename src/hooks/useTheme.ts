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
  root.style.setProperty('--mms-accent', palette.branchColors[0])
  root.style.setProperty('--mms-font', font.family)
  // Native controls (scrollbars, selects, date pickers) follow the palette too.
  const scheme = isDarkColor(palette.background) ? 'dark' : 'light'
  root.style.colorScheme = scheme
  root.dataset.scheme = scheme
}

/** Relative luminance below the midpoint counts as a dark background. */
export function isDarkColor(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return false
  const value = parseInt(match[1], 16)
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  return luminance < 0.18
}
