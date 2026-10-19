import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import type { LinkEdgeData } from '../map/layout'

type LinkEdgeProps = EdgeProps<Edge<LinkEdgeData>>

/**
 * A cross-link: a dashed curve, with its label (#148c) in a pill at the
 * middle of the curve. The pill is SVG inside the edge, so PNG/SVG exports and
 * the HTML viewer show it too; its colours are the preset's text on node fill.
 */
export function LinkEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
  label,
  data,
}: LinkEdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })
  return (
    <BaseEdge
      path={path}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
      {...(label
        ? {
            label,
            labelX,
            labelY,
            labelShowBg: true,
            labelStyle: { fill: data?.labelText, fontSize: 12 },
            labelBgStyle: {
              fill: data?.labelFill,
              stroke: data?.labelBorder,
              strokeWidth: 1,
            },
            labelBgPadding: [7, 3] as [number, number],
            labelBgBorderRadius: 9,
          }
        : {})}
    />
  )
}
