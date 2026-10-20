/**
 * Arrow-key movement in a tablist (#213), shared by the toolbar's view tabs
 * and the GitHub dialog: the index of the tab a key moves to, skipping
 * disabled ones, or -1 when the key is not a tab key.
 */
export function tabKeyTarget(
  key: string,
  index: number,
  count: number,
  disabled: (i: number) => boolean = () => false,
): number {
  const step =
    key === 'ArrowRight' || key === 'Home' ? 1 : key === 'ArrowLeft' || key === 'End' ? -1 : 0
  if (!step) return -1
  let next = key === 'Home' ? -1 : key === 'End' ? count : index
  for (let tries = 0; tries < count; tries++) {
    next = (next + step + count) % count
    if (!disabled(next)) return next
  }
  return -1
}
