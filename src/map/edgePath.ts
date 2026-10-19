import { getBezierPath, getSmoothStepPath, getStraightPath, Position } from '@xyflow/react'

export type MapEdgeSide = 'left' | 'right'
export type MapEdgeCurve = 'bezier' | 'smoothstep' | 'straight'

export interface MapEdgePathParams {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  side: MapEdgeSide
  curve: MapEdgeCurve
}

// Keep this explicit rather than relying on the React Flow default so both sides use the
// same rounded corners and remain exact x-mirrors of one another.
const SMOOTHSTEP_BORDER_RADIUS = 8

export function mapEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  side,
  curve,
}: MapEdgePathParams): string {
  if (curve === 'straight') {
    return getStraightPath({ sourceX, sourceY, targetX, targetY })[0]
  }

  const sourcePosition = side === 'right' ? Position.Right : Position.Left
  const targetPosition = side === 'right' ? Position.Left : Position.Right

  if (curve === 'bezier') {
    return getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })[0]
  }

  return getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: SMOOTHSTEP_BORDER_RADIUS,
  })[0]
}
