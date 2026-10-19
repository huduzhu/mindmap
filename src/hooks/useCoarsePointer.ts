import { useSyncExternalStore } from 'react'

/** Touch-first devices (#91): the primary pointer is a finger, not a mouse. */
const QUERY = '(pointer: coarse)'

function list(): MediaQueryList | null {
  try {
    return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(QUERY) : null
  } catch {
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  const media = list()
  if (!media || typeof media.addEventListener !== 'function') return () => undefined
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => list()?.matches ?? false,
    () => false,
  )
}
