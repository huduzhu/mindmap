import { describe, expect, it } from 'vitest'
import defaultPreset from '../../presets/default.json'
import type { Preset, TreeNode } from '../schema/types'
import { Position } from '@xyflow/react'
import { linkArcPath, mapEdgePath, type MapEdgeCurve } from './edgePath'
import { layoutMap } from './layout'

const numberPattern = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi

function mirrorX(path: string): string {
  return path.replace(/([MLCQ])([^MLCQ]*)/g, (_match, command: string, values: string) => {
    let coordinate = 0
    const mirrored = values.replace(numberPattern, (value) => {
      const result = coordinate % 2 === 0 ? String(-Number(value)) : value
      coordinate += 1
      return result
    })
    return `${command}${mirrored}`
  })
}

describe('mapEdgePath', () => {
  it('mirrors smoothstep connections on the left and right', () => {
    const right = mapEdgePath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 40,
      side: 'right',
      curve: 'smoothstep',
    })
    const left = mapEdgePath({
      sourceX: 0,
      sourceY: 0,
      targetX: -100,
      targetY: 40,
      side: 'left',
      curve: 'smoothstep',
    })

    expect(left).toBe(mirrorX(right))
  })

  it.each(['bezier', 'straight'] as MapEdgeCurve[])('mirrors %s connections', (curve) => {
    const right = mapEdgePath({
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 40,
      side: 'right',
      curve,
    })
    const left = mapEdgePath({
      sourceX: 0,
      sourceY: 0,
      targetX: -100,
      targetY: 40,
      side: 'left',
      curve,
    })

    expect(left).toBe(mirrorX(right))
  })
})

describe('mapEdgePath with layout positions', () => {
  it('renders the root→left edge without any rightward backtrack', () => {
    const tree: TreeNode = {
      id: 'root',
      title: 'Product Launch',
      children: [{ id: 'left-branch', title: 'Product', side: 'left', children: [] }],
    }
    const { nodes } = layoutMap(tree, defaultPreset as Preset, null, null)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const root = byId.get('root')!
    const left = byId.get('left-branch')!

    const path = mapEdgePath({
      sourceX: root.position.x,
      sourceY: root.position.y + root.height! / 2,
      targetX: left.position.x + left.width!,
      targetY: left.position.y + left.height! / 2,
      side: 'left',
      curve: 'smoothstep',
    })

    const xs: number[] = []
    for (const segment of path.match(/[MLQC][^MLQCZ]*/g) ?? []) {
      const numbers = segment.slice(1).match(numberPattern) ?? []
      for (let i = 0; i < numbers.length; i += 2) xs.push(Number(numbers[i]))
    }
    expect(xs.length).toBeGreaterThan(1)
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]).toBeLessThanOrEqual(xs[i - 1] + 0.001)
    }
  })
})

describe('cross-link arcs (live test, item 3)', () => {
  it('bows a level link upwards instead of running straight through the map', () => {
    const [path, labelX, labelY] = linkArcPath({
      sourceX: 0,
      sourceY: 100,
      targetX: 400,
      targetY: 100,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    })
    expect(path.startsWith('M0,100 C')).toBe(true)
    expect(path.endsWith(' 400,100')).toBe(true)
    expect(labelX).toBeCloseTo(200, 5)
    // The label sits on the arc, above the straight line between the nodes.
    expect(labelY).toBeLessThan(100 - 50)
  })

  it('loops stacked nodes out on their side', () => {
    const right = linkArcPath({
      sourceX: 300,
      sourceY: 0,
      targetX: 300,
      targetY: 200,
      sourcePosition: Position.Right,
      targetPosition: Position.Right,
    })
    expect(right[1]).toBeGreaterThan(300 + 50)
    expect(right[2]).toBeCloseTo(100, 5)
    const left = linkArcPath({
      sourceX: -300,
      sourceY: 0,
      targetX: -300,
      targetY: 200,
      sourcePosition: Position.Left,
      targetPosition: Position.Left,
    })
    expect(left[1]).toBeLessThan(-300 - 50)
  })

  it('bows a link below the centre downwards, away from the map (#165)', () => {
    const [, , labelY] = linkArcPath({
      sourceX: 0,
      sourceY: 300,
      targetX: 400,
      targetY: 300,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      bow: 'down',
    })
    expect(labelY).toBeGreaterThan(300 + 50)
  })
})
