import type { CSSProperties } from 'react'
import type { Preset, TreeNode } from '../schema/types'
import { markerColor } from './marks'

export function resolveNodeStyle(preset: Preset, node: TreeNode, isRoot: boolean): CSSProperties {
  const roleStyle = node.role ? preset.roles[node.role] : undefined
  const palette = preset.palette
  const base = preset.font.baseSize

  const shape = roleStyle?.shape ?? 'rounded'
  const borderRadius = shape === 'pill' ? 999 : shape === 'box' ? 3 : 10

  // A colour marker (#148b) is a bar down the left edge, drawn as an inset
  // shadow so it takes no room from the title.
  const accent = markerColor(palette, node.color)
  return {
    ...(accent ? { boxShadow: `inset 4px 0 0 ${accent}, 0 1px 3px rgb(0 0 0 / 8%)` } : {}),
    background: roleStyle?.fill ?? palette.nodeFill,
    color: roleStyle?.text ?? palette.text,
    border: `1.5px solid ${roleStyle?.border ?? palette.nodeBorder}`,
    borderRadius,
    fontWeight: roleStyle?.fontWeight ?? (isRoot ? 'bold' : 'normal'),
    fontSize: isRoot ? base * preset.font.titleScale : base,
    fontFamily: preset.font.family,
  }
}
