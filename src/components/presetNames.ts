import { BUILT_IN_PRESETS } from '../io/seed'
import type { MessageKey } from '../i18n'
import '../i18n/en/presets'

/**
 * Preset name rules for the preset editor (#104). Kept out of the component
 * file so it only exports components (react/only-export-components).
 */

/** Matches the preset schema's name pattern. */
export const PRESET_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A free name based on `base`: "ocean" → "ocean-2", … */
export function suggestName(base: string, taken: Set<string>): string {
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'my-preset'
  if (!taken.has(stem)) return stem
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`
}

/** Why the name cannot be used, or null. Built-ins cannot be overwritten. */
export function presetNameProblem(name: string): MessageKey | null {
  if (!PRESET_NAME.test(name)) return 'editor.nameInvalid'
  if (BUILT_IN_PRESETS.some((preset) => preset.name === name)) return 'editor.nameBuiltIn'
  return null
}
