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

export interface LinkArcParams {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  /** Which way an arc between two sides bows: away from the map's centre (#165). */
  bow?: 'up' | 'down'
}

const outward = (position: Position) => (position === Position.Left ? -1 : 1)

/**
 * A cross-link as an arc (live test, item 3): it leaves each node from the
 * handle's side and sags away from the straight line between them, so it
 * sweeps around the branches in between instead of cutting through them.
 * Two handles on the same side (nodes stacked above one another) loop out on
 * that side; otherwise the arc bows upwards. Returns the path and the curve's
 * midpoint, where the label sits.
 */
export function linkArcPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  bow = 'up',
}: LinkArcParams): [path: string, labelX: number, labelY: number] {
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const distance = Math.hypot(dx, dy) || 1
  const sag = Math.min(Math.max(distance * 0.2, 24), 120)
  const reach = Math.min(Math.max(distance * 0.25, 30), 90)
  let nx: number
  let ny: number
  if (sourcePosition === targetPosition) {
    nx = outward(sourcePosition)
    ny = 0
  } else {
    // The perpendicular that points up (or down) the screen; right when level.
    nx = -dy / distance
    ny = dx / distance
    const wrongWay = bow === 'up' ? ny > 0 : ny < 0
    if (wrongWay || (ny === 0 && nx < 0)) {
      nx = -nx
      ny = -ny
    }
  }
  const c1x = sourceX + outward(sourcePosition) * reach + nx * sag
  const c1y = sourceY + ny * sag
  const c2x = targetX + outward(targetPosition) * reach + nx * sag
  const c2y = targetY + ny * sag
  const round = (value: number) => Math.round(value * 100) / 100
  const path = `M${round(sourceX)},${round(sourceY)} C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(targetX)},${round(targetY)}`
  // The cubic's point at t = 0.5.
  const labelX = (sourceX + 3 * c1x + 3 * c2x + targetX) / 8
  const labelY = (sourceY + 3 * c1y + 3 * c2y + targetY) / 8
  return [path, labelX, labelY]
}
