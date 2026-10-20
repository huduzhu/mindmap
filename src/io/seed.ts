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

/** What a built-in looked like in an earlier release: the parts that changed since. */
interface ShippedVersion {
  palette?: Partial<PresetPalette>
  roles?: Partial<Preset['roles']>
}

/** The structural roles of the early 1.0.0 builds: they looked the same as no role (live test, item 1). */
const ROLES_1_0: Partial<Preset['roles']> = {
  'main-branch': { fontWeight: 'bold' },
  branch: {},
  leaf: {},
}
const HANDDRAWN_ROLES_1_0: Partial<Preset['roles']> = {
  'main-branch': { fontWeight: 'bold', shape: 'box' },
  branch: { shape: 'box' },
  leaf: { shape: 'box' },
}

/**
 * The colour roles before #168 raised their text contrast to 4.5:1 (Default,
 * Colorblind-safe and Hand-drawn; the others already passed).
 */
const KIND_ROLES_1_0: Record<string, Partial<Preset['roles']>> = {
  default: {
    idea: { fill: '#10b981', text: '#ffffff', shape: 'pill' },
    question: { fill: '#8b5cf6', text: '#ffffff', shape: 'pill' },
    risk: { fill: '#ef4444', text: '#ffffff', shape: 'pill' },
  },
  'colorblind-safe': {
    idea: { fill: '#009E73', text: '#ffffff', shape: 'pill' },
    risk: { fill: '#D55E00', text: '#ffffff', shape: 'pill' },
  },
  handdrawn: {
    task: { fill: '#e07a5f', text: '#fffdf5', shape: 'box' },
    idea: { fill: '#2a9d8f', text: '#fffdf5', shape: 'box' },
  },
}

/**
 * Earlier shipped versions of each built-in. #138 darkened the muted text of
 * Corporate and Hand-drawn to reach 4.5:1; live testing before the first public
 * release gave the main branch, branch and leaf roles a look of their own, and
 * #168 made the colour roles readable.
 */
function shippedVersions(name: string): ShippedVersion[] {
  const kinds = KIND_ROLES_1_0[name] ?? {}
  const structure = name === 'handdrawn' ? HANDDRAWN_ROLES_1_0 : ROLES_1_0
  const palettes: (Partial<PresetPalette> | undefined)[] = [undefined]
  if (name === 'corporate') palettes.push({ mutedText: '#64748b' })
  if (name === 'handdrawn') palettes.push({ mutedText: '#8a8577' })
  const versions: ShippedVersion[] = []
  for (const palette of palettes) {
    // The 1.0 roles throughout, and the public 1.0.0 with only the old colour roles.
    versions.push({ ...(palette ? { palette } : {}), roles: { ...structure, ...kinds } })
    if (Object.keys(kinds).length > 0)
      versions.push({ ...(palette ? { palette } : {}), roles: kinds })
  }
  return versions
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
  return shippedVersions(current.name).some(
    (old) =>
      canonical({
        ...current,
        palette: { ...current.palette, ...old.palette },
        roles: { ...current.roles, ...old.roles },
      }) === storedKey,
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
