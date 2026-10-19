import colorblindSafePreset from '../../presets/colorblind-safe.json'
import corporatePreset from '../../presets/corporate.json'
import darkPreset from '../../presets/dark.json'
import defaultPreset from '../../presets/default.json'
import handdrawnPreset from '../../presets/handdrawn.json'
import type { Preset, PresetPalette } from '../schema/types'
import { getPreset, putPreset } from './db'

export const BUILT_IN_PRESETS: Preset[] = [
  defaultPreset as Preset,
  corporatePreset as Preset,
  darkPreset as Preset,
  handdrawnPreset as Preset,
  colorblindSafePreset as Preset,
]

/**
 * Palette values earlier releases shipped for a built-in, newest last. #138
 * darkened the muted text of Corporate and Hand-drawn to reach 4.5:1.
 */
const SUPERSEDED_PALETTES: Record<string, Partial<PresetPalette>[]> = {
  corporate: [{ mutedText: '#64748b' }],
  handdrawn: [{ mutedText: '#8a8577' }],
}

/** JSON with sorted keys, so two presets compare by content only. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  )
}

/**
 * True when `stored` is exactly an older shipped version of `current`, i.e. a
 * built-in nobody has edited. Edited copies never match and are left alone.
 */
export function isOutdatedBuiltIn(stored: Preset, current: Preset): boolean {
  const storedKey = canonical(stored)
  return (SUPERSEDED_PALETTES[current.name] ?? []).some(
    (old) => canonical({ ...current, palette: { ...current.palette, ...old } }) === storedKey,
  )
}

// Insert-if-absent on purpose: a user-tweaked built-in must survive reseed, and Preset has no
// isCustom marker, so the only safe behaviour is "write only when missing". The one exception
// is an untouched copy of an older shipped version, which is brought up to date (#138).
export async function seedBuiltInPresets(): Promise<void> {
  for (const preset of BUILT_IN_PRESETS) {
    const existing = await getPreset(preset.name)
    if (!existing || isOutdatedBuiltIn(existing, preset)) await putPreset(preset)
  }
}
