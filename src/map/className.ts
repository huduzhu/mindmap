/**
 * A copy of a React Flow node or edge with `className` set, or without one
 * when `className` is undefined.
 */
export function withClassName<T extends { className?: string }>(
  item: T,
  className: string | undefined,
): T {
  if (className !== undefined) return { ...item, className }
  const copy = { ...item }
  if (copy.className !== undefined) delete copy.className
  return copy
}
