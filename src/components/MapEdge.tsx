import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import { mapEdgePath } from '../map/edgePath'
import type { MapEdgeData } from '../map/layout'

type MapEdgeProps = EdgeProps<Edge<MapEdgeData, 'mapEdge'>>

export function MapEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
}: MapEdgeProps) {
  const path = mapEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    side: data?.side ?? 'right',
    curve: data?.curve ?? 'smoothstep',
  })

  return (
    <BaseEdge
      path={path}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
    />
  )
}
