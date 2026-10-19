import { describe, expect, it } from 'vitest'
import { makeTree } from '../test/fixtures'
import { flattenTree } from './flatten'
import { rowStep } from './navigate'

const rows = flattenTree(makeTree('root', 'Root', [makeTree('a', 'A', [makeTree('a1', 'A1')])]))

describe('rowStep (#134)', () => {
  it('moves to the row above or below', () => {
    expect(rowStep(rows, 'a', 'down')).toBe('a1')
    expect(rowStep(rows, 'a1', 'up')).toBe('a')
  })

  it('stops at either end', () => {
    expect(rowStep(rows, 'root', 'up')).toBeNull()
    expect(rowStep(rows, 'a1', 'down')).toBeNull()
  })

  it('starts at the first row without a usable selection', () => {
    expect(rowStep(rows, null, 'down')).toBe('root')
    expect(rowStep(rows, 'gone', 'up')).toBe('root')
    expect(rowStep([], null, 'down')).toBeNull()
  })
})
