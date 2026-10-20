/** The user asked the system for less motion: pan and zoom without animating. */
export function prefersReducedMotion(): boolean {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}
