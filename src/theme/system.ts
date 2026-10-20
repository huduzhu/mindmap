import { useSyncExternalStore } from 'react'

/**
 * "system" is a preset name that is not a stored preset (#86): it follows the
 * device's light/dark setting, resolving to the built-in `dark` or `default`
 * preset, and switches live when the setting changes.
 */
export const SYSTEM_PRESET = 'system'
export const LIGHT_PRESET = 'default'
export const DARK_PRESET = 'dark'

const QUERY = '(prefers-color-scheme: dark)'

function media(): MediaQueryList | null {
  try {
    return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(QUERY) : null
  } catch {
    return null
  }
}

export function prefersDark(): boolean {
  return media()?.matches ?? false
}

function subscribe(onChange: () => void): () => void {
  const list = media()
  if (!list) return () => undefined
  // Safari < 14 only has the deprecated addListener.
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }
  list.addListener?.(onChange)
  return () => list.removeListener?.(onChange)
}

/** True while the device asks for dark mode; re-renders when that changes. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, prefersDark, () => false)
}

/** The built-in preset name "system" stands for right now. */
export function systemPresetName(dark: boolean): string {
  return dark ? DARK_PRESET : LIGHT_PRESET
}
