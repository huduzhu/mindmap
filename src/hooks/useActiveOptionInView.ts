import { useEffect } from 'react'

/**
 * Keep the active option of a listbox scrolled into view as the keyboard
 * moves through it (aria-activedescendant does not scroll on its own).
 * `id` is the active option's element id, or null when none is active.
 */
export function useActiveOptionInView(id: string | null): void {
  useEffect(() => {
    if (!id) return
    // Optional call: jsdom has no scrollIntoView.
    document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' })
  }, [id])
}
