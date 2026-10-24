/** The gap a pop-up menu keeps from the window's edges. */
export const MENU_MARGIN = 8

/**
 * The left edge of a menu `width` wide opened at `x`, moved left so it stays
 * inside a window `viewportWidth` wide (never past its left edge either).
 */
export function clampMenuLeft(x: number, width: number, viewportWidth: number): number {
  if (viewportWidth <= 0) return x
  return Math.max(MENU_MARGIN, Math.min(x, viewportWidth - width - MENU_MARGIN))
}
