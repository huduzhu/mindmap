import { describe, expect, it } from 'vitest'
import { nodesInBox } from './boxSelect'

describe('nodesInBox (#105)', () => {
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 30 },
    { id: 'b', position: { x: 200, y: 0 }, width: 100, height: 30 },
    { id: 'c', position: { x: 0, y: 100 }, width: 100, height: 30 },
  ]

  it('selects every node the box touches, whichever way it was drawn', () => {
    expect(nodesInBox(nodes, { x: 50, y: 10 }, { x: 250, y: 20 })).toEqual(['a', 'b'])
    expect(nodesInBox(nodes, { x: 250, y: 20 }, { x: 50, y: 10 })).toEqual(['a', 'b'])
    expect(nodesInBox(nodes, { x: -10, y: -10 }, { x: 400, y: 200 })).toEqual(['a', 'b', 'c'])
  })

  it('selects nothing in empty space', () => {
    expect(nodesInBox(nodes, { x: 120, y: 50 }, { x: 180, y: 90 })).toEqual([])
  })
})
