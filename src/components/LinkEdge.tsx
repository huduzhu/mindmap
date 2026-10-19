import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import type { LinkEdgeData } from '../map/layout'
import { linkArcPath } from '../map/edgePath'

type LinkEdgeProps = EdgeProps<Edge<LinkEdgeData>>

/**
 * A cross-link: a dashed arc (see linkArcPath), with its label (#148c) in a
 * pill at the middle of the curve. The layout draws links above the nodes
 * (zIndex), so a long link is never hidden behind the cards it passes. The pill is SVG inside the edge, so PNG/SVG exports and
 * the HTML viewer show it too; its colours are the preset's text on node fill.
 */
export function LinkEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
  label,
  data,
}: LinkEdgeProps) {
  const [path, labelX, labelY] = linkArcPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    bow: data?.bow,
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
