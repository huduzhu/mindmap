import type { OutlineRow } from './flatten'

/**
 * ↑/↓ in the Brainstorm and Outline lists (#134): the row above or below the
 * selection, the first row when nothing (or something no longer listed) is
 * selected, and null at either end.
 */
export function rowStep(
  rows: readonly OutlineRow[],
  selectedId: string | null,
  direction: 'up' | 'down',
): string | null {
  if (rows.length === 0) return null
  const index = selectedId ? rows.findIndex((row) => row.node.id === selectedId) : -1
  if (index === -1) return rows[0]?.node.id ?? null
  return rows[direction === 'down' ? index + 1 : index - 1]?.node.id ?? null
}
