import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { getPreset } from '../io/db'
import { BUILT_IN_PRESETS } from '../io/seed'
import type { Preset, PresetRef } from '../schema/types'
import { SYSTEM_PRESET, systemPresetName, useSystemDark } from '../theme/system'

// Custom presets resolved so far this session. Components that mount later
// (every project switch remounts the tree) render the right palette on their
// first frame instead of flashing the default one while IndexedDB answers (#65).
const resolvedCustom = new Map<string, Preset>()

/** Bumped when a stored preset changes (the preset editor, #104), so users re-read it. */
const usePresetVersion = create<{ version: number }>()(() => ({ version: 0 }))

export function presetChanged(preset: Preset): void {
  resolvedCustom.set(preset.name, preset)
  usePresetVersion.setState((s) => ({ version: s.version + 1 }))
}

export function useResolvedPreset(ref: PresetRef): Preset {
  const dark = useSystemDark()
  // "system" follows the device's light/dark setting (#86).
  const name =
    typeof ref === 'string' ? (ref === SYSTEM_PRESET ? systemPresetName(dark) : ref) : null
  const [stored, setStored] = useState<{ name: string; preset: Preset | null } | null>(null)
  const version = usePresetVersion((s) => s.version)

  useEffect(() => {
    if (!name) return
    // Built-ins are bundled, so the sync path below already returns them.
    if (BUILT_IN_PRESETS.some((p) => p.name === name)) return
    let cancelled = false
    void getPreset(name).then((preset) => {
      if (preset) resolvedCustom.set(name, preset)
      else resolvedCustom.delete(name)
      if (!cancelled) setStored({ name, preset: preset ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [name, version])

  if (typeof ref === 'object') return ref.inline
  if (name) {
    const builtIn = BUILT_IN_PRESETS.find((p) => p.name === name)
    if (builtIn) return builtIn
    if (stored?.name === name) return stored.preset ?? BUILT_IN_PRESETS[0]
    const cached = resolvedCustom.get(name)
    if (cached) return cached
  }
  return BUILT_IN_PRESETS[0]
}
