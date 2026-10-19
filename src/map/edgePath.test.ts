import { describe, expect, it } from 'vitest'
import defaultPreset from '../../presets/default.json'
import type { Preset, TreeNode } from '../schema/types'
import { mapEdgePath, type MapEdgeCurve } from './edgePath'
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
