import { BUILT_IN_PRESETS } from '../io/seed'
import { t, type MessageKey } from '../i18n'
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

/**
 * The name shown for a preset (#211): built-ins and "system" get a translated
 * display name; the user's own presets keep theirs. The id stays the value.
 */
export function presetLabel(name: string): string {
  // SYSTEM_PRESET, spelled out: importing theme/system here would re-split the
  // startup chunks (#211).
  if (name === 'system') return t('presets.system')
  return BUILT_IN_PRESETS.some((preset) => preset.name === name)
    ? t(`presets.name.${name}` as MessageKey)
    : name
}
